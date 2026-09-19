import {
  businessStatusCode,
  businessStatusMessage,
  businessSucceeded,
} from "../../core/business-status";
import {
  getEnvBoolean,
  getEnvSecondsAsMs,
  getOptionalEnv,
  getRequiredEnv,
} from "../../core/config";
import { ConfigurationError } from "../../core/errors";
import { StaticAccessTokenProvider } from "../../core/oauth";
import { ProviderClient, fillPath } from "../../core/provider-client";
import type { AccessTokenProvider, QueryParams } from "../../core/types";
import type {
  PaystackApiResponse,
  PaystackClientOptions,
  PaystackCreateTransferRecipientRequest,
  PaystackCreateTransferRecipientResponse,
  PaystackEndpointName,
  PaystackFinalizeTransferRequest,
  PaystackFinalizeTransferResponse,
  PaystackFromEnvOptions,
  PaystackHttpMethod,
  PaystackInitializeTransactionRequest,
  PaystackInitializeTransactionResponse,
  PaystackInitiateTransferRequest,
  PaystackInitiateTransferResponse,
  PaystackListBanksQuery,
  PaystackListBanksResponse,
  PaystackPayload,
  PaystackQuery,
  PaystackRequestOptions,
  PaystackResolveAccountResponse,
  PaystackVerifyTransactionResponse,
  PaystackVerifyTransferResponse,
} from "./types";

export const PAYSTACK_BASE_URL = "https://api.paystack.co";

export const PAYSTACK_ENDPOINTS = {
  initializeTransaction: ["POST", "/transaction/initialize"],
  chargeAuthorization: ["POST", "/transaction/charge_authorization"],
  partialDebit: ["POST", "/transaction/partial_debit"],
  verifyTransaction: ["GET", "/transaction/verify/{reference}"],
  listTransactions: ["GET", "/transaction"],
  fetchTransaction: ["GET", "/transaction/{id}"],
  transactionTimeline: ["GET", "/transaction/timeline/{id}"],
  transactionTotals: ["GET", "/transaction/totals"],
  exportTransactions: ["GET", "/transaction/export"],
  createCharge: ["POST", "/charge"],
  submitChargePin: ["POST", "/charge/submit_pin"],
  submitChargeOtp: ["POST", "/charge/submit_otp"],
  submitChargePhone: ["POST", "/charge/submit_phone"],
  submitChargeBirthday: ["POST", "/charge/submit_birthday"],
  submitChargeAddress: ["POST", "/charge/submit_address"],
  checkPendingCharge: ["GET", "/charge/{reference}"],
  requeryCapitecPayCharge: ["POST", "/capitec-pay/requery/{ref}"],
  initiateBulkCharge: ["POST", "/bulkcharge"],
  listBulkChargeBatches: ["GET", "/bulkcharge"],
  fetchBulkChargeBatch: ["GET", "/bulkcharge/{code}"],
  fetchBulkChargeBatchCharges: ["GET", "/bulkcharge/{code}/charges"],
  pauseBulkChargeBatch: ["GET", "/bulkcharge/pause/{code}"],
  resumeBulkChargeBatch: ["GET", "/bulkcharge/resume/{code}"],
  createSubaccount: ["POST", "/subaccount"],
  listSubaccounts: ["GET", "/subaccount"],
  fetchSubaccount: ["GET", "/subaccount/{code}"],
  updateSubaccount: ["PUT", "/subaccount/{code}"],
  createSplit: ["POST", "/split"],
  listSplits: ["GET", "/split"],
  fetchSplit: ["GET", "/split/{id}"],
  updateSplit: ["PUT", "/split/{id}"],
  addSubaccountToSplit: ["POST", "/split/{id}/subaccount/add"],
  removeSubaccountFromSplit: ["POST", "/split/{id}/subaccount/remove"],
  sendTerminalEvent: ["POST", "/terminal/{id}/event"],
  fetchTerminalEventStatus: ["GET", "/terminal/{terminal_id}/event/{event_id}"],
  fetchTerminalStatus: ["GET", "/terminal/{terminal_id}/presence"],
  listTerminals: ["GET", "/terminal"],
  fetchTerminal: ["GET", "/terminal/{terminal_id}"],
  updateTerminal: ["PUT", "/terminal/{terminal_id}"],
  commissionTerminal: ["POST", "/terminal/commission_device"],
  decommissionTerminal: ["POST", "/terminal/decommission_device"],
  createVirtualTerminal: ["POST", "/virtual_terminal"],
  listVirtualTerminals: ["GET", "/virtual_terminal"],
  fetchVirtualTerminal: ["GET", "/virtual_terminal/{code}"],
  updateVirtualTerminal: ["PUT", "/virtual_terminal/{code}"],
  deactivateVirtualTerminal: ["PUT", "/virtual_terminal/{code}/deactivate"],
  assignVirtualTerminalDestination: ["POST", "/virtual_terminal/{code}/destination/assign"],
  unassignVirtualTerminalDestination: ["POST", "/virtual_terminal/{code}/destination/unassign"],
  addVirtualTerminalSplitCode: ["PUT", "/virtual_terminal/{code}/split_code"],
  removeVirtualTerminalSplitCode: ["DELETE", "/virtual_terminal/{code}/split_code"],
  createCustomer: ["POST", "/customer"],
  listCustomers: ["GET", "/customer"],
  fetchCustomer: ["GET", "/customer/{code}"],
  updateCustomer: ["PUT", "/customer/{code}"],
  setCustomerRiskAction: ["POST", "/customer/set_risk_action"],
  validateCustomer: ["POST", "/customer/{code}/identification"],
  initializeAuthorization: ["POST", "/customer/authorization/initialize"],
  verifyAuthorization: ["GET", "/customer/authorization/verify/{reference}"],
  deactivateAuthorization: ["POST", "/customer/authorization/deactivate"],
  initializeDirectDebit: ["POST", "/customer/{id}/initialize-direct-debit"],
  customerDirectDebitActivationCharge: ["PUT", "/customer/{id}/directdebit-activation-charge"],
  customerDirectDebitMandateAuthorizations: ["GET", "/customer/{id}/directdebit-mandate-authorizations"],
  triggerDirectDebitActivationCharge: ["PUT", "/directdebit/activation-charge"],
  listDirectDebitMandateAuthorizations: ["GET", "/directdebit/mandate-authorizations"],
  createDedicatedAccount: ["POST", "/dedicated_account"],
  listDedicatedAccounts: ["GET", "/dedicated_account"],
  assignDedicatedAccount: ["POST", "/dedicated_account/assign"],
  fetchDedicatedAccount: ["GET", "/dedicated_account/{id}"],
  deactivateDedicatedAccount: ["DELETE", "/dedicated_account/{id}"],
  requeryDedicatedAccount: ["GET", "/dedicated_account/requery"],
  splitDedicatedAccountTransaction: ["POST", "/dedicated_account/split"],
  removeSplitFromDedicatedAccount: ["DELETE", "/dedicated_account/split"],
  fetchDedicatedAccountProviders: ["GET", "/dedicated_account/available_providers"],
  registerApplePayDomain: ["POST", "/apple-pay/domain"],
  listApplePayDomains: ["GET", "/apple-pay/domain"],
  unregisterApplePayDomain: ["DELETE", "/apple-pay/domain"],
  createPlan: ["POST", "/plan"],
  listPlans: ["GET", "/plan"],
  fetchPlan: ["GET", "/plan/{code}"],
  updatePlan: ["PUT", "/plan/{code}"],
  createSubscription: ["POST", "/subscription"],
  listSubscriptions: ["GET", "/subscription"],
  fetchSubscription: ["GET", "/subscription/{code}"],
  disableSubscription: ["POST", "/subscription/disable"],
  enableSubscription: ["POST", "/subscription/enable"],
  subscriptionManagementLink: ["GET", "/subscription/{code}/manage/link"],
  sendSubscriptionManagementEmail: ["POST", "/subscription/{code}/manage/email"],
  createTransferRecipient: ["POST", "/transferrecipient"],
  listTransferRecipients: ["GET", "/transferrecipient"],
  bulkCreateTransferRecipients: ["POST", "/transferrecipient/bulk"],
  fetchTransferRecipient: ["GET", "/transferrecipient/{code}"],
  updateTransferRecipient: ["PUT", "/transferrecipient/{code}"],
  deleteTransferRecipient: ["DELETE", "/transferrecipient/{code}"],
  initiateTransfer: ["POST", "/transfer"],
  listTransfers: ["GET", "/transfer"],
  finalizeTransfer: ["POST", "/transfer/finalize_transfer"],
  initiateBulkTransfer: ["POST", "/transfer/bulk"],
  fetchTransfer: ["GET", "/transfer/{code}"],
  verifyTransfer: ["GET", "/transfer/verify/{reference}"],
  exportTransfers: ["GET", "/transfer/export"],
  resendTransferOtp: ["POST", "/transfer/resend_otp"],
  disableTransferOtp: ["POST", "/transfer/disable_otp"],
  finalizeDisableTransferOtp: ["POST", "/transfer/disable_otp_finalize"],
  enableTransferOtp: ["POST", "/transfer/enable_otp"],
  balance: ["GET", "/balance"],
  balanceLedger: ["GET", "/balance/ledger"],
  createPaymentRequest: ["POST", "/paymentrequest"],
  listPaymentRequests: ["GET", "/paymentrequest"],
  fetchPaymentRequest: ["GET", "/paymentrequest/{id}"],
  updatePaymentRequest: ["PUT", "/paymentrequest/{id}"],
  verifyPaymentRequest: ["GET", "/paymentrequest/verify/{id}"],
  notifyPaymentRequest: ["POST", "/paymentrequest/notify/{id}"],
  paymentRequestTotals: ["GET", "/paymentrequest/totals"],
  finalizePaymentRequest: ["POST", "/paymentrequest/finalize/{id}"],
  archivePaymentRequest: ["POST", "/paymentrequest/archive/{id}"],
  createProduct: ["POST", "/product"],
  listProducts: ["GET", "/product"],
  fetchProduct: ["GET", "/product/{id}"],
  updateProduct: ["PUT", "/product/{id}"],
  deleteProduct: ["DELETE", "/product/{id}"],
  createStorefront: ["POST", "/storefront"],
  listStorefronts: ["GET", "/storefront"],
  fetchStorefront: ["GET", "/storefront/{id}"],
  updateStorefront: ["PUT", "/storefront/{id}"],
  deleteStorefront: ["DELETE", "/storefront/{id}"],
  verifyStorefront: ["GET", "/storefront/verify/{slug}"],
  listStorefrontOrders: ["GET", "/storefront/{id}/order"],
  addStorefrontProducts: ["POST", "/storefront/{id}/product"],
  listStorefrontProducts: ["GET", "/storefront/{id}/product"],
  publishStorefront: ["POST", "/storefront/{id}/publish"],
  duplicateStorefront: ["POST", "/storefront/{id}/duplicate"],
  createOrder: ["POST", "/order"],
  listOrders: ["GET", "/order"],
  fetchOrder: ["GET", "/order/{id}"],
  listProductOrders: ["GET", "/order/product/{id}"],
  validateOrder: ["GET", "/order/{code}/validate"],
  createPage: ["POST", "/page"],
  listPages: ["GET", "/page"],
  fetchPage: ["GET", "/page/{id}"],
  updatePage: ["PUT", "/page/{id}"],
  checkSlugAvailability: ["GET", "/page/check_slug_availability/{slug}"],
  addProductsToPage: ["POST", "/page/{id}/product"],
  listSettlements: ["GET", "/settlement"],
  listSettlementTransactions: ["GET", "/settlement/{id}/transactions"],
  fetchPaymentSessionTimeout: ["GET", "/integration/payment_session_timeout"],
  updatePaymentSessionTimeout: ["PUT", "/integration/payment_session_timeout"],
  createRefund: ["POST", "/refund"],
  listRefunds: ["GET", "/refund"],
  retryRefundWithCustomerDetails: ["POST", "/refund/retry_with_customer_details/{id}"],
  fetchRefund: ["GET", "/refund/{id}"],
  listDisputes: ["GET", "/dispute"],
  fetchDispute: ["GET", "/dispute/{id}"],
  updateDispute: ["PUT", "/dispute/{id}"],
  disputeUploadUrl: ["GET", "/dispute/{id}/upload_url"],
  exportDisputes: ["GET", "/dispute/export"],
  transactionDisputes: ["GET", "/dispute/transaction/{id}"],
  resolveDispute: ["PUT", "/dispute/{id}/resolve"],
  addDisputeEvidence: ["POST", "/dispute/{id}/evidence"],
  listBanks: ["GET", "/bank"],
  resolveBankAccount: ["GET", "/bank/resolve"],
  validateBankAccount: ["POST", "/bank/validate"],
  resolveCardBin: ["GET", "/decision/bin/{bin}"],
  listCountries: ["GET", "/country"],
  listAddressVerificationStates: ["GET", "/address_verification/states"],
} as const satisfies Record<string, readonly [PaystackHttpMethod, string]>;

export class PaystackClient extends ProviderClient {
  static fromEnv(options: PaystackFromEnvOptions = {}): PaystackClient {
    const prefix = options.prefix ?? "PAYSTACK_";
    const env = options.env;

    return new PaystackClient({
      secretKey:
        options.secretKey ??
        (options.tokenProvider
          ? getOptionalEnv(`${prefix}SECRET_KEY`, env)
          : getRequiredEnv(`${prefix}SECRET_KEY`, env)),
      publicKey: options.publicKey ?? getOptionalEnv(`${prefix}PUBLIC_KEY`, env),
      baseUrl: options.baseUrl ?? getOptionalEnv(`${prefix}BASE_URL`, env),
      fetch: options.fetch,
      timeoutMs: options.timeoutMs ?? getEnvSecondsAsMs(`${prefix}TIMEOUT_SECONDS`, env),
      defaultHeaders: options.defaultHeaders,
      retry: options.retry,
      hooks: options.hooks,
      endpoints: options.endpoints,
      throwOnBusinessError:
        options.throwOnBusinessError ?? getEnvBoolean(`${prefix}THROW_ON_BUSINESS_ERROR`, env),
      tokenProvider: options.tokenProvider,
    });
  }

  static succeeded(response: unknown): boolean | undefined {
    return businessSucceeded("paystack", response);
  }

  static statusCode(response: unknown): string | undefined {
    return businessStatusCode("paystack", response);
  }

  static statusMessage(response: unknown): string | undefined {
    return businessStatusMessage("paystack", response);
  }

  readonly publicKey?: string;

  private readonly endpointMap: Record<PaystackEndpointName, readonly [PaystackHttpMethod, string]>;

  constructor(options: PaystackClientOptions) {
    if (!options.secretKey && !options.tokenProvider) {
      throw new ConfigurationError("PaystackClient requires secretKey or a tokenProvider.");
    }

    super({
      baseUrl: options.baseUrl ?? PAYSTACK_BASE_URL,
      provider: "paystack",
      tokens: resolvePaystackTokenProvider(options),
      fetch: options.fetch,
      timeoutMs: options.timeoutMs,
      defaultHeaders: options.defaultHeaders,
      retry: options.retry,
      hooks: options.hooks,
      throwOnBusinessError: options.throwOnBusinessError,
    });

    this.publicKey = options.publicKey;
    this.endpointMap = resolvePaystackEndpoints(options.endpoints);
  }

  endpoint(name: PaystackEndpointName): readonly [PaystackHttpMethod, string] {
    return this.endpointMap[name];
  }

  async initializeTransaction(
    request: PaystackInitializeTransactionRequest,
    options?: PaystackRequestOptions,
  ): Promise<PaystackInitializeTransactionResponse> {
    return this.call<PaystackInitializeTransactionResponse>("initializeTransaction", {
      body: request,
      options,
    });
  }

  async chargeAuthorization(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("chargeAuthorization", {
      body: request,
      options,
    });
  }

  async partialDebit(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("partialDebit", {
      body: request,
      options,
    });
  }

  async verifyTransaction(
    reference: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackVerifyTransactionResponse> {
    return this.call<PaystackVerifyTransactionResponse>("verifyTransaction", {
      pathParameters: { "reference": reference },
      options,
    });
  }

  async listTransactions(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listTransactions", {
      query,
      options,
    });
  }

  async fetchTransaction(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchTransaction", {
      pathParameters: { "id": id },
      options,
    });
  }

  async transactionTimeline(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("transactionTimeline", {
      pathParameters: { "id": id },
      options,
    });
  }

  async transactionTotals(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("transactionTotals", {
      query,
      options,
    });
  }

  async exportTransactions(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("exportTransactions", {
      query,
      options,
    });
  }

  async createCharge(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("createCharge", {
      body: request,
      options,
    });
  }

  async submitChargePin(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("submitChargePin", {
      body: request,
      options,
    });
  }

  async submitChargeOtp(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("submitChargeOtp", {
      body: request,
      options,
    });
  }

  async submitChargePhone(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("submitChargePhone", {
      body: request,
      options,
    });
  }

  async submitChargeBirthday(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("submitChargeBirthday", {
      body: request,
      options,
    });
  }

  async submitChargeAddress(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("submitChargeAddress", {
      body: request,
      options,
    });
  }

  async checkPendingCharge(
    reference: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("checkPendingCharge", {
      pathParameters: { "reference": reference },
      options,
    });
  }

  async requeryCapitecPayCharge(
    ref: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("requeryCapitecPayCharge", {
      pathParameters: { "ref": ref },
      body: request,
      options,
    });
  }

  async initiateBulkCharge(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("initiateBulkCharge", {
      body: request,
      options,
    });
  }

  async listBulkChargeBatches(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listBulkChargeBatches", {
      query,
      options,
    });
  }

  async fetchBulkChargeBatch(
    code: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchBulkChargeBatch", {
      pathParameters: { "code": code },
      options,
    });
  }

  async fetchBulkChargeBatchCharges(
    code: string | number,
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchBulkChargeBatchCharges", {
      pathParameters: { "code": code },
      query,
      options,
    });
  }

  async pauseBulkChargeBatch(
    code: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("pauseBulkChargeBatch", {
      pathParameters: { "code": code },
      options,
    });
  }

  async resumeBulkChargeBatch(
    code: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("resumeBulkChargeBatch", {
      pathParameters: { "code": code },
      options,
    });
  }

  async createSubaccount(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("createSubaccount", {
      body: request,
      options,
    });
  }

  async listSubaccounts(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listSubaccounts", {
      query,
      options,
    });
  }

  async fetchSubaccount(
    code: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchSubaccount", {
      pathParameters: { "code": code },
      options,
    });
  }

  async updateSubaccount(
    code: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("updateSubaccount", {
      pathParameters: { "code": code },
      body: request,
      options,
    });
  }

  async createSplit(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("createSplit", {
      body: request,
      options,
    });
  }

  async listSplits(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listSplits", {
      query,
      options,
    });
  }

  async fetchSplit(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchSplit", {
      pathParameters: { "id": id },
      options,
    });
  }

  async updateSplit(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("updateSplit", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async addSubaccountToSplit(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("addSubaccountToSplit", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async removeSubaccountFromSplit(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("removeSubaccountFromSplit", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async sendTerminalEvent(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("sendTerminalEvent", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async fetchTerminalEventStatus(
    terminalId: string | number,
    eventId: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchTerminalEventStatus", {
      pathParameters: { "terminal_id": terminalId, "event_id": eventId },
      options,
    });
  }

  async fetchTerminalStatus(
    terminalId: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchTerminalStatus", {
      pathParameters: { "terminal_id": terminalId },
      options,
    });
  }

  async listTerminals(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listTerminals", {
      query,
      options,
    });
  }

  async fetchTerminal(
    terminalId: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchTerminal", {
      pathParameters: { "terminal_id": terminalId },
      options,
    });
  }

  async updateTerminal(
    terminalId: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("updateTerminal", {
      pathParameters: { "terminal_id": terminalId },
      body: request,
      options,
    });
  }

  async commissionTerminal(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("commissionTerminal", {
      body: request,
      options,
    });
  }

  async decommissionTerminal(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("decommissionTerminal", {
      body: request,
      options,
    });
  }

  async createVirtualTerminal(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("createVirtualTerminal", {
      body: request,
      options,
    });
  }

  async listVirtualTerminals(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listVirtualTerminals", {
      query,
      options,
    });
  }

  async fetchVirtualTerminal(
    code: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchVirtualTerminal", {
      pathParameters: { "code": code },
      options,
    });
  }

  async updateVirtualTerminal(
    code: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("updateVirtualTerminal", {
      pathParameters: { "code": code },
      body: request,
      options,
    });
  }

  async deactivateVirtualTerminal(
    code: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("deactivateVirtualTerminal", {
      pathParameters: { "code": code },
      body: request,
      options,
    });
  }

  async assignVirtualTerminalDestination(
    code: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("assignVirtualTerminalDestination", {
      pathParameters: { "code": code },
      body: request,
      options,
    });
  }

  async unassignVirtualTerminalDestination(
    code: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("unassignVirtualTerminalDestination", {
      pathParameters: { "code": code },
      body: request,
      options,
    });
  }

  async addVirtualTerminalSplitCode(
    code: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("addVirtualTerminalSplitCode", {
      pathParameters: { "code": code },
      body: request,
      options,
    });
  }

  async removeVirtualTerminalSplitCode(
    code: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("removeVirtualTerminalSplitCode", {
      pathParameters: { "code": code },
      body: request,
      options,
    });
  }

  async createCustomer(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("createCustomer", {
      body: request,
      options,
    });
  }

  async listCustomers(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listCustomers", {
      query,
      options,
    });
  }

  async fetchCustomer(
    code: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchCustomer", {
      pathParameters: { "code": code },
      options,
    });
  }

  async updateCustomer(
    code: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("updateCustomer", {
      pathParameters: { "code": code },
      body: request,
      options,
    });
  }

  async setCustomerRiskAction(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("setCustomerRiskAction", {
      body: request,
      options,
    });
  }

  async validateCustomer(
    code: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("validateCustomer", {
      pathParameters: { "code": code },
      body: request,
      options,
    });
  }

  async initializeAuthorization(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("initializeAuthorization", {
      body: request,
      options,
    });
  }

  async verifyAuthorization(
    reference: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("verifyAuthorization", {
      pathParameters: { "reference": reference },
      options,
    });
  }

  async deactivateAuthorization(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("deactivateAuthorization", {
      body: request,
      options,
    });
  }

  async initializeDirectDebit(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("initializeDirectDebit", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async customerDirectDebitActivationCharge(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("customerDirectDebitActivationCharge", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async customerDirectDebitMandateAuthorizations(
    id: string | number,
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("customerDirectDebitMandateAuthorizations", {
      pathParameters: { "id": id },
      query,
      options,
    });
  }

  async triggerDirectDebitActivationCharge(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("triggerDirectDebitActivationCharge", {
      body: request,
      options,
    });
  }

  async listDirectDebitMandateAuthorizations(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listDirectDebitMandateAuthorizations", {
      query,
      options,
    });
  }

  async createDedicatedAccount(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("createDedicatedAccount", {
      body: request,
      options,
    });
  }

  async listDedicatedAccounts(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listDedicatedAccounts", {
      query,
      options,
    });
  }

  async assignDedicatedAccount(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("assignDedicatedAccount", {
      body: request,
      options,
    });
  }

  async fetchDedicatedAccount(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchDedicatedAccount", {
      pathParameters: { "id": id },
      options,
    });
  }

  async deactivateDedicatedAccount(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("deactivateDedicatedAccount", {
      pathParameters: { "id": id },
      options,
    });
  }

  async requeryDedicatedAccount(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("requeryDedicatedAccount", {
      query,
      options,
    });
  }

  async splitDedicatedAccountTransaction(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("splitDedicatedAccountTransaction", {
      body: request,
      options,
    });
  }

  async removeSplitFromDedicatedAccount(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("removeSplitFromDedicatedAccount", {
      body: request,
      options,
    });
  }

  async fetchDedicatedAccountProviders(
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchDedicatedAccountProviders", {
      options,
    });
  }

  async registerApplePayDomain(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("registerApplePayDomain", {
      body: request,
      options,
    });
  }

  async listApplePayDomains(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listApplePayDomains", {
      query,
      options,
    });
  }

  async unregisterApplePayDomain(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("unregisterApplePayDomain", {
      body: request,
      options,
    });
  }

  async createPlan(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("createPlan", {
      body: request,
      options,
    });
  }

  async listPlans(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listPlans", {
      query,
      options,
    });
  }

  async fetchPlan(
    code: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchPlan", {
      pathParameters: { "code": code },
      options,
    });
  }

  async updatePlan(
    code: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("updatePlan", {
      pathParameters: { "code": code },
      body: request,
      options,
    });
  }

  async createSubscription(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("createSubscription", {
      body: request,
      options,
    });
  }

  async listSubscriptions(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listSubscriptions", {
      query,
      options,
    });
  }

  async fetchSubscription(
    code: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchSubscription", {
      pathParameters: { "code": code },
      options,
    });
  }

  async disableSubscription(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("disableSubscription", {
      body: request,
      options,
    });
  }

  async enableSubscription(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("enableSubscription", {
      body: request,
      options,
    });
  }

  async subscriptionManagementLink(
    code: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("subscriptionManagementLink", {
      pathParameters: { "code": code },
      options,
    });
  }

  async sendSubscriptionManagementEmail(
    code: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("sendSubscriptionManagementEmail", {
      pathParameters: { "code": code },
      body: request,
      options,
    });
  }

  async createTransferRecipient(
    request: PaystackCreateTransferRecipientRequest,
    options?: PaystackRequestOptions,
  ): Promise<PaystackCreateTransferRecipientResponse> {
    return this.call<PaystackCreateTransferRecipientResponse>("createTransferRecipient", {
      body: request,
      options,
    });
  }

  async listTransferRecipients(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listTransferRecipients", {
      query,
      options,
    });
  }

  async bulkCreateTransferRecipients(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("bulkCreateTransferRecipients", {
      body: request,
      options,
    });
  }

  async fetchTransferRecipient(
    code: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchTransferRecipient", {
      pathParameters: { "code": code },
      options,
    });
  }

  async updateTransferRecipient(
    code: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("updateTransferRecipient", {
      pathParameters: { "code": code },
      body: request,
      options,
    });
  }

  async deleteTransferRecipient(
    code: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("deleteTransferRecipient", {
      pathParameters: { "code": code },
      options,
    });
  }

  async initiateTransfer(
    request: PaystackInitiateTransferRequest,
    options?: PaystackRequestOptions,
  ): Promise<PaystackInitiateTransferResponse> {
    return this.call<PaystackInitiateTransferResponse>("initiateTransfer", {
      body: request,
      options,
    });
  }

  async listTransfers(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listTransfers", {
      query,
      options,
    });
  }

  async finalizeTransfer(
    request: PaystackFinalizeTransferRequest,
    options?: PaystackRequestOptions,
  ): Promise<PaystackFinalizeTransferResponse> {
    return this.call<PaystackFinalizeTransferResponse>("finalizeTransfer", {
      body: request,
      options,
    });
  }

  async initiateBulkTransfer(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("initiateBulkTransfer", {
      body: request,
      options,
    });
  }

  async fetchTransfer(
    code: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchTransfer", {
      pathParameters: { "code": code },
      options,
    });
  }

  async verifyTransfer(
    reference: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackVerifyTransferResponse> {
    return this.call<PaystackVerifyTransferResponse>("verifyTransfer", {
      pathParameters: { "reference": reference },
      options,
    });
  }

  async exportTransfers(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("exportTransfers", {
      query,
      options,
    });
  }

  async resendTransferOtp(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("resendTransferOtp", {
      body: request,
      options,
    });
  }

  async disableTransferOtp(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("disableTransferOtp", {
      body: request,
      options,
    });
  }

  async finalizeDisableTransferOtp(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("finalizeDisableTransferOtp", {
      body: request,
      options,
    });
  }

  async enableTransferOtp(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("enableTransferOtp", {
      body: request,
      options,
    });
  }

  async balance(
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("balance", {
      options,
    });
  }

  async balanceLedger(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("balanceLedger", {
      query,
      options,
    });
  }

  async createPaymentRequest(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("createPaymentRequest", {
      body: request,
      options,
    });
  }

  async listPaymentRequests(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listPaymentRequests", {
      query,
      options,
    });
  }

  async fetchPaymentRequest(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchPaymentRequest", {
      pathParameters: { "id": id },
      options,
    });
  }

  async updatePaymentRequest(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("updatePaymentRequest", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async verifyPaymentRequest(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("verifyPaymentRequest", {
      pathParameters: { "id": id },
      options,
    });
  }

  async notifyPaymentRequest(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("notifyPaymentRequest", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async paymentRequestTotals(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("paymentRequestTotals", {
      query,
      options,
    });
  }

  async finalizePaymentRequest(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("finalizePaymentRequest", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async archivePaymentRequest(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("archivePaymentRequest", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async createProduct(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("createProduct", {
      body: request,
      options,
    });
  }

  async listProducts(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listProducts", {
      query,
      options,
    });
  }

  async fetchProduct(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchProduct", {
      pathParameters: { "id": id },
      options,
    });
  }

  async updateProduct(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("updateProduct", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async deleteProduct(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("deleteProduct", {
      pathParameters: { "id": id },
      options,
    });
  }

  async createStorefront(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("createStorefront", {
      body: request,
      options,
    });
  }

  async listStorefronts(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listStorefronts", {
      query,
      options,
    });
  }

  async fetchStorefront(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchStorefront", {
      pathParameters: { "id": id },
      options,
    });
  }

  async updateStorefront(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("updateStorefront", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async deleteStorefront(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("deleteStorefront", {
      pathParameters: { "id": id },
      options,
    });
  }

  async verifyStorefront(
    slug: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("verifyStorefront", {
      pathParameters: { "slug": slug },
      options,
    });
  }

  async listStorefrontOrders(
    id: string | number,
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listStorefrontOrders", {
      pathParameters: { "id": id },
      query,
      options,
    });
  }

  async addStorefrontProducts(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("addStorefrontProducts", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async listStorefrontProducts(
    id: string | number,
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listStorefrontProducts", {
      pathParameters: { "id": id },
      query,
      options,
    });
  }

  async publishStorefront(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("publishStorefront", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async duplicateStorefront(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("duplicateStorefront", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async createOrder(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("createOrder", {
      body: request,
      options,
    });
  }

  async listOrders(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listOrders", {
      query,
      options,
    });
  }

  async fetchOrder(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchOrder", {
      pathParameters: { "id": id },
      options,
    });
  }

  async listProductOrders(
    id: string | number,
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listProductOrders", {
      pathParameters: { "id": id },
      query,
      options,
    });
  }

  async validateOrder(
    code: string | number,
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("validateOrder", {
      pathParameters: { "code": code },
      query,
      options,
    });
  }

  async createPage(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("createPage", {
      body: request,
      options,
    });
  }

  async listPages(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listPages", {
      query,
      options,
    });
  }

  async fetchPage(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchPage", {
      pathParameters: { "id": id },
      options,
    });
  }

  async updatePage(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("updatePage", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async checkSlugAvailability(
    slug: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("checkSlugAvailability", {
      pathParameters: { "slug": slug },
      options,
    });
  }

  async addProductsToPage(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("addProductsToPage", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async listSettlements(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listSettlements", {
      query,
      options,
    });
  }

  async listSettlementTransactions(
    id: string | number,
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listSettlementTransactions", {
      pathParameters: { "id": id },
      query,
      options,
    });
  }

  async fetchPaymentSessionTimeout(
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchPaymentSessionTimeout", {
      options,
    });
  }

  async updatePaymentSessionTimeout(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("updatePaymentSessionTimeout", {
      body: request,
      options,
    });
  }

  async createRefund(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("createRefund", {
      body: request,
      options,
    });
  }

  async listRefunds(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listRefunds", {
      query,
      options,
    });
  }

  async retryRefundWithCustomerDetails(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("retryRefundWithCustomerDetails", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async fetchRefund(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchRefund", {
      pathParameters: { "id": id },
      options,
    });
  }

  async listDisputes(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listDisputes", {
      query,
      options,
    });
  }

  async fetchDispute(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("fetchDispute", {
      pathParameters: { "id": id },
      options,
    });
  }

  async updateDispute(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("updateDispute", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async disputeUploadUrl(
    id: string | number,
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("disputeUploadUrl", {
      pathParameters: { "id": id },
      query,
      options,
    });
  }

  async exportDisputes(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("exportDisputes", {
      query,
      options,
    });
  }

  async transactionDisputes(
    id: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("transactionDisputes", {
      pathParameters: { "id": id },
      options,
    });
  }

  async resolveDispute(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("resolveDispute", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async addDisputeEvidence(
    id: string | number,
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("addDisputeEvidence", {
      pathParameters: { "id": id },
      body: request,
      options,
    });
  }

  async listBanks(
    query?: PaystackListBanksQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackListBanksResponse> {
    return this.call<PaystackListBanksResponse>("listBanks", {
      query,
      options,
    });
  }

  async resolveBankAccount(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackResolveAccountResponse> {
    return this.call<PaystackResolveAccountResponse>("resolveBankAccount", {
      query,
      options,
    });
  }

  async validateBankAccount(
    request: PaystackPayload,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("validateBankAccount", {
      body: request,
      options,
    });
  }

  async resolveCardBin(
    bin: string | number,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("resolveCardBin", {
      pathParameters: { "bin": bin },
      options,
    });
  }

  async listCountries(
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listCountries", {
      options,
    });
  }

  async listAddressVerificationStates(
    query?: PaystackQuery,
    options?: PaystackRequestOptions,
  ): Promise<PaystackApiResponse> {
    return this.call<PaystackApiResponse>("listAddressVerificationStates", {
      query,
      options,
    });
  }

  private async call<T extends PaystackApiResponse>(
    name: PaystackEndpointName,
    input: {
      pathParameters?: Record<string, string | number>;
      body?: unknown;
      query?: QueryParams;
      options?: PaystackRequestOptions;
    },
  ): Promise<T> {
    const entry = this.endpointMap[name];

    if (!entry) {
      throw new ConfigurationError(`Unknown Paystack endpoint [${String(name)}].`);
    }

    const [method, template] = entry;
    const path = input.pathParameters ? fillPath(template, input.pathParameters) : template;

    return this.send<T>({
      path,
      method,
      body: input.body,
      query: input.query,
      options: input.options,
      businessContext: `Paystack ${method} ${path}`,
    });
  }
}

function resolvePaystackTokenProvider(options: PaystackClientOptions): AccessTokenProvider {
  if (options.tokenProvider) {
    return options.tokenProvider;
  }

  return new StaticAccessTokenProvider(options.secretKey as string);
}

function resolvePaystackEndpoints(
  overrides?: PaystackClientOptions["endpoints"],
): Record<PaystackEndpointName, readonly [PaystackHttpMethod, string]> {
  const resolved = { ...PAYSTACK_ENDPOINTS } as Record<
    PaystackEndpointName,
    readonly [PaystackHttpMethod, string]
  >;

  if (!overrides) {
    return resolved;
  }

  for (const [name, override] of Object.entries(overrides)) {
    if (!override) {
      continue;
    }

    const current = resolved[name as PaystackEndpointName];

    resolved[name as PaystackEndpointName] = Array.isArray(override)
      ? (override as readonly [PaystackHttpMethod, string])
      : [current?.[0] ?? "GET", override as string];
  }

  return resolved;
}
