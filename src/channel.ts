import { createChatChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { defineChannelMessageAdapter, createMessageReceiptFromOutboundResults } from "openclaw/plugin-sdk/channel-outbound";
import { createPairingPrefixStripper } from "openclaw/plugin-sdk/channel-pairing";
import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk/channel-send-result";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { createMessengerWebhookHandler } from "./webhook.js";
import {
  CHANNEL_ID,
  DEFAULT_ACCOUNT_ID,
  messengerConfigAdapter,
  resolveMessengerAccount,
  assertMessengerSendConfigured,
} from "./config.js";
import type { ResolvedMessengerAccount } from "./config.js";
import { sendMessengerMessage } from "./send.js";

type SetupInput = {
  token?: string;
  secret?: string;
  webhookPath?: string;
  audience?: string;
  password?: string;
  userId?: string;
};

export function normalizeMessengerTarget(target: string): string {
  return target.trim().replace(/^facebook-messenger:/i, "").replace(/^messenger:/i, "").replace(/^psid:/i, "");
}

function applyMessengerConfig(cfg: OpenClawConfig, input: SetupInput): OpenClawConfig {
  const channels = (cfg as { channels?: Record<string, unknown> }).channels ?? {};
  const current = channels[CHANNEL_ID] && typeof channels[CHANNEL_ID] === "object"
    ? (channels[CHANNEL_ID] as Record<string, unknown>)
    : {};
  return {
    ...cfg,
    channels: {
      ...channels,
      [CHANNEL_ID]: {
        ...current,
        enabled: true,
        ...(input.token ? { pageAccessToken: input.token } : {}),
        ...(input.secret ? { appSecret: input.secret } : {}),
        ...(input.webhookPath ? { webhookPath: input.webhookPath } : {}),
        ...(input.audience ? { pageId: input.audience } : {}),
        ...(input.password ? { verifyToken: input.password } : {}),
        ...(input.userId ? { defaultTo: input.userId } : {}),
      },
    },
  } as OpenClawConfig;
}

function validateMessengerSetupInput(input: SetupInput): string | null {
  if (!input.token) return "Page access token is required.";
  if (!input.secret) return "Meta app secret is required.";
  if (!input.password) return "Webhook verify token is required.";
  if (!input.audience) return "Facebook Page ID is required.";
  return null;
}

const messengerOutboundAdapter: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  deliveryCapabilities: {
    durableFinal: {
      text: true,
      media: true,
      replyTo: true,
    },
  },
  resolveTarget: ({ to, cfg }) => {
    const target = normalizeMessengerTarget(to ?? "");
    if (target) return { ok: true, to: target };
    const defaultTo = cfg ? resolveMessengerAccount(cfg).defaultTo : undefined;
    if (defaultTo) return { ok: true, to: normalizeMessengerTarget(defaultTo) };
    return { ok: false, error: new Error("Facebook Messenger target PSID is required") };
  },
  sendText: async (ctx) => ({
    channel: CHANNEL_ID,
    ...(await sendMessengerMessage({
      cfg: ctx.cfg,
      to: normalizeMessengerTarget(ctx.to),
      text: ctx.text,
      replyToId: ctx.replyToId,
    })),
  }),
  sendMedia: async (ctx) => ({
    channel: CHANNEL_ID,
    ...(await sendMessengerMessage({
      cfg: ctx.cfg,
      to: normalizeMessengerTarget(ctx.to),
      text: ctx.text,
      mediaUrl: ctx.mediaUrl,
      replyToId: ctx.replyToId,
    })),
  }),
};

const messengerMessageAdapter = defineChannelMessageAdapter({
  id: CHANNEL_ID,
  durableFinal: {
    capabilities: {
      text: true,
      media: true,
      replyTo: true,
    },
  },
  send: {
    text: async (ctx) => {
      const result = await sendMessengerMessage({
        cfg: ctx.cfg,
        to: normalizeMessengerTarget(ctx.to),
        text: ctx.text,
        replyToId: ctx.replyToId,
      });
      return {
        messageId: result.messageId,
        receipt: createMessageReceiptFromOutboundResults({ results: [result], kind: "text", replyToId: ctx.replyToId ?? undefined }),
      };
    },
    media: async (ctx) => {
      const result = await sendMessengerMessage({
        cfg: ctx.cfg,
        to: normalizeMessengerTarget(ctx.to),
        text: ctx.text,
        mediaUrl: ctx.mediaUrl,
        replyToId: ctx.replyToId,
      });
      return {
        messageId: result.messageId,
        receipt: createMessageReceiptFromOutboundResults({ results: [result], kind: "media", replyToId: ctx.replyToId ?? undefined }),
      };
    },
  },
  receive: {
    defaultAckPolicy: "after_receive_record",
    supportedAckPolicies: ["after_receive_record"],
  },
});

export const messengerPlugin = createChatChannelPlugin<ResolvedMessengerAccount>({
  base: {
    id: CHANNEL_ID,
    meta: {
      id: CHANNEL_ID,
      label: "Facebook Messenger",
      selectionLabel: "Facebook Messenger (Meta Messenger Platform)",
      docsPath: "/channels/facebook-messenger",
      blurb: "Meta Messenger Platform webhook channel for Facebook Pages.",
    },
    capabilities: {
      chatTypes: ["direct"],
      media: true,
      reply: true,
    },
    config: messengerConfigAdapter,
    setup: {
      applyAccountConfig: ({ cfg, input }) => applyMessengerConfig(cfg, input),
      validateInput: ({ input }) => validateMessengerSetupInput(input),
    },
    messaging: {
      targetPrefixes: ["messenger", CHANNEL_ID],
      normalizeTarget: (target) => normalizeMessengerTarget(target),
      targetResolver: {
        looksLikeId: (id) => Boolean(id?.trim()) && (/^\d{5,}$/.test(normalizeMessengerTarget(id)) || /^(messenger|psid|facebook-messenger):/i.test(id)),
        hint: "<PSID>",
      },
    },
    status: {
      buildChannelSummary: ({ account }: { account: ResolvedMessengerAccount }) => ({
        enabled: account.enabled,
        configured: Boolean(account.pageAccessToken && account.pageId && account.verifyToken && account.appSecret),
        pageId: account.pageId ? "configured" : "missing",
        pageAccessToken: account.pageAccessToken ? "configured" : "missing",
        appSecret: account.appSecret ? "configured" : "missing",
        verifyToken: account.verifyToken ? "configured" : "missing",
        webhookPath: account.webhookPath,
      }),
    },
    message: messengerMessageAdapter,
    gatewayMethods: [`${CHANNEL_ID}.webhook`],
    gatewayMethodDescriptors: [
      {
        name: `${CHANNEL_ID}.webhook`,
        description: "Facebook Messenger webhook endpoint",
      },
    ],
  },
  security: {
    dm: {
      channelKey: CHANNEL_ID,
      resolvePolicy: (account) => account.config.dmPolicy,
      resolveAllowFrom: (account) => account.config.allowFrom ?? [],
      defaultPolicy: "allowlist",
      approveHint: `openclaw pairing approve ${CHANNEL_ID} <code>`,
      normalizeEntry: normalizeMessengerTarget,
    },
  },
  pairing: {
    text: {
      idLabel: "Messenger PSID",
      message: "OpenClaw: your Facebook Messenger access has been approved.",
      normalizeAllowEntry: createPairingPrefixStripper(/^(?:facebook-messenger|messenger|psid):/i),
      notify: async ({ cfg, id, message }) => {
        const account = resolveMessengerAccount(cfg);
        assertMessengerSendConfigured(account);
        await sendMessengerMessage({ cfg, account, to: normalizeMessengerTarget(id), text: message });
      },
    },
  },
  threading: { topLevelReplyToMode: "reply" },
  outbound: messengerOutboundAdapter,
});

export function registerMessengerWebhookRoute(api: { config: OpenClawConfig; runtime?: unknown; registerHttpRoute: (params: { path: string; auth: "plugin"; handler: ReturnType<typeof createMessengerWebhookHandler>; replaceExisting?: boolean }) => void }): void {
  const account = resolveMessengerAccount(api.config);
  api.registerHttpRoute({
    path: account.webhookPath,
    auth: "plugin",
    replaceExisting: true,
    handler: createMessengerWebhookHandler({
      cfg: api.config,
      account,
      runtime: api.runtime as Parameters<typeof createMessengerWebhookHandler>[0]["runtime"],
    }),
  });
}

export const messengerSetupPlugin = messengerPlugin;
