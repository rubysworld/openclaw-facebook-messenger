export { messengerPlugin, messengerSetupPlugin, normalizeMessengerTarget } from "./channel.js";
export { createMessengerWebhookHandler } from "./webhook.js";
export { sendMessengerMessage } from "./send.js";
export { verifyMessengerSignature } from "./signature.js";
export type { ResolvedMessengerAccount } from "./config.js";
export type { MessengerWebhookPayload, MessengerMessagingEvent } from "./types.js";
