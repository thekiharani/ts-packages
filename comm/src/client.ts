import { ConfigurationError } from "./core/errors";
import type { RequestOptions } from "./core/types";
import type { DeliveryEvent } from "./events";
import type {
  SmsBalance,
  SmsGateway,
  SmsGroup,
  SmsGroupUpsertRequest,
  SmsManagementGateway,
  SmsManagementResult,
  SmsSendRequest,
  SmsSendResult,
  SmsTemplate,
  SmsTemplateUpsertRequest,
} from "./providers/sms/types";
import type {
  WhatsAppCatalogMessageRequest,
  WhatsAppContactsRequest,
  WhatsAppFlowMessageRequest,
  WhatsAppGateway,
  WhatsAppInboundMessage,
  WhatsAppInteractiveRequest,
  WhatsAppLocationRequest,
  WhatsAppManagedTemplate,
  WhatsAppMediaDeleteResult,
  WhatsAppMediaInfo,
  WhatsAppMediaRequest,
  WhatsAppMediaUploadRequest,
  WhatsAppMediaUploadResult,
  WhatsAppProductListRequest,
  WhatsAppProductMessageRequest,
  WhatsAppReactionRequest,
  WhatsAppSendResult,
  WhatsAppTemplateCreateRequest,
  WhatsAppTemplateDeleteRequest,
  WhatsAppTemplateDeleteResult,
  WhatsAppTemplateListRequest,
  WhatsAppTemplateListResult,
  WhatsAppTemplateManagementGateway,
  WhatsAppTemplateMutationResult,
  WhatsAppTemplateRequest,
  WhatsAppTemplateUpdateRequest,
  WhatsAppTextRequest,
} from "./providers/whatsapp/types";

export class SmsService {
  constructor(readonly gateway?: SmsGateway) {}

  get configured(): boolean {
    return Boolean(this.gateway);
  }

  get provider(): string | undefined {
    return this.gateway?.providerName;
  }

  async send(request: SmsSendRequest, options?: RequestOptions): Promise<SmsSendResult> {
    return this.requireGateway().send(request, options);
  }

  async getBalance(options?: RequestOptions): Promise<SmsBalance> {
    return this.requireGateway().getBalance(options);
  }

  async listGroups(options?: RequestOptions): Promise<SmsGroup[]> {
    return this.requireManagementGateway().listGroups(options);
  }

  async createGroup(
    request: SmsGroupUpsertRequest,
    options?: RequestOptions,
  ): Promise<SmsManagementResult> {
    return this.requireManagementGateway().createGroup(request, options);
  }

  async updateGroup(
    groupId: string,
    request: SmsGroupUpsertRequest,
    options?: RequestOptions,
  ): Promise<SmsManagementResult> {
    return this.requireManagementGateway().updateGroup(groupId, request, options);
  }

  async deleteGroup(groupId: string, options?: RequestOptions): Promise<SmsManagementResult> {
    return this.requireManagementGateway().deleteGroup(groupId, options);
  }

  async listTemplates(options?: RequestOptions): Promise<SmsTemplate[]> {
    return this.requireManagementGateway().listTemplates(options);
  }

  async createTemplate(
    request: SmsTemplateUpsertRequest,
    options?: RequestOptions,
  ): Promise<SmsManagementResult> {
    return this.requireManagementGateway().createTemplate(request, options);
  }

  async updateTemplate(
    templateId: string,
    request: SmsTemplateUpsertRequest,
    options?: RequestOptions,
  ): Promise<SmsManagementResult> {
    return this.requireManagementGateway().updateTemplate(templateId, request, options);
  }

  async deleteTemplate(
    templateId: string,
    options?: RequestOptions,
  ): Promise<SmsManagementResult> {
    return this.requireManagementGateway().deleteTemplate(templateId, options);
  }

  parseDeliveryReport(payload: Record<string, unknown>): DeliveryEvent | null {
    return this.requireGateway().parseDeliveryReport(payload);
  }

  async close(): Promise<void> {
    await this.gateway?.close?.();
  }

  private requireGateway(): SmsGateway {
    if (!this.gateway) {
      throw new ConfigurationError("SMS gateway is not configured on this client.");
    }

    return this.gateway;
  }

  private requireManagementGateway(): SmsManagementGateway {
    if (
      !this.gateway ||
      !("listGroups" in this.gateway) ||
      !("createGroup" in this.gateway) ||
      !("listTemplates" in this.gateway)
    ) {
      throw new ConfigurationError(
        "Configured SMS gateway does not support group/template management.",
      );
    }

    return this.gateway as SmsManagementGateway;
  }
}

export class WhatsAppService {
  constructor(readonly gateway?: WhatsAppGateway) {}

  get configured(): boolean {
    return Boolean(this.gateway);
  }

  get provider(): string | undefined {
    return this.gateway?.providerName;
  }

  async sendText(
    request: WhatsAppTextRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.requireGateway().sendText(request, options);
  }

  async sendTemplate(
    request: WhatsAppTemplateRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.requireGateway().sendTemplate(request, options);
  }

  async listTemplates(
    request?: WhatsAppTemplateListRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppTemplateListResult> {
    return this.requireTemplateManagementGateway().listTemplates(request, options);
  }

  async getTemplate(
    templateId: string,
    fields: string[] = [],
    options?: RequestOptions,
  ): Promise<WhatsAppManagedTemplate> {
    return this.requireTemplateManagementGateway().getTemplate(templateId, fields, options);
  }

  async createTemplate(
    request: WhatsAppTemplateCreateRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppTemplateMutationResult> {
    return this.requireTemplateManagementGateway().createTemplate(request, options);
  }

  async updateTemplate(
    templateId: string,
    request: WhatsAppTemplateUpdateRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppTemplateMutationResult> {
    return this.requireTemplateManagementGateway().updateTemplate(templateId, request, options);
  }

  async deleteTemplate(
    request: WhatsAppTemplateDeleteRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppTemplateDeleteResult> {
    return this.requireTemplateManagementGateway().deleteTemplate(request, options);
  }

  async sendMedia(
    request: WhatsAppMediaRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.requireGateway().sendMedia(request, options);
  }

  async sendLocation(
    request: WhatsAppLocationRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.requireGateway().sendLocation(request, options);
  }

  async sendContacts(
    request: WhatsAppContactsRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.requireGateway().sendContacts(request, options);
  }

  async sendReaction(
    request: WhatsAppReactionRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.requireGateway().sendReaction(request, options);
  }

  async sendInteractive(
    request: WhatsAppInteractiveRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.requireGateway().sendInteractive(request, options);
  }

  async sendCatalog(
    request: WhatsAppCatalogMessageRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.requireGateway().sendCatalog(request, options);
  }

  async sendProduct(
    request: WhatsAppProductMessageRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.requireGateway().sendProduct(request, options);
  }

  async sendProductList(
    request: WhatsAppProductListRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.requireGateway().sendProductList(request, options);
  }

  async sendFlow(
    request: WhatsAppFlowMessageRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.requireGateway().sendFlow(request, options);
  }

  async uploadMedia(
    request: WhatsAppMediaUploadRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppMediaUploadResult> {
    return this.requireGateway().uploadMedia(request, options);
  }

  async getMedia(mediaId: string, options?: RequestOptions): Promise<WhatsAppMediaInfo> {
    return this.requireGateway().getMedia(mediaId, options);
  }

  async deleteMedia(
    mediaId: string,
    options?: RequestOptions,
  ): Promise<WhatsAppMediaDeleteResult> {
    return this.requireGateway().deleteMedia(mediaId, options);
  }

  parseEvents(payload: Record<string, unknown>): DeliveryEvent[] {
    return this.requireGateway().parseEvents(payload);
  }

  parseEvent(payload: Record<string, unknown>): DeliveryEvent | null {
    return this.parseEvents(payload)[0] ?? null;
  }

  parseInboundMessages(payload: Record<string, unknown>): WhatsAppInboundMessage[] {
    return this.requireGateway().parseInboundMessages(payload);
  }

  parseInboundMessage(payload: Record<string, unknown>): WhatsAppInboundMessage | null {
    return this.parseInboundMessages(payload)[0] ?? null;
  }

  async close(): Promise<void> {
    await this.gateway?.close?.();
  }

  private requireGateway(): WhatsAppGateway {
    if (!this.gateway) {
      throw new ConfigurationError("WhatsApp gateway is not configured on this client.");
    }

    return this.gateway;
  }

  private requireTemplateManagementGateway(): WhatsAppTemplateManagementGateway {
    if (
      !this.gateway ||
      !("listTemplates" in this.gateway) ||
      !("getTemplate" in this.gateway) ||
      !("createTemplate" in this.gateway)
    ) {
      throw new ConfigurationError(
        "Configured WhatsApp gateway does not support template management.",
      );
    }

    return this.gateway as WhatsAppTemplateManagementGateway;
  }
}

export class MessagingClient {
  readonly sms: SmsService;
  readonly whatsapp: WhatsAppService;

  constructor(options: { sms?: SmsGateway; whatsapp?: WhatsAppGateway } = {}) {
    this.sms = new SmsService(options.sms);
    this.whatsapp = new WhatsAppService(options.whatsapp);
  }

  async close(): Promise<void> {
    await Promise.all([this.sms.close(), this.whatsapp.close()]);
  }
}
