import test from "node:test";
import assert from "node:assert/strict";
import Mailer, { MailerError, SendstackClient } from "../dist/index.js";

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

function message(overrides = {}) {
  return {
    id: "msg_1",
    merchant_id: "merchant_1",
    sender_identity_id: null,
    provider_connection_id: null,
    template_id: null,
    contact_id: null,
    channel: "email",
    direction: "outbound",
    provider_name: "sendstack",
    provider_message_id: null,
    to_address: "hello@example.com",
    from_address: "mail@noria.co.ke",
    subject: "Hello",
    html_body: "<p>Hello</p>",
    text_body: "Hello",
    status: "queued",
    error_type: null,
    error_subtype: null,
    queued_at: "2026-04-13T09:00:00.000Z",
    scheduled_at: null,
    sent_at: null,
    delivered_at: null,
    failed_at: null,
    units_estimated: 1,
    units_reserved: 1,
    units_consumed: 0,
    pricing: {},
    attachments: [],
    metadata: {},
    created_at: "2026-04-13T09:00:00.000Z",
    updated_at: "2026-04-13T09:00:00.000Z",
    ...overrides,
  };
}

function quote(overrides = {}) {
  return {
    channel: "email",
    estimated_units: 1,
    available_units: 100,
    reserved_units: 1,
    can_send: true,
    pricing: {},
    ...overrides,
  };
}

function batch(overrides = {}) {
  return {
    messages: [message()],
    recipient_count: 2,
    delivery_mode: "bulk",
    ...overrides,
  };
}

function page(items = [], overrides = {}) {
  return {
    items,
    next_cursor: null,
    has_more: false,
    limit: 25,
    ...overrides,
  };
}

function domain(overrides = {}) {
  return {
    object: "domain",
    id: "domain_1",
    name: "example.com",
    status: "verified",
    region: "eu-west-1",
    created_at: "2026-04-13T09:00:00.000Z",
    records: [],
    capabilities: { sending: "enabled", receiving: "disabled" },
    ...overrides,
  };
}

test("emails.send uses x-api-key auth and normalizes Sendstack email payload aliases", async () => {
  const calls = [];
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1/",
    fetch: async (input, init) => {
      calls.push({ input, init });
      return createJsonResponse(message());
    },
  });

  const result = await client.emails.send(
    {
      from: "Noria Demo <mail@noria.co.ke>",
      to: "hello@example.com",
      reply_to: ["support@noria.co.ke", "ops@noria.co.ke"],
      subject: "Hello from Sendstack",
      html: "<p>Hello</p>",
      text: "Hello",
      contactId: "contact_123",
      providerConnectionId: "provider_123",
      scheduled_at: new Date("2026-04-14T09:00:00.000Z"),
      list_management_options: {
        contact_list_name: "product-updates",
        topic_name: "launches",
      },
      attachments: [
        {
          content: "aGVsbG8=",
          filename: "hello.txt",
          content_type: "text/plain",
          content_id: "attachment-1",
          contentDisposition: "attachment",
        },
      ],
    },
    { idempotencyKey: "send-1" },
  );

  assert.equal(result.id, "msg_1");
  assert.equal(calls.length, 1);

  const [{ input, init }] = calls;
  assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/emails");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.get("x-api-key"), "sk_live_123");
  assert.equal(init.headers.get("idempotency-key"), "send-1");
  assert.equal(init.headers.get("content-type"), "application/json");

  const body = JSON.parse(init.body);
  assert.deepEqual(body, {
    from: "Noria Demo <mail@noria.co.ke>",
    to: "hello@example.com",
    replyTo: ["support@noria.co.ke", "ops@noria.co.ke"],
    subject: "Hello from Sendstack",
    html: "<p>Hello</p>",
    text: "Hello",
    contact_id: "contact_123",
    provider_connection_id: "provider_123",
    scheduledAt: "2026-04-14T09:00:00.000Z",
    listManagementOptions: {
      contactListName: "product-updates",
      topicName: "launches",
    },
    attachments: [
      {
        content: "aGVsbG8=",
        filename: "hello.txt",
        contentType: "text/plain",
        contentId: "attachment-1",
        disposition: "attachment",
      },
    ],
  });
});

test("exports SendstackClient as an alias of Mailer", () => {
  assert.equal(SendstackClient, Mailer);

  const client = new SendstackClient("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
  });

  assert.ok(client instanceof Mailer);
  assert.equal(client.baseUrl, "https://sendstack.noria.co.ke/api/v1");
});

test("apiKeys.create unwraps ok/data responses and serializes expiry aliases", async () => {
  const bodies = [];
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
    fetch: createSequenceFetch([
      {
        assert: (_input, init) => {
          bodies.push(JSON.parse(init.body));
        },
        response: createJsonResponse({
          ok: true,
          data: {
            id: "key_1",
            key: "sk_live_123",
            token: "sk_live_123",
            keyPrefix: "sk_live",
            environment: "live",
            createdAt: "2026-04-13T09:00:00.000Z",
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
            key: "sk_sandbox_123",
            token: "sk_sandbox_123",
            keyPrefix: "sk_sandbox",
            environment: "sandbox",
            createdAt: "2026-04-13T09:00:00.000Z",
          },
        }),
      },
    ]),
  });

  const first = await client.apiKeys.create({
    name: "Primary",
    expires_at: new Date("2026-04-14T00:00:00.000Z"),
  });
  const second = await client.apiKeys.create({
    environment: "sandbox",
    expiresAt: "2026-04-15T00:00:00.000Z",
  });

  assert.equal(first.environment, "live");
  assert.equal(second.environment, "sandbox");
  assert.deepEqual(bodies, [
    {
      name: "Primary",
      expiresAt: "2026-04-14T00:00:00.000Z",
    },
    {
      environment: "sandbox",
      expiresAt: "2026-04-15T00:00:00.000Z",
    },
  ]);
});

test("emails.list encodes cursor pagination and status filters correctly", async () => {
  let capturedUrl = null;
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
    fetch: async (input) => {
      capturedUrl = String(input);
      return createJsonResponse(page([]));
    },
  });

  const result = await client.emails.list({ limit: 25, cursor: "cur_1", perPage: 25, status: "queued" });

  assert.deepEqual(result, page([]));
  assert.equal(
    capturedUrl,
    "https://sendstack.noria.co.ke/api/v1/emails?limit=25&cursor=cur_1&per_page=25&status=queued",
  );
});

test("preserves baseUrl path prefixes for relative resource calls", async () => {
  let capturedUrl = null;
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://gateway.example.com/sendstack-api",
    fetch: async (input) => {
      capturedUrl = String(input);
      return createJsonResponse(page([]));
    },
  });

  await client.sms.list();

  assert.equal(capturedUrl, "https://gateway.example.com/sendstack-api/sms");
});

test("health.live is root-scoped and unauthenticated by default", async () => {
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
    headers: {
      authorization: "Bearer should-be-stripped",
      "x-client": "sdk-test",
    },
    fetch: async (input, init) => {
      assert.equal(String(input), "https://sendstack.noria.co.ke/livez");
      assert.equal(init.headers.get("authorization"), null);
      assert.equal(init.headers.get("x-api-key"), null);
      assert.equal(init.headers.get("x-client"), "sdk-test");
      return createJsonResponse({ ok: true, data: { status: "ok" } });
    },
  });

  const result = await client.health.live();
  assert.deepEqual(result, { status: "ok" });
});

test("throws MailerError for structured compatibility error envelopes", async () => {
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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

test("throws MailerError for FastAPI detail responses", async () => {
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
    fetch: async () =>
      createJsonResponse(
        {
          detail: "Provide exactly one To recipient for this email endpoint",
          errors: [{ field: "to", message: "too many recipients" }],
        },
        { status: 422 },
      ),
  });

  await assert.rejects(
    () => client.emails.send({
      from: "sender@example.com",
      to: ["a@example.com", "b@example.com"],
      subject: "Hello",
      text: "World",
    }),
    (error) => {
      assert.ok(error instanceof MailerError);
      assert.equal(error.statusCode, 422);
      assert.equal(error.message, "Provide exactly one To recipient for this email endpoint");
      assert.deepEqual(error.details, [{ field: "to", message: "too many recipients" }]);
      return true;
    },
  );
});

test("constructor allows options-only usage and still validates baseUrl", () => {
  const client = new Mailer({ baseUrl: "https://sendstack.noria.co.ke/api/v1" });
  assert.equal(client.apiKey, "");

  assert.throws(
    () => new Mailer("sk_live_123"),
    /baseUrl is required/,
  );

  assert.throws(
    () => new Mailer("sk_live_123", { baseUrl: "" }),
    /baseUrl is required/,
  );
});

test("authenticated requests require configured auth unless explicit auth headers are supplied", async () => {
  const client = new Mailer({ baseUrl: "https://sendstack.noria.co.ke/api/v1" });

  await assert.rejects(
    () => client.emails.get("msg_1"),
    /Mailer auth is required for authenticated requests/,
  );

  const xApiKeyClient = new Mailer({
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
    auth: false,
  });

  const xApiKeyResult = await xApiKeyClient.request("GET", "/explicit-x-api-key", {
    headers: {
      "x-api-key": "manual-key",
    },
    fetch: async (_input, init) => {
      assert.equal(init.headers.get("x-api-key"), "manual-key");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  assert.deepEqual(xApiKeyResult, { ok: true });
});

test("all resource methods hit the expected Sendstack endpoints", async () => {
  const signal = new AbortController().signal;
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
    fetch: createSequenceFetch([
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/emails/batch");
          assert.equal(init.method, "POST");
          assert.equal(init.headers.get("x-api-key"), "sk_live_123");
        },
        response: createJsonResponse({ data: [{ id: "msg_batch_1" }, { id: "msg_batch_2" }] }),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/emails/msg_1");
        },
        response: createJsonResponse(message()),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/sms/quote");
          assert.equal(init.method, "POST");
          assert.deepEqual(JSON.parse(init.body), {
            from: "SENDSTACK",
            to: "+254722111222",
            text: "Quote me",
            contact_id: "contact_1",
            template_id: "template_1",
            provider_connection_id: "provider_1",
            idempotency_key: "sms-body-idempotency",
          });
        },
        response: createJsonResponse(quote({ channel: "sms" })),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/sms");
          assert.equal(init.method, "POST");
        },
        response: createJsonResponse(message({ id: "sms_1", channel: "sms", to_address: "+254722111222" })),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/sms/sms_1");
        },
        response: createJsonResponse(message({ id: "sms_1", channel: "sms", to_address: "+254722111222" })),
      },
      {
        assert: (input) => {
          assert.equal(
            String(input),
            "https://sendstack.noria.co.ke/api/v1/sms?limit=20&cursor=cur_sms&per_page=20&status=sent",
          );
        },
        response: createJsonResponse(page([message({ id: "sms_1", channel: "sms", to_address: "+254722111222" })], { limit: 20 })),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/whatsapp/messages/quote");
          assert.equal(init.method, "POST");
          assert.deepEqual(JSON.parse(init.body), {
            from: "WABA",
            to: "+254733000333",
            template_id: "wa_template_1",
            variables: { first_name: "Mercy" },
            provider_connection_id: "wa_provider_1",
          });
        },
        response: createJsonResponse(quote({ channel: "whatsapp" })),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/whatsapp/messages");
          assert.equal(init.method, "POST");
        },
        response: createJsonResponse(message({ id: "wa_1", channel: "whatsapp", to_address: "+254733000333" })),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/whatsapp/messages/wa_1");
        },
        response: createJsonResponse(message({ id: "wa_1", channel: "whatsapp", to_address: "+254733000333" })),
      },
      {
        assert: (input) => {
          assert.equal(
            String(input),
            "https://sendstack.noria.co.ke/api/v1/whatsapp/messages?limit=15&cursor=cur_wa&per_page=15&status=delivered",
          );
        },
        response: createJsonResponse(page([message({ id: "wa_1", channel: "whatsapp" })], { limit: 15 })),
      },
      {
        assert: (input) => {
          assert.equal(
            String(input),
            "https://sendstack.noria.co.ke/api/v1/merchants/merchant_1/messages?limit=10&cursor=cur_merchant&per_page=10&status=queued&channel=email",
          );
        },
        response: createJsonResponse(page([message()], { limit: 10 })),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/merchants/merchant_1/messages/msg_1");
        },
        response: createJsonResponse(message()),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/merchants/merchant_1/messages/email/quote");
        },
        response: createJsonResponse(quote({ channel: "email" })),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/merchants/merchant_1/messages/email/group/quote");
        },
        response: createJsonResponse(quote({ channel: "email" })),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/merchants/merchant_1/messages/email");
        },
        response: createJsonResponse(message({ id: "merchant_email_1" })),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/merchants/merchant_1/messages/email/group");
        },
        response: createJsonResponse(batch()),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/merchants/merchant_1/messages/sms/quote");
        },
        response: createJsonResponse(quote({ channel: "sms" })),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/merchants/merchant_1/messages/sms");
        },
        response: createJsonResponse(message({ id: "merchant_sms_1", channel: "sms" })),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/merchants/merchant_1/messages/whatsapp/quote");
        },
        response: createJsonResponse(quote({ channel: "whatsapp" })),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/merchants/merchant_1/messages/whatsapp");
        },
        response: createJsonResponse(message({ id: "merchant_wa_1", channel: "whatsapp" })),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/domains");
          assert.equal(init.method, "POST");
          assert.deepEqual(JSON.parse(init.body), { name: "example.com" });
        },
        response: createJsonResponse(domain(), { status: 201 }),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/domains");
        },
        response: createJsonResponse(page([], { limit: 25 })),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/domains/domain_1");
        },
        response: createJsonResponse(domain()),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/domains/domain_1/verify");
          assert.equal(init.method, "POST");
        },
        response: createJsonResponse({ object: "domain", id: "domain_1" }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/domains/domain_1");
          assert.equal(init.method, "DELETE");
        },
        response: createJsonResponse({ object: "domain", id: "domain_1", deleted: true }),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/api-keys");
        },
        response: createJsonResponse({
          ok: true,
          data: [
            {
              id: "key_1",
              accountId: "acct_1",
              keyPrefix: "sk_live",
              name: null,
              environment: "live",
              isActive: true,
              lastUsedAt: null,
              expiresAt: null,
              revokedAt: null,
              createdAt: "2026-04-13T09:00:00.000Z",
            },
          ],
        }),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/api-keys/key_1");
        },
        response: createJsonResponse({
          ok: true,
          data: {
            id: "key_1",
            accountId: "acct_1",
            keyPrefix: "sk_live",
            name: null,
            environment: "live",
            isActive: true,
            lastUsedAt: null,
            expiresAt: null,
            revokedAt: null,
            createdAt: "2026-04-13T09:00:00.000Z",
          },
        }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/api-keys/key_1");
          assert.equal(init.method, "DELETE");
        },
        response: createJsonResponse({ ok: true, data: { revoked: true } }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/webhooks");
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
            created_at: "2026-04-13T09:00:00.000Z",
            updated_at: "2026-04-13T09:00:00.000Z",
          },
        }, { status: 201 }),
      },
      {
        assert: (input) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/webhooks");
        },
        response: createJsonResponse({
          ok: true,
          data: [
            {
              id: "webhook_1",
              url: "https://example.com/webhook",
              events: ["email.sent"],
              is_active: true,
              created_at: "2026-04-13T09:00:00.000Z",
              updated_at: "2026-04-13T09:00:00.000Z",
            },
          ],
        }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/webhooks/webhook_1");
          assert.equal(init.method, "DELETE");
        },
        response: createJsonResponse({ ok: true, data: { deleted: true } }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/readyz");
          assert.equal(init.headers.get("x-api-key"), "sk_live_123");
        },
        response: createJsonResponse({ ok: true, data: { status: "ok" } }),
      },
    ]),
  });

  assert.deepEqual(await client.emails.sendBatch([
    { from: "a@example.com", to: "b@example.com", subject: "1", text: "1" },
    { from: "a@example.com", to: "c@example.com", subject: "2", text: "2" },
  ], { signal }), [{ id: "msg_batch_1" }, { id: "msg_batch_2" }]);
  assert.equal((await client.emails.get("msg_1", { signal })).id, "msg_1");
  assert.equal((await client.sms.quote({
    from: "SENDSTACK",
    to: "+254722111222",
    text: "Quote me",
    contactId: "contact_1",
    templateId: "template_1",
    providerConnectionId: "provider_1",
    idempotencyKey: "sms-body-idempotency",
  }, { signal })).channel, "sms");
  assert.equal((await client.sms.send({
    from: "SENDSTACK",
    to: "+254722111222",
    text: "Hello",
  }, { signal })).id, "sms_1");
  assert.equal((await client.sms.get("sms_1", { signal })).id, "sms_1");
  assert.equal((await client.sms.list({ limit: 20, cursor: "cur_sms", perPage: 20, status: "sent", signal })).items[0].id, "sms_1");
  assert.equal((await client.whatsapp.quote({
    from: "WABA",
    to: "+254733000333",
    templateId: "wa_template_1",
    templateVariables: { first_name: "Mercy" },
    providerConnectionId: "wa_provider_1",
  }, { signal })).channel, "whatsapp");
  assert.equal((await client.whatsapp.send({
    from: "WABA",
    to: "+254733000333",
    text: "Hello from WhatsApp",
  }, { signal })).id, "wa_1");
  assert.equal((await client.whatsapp.get("wa_1", { signal })).id, "wa_1");
  assert.equal((await client.whatsapp.list({
    limit: 15,
    cursor: "cur_wa",
    per_page: 15,
    status: "delivered",
    signal,
  })).items[0].id, "wa_1");
  assert.equal((await client.merchant.messages.list("merchant_1", {
    limit: 10,
    cursor: "cur_merchant",
    perPage: 10,
    status: "queued",
    channel: "email",
    signal,
  })).items[0].id, "msg_1");
  assert.equal((await client.merchant.messages.get("merchant_1", "msg_1", { signal })).id, "msg_1");
  assert.equal((await client.merchant.emails.quote("merchant_1", {
    from: "sender@example.com",
    to: "a@example.com",
    subject: "Subject",
    html: "<p>Hello</p>",
    text: "Hello",
  }, { signal })).channel, "email");
  assert.equal((await client.merchant.emails.quoteGroup("merchant_1", {
    from: "sender@example.com",
    to: ["a@example.com", "b@example.com"],
    subject: "Subject",
    html: "<p>Hello</p>",
    text: "Hello",
  }, { signal })).channel, "email");
  assert.equal((await client.merchant.emails.send("merchant_1", {
    from: "sender@example.com",
    to: "a@example.com",
    subject: "Subject",
    html: "<p>Hello</p>",
    text: "Hello",
  }, { signal })).id, "merchant_email_1");
  assert.equal((await client.merchant.emails.sendGroup("merchant_1", {
    from: "sender@example.com",
    to: ["a@example.com", "b@example.com"],
    subject: "Subject",
    html: "<p>Hello</p>",
    text: "Hello",
  }, { signal })).recipient_count, 2);
  assert.equal((await client.merchant.sms.quote("merchant_1", {
    from: "SENDSTACK",
    to: "+254722111222",
    text: "Hello",
  }, { signal })).channel, "sms");
  assert.equal((await client.merchant.sms.send("merchant_1", {
    from: "SENDSTACK",
    to: "+254722111222",
    text: "Hello",
  }, { signal })).id, "merchant_sms_1");
  assert.equal((await client.merchant.whatsapp.quote("merchant_1", {
    from: "WABA",
    to: "+254733000333",
    text: "Hello",
  }, { signal })).channel, "whatsapp");
  assert.equal((await client.merchant.whatsapp.send("merchant_1", {
    from: "WABA",
    to: "+254733000333",
    text: "Hello",
  }, { signal })).id, "merchant_wa_1");
  assert.equal((await client.domains.create({ name: "example.com" }, { signal })).id, "domain_1");
  assert.deepEqual(await client.domains.list({ signal }), page([], { limit: 25 }));
  assert.equal((await client.domains.get("domain_1", { signal })).name, "example.com");
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
  assert.deepEqual(await client.health.ready({ signal, authenticated: true }), { status: "ok" });
});

test("custom headers are preserved when already provided", async () => {
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
    headers: {
      accept: "text/plain",
      "content-type": "application/vnd.api+json",
      "x-client": "sdk-test",
    },
    fetch: async (_input, init) => {
      assert.equal(init.headers.get("accept"), "text/plain");
      assert.equal(init.headers.get("content-type"), "application/vnd.api+json");
      assert.equal(init.headers.get("x-client"), "sdk-test");
      return createJsonResponse(message({ channel: "sms" }));
    },
  });

  await client.sms.send({
    from: "SENDSTACK",
    to: "+254722111222",
    text: "Hello",
  });
});

test("supports auth strategies and middleware composition", async () => {
  const client = new Mailer({
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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
      assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/custom?via=middleware");
      assert.equal(init.headers.get("x-auth-path"), "/custom");
      assert.equal(init.headers.get("x-middleware"), "outer");
      assert.equal(init.headers.get("x-inner"), "true");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  assert.deepEqual(result, { ok: true });
});

test("supports bearer auth callbacks, static header auth, and caller-supplied auth headers", async () => {
  const clientWithBearerCallback = new Mailer({
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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

  const clientWithStaticHeaderAuth = new Mailer({
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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

  const clientWithExplicitXApiKey = new Mailer({
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
    auth: false,
  });

  await clientWithExplicitXApiKey.request("GET", "/explicit-x-api-key", {
    headers: {
      "x-api-key": "manual-key",
    },
    fetch: async (_input, init) => {
      assert.equal(init.headers.get("x-api-key"), "manual-key");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });

  await new Mailer("sk_live_default", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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

test("request supports raw endpoint access with merged headers, query params, and absolute urls", async () => {
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
    headers: {
      "x-client": "default",
    },
    query: {
      account: "acct_1",
    },
  });

  const result = await client.request("POST", "https://api.partner.example.com/reports/export", {
    body: {
      format: "csv",
    },
    headers: {
      "x-request-id": "req_123",
    },
    query: {
      tag: ["welcome", "trial"],
      since: new Date("2026-04-13T00:00:00.000Z"),
    },
    fetch: async (input, init) => {
      assert.equal(
        String(input),
        "https://api.partner.example.com/reports/export?account=acct_1&tag=welcome&tag=trial&since=2026-04-13T00%3A00%3A00.000Z",
      );
      assert.equal(init.headers.get("x-api-key"), "sk_live_123");
      assert.equal(init.headers.get("x-client"), "default");
      assert.equal(init.headers.get("x-request-id"), "req_123");
      assert.deepEqual(JSON.parse(init.body), { format: "csv" });
      return createJsonResponse({ ok: true, data: { url: "https://downloads.example.com/report.csv" } });
    },
  });

  assert.deepEqual(result, { url: "https://downloads.example.com/report.csv" });
});

test("query merging ignores undefined values and native bodies are passed through unchanged", async () => {
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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
      assert.equal(
        String(input),
        "https://sendstack.noria.co.ke/api/v1/native-body?account=acct_1&tag=welcome&tag=trial",
      );
      assert.equal(init.body, body);
      assert.equal(init.headers.get("content-type"), "application/x-www-form-urlencoded");
      return createJsonResponse({ ok: true, data: { ok: true } });
    },
  });
});

test("supports custom response parsing and transform hooks", async () => {
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
  });

  const result = await client.request("GET", "/raw-envelope", {
    unwrapData: false,
    fetch: async () => createJsonResponse({ ok: true, data: { id: "env_1" } }),
  });

  assert.deepEqual(result, { ok: true, data: { id: "env_1" } });
});

test("supports opt-in retry policies", async () => {
  let attempts = 0;
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
    fetch: createSequenceFetch([
      {
        response: createJsonResponse([{ id: "msg_1" }]),
      },
      {
        response: createJsonResponse({ ok: true, data: { notice: "not-an-array" } }),
      },
    ]),
  });

  assert.deepEqual(await client.emails.sendBatch([
    { from: "a@example.com", to: "b@example.com", subject: "A", text: "A" },
  ]), [{ id: "msg_1" }]);

  assert.deepEqual(await client.emails.sendBatch([
    { from: "a@example.com", to: "c@example.com", subject: "B", text: "B" },
  ]), { ok: true, data: { notice: "not-an-array" } });
});

test("unauthenticated requests strip inherited authorization and x-api-key headers", async () => {
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
    headers: {
      authorization: "Bearer custom-token",
      "x-client": "default",
    },
    fetch: async (_input, init) => {
      assert.equal(init.headers.get("authorization"), null);
      assert.equal(init.headers.get("x-api-key"), null);
      assert.equal(init.headers.get("x-client"), "default");
      return createJsonResponse({ ok: true, data: { status: "ok" } });
    },
  });

  assert.deepEqual(await client.health.check(), { status: "ok" });
});

test("parses empty, json-like text, plain text, object, error-like, and null error bodies", async () => {
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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
  const immediateClient = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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

  const abortedClient = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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

  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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
  const client = new Mailer("sk_live_123", {
    baseUrl: "https://sendstack.noria.co.ke/api/v1",
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
    () => new Mailer("sk_live_123", { baseUrl: "/sendstack" }),
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
      () => new Mailer("sk_live_123", {
        baseUrl: "https://sendstack.noria.co.ke/api/v1",
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

test("uses the global fetch fallback and supports signal options on helper methods", async () => {
  const originalFetch = globalThis.fetch;
  const signal = new AbortController().signal;

  try {
    globalThis.fetch = createSequenceFetch([
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/emails/batch");
          assert.equal(init.signal.aborted, false);
        },
        response: createJsonResponse({ data: [{ id: "msg_1" }] }),
      },
      {
        assert: (input, init) => {
          assert.equal(String(input), "https://sendstack.noria.co.ke/api/v1/emails/msg_1");
          assert.equal(init.signal.aborted, false);
        },
        response: createJsonResponse(message()),
      },
    ]);

    const client = new Mailer("sk_live_123", {
      baseUrl: "https://sendstack.noria.co.ke/api/v1",
    });

    assert.deepEqual(await client.emails.sendBatch([
      { from: "a@example.com", to: "b@example.com", subject: "Hi", text: "Hi" },
    ], { signal }), [{ id: "msg_1" }]);

    assert.equal((await client.emails.get("msg_1", { signal })).id, "msg_1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
