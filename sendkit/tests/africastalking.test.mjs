import test from "node:test";
import assert from "node:assert/strict";

import {
  AFRICASTALKING_SMS_BASE_URL,
  AfricasTalkingSmsClient,
  parseAfricasTalkingDeliveryReport,
} from "../dist/sms/africastalking.js";
import { MetaWhatsAppClient } from "../dist/whatsapp.js";
import { OnfonSmsClient } from "../dist/sms/onfon.js";

test("modular subpath exports expose provider clients", () => {
  assert.equal(typeof AfricasTalkingSmsClient, "function");
  assert.equal(typeof MetaWhatsAppClient, "function");
  assert.equal(typeof OnfonSmsClient, "function");
});

test("AfricasTalkingSmsClient sends grouped bulk SMS and reads balance", async () => {
  const calls = [];
  const sms = new AfricasTalkingSmsClient({
    apiKey: "api-key",
    username: "sandbox",
    defaultSenderId: "NORIA",
    fetch: async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = init.body instanceof URLSearchParams ? init.body : new URLSearchParams();
      calls.push({
        url,
        method: init.method,
        headers: new Headers(init.headers),
        body,
      });

      if (url.includes("/user")) {
        return jsonResponse({
          UserData: {
            balance: "KES 1,024.50",
          },
        });
      }

      if (url.includes("/messaging?")) {
        return jsonResponse({
          SMSMessageData: {
            Messages: [
              {
                id: "inbound-1",
                from: "+254700123456",
                to: "22384",
                text: "JOIN",
                linkId: "link-1",
                date: "2026-06-25T03:00:00.000Z",
                networkCode: "63902",
              },
            ],
          },
        });
      }

      if (url.includes("/messaging/premium")) {
        return jsonResponse({
          SMSMessageData: {
            Message: "Sent to 1/1",
            Recipients: [
              {
                number: body.get("to"),
                status: "Success",
                statusCode: 101,
                messageId: "premium-1",
              },
            ],
          },
        });
      }

      if (url.includes("/subscription/create") || url.includes("/subscription/delete")) {
        return jsonResponse({
          status: "Success",
          description: "Queued",
        });
      }

      return jsonResponse({
        SMSMessageData: {
          Message: "Sent to 2/2 Total Cost: KES 1.6000",
          Recipients: body.get("to").split(",").map((number, index) => ({
            number,
            status: "Success",
            statusCode: 101,
            messageId: `at-${index + 1}`,
            cost: "KES 0.8000",
          })),
        },
      });
    },
  });

  assert.equal(AFRICASTALKING_SMS_BASE_URL, "https://api.africastalking.com/version1");

  const sendResult = await sms.send({
    messages: [
      { recipient: "+254700123456", text: "One", reference: "r1" },
      { recipient: "+254711111111", text: "One", reference: "r2" },
      { recipient: "+254722222222", text: "Two", reference: "r3" },
    ],
    providerOptions: {
      enqueue: "1",
    },
  });

  assert.equal(calls[0].headers.get("apiKey"), "api-key");
  assert.equal(calls[0].headers.get("content-type"), "application/x-www-form-urlencoded");
  assert.equal(calls[0].body.get("username"), "sandbox");
  assert.equal(calls[0].body.get("from"), "NORIA");
  assert.equal(calls[0].body.get("message"), "One");
  assert.equal(calls[0].body.get("to"), "+254700123456,+254711111111");
  assert.equal(calls[1].body.get("message"), "Two");
  assert.equal(sendResult.submittedCount, 3);
  assert.equal(sendResult.messages[0].providerMessageId, "at-1");

  const balance = await sms.getBalance();
  assert.equal(balance.entries[0].credits, 1024.5);

  const premium = await sms.sendPremium({
    recipient: "+254733333333",
    text: "Premium response",
    shortCode: "22384",
    keyword: "NORIA",
    linkId: "link-1",
    retryDurationInHours: 2,
  });
  assert.equal(premium.messages[0].providerMessageId, "premium-1");
  assert.equal(calls[3].body.get("from"), "22384");
  assert.equal(calls[3].body.get("keyword"), "NORIA");
  assert.equal(calls[3].body.get("linkId"), "link-1");
  assert.equal(calls[3].body.get("retryDurationInHours"), "2");

  const inbox = await sms.fetchMessages({ lastReceivedId: 42 });
  assert.equal(inbox.messages[0].providerMessageId, "inbound-1");
  assert.equal(inbox.messages[0].sender, "+254700123456");
  assert.equal(inbox.messages[0].recipient, "22384");
  assert.equal(inbox.messages[0].linkId, "link-1");
  assert.equal(inbox.messages[0].text, "JOIN");
  assert.match(calls[4].url, /lastReceivedId=42/);

  const created = await sms.createSubscription({
    phoneNumber: "+254700123456",
    shortCode: "22384",
    keyword: "NORIA",
  });
  assert.equal(created.success, true);
  assert.equal(calls[5].body.get("phoneNumber"), "+254700123456");

  const deleted = await sms.deleteSubscription({
    phoneNumber: "+254700123456",
    shortCode: "22384",
    keyword: "NORIA",
  });
  assert.equal(deleted.description, "Queued");
});

test("AfricasTalkingSmsClient parses delivery reports", () => {
  const sms = new AfricasTalkingSmsClient({
    apiKey: "api-key",
    username: "sandbox",
    fetch: async () => jsonResponse({ SMSMessageData: { Recipients: [] } }),
  });

  const event = sms.parseDeliveryReport({
    id: "at-1",
    phoneNumber: "+254700123456",
    status: "Success",
    networkCode: "63902",
    retryCount: "0",
  });

  assert.equal(event?.providerMessageId, "at-1");
  assert.equal(event?.state, "delivered");

  const report = parseAfricasTalkingDeliveryReport({
    message_id: "at-2",
    phone_number: "+254711111111",
    failure_reason: "Rejected",
  });

  assert.equal(report.id, "at-2");
  assert.equal(report.phoneNumber, "+254711111111");
  assert.equal(report.failureReason, "Rejected");
});

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
