import { getEnvNumber, getOptionalEnv, getRequiredEnv } from "../../core/config";
import { ConfigurationError } from "../../core/errors";
import { HttpClient } from "../../core/http";
import type {
  PaystackApiResponse,
  PaystackClientOptions,
  PaystackCreateTransferRecipientRequest,
  PaystackCreateTransferRecipientResponse,
  PaystackFinalizeTransferRequest,
  PaystackFinalizeTransferResponse,
  PaystackFromEnvOptions,
  PaystackInitializeTransactionRequest,
  PaystackInitializeTransactionResponse,
  PaystackInitiateTransferRequest,
  PaystackInitiateTransferResponse,
  PaystackListBanksQuery,
  PaystackListBanksResponse,
  PaystackRequestOptions,
  PaystackResolveAccountResponse,
  PaystackVerifyTransactionResponse,
  PaystackVerifyTransferResponse,
} from "./types";

export const PAYSTACK_BASE_URL = "https://api.paystack.co";

export class PaystackClient {
  static fromEnv(options: PaystackFromEnvOptions = {}): PaystackClient {
    const prefix = options.prefix ?? "PAYSTACK_";
    const env = options.env;

    return new PaystackClient({
      secretKey: getRequiredEnv(`${prefix}SECRET_KEY`, env),
      baseUrl: options.baseUrl ?? getOptionalEnv(`${prefix}BASE_URL`, env),
      fetch: options.fetch,
      timeoutMs: options.timeoutMs ?? getEnvNumber(`${prefix}TIMEOUT_SECONDS`, env),
      defaultHeaders: options.defaultHeaders,
      retry: options.retry,
      hooks: options.hooks,
    });
  }

  private readonly http: HttpClient;
  private readonly secretKey: string;

  constructor(options: PaystackClientOptions) {
    if (!options.secretKey) {
      throw new ConfigurationError("PaystackClient requires secretKey.");
    }

    this.secretKey = options.secretKey;
    this.http = new HttpClient({
      baseUrl: options.baseUrl ?? PAYSTACK_BASE_URL,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs,
      defaultHeaders: options.defaultHeaders,
      retry: options.retry,
      hooks: options.hooks,
    });
  }

  async initializeTransaction(
    request: PaystackInitializeTransactionRequest,
    options?: PaystackRequestOptions,
  ): Promise<PaystackInitializeTransactionResponse> {
    return this.request("/transaction/initialize", "POST", {
      payload: request,
      options,
    });
  }

  async verifyTransaction(
    reference: string,
    options?: PaystackRequestOptions,
  ): Promise<PaystackVerifyTransactionResponse> {
    return this.request(`/transaction/verify/${encodeURIComponent(reference)}`, "GET", { options });
  }

  async listBanks(
    query?: PaystackListBanksQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackListBanksResponse> {
    return this.request("/bank", "GET", { query, options });
  }

  async resolveAccount(
    input: { accountNumber: string; bankCode: string },
    options?: PaystackRequestOptions,
  ): Promise<PaystackResolveAccountResponse> {
    return this.request("/bank/resolve", "GET", {
      query: {
        account_number: input.accountNumber,
        bank_code: input.bankCode,
      },
      options,
    });
  }

  async createTransferRecipient(
    request: PaystackCreateTransferRecipientRequest,
    options?: PaystackRequestOptions,
  ): Promise<PaystackCreateTransferRecipientResponse> {
    return this.request("/transferrecipient", "POST", {
      payload: request,
      options,
    });
  }

  async initiateTransfer(
    request: PaystackInitiateTransferRequest,
    options?: PaystackRequestOptions,
  ): Promise<PaystackInitiateTransferResponse> {
    return this.request("/transfer", "POST", {
      payload: request,
      options,
    });
  }

  async finalizeTransfer(
    request: PaystackFinalizeTransferRequest,
    options?: PaystackRequestOptions,
  ): Promise<PaystackFinalizeTransferResponse> {
    return this.request("/transfer/finalize_transfer", "POST", {
      payload: request,
      options,
    });
  }

  async verifyTransfer(
    reference: string,
    options?: PaystackRequestOptions,
  ): Promise<PaystackVerifyTransferResponse> {
    return this.request(`/transfer/verify/${encodeURIComponent(reference)}`, "GET", { options });
  }

  private async request<T extends PaystackApiResponse>(
    path: string,
    method: "GET" | "POST",
    input: {
      options?: PaystackRequestOptions;
      query?: Record<string, string | number | boolean | null | undefined>;
      payload?: Record<string, unknown>;
    },
  ): Promise<T> {
    const headers = new Headers(input.options?.headers);
    headers.set("authorization", `Bearer ${input.options?.accessToken ?? this.secretKey}`);
    headers.set("accept", "application/json");

    return this.http.request<T>({
      path,
      method,
      headers,
      query: input.query,
      body: input.payload,
      signal: input.options?.signal,
      timeoutMs: input.options?.timeoutMs,
      retry: input.options?.retry,
    });
  }
}
