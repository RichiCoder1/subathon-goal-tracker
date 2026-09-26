import type * as Party from "partykit/server";
import { TwitchChallengeSchema, TwitchNotificationSchema } from "./schema";

export const MESSAGE_ID = "Twitch-Eventsub-Message-Id";
export const MESSAGE_TIMESTAMP = "Twitch-Eventsub-Message-Timestamp";
export function isTwitchWebhook(request: Party.Request) {
  return request.headers.has(MESSAGE_ID);
}
export async function processTwitchWebhook(
  request: Party.Request,
  env: Record<string, unknown>,
) {
  const id = request.headers.get(MESSAGE_ID);
  const timestamp = request.headers.get(MESSAGE_TIMESTAMP);
  const signature = request.headers.get("Twitch-Eventsub-Message-Signature");
  const time = Date.parse(timestamp ?? "");
  if (
    !id ||
    !timestamp ||
    !Number.isFinite(time) ||
    Math.abs(Date.now() - time) > 10 * 60 * 1000 ||
    !/^sha256=[a-f0-9]{64}$/.test(signature ?? "")
  )
    return new Response("Invalid webhook headers", { status: 403 });
  if (typeof env.TWITCH_SECRET !== "string" || !env.TWITCH_SECRET)
    return new Response("Webhook secret is not configured", { status: 503 });
  const body = await request.text();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.TWITCH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    hexBuffer(signature!.slice(7)),
    encoder.encode(id + timestamp + body),
  );
  if (!valid) return new Response("Invalid webhook signature", { status: 403 });
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  switch (request.headers.get("Twitch-Eventsub-Message-Type")) {
    case "webhook_callback_verification": {
      const challenge = TwitchChallengeSchema.safeParse(json);
      return challenge.success
        ? new Response(challenge.data.challenge, {
            headers: { "Content-Type": "text/plain" },
          })
        : new Response("Invalid challenge", { status: 400 });
    }
    case "revocation":
      return new Response(null, { status: 204 });
    case "notification": {
      const notification = TwitchNotificationSchema.safeParse(json);
      return notification.success
        ? notification.data
        : new Response("Invalid notification", { status: 400 });
    }
    default:
      return new Response("Unsupported message type", { status: 400 });
  }
}
export function hexBuffer(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));
}
