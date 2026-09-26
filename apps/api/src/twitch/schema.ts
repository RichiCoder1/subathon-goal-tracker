import { z } from "zod";
export const TwitchGetUsersResponseSchema = z.object({
  data: z.array(
    z.object({ id: z.string(), login: z.string(), display_name: z.string() }),
  ),
});
export const TwitchAuthResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
});
export const TwitchSubscriptionsListResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      type: z.string(),
      condition: z.record(z.string(), z.string()),
      transport: z.object({
        method: z.string(),
        callback: z.string().optional(),
      }),
    }),
  ),
  pagination: z.object({ cursor: z.string().optional() }).default({}),
});
const subscription = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  condition: z.object({ broadcaster_user_id: z.string() }),
  transport: z.object({ method: z.string(), callback: z.string() }),
  created_at: z.string(),
});
export const TwitchChallengeSchema = z.object({
  challenge: z.string(),
  subscription,
});
const broadcaster = z.object({
  broadcaster_user_id: z.string(),
  broadcaster_user_login: z.string(),
  broadcaster_user_name: z.string(),
});
const user = broadcaster.extend({
  user_id: z.string(),
  user_login: z.string(),
  user_name: z.string(),
});
const anonymous = broadcaster.extend({
  user_id: z.string().nullable(),
  user_login: z.string().nullable(),
  user_name: z.string().nullable(),
});
const tier = z.enum(["1000", "2000", "3000"]);
export const SubscriptionEventSchema = user.extend({
  tier,
  is_gift: z.boolean(),
});
export const SubscriptionGiftEventSchema = anonymous.extend({
  tier,
  total: z.number().int().positive(),
  is_anonymous: z.boolean(),
  cumulative_total: z.number().nullable().optional(),
});
export const CheerEventSchema = anonymous.extend({
  bits: z.number().int().positive(),
  is_anonymous: z.boolean(),
  message: z.string(),
});
export const SubscriptionMessageEventSchema = user.extend({
  tier,
  cumulative_months: z.number(),
  streak_months: z.number().nullable(),
  duration_months: z.number(),
  message: z.unknown().optional(),
});
export const BitsUseEventSchema = user.extend({
  bits: z.number().int().positive(),
  type: z.enum(["cheer", "power_up", "custom_power_up"]),
  power_up: z.unknown().optional(),
  custom_power_up: z.unknown().optional(),
  message: z.unknown().optional(),
});
export const TwitchNotificationSchema = z.union([
  z.object({
    subscription: subscription.extend({ type: z.literal("channel.subscribe") }),
    event: SubscriptionEventSchema,
  }),
  z.object({
    subscription: subscription.extend({
      type: z.literal("channel.subscription.gift"),
    }),
    event: SubscriptionGiftEventSchema,
  }),
  z.object({
    subscription: subscription.extend({
      type: z.literal("channel.subscription.message"),
    }),
    event: SubscriptionMessageEventSchema,
  }),
  z.object({
    subscription: subscription.extend({ type: z.literal("channel.cheer") }),
    event: CheerEventSchema,
  }),
  z.object({
    subscription: subscription.extend({ type: z.literal("channel.bits.use") }),
    event: BitsUseEventSchema,
  }),
]);
export type TwitchNotification = z.output<typeof TwitchNotificationSchema>;
export type SubscriptionEvent = z.output<typeof SubscriptionEventSchema>;
export type SubscriptionGiftEvent = z.output<
  typeof SubscriptionGiftEventSchema
>;
export type SubscriptionMessageEvent = z.output<
  typeof SubscriptionMessageEventSchema
>;
export type CheerEvent = z.output<typeof CheerEventSchema>;
