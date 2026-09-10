# Fix: sanitizer flattens Errors, dropping `cause` and custom fields

Status: **not yet done** — writeup for later action.

## Problem

`src/redaction.ts` → `sanitizeValue` (lines ~31–37) hardcodes the Error case:

```ts
if (value instanceof Error) {
  return { name: value.name, message: value.message, stack: value.stack };
}
```

It returns three fields and stops, so it silently drops:

- **`cause`** — the entire wrapped-error chain.
- **All own-enumerable custom properties** — e.g. Drizzle `query`/`params`, Postgres `code`/`constraint_name`/`detail`, a typed error's `statusCode`, HTTP-client error fields.

This degrades error logs for **every** consumer of the package (billing, wacrm, and the other ~20 norialabs services). Real-world impact seen in billing: a Drizzle `DrizzleQueryError` carrying the failing Postgres error on `.cause` logged only "Failed query…" — the SQLSTATE, constraint name, table, and detail were all lost, so a duplicate-key failure was indistinguishable from any other 500.

Secondary artifact: because the sanitize hook flattens the Error to a plain object **before** pino's own `err` serializer runs, the emitted line shows `type: "Object"` instead of the real error class name (double-processing).

## Fix (minimal, low-risk)

In the Error branch: keep the non-enumerable `name`/`message`/`stack`, merge own-enumerable custom props (each recursively sanitized + redacted), and follow `cause` — all under the existing `seen` WeakSet plus a small depth bound so a cyclic `cause` can't spin.

```ts
if (value instanceof Error) {
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  const out: Record<string, unknown> = {
    name: value.name,
    message: value.message,
    stack: value.stack,
  };
  for (const [k, v] of Object.entries(value)) {
    // custom enumerable fields
    out[k] = shouldRedact(k)
      ? "[REDACTED]"
      : sanitizeValue(v, shouldRedact, seen);
  }
  if (value.cause != null && !("cause" in out)) {
    out.cause = sanitizeValue(value.cause, shouldRedact, seen);
  }
  seen.delete(value);
  return out;
}
```

Note: `name`/`message`/`stack` are non-enumerable, so `Object.entries` won't include them — they must stay explicit.

## Fix (cleaner, larger)

Stop flattening Errors in the `hooks.logMethod` sanitizer entirely; instead register pino's `serializers: { err: pino.stdSerializers.errWithCause }` and let pino own error serialization (with `cause`), while the sanitize hook only handles redaction of non-Error values. This also removes the `type:"Object"` artifact. More surgery than the minimal fix — do only if touching the pino wiring anyway.

## Redaction must be preserved

The default redact pattern (`token|secret|key|password|passkey|authorization|dsn|credential|api_key`) already runs on object keys. When spreading custom error fields, route **every** key through `shouldRedact` — some error objects carry sensitive fields (e.g. `config.headers.authorization` on an HTTP-client error). Do not blanket-copy without redaction.

## Rollout

- Edit `src/redaction.ts`, rebuild `dist/` (consumers load `dist/index.js`), bump version, republish.
- Version drift: source is at **0.1.10**; billing pins **0.1.8**. Review the 0.1.8→0.1.10 diff first, then bump each consumer to the fixed version.
- Add tests under `tests/`: Error with `cause` + custom fields → both preserved; redaction still applied to nested error fields; circular `cause` guarded; non-enumerable name/message/stack still present.
- Shared package = wide blast radius. Land + release before bumping consumers.

## Billing-side workarounds (keep)

Billing already front-runs this in `apps/api`:

- `src/lib/pg-error.ts` — `findPgError` (unwraps `.cause` to the driver error), `causeChain`, `pgErrorDetails`.
- `src/server.ts` global error handler + `src/lib/error-response.ts` — logs cause/pgError as **plain fields** (which survive the current sanitizer).

These stay useful and harmless after the package fix (they don't depend on it) and keep prod traceable until every consumer upgrades. No need to unwind them.
