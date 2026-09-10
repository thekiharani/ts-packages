/** A fetch double that records every call and answers from a route table. */
export function mockFetch(routes) {
  const calls = [];

  const impl = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers = new Headers(init.headers);
    calls.push({ url, init, headers, method: init.method ?? "GET", body: init.body });

    for (const [match, handler] of routes) {
      if (url.includes(match)) {
        return typeof handler === "function" ? handler({ url, init, headers }) : handler;
      }
    }

    throw new Error(`Unexpected request to ${url}`);
  };

  impl.calls = calls;
  impl.last = () => calls[calls.length - 1];
  impl.jsonBody = (index = calls.length - 1) => JSON.parse(calls[index].body);

  return impl;
}

export function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

export const tokenRoute = (token = "token-123", expiresIn = 3599) => [
  "token",
  () => json({ access_token: token, expires_in: expiresIn }),
];

export const oauthRoute = (token = "token-123") => [
  "/oauth/v1/generate",
  () => json({ access_token: token, expires_in: 3599 }),
];
