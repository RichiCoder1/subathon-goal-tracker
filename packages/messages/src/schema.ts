import z from 'zod';

export const GoalSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    target: z.number().positive(),
});
export type Goal = z.output<typeof GoalSchema>;

export const TimeIncrementValuesSchema = z.object({
    tier1Seconds: z.number().positive(),
    tier2Seconds: z.number().positive(),
    tier3Seconds: z.number().positive(),
    bitsStep: z.number().positive(),
    bitsStepSecond: z.number(),
});
export type IncrementValues = z.output<typeof TimeIncrementValuesSchema>;

export const IncrementTuple = z.object({
    id: z.string(),
    userName: z.string(),
    value: z.number(),
});

export const IncrementsSchema = z.object({
    tier1: z.array(IncrementTuple),
    tier2: z.array(IncrementTuple),
    tier3: z.array(IncrementTuple),
    bits: z.array(IncrementTuple),
});
export type Increments = z.output<typeof IncrementsSchema>;

export const UpdateSubathonSettingsSchema = z.object({
    type: z.literal('subathon.settings.update'),
    goals: z.array(GoalSchema),
    incrementValues: TimeIncrementValuesSchema,
});
export type UpdateSubathonSettings = z.output<typeof UpdateSubathonSettingsSchema>;

export const SubathonUpdatedMessageSchema = z.object({
    type: z.literal('subathon.updated'),
    remainingTimeInSeconds: z.number().nonnegative(),
    endingAt: z.number().nullable(),
    pausedAt: z.number().nullable(),
    goals: z.array(GoalSchema),
    incrementValues: TimeIncrementValuesSchema,
    increments: IncrementsSchema,
});
export type SubathonUpdatedMessage = z.output<typeof SubathonUpdatedMessageSchema>;

export const SubathonStartMessageSchema = z.object({
    type: z.literal('subathon.start'),
});

export const SubathonPausedMessageSchema = z.object({
    type: z.literal('subathon.pause'),
    pausedAt: z.number().optional().default(() => new Date().valueOf()),
});

export const SubathonResetMessageSchema = z.object({
    type: z.literal('subathon.reset'),
    remainingTimeInSeconds: z.number().nonnegative(),
});

export const IncrementsUpdatedSchema = z.object({
    type: z.literal('subathon.increments.updated'),
    incrementCounts: IncrementsSchema,
});

export const IncrementsResetSchema = z.object({
    type: z.literal('subathon.increments.reset'),
});

export const TickMessageSchema = z.object({
    type: z.literal('subathon.tick'),
    remainingTimeInSeconds: z.number().nonnegative(),
    endingAt: z.number()
});

export const AddTimeMessageSchema = z.object({
    type: z.literal('subathon.time.add'),
    timeInSeconds: z.number(),
});

export const AddGoalMessageSchema = z.object({
    type: z.literal('subathon.goal.add'),
    name: z.string(),
    target: z.number().positive(),
});

export const RemoveGoalMessageSchema = z.object({
    type: z.literal("subathon.goal.remove"),
    id: z.string(),
});

export const GetSubscriptionsSchema = z.object({
    type: z.literal("subathon.twitch.subscriptions.get"),
});

export const SetupSubscriptionsSchema = z.object({
    type: z.literal("subathon.twitch.subscriptions.create"),
    callbackUrl: z.string(),
    broadcasterId: z.string(),
});

export const RemoveSubscriptionsSchema = z.object({
    type: z.literal("subathon.twitch.subscriptions.remove"),
    broadcasterId: z.string()
});

export const EventSubSubscriptionsSchema = z.object({
    type: z.literal("subathon.twitch.subscriptions"),
    subscriptions: z.array(z.object({
        type: z.string(),
    }).passthrough())
});

export const BroadcasterResponseSchema = z.object({
    broadcasterId: z.string(),
});

export const ServerMessageSchema = z.union([
    SubathonUpdatedMessageSchema,
    SubathonStartMessageSchema,
    IncrementsUpdatedSchema,
    SubathonPausedMessageSchema,
    TickMessageSchema,
    EventSubSubscriptionsSchema
]);
export type ServerMessage = z.output<typeof ServerMessageSchema>;

export const ClientMessageSchema = z.union([
    UpdateSubathonSettingsSchema,
    SubathonStartMessageSchema,
    SubathonPausedMessageSchema,
    SubathonResetMessageSchema,
    AddTimeMessageSchema,
    AddGoalMessageSchema,
    RemoveGoalMessageSchema,
    GetSubscriptionsSchema,
    SetupSubscriptionsSchema,
    RemoveSubscriptionsSchema,
    IncrementsResetSchema,
]);
export type ClientMessage = z.output<typeof ClientMessageSchema>;

export const MessageSchema = z.union([ServerMessageSchema, ClientMessageSchema]);
export type Message = z.output<typeof MessageSchema>;
