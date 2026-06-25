import test from "node:test";
import assert from "node:assert/strict";

import {
  ConfigurationError,
  ProviderError,
  ONFON_SMS_BASE_URL,
  OnfonSmsClient,
} from "../dist/index.js";

test("OnfonSmsClient validates required config", () => {
  assert.throws(() => new OnfonSmsClient({ accessKey: "", apiKey: "a", clientId: "b" }), ConfigurationError);
});

test("OnfonSmsClient supports send, balance, group, template, and delivery-report flows", async () => {
  const calls = [];
  const client = new OnfonSmsClient({
    accessKey: "access-key",
    apiKey: "api-key",
    clientId: "client-id",
    defaultSenderId: "NORIA",
    fetch: async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init.headers);
      const payload = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ url, method: init.method, headers, payload });

      if (url.endsWith("/SendBulkSMS")) {
        return jsonResponse({
          ErrorCode: "000",
          ErrorDescription: "Success",
          Data: [
            { MessageId: "msg-1", MobileNumber: "254700123456" },
            { MobileNumber: "254711111111" },
          ],
        });
      }

      if (url.includes("/Balance")) {
        return jsonResponse({
          ErrorCode: "000",
          ErrorDescription: "Success",
          Data: [{ PluginType: "SMS", Credits: "1,024.50" }],
        });
      }

      if (url.includes("/Group") && init.method === "GET") {
        return jsonResponse({
          ErrorCode: "000",
          ErrorDescription: "Success",
          Data: [{ GroupId: "group-1", GroupName: "VIP", ContactCount: "3" }],
        });
      }

      if (url.includes("/Template") && init.method === "GET") {
        return jsonResponse({
          ErrorCode: "000",
          ErrorDescription: "Success",
          Data: [
            {
              TemplateId: "tmpl-1",
              TemplateName: "otp",
              MessageTemplate: "Use {{1}}",
              IsApproved: "true",
              IsActive: "1",
            },
          ],
        });
      }

      return jsonResponse({
        ErrorCode: "000",
        ErrorDescription: "Success",
        Data: "Success",
      });
    },
  });

  const sendResult = await client.send({
    messages: [
      { recipient: "254700123456", text: "One", reference: "r1" },
      { recipient: "254711111111", text: "Two", reference: "r2" },
    ],
  });

  assert.equal(ONFON_SMS_BASE_URL, "https://api.onfonmedia.co.ke/v1/sms");
  assert.equal(sendResult.submittedCount, 1);
  assert.equal(sendResult.failedCount, 1);
  assert.equal(sendResult.messages[0].providerMessageId, "msg-1");
  assert.equal(sendResult.messages[1].providerErrorCode, "MISSING_MESSAGE_ID");
  assert.equal(calls[0].headers.get("AccessKey"), "access-key");
  assert.equal(calls[0].payload.SenderId, "NORIA");

  const balance = await client.getBalance();
  assert.equal(balance.entries[0].credits, 1024.5);

  const groups = await client.listGroups();
  assert.equal(groups[0].groupId, "group-1");

  const createGroup = await client.createGroup({ name: "VIP" });
  assert.equal(createGroup.success, true);

  const templates = await client.listTemplates();
  assert.equal(templates[0].templateId, "tmpl-1");

  const createTemplate = await client.createTemplate({ name: "otp", body: "Use {{1}}" });
  assert.equal(createTemplate.success, true);

  const report = client.parseDeliveryReport({
    messageId: "msg-1",
    mobile: "254700123456",
    status: "Delivered",
  });
  assert.equal(report?.providerMessageId, "msg-1");
  assert.equal(report?.state, "delivered");
});

test("OnfonSmsClient raises ProviderError on provider failures", async () => {
  const client = new OnfonSmsClient({
    accessKey: "access-key",
    apiKey: "api-key",
    clientId: "client-id",
    defaultSenderId: "NORIA",
    fetch: async () =>
      jsonResponse({
        ErrorCode: "101",
        ErrorDescription: "Invalid sender",
      }),
  });

  await assert.rejects(
    () =>
      client.send({
        messages: [{ recipient: "254700123456", text: "hello" }],
      }),
    ProviderError,
  );
});

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
