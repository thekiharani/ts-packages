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
