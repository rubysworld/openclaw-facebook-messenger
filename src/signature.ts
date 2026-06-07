import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMessengerSignature(params: {
  body: string | Buffer;
  appSecret: string;
  signatureHeader?: string;
}): boolean {
  const header = params.signatureHeader?.trim();
  if (!header?.startsWith("sha256=")) {
    return false;
  }
  const received = header.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(received)) {
    return false;
  }
  const expected = createHmac("sha256", params.appSecret).update(params.body).digest("hex");
  const receivedBuffer = Buffer.from(received, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}
