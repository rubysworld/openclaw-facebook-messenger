export type MessengerWebhookPayload = {
  object?: string;
  entry?: MessengerWebhookEntry[];
};

export type MessengerWebhookEntry = {
  id?: string;
  time?: number;
  messaging?: MessengerMessagingEvent[];
};

export type MessengerMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    app_id?: string;
    attachments?: Array<{
      type?: string;
      payload?: { url?: string; sticker_id?: number; [key: string]: unknown };
    }>;
  };
  postback?: {
    title?: string;
    payload?: string;
    referral?: unknown;
  };
  delivery?: {
    mids?: string[];
    watermark?: number;
    seq?: number;
  };
  read?: {
    watermark?: number;
  };
  [key: string]: unknown;
};
