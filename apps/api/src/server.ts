import type * as Party from "partykit/server";
import { prettifyError } from "zod";
import { parseMessage } from "./utils";
import { stringify } from "superjson";
import type {
  Goal,
  Increments,
  IncrementValues,
  ServerMessage,
  SubathonUpdatedMessage,
} from "@subathon-goal-tracker/messages/schema";
import { isTwitchWebhook, processTwitchWebhook } from "./twitch/webhook";
import {
  TwitchAuthResponseSchema,
  TwitchGetUsersResponseSchema,
  TwitchSubscriptionsListResponseSchema,
  type CheerEvent,
  type SubscriptionEvent,
  type SubscriptionGiftEvent,
  type SubscriptionMessageEvent,
  type TwitchNotification,
} from "./twitch/schema";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { HTTPError, default as ky, type KyInstance } from "ky";
import { v7 } from "uuid";

dayjs.extend(duration);

const SUBATHON_DEFAULTS = {
  timeInSeconds: 4 * 60 * 60,
  goals: [] as Goal[],
  incrementValues: {
    tier1Seconds: 60,
    tier2Seconds: 60,
    tier3Seconds: 60,
    bitsStep: 100,
    bitsStepSecond: 60,
  },
  increments: {
    tier1: [],
    tier2: [],
    tier3: [],
    bits: [],
  },
};

export default class SubathonServer implements Party.Server {
  subathonTimeInSeconds: number = 4 * 60 * 60;
  goals: Goal[] = [];
  incrementValues = structuredClone(SUBATHON_DEFAULTS.incrementValues);
  endingAt: number | null = null;
  pausedAt: number | null = null;
  timeAddedInSeconds: number = 0;
  maxAdditionalSeconds: number = 0;
  increments: Increments = structuredClone(SUBATHON_DEFAULTS.increments);

  twitchApi: KyInstance;

  static version = "v1.7";

  constructor(readonly room: Party.Room) {
    this.twitchApi = ky.create({
      prefixUrl: room.env.TWITCH_BASE_URL as string,
      headers: {
        "Client-Id": room.env.TWITCH_CLIENT_ID as string,
      },
      hooks: {
        beforeRequest: [
          async (request) => {
            const result = await ky("https://id.twitch.tv/oauth2/token", {
              method: "post",
              searchParams: {
                client_id: room.env.TWITCH_CLIENT_ID as string,
                client_secret: room.env.TWITCH_CLIENT_SECRET as string,
                grant_type: "client_credentials",
              },
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
            });
            const credentials = await result.json();
            const authResponse = TwitchAuthResponseSchema.parse(credentials);

            request.headers.set(
              "Authorization",
              `Bearer ${authResponse.access_token}`,
            );
          },
        ],
      },
    });
  }

  async onStart(): Promise<void> {
    const storageVersion = await this.room.storage.get<string>("version");
    if (storageVersion !== SubathonServer.version) {
      await this.room.storage.deleteAll();
      await this.room.storage.put("version", SubathonServer.version);
    }

    this.subathonTimeInSeconds = (await this.room.storage.get<number>(
      "subathonTimeInSeconds",
    )) ??  SUBATHON_DEFAULTS.timeInSeconds;
    this.goals = (await this.room.storage.get<Goal[]>("goals")) ?? [];
    this.incrementValues = (await this.room.storage.get<IncrementValues>(
      "incrementValues",
    )) ?? structuredClone(SUBATHON_DEFAULTS.incrementValues);
    this.endingAt = (await this.room.storage.get<number>("endingAt")) ?? dayjs('2026-03-02T17:05:00.000-06:00').valueOf();
    this.pausedAt = (await this.room.storage.get<number>("pausedAt")) ?? null;
    this.timeAddedInSeconds =
      (await this.room.storage.get<number>("timeAddedInSeconds")) ?? 0;
    this.maxAdditionalSeconds =
      (await this.room.storage.get<number>("maxAdditionalSeconds")) ?? 0;
    this.increments = (await this.room.storage.get<Increments>(
      "increments",
    )) ?? structuredClone(SUBATHON_DEFAULTS.increments);
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    conn.send(
      stringify({
        type: "subathon.updated",
        goals: this.goals,
        remainingTimeInSeconds: this.calculateRemainingTime(),
        endingAt: this.endingAt,
        pausedAt: this.pausedAt,
        incrementValues: this.incrementValues,
        increments: this.increments,
        maxAdditionalSeconds: this.maxAdditionalSeconds,
      } satisfies SubathonUpdatedMessage),
    );
  }

  async onMessage(rawMessage: string, sender: Party.Connection) {
    const parsedMessage = parseMessage(rawMessage);

    if (parsedMessage.success == false) {
      console.error(
        `Failed to parse error.`,
        prettifyError(parsedMessage.error),
      );
      sender.send(
        stringify({
          type: "message.error",
          message: prettifyError(parsedMessage.error),
          error: parsedMessage.error,
        }),
      );
      return;
    }

    const message = parsedMessage.data;
    console.log(`Received Message: ${message.type}`);
    switch (message.type) {
      case "subathon.settings.update":
        {
          await this.room.storage.transaction(async (storage) => {
            await storage.put("goals", message.goals);
            await storage.put("incrementValues", message.incrementValues);
            await storage.put(
              "maxAdditionalSeconds",
              message.maxAdditionalSeconds,
            );
          });
          this.goals = message.goals;
          this.incrementValues = message.incrementValues;
          this.maxAdditionalSeconds = message.maxAdditionalSeconds;
        }
        break;
      case "subathon.start":
        {
          if (this.endingAt == null) {
            this.endingAt = dayjs()
              .add(this.subathonTimeInSeconds, "seconds")
              .valueOf();
          }
          console.log({ end: this.endingAt });
          await this.room.storage.put("endingAt", this.endingAt);
          await this.startTimer();
          this.broadcastMessage(message);
        }
        break;
      case "subathon.pause":
        {
          await this.stopTimer(message.pausedAt);
          this.broadcastMessage(message);
        }
        break;
      case "subathon.reset":
        {
          await this.stopTimer(null);
          await this.room.storage.delete([
            "remainingTimeInSeconds",
            "endingAt",
            "pausedAt",
            "secondsAdded",
            "timeAddedInSeconds",
          ]);
          this.endingAt = null;
          this.pausedAt = null;
          this.subathonTimeInSeconds = message.remainingTimeInSeconds;
          this.timeAddedInSeconds = 0;
          this.broadcastUpdate();
        }
        break;
      case "subathon.increments.reset":
        {
          this.increments = structuredClone(SUBATHON_DEFAULTS.increments);
          console.log({ increments: this.increments })
          await this.room.storage.delete("increments");
          this.broadcastUpdate();
        }
        break;
      case "subathon.time.add":
        {
          if (
            this.maxAdditionalSeconds > 0 &&
            this.timeAddedInSeconds + message.timeInSeconds >
              this.maxAdditionalSeconds
          ) {
            message.timeInSeconds =
              this.maxAdditionalSeconds - this.timeAddedInSeconds;
            this.timeAddedInSeconds = this.maxAdditionalSeconds;
          } else {
            this.timeAddedInSeconds += message.timeInSeconds;
          }
          this.endingAt = dayjs(this.endingAt)
            .add(message.timeInSeconds, "seconds")
            .valueOf();

          this.broadcastMessage({
            type: "subathon.tick",
            remainingTimeInSeconds: this.calculateRemainingTime(),
            endingAt: this.endingAt!,
          });
          this.room.storage.put("timeAddedInSeconds", this.timeAddedInSeconds);
        }
        break;
      case "subathon.goal.add":
        {
          this.goals.push({
            id: v7(),
            name: message.name,
            target: message.target,
          });
          await this.room.storage.put("goals", this.goals);
          this.broadcastUpdate();
        }
        break;
      case "subathon.goal.remove":
        {
          const goalIndex = this.goals.findIndex(
            (goal) => goal.id == message.id,
          );
          this.goals.splice(goalIndex, 1);
          await this.room.storage.put("goals", this.goals);
          this.broadcastUpdate();
        }
        break;
      case "subathon.maxAdditionalSeconds.set":
        {
          await this.room.storage.put(
            "maxAdditionalSeconds",
            message.maxAdditionalSeconds,
          );
          this.maxAdditionalSeconds = message.maxAdditionalSeconds;
        }
        break;
      case "subathon.twitch.subscriptions.get":
        {
          const response = await this.twitchApi("eventsub/subscriptions");
          const subscriptions = TwitchSubscriptionsListResponseSchema.parse(
            await response.json(),
          );

          sender.send(
            stringify({
              type: "subathon.twitch.subscriptions",
              subscriptions: subscriptions.data,
            }),
          );
        }
        break;
      case "subathon.twitch.subscriptions.create":
        {
          const eventTypes = [
            "channel.subscribe",
            "channel.cheer",
            "channel.subscription.gift",
          ];
          for (const eventType of eventTypes) {
            try {
              const response = await this.twitchApi(`eventsub/subscriptions`, {
                method: "post",
                json: {
                  type: eventType,
                  version: "1",
                  condition: {
                    broadcaster_user_id: message.broadcasterId,
                  },
                  transport: {
                    method: "webhook",
                    callback: message.callbackUrl,
                    secret: this.room.env.TWITCH_SECRET as string,
                  },
                },
              });
            } catch (e) {
              if (e instanceof HTTPError) {
                const response = await e.response.text();
                console.error(`Failed to subscribe:`, response);
              }
              throw e;
            }
          }
          const response = await this.twitchApi("eventsub/subscriptions");
          const subscriptions = TwitchSubscriptionsListResponseSchema.parse(
            await response.json(),
          );

          sender.send(
            stringify({
              type: "subathon.twitch.subscriptions",
              subscriptions: subscriptions.data,
            }),
          );
        }
        break;
      case "subathon.twitch.subscriptions.remove":
        {
          const response = await this.twitchApi("eventsub/subscriptions");
          const subscriptions = TwitchSubscriptionsListResponseSchema.parse(
            await response.json(),
          );

          const broadcasterSubs = subscriptions.data.filter(
            (sub) =>
              "broadcaster_user_id" in sub.condition &&
              sub.condition.broadcaster_user_id == message.broadcasterId,
          );

          for (const sub of broadcasterSubs) {
            await this.twitchApi("eventsub/subscriptions", {
              method: "delete",
              searchParams: {
                id: sub.id,
              },
            });
          }
        }
        break;
    }
  }

  async onAlarm(): Promise<void> {
    if (this.pausedAt) {
      return;
    }

    let remainingTime = Math.max(
      dayjs(this.endingAt).diff(undefined, "seconds"),
      0,
    );

    this.broadcastMessage({
      type: "subathon.tick",
      remainingTimeInSeconds: remainingTime,
      endingAt: this.endingAt!,
    });

    if (remainingTime > 0) {
      await this.room.storage.setAlarm(Date.now() + 1000);
    }
  }

  async onRequest(req: Party.Request): Promise<Response> {
    if (req.method == "POST" && isTwitchWebhook(req)) {
      const result = await processTwitchWebhook(req, this.room.env);

      if (result instanceof Response) {
        return result;
      }

      await this.handleTwitchNotification(req, result);
      return new Response(null, { status: 200 });
    }

    const reqUrl = new URL(req.url);
    if (
      req.method == "GET" &&
      reqUrl.searchParams.get("query")?.includes("broadcaster")
    ) {
      const response = await this.twitchApi("users", {
        searchParams: { login: reqUrl.searchParams.get("login")! },
      });
      const json = await response.json();
      const users = TwitchGetUsersResponseSchema.parse(json);

      const broadcaster = users.data[0];
      return Response.json({
        broadcasterId: broadcaster.id,
      });
    }

    return new Response("404", { status: 404 });
  }

  private async broadcastUpdate() {
    this.broadcastMessage({
      type: "subathon.updated",
      goals: this.goals,
      remainingTimeInSeconds: this.calculateRemainingTime(),
      endingAt: this.endingAt,
      pausedAt: this.pausedAt,
      incrementValues: this.incrementValues,
      increments: this.increments,
      maxAdditionalSeconds: this.maxAdditionalSeconds,
    });
  }

  private calculateRemainingTime() {
    let remainingTime = 0;
    if (this.endingAt) {
      if (this.pausedAt) {
        let timeToEnd = dayjs(this.endingAt).diff();
        let pauseTime = dayjs().diff(this.pausedAt);
        remainingTime = dayjs
          .duration(timeToEnd + pauseTime, "milliseconds")
          .asSeconds();
      } else {
        remainingTime = dayjs(this.endingAt).diff(undefined, "seconds");
      }
    } else {
      remainingTime = this.subathonTimeInSeconds;
    }
    return Math.max(remainingTime, 0);
  }

  private async startTimer() {
    if (this.pausedAt) {
      const timeSincePause = dayjs().diff(this.pausedAt);
      console.log({ timeSincePause });
      this.endingAt = dayjs(this.endingAt)
        .add(timeSincePause, "milliseconds")
        .valueOf();
      await this.room.storage.put("endingAt", this.endingAt);
      await this.room.storage.delete("pausedAt");
      this.pausedAt = null;
    }

    this.room.storage.setAlarm(dayjs().add(1, "second").toDate());
  }

  private async stopTimer(pausedAt: number | null) {
    this.pausedAt = pausedAt ?? dayjs().valueOf();
    await this.room.storage.put("endingAt", this.endingAt);
    await this.room.storage.put("pausedAt", this.pausedAt);
    await this.room.storage.deleteAlarm();
  }

  private async handleTwitchNotification(
    req: Party.Request,
    notification: TwitchNotification,
  ) {
    // Don't process twitch notifications while subathon is in-active.
    if (this.endingAt == null) {
      console.log("Subathon not started, skipping event.");
      return;
    }

    if (dayjs(this.endingAt).isBefore()) {
      console.log("Subathon Passed, skipping event.");
      return;
    }

    const updateIncrements = async (
      updateFn: (current: Increments) => Increments,
    ) => {
      const updatedIncrements = updateFn(this.increments);
      await this.room.storage.put("increments", updatedIncrements);
      await this.room.storage.put("endingAt", this.endingAt);
      this.increments = updatedIncrements;
      this.broadcastMessage({
        type: "subathon.increments.updated",
        incrementCounts: this.increments,
      });
      await this.broadcastUpdate();
    };

    const addTime = (seconds: number) => {
      let timeToAdd = 0;
      if (this.timeAddedInSeconds + seconds >= this.maxAdditionalSeconds) {
        timeToAdd = this.maxAdditionalSeconds - this.timeAddedInSeconds;
      } else {
        timeToAdd = seconds;
      }
      if (timeToAdd <= 0) {
        console.log("Ignoring time add, already at max.");
        return false;
      }

      this.endingAt = dayjs(this.endingAt).add(timeToAdd, "seconds").valueOf();
      this.timeAddedInSeconds += seconds;
      this.room.storage.put("timeAddedInSeconds", this.timeAddedInSeconds);
      this.room.storage.put("endingAt", this.endingAt);
      return true;
    };

    switch (notification.subscription.type) {
      case "channel.subscribe":
        {
          const event = notification.event as SubscriptionEvent;
          console.info(
            `New subscription from ${event.user_name}. Tier ${event.tier} | Gift ${event.is_gift}.`,
          );
          if (event.is_gift) {
            console.info("Skipping gift sub.");
            break;
          }
          await updateIncrements((inc) => {
            switch (event.tier) {
              case "1000":
                {
                  addTime(this.incrementValues.tier1Seconds);
                  inc.tier1.push({
                    id: v7(),
                    userName: event.user_name,
                    value: 1,
                  });
                }
                break;
              case "2000":
                {
                  addTime(this.incrementValues.tier2Seconds);
                  inc.tier2.push({
                    id: v7(),
                    userName: event.user_name,
                    value: 1,
                  });
                }
                break;
              case "3000": {
                addTime(this.incrementValues.tier3Seconds);
                inc.tier3.push({
                  id: v7(),
                  userName: event.user_name,
                  value: 1,
                });
              }
              default:
                {
                  addTime(this.incrementValues.tier1Seconds);
                  inc.tier1.push({
                    id: v7(),
                    userName: event.user_name,
                    value: 1,
                  });
                }
                break;
            }
            return inc;
          });
        }
        break;
      case "channel.cheer":
        {
          const event = notification.event as CheerEvent;
          console.log(`New cheer from ${event.user_name} | ${event.bits}`);
          if (event.bits < this.incrementValues.bitsStep) {
            break;
          }
          await updateIncrements((inc) => {
            let seconds =
              Math.floor(event.bits / this.incrementValues.bitsStep) *
              this.incrementValues.bitsStepSecond;
            addTime(seconds);
            inc.bits.push({
              id: v7(),
              userName: event.user_name,
              value: event.bits,
            });
            return inc;
          });
        }
        break;
      case "channel.subscription.gift":
        {
          const event = notification.event as SubscriptionGiftEvent;
          console.info(
            `Gift sub event: ${event.user_name} | ${event.total} | ${event.tier}`,
          );

          await updateIncrements((inc) => {
            switch (event.tier) {
              case "1000":
                {
                  addTime(this.incrementValues.tier1Seconds * event.total);
                  inc.tier1.push({
                    id: v7(),
                    userName: event.user_name ?? "anonymous",
                    value: event.total,
                  });
                }
                break;
              case "2000":
                {
                  addTime(this.incrementValues.tier2Seconds * event.total);
                  inc.tier2.push({
                    id: v7(),
                    userName: event.user_name ?? "anonymous",
                    value: event.total,
                  });
                }
                break;
              case "3000":
                {
                  addTime(this.incrementValues.tier3Seconds * event.total);
                  inc.tier3.push({
                    id: v7(),
                    userName: event.user_name ?? "anonymous",
                    value: event.total,
                  });
                }
                break;
            }
            return inc;
          });
        }
        break;
      case "channel.subscription.message":
        {
          const event = notification.event as SubscriptionMessageEvent;
          console.info(`Resub event: ${event.user_name} | ${event.tier}`);

          await updateIncrements((inc) => {
            switch (event.tier) {
              case "1000":
                {
                  addTime(this.incrementValues.tier1Seconds);
                  inc.tier1.push({
                    id: v7(),
                    userName: event.user_name,
                    value: 1,
                  });
                }
                break;
              case "2000":
                {
                  addTime(this.incrementValues.tier2Seconds);
                  inc.tier2.push({
                    id: v7(),
                    userName: event.user_name,
                    value: 1,
                  });
                }
                break;
              case "3000":
                {
                  addTime(this.incrementValues.tier3Seconds);
                  inc.tier3.push({
                    id: v7(),
                    userName: event.user_name,
                    value: 1,
                  });
                }
                break;
              default: {
                addTime(this.incrementValues.tier1Seconds);
                inc.tier1.push({
                  id: v7(),
                  userName: event.user_name,
                  value: 1,
                });
              }
            }
            return inc;
          });
        }
        break;
    }
  }

  private broadcastMessage(message: ServerMessage) {
    this.room.broadcast(stringify(message));
  }
}

SubathonServer satisfies Party.Worker;
