import z from "zod";

export const GoalSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(200),
  target: z.number().int().positive(),
});
export type Goal = z.output<typeof GoalSchema>;

export const TimeIncrementValuesSchema = z.object({
  tier1Seconds: z.number().positive(),
  tier2Seconds: z.number().positive(),
  tier3Seconds: z.number().positive(),
  bitsStep: z.number().int().positive(),
  bitsStepSecond: z.number().nonnegative(),
});
export type IncrementValues = z.output<typeof TimeIncrementValuesSchema>;

const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const AppearanceSchema = z.object({
  timerColor: ColorSchema.default("#fdff42"),
  goalColor: ColorSchema.default("#ffffff"),
  previewBackground: ColorSchema.default("#7edeff"),
});
export type Appearance = z.output<typeof AppearanceSchema>;
export const AppearanceUpdateSchema = z.object({
  type: z.literal("subathon.appearance.update"),
  appearance: AppearanceSchema,
});
export const SetupSubathonSchema = z.object({
  type: z.literal("subathon.setup"),
  operationId: z.uuid(),
  expectedCampaignId: z.string(),
  startingTimeInSeconds: z.number().int().positive(),
  maxAdditionalSeconds: z.number().nonnegative(),
  incrementValues: TimeIncrementValuesSchema,
  goals: z.array(GoalSchema).max(100),
});
export type SetupSubathon = z.output<typeof SetupSubathonSchema>;

export const IncrementTuple = z.object({
  id: z.string(),
  userName: z.string(),
  value: z.number(),
  occurredAt: z.string().optional(),
  receivedAt: z.string().optional(),
  source: z.enum(["twitch", "recovery", "manual"]).optional(),
  eventType: z.string().optional(),
  note: z.string().optional(),
  secondsAdded: z.number().optional(),
});

export const IncrementsSchema = z.object({
  tier1: z.array(IncrementTuple),
  tier2: z.array(IncrementTuple),
  tier3: z.array(IncrementTuple),
  bits: z.array(IncrementTuple),
});
export type Increments = z.output<typeof IncrementsSchema>;

export const UpdateSubathonSettingsSchema = z.object({
  type: z.literal("subathon.settings.update"),
  goals: z.array(GoalSchema).optional(),
  maxAdditionalSeconds: z.number().nonnegative(),
  incrementValues: TimeIncrementValuesSchema,
});
export type UpdateSubathonSettings = z.output<
  typeof UpdateSubathonSettingsSchema
>;

export const SubathonUpdatedMessageSchema = z.object({
  type: z.literal("subathon.updated"),
  remainingTimeInSeconds: z.number().nonnegative(),
  endingAt: z.number().nullable(),
  pausedAt: z.number().nullable(),
  goals: z.array(GoalSchema),
  incrementValues: TimeIncrementValuesSchema,
  increments: IncrementsSchema,
  maxAdditionalSeconds: z.number().nonnegative(),
  timeAddedInSeconds: z.number().default(0),
  startingTimeInSeconds: z.number().default(14400),
  campaignId: z.string().default("legacy"),
  appearance: AppearanceSchema.prefault({}),
});
export type SubathonUpdatedMessage = z.output<
  typeof SubathonUpdatedMessageSchema
>;

export const SubathonStartMessageSchema = z.object({
  type: z.literal("subathon.start"),
});

export const SubathonPausedMessageSchema = z.object({
  type: z.literal("subathon.pause"),
  pausedAt: z
    .number()
    .optional()
    .default(() => new Date().valueOf()),
});

export const SubathonResetMessageSchema = z.object({
  type: z.literal("subathon.reset"),
  remainingTimeInSeconds: z.number().nonnegative(),
});

export const IncrementsUpdatedSchema = z.object({
  type: z.literal("subathon.increments.updated"),
  incrementCounts: IncrementsSchema,
});

export const IncrementsResetSchema = z.object({
  type: z.literal("subathon.increments.reset"),
});

export const TickMessageSchema = z.object({
  type: z.literal("subathon.tick"),
  remainingTimeInSeconds: z.number().nonnegative(),
  endingAt: z.number(),
});

export const AddTimeMessageSchema = z.object({
  type: z.literal("subathon.time.add"),
  timeInSeconds: z.number(),
});

export const SetMaxAdditionalSecondsMessageSchema = z.object({
  type: z.literal("subathon.maxAdditionalSeconds.set"),
  maxAdditionalSeconds: z.number().nonnegative(),
});

export const AddGoalMessageSchema = z.object({
  type: z.literal("subathon.goal.add"),
  name: z.string().trim().min(1).max(200),
  target: z.number().int().positive(),
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
  broadcasterId: z.string(),
});

export const EventSubSubscriptionsSchema = z.object({
  type: z.literal("subathon.twitch.subscriptions"),
  subscriptions: z.array(
    z
      .object({
        type: z.string(),
      })
      .passthrough(),
  ),
});

export const BroadcasterResponseSchema = z.object({
  broadcasterId: z.string(),
});

export const RecoverySchema = z.object({
  type: z.literal("subathon.recovery.apply"),
  batchId: z.string().min(1).max(100),
  note: z.string().min(1).max(1000),
  entries: z
    .array(
      z.object({
        id: z.string().min(1).max(150),
        userName: z.string().trim().min(1).max(100),
        kind: z.enum(["tier1", "tier2", "tier3", "bits"]),
        value: z.number().int().positive(),
        occurredAt: z.iso.datetime(),
        note: z.string().max(500).optional(),
      }),
    )
    .max(500),
  // Optional independently verified timer correction. It never changes totals.
  timeAdjustmentSeconds: z.number().int().optional(),
  // Correct a late timer start without changing how much time was earned.
  elapsedAdjustmentSeconds: z.number().nonnegative().optional(),
});
export const MessageErrorSchema = z.object({
  type: z.literal("message.error"),
  message: z.string(),
});
export const MessageAckSchema = z.object({
  type: z.literal("message.ack"),
  action: z.string(),
  message: z.string(),
});

export const ServerMessageSchema = z.union([
  SubathonUpdatedMessageSchema,
  SubathonStartMessageSchema,
  IncrementsUpdatedSchema,
  SubathonPausedMessageSchema,
  TickMessageSchema,
  EventSubSubscriptionsSchema,
  MessageErrorSchema,
  MessageAckSchema,
]);
export type ServerMessage = z.output<typeof ServerMessageSchema>;

export const ClientMessageSchema = z.union([
  AppearanceUpdateSchema,
  SetupSubathonSchema,
  UpdateSubathonSettingsSchema,
  SubathonStartMessageSchema,
  SubathonPausedMessageSchema,
  SubathonResetMessageSchema,
  AddTimeMessageSchema,
  AddGoalMessageSchema,
  RemoveGoalMessageSchema,
  SetMaxAdditionalSecondsMessageSchema,
  GetSubscriptionsSchema,
  SetupSubscriptionsSchema,
  RemoveSubscriptionsSchema,
  IncrementsResetSchema,
  RecoverySchema,
]);
export type ClientMessage = z.output<typeof ClientMessageSchema>;

export const MessageSchema = z.union([
  ServerMessageSchema,
  ClientMessageSchema,
]);
export type Message = z.output<typeof MessageSchema>;
