import type { IncomingMessage, ServerResponse } from "node:http";
import { isRequestBodyLimitError, readRequestBodyWithLimit, requestBodyErrorToText } from "openclaw/plugin-sdk/webhook-request-guards";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { assertMessengerWebhookConfigured } from "./config.js";
import type { ResolvedMessengerAccount } from "./config.js";
import { handleMessengerWebhookPayload } from "./inbound.js";
import { verifyMessengerSignature } from "./signature.js";
import type { MessengerWebhookPayload } from "./types.js";

const MAX_BODY_BYTES = 1024 * 1024;
const BODY_TIMEOUT_MS = 5_000;

type RuntimeLogger = { error?: (message: string) => void };

type MessengerWebhookHandlerParams = {
  cfg: OpenClawConfig;
  account: ResolvedMessengerAccount;
  runtime?: RuntimeLogger;
};

function endJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readQuery(req: IncomingMessage): URLSearchParams {
  return new URL(req.url ?? "/", "http://openclaw.local").searchParams;
}

function signatureHeader(req: IncomingMessage): string | undefined {
  const raw = req.headers["x-hub-signature-256"];
  return Array.isArray(raw) ? raw[0] : raw;
}

function parseWebhookPayload(rawBody: string): MessengerWebhookPayload | null {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as MessengerWebhookPayload) : null;
  } catch {
    return null;
  }
}

export function createMessengerWebhookHandler(params: MessengerWebhookHandlerParams) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method === "HEAD") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === "GET") {
      try {
        assertMessengerWebhookConfigured(params.account);
      } catch (err) {
        endJson(res, 503, { error: String(err) });
        return;
      }
      const query = readQuery(req);
      const mode = query.get("hub.mode");
      const token = query.get("hub.verify_token");
      const challenge = query.get("hub.challenge");
      if (mode === "subscribe" && token === params.account.verifyToken && challenge) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/plain");
        res.end(challenge);
        return;
      }
      endJson(res, 403, { error: "Invalid verify token" });
      return;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD, POST");
      endJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    try {
      assertMessengerWebhookConfigured(params.account);
      const rawBody = await readRequestBodyWithLimit(req, {
        maxBytes: MAX_BODY_BYTES,
        timeoutMs: BODY_TIMEOUT_MS,
      });
      const signatureValid = verifyMessengerSignature({
        body: rawBody,
        appSecret: params.account.appSecret ?? "",
        signatureHeader: signatureHeader(req),
      });
      if (!signatureValid) {
        endJson(res, 401, { error: "Invalid X-Hub-Signature-256" });
        return;
      }
      const payload = parseWebhookPayload(rawBody);
      if (!payload) {
        endJson(res, 400, { error: "Invalid webhook payload" });
        return;
      }
      if (payload.object !== "page") {
        endJson(res, 404, { error: "Unsupported webhook object" });
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain");
      res.end("EVENT_RECEIVED");
      void handleMessengerWebhookPayload({ ...params, payload }).catch((err) => {
        params.runtime?.error?.(`facebook-messenger webhook dispatch failed: ${String(err)}`);
      });
    } catch (err) {
      if (isRequestBodyLimitError(err, "PAYLOAD_TOO_LARGE")) {
        endJson(res, 413, { error: "Payload too large" });
        return;
      }
      if (isRequestBodyLimitError(err, "REQUEST_BODY_TIMEOUT")) {
        endJson(res, 408, { error: requestBodyErrorToText("REQUEST_BODY_TIMEOUT") });
        return;
      }
      params.runtime?.error?.(`facebook-messenger webhook error: ${String(err)}`);
      if (!res.headersSent) {
        endJson(res, 500, { error: "Internal server error" });
      }
    }
  };
}
