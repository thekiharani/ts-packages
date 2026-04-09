import test from "node:test";
import assert from "node:assert/strict";
import Mailer, { MailerError } from "../dist/index.js";

function createJsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function createTextResponse(body, init = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: init.headers ?? {},
  });
}

function createSequenceFetch(sequence) {
  let index = 0;

  return async (input, init) => {
    const step = sequence[index];
    index += 1;

    assert.ok(step, `Unexpected fetch call ${index} for ${String(input)}`);

    if (step.assert) {
      await step.assert(input, init);
    }

    if (step.error) {
      throw step.error;
    }

    return step.response;
  };
}

test("emails.send sends the expected request and idempotency header", async () => {
  const calls = [];
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com/",
    fetch: async (input, init) => {
      calls.push({ input, init });
      return createJsonResponse({ id: "email_123" });
    },
  });

  const result = await client.emails.send(
    {
      from: "Noria Demo <mail@noria.co.ke>",
      to: "hello@example.com",
      subject: "Hello",
      text: "World",
      replyTo: ["support@noria.co.ke"],
    },
    { idempotencyKey: "send-1" },
  );

  assert.deepEqual(result, { id: "email_123" });
  assert.equal(calls.length, 1);

  const [{ input, init }] = calls;
  assert.equal(String(input), "https://mailer.example.com/emails");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.get("authorization"), "Bearer mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret");
  assert.equal(init.headers.get("idempotency-key"), "send-1");
  assert.equal(init.headers.get("content-type"), "application/json");

  const body = JSON.parse(init.body);
  assert.deepEqual(body, {
    from: "Noria Demo <mail@noria.co.ke>",
    to: "hello@example.com",
    subject: "Hello",
    text: "World",
    replyTo: ["support@noria.co.ke"],
  });
});

test("apiKeys.create unwraps ok/data responses", async () => {
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    fetch: async () =>
      createJsonResponse({
        ok: true,
        data: {
          id: "018f8c89-acde-7cc2-8a37-c7f2e051a123",
          key: "mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret",
          token: "mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret",
          keyPrefix: "mk_live_018f8c89",
          environment: "live",
          createdAt: "2026-03-25T19:00:00.000Z",
        },
      }),
  });

  const result = await client.apiKeys.create({
    name: "Primary",
    expiresAt: new Date("2026-03-26T00:00:00.000Z"),
  });

  assert.equal(result.environment, "live");
  assert.equal(result.keyPrefix, "mk_live_018f8c89");
});

test("emails.list encodes query params correctly", async () => {
  let capturedUrl = null;
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    fetch: async (input) => {
      capturedUrl = String(input);
      return createJsonResponse({ object: "list", has_more: false, data: [] });
    },
  });

  const result = await client.emails.list({ limit: 25, offset: 50, status: "sent" });

  assert.deepEqual(result, { object: "list", has_more: false, data: [] });
  assert.equal(capturedUrl, "https://mailer.example.com/emails?limit=25&offset=50&status=sent");
});

test("preserves baseUrl path prefixes", async () => {
  let capturedUrl = null;
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://gateway.example.com/mailer-api",
    fetch: async (input) => {
      capturedUrl = String(input);
      return createJsonResponse({ object: "list", has_more: false, data: [] });
    },
  });

  await client.emails.list();

  assert.equal(capturedUrl, "https://gateway.example.com/mailer-api/emails");
});

test("health endpoints are unauthenticated", async () => {
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    fetch: async (_input, init) => {
      assert.equal(init.headers.get("authorization"), null);
      return createJsonResponse({ ok: true, data: { status: "ok" } });
    },
  });

  const result = await client.health.check();
  assert.deepEqual(result, { status: "ok" });
});

test("throws MailerError for structured API errors", async () => {
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    fetch: async () =>
      createJsonResponse(
        {
          ok: false,
          error: {
            code: "IDEMPOTENCY_KEY_REUSED",
            message: "Idempotency key has already been used for a different request.",
            details: { field: "idempotency-key" },
          },
        },
        { status: 409 },
      ),
  });

  await assert.rejects(
    () => client.emails.send({ from: "a@example.com", to: "b@example.com", subject: "s", text: "x" }),
    (error) => {
      assert.ok(error instanceof MailerError);
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, "IDEMPOTENCY_KEY_REUSED");
      assert.deepEqual(error.details, { field: "idempotency-key" });
      return true;
    },
  );
});

test("constructor allows custom auth but still validates baseUrl", () => {
  const client = new Mailer("", { baseUrl: "https://mailer.example.com" });
  assert.equal(client.apiKey, "");
  assert.throws(
    () => new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", { baseUrl: "" }),
    /baseUrl is required/,
  );
});

test("authenticated requests require configured auth unless explicitly overridden", async () => {
  const client = new Mailer("", {
    baseUrl: "https://mailer.example.com",
  });

  await assert.rejects(
    () => client.emails.get("email_1"),
    /Mailer auth is required for authenticated requests/,
  );
});

test("all resource methods hit the expected endpoints", async () => {
  const signal = new AbortController().signal;
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com/base/",
    fetch: createSequenceFetch([
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.example.com/base/emails/batch");
          assert.equal(init.method, "POST");
          assert.equal(init.headers.get("authorization"), "Bearer mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret");
        },
        response: createJsonResponse({ data: [{ id: "email_1" }, { id: "email_2" }] }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.example.com/base/emails/email_1");
          assert.equal(init.method, "GET");
        },
        response: createJsonResponse({
          object: "email",
          id: "email_1",
          from: "a@example.com",
          to: ["b@example.com"],
          subject: "Hi",
          html: null,
          text: "Hi",
          cc: [],
          bcc: [],
          reply_to: [],
          created_at: "2026-03-25T19:00:00.000Z",
          scheduled_at: null,
          sent_at: null,
          tags: [],
          headers: {},
          message_id: null,
          last_event: "queued",
          updated_at: "2026-03-25T19:00:00.000Z",
        }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.example.com/base/domains");
          assert.equal(init.method, "POST");
          assert.deepEqual(JSON.parse(init.body), { name: "example.com" });
        },
        response: createJsonResponse({
          object: "domain",
          id: "domain_1",
          name: "example.com",
          status: "not_started",
          region: "eu-west-1",
          created_at: "2026-03-25T19:00:00.000Z",
          records: [],
          capabilities: { sending: "enabled", receiving: "disabled" },
        }, { status: 201 }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.example.com/base/domains");
          assert.equal(init.method, "GET");
        },
        response: createJsonResponse({ object: "list", has_more: false, data: [] }),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://mailer.example.com/base/domains/domain_1");
        },
        response: createJsonResponse({
          object: "domain",
          id: "domain_1",
          name: "example.com",
          status: "verified",
          region: "eu-west-1",
          created_at: "2026-03-25T19:00:00.000Z",
          records: [],
          capabilities: { sending: "enabled", receiving: "disabled" },
        }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.example.com/base/domains/domain_1/verify");
          assert.equal(init.method, "POST");
        },
        response: createJsonResponse({ object: "domain", id: "domain_1" }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.example.com/base/domains/domain_1");
          assert.equal(init.method, "DELETE");
        },
        response: createJsonResponse({ object: "domain", id: "domain_1", deleted: true }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.example.com/base/api-keys");
          assert.equal(init.method, "GET");
        },
        response: createJsonResponse({
          ok: true,
          data: [
            {
              id: "key_1",
              accountId: "acct_1",
              keyPrefix: "mk_live_018f8c89",
              name: null,
              environment: "live",
              isActive: true,
              lastUsedAt: null,
              expiresAt: null,
              revokedAt: null,
              createdAt: "2026-03-25T19:00:00.000Z",
            },
          ],
        }),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://mailer.example.com/base/api-keys/key_1");
        },
        response: createJsonResponse({
          ok: true,
          data: {
            id: "key_1",
            accountId: "acct_1",
            keyPrefix: "mk_live_018f8c89",
            name: null,
            environment: "live",
            isActive: true,
            lastUsedAt: null,
            expiresAt: null,
            revokedAt: null,
            createdAt: "2026-03-25T19:00:00.000Z",
          },
        }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.example.com/base/api-keys/key_1");
          assert.equal(init.method, "DELETE");
        },
        response: createJsonResponse({ ok: true, data: { revoked: true } }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.example.com/base/webhooks");
          assert.equal(init.method, "POST");
          assert.deepEqual(JSON.parse(init.body), {
            url: "https://example.com/webhook",
            events: ["email.sent"],
          });
        },
        response: createJsonResponse({
          ok: true,
          data: {
            id: "webhook_1",
            url: "https://example.com/webhook",
            events: ["email.sent"],
            is_active: true,
            created_at: "2026-03-25T19:00:00.000Z",
            updated_at: "2026-03-25T19:00:00.000Z",
          },
        }, { status: 201 }),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://mailer.example.com/base/webhooks");
        },
        response: createJsonResponse({
          ok: true,
          data: [
            {
              id: "webhook_1",
              url: "https://example.com/webhook",
              events: ["email.sent"],
              is_active: true,
              created_at: "2026-03-25T19:00:00.000Z",
              updated_at: "2026-03-25T19:00:00.000Z",
            },
          ],
        }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.example.com/base/webhooks/webhook_1");
          assert.equal(init.method, "DELETE");
        },
        response: createJsonResponse({ ok: true, data: { deleted: true } }),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://mailer.example.com/base/readyz");
        },
        response: createJsonResponse({ ok: true, data: { status: "ok" } }),
      },
    ]),
  });

  assert.deepEqual(await client.emails.sendBatch([
    { from: "a@example.com", to: "b@example.com", subject: "1", text: "1" },
    { from: "a@example.com", to: "c@example.com", subject: "2", text: "2" },
  ]), [{ id: "email_1" }, { id: "email_2" }]);
  assert.equal((await client.emails.get("email_1")).id, "email_1");
  assert.equal((await client.domains.create({ name: "example.com" }, { signal })).id, "domain_1");
  assert.deepEqual(await client.domains.list({ signal }), { object: "list", has_more: false, data: [] });
  assert.equal((await client.domains.get("domain_1", { signal })).status, "verified");
  assert.deepEqual(await client.domains.verify("domain_1", { signal }), { object: "domain", id: "domain_1" });
  assert.deepEqual(await client.domains.remove("domain_1", { signal }), {
    object: "domain",
    id: "domain_1",
    deleted: true,
  });
  assert.equal((await client.apiKeys.list({ signal }))[0].id, "key_1");
  assert.equal((await client.apiKeys.get("key_1", { signal })).id, "key_1");
  assert.deepEqual(await client.apiKeys.remove("key_1", { signal }), { revoked: true });
  assert.equal((await client.webhooks.create({
    url: "https://example.com/webhook",
    events: ["email.sent"],
  }, { signal })).id, "webhook_1");
  assert.equal((await client.webhooks.list({ signal }))[0].id, "webhook_1");
  assert.deepEqual(await client.webhooks.remove("webhook_1", { signal }), { deleted: true });
  assert.deepEqual(await client.health.ready({ signal }), { status: "ok" });
});

test("apiKeys.create supports empty and string expiry payloads", async () => {
  const bodies = [];
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    fetch: createSequenceFetch([
      {
        assert: (_input, init) => {
          bodies.push(JSON.parse(init.body));
        },
        response: createJsonResponse({
          ok: true,
          data: {
            id: "key_1",
            key: "mk_live_1_secret",
            token: "mk_live_1_secret",
            keyPrefix: "mk_live_1",
            environment: "live",
            createdAt: "2026-03-25T19:00:00.000Z",
          },
        }),
      },
      {
        assert: (_input, init) => {
          bodies.push(JSON.parse(init.body));
        },
        response: createJsonResponse({
          ok: true,
          data: {
            id: "key_2",
            key: "mk_sandbox_2_secret",
            token: "mk_sandbox_2_secret",
            keyPrefix: "mk_sandbox_2",
            environment: "sandbox",
            createdAt: "2026-03-25T19:00:00.000Z",
          },
        }),
      },
    ]),
  });

  await client.apiKeys.create(undefined, { signal: new AbortController().signal });
  await client.apiKeys.create({
    environment: "sandbox",
    expiresAt: "2026-03-26T00:00:00.000Z",
  }, { signal: new AbortController().signal });

  assert.deepEqual(bodies, [{}, { environment: "sandbox", expiresAt: "2026-03-26T00:00:00.000Z" }]);
});

test("custom headers are preserved when already provided", async () => {
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    headers: {
      accept: "text/plain",
      "content-type": "application/vnd.api+json",
      "x-client": "sdk-test",
    },
    fetch: async (_input, init) => {
      assert.equal(init.headers.get("accept"), "text/plain");
      assert.equal(init.headers.get("content-type"), "application/vnd.api+json");
      assert.equal(init.headers.get("x-client"), "sdk-test");
      return createJsonResponse({ id: "email_123" });
    },
  });

  await client.emails.send({
    from: "a@example.com",
    to: "b@example.com",
    subject: "Hello",
    text: "World",
  });
});

test("emails.send supports extra payload fields and per-request overrides", async () => {
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    headers: {
      "x-client": "default",
    },
    fetch: async () => {
      throw new Error("request-level fetch override was not used");
    },
  });

  const result = await client.emails.send(
    {
      from: "a@example.com",
      to: "b@example.com",
      subject: "Hello",
      text: "World",
      scheduledAt: "2026-03-28T09:00:00.000Z",
    },
    {
      headers: {
        "x-tenant-id": "tenant_123",
      },
      fetch: async (input, init) => {
        assert.equal(String(input), "https://mailer.example.com/emails?provider=backup");
        assert.equal(init.headers.get("authorization"), "Bearer mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret");
        assert.equal(init.headers.get("x-client"), "default");
        assert.equal(init.headers.get("x-tenant-id"), "tenant_123");
        assert.equal(JSON.parse(init.body).scheduledAt, "2026-03-28T09:00:00.000Z");
        return createJsonResponse({ id: "email_123" });
      },
      idempotencyKey: "send-123",
      query: {
        provider: "backup",
      },
    },
  );

  assert.deepEqual(result, { id: "email_123" });
});

test("supports auth strategies and middleware composition", async () => {
  const client = new Mailer("", {
    baseUrl: "https://mailer.example.com",
    auth: {
      type: "headers",
      headers: (context) => ({
        "x-auth-path": context.path,
      }),
    },
    middleware: [
      async (context, next) => {
        context.headers.set("x-middleware", "outer");
        context.url.searchParams.set("via", "middleware");
        return await next(context);
      },
    ],
  });

  const result = await client.request("GET", "/custom", {
    middleware: [
      async (context, next) => {
        context.headers.set("x-inner", "true");
        return await next(context);
      },
    ],
    fetch: async (input, init) => {
      assert.equal(String(input), "https://mailer.example.com/custom?via=middleware");
      assert.equal(init.headers.get("x-auth-path"), "/custom");
      assert.equal(init.headers.get("x-middleware"), "outer");
      assert.equal(init.headers.get("x-inner"), "true");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  assert.deepEqual(result, { ok: true });
});

test("supports bearer auth callbacks, static header auth, and caller-supplied authorization headers", async () => {
  const clientWithBearerCallback = new Mailer("", {
    baseUrl: "https://mailer.example.com",
    auth: {
      type: "bearer",
      token: async (context) => `token-for:${context.path}`,
      headerName: "x-auth-token",
      prefix: "Token",
    },
  });

  await clientWithBearerCallback.request("GET", "/callback-auth", {
    fetch: async (_input, init) => {
      assert.equal(init.headers.get("x-auth-token"), "Token token-for:/callback-auth");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  const clientWithStaticHeaderAuth = new Mailer("", {
    baseUrl: "https://mailer.example.com",
    auth: {
      type: "headers",
      headers: {
        "x-static-auth": "static-value",
      },
    },
  });

  await clientWithStaticHeaderAuth.request("GET", "/static-auth", {
    fetch: async (_input, init) => {
      assert.equal(init.headers.get("x-static-auth"), "static-value");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  const clientWithExplicitHeader = new Mailer("", {
    baseUrl: "https://mailer.example.com",
    auth: false,
  });

  await clientWithExplicitHeader.request("GET", "/explicit-auth-header", {
    headers: {
      authorization: "Bearer pre-signed",
    },
    fetch: async (_input, init) => {
      assert.equal(init.headers.get("authorization"), "Bearer pre-signed");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  await new Mailer("mk_live_default_secret", {
    baseUrl: "https://mailer.example.com",
  }).request("GET", "/request-level-auth-off", {
    auth: false,
    headers: {
      authorization: "Bearer request-level",
    },
    fetch: async (_input, init) => {
      assert.equal(init.headers.get("authorization"), "Bearer request-level");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });
});

test("request supports raw endpoint access with merged headers and rich query params", async () => {
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com/base",
    headers: {
      "x-client": "default",
    },
  });

  const result = await client.request("POST", "/reports/export", {
    body: {
      format: "csv",
    },
    headers: {
      "x-request-id": "req_123",
    },
    query: {
      tag: ["welcome", "trial"],
      since: new Date("2026-03-27T00:00:00.000Z"),
    },
    fetch: async (input, init) => {
      assert.equal(
        String(input),
        "https://mailer.example.com/base/reports/export?tag=welcome&tag=trial&since=2026-03-27T00%3A00%3A00.000Z",
      );
      assert.equal(init.headers.get("authorization"), "Bearer mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret");
      assert.equal(init.headers.get("x-client"), "default");
      assert.equal(init.headers.get("x-request-id"), "req_123");
      assert.deepEqual(JSON.parse(init.body), { format: "csv" });
      return createJsonResponse({ ok: true, data: { url: "https://downloads.example.com/report.csv" } });
    },
  });

  assert.deepEqual(result, { url: "https://downloads.example.com/report.csv" });
});

test("query merging ignores undefined values and native bodies are passed through unchanged", async () => {
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    query: {
      account: "acct_1",
      skip: undefined,
    },
  });

  const body = new URLSearchParams({
    mode: "native",
  });

  await client.request("POST", "/native-body", {
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    query: {
      tag: ["welcome", undefined, "trial"],
      empty: undefined,
    },
    fetch: async (input, init) => {
      assert.equal(String(input), "https://mailer.example.com/native-body?account=acct_1&tag=welcome&tag=trial");
      assert.equal(init.body, body);
      assert.equal(init.headers.get("content-type"), "application/x-www-form-urlencoded");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });
});

test("supports custom response parsing and transform hooks", async () => {
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
  });

  const result = await client.request("GET", "/metrics", {
    parseResponse: async (response) => response.headers.get("x-total"),
    transformResponse: ({ payload, response }) => ({
      total: Number(payload),
      status: response.status,
    }),
    fetch: async () =>
      new Response("", {
        status: 202,
        headers: {
          "x-total": "7",
        },
      }),
  });

  assert.deepEqual(result, { total: 7, status: 202 });
});

test("request can skip ok/data unwrapping when needed", async () => {
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
  });

  const result = await client.request("GET", "/raw-envelope", {
    unwrapData: false,
    fetch: async () => createJsonResponse({ ok: true, data: { id: "env_1" } }),
  });

  assert.deepEqual(result, { ok: true, data: { id: "env_1" } });
});

test("supports opt-in retry policies", async () => {
  let attempts = 0;
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
  });

  const result = await client.request("GET", "/retry-me", {
    retry: {
      maxAttempts: 2,
      delayMs: 0,
    },
    fetch: async () => {
      attempts += 1;

      if (attempts === 1) {
        throw new Error("temporary network issue");
      }

      return createJsonResponse({ ok: true, data: { status: "ok" } });
    },
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result, { status: "ok" });
});

test("supports numeric retry config, function delays, and default response-based retries", async () => {
  let numericAttempts = 0;
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
  });

  const numericResult = await client.request("GET", "/retry-number", {
    retry: 2,
    fetch: async () => {
      numericAttempts += 1;

      if (numericAttempts === 1) {
        return createJsonResponse({ ok: false, error: { code: "TEMP", message: "retry me" } }, { status: 500 });
      }

      return createJsonResponse({ ok: true, data: { recovered: true } });
    },
  });

  assert.equal(numericAttempts, 2);
  assert.deepEqual(numericResult, { recovered: true });

  let delayedAttempts = 0;
  const delayedResult = await client.request("GET", "/retry-delay-function", {
    retry: {
      maxAttempts: 2,
      delayMs: async (context) => {
        assert.equal(context.attempt, 1);
        return 1;
      },
    },
    fetch: async () => {
      delayedAttempts += 1;

      if (delayedAttempts === 1) {
        throw new Error("retry with function delay");
      }

      return createJsonResponse({ ok: true, data: { delayed: true } });
    },
  });

  assert.equal(delayedAttempts, 2);
  assert.deepEqual(delayedResult, { delayed: true });

  let noRetryAttempts = 0;
  await assert.rejects(
    () => client.request("GET", "/retry-stop", {
      retry: 2,
      fetch: async () => {
        noRetryAttempts += 1;
        return createJsonResponse({ ok: false, error: { code: "BAD_REQUEST", message: "stop" } }, { status: 400 });
      },
    }),
    /stop/,
  );
  assert.equal(noRetryAttempts, 1);

  let customShouldRetryAttempts = 0;
  const customShouldRetryResult = await client.request("GET", "/retry-custom", {
    retry: {
      shouldRetry: async (context) => context.response?.status === 409,
      delayMs: 0,
    },
    fetch: async () => {
      customShouldRetryAttempts += 1;

      if (customShouldRetryAttempts === 1) {
        return createJsonResponse({ ok: false, error: { code: "CONFLICT", message: "retry once" } }, { status: 409 });
      }

      return createJsonResponse({ ok: true, data: { custom: true } });
    },
  });

  assert.equal(customShouldRetryAttempts, 2);
  assert.deepEqual(customShouldRetryResult, { custom: true });
});

test("sendBatch handles direct arrays and passthrough payloads", async () => {
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    fetch: createSequenceFetch([
      {
        response: createJsonResponse([{ id: "email_1" }]),
      },
      {
        response: createJsonResponse({ ok: true, data: { notice: "not-an-array" } }),
      },
    ]),
  });

  assert.deepEqual(await client.emails.sendBatch([
    { from: "a@example.com", to: "b@example.com", subject: "A", text: "A" },
  ]), [{ id: "email_1" }]);

  assert.deepEqual(await client.emails.sendBatch([
    { from: "a@example.com", to: "c@example.com", subject: "B", text: "B" },
  ]), { ok: true, data: { notice: "not-an-array" } });
});

test("unauthenticated requests strip inherited authorization headers", async () => {
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    headers: {
      authorization: "Bearer custom-token",
      "x-client": "default",
    },
    fetch: async (_input, init) => {
      assert.equal(init.headers.get("authorization"), null);
      assert.equal(init.headers.get("x-client"), "default");
      return createJsonResponse({ ok: true, data: { status: "ok" } });
    },
  });

  assert.deepEqual(await client.health.check(), { status: "ok" });
});

test("parses empty, json-like text, plain text, object, error-like, and null error bodies", async () => {
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    fetch: createSequenceFetch([
      {
        response: createTextResponse("", { status: 200 }),
      },
      {
        response: createTextResponse('{"ok":true,"via":"text"}', {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      },
      {
        response: createTextResponse("upstream exploded", {
          status: 502,
          headers: { "content-type": "text/plain" },
        }),
      },
      {
        response: createJsonResponse({ unexpected: true }, { status: 500 }),
      },
      {
        response: {
          ok: false,
          status: 500,
          headers: new Headers({ "content-type": "text/plain" }),
          text: async () => {
            const value = new Error("error-body");
            value.trim = () => "error-body";
            return value;
          },
        },
      },
      {
        response: createTextResponse("   ", {
          status: 500,
          headers: { "content-type": "text/plain" },
        }),
      },
      {
        response: {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => '{"ok":true,"via":"missing-header"}',
        },
      },
    ]),
  });

  assert.equal(await client.health.ready(), null);
  assert.deepEqual(await client.health.ready(), { ok: true, via: "text" });

  await assert.rejects(() => client.health.ready(), (error) => {
    assert.ok(error instanceof MailerError);
    assert.equal(error.message, "upstream exploded");
    return true;
  });

  await assert.rejects(() => client.health.ready(), (error) => {
    assert.ok(error instanceof MailerError);
    assert.equal(error.message, "Mailer request failed with status 500.");
    assert.deepEqual(error.responseBody, { unexpected: true });
    return true;
  });

  await assert.rejects(() => client.health.ready(), (error) => {
    assert.ok(error instanceof MailerError);
    assert.equal(error.message, "error-body");
    assert.ok(error.responseBody instanceof Error);
    return true;
  });

  await assert.rejects(() => client.health.ready(), (error) => {
    assert.ok(error instanceof MailerError);
    assert.equal(error.message, "Mailer request failed with status 500.");
    assert.equal(error.responseBody, null);
    return true;
  });

  assert.deepEqual(await client.health.ready(), { ok: true, via: "missing-header" });
});

test("supports immediate timeout mode and upstream aborted signals", async () => {
  const immediateClient = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    timeoutMs: 0,
    fetch: async (_input, init) => {
      assert.equal(init.signal.aborted, true);
      assert.equal(init.signal.reason, "Mailer request timed out.");
      return createJsonResponse({ ok: true, data: { status: "ok" } });
    },
  });

  assert.deepEqual(await immediateClient.health.check(), { status: "ok" });

  const aborted = new AbortController();
  const abortedReason = new Error("aborted-before-send");
  aborted.abort(abortedReason);

  const abortedClient = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    timeoutMs: 0,
    fetch: async (_input, init) => {
      assert.equal(init.signal.aborted, true);
      assert.equal(init.signal.reason, abortedReason);
      return createJsonResponse({ ok: true, data: { status: "ok" } });
    },
  });

  assert.deepEqual(await abortedClient.health.check({ signal: aborted.signal }), { status: "ok" });
});

test("reuses an already-aborted upstream signal in normal timeout mode", async () => {
  const controller = new AbortController();
  const reason = new Error("already-aborted");
  controller.abort(reason);

  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    timeoutMs: 100,
    fetch: async (_input, init) => {
      assert.equal(init.signal.aborted, true);
      assert.equal(init.signal.reason, reason);
      return createJsonResponse({ ok: true, data: { status: "ok" } });
    },
  });

  assert.deepEqual(await client.health.check({ signal: controller.signal }), { status: "ok" });
});

test("propagates upstream aborts during an in-flight request", async () => {
  const controller = new AbortController();
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    timeoutMs: 1000,
    fetch: async (_input, init) =>
      await new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        setTimeout(() => controller.abort(new Error("manual-abort")), 5);
      }),
  });

  await assert.rejects(() => client.health.check({ signal: controller.signal }), /manual-abort/);
});

test("aborts requests when the timeout elapses", async () => {
  const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
    baseUrl: "https://mailer.example.com",
    timeoutMs: 5,
    fetch: async (_input, init) =>
      await new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      }),
  });

  await assert.rejects(
    () => client.health.check(),
    /Mailer request timed out after 5ms/,
  );
});

test("rejects invalid absolute base urls", () => {
  assert.throws(
    () => new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", { baseUrl: "/mailer" }),
    /valid absolute URL/,
  );
});

test("requires a fetch implementation when the runtime has none", () => {
  const originalFetch = globalThis.fetch;

  try {
    Object.defineProperty(globalThis, "fetch", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    assert.throws(
      () => new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
        baseUrl: "https://mailer.example.com",
      }),
      /fetch implementation is required/,
    );
  } finally {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
  }
});

test("uses the global fetch fallback and supports email signal options", async () => {
  const originalFetch = globalThis.fetch;
  const signal = new AbortController().signal;

  try {
    globalThis.fetch = createSequenceFetch([
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.example.com/emails/batch");
          assert.equal(init.signal.aborted, false);
        },
        response: createJsonResponse({ data: [{ id: "email_1" }] }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.example.com/emails/email_1");
          assert.equal(init.signal.aborted, false);
        },
        response: createJsonResponse({
          object: "email",
          id: "email_1",
          from: "a@example.com",
          to: ["b@example.com"],
          subject: "Hi",
          html: null,
          text: "Hi",
          cc: [],
          bcc: [],
          reply_to: [],
          created_at: "2026-03-25T19:00:00.000Z",
          scheduled_at: null,
          sent_at: null,
          tags: [],
          headers: {},
          message_id: null,
          last_event: "sent",
          updated_at: "2026-03-25T19:00:00.000Z",
        }),
      },
    ]);

    const client = new Mailer("mk_live_018f8c89-acde-7cc2-8a37-c7f2e051a123_secret", {
      baseUrl: "https://mailer.example.com",
    });

    assert.deepEqual(await client.emails.sendBatch([
      { from: "a@example.com", to: "b@example.com", subject: "Hi", text: "Hi" },
    ], { signal }), [{ id: "email_1" }]);

    assert.equal((await client.emails.get("email_1", { signal })).id, "email_1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
