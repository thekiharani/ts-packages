import test from "node:test";
import assert from "node:assert/strict";

import { META_GRAPH_API_VERSION, MetaWhatsAppClient } from "../dist/index.js";

test("MetaWhatsAppClient supports sends, templates, media, and parsing helpers", async () => {
  const calls = [];
  const client = new MetaWhatsAppClient({
    accessToken: "token",
    phoneNumberId: "123456789",
    whatsappBusinessAccountId: "9988776655",
    fetch: async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({
        url,
        method: init.method,
        headers: new Headers(init.headers),
        body: init.body,
      });

      if (url.endsWith("/messages") && JSON.parse(init.body).status === "read") {
        return jsonResponse({ success: true });
      }

      if (url.endsWith("/messages")) {
        return jsonResponse({
          contacts: [{ wa_id: "254700123456" }],
          messages: [{ id: "wamid.1", message_status: "accepted" }],
        });
      }

      if (url.includes("/message_templates") && init.method === "GET") {
        return jsonResponse({
          data: [{ id: "tmpl-1", name: "welcome", language: "en_US", category: "UTILITY" }],
          paging: { cursors: { before: "a", after: "b" } },
          summary: { total_count: 1 },
        });
      }

      if (url.includes("/message_templates") && init.method === "POST") {
        return jsonResponse({
          id: "tmpl-1",
          status: "APPROVED",
        });
      }

      if (url.endsWith("/tmpl-1") && init.method === "GET") {
        return jsonResponse({
          id: "tmpl-1",
          name: "welcome",
          language: "en_US",
          category: "UTILITY",
        });
      }

      if (url.endsWith("/tmpl-1") && init.method === "POST") {
        return jsonResponse({
          id: "tmpl-1",
          status: "APPROVED",
        });
      }

      if (url.includes("/message_templates") && init.method === "DELETE") {
        return jsonResponse({ success: true });
      }

      if (url.endsWith("/media") && init.method === "POST") {
        assert.ok(init.body instanceof FormData);
        return jsonResponse({ id: "media-1" });
      }

      if (url.includes("/media-1?") && init.method === "GET") {
        return jsonResponse({
          id: "media-1",
          url: "https://example.com/media",
          mime_type: "application/pdf",
          file_size: 42,
        });
      }

      if (url.includes("/media-1?") && init.method === "DELETE") {
        return jsonResponse({ success: true });
      }

      return jsonResponse({ success: true });
    },
  });

  assert.equal(META_GRAPH_API_VERSION, "v25.0");

  const text = await client.sendText({
    recipient: "254700123456",
    text: "hello",
    previewUrl: true,
  });
  assert.equal(text.messages[0].providerMessageId, "wamid.1");
  assert.equal(calls[0].url, `https://graph.facebook.com/${META_GRAPH_API_VERSION}/123456789/messages`);

  const template = await client.sendTemplate({
    recipient: "254700123456",
    templateName: "order_update",
    languageCode: "en_US",
    components: [
      {
        type: "header",
        parameters: [
          {
            type: "document",
            value: "media-doc-1",
          },
        ],
      },
      {
        type: "body",
        parameters: [{ type: "text", value: "NORIA-123" }],
      },
      {
        type: "button",
        subType: "quick_reply",
        index: 0,
        parameters: [{ type: "payload", value: "track-order" }],
      },
    ],
  });
  assert.equal(template.accepted, true);
  assert.deepEqual(JSON.parse(calls.at(-1).body).template.components, [
    {
      type: "header",
      parameters: [{ type: "document", document: { id: "media-doc-1" } }],
    },
    {
      type: "body",
      parameters: [{ type: "text", text: "NORIA-123" }],
    },
    {
      type: "button",
      sub_type: "quick_reply",
      index: 0,
      parameters: [{ type: "payload", payload: "track-order" }],
    },
  ]);

  const media = await client.sendMedia({
    recipient: "254700123456",
    mediaType: "document",
    link: "https://example.com/menu.pdf",
    caption: "Menu",
    filename: "menu.pdf",
  });
  assert.equal(media.accepted, true);
  assert.deepEqual(JSON.parse(calls.at(-1).body).document, {
    link: "https://example.com/menu.pdf",
    caption: "Menu",
    filename: "menu.pdf",
  });

  const interactive = await client.sendInteractive({
    recipient: "254700123456",
    interactiveType: "button",
    bodyText: "Choose",
    buttons: [{ identifier: "yes", title: "Yes" }],
  });
  assert.equal(interactive.accepted, true);

  const productList = await client.sendProductList({
    recipient: "254700123456",
    catalogId: "catalog-1",
    header: { type: "text", text: "Featured" },
    sections: [{ title: "Top", productItems: [{ productRetailerId: "sku-1" }] }],
  });
  assert.equal(productList.messages[0].providerMessageId, "wamid.1");

  const flow = await client.sendFlow({
    recipient: "254700123456",
    flowCta: "Start",
    flowId: "flow-1",
  });
  assert.equal(flow.messages[0].providerMessageId, "wamid.1");

  const read = await client.markMessageRead({ messageId: "wamid.inbound.1" });
  assert.equal(read.success, true);
  assert.deepEqual(JSON.parse(calls.at(-1).body), {
    messaging_product: "whatsapp",
    status: "read",
    message_id: "wamid.inbound.1",
  });

  const typing = await client.sendTypingIndicator({ messageId: "wamid.inbound.2" });
  assert.equal(typing.messageId, "wamid.inbound.2");
  assert.deepEqual(JSON.parse(calls.at(-1).body), {
    messaging_product: "whatsapp",
    status: "read",
    message_id: "wamid.inbound.2",
    typing_indicator: { type: "text" },
  });

  const templates = await client.listTemplates({ limit: 10 });
  assert.equal(templates.templates[0].templateId, "tmpl-1");
  assert.equal((await client.getTemplate("tmpl-1")).name, "welcome");
  assert.equal(
    (
      await client.createTemplate({
        name: "welcome",
        language: "en_US",
        category: "utility",
      })
    ).templateId,
    "tmpl-1",
  );
  assert.equal((await client.updateTemplate("tmpl-1", { category: "utility" })).success, true);
  assert.equal((await client.deleteTemplate({ templateId: "tmpl-1" })).deleted, true);

  const uploaded = await client.uploadMedia({
    filename: "menu.pdf",
    mimeType: "application/pdf",
    content: Buffer.from("pdf"),
  });
  assert.equal(uploaded.mediaId, "media-1");
  assert.equal((await client.getMedia("media-1")).fileSize, 42);
  assert.equal((await client.deleteMedia("media-1")).deleted, true);

  const events = client.parseEvents({
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                {
                  id: "wamid.status.1",
                  status: "delivered",
                  recipient_id: "254700123456",
                  timestamp: "1710000000",
                },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(events[0].providerMessageId, "wamid.status.1");
  assert.equal(events[0].state, "delivered");

  const inbound = client.parseInboundMessages({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: {
                display_phone_number: "254700999999",
                phone_number_id: "123456789",
              },
              contacts: [
                {
                  wa_id: "254700123456",
                  profile: { name: "Alice" },
                },
              ],
              messages: [
                {
                  from: "254700123456",
                  id: "wamid.inbound.1",
                  type: "text",
                  timestamp: "1710000001",
                  text: { body: "Hi" },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(inbound[0].messageId, "wamid.inbound.1");
  assert.equal(inbound[0].text, "Hi");
  assert.equal(inbound[0].profileName, "Alice");
});

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
