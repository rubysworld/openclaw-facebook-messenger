import type { OutboundDeliveryResult } from "openclaw/plugin-sdk/channel-send-result";
import { CHANNEL_ID, assertMessengerSendConfigured, resolveMessengerAccount } from "./config.js";
import type { ResolvedMessengerAccount } from "./config.js";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";

export type MessengerSendResult = Omit<OutboundDeliveryResult, "channel">;

type MessengerSendApiResponse = {
  recipient_id?: string;
  message_id?: string;
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
  };
};

function inferAttachmentType(url: string): "image" | "audio" | "video" | "file" {
  const clean = url.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  if (/\.(jpg|jpeg|png|gif|webp)$/.test(clean)) return "image";
  if (/\.(mp3|m4a|wav|ogg|oga|aac)$/.test(clean)) return "audio";
  if (/\.(mp4|mov|m4v|webm)$/.test(clean)) return "video";
  return "file";
}

function buildSendApiUrl(account: ResolvedMessengerAccount): string {
  const url = new URL(`https://graph.facebook.com/${account.graphApiVersion}/${account.pageId}/messages`);
  url.searchParams.set("access_token", account.pageAccessToken ?? "");
  return url.toString();
}

export async function sendMessengerMessage(params: {
  cfg: OpenClawConfig;
  to: string;
  text?: string;
  mediaUrl?: string;
  replyToId?: string | null;
  account?: ResolvedMessengerAccount;
  fetcher?: typeof fetch;
}): Promise<MessengerSendResult> {
  const account = params.account ?? resolveMessengerAccount(params.cfg);
  assertMessengerSendConfigured(account);
  const fetcher = params.fetcher ?? fetch;
  const text = params.text?.trim();
  const mediaUrl = params.mediaUrl?.trim();
  if (!text && !mediaUrl) {
    throw new Error("Facebook Messenger send requires text or a media URL");
  }
  if (mediaUrl && !/^https?:\/\//i.test(mediaUrl)) {
    throw new Error("Facebook Messenger media sends require a public http(s) URL");
  }

  const body: Record<string, unknown> = {
    recipient: { id: params.to },
    messaging_type: "RESPONSE",
    message: mediaUrl
      ? {
          ...(text ? { text } : {}),
          attachment: {
            type: inferAttachmentType(mediaUrl),
            payload: { url: mediaUrl, is_reusable: true },
          },
        }
      : { text },
  };
  if (params.replyToId) {
    body.reply_to = { mid: params.replyToId };
  }

  const response = await fetcher(buildSendApiUrl(account), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as MessengerSendApiResponse;
  if (!response.ok || json.error) {
    const code = json.error?.code ? ` code=${json.error.code}` : "";
    const subcode = json.error?.error_subcode ? ` subcode=${json.error.error_subcode}` : "";
    const message = json.error?.message ?? response.statusText;
    throw new Error(`Facebook Messenger Send API failed:${code}${subcode} ${message}`.trim());
  }
  const messageId = json.message_id;
  if (!messageId) {
    throw new Error("Facebook Messenger Send API response did not include message_id");
  }
  return {
    messageId,
    chatId: json.recipient_id ?? params.to,
    conversationId: account.pageId,
    timestamp: Date.now(),
    meta: { channel: CHANNEL_ID },
  };
}
