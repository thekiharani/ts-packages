import { AuthenticationError } from "./errors";
import type {
  AccessTokenProvider,
  FetchLike,
  HttpMethod,
  JsonObject,
  QueryParams,
  TokenStore,
} from "./types";
import { appendQuery, encodeBasicAuth, getFetch, toJsonObject } from "./utils";

export interface AccessToken {
  accessToken: string;
  expiresIn: number;
  tokenType?: string;
  scope?: string;
  raw: JsonObject;
}

export class StaticAccessTokenProvider implements AccessTokenProvider {
  constructor(private readonly token: string) {}

  async getAccessToken(): Promise<string> {
    return this.token;
  }
}

export interface ClientCredentialsTokenProviderOptions {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  query?: QueryParams;
  body?: Record<string, string>;
  method?: Extract<HttpMethod, "GET" | "POST">;
  asForm?: boolean;
  cacheSkewMs?: number;
  mapResponse?: (payload: JsonObject) => AccessToken;
}

export class ClientCredentialsTokenProvider implements AccessTokenProvider {
  private readonly fetchImpl: FetchLike;
  private readonly tokenUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly timeoutMs?: number;
  private readonly query?: QueryParams;
  private readonly body?: Record<string, string>;
  private readonly method: "GET" | "POST";
  private readonly asForm: boolean;
  private readonly cacheSkewMs: number;
  private readonly mapResponse: (payload: JsonObject) => AccessToken;
  private cached?: { accessToken: AccessToken; expiresAt: number };
  private inFlight?: Promise<AccessToken>;

  constructor(options: ClientCredentialsTokenProviderOptions) {
    this.fetchImpl = getFetch(options.fetch);
    this.tokenUrl = options.tokenUrl;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.timeoutMs = options.timeoutMs;
    this.query = options.query;
    this.body = options.body;
    this.method = options.method ?? "GET";
    this.asForm = options.asForm ?? false;
    this.cacheSkewMs = options.cacheSkewMs ?? 60_000;
    this.mapResponse = options.mapResponse ?? defaultTokenMapper;
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    const token = await this.getToken(forceRefresh);
    return token.accessToken;
  }

  async getToken(forceRefresh = false): Promise<AccessToken> {
    if (!forceRefresh && this.cached && Date.now() < this.cached.expiresAt) {
      return this.cached.accessToken;
    }

    if (!this.inFlight) {
      const pending = this.fetchToken().finally(() => {
        if (this.inFlight === pending) {
          this.inFlight = undefined;
        }
      });

      this.inFlight = pending;
    }

    return this.inFlight;
  }

  clearCache(): void {
    this.cached = undefined;
  }

  private async fetchToken(): Promise<AccessToken> {
    const headers = new Headers({
      authorization: `Basic ${encodeBasicAuth(this.clientId, this.clientSecret)}`,
      accept: "application/json",
    });

    const controller = this.timeoutMs ? new AbortController() : undefined;
    const timeoutHandle = controller
      ? setTimeout(() => controller.abort(), this.timeoutMs)
      : undefined;

    try {
      const init: RequestInit = {
        method: this.method,
        headers,
        signal: controller?.signal,
      };

      if (this.method === "POST") {
        const body = this.body ?? {};

        if (this.asForm) {
          headers.set("content-type", "application/x-www-form-urlencoded");
          init.body = new URLSearchParams(body).toString();
        } else {
          headers.set("content-type", "application/json");
          init.body = JSON.stringify(body);
        }
      }

      const response = await this.fetchImpl(appendQuery(this.tokenUrl, this.query), init);
      const payload = toJsonObject(await safeJson(response)) as JsonObject;

      if (!response.ok) {
        throw new AuthenticationError("Authentication request failed.", {
          details: payload,
        });
      }

      const token = this.mapResponse(payload);

      if (!token.accessToken) {
        throw new AuthenticationError("Authentication response contained no access token.", {
          details: payload,
        });
      }

      const ttlMs = Math.max(0, token.expiresIn * 1000 - this.cacheSkewMs);
      this.cached = {
        accessToken: token,
        expiresAt: Date.now() + ttlMs,
      };

      return token;
    } catch (error) {
      if (controller?.signal.aborted) {
        throw new AuthenticationError("Authentication request timed out.", { cause: error });
      }

      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError("Unable to obtain access token.", { cause: error });
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}

export interface CachedAccessTokenProviderOptions {
  provider: AccessTokenProvider;
  store: TokenStore;
  cacheKey: string;
  cacheSkewSeconds?: number;
  cacheTtlSeconds?: number;
}

export class CachedAccessTokenProvider implements AccessTokenProvider {
  private readonly provider: AccessTokenProvider;
  private readonly store: TokenStore;
  private readonly cacheKey: string;
  private readonly cacheSkewSeconds: number;
  private readonly cacheTtlSeconds?: number;

  constructor(options: CachedAccessTokenProviderOptions) {
    this.provider = options.provider;
    this.store = options.store;
    this.cacheKey = options.cacheKey;
    this.cacheSkewSeconds = options.cacheSkewSeconds ?? 60;
    this.cacheTtlSeconds = options.cacheTtlSeconds;
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh) {
      const cached = await this.store.get(this.cacheKey);

      if (typeof cached === "string" && cached !== "") {
        return cached;
      }
    }

    if (this.provider instanceof ClientCredentialsTokenProvider) {
      const token = await this.provider.getToken(forceRefresh);
      const ttl = this.resolveTtl(token.expiresIn);

      if (ttl > 0) {
        await this.store.set(this.cacheKey, token.accessToken, ttl);
      }

      return token.accessToken;
    }

    const accessToken = await this.provider.getAccessToken(forceRefresh);
    const ttl = this.resolveTtl(undefined);

    if (ttl > 0) {
      await this.store.set(this.cacheKey, accessToken, ttl);
    }

    return accessToken;
  }

  async clearCache(): Promise<void> {
    await this.store.delete(this.cacheKey);

    if (this.provider instanceof ClientCredentialsTokenProvider) {
      this.provider.clearCache();
    }
  }

  private resolveTtl(expiresIn: number | undefined): number {
    if (this.cacheTtlSeconds !== undefined) {
      return Math.max(0, this.cacheTtlSeconds - this.cacheSkewSeconds);
    }

    if (expiresIn === undefined) {
      return 0;
    }

    return Math.max(0, expiresIn - this.cacheSkewSeconds);
  }
}

export class MemoryTokenStore implements TokenStore {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  get(key: string): string | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: string, ttlSeconds: number): void {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }
}

export function defaultTokenMapper(payload: JsonObject): AccessToken {
  return {
    accessToken: typeof payload["access_token"] === "string" ? payload["access_token"] : "",
    expiresIn: Number(payload["expires_in"] ?? 0),
    tokenType: typeof payload["token_type"] === "string" ? payload["token_type"] : undefined,
    scope: typeof payload["scope"] === "string" ? payload["scope"] : undefined,
    raw: payload,
  };
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}
