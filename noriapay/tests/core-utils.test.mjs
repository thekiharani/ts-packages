import test from "node:test";
import assert from "node:assert/strict";

import {
  amountToString,
  ipMatches,
  normalizeAmount,
  normalizeKenyanPhoneNumber,
  normalizeKenyanPhoneNumbers,
} from "../dist/index.js";
import { buildMpesaTimestamp } from "../dist/mpesa.js";

test("amountToString never leaks float rounding artefacts or exponent notation", () => {
  assert.equal(amountToString(0.1 + 0.2), "0.3");
  assert.equal(amountToString(100.5), "100.5");
  assert.equal(amountToString(100.0), "100");
  assert.equal(amountToString(1000), "1000");
  assert.equal(amountToString(1e21), "1000000000000000000000");
  assert.equal(amountToString(1e-7), "0.0000001");
  assert.equal(amountToString(-12.345), "-12.345");
  assert.equal(amountToString("250.00"), "250.00", "strings pass through untouched");
  assert.equal(amountToString(true), "1");
});

test("normalizeAmount rewrites Amount and amount, and honours the none opt-out", () => {
  assert.deepEqual(normalizeAmount({ Amount: 0.1 + 0.2, other: 1 }), {
    Amount: "0.3",
    other: 1,
  });
  assert.deepEqual(normalizeAmount({ amount: 10 }), { amount: "10" });
  assert.deepEqual(normalizeAmount({ Amount: 10 }, "none"), { Amount: 10 });
});

test("normalizeAmount leaves arrays alone rather than spreading them into an object", () => {
  const invoices = [{ Amount: 1 }, { Amount: 2 }];
  const result = normalizeAmount(invoices);

  assert.ok(Array.isArray(result));
  assert.deepEqual(result, invoices);
});

test("normalizeKenyanPhoneNumber rewrites local formats and leaves others alone", () => {
  assert.equal(normalizeKenyanPhoneNumber("0712345678"), "254712345678");
  assert.equal(normalizeKenyanPhoneNumber("712345678"), "254712345678");
  assert.equal(normalizeKenyanPhoneNumber("+254 712 345 678"), "254712345678");
  assert.equal(normalizeKenyanPhoneNumber("(254) 110-000-000"), "254110000000");
  assert.equal(normalizeKenyanPhoneNumber("254712345678"), "254712345678");
  assert.equal(normalizeKenyanPhoneNumber("0812345678"), "0812345678", "not a Kenyan mobile");
  assert.equal(normalizeKenyanPhoneNumber("not-a-number"), "not-a-number");
});

test("normalizeKenyanPhoneNumbers only touches the listed keys", () => {
  const payload = { PhoneNumber: "0712345678", AccountReference: "0712345678" };

  assert.deepEqual(normalizeKenyanPhoneNumbers(payload, ["PhoneNumber"]), {
    PhoneNumber: "254712345678",
    AccountReference: "0712345678",
  });
});

test("ipMatches supports exact addresses, CIDR blocks, IPv6, and wildcards", () => {
  assert.equal(ipMatches("52.31.139.75", "52.31.139.75"), true);
  assert.equal(ipMatches("52.31.139.76", "52.31.139.75"), false);
  assert.equal(ipMatches("52.31.139.75", "52.31.139.0/24"), true);
  assert.equal(ipMatches("52.31.140.1", "52.31.139.0/24"), false);
  assert.equal(ipMatches("10.1.2.3", "10.0.0.0/8"), true);
  assert.equal(ipMatches("2001:db8::1", "2001:db8::/32"), true);
  assert.equal(ipMatches("2001:db9::1", "2001:db8::/32"), false);
  assert.equal(ipMatches("::ffff:52.31.139.75", "::ffff:52.31.139.75"), true);
  assert.equal(ipMatches("1.2.3.4", "*"), true);
  assert.equal(ipMatches("1.2.3.4", "not-an-ip"), false);
  assert.equal(ipMatches("", "1.2.3.4"), false);
});

test("buildMpesaTimestamp uses Africa/Nairobi, not the host clock", () => {
  const instant = new Date("2026-09-10T21:30:00Z");

  assert.equal(buildMpesaTimestamp(instant), "20260911003000");
  assert.equal(buildMpesaTimestamp(instant, "UTC"), "20260910213000");
});
