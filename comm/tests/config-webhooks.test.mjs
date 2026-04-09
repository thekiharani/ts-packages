import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  ConfigurationError,
  MessagingClient,
  MetaWhatsAppGateway,
  OnfonSmsGateway,
  SmsService,
  WebhookVerificationError,
  WhatsAppService,
  parseOnfonDeliveryReport,
  requireValidMetaSignature,
  resolveMetaSubscriptionChallenge,
  verifyMetaSignature,
} from "../dist/index.js";

test("fromEnv helpers resolve gateway configuration", () => {
  const sms = OnfonSmsGateway.fromEnv({
    env: {
      ONFON_ACCESS_KEY: "access-key",
      ONFON_API_KEY: "api-key",
      ONFON_CLIENT_ID: "client-id",
      ONFON_SENDER_ID: "NORIA",
      ONFON_TIMEOUT_SECONDS: "12",
    },
    fetch: async () => jsonResponse({ ErrorCode: "000", ErrorDescription: "Success", Data: [] }),
  });

  const whatsapp = MetaWhatsAppGateway.fromEnv({
    env: {
      META_WHATSAPP_ACCESS_TOKEN: "token",
      META_WHATSAPP_PHONE_NUMBER_ID: "123456789",
      META_WHATSAPP_WHATSAPP_BUSINESS_ACCOUNT_ID: "9988776655",
      META_WHATSAPP_TIMEOUT_SECONDS: "18",
    },
    fetch: async () => jsonResponse({ contacts: [{ wa_id: "254700123456" }], messages: [{ id: "wamid.1" }] }),
  });

  assert.ok(sms);
  assert.ok(whatsapp);
});

test("services guard missing configuration", async () => {
  const client = new MessagingClient();

  await assert.rejects(() => client.sms.send({ messages: [] }), ConfigurationError);
  await assert.rejects(
    () => client.whatsapp.sendText({ recipient: "254700123456", text: "hello" }),
    ConfigurationError,
  );

  const smsService = new SmsService();
  const whatsappService = new WhatsAppService();

  assert.equal(smsService.configured, false);
  assert.equal(whatsappService.configured, false);
});

test("webhook helpers resolve challenge, verify signatures, and delegate Onfon parsing", () => {
  const challenge = resolveMetaSubscriptionChallenge(
    {
      "hub.mode": "subscribe",
      "hub.verify_token": "verify-me",
      "hub.challenge": "12345",
    },
    "verify-me",
  );
  assert.equal(challenge, "12345");
  assert.equal(resolveMetaSubscriptionChallenge({ "hub.mode": "ping" }, "verify-me"), undefined);

  const rawBody = Buffer.from(JSON.stringify({ object: "whatsapp_business_account" }), "utf8");
  const signature = `sha256=${createHmac("sha256", "app-secret").update(rawBody).digest("hex")}`;

  assert.equal(verifyMetaSignature(rawBody, signature, "app-secret"), true);
  assert.equal(verifyMetaSignature(rawBody, "sha256=bad", "app-secret"), false);
  assert.throws(() => verifyMetaSignature(rawBody, signature, ""), ConfigurationError);
  assert.doesNotThrow(() => requireValidMetaSignature(rawBody, signature, "app-secret"));
  assert.throws(
    () => requireValidMetaSignature(rawBody, "sha256=bad", "app-secret"),
    WebhookVerificationError,
  );

  const sms = new OnfonSmsGateway({
    accessKey: "access-key",
    apiKey: "api-key",
    clientId: "client-id",
    defaultSenderId: "NORIA",
    fetch: async () => jsonResponse({ ErrorCode: "000", ErrorDescription: "Success", Data: [] }),
  });

  const report = parseOnfonDeliveryReport(
    {
      MessageId: "msg-1",
      MobileNumber: "254700123456",
      Status: "Delivered",
    },
    sms,
  );
  assert.equal(report?.providerMessageId, "msg-1");
});

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
