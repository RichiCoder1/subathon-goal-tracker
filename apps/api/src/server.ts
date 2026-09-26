import type * as Party from "partykit/server";
import { parseMessage } from "./utils";
import { stringify } from "superjson";
import {
  type Goal,
  type Increments,
  type IncrementValues,
  type ServerMessage,
  type ClientMessage,
  type SubathonUpdatedMessage,
  RecoverySchema,
  AppearanceSchema,
} from "@subathon-goal-tracker/messages/schema";
import { verifyEditorToken } from "@subathon-goal-tracker/messages/access";
import {
  isTwitchWebhook,
  processTwitchWebhook,
  MESSAGE_ID,
  MESSAGE_TIMESTAMP,
} from "./twitch/webhook";
import {
  TwitchAuthResponseSchema,
  TwitchGetUsersResponseSchema,
  TwitchSubscriptionsListResponseSchema,
  type TwitchNotification,
} from "./twitch/schema";
import ky, { HTTPError, type KyInstance } from "ky";
import { v7 } from "uuid";

const emptyIncrements = (): Increments => ({
  tier1: [],
  tier2: [],
  tier3: [],
  bits: [],
});
const eventTypes = [
  "channel.subscribe",
  "channel.subscription.gift",
  "channel.subscription.message",
  "channel.cheer",
  "channel.bits.use",
];
type Entry = Increments["tier1"][number];
type ConnectionState = { canEdit: boolean; expiresAt: number; login?: string };

export default class SubathonServer implements Party.Server {
  subathonTimeInSeconds = 14400;
  goals: Goal[] = [];
  incrementValues: IncrementValues = {
    tier1Seconds: 150,
    tier2Seconds: 150,
    tier3Seconds: 150,
    bitsStep: 100,
    bitsStepSecond: 60,
  };
  endingAt: number | null = null;
  pausedAt: number | null = null;
  timeAddedInSeconds = 0;
  maxAdditionalSeconds = 72000;
  increments = emptyIncrements();
  appearance = AppearanceSchema.parse({});
  campaignId = "legacy";
  private campaignCreatedAt = 0;
  twitchApi: KyInstance;
  static version = "v1.7"; // Existing room data is migrated additively, never cleared on deploy.
  private queue: Promise<unknown> = Promise.resolve();
  private token: { value: string; expiresAt: number } | null = null;
  private channelId = "";

  private identifyChannel(request: { url: string }) {
    // PartyKit 0.0.115 can wake via an alarm before initializing room.id.
    // Requests are already routed to this Durable Object by this URL segment.
    const channel = new URL(request.url).pathname.split("/")[3];
    if (!channel || !/^[a-z0-9_]{1,25}$/.test(channel))
      throw new Error("Invalid channel.");
    this.channelId = channel;
  }

  constructor(readonly room: Party.Room) {
    this.twitchApi = ky.create({
      prefix: room.env.TWITCH_BASE_URL as string,
      headers: { "Client-Id": room.env.TWITCH_CLIENT_ID as string },
      hooks: {
        beforeRequest: [
          async ({ request }) => {
            if (!this.token || this.token.expiresAt < Date.now()) {
              const result = TwitchAuthResponseSchema.parse(
                await ky
                  .post("https://id.twitch.tv/oauth2/token", {
                    body: new URLSearchParams({
                      client_id: room.env.TWITCH_CLIENT_ID as string,
                      client_secret: room.env.TWITCH_CLIENT_SECRET as string,
                      grant_type: "client_credentials",
                    }),
                  })
                  .json(),
              );
              this.token = {
                value: result.access_token,
                expiresAt: Date.now() + (result.expires_in - 60) * 1000,
              };
            }
            request.headers.set("Authorization", `Bearer ${this.token.value}`);
          },
        ],
      },
    });
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.queue.then(fn);
    this.queue = task.catch(() => {});
    return task;
  }
  async onStart() {
    this.appearance = AppearanceSchema.parse(
      (await this.room.storage.get("appearance")) ?? {},
    );
    this.campaignId =
      (await this.room.storage.get<string>("campaignId")) ?? "legacy";
    this.campaignCreatedAt =
      (await this.room.storage.get<number>("campaignCreatedAt")) ?? 0;
    this.subathonTimeInSeconds =
      (await this.room.storage.get<number>("subathonTimeInSeconds")) ?? 14400;
    this.goals = (await this.room.storage.get<Goal[]>("goals")) ?? [];
    this.incrementValues =
      (await this.room.storage.get<IncrementValues>("incrementValues")) ??
      this.incrementValues;
    this.endingAt = (await this.room.storage.get<number>("endingAt")) ?? null;
    this.pausedAt = (await this.room.storage.get<number>("pausedAt")) ?? null;
    this.timeAddedInSeconds =
      (await this.room.storage.get<number>("timeAddedInSeconds")) ?? 0;
    this.maxAdditionalSeconds =
      (await this.room.storage.get<number>("maxAdditionalSeconds")) ?? 72000;
    this.increments =
      (await this.room.storage.get<Increments>("increments")) ??
      emptyIncrements();
    // Legacy arrays stay readable; all new contributions use individual storage keys.
    const entries = await this.room.storage.list<{
      kind: keyof Increments;
      entry: Entry;
    }>({ prefix: "contribution:" });
    for (const { kind, entry } of entries.values())
      if (!this.increments[kind].some((i) => i.id === entry.id))
        this.increments[kind].push(entry);
    if (
      this.endingAt !== null &&
      this.pausedAt === null &&
      this.calculateRemainingTime() > 0
    )
      await this.room.storage.setAlarm(Date.now() + 1000);
  }
  private snapshot(): SubathonUpdatedMessage {
    return {
      type: "subathon.updated",
      goals: this.goals,
      remainingTimeInSeconds: this.calculateRemainingTime(),
      endingAt: this.endingAt,
      pausedAt: this.pausedAt,
      incrementValues: this.incrementValues,
      increments: this.increments,
      maxAdditionalSeconds: this.maxAdditionalSeconds,
      timeAddedInSeconds: this.timeAddedInSeconds,
      startingTimeInSeconds: this.subathonTimeInSeconds,
      appearance: this.appearance,
      campaignId: this.campaignId,
    };
  }
  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    this.identifyChannel(ctx.request);
    const claims = await verifyEditorToken(
      this.room.env.EDITOR_SECRET as string,
      this.channelId,
      new URL(ctx.request.url).searchParams.get("token"),
    );
    conn.setState({
      canEdit: !!claims,
      expiresAt: claims?.expiresAt ?? 0,
      login: claims?.login,
    });
    conn.send(stringify(this.snapshot()));
  }
  async onMessage(rawMessage: string, sender: Party.Connection) {
    return this.serial(async () => {
      const state = sender.state as ConnectionState | null;
      if (!state?.canEdit || state.expiresAt <= Date.now()) {
        sender.send(
          stringify({
            type: "message.error",
            message:
              "Your editing session expired. Reconnect or sign in again.",
          }),
        );
        return;
      }
      const parsed = parseMessage(rawMessage);
      if (!parsed.success) {
        sender.send(
          stringify({
            type: "message.error",
            message: "Check the values and try again. No changes were saved.",
          }),
        );
        return;
      }
      try {
        await this.handleCommand(parsed.data, sender);
        this.broadcastUpdate();
        sender.send(
          stringify({
            type: "message.ack",
            action: parsed.data.type,
            message:
              parsed.data.type === "subathon.recovery.apply"
                ? "Recovery saved."
                : "Changes saved.",
          }),
        );
      } catch (error) {
        console.error(
          "Subathon command failed",
          parsed.data.type,
          error instanceof Error ? error.message : "unknown",
        );
        // A failed transaction never leaves speculative state in memory.
        await this.onStart();
        sender.send(
          stringify({
            type: "message.error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to save. Reconnect and try again.",
          }),
        );
      }
    });
  }
  private async handleCommand(
    message: ClientMessage,
    sender: Party.Connection,
  ) {
    switch (message.type) {
      case "subathon.appearance.update": {
        const appearance = AppearanceSchema.parse({
          ...this.appearance,
          ...message.appearance,
        });
        await this.room.storage.put("appearance", appearance);
        this.appearance = appearance;
        break;
      }
      case "subathon.setup": {
        // A lost acknowledgement must never cause a second reset.
        if (await this.room.storage.get(`setup:${message.operationId}`)) break;
        if (message.expectedCampaignId !== this.campaignId)
          throw new Error(
            "Another editor already set up a new subathon. Reload before continuing.",
          );
        if (
          this.endingAt !== null &&
          this.pausedAt === null &&
          this.calculateRemainingTime() > 0
        )
          throw new Error("Pause the timer before setting up a new subathon.");
        const archiveId = v7();
        const campaignCreatedAt = Date.now();
        const { increments, ...previous } = this.snapshot();
        await this.room.storage.transaction(async (storage) => {
          // Archive individually to stay below Durable Object per-value limits.
          await storage.put(`campaign-archive:${archiveId}`, {
            ...previous,
            savedAt: new Date().toISOString(),
          });
          for (const [kind, entries] of Object.entries(increments))
            for (const entry of entries)
              await storage.put(`archive:${archiveId}:${entry.id}`, {
                kind,
                entry,
              });
          const keys = await storage.list({ prefix: "contribution:" });
          const allKeys = [...keys.keys()];
          for (let i = 0; i < allKeys.length; i += 128)
            await storage.delete(allKeys.slice(i, i + 128));
          await storage.delete("increments");
          await storage.put({
            campaignId: message.operationId,
            campaignCreatedAt,
            subathonTimeInSeconds: message.startingTimeInSeconds,
            endingAt: null,
            pausedAt: null,
            timeAddedInSeconds: 0,
            maxAdditionalSeconds: message.maxAdditionalSeconds,
            incrementValues: message.incrementValues,
            goals: message.goals,
            [`setup:${message.operationId}`]: archiveId,
          });
          await storage.deleteAlarm();
        });
        this.campaignId = message.operationId;
        this.campaignCreatedAt = campaignCreatedAt;
        this.subathonTimeInSeconds = message.startingTimeInSeconds;
        this.endingAt = this.pausedAt = null;
        this.timeAddedInSeconds = 0;
        this.increments = emptyIncrements();
        this.goals = message.goals;
        this.incrementValues = message.incrementValues;
        this.maxAdditionalSeconds = message.maxAdditionalSeconds;
        break;
      }
      case "subathon.settings.update": {
        await this.room.storage.transaction(async (storage) => {
          if (message.goals) await storage.put("goals", message.goals);
          await storage.put("incrementValues", message.incrementValues);
          await storage.put(
            "maxAdditionalSeconds",
            message.maxAdditionalSeconds,
          );
        });
        if (message.goals) this.goals = message.goals;
        this.incrementValues = message.incrementValues;
        this.maxAdditionalSeconds = message.maxAdditionalSeconds;
        break;
      }
      case "subathon.start": {
        if (this.endingAt === null)
          this.endingAt = Date.now() + this.subathonTimeInSeconds * 1000;
        else if (this.pausedAt !== null)
          this.endingAt += Date.now() - this.pausedAt;
        this.pausedAt = null;
        await this.persistTimer();
        await this.room.storage.setAlarm(Date.now() + 1000);
        break;
      }
      case "subathon.pause": {
        if (this.endingAt !== null && this.pausedAt === null) {
          this.pausedAt = Date.now();
          await this.persistTimer();
        }
        await this.room.storage.deleteAlarm();
        break;
      }
      case "subathon.reset": {
        await this.room.storage.put(`timer-backup:${v7()}`, {
          ...this.timerState(),
          savedAt: new Date().toISOString(),
        });
        this.endingAt = null;
        this.pausedAt = null;
        this.subathonTimeInSeconds = message.remainingTimeInSeconds;
        this.timeAddedInSeconds = 0;
        await this.persistTimer();
        await this.room.storage.deleteAlarm();
        break;
      }
      case "subathon.increments.reset": {
        const archive = v7();
        await this.room.storage.transaction(async (storage) => {
          for (const [kind, entries] of Object.entries(this.increments))
            for (const entry of entries)
              await storage.put(`archive:${archive}:${entry.id}`, {
                kind,
                entry,
              });
          const keys = await storage.list({ prefix: "contribution:" });
          if (keys.size) await storage.delete([...keys.keys()]);
          await storage.delete("increments");
        });
        this.increments = emptyIncrements();
        break;
      }
      case "subathon.time.add": {
        this.addTime(message.timeInSeconds, true);
        await this.persistTimer();
        if (
          this.endingAt !== null &&
          this.pausedAt === null &&
          this.calculateRemainingTime() > 0
        )
          await this.room.storage.setAlarm(Date.now() + 1000);
        break;
      }
      case "subathon.goal.add": {
        const goals = [
          ...this.goals,
          { id: v7(), name: message.name, target: message.target },
        ];
        await this.room.storage.put("goals", goals);
        this.goals = goals;
        break;
      }
      case "subathon.goal.remove": {
        const goals = this.goals.filter((g) => g.id !== message.id);
        await this.room.storage.put("goals", goals);
        this.goals = goals;
        break;
      }
      case "subathon.maxAdditionalSeconds.set": {
        await this.room.storage.put(
          "maxAdditionalSeconds",
          message.maxAdditionalSeconds,
        );
        this.maxAdditionalSeconds = message.maxAdditionalSeconds;
        break;
      }
      case "subathon.recovery.apply": {
        await this.applyRecovery(message);
        if (
          this.endingAt !== null &&
          this.pausedAt === null &&
          this.calculateRemainingTime() > 0
        )
          await this.room.storage.setAlarm(Date.now() + 1000);
        break;
      }
      case "subathon.twitch.subscriptions.get": {
        await this.sendSubscriptions(sender);
        break;
      }
      case "subathon.twitch.subscriptions.create": {
        const broadcaster = await this.broadcaster();
        if (message.broadcasterId !== broadcaster.id)
          throw new Error("The broadcaster does not match this tracker.");
        const callback = new URL(message.callbackUrl);
        if (
          callback.protocol !== "https:" ||
          callback.pathname !== `/parties/main/${this.channelId}` ||
          callback.search ||
          callback.hash ||
          callback.username ||
          callback.password
        )
          throw new Error("Invalid webhook callback.");
        const expectedHost =
          (this.room.env.CALLBACK_HOST as string) ||
          "api.richicoder1.partykit.dev";
        if (callback.host !== expectedHost)
          throw new Error("The callback must use this tracker’s webhook host.");
        const existing = await this.listSubscriptions();
        for (const type of eventTypes) {
          if (
            existing.some(
              (s) =>
                s.type === type &&
                s.condition.broadcaster_user_id === broadcaster.id &&
                s.transport.callback === callback.href &&
                ["enabled", "webhook_callback_verification_pending"].includes(
                  s.status,
                ),
            )
          )
            continue;
          try {
            await this.twitchApi.post("eventsub/subscriptions", {
              json: {
                type,
                version: "1",
                condition: { broadcaster_user_id: broadcaster.id },
                transport: {
                  method: "webhook",
                  callback: callback.href,
                  secret: this.room.env.TWITCH_SECRET,
                },
              },
            });
          } catch (error) {
            if (error instanceof HTTPError && error.response.status === 409)
              continue;
            throw new Error(
              `Could not connect ${type}. The broadcaster may need to sign in to Twitch again.`,
            );
          }
        }
        await this.sendSubscriptions(sender);
        break;
      }
      case "subathon.twitch.subscriptions.remove": {
        const broadcaster = await this.broadcaster();
        if (message.broadcasterId !== broadcaster.id)
          throw new Error("The broadcaster does not match this tracker.");
        for (const sub of await this.listSubscriptions())
          if (
            sub.condition.broadcaster_user_id === broadcaster.id &&
            sub.transport.callback &&
            new URL(sub.transport.callback).pathname ===
              `/parties/main/${this.channelId}` &&
            eventTypes.includes(sub.type)
          )
            await this.twitchApi.delete("eventsub/subscriptions", {
              searchParams: { id: sub.id },
            });
        await this.sendSubscriptions(sender);
        break;
      }
    }
  }
  private timerState() {
    return {
      endingAt: this.endingAt,
      pausedAt: this.pausedAt,
      subathonTimeInSeconds: this.subathonTimeInSeconds,
      timeAddedInSeconds: this.timeAddedInSeconds,
    };
  }
  private async persistTimer() {
    await this.room.storage.put(this.timerState());
  }
  private calculateRemainingTime() {
    return this.endingAt === null
      ? this.subathonTimeInSeconds
      : Math.max(
          0,
          Math.ceil((this.endingAt - (this.pausedAt ?? Date.now())) / 1000),
        );
  }
  private addTime(seconds: number, reviveExpired = false) {
    const positiveRoom =
      this.maxAdditionalSeconds === 0
        ? Infinity
        : Math.max(0, this.maxAdditionalSeconds - this.timeAddedInSeconds);
    const applied =
      seconds >= 0
        ? Math.min(seconds, positiveRoom)
        : Math.max(seconds, -this.calculateRemainingTime());
    if (this.endingAt === null)
      this.subathonTimeInSeconds = Math.max(
        0,
        this.subathonTimeInSeconds + applied,
      );
    else {
      // Manual additions revive a finished timer from zero. Historical recovery
      // still adjusts the original deadline, including time already elapsed.
      if (reviveExpired && applied > 0)
        this.endingAt = Math.max(this.endingAt, this.pausedAt ?? Date.now());
      this.endingAt += applied * 1000;
    }
    this.timeAddedInSeconds = Math.max(0, this.timeAddedInSeconds + applied);
    return applied;
  }
  async onAlarm() {
    if (this.pausedAt !== null || this.endingAt === null) return;
    const remaining = this.calculateRemainingTime();
    this.broadcastMessage({
      type: "subathon.tick",
      remainingTimeInSeconds: remaining,
      endingAt: this.endingAt,
    });
    if (remaining > 0) await this.room.storage.setAlarm(Date.now() + 1000);
  }
  async onRequest(req: Party.Request): Promise<Response> {
    this.identifyChannel(req);
    if (req.method === "POST" && isTwitchWebhook(req)) {
      const result = await processTwitchWebhook(req, this.room.env);
      if (result instanceof Response) return result;
      if (
        result.event.broadcaster_user_login.toLowerCase() !==
          this.channelId.toLowerCase() ||
        result.subscription.condition.broadcaster_user_id !==
          result.event.broadcaster_user_id
      )
        return new Response("Wrong broadcaster", { status: 403 });
      await this.serial(() => this.handleTwitchNotification(req, result));
      return new Response(null, { status: 204 });
    }
    const url = new URL(req.url);
    if (
      req.method === "GET" &&
      url.searchParams.get("query") === "broadcaster"
    ) {
      const broadcaster = await this.broadcaster();
      return Response.json({ broadcasterId: broadcaster.id });
    }
    if (req.method === "GET" && url.searchParams.get("query") === "stream") {
      const result = await this.twitchApi("streams", {
        searchParams: { user_login: this.channelId },
      }).json<{ data: { id: string; started_at: string }[] }>();
      return Response.json({
        stream: result.data[0]
          ? { id: result.data[0].id, startedAt: result.data[0].started_at }
          : null,
      });
    }
    return new Response("Not found", { status: 404 });
  }
  private async handleTwitchNotification(
    req: Party.Request,
    notification: TwitchNotification,
  ) {
    const id = req.headers.get(MESSAGE_ID)!;
    if (await this.room.storage.get(`event:${id}`)) return;
    const type = notification.subscription.type;
    const event = notification.event;
    let kind: keyof Increments;
    let value: number;
    if (
      (type === "channel.subscribe" && "is_gift" in event && event.is_gift) ||
      (type === "channel.bits.use" && "type" in event && event.type === "cheer")
    ) {
      await this.room.storage.put(`event:${id}`, {
        notification,
        outcome: "covered-by-other-event",
        receivedAt: new Date().toISOString(),
      });
      return;
    }
    if ("bits" in event) {
      kind = "bits";
      value = event.bits;
    } else {
      kind =
        event.tier === "3000"
          ? "tier3"
          : event.tier === "2000"
            ? "tier2"
            : "tier1";
      value = "total" in event ? event.total : 1;
    }
    const receivedAt = new Date().toISOString();
    const occurredAt = req.headers.get(MESSAGE_TIMESTAMP) ?? receivedAt;
    if (Date.parse(occurredAt) < this.campaignCreatedAt) {
      await this.room.storage.put(`event:${id}`, {
        notification,
        occurredAt,
        receivedAt,
        outcome: "before-current-campaign",
      });
      return;
    }
    if (this.endingAt === null || this.calculateRemainingTime() <= 0) {
      await this.room.storage.put(`event:${id}`, {
        notification,
        occurredAt,
        receivedAt,
        outcome: "pending-inactive",
      });
      return;
    }
    const before = this.timerState();
    const seconds = this.contributionSeconds(kind, value);
    const entry: Entry = {
      id,
      userName: event.user_name ?? "Anonymous",
      value,
      occurredAt,
      receivedAt,
      source: "twitch",
      eventType: type,
      secondsAdded: this.addTime(seconds),
    };
    try {
      await this.room.storage.transaction(async (storage) => {
        await storage.put(`event:${id}`, {
          notification,
          occurredAt,
          receivedAt,
          outcome: "counted",
        });
        await storage.put(`contribution:${id}`, { kind, entry });
        await storage.put(this.timerState());
      });
    } catch (error) {
      Object.assign(this, before);
      throw error;
    }
    this.increments[kind].push(entry);
    this.broadcastUpdate();
  }
  private contributionSeconds(kind: keyof Increments, value: number) {
    if (kind !== "bits") return value * this.incrementValues[`${kind}Seconds`];
    const total = this.increments.bits.reduce((s, e) => s + e.value, 0);
    return (
      (Math.floor((total + value) / this.incrementValues.bitsStep) -
        Math.floor(total / this.incrementValues.bitsStep)) *
      this.incrementValues.bitsStepSecond
    );
  }
  private async applyRecovery(
    message: Extract<ClientMessage, { type: "subathon.recovery.apply" }>,
  ) {
    const marker = `recovery:${message.batchId}`;
    if (await this.room.storage.get(marker)) return;
    const prior = this.timerState();
    const increments = structuredClone(this.increments);
    const added: { kind: keyof Increments; entry: Entry }[] = [];
    for (const item of message.entries) {
      if (
        Object.values(this.increments).some((entries) =>
          entries.some((entry) => entry.id === item.id),
        )
      )
        continue;
      const seconds = this.contributionSeconds(item.kind, item.value);
      const entry: Entry = {
        ...item,
        source: "recovery",
        receivedAt: new Date().toISOString(),
        secondsAdded: this.addTime(seconds),
        note: item.note ?? message.note,
      };
      this.increments[item.kind].push(entry);
      added.push({ kind: item.kind, entry });
    }
    if (message.timeAdjustmentSeconds)
      this.addTime(message.timeAdjustmentSeconds);
    if (message.elapsedAdjustmentSeconds && this.endingAt !== null)
      this.endingAt -= message.elapsedAdjustmentSeconds * 1000;
    try {
      await this.room.storage.transaction(async (storage) => {
        await storage.put(marker, {
          note: message.note,
          appliedAt: new Date().toISOString(),
          previousTimer: prior,
          entryIds: added.map((e) => e.entry.id),
          timeAdjustmentSeconds: message.timeAdjustmentSeconds ?? 0,
          elapsedAdjustmentSeconds: message.elapsedAdjustmentSeconds ?? 0,
        });
        for (const item of added)
          await storage.put(`contribution:${item.entry.id}`, item);
        await storage.put(this.timerState());
      });
    } catch (error) {
      Object.assign(this, prior);
      this.increments = increments;
      throw error;
    }
  }
  private async broadcaster() {
    const response = TwitchGetUsersResponseSchema.parse(
      await this.twitchApi("users", {
        searchParams: { login: this.channelId },
      }).json(),
    );
    if (!response.data[0]) throw new Error("Twitch channel not found.");
    return response.data[0];
  }
  private async listSubscriptions() {
    const all: ReturnType<
      typeof TwitchSubscriptionsListResponseSchema.parse
    >["data"] = [];
    let after: string | undefined;
    do {
      const result = TwitchSubscriptionsListResponseSchema.parse(
        await this.twitchApi("eventsub/subscriptions", {
          searchParams: after ? { after } : {},
        }).json(),
      );
      all.push(...result.data);
      after = result.pagination.cursor;
    } while (after);
    return all;
  }
  private async sendSubscriptions(sender: Party.Connection) {
    const broadcaster = await this.broadcaster();
    const subscriptions = (await this.listSubscriptions()).filter(
      (s) => s.condition.broadcaster_user_id === broadcaster.id,
    );
    sender.send(
      stringify({ type: "subathon.twitch.subscriptions", subscriptions }),
    );
  }
  private broadcastUpdate() {
    this.broadcastMessage(this.snapshot());
  }
  private broadcastMessage(message: ServerMessage) {
    this.room.broadcast(stringify(message));
  }
}
SubathonServer satisfies Party.Worker;
