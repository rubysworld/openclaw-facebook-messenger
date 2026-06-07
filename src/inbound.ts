import { buildChannelInboundEventContext, dispatchChannelInboundReply } from "openclaw/plugin-sdk/channel-inbound";
import { formatInboundEnvelope, resolveEnvelopeFormatOptions } from "openclaw/plugin-sdk/channel-inbound";
import { normalizeOutboundReplyPayload } from "openclaw/plugin-sdk/reply-payload";
import { dispatchReplyWithBufferedBlockDispatcher } from "openclaw/plugin-sdk/reply-dispatch-runtime";
import { recordInboundSession } from "openclaw/plugin-sdk/conversation-runtime";
import { resolveAgentRoute } from "openclaw/plugin-sdk/routing";
import { readSessionUpdatedAt, resolveStorePath } from "openclaw/plugin-sdk/session-store-runtime";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { CHANNEL_ID, isMessengerSenderAllowed } from "./config.js";
import type { ResolvedMessengerAccount } from "./config.js";
import { sendMessengerMessage } from "./send.js";
import type { MessengerMessagingEvent, MessengerWebhookPayload } from "./types.js";

type RuntimeLogger = { error?: (message: string) => void };

function messengerLog(runtime: RuntimeLogger | undefined, message: string): void {
  runtime?.error?.(message);
}

function eventText(event: MessengerMessagingEvent): string | undefined {
  const text = event.message?.text?.trim();
  if (text) return text;
  const attachments = event.message?.attachments ?? [];
  if (attachments.length > 0) {
    return attachments
      .map((attachment) => {
        const kind = attachment.type ?? "attachment";
        const url = attachment.payload?.url;
        return url ? `[Messenger ${kind} attachment: ${url}]` : `[Messenger ${kind} attachment]`;
      })
      .join("\n");
  }
  const postback = event.postback;
  if (postback) {
    return [`Postback: ${postback.title ?? "untitled"}`, postback.payload ? `Payload: ${postback.payload}` : undefined]
      .filter(Boolean)
      .join("\n");
  }
  return undefined;
}

function shouldDispatchEvent(event: MessengerMessagingEvent): boolean {
  if (event.message?.is_echo) return false;
  return Boolean(event.message || event.postback);
}

export async function handleMessengerWebhookPayload(params: {
  cfg: OpenClawConfig;
  account: ResolvedMessengerAccount;
  runtime?: RuntimeLogger;
  payload: MessengerWebhookPayload;
}): Promise<void> {
  for (const entry of params.payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (!shouldDispatchEvent(event)) {
        continue;
      }
      await dispatchMessengerEvent({ ...params, event, pageId: entry.id });
    }
  }
}

async function dispatchMessengerEvent(params: {
  cfg: OpenClawConfig;
  account: ResolvedMessengerAccount;
  runtime?: RuntimeLogger;
  event: MessengerMessagingEvent;
  pageId?: string;
}): Promise<void> {
  const senderId = params.event.sender?.id?.trim();
  if (!senderId) {
    messengerLog(params.runtime, "facebook-messenger: dropped webhook event without sender id");
    return;
  }
  if (!isMessengerSenderAllowed(params.account, senderId)) {
    messengerLog(params.runtime, `facebook-messenger: dropped unauthorized sender ${senderId}`);
    return;
  }
  const rawText = eventText(params.event);
  if (!rawText) {
    return;
  }

  const route = resolveAgentRoute({
    cfg: params.cfg,
    channel: CHANNEL_ID,
    accountId: params.account.accountId,
    peer: { kind: "direct", id: senderId },
  });
  const storePath = resolveStorePath(params.cfg.session?.store, { agentId: route.agentId });
  const previousTimestamp = readSessionUpdatedAt({ storePath, sessionKey: route.sessionKey });
  const timestamp = params.event.timestamp ?? Date.now();
  const body = formatInboundEnvelope({
    channel: "Facebook Messenger",
    from: `psid:${senderId}`,
    timestamp,
    previousTimestamp,
    body: rawText,
    chatType: "direct",
    sender: { id: senderId },
    envelope: resolveEnvelopeFormatOptions(params.cfg),
  });
  const messageId = params.event.message?.mid ?? `${senderId}:${timestamp}`;
  const ctxPayload = buildChannelInboundEventContext({
    channel: CHANNEL_ID,
    accountId: route.accountId,
    messageId,
    timestamp,
    from: `messenger:${senderId}`,
    sender: { id: senderId },
    conversation: {
      kind: "direct",
      id: senderId,
      label: `psid:${senderId}`,
    },
    route: {
      agentId: route.agentId,
      accountId: route.accountId,
      routeSessionKey: route.sessionKey,
    },
    reply: {
      to: `messenger:${senderId}`,
      replyToId: params.event.message?.mid,
    },
    message: {
      body,
      bodyForAgent: rawText,
      rawBody: rawText,
      commandBody: rawText,
    },
    access: {
      commands: { authorized: true },
    },
    extra: {
      PageId: params.pageId ?? params.event.recipient?.id,
      PostbackPayload: params.event.postback?.payload,
      PostbackTitle: params.event.postback?.title,
    },
  });

  await dispatchChannelInboundReply({
    cfg: params.cfg,
    channel: CHANNEL_ID,
    accountId: route.accountId,
    agentId: route.agentId,
    routeSessionKey: route.sessionKey,
    storePath,
    ctxPayload,
    recordInboundSession,
    dispatchReplyWithBufferedBlockDispatcher,
    delivery: {
      preparePayload: (payload) => normalizeOutboundReplyPayload(payload),
      deliver: async (payload) => {
        const normalized = normalizeOutboundReplyPayload(payload);
        await sendMessengerMessage({
          cfg: params.cfg,
          account: params.account,
          to: senderId,
          text: normalized.text,
          mediaUrl: normalized.mediaUrl,
          replyToId: params.event.message?.mid,
        });
      },
      onError: (err, info) => {
        messengerLog(params.runtime, `facebook-messenger ${info.kind} reply failed: ${String(err)}`);
      },
    },
    record: {
      onRecordError: (err) => messengerLog(params.runtime, `facebook-messenger session record failed: ${String(err)}`),
      updateLastRoute: {
        sessionKey: route.sessionKey,
        channel: CHANNEL_ID,
        to: `messenger:${senderId}`,
        accountId: route.accountId,
      },
    },
  });
}
