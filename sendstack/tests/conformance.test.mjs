// Route-drift conformance check.
//
// Introspects a live `Sendstack` instance - discovering every resource namespace
// and method dynamically - and captures the (HTTP method, path) each one calls.
// The captured set must equal the canonical contract in `conformance-routes.json`
// (byte-identical across the SendStack SDK packages). This fails loudly if a
// method is added, removed, or re-pointed at the wrong verb/path.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Sendstack from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SENTINEL = "__ID__";

function expectedRoutes() {
  const data = JSON.parse(readFileSync(join(HERE, "conformance-routes.json"), "utf8"));
  return new Set(data.routes.map((route) => `${route.method} ${route.path}`));
}

function normalize(path) {
  return path
    .split("/")
    .map((segment) => (segment === SENTINEL ? "{id}" : segment))
    .join("/");
}

// Positional args by method name: identifier-style methods receive the sentinel
// (it lands in the path); payload methods receive an empty body; batch needs an
// array; list takes none.
function argsFor(name) {
  if (name === "sendBatch") return [[]];
  if (name === "list") return [];
  if (name === "update") return [SENTINEL, {}];
  if (["get", "events", "cancel", "requeue", "verify", "retry", "remove"].includes(name)) {
    return [SENTINEL];
  }
  return [{}];
}

async function discoverActualRoutes() {
  let captured;
  const recordingFetch = async (input, init) => {
    captured = { method: init.method, path: new URL(String(input)).pathname };
    return new Response(JSON.stringify({ ok: true, data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const client = new Sendstack("conformance-token", { fetch: recordingFetch });
  const actual = new Set();

  for (const key of Object.keys(client)) {
    const resource = client[key];
    if (resource === null || typeof resource !== "object") continue; // skip token/baseUrl/timeoutMs
    for (const methodName of Object.keys(resource)) {
      const fn = resource[methodName];
      if (typeof fn !== "function") continue;
      captured = undefined;
      await fn(...argsFor(methodName));
      assert.ok(captured, `No request captured for ${key}.${methodName}`);
      actual.add(`${captured.method} ${normalize(captured.path)}`);
    }
  }

  return actual;
}

test("SDK routes match the canonical contract", async () => {
  const actual = await discoverActualRoutes();
  const expected = expectedRoutes();
  const missing = [...expected].filter((route) => !actual.has(route)).sort();
  const extra = [...actual].filter((route) => !expected.has(route)).sort();
  assert.deepEqual(missing, [], `Contract routes not implemented by the SDK: ${missing.join(", ")}`);
  assert.deepEqual(extra, [], `SDK exposes routes absent from the contract: ${extra.join(", ")}`);
});

test("contract has no duplicate routes", () => {
  const data = JSON.parse(readFileSync(join(HERE, "conformance-routes.json"), "utf8"));
  const pairs = data.routes.map((route) => `${route.method} ${route.path}`);
  assert.equal(pairs.length, new Set(pairs).size);
  assert.equal(pairs.length, 25);
});
