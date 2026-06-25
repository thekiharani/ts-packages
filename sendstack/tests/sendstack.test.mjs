import test from "node:test";
import assert from "node:assert/strict";
import Sendstack, {
  DEFAULT_BASE_URL,
  SendstackClient,
  SendstackError,
} from "../dist/index.js";

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

function createEmptyResponse(init = {}) {
  return new Response(null, {
    status: init.status ?? 204,
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

function page(data = [], next_cursor = null) {
  return { data, next_cursor };
}

function email(overrides = {}) {
  return {
    id: "msg_1",
    status: "queued",
    from: "hello@example.com",
    to: ["friend@example.com"],
    cc: [],
    bcc: [],
    subject: "Hello",
    batch_id: null,
    provider_id: null,
    provider_message_id: null,
    attempts: 0,
    scheduled_at: null,
    sent_at: null,
    last_error: null,
    metadata: {},
    tags: [],
    created_at: "2026-06-25T00:00:00.000Z",
    ...overrides,
  };
}

function domain(overrides = {}) {
  return {
    id: "dom_1",
    tenantId: "tenant_1",
    domain: "example.com",
    status: "pending",
    createdAt: "2026-06-25T00:00:00.000Z",
    ...overrides,
  };
}

function template(overrides = {}) {
  return {
    id: "tpl_1",
    tenantId: "tenant_1",
    name: "Welcome",
    subject: "Welcome",
    htmlBody: "<p>Hello</p>",
    textBody: "Hello",
    createdAt: "2026-06-25T00:00:00.000Z",
    ...overrides,
  };
}

function webhook(overrides = {}) {
  return {
    id: "wh_1",
    tenantId: "tenant_1",
    url: "https://example.com/webhooks/sendstack",
    secret: "whsec_123",
    eventTypes: ["email.sent"],
    enabled: true,
    createdAt: "2026-06-25T00:00:00.000Z",
    ...overrides,
  };
}

function suppression(overrides = {}) {
  return {
    id: "sup_1",
    tenantId: "tenant_1",
    recipient: "bad@example.com",
    reason: "manual",
    createdAt: "2026-06-25T00:00:00.000Z",
    ...overrides,
  };
}

test("exports Sendstack-first names", () => {
  assert.equal(DEFAULT_BASE_URL, "https://mailer.norialabs.com");
  assert.equal(SendstackClient, Sendstack);

  const defaultClient = new Sendstack("mlr_live_123");
  assert.equal(defaultClient.baseUrl, "https://mailer.norialabs.com");
  assert.equal(defaultClient.token, "mlr_live_123");

  const optionsClient = new Sendstack({
    token: "mlr_live_options",
    baseUrl: "https://sendstack.norialabs.com/",
  });
  assert.equal(optionsClient.baseUrl, "https://sendstack.norialabs.com");
  assert.equal(optionsClient.token, "mlr_live_options");
});

test("emails.send uses bearer auth and normalizes SendStack payload aliases", async () => {
  const calls = [];
  const client = new Sendstack("mlr_live_123", {
    baseUrl: "https://mailer.norialabs.com",
    fetch: async (input, init) => {
      calls.push({ input, init });
      return createJsonResponse({ id: "msg_1", status: "queued" }, { status: 202 });
    },
  });

  const result = await client.emails.send(
    {
      from: "Noria <hello@example.com>",
      to: ["friend@example.com"],
      cc: "copy@example.com",
      bcc: ["audit@example.com"],
      replyTo: "reply@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
      headers: { "x-campaign": "launch" },
      attachments: [
        {
          filename: "hello.txt",
          contentBase64: "aGVsbG8=",
          contentType: "text/plain",
          contentId: "hello",
          inline: true,
        },
      ],
      metadata: { account: "acct_1" },
      tags: [{ name: "campaign", value: "launch" }],
      trackOpens: true,
      trackClicks: false,
      providerId: "018f6bd2-6f9d-7aa2-83f7-8e84918cc000",
      templateId: "018f6bd2-6f9d-7aa2-83f7-8e84918cc001",
      templateData: { firstName: "Amina" },
      scheduledAt: new Date("2026-06-26T09:00:00.000Z"),
    },
    { idempotencyKey: "email-1" },
  );

  assert.deepEqual(result, { id: "msg_1", status: "queued" });
  assert.equal(calls.length, 1);
  const [{ input, init }] = calls;
  assert.equal(String(input), "https://mailer.norialabs.com/emails");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.get("authorization"), "Bearer mlr_live_123");
  assert.equal(init.headers.get("idempotency-key"), "email-1");
  assert.equal(init.headers.get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(init.body), {
    from: "Noria <hello@example.com>",
    to: ["friend@example.com"],
    cc: "copy@example.com",
    bcc: ["audit@example.com"],
    reply_to: "reply@example.com",
    subject: "Hello",
    html: "<p>Hello</p>",
    text: "Hello",
    headers: { "x-campaign": "launch" },
    attachments: [
      {
        filename: "hello.txt",
        content_base64: "aGVsbG8=",
        content_type: "text/plain",
        content_id: "hello",
        inline: true,
      },
    ],
    metadata: { account: "acct_1" },
    tags: [{ name: "campaign", value: "launch" }],
    track_opens: true,
    track_clicks: false,
    provider_id: "018f6bd2-6f9d-7aa2-83f7-8e84918cc000",
    template_id: "018f6bd2-6f9d-7aa2-83f7-8e84918cc001",
    template_data: { firstName: "Amina" },
    scheduled_at: "2026-06-26T09:00:00.000Z",
  });
});

test("all OpenAPI resource methods hit the expected SendStack endpoints", async () => {
  const client = new Sendstack("mlr_live_123", {
    baseUrl: "https://mailer.norialabs.com/api",
    fetch: createSequenceFetch([
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/attachments");
          assert.equal(init.method, "POST");
          assert.deepEqual(JSON.parse(init.body), {
            filename: "report.pdf",
            content_base64: "cGRm",
            content_type: "application/pdf",
          });
        },
        response: createJsonResponse({
          attachment_id: "att_1",
          sha256: "abc",
          size_bytes: 3,
          filename: "report.pdf",
          content_type: "application/pdf",
        }, { status: 201 }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/emails/batch");
          assert.equal(init.method, "POST");
          assert.deepEqual(JSON.parse(init.body), {
            emails: [
              {
                from: "a@example.com",
                to: "b@example.com",
                reply_to: "reply@example.com",
                subject: "Hi",
                text: "One",
              },
            ],
          });
        },
        response: createJsonResponse({
          batch_id: "batch_1",
          data: [{ id: "msg_1", status: "queued" }],
        }, { status: 202 }),
      },
      {
        assert: (input) => {
          assert.equal(
            String(input),
            "https://mailer.norialabs.com/api/emails?limit=10&cursor=cur_1&status=queued&expand=events",
          );
        },
        response: createJsonResponse(page([email()], "cur_2")),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/emails/msg%201");
        },
        response: createJsonResponse(email({ id: "msg 1" })),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/emails/msg_1/events");
        },
        response: createJsonResponse(page([
          {
            id: "evt_1",
            messageId: "msg_1",
            type: "email.sent",
            occurredAt: "2026-06-25T00:00:00.000Z",
          },
        ])),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/emails/msg_1/cancel");
          assert.equal(init.method, "POST");
        },
        response: createJsonResponse(email({ status: "canceled" })),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/emails/msg_1/requeue");
          assert.equal(init.method, "POST");
        },
        response: createJsonResponse(email({ status: "queued" })),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/domains");
          assert.equal(init.method, "POST");
          assert.deepEqual(JSON.parse(init.body), {
            domain: "example.com",
            provider_id: "018f6bd2-6f9d-7aa2-83f7-8e84918cc002",
            import: true,
            region: "af-south-1",
            tls: "enforced",
            capabilities: { sending: "enabled" },
            custom_return_path: "bounce",
          });
        },
        response: createJsonResponse(domain(), { status: 201 }),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/domains");
        },
        response: createJsonResponse(page([domain()])),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/domains/dom_1");
        },
        response: createJsonResponse(domain()),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/domains/dom_1/verify");
          assert.equal(init.method, "POST");
        },
        response: createJsonResponse(domain({ status: "verified" })),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/templates");
          assert.equal(init.method, "POST");
          assert.deepEqual(JSON.parse(init.body), {
            name: "Welcome",
            slug: "welcome",
            subject: "Welcome",
            html: "<p>Hello</p>",
            text: "Hello",
          });
        },
        response: createJsonResponse(template(), { status: 201 }),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/templates");
        },
        response: createJsonResponse(page([template()])),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/templates/tpl_1");
        },
        response: createJsonResponse(template()),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/templates/tpl_1");
          assert.equal(init.method, "PATCH");
          assert.deepEqual(JSON.parse(init.body), { subject: "Updated", html: null });
        },
        response: createJsonResponse(template({ subject: "Updated", htmlBody: null })),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/templates/tpl_1");
          assert.equal(init.method, "DELETE");
        },
        response: createEmptyResponse(),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/webhook-endpoints");
          assert.equal(init.method, "POST");
          assert.deepEqual(JSON.parse(init.body), {
            url: "https://example.com/webhooks/sendstack",
            event_types: ["email.sent"],
          });
        },
        response: createJsonResponse(webhook(), { status: 201 }),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/webhook-endpoints");
        },
        response: createJsonResponse(page([webhook()])),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/webhook-endpoints/wh_1");
          assert.equal(init.method, "PATCH");
          assert.deepEqual(JSON.parse(init.body), {
            event_types: ["email.failed"],
            enabled: false,
          });
        },
        response: createJsonResponse(webhook({ enabled: false, eventTypes: ["email.failed"] })),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/webhook-endpoints/wh_1");
          assert.equal(init.method, "DELETE");
        },
        response: createEmptyResponse(),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/events/evt_1/retry");
          assert.equal(init.method, "POST");
        },
        response: createJsonResponse({ id: "evt_1", webhook_status: "queued" }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/suppressions");
          assert.equal(init.method, "POST");
          assert.deepEqual(JSON.parse(init.body), {
            recipient: "bad@example.com",
            reason: "manual",
          });
        },
        response: createJsonResponse({ recipient: "bad@example.com", reason: "manual" }, { status: 201 }),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/suppressions");
        },
        response: createJsonResponse(page([suppression()])),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://mailer.norialabs.com/api/suppressions/bad%40example.com");
          assert.equal(init.method, "DELETE");
        },
        response: createEmptyResponse(),
      },
    ]),
  });

  assert.equal((await client.attachments.upload({
    filename: "report.pdf",
    contentBase64: "cGRm",
    contentType: "application/pdf",
  })).attachment_id, "att_1");
  assert.equal((await client.emails.sendBatch({
    emails: [{
      from: "a@example.com",
      to: "b@example.com",
      replyTo: "reply@example.com",
      subject: "Hi",
      text: "One",
    }],
  })).batch_id, "batch_1");
  assert.equal((await client.emails.list({
    limit: 10,
    cursor: "cur_1",
    status: "queued",
    query: { expand: "events" },
  })).next_cursor, "cur_2");
  assert.equal((await client.emails.get("msg 1")).id, "msg 1");
  assert.equal((await client.emails.events("msg_1")).data[0].type, "email.sent");
  assert.equal((await client.emails.cancel("msg_1")).status, "canceled");
  assert.equal((await client.emails.requeue("msg_1")).status, "queued");
  assert.equal((await client.domains.create({
    domain: "example.com",
    providerId: "018f6bd2-6f9d-7aa2-83f7-8e84918cc002",
    import: true,
    region: "af-south-1",
    tls: "enforced",
    capabilities: { sending: "enabled" },
    customReturnPath: "bounce",
  })).id, "dom_1");
  assert.equal((await client.domains.list()).data[0].domain, "example.com");
  assert.equal((await client.domains.get("dom_1")).id, "dom_1");
  assert.equal((await client.domains.verify("dom_1")).status, "verified");
  assert.equal((await client.templates.create({
    name: "Welcome",
    slug: "welcome",
    subject: "Welcome",
    html: "<p>Hello</p>",
    text: "Hello",
  })).id, "tpl_1");
  assert.equal((await client.templates.list()).data[0].id, "tpl_1");
  assert.equal((await client.templates.get("tpl_1")).id, "tpl_1");
  assert.equal((await client.templates.update("tpl_1", { subject: "Updated", html: null })).subject, "Updated");
  assert.equal(await client.templates.remove("tpl_1"), undefined);
  assert.equal((await client.webhooks.create({
    url: "https://example.com/webhooks/sendstack",
    eventTypes: ["email.sent"],
  })).id, "wh_1");
  assert.equal((await client.webhooks.list()).data[0].id, "wh_1");
  assert.equal((await client.webhooks.update("wh_1", {
    eventTypes: ["email.failed"],
    enabled: false,
  })).enabled, false);
  assert.equal(await client.webhooks.remove("wh_1"), undefined);
  assert.equal((await client.webhookEvents.retry("evt_1")).webhook_status, "queued");
  assert.equal((await client.suppressions.add({
    recipient: "bad@example.com",
    reason: "manual",
  })).recipient, "bad@example.com");
  assert.equal((await client.suppressions.list()).data[0].recipient, "bad@example.com");
  assert.equal(await client.suppressions.remove("bad@example.com"), undefined);
});

test("raw request supports middleware, custom auth, query serialization, native bodies, and transforms", async () => {
  const seen = [];
  const client = new Sendstack({
    baseUrl: "https://mailer.norialabs.com/api",
    auth: {
      type: "bearer",
      token: async (context) => {
        assert.equal(context.path, "/custom");
        return "mlr_live_callback";
      },
    },
    query: {
      account: "acct_1",
      at: new Date("2026-06-25T00:00:00.000Z"),
    },
    headers: {
      "x-client": "sendstack-test",
    },
    middleware: [
      async (context, next) => {
        seen.push(context.path);
        context.headers.set("x-middleware", "yes");
        context.url.searchParams.set("via", "middleware");
        return await next(context);
      },
    ],
    fetch: async (input, init) => {
      assert.equal(
        String(input),
        "https://mailer.norialabs.com/api/custom?account=acct_1&at=2026-06-25T00%3A00%3A00.000Z&tag=a&tag=b&via=middleware",
      );
      assert.equal(init.method, "PUT");
      assert.equal(init.headers.get("authorization"), "Bearer mlr_live_callback");
      assert.equal(init.headers.get("x-client"), "sendstack-test");
      assert.equal(init.headers.get("x-middleware"), "yes");
      assert.equal(init.headers.get("content-type"), "text/plain");
      assert.equal(init.body, "raw body");
      return createTextResponse("accepted", { status: 202 });
    },
    parseResponse: async (response) => ({ parsed: await response.text() }),
    transformResponse: (context) => ({
      status: context.response.status,
      payload: context.payload,
    }),
  });

  const result = await client.request("PUT", "/custom", {
    body: "raw body",
    headers: {
      "content-type": "text/plain",
    },
    query: {
      tag: ["a", "b", undefined],
      skip: undefined,
    },
  });

  assert.deepEqual(seen, ["/custom"]);
  assert.deepEqual(result, {
    status: 202,
    payload: { parsed: "accepted" },
  });
});

test("auth can be disabled per request or supplied explicitly", async () => {
  const unauthenticated = new Sendstack("mlr_live_123", {
    baseUrl: "https://mailer.norialabs.com",
    headers: {
      authorization: "Bearer strip-me",
      "x-client": "sdk",
    },
    fetch: async (_input, init) => {
      assert.equal(init.headers.get("authorization"), null);
      assert.equal(init.headers.get("x-client"), "sdk");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  assert.deepEqual(await unauthenticated.request("GET", "/public", {
    authenticated: false,
  }), { ok: true });

  const explicit = new Sendstack({
    baseUrl: "https://mailer.norialabs.com",
    auth: false,
    fetch: async (_input, init) => {
      assert.equal(init.headers.get("authorization"), "Bearer manual");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  assert.deepEqual(await explicit.request("GET", "/manual", {
    headers: { authorization: "Bearer manual" },
  }), { ok: true });

  const headerAuth = new Sendstack({
    baseUrl: "https://mailer.norialabs.com",
    auth: {
      type: "headers",
      headers: () => ({ authorization: "Bearer from-callback" }),
    },
    fetch: async (_input, init) => {
      assert.equal(init.headers.get("authorization"), "Bearer from-callback");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  assert.deepEqual(await headerAuth.request("GET", "/headers"), { ok: true });

  const missing = new Sendstack({
    baseUrl: "https://mailer.norialabs.com",
    auth: false,
  });

  await assert.rejects(
    () => missing.request("GET", "/private"),
    /Sendstack auth is required/,
  );
});

test("errors are normalized across SendStack, Fastify, text, empty, and Error payloads", async () => {
  const cases = [
    {
      response: createJsonResponse({
        ok: false,
        error: {
          code: "forbidden",
          message: "Forbidden",
          details: { scope: "emails" },
        },
      }, { status: 403 }),
      assert: (error) => {
        assert.equal(error.message, "Forbidden");
        assert.equal(error.code, "forbidden");
        assert.deepEqual(error.details, { scope: "emails" });
      },
    },
    {
      response: createJsonResponse({
        detail: "Invalid email",
        errors: [{ field: "to" }],
      }, { status: 422 }),
      assert: (error) => {
        assert.equal(error.message, "Invalid email");
        assert.deepEqual(error.details, [{ field: "to" }]);
      },
    },
    {
      response: createJsonResponse({
        code: "rate_limited",
        message: "Slow down",
        details: { retryAfter: 1 },
      }, { status: 429 }),
      assert: (error) => {
        assert.equal(error.message, "Slow down");
        assert.equal(error.code, "rate_limited");
        assert.deepEqual(error.details, { retryAfter: 1 });
      },
    },
    {
      response: createTextResponse("Plain failure", { status: 500 }),
      assert: (error) => {
        assert.equal(error.message, "Plain failure");
      },
    },
    {
      response: createEmptyResponse({ status: 500 }),
      assert: (error) => {
        assert.equal(error.message, "Sendstack request failed with status 500.");
      },
    },
  ];

  for (const item of cases) {
    const client = new Sendstack("mlr_live_123", {
      baseUrl: "https://mailer.norialabs.com",
      fetch: async () => item.response,
    });

    await assert.rejects(
      () => client.request("GET", "/fail"),
      (error) => {
        assert.ok(error instanceof SendstackError);
        item.assert(error);
        assert.equal(error.responseBody === undefined, false);
        return true;
      },
    );
  }

  const customPayload = new Error("Boom");
  const client = new Sendstack("mlr_live_123", {
    baseUrl: "https://mailer.norialabs.com",
    fetch: async () => createJsonResponse({ ignored: true }, { status: 500 }),
    parseResponse: async () => customPayload,
  });

  await assert.rejects(
    () => client.request("GET", "/error-object"),
    (error) => {
      assert.ok(error instanceof SendstackError);
      assert.equal(error.message, "Boom");
      return true;
    },
  );
});

test("retry handles retryable responses and thrown transport errors", async () => {
  let responseAttempts = 0;
  const responseClient = new Sendstack("mlr_live_123", {
    baseUrl: "https://mailer.norialabs.com",
    retry: {
      maxAttempts: 2,
      delayMs: () => 0,
    },
    fetch: async () => {
      responseAttempts += 1;
      return responseAttempts === 1
        ? createJsonResponse({ message: "Temporary" }, { status: 503 })
        : createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  assert.deepEqual(await responseClient.request("GET", "/retry-response"), { ok: true });
  assert.equal(responseAttempts, 2);

  let throwAttempts = 0;
  const throwClient = new Sendstack("mlr_live_123", {
    baseUrl: "https://mailer.norialabs.com",
    fetch: async () => {
      throwAttempts += 1;
      if (throwAttempts === 1) {
        throw new TypeError("network");
      }
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  assert.deepEqual(await throwClient.request("GET", "/retry-throw", {
    retry: 2,
  }), { ok: true });
  assert.equal(throwAttempts, 2);

  const noRetry = new Sendstack("mlr_live_123", {
    baseUrl: "https://mailer.norialabs.com",
    retry: {
      maxAttempts: 2,
      delayMs: 0,
    },
    fetch: async () => createJsonResponse({ message: "Bad request" }, { status: 400 }),
  });

  await assert.rejects(
    () => noRetry.request("GET", "/bad"),
    (error) => {
      assert.ok(error instanceof SendstackError);
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
});

test("request validates base URLs, timeout behavior, abort behavior, and non-json parsing", async () => {
  assert.throws(
    () => new Sendstack("mlr_live_123", { baseUrl: "/relative" }),
    /baseUrl must be a valid absolute URL/,
  );

  const timeoutClient = new Sendstack("mlr_live_123", {
    baseUrl: "https://mailer.norialabs.com",
    timeoutMs: 0,
    fetch: async (_input, init) => {
      assert.equal(init.signal.aborted, true);
      assert.equal(init.signal.reason, "Sendstack request timed out.");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  assert.deepEqual(await timeoutClient.request("GET", "/timeout-zero"), { ok: true });

  const controller = new AbortController();
  controller.abort(new Error("caller aborted"));
  const abortedClient = new Sendstack("mlr_live_123", {
    baseUrl: "https://mailer.norialabs.com",
    fetch: async (_input, init) => {
      assert.equal(init.signal.aborted, true);
      assert.equal(init.signal.reason.message, "caller aborted");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  assert.deepEqual(await abortedClient.request("GET", "/aborted", {
    signal: controller.signal,
  }), { ok: true });

  const nonJsonClient = new Sendstack("mlr_live_123", {
    baseUrl: "https://mailer.norialabs.com",
    fetch: async () => createTextResponse("{\"ok\":true,\"data\":{\"text\":true}}", {
      headers: { "content-type": "text/plain" },
    }),
  });

  assert.deepEqual(await nonJsonClient.request("GET", "/text-json"), { text: true });

  const urlSearchParamsClient = new Sendstack("mlr_live_123", {
    baseUrl: "https://mailer.norialabs.com",
    fetch: async (_input, init) => {
      assert.ok(init.body instanceof URLSearchParams);
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  assert.deepEqual(await urlSearchParamsClient.request("POST", "/form", {
    body: new URLSearchParams([["hello", "world"]]),
  }), { ok: true });
});
