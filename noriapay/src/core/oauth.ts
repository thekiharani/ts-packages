import { AuthenticationError } from "./errors";
import type { AccessTokenProvider, FetchLike, JsonObject } from "./types";
import { appendQuery, encodeBasicAuth, getFetch, toJsonObject } from "./utils";

export interface AccessToken {
  accessToken: string;
  expiresIn: number;
  tokenType?: string;
  scope?: string;
  raw: JsonObject;
}

export interface ClientCredentialsTokenProviderOptions {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  query?: Record<string, string | number | boolean | null | undefined>;
  cacheSkewMs?: number;
  mapResponse: (payload: JsonObject) => AccessToken;
}

export class ClientCredentialsTokenProvider implements AccessTokenProvider {
  private readonly fetchImpl: FetchLike;
  private readonly tokenUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly timeoutMs?: number;
  private readonly query?: Record<string, string | number | boolean | null | undefined>;
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
    this.cacheSkewMs = options.cacheSkewMs ?? 60_000;
    this.mapResponse = options.mapResponse;
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
      this.inFlight = this.fetchToken();
    }

    try {
      return await this.inFlight;
    } finally {
      this.inFlight = undefined;
    }
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
      const response = await this.fetchImpl(appendQuery(this.tokenUrl, this.query), {
        method: "GET",
        headers,
        signal: controller?.signal,
      });

      const payload = toJsonObject(await response.json()) as JsonObject;

      if (!response.ok) {
        throw new AuthenticationError("Authentication request failed.", {
          details: payload,
        });
      }

      const token = this.mapResponse(payload);
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
