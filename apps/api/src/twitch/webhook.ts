import type * as Party from 'partykit/server';
import { z } from "zod";
import { TwitchChallengeSchema, TwitchNotificationSchema } from './schema';

const TWITCH_MESSAGE_ID = 'Twitch-Eventsub-Message-Id'.toLowerCase();
const TWITCH_MESSAGE_TIMESTAMP = 'Twitch-Eventsub-Message-Timestamp'.toLowerCase();
const TWITCH_MESSAGE_SIGNATURE = 'Twitch-Eventsub-Message-Signature'.toLowerCase();
const TWITCH_MESSAGE_TYPE = 'Twitch-Eventsub-Message-Type';
const HMAC_PREFIX = 'sha256=';

type Headers = Party.Request["headers"];

const TwitchMessageTypes = z.union([
  z.literal("notification"),
  z.literal("webhook_callback_verification"),
  z.literal("revocation")
]);

export function isTwitchWebhook(request: Party.Request) {
  const messageId = request.headers.get(TWITCH_MESSAGE_ID);
  if (messageId == null) {
    return false;
  }
  return true;
}

export async function processTwitchWebhook(request: Party.Request, env: Record<string, unknown>) {
  const twitchSecret = env.TWITCH_SECRET as string;

  const result = await validateTwitchRequest(request, twitchSecret);
  if (result instanceof Response) {
    return result;
  }

  const messageType = TwitchMessageTypes.parse(request.headers.get(TWITCH_MESSAGE_TYPE));
  switch (messageType) {
    case "webhook_callback_verification": {
      const challengeMessage = TwitchChallengeSchema.parse(result);
      return new Response(challengeMessage.challenge, { status: 200, headers: { "Content-Type": "text/plain" }});
    }
    case "revocation": {
      console.warn("Subscription revoked:", result);
      return new Response(null, { status: 204 });
    }
    case "notification": {
      const notification = TwitchNotificationSchema.safeParse(result);
      if (!notification.success) {
        console.error("Failed to process notification", notification.error.format());
        return new Response("Unable to parse notification message.", { status: 400 });
      }
      return notification.data;
    }
    default: {
      throw new Error("Unknown message type received");
    }
  }
}

async function validateTwitchRequest(request: Party.Request, secret: string): Promise<unknown> {
    const message = await request.text();

    if (!verifyMessageHmac(message, request.headers, secret)) {
      return new Response("Unable to validate HMAC", { status: 403 });
    }

    return JSON.parse(message);
}

async function verifyMessageHmac(message: string, headers: Headers, secret: string) {
    const incomingHmacRaw = `${headers.get(TWITCH_MESSAGE_ID)}${headers.get(TWITCH_MESSAGE_TIMESTAMP)}${message}`;

    const signature = headers.get(TWITCH_MESSAGE_SIGNATURE)!;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        {
            name: 'HMAC',
            hash: { name: 'SAH-256' },
        },
        false,
        ['verify']
    );

    return crypto.subtle.verify(
        { name: 'HASH', hash: { name: 'SHA-256' } },
        key,
        hexBuffer(signature.startsWith(HMAC_PREFIX) ? signature.slice(HMAC_PREFIX.length) : signature),
        encoder.encode(incomingHmacRaw)
    );
}

export function hexBuffer(hex: string): ArrayBuffer {
    const bytes = hex.match(/.{1,2}/g) ?? [];
    return Uint8Array.from(bytes.map((byte) => parseInt(byte, 16)));
}
