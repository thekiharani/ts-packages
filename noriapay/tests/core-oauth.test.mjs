import test from "node:test";
import assert from "node:assert/strict";

import {
  AuthenticationError,
  CachedAccessTokenProvider,
  ClientCredentialsTokenProvider,
  MemoryTokenStore,
  StaticAccessTokenProvider,
} from "../dist/index.js";
import { json } from "./helpers.mjs";

test("a token is cached until its lifetime minus the configured skew", async () => {
  let calls = 0;
  const provider = new ClientCredentialsTokenProvider({
    tokenUrl: "https://example.test/token",
    clientId: "id",
    clientSecret: "secret",
    cacheSkewMs: 0,
    fetch: async () => {
      calls += 1;
      return json({ access_token: `token-${calls}`, expires_in: 3600 });
    },
  });

  assert.equal(await provider.getAccessToken(), "token-1");
  assert.equal(await provider.getAccessToken(), "token-1");
  assert.equal(calls, 1);

  assert.equal(await provider.getAccessToken(true), "token-2", "forceRefresh bypasses the cache");
  assert.equal(calls, 2);

  provider.clearCache();
  assert.equal(await provider.getAccessToken(), "token-3");
});

test("concurrent callers share a single authentication round trip", async () => {
  let calls = 0;
  const provider = new ClientCredentialsTokenProvider({
    tokenUrl: "https://example.test/token",
    clientId: "id",
    clientSecret: "secret",
    fetch: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return json({ access_token: "shared", expires_in: 3600 });
    },
  });

  const tokens = await Promise.all([
    provider.getAccessToken(),
    provider.getAccessToken(),
    provider.getAccessToken(),
  ]);

  assert.deepEqual(tokens, ["shared", "shared", "shared"]);
  assert.equal(calls, 1);
});

test("a failed authentication clears the in-flight slot so the next call retries", async () => {
  let calls = 0;
  const provider = new ClientCredentialsTokenProvider({
    tokenUrl: "https://example.test/token",
    clientId: "id",
    clientSecret: "secret",
    fetch: async () => {
      calls += 1;
      return calls === 1
        ? json({ detail: "invalid client" }, { status: 401 })
        : json({ access_token: "ok", expires_in: 3600 });
    },
  });

  await assert.rejects(() => provider.getAccessToken(), AuthenticationError);
  assert.equal(await provider.getAccessToken(), "ok");
});

test("a 200 with no access token is an authentication failure, not an empty bearer", async () => {
  const provider = new ClientCredentialsTokenProvider({
    tokenUrl: "https://example.test/token",
    clientId: "id",
    clientSecret: "secret",
    fetch: async () => json({ status: false, detail: "Account suspended" }),
  });

  await assert.rejects(() => provider.getAccessToken(), (error) => {
    assert.ok(error instanceof AuthenticationError);
    assert.match(error.message, /contained no access token/);
    return true;
  });
});

test("the GET flow sends Basic auth and the grant type in the query string", async () => {
  let captured;
  const provider = new ClientCredentialsTokenProvider({
    tokenUrl: "https://example.test/api/v1/auth/token/",
    clientId: "id",
    clientSecret: "secret",
    query: { grant_type: "client_credentials" },
    fetch: async (url, init) => {
      captured = { url, init, headers: new Headers(init.headers) };
      return json({ access_token: "t", expires_in: 3600 });
    },
  });

  await provider.getAccessToken();
  assert.equal(captured.url, "https://example.test/api/v1/auth/token/?grant_type=client_credentials");
  assert.equal(captured.init.method, "GET");
  assert.equal(
    captured.headers.get("authorization"),
    `Basic ${Buffer.from("id:secret").toString("base64")}`,
  );
});

test("the POST form flow sends a urlencoded grant, as KCB Buni requires", async () => {
  let captured;
  const provider = new ClientCredentialsTokenProvider({
    tokenUrl: "https://example.test/token",
    clientId: "id",
    clientSecret: "secret",
    method: "POST",
    asForm: true,
    body: { grant_type: "client_credentials" },
    fetch: async (url, init) => {
      captured = { init, headers: new Headers(init.headers) };
      return json({ access_token: "t", expires_in: 3600 });
    },
  });

  await provider.getAccessToken();
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.headers.get("content-type"), "application/x-www-form-urlencoded");
  assert.equal(captured.init.body, "grant_type=client_credentials");
});

test("a token store shares tokens across clients that would otherwise each authenticate", async () => {
  const store = new MemoryTokenStore();
  let calls = 0;

  const build = () =>
    new CachedAccessTokenProvider({
      provider: new ClientCredentialsTokenProvider({
        tokenUrl: "https://example.test/token",
        clientId: "id",
        clientSecret: "secret",
        fetch: async () => {
          calls += 1;
          return json({ access_token: "shared-token", expires_in: 3600 });
        },
      }),
      store,
      cacheKey: "noriapay:test",
    });

  assert.equal(await build().getAccessToken(), "shared-token");
  assert.equal(await build().getAccessToken(), "shared-token", "the second worker reads the store");
  assert.equal(calls, 1);

  const cached = build();
  assert.equal(await cached.getAccessToken(true), "shared-token");
  assert.equal(calls, 2, "forceRefresh still bypasses the store");
});

test("MemoryTokenStore expires entries", async () => {
  const store = new MemoryTokenStore();
  store.set("k", "v", 0);
  assert.equal(store.get("k"), undefined);

  store.set("k", "v", 60);
  assert.equal(store.get("k"), "v");
  store.delete("k");
  assert.equal(store.get("k"), undefined);
});

test("StaticAccessTokenProvider hands back the same key every time", async () => {
  const provider = new StaticAccessTokenProvider("sk_test_123");
  assert.equal(await provider.getAccessToken(), "sk_test_123");
  assert.equal(await provider.getAccessToken(true), "sk_test_123");
});
