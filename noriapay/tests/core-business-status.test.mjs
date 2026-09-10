import test from "node:test";
import assert from "node:assert/strict";

import {
  BusinessError,
  assertBusinessSuccess,
  businessStatusCode,
  businessStatusMessage,
  businessSucceeded,
} from "../dist/index.js";

test("M-PESA business outcomes are read from a 200 body", () => {
  assert.equal(businessSucceeded("mpesa", { ResponseCode: "0" }), true);
  assert.equal(businessSucceeded("mpesa", { ResponseCode: "1" }), false);
  assert.equal(businessSucceeded("mpesa", { errorCode: "500.001.1001" }), false);
  assert.equal(businessSucceeded("mpesa", { Body: { stkCallback: { ResultCode: 1032 } } }), false);
  assert.equal(businessSucceeded("mpesa", { Body: { stkCallback: { ResultCode: 0 } } }), true);
});

test("SasaPay, Paystack, and KCB Buni outcomes each use their own marker", () => {
  assert.equal(businessSucceeded("sasapay", { status: true }), true);
  assert.equal(businessSucceeded("sasapay", { status: false }), false);
  assert.equal(businessSucceeded("sasapay", { statusCode: "0" }), true);
  assert.equal(businessSucceeded("paystack", { status: false }), false);
  assert.equal(businessSucceeded("kcb_buni", { header: { statusCode: "0" } }), true);
  assert.equal(businessSucceeded("kcb_buni", { header: { statusCode: "1" } }), false);
});

test("a Buni reply carrying two verdicts requires both to be zero", () => {
  assert.equal(
    businessSucceeded("kcb_buni", {
      header: { statusCode: "0" },
      response: { ResponseCode: "0" },
    }),
    true,
  );
  assert.equal(
    businessSucceeded("kcb_buni", {
      header: { statusCode: "0" },
      response: { ResponseCode: "1" },
    }),
    false,
    "the gateway accepted it but Safaricom did not",
  );
});

test("an unrecognised shape is undefined, never a failure", () => {
  assert.equal(businessSucceeded("mpesa", { something: "else" }), undefined);
  assert.equal(businessSucceeded("sasapay", "a string"), undefined);
  assert.equal(businessSucceeded("kcb_buni", {}), undefined);
  assert.equal(businessSucceeded("paystack", null), undefined);
});

test("status code and message are read through each provider's key paths", () => {
  assert.equal(businessStatusCode("mpesa", { errorCode: "500.001" }), "500.001");
  assert.equal(
    businessStatusMessage("mpesa", { errorMessage: "Invalid Access Token" }),
    "Invalid Access Token",
  );
  assert.equal(businessStatusMessage("sasapay", { detail: "Insufficient funds" }), "Insufficient funds");
  assert.equal(
    businessStatusMessage("kcb_buni", { header: { statusMessage: "Duplicate reference" } }),
    "Duplicate reference",
  );
});

test("assertBusinessSuccess throws only on a definite failure", () => {
  assert.doesNotThrow(() => assertBusinessSuccess("mpesa", { ResponseCode: "0" }, "ctx"));
  assert.doesNotThrow(() => assertBusinessSuccess("mpesa", { unknown: true }, "ctx"));

  assert.throws(
    () => assertBusinessSuccess("mpesa", { ResponseCode: "1", ResponseDescription: "Declined" }, "STK push"),
    (error) => {
      assert.ok(error instanceof BusinessError);
      assert.equal(error.provider, "mpesa");
      assert.equal(error.statusCode, "1");
      assert.equal(error.message, "STK push failed: Declined (status 1)");
      assert.deepEqual(error.responseBody, { ResponseCode: "1", ResponseDescription: "Declined" });
      return true;
    },
  );
});
