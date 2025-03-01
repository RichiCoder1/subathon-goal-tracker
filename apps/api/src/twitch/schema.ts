import { z } from 'zod';

export const TwitchGetUsersResponseSchema = z.object({
    data: z.array(
        z.object({
            id: z.string(),
            login: z.string(),
            display_name: z.string(),
            type: z.string(),
            broadcaster_type: z.string(),
            description: z.string(),
            profile_image_url: z.string(),
            offline_image_url: z.string(),
            view_count: z.number(),
            email: z.string().optional(),
            created_at: z.string(),
        })
    ),
});

export const TwitchAuthResponseSchema = z.object({
    access_token: z.string(),
    expires_in: z.number(),
    token_type: z.string(),
});

export const TwitchSubscriptionsListResponseSchema = z.object({
    data: z.array(
        z.union([
            z.object({
                id: z.string(),
                status: z.string(),
                type: z.string(),
                version: z.string(),
                cost: z.number(),
                condition: z.object({ broadcaster_user_id: z.string() }),
                created_at: z.string(),
                transport: z.object({ method: z.string(), callback: z.string() }),
            }),
            z.object({
                id: z.string(),
                status: z.string(),
                type: z.string(),
                version: z.string(),
                cost: z.number(),
                condition: z.object({ user_id: z.string() }),
                created_at: z.string(),
                transport: z.object({ method: z.string(), callback: z.string() }),
            }),
        ])
    ),
    total: z.number(),
    total_cost: z.number(),
    max_total_cost: z.number(),
    pagination: z.object({}),
});

export const TwitchMessageTypesSchema = z.union([
    z.literal('notification'),
    z.literal('webhook_callback_verification'),
    z.literal('revocation'),
]);

export const TwitchChallengeSchema = z.object({
    challenge: z.string(),
    subscription: z.object({
        id: z.string(),
        status: z.string(),
        type: z.string(),
        version: z.string(),
        cost: z.number(),
        condition: z.object({ broadcaster_user_id: z.string() }),
        transport: z.object({ method: z.string(), callback: z.string() }),
        created_at: z.string(),
    }),
});

export const CheerEventSchema = z.object({
    is_anonymous: z.boolean(),
    user_id: z.string(),
    user_login: z.string(),
    user_name: z.string(),
    broadcaster_user_id: z.string(),
    broadcaster_user_login: z.string(),
    broadcaster_user_name: z.string(),
    message: z.string(),
    bits: z.number(),
});
export type CheerEvent = z.output<typeof CheerEventSchema>;

export const SubscriptionEventSchema = z.object({
    user_id: z.string(),
    user_login: z.string(),
    user_name: z.string(),
    broadcaster_user_id: z.string(),
    broadcaster_user_login: z.string(),
    broadcaster_user_name: z.string(),
    tier: z.string(),
    is_gift: z.boolean(),
});
export type SubscriptionEvent = z.output<typeof SubscriptionEventSchema>;

export const SubscriptionGiftEventSchema = z.object({
    user_id: z.string(),
    user_login: z.string(),
    user_name: z.string(),
    broadcaster_user_id: z.string(),
    broadcaster_user_login: z.string(),
    broadcaster_user_name: z.string(),
    total: z.number(),
    tier: z.string(),
    cumulative_total: z.number(),
    is_anonymous: z.boolean(),
});
export type SubscriptionGiftEvent = z.output<typeof SubscriptionGiftEventSchema>;

export const SubscriptionMessageEventSchema = z.object({
    user_id: z.string(),
    user_login: z.string(),
    user_name: z.string(),
    broadcaster_user_id: z.string(),
    broadcaster_user_login: z.string(),
    broadcaster_user_name: z.string(),
    tier: z.string(),
    message: z.object({
        text: z.string(),
        emotes: z.array(z.object({ begin: z.number(), end: z.number(), id: z.string() })),
    }),
    cumulative_months: z.number(),
    streak_months: z.number(),
    duration_months: z.number(),
});
export type SubscriptionMessageEvent = z.output<typeof SubscriptionMessageEventSchema>;

export const TwitchNotificationSchema = z.object({
    subscription: z.object({
        id: z.string(),
        status: z.string(),
        type: z.string(),
        version: z.string(),
        cost: z.number(),
        condition: z.object({ broadcaster_user_id: z.string() }),
        transport: z.object({ method: z.string(), callback: z.string() }),
        created_at: z.string(),
    }),
    event: z.union([SubscriptionGiftEventSchema, SubscriptionEventSchema, CheerEventSchema, SubscriptionMessageEventSchema]),
});
export type TwitchNotification = z.output<typeof TwitchNotificationSchema>;
