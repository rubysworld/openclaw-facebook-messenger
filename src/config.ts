import { createTopLevelChannelConfigAdapter } from "openclaw/plugin-sdk/channel-config-helpers";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";

export const CHANNEL_ID = "facebook-messenger";
export const DEFAULT_WEBHOOK_PATH = "/facebook-messenger/webhook";
export const DEFAULT_GRAPH_API_VERSION = "v25.0";
export const DEFAULT_ACCOUNT_ID = "default";

type MessengerChannelSection = {
  enabled?: boolean;
  pageAccessToken?: string;
  pageId?: string;
  verifyToken?: string;
  appSecret?: string;
  graphApiVersion?: string;
  webhookPath?: string;
  defaultTo?: string;
  allowFrom?: string[];
  dmPolicy?: string;
};

export type ResolvedMessengerAccount = {
  accountId: string;
  config: MessengerChannelSection;
  enabled: boolean;
  pageAccessToken?: string;
  pageId?: string;
  verifyToken?: string;
  appSecret?: string;
  graphApiVersion: string;
  webhookPath: string;
  defaultTo?: string;
};

function readChannels(cfg: OpenClawConfig): Record<string, unknown> {
  return ((cfg as { channels?: Record<string, unknown> }).channels ?? {}) as Record<string, unknown>;
}

function readSection(cfg: OpenClawConfig): MessengerChannelSection {
  const channels = readChannels(cfg);
  const section = channels[CHANNEL_ID] ?? channels.facebookMessenger ?? {};
  return section && typeof section === "object" ? (section as MessengerChannelSection) : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveMessengerAccount(cfg: OpenClawConfig): ResolvedMessengerAccount {
  const section = readSection(cfg);
  const pageAccessToken = readString(section.pageAccessToken);
  const pageId = readString(section.pageId);
  const verifyToken = readString(section.verifyToken);
  const appSecret = readString(section.appSecret);
  const graphApiVersion = readString(section.graphApiVersion) ?? DEFAULT_GRAPH_API_VERSION;
  const webhookPath = readString(section.webhookPath) ?? DEFAULT_WEBHOOK_PATH;

  return {
    accountId: DEFAULT_ACCOUNT_ID,
    config: section,
    enabled: section.enabled !== false,
    pageAccessToken,
    pageId,
    verifyToken,
    appSecret,
    graphApiVersion,
    webhookPath,
    defaultTo: readString(section.defaultTo),
  };
}

export function assertMessengerSendConfigured(account: ResolvedMessengerAccount): void {
  if (!account.enabled) {
    throw new Error("Facebook Messenger channel is disabled");
  }
  if (!account.pageAccessToken) {
    throw new Error("Facebook Messenger page access token is not configured");
  }
  if (!account.pageId) {
    throw new Error("Facebook Messenger page ID is not configured");
  }
}

export function assertMessengerWebhookConfigured(account: ResolvedMessengerAccount): void {
  if (!account.enabled) {
    throw new Error("Facebook Messenger channel is disabled");
  }
  if (!account.verifyToken) {
    throw new Error("Facebook Messenger webhook verify token is not configured");
  }
  if (!account.appSecret) {
    throw new Error("Facebook Messenger app secret is not configured");
  }
}

export function isMessengerSenderAllowed(account: ResolvedMessengerAccount, senderId: string): boolean {
  const policy = account.config.dmPolicy ?? "allowlist";
  if (policy === "disabled") {
    return false;
  }
  if (policy === "open") {
    return true;
  }
  const normalizedSender = senderId.trim().toLowerCase();
  return (account.config.allowFrom ?? []).some((entry) => {
    const normalized = entry.trim().toLowerCase();
    return normalized === "*" || normalized === normalizedSender || normalized === `messenger:${normalizedSender}` || normalized === `${CHANNEL_ID}:${normalizedSender}`;
  });
}

export const messengerConfigAdapter = createTopLevelChannelConfigAdapter<ResolvedMessengerAccount>({
  sectionKey: CHANNEL_ID,
  resolveAccount: resolveMessengerAccount,
  inspectAccount(cfg) {
    const account = resolveMessengerAccount(cfg);
    return {
      enabled: account.enabled,
      configured: Boolean(account.pageAccessToken && account.pageId && account.verifyToken && account.appSecret),
      tokenStatus: account.pageAccessToken ? "available" : "missing",
      pageIdStatus: account.pageId ? "available" : "missing",
      verifyTokenStatus: account.verifyToken ? "available" : "missing",
      appSecretStatus: account.appSecret ? "available" : "missing",
      webhookPath: account.webhookPath,
      graphApiVersion: account.graphApiVersion,
    };
  },
  deleteMode: "remove-section",
  resolveAllowFrom: (account) => account.config.allowFrom ?? [],
  formatAllowFrom: (allowFrom) => allowFrom.map(String),
  resolveDefaultTo: (account) => account.defaultTo,
});
