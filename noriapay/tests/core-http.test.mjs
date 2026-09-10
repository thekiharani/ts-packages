import test from "node:test";
import assert from "node:assert/strict";

import { ApiError, HttpClient, NetworkError, TimeoutError } from "../dist/index.js";
import { json } from "./helpers.mjs";

/** A fetch that resolves after `ms` unless its signal aborts first. */
function slowFetch(ms, response = () => json({ ok: true })) {
  return (url, init = {}) =>
    new Promise((resolve, reject) => {
      const abort = () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      };

      // Real fetch rejects immediately on an already-aborted signal.
      if (init.signal?.aborted) {
        abort();
        return;
      }

      const handle = setTimeout(() => resolve(response()), ms);
      init.signal?.addEventListener("abort", () => {
        clearTimeout(handle);
        abort();
      });
    });
}

test("timeoutMs still applies when the caller supplies its own signal", async () => {
  const client = new HttpClient({
    baseUrl: "https://example.test",
    fetch: slowFetch(200),
    timeoutMs: 20,
  });

  await assert.rejects(() => client.request({ path: "/x" }), TimeoutError);

  const controller = new AbortController();
  await assert.rejects(
    () => client.request({ path: "/x", signal: controller.signal }),
    TimeoutError,
    "a caller signal must not disable the timeout",
  );
});

test("a caller abort surfaces as the caller's abort, not as a timeout", async () => {
  const client = new HttpClient({
    baseUrl: "https://example.test",
    fetch: slowFetch(200),
    timeoutMs: 5_000,
  });

  const controller = new AbortController();
  const pending = client.request({ path: "/x", signal: controller.signal });
  controller.abort();

  await assert.rejects(pending, (error) => {
    assert.equal(error instanceof TimeoutError, false);
    assert.equal(error.name, "AbortError");
    return true;
  });
});

test("an already-aborted caller signal never reaches the network", async () => {
  let called = false;
  const client = new HttpClient({
    baseUrl: "https://example.test",
    fetch: async (_url, init) => {
      called = true;
      if (init.signal?.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      return json({});
    },
    timeoutMs: 1_000,
  });

  const controller = new AbortController();
  controller.abort();

  await assert.rejects(() => client.request({ path: "/x", signal: controller.signal }));
  assert.equal(called, true);
});

test("a transport failure is a NetworkError, distinct from an ApiError", async () => {
  const client = new HttpClient({
    baseUrl: "https://example.test",
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
  });

  await assert.rejects(() => client.request({ path: "/x" }), NetworkError);
});

test("a non-2xx response becomes an ApiError carrying status and body", async () => {
  const client = new HttpClient({
    baseUrl: "https://example.test",
    fetch: async () => json({ message: "Invalid key" }, { status: 401 }),
  });

  await assert.rejects(
    () => client.request({ path: "/x" }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 401);
      assert.equal(error.message, "Invalid key");
      assert.deepEqual(error.responseBody, { message: "Invalid key" });
      return true;
    },
  );
});

test("retries honour Retry-After ahead of the computed backoff", async () => {
  const slept = [];
  let attempts = 0;

  const client = new HttpClient({
    baseUrl: "https://example.test",
    fetch: async () => {
      attempts += 1;
      return attempts === 1
        ? json({ message: "slow down" }, { status: 429, headers: { "retry-after": "7" } })
        : json({ ok: true });
    },
    retry: {
      maxAttempts: 3,
      retryOnStatuses: [429],
      baseDelayMs: 100,
      sleep: async (ms) => slept.push(ms),
    },
  });

  assert.deepEqual(await client.request({ path: "/x" }), { ok: true });
  assert.deepEqual(slept, [7000]);
  assert.equal(attempts, 2);
});

test("backoff is exponential, jittered, and capped", async () => {
  const slept = [];
  const client = new HttpClient({
    baseUrl: "https://example.test",
    fetch: async () => json({}, { status: 500 }),
    retry: {
      maxAttempts: 4,
      retryOnStatuses: [500],
      baseDelayMs: 100,
      backoffMultiplier: 2,
      jitterMs: 50,
      maxDelayMs: 250,
      sleep: async (ms) => slept.push(ms),
    },
  });

  await assert.rejects(() => client.request({ path: "/x" }), ApiError);
  assert.equal(slept.length, 3);
  assert.ok(slept[0] >= 100 && slept[0] < 150, `first delay ${slept[0]}`);
  assert.ok(slept[1] >= 200 && slept[1] <= 250, `second delay ${slept[1]}`);
  assert.equal(slept[2], 250, "capped by maxDelayMs");
});

test("network errors retry only when retryOnNetworkError is on", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    throw new TypeError("fetch failed");
  };

  const off = new HttpClient({
    baseUrl: "https://example.test",
    fetch: fetchImpl,
    retry: { maxAttempts: 3, sleep: async () => {} },
  });
  await assert.rejects(() => off.request({ path: "/x" }), NetworkError);
  assert.equal(attempts, 1);

  attempts = 0;
  const on = new HttpClient({
    baseUrl: "https://example.test",
    fetch: fetchImpl,
    retry: { maxAttempts: 3, retryOnNetworkError: true, sleep: async () => {} },
  });
  await assert.rejects(() => on.request({ path: "/x" }), NetworkError);
  assert.equal(attempts, 3);
});

test("retryMethods keeps POST out of a retry policy aimed at reads", async () => {
  let attempts = 0;
  const client = new HttpClient({
    baseUrl: "https://example.test",
    fetch: async () => {
      attempts += 1;
      return json({}, { status: 503 });
    },
    retry: {
      maxAttempts: 3,
      retryMethods: ["GET"],
      retryOnStatuses: [503],
      sleep: async () => {},
    },
  });

  await assert.rejects(() => client.request({ path: "/x", method: "POST" }), ApiError);
  assert.equal(attempts, 1, "a payment POST must not be replayed");

  attempts = 0;
  await assert.rejects(() => client.request({ path: "/x", method: "GET" }), ApiError);
  assert.equal(attempts, 3);
});

test("hooks observe every attempt and can mutate outgoing headers", async () => {
  const seen = { before: [], after: 0, errors: 0 };
  const client = new HttpClient({
    baseUrl: "https://example.test",
    fetch: async (_url, init) => {
      seen.before.push(new Headers(init.headers).get("x-correlation-id"));
      return json({ ok: true });
    },
    hooks: {
      beforeRequest: (context) => context.headers.set("x-correlation-id", `attempt-${context.attempt}`),
      afterResponse: () => {
        seen.after += 1;
      },
      onError: () => {
        seen.errors += 1;
      },
    },
  });

  await client.request({ path: "/x" });
  assert.deepEqual(seen.before, ["attempt-1"]);
  assert.equal(seen.after, 1);
  assert.equal(seen.errors, 0);
});

test("multipart bodies are sent as form data with the boundary fetch chooses", async () => {
  let captured;
  const client = new HttpClient({
    baseUrl: "https://example.test",
    fetch: async (_url, init) => {
      captured = init;
      return json({ ok: true });
    },
    defaultHeaders: { "content-type": "application/json" },
  });

  await client.request({
    path: "/upload",
    method: "POST",
    multipart: {
      customerId: "C-1",
      active: true,
      tags: ["a", "b"],
      idFront: {
        filename: "id.png",
        contentType: "image/png",
        content: Buffer.from("binary"),
      },
    },
  });

  assert.ok(captured.body instanceof FormData);
  assert.equal(new Headers(captured.headers).get("content-type"), null, "fetch sets the boundary");
  assert.equal(captured.body.get("customerId"), "C-1");
  assert.equal(captured.body.get("active"), "true");
  assert.deepEqual(captured.body.getAll("tags[]"), ["a", "b"]);
  const file = captured.body.get("idFront");
  assert.ok(file instanceof Blob);
  assert.equal(file.name, "id.png");
  assert.equal(file.type, "image/png");
});

test("responses that are empty, non-JSON, or mislabelled do not crash the call", async () => {
  const make = (response) =>
    new HttpClient({ baseUrl: "https://example.test", fetch: async () => response });

  assert.equal(await make(new Response(null, { status: 204 })).request({ path: "/x" }), null);
  assert.equal(
    await make(new Response("", { status: 200, headers: { "content-type": "application/json" } })).request({ path: "/x" }),
    null,
  );
  assert.equal(
    await make(
      new Response("<html>oops</html>", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ).request({ path: "/x" }),
    "<html>oops</html>",
  );
  assert.deepEqual(
    await make(
      new Response('{"a":1}', { status: 200, headers: { "content-type": "text/plain" } }),
    ).request({ path: "/x" }),
    { a: 1 },
  );
});

test("query parameters skip null and undefined rather than sending empty strings", async () => {
  let url;
  const client = new HttpClient({
    baseUrl: "https://example.test/",
    fetch: async (input) => {
      url = input;
      return json({});
    },
  });

  await client.request({ path: "/x", query: { a: 1, b: null, c: undefined, d: false } });
  assert.equal(url, "https://example.test/x?a=1&d=false");
});
