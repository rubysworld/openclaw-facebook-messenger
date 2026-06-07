# OpenClaw Facebook Messenger channel

Facebook Messenger channel plugin for OpenClaw using the public OpenClaw channel SDK and Meta Messenger Platform APIs.

## Install

```bash
openclaw plugin install openclaw-facebook-messenger
```

Then enable/configure the channel in your OpenClaw config under `channels.facebook-messenger`.

## Configuration

```json
{
  "channels": {
    "facebook-messenger": {
      "enabled": true,
      "pageId": "<FACEBOOK_PAGE_ID>",
      "pageAccessToken": "<PAGE_ACCESS_TOKEN>",
      "verifyToken": "<WEBHOOK_VERIFY_TOKEN>",
      "appSecret": "<META_APP_SECRET>",
      "webhookPath": "/facebook-messenger/webhook",
      "allowFrom": ["<USER_PSID>"],
      "dmPolicy": "allowlist"
    }
  }
}
```

All credentials are read from OpenClaw config only. `webhookPath` defaults to `/facebook-messenger/webhook`; `graphApiVersion` defaults to `v25.0`.

Use `allowFrom` with Messenger PSIDs for trusted senders. Set `dmPolicy` to `open` only if every inbound PSID should be allowed.

## Meta app setup

1. Create or select a Meta app with Messenger enabled.
2. Connect the Facebook Page and generate a Page access token with Messenger permissions.
3. In **Messenger > Settings > Webhooks**, set the callback URL to your public OpenClaw Gateway URL plus the configured path, for example `https://example.com/facebook-messenger/webhook`.
4. Set the verify token to the same value configured as `verifyToken`.
5. Subscribe the Page to Messenger webhook fields such as `messages`, `messaging_postbacks`, `message_deliveries`, and `message_reads`.
6. Add trusted sender PSIDs to `allowFrom`, or approve them through OpenClaw pairing when using pairing policy.

## Behavior

- `GET` webhook requests validate `hub.mode=subscribe`, `hub.verify_token`, and return `hub.challenge`.
- `POST` webhook requests require a valid `X-Hub-Signature-256` HMAC using the Meta app secret.
- Text messages, attachments, and postbacks become OpenClaw inbound turns.
- Delivery/read/echo and unsupported events are acknowledged but do not start agent turns.
- Outbound text/media replies use Meta's Send API `/{PAGE_ID}/messages` endpoint with `messaging_type: "RESPONSE"`.

## Notes

Messenger requires a public HTTPS webhook URL with a valid TLS certificate. Meta policy controls the 24-hour response window and any message tags outside it; this plugin sends ordinary response messages and does not create or manage a Meta app for you.
