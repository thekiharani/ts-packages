import test from "node:test";
import assert from "node:assert/strict";

import { ValidationError, assertFields, validateFields } from "../dist/index.js";

const rules = {
  phoneNumber: { required: true, notEmpty: true, max: 12, pattern: /^254\d{9}$/, format: "2547XXXXXXXX" },
  amount: { required: true, numeric: true },
  orgShortCode: { required: true, max: 12 },
  sharedShortCode: { required: true, boolean: true },
  optional: { max: 3 },
};

test("validateFields reports every published constraint", () => {
  const errors = validateFields(
    {
      phoneNumber: "0712345678",
      amount: "abc",
      orgShortCode: "",
      sharedShortCode: "yes",
      optional: "abcd",
    },
    rules,
  );

  assert.ok(errors.some((e) => e.includes("[phoneNumber] is malformed")));
  assert.ok(errors.some((e) => e.includes("Expected format: 2547XXXXXXXX")));
  assert.ok(errors.some((e) => e === "[amount] must be numeric."));
  assert.ok(errors.some((e) => e.includes("[sharedShortCode] must be a boolean")));
  assert.ok(errors.some((e) => e.includes("[optional] must not exceed 3 characters, got 4")));
  assert.equal(
    errors.some((e) => e.includes("[orgShortCode]")),
    false,
    "required checks presence, not emptiness — a shared short code sends a blank value",
  );
});

test("validateFields accepts a valid payload", () => {
  assert.deepEqual(
    validateFields(
      { phoneNumber: "254712345678", amount: 10, orgShortCode: "", sharedShortCode: true },
      rules,
    ),
    [],
  );
});

test("validateFields distinguishes a missing key from a null value", () => {
  assert.deepEqual(validateFields({}, { a: { required: true } }), ["[a] is required."]);
  assert.deepEqual(validateFields({ a: null }, { a: { required: true } }), [
    "[a] is required and cannot be null.",
  ]);
});

test("assertFields throws ValidationError carrying the field list", () => {
  assert.throws(
    () => assertFields({ amount: "abc" }, { amount: { numeric: true } }, "Test"),
    (error) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.code, "VALIDATION_ERROR");
      assert.deepEqual(error.errors, ["[amount] must be numeric."]);
      assert.match(error.message, /Test payload is invalid/);
      return true;
    },
  );
});
