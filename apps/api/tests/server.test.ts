import { test } from "node:test";
import assert from "node:assert/strict";
import { stringify, parse } from "superjson";
import Server from "../src/server";
import {
  createEditorToken,
  verifyEditorToken,
} from "../../../packages/messages/src/access";
import { processTwitchWebhook } from "../src/twitch/webhook";
import { TwitchNotificationSchema } from "../src/twitch/schema";

const now = Date.now();
function fixture(extra: Record<string, unknown> = {}) {
  const data = new Map<string, any>(
    Object.entries({
      version: "v1.7",
      endingAt: now + 14400000,
      maxAdditionalSeconds: 72000,
      ...extra,
    }),
  );
  const broadcasts: any[] = [];
  const alarms: number[] = [];
  const storage: any = {
    get: async (key: string) => structuredClone(data.get(key)),
    list: async ({ prefix }: { prefix: string }) =>
      new Map(
        [...data]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => [key, structuredClone(value)]),
      ),
    put: async (key: any, value: any) => {
      if (typeof key === "string") data.set(key, structuredClone(value));
      else
        for (const [k, v] of Object.entries(key))
          data.set(k, structuredClone(v));
    },
    delete: async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) data.delete(key);
    },
    deleteAll: async () => data.clear(),
    setAlarm: async (time: number) => {
      alarms.push(time);
    },
    deleteAlarm: async () => {},
    transaction: async (fn: any) => {
      const before = structuredClone(data);
      try {
        return await fn(storage);
      } catch (error) {
        data.clear();
        for (const [key, value] of before) data.set(key, value);
        throw error;
      }
    },
  };
  const room: any = {
    id: "7imberwolf",
    env: {
      TWITCH_BASE_URL: "https://api.twitch.tv/helix/",
      TWITCH_SECRET: "test-secret",
    },
    storage,
    broadcast: (s: string) => broadcasts.push(parse(s)),
  };
  const sender: any = {
    state: { canEdit: true, expiresAt: now + 3600000 },
    send: (s: string) => broadcasts.push(parse(s)),
  };
  return { server: new Server(room), data, broadcasts, sender, room, alarms };
}
function notification(
  type = "channel.subscription.gift",
  extra: Record<string, unknown> = {},
) {
  return {
    subscription: {
      id: "subscription",
      type,
      version: "1",
      status: "enabled",
      cost: 0,
      condition: { broadcaster_user_id: "123" },
      transport: { method: "webhook", callback: "https://example.com" },
      created_at: new Date(now).toISOString(),
    },
    event: {
      broadcaster_user_id: "123",
      broadcaster_user_login: "7imberwolf",
      broadcaster_user_name: "7imberwolf",
      user_id: "456",
      user_login: "gifter",
      user_name: "Gifter",
      tier: "1000",
      total: 5,
      cumulative_total: 5,
      is_anonymous: false,
      is_gift: false,
      ...extra,
    },
  };
}
async function deliver(
  server: Server,
  body: any,
  id: string = crypto.randomUUID(),
) {
  const req = new Request("https://example.com/parties/main/7imberwolf", {
    headers: {
      "Twitch-Eventsub-Message-Id": id,
      "Twitch-Eventsub-Message-Timestamp": new Date(now).toISOString(),
    },
  });
  await (server as any).handleTwitchNotification(req, body);
}
test("a retried gift is counted exactly once", async () => {
  const { server } = fixture();
  await server.onStart();
  await deliver(server, notification(), "same-message");
  await deliver(server, notification(), "same-message");
  assert.equal(
    server.increments.tier1.reduce((s, i) => s + i.value, 0),
    5,
  );
});
test("small cheers accumulate across events and retain attribution", async () => {
  const { server } = fixture();
  await server.onStart();
  const end = server.endingAt!;
  await deliver(
    server,
    notification("channel.cheer", { bits: 40, message: "" }),
  );
  await deliver(
    server,
    notification("channel.cheer", { bits: 60, message: "" }),
  );
  assert.equal(server.endingAt, end + 60000);
  assert.equal(server.increments.bits.length, 2);
});
test("tier 3 subscriptions count once", async () => {
  const { server } = fixture();
  await server.onStart();
  await deliver(server, notification("channel.subscribe", { tier: "3000" }));
  assert.equal(server.increments.tier3.length, 1);
  assert.equal(server.increments.tier1.length, 0);
});
test("manual time changes survive a restart", async () => {
  const f = fixture();
  await f.server.onStart();
  const end = f.server.endingAt!;
  await f.server.onMessage(
    stringify({ type: "subathon.time.add", timeInSeconds: 60 }),
    f.sender,
  );
  const restarted = new Server(f.room);
  await restarted.onStart();
  assert.equal(restarted.endingAt, end + 60000);
});
test("manual additions revive expired timers from now and survive a restart", async () => {
  const { server, sender, room, broadcasts, alarms } = fixture({
    endingAt: Date.now() - 600000,
  });
  await server.onStart();
  const requestedAt = Date.now();
  await server.onMessage(
    stringify({ type: "subathon.time.add", timeInSeconds: 300 }),
    sender,
  );
  assert.ok(server.endingAt! >= requestedAt + 300000);
  assert.ok(server.endingAt! <= Date.now() + 300000);
  assert.equal(server.timeAddedInSeconds, 300);
  assert.equal(
    broadcasts.findLast((x) => x.type === "subathon.updated")
      .remainingTimeInSeconds,
    300,
  );
  assert.equal(alarms.length, 1);
  const restarted = new Server(room);
  await restarted.onStart();
  assert.equal(restarted.endingAt, server.endingAt);
  assert.equal(restarted.timeAddedInSeconds, 300);
});

test("reviving a timer still respects the cap and pause state", async () => {
  const expiredAt = Date.now() - 600000;
  for (const [earned, applied] of [
    [72000, 0],
    [71900, 100],
  ]) {
    const { server, sender, alarms } = fixture({
      endingAt: expiredAt,
      timeAddedInSeconds: earned,
    });
    await server.onStart();
    await server.onMessage(
      stringify({ type: "subathon.time.add", timeInSeconds: 300 }),
      sender,
    );
    assert.equal(server.timeAddedInSeconds, earned + applied);
    assert.equal(alarms.length, applied ? 1 : 0);
    if (!applied) assert.equal(server.endingAt, expiredAt);
  }
  const pausedAt = Date.now() - 300000;
  const { server, sender, alarms } = fixture({ endingAt: expiredAt, pausedAt });
  await server.onStart();
  await server.onMessage(
    stringify({ type: "subathon.time.add", timeInSeconds: 300 }),
    sender,
  );
  assert.equal(server.pausedAt, pausedAt);
  assert.equal(server.endingAt, pausedAt + 300000);
  assert.equal(alarms.length, 0);
});

test("recovery revives ticking without discarding elapsed time or repeating credits", async () => {
  const expiredAt = Date.now() - 600000;
  const { server, sender, alarms, broadcasts } = fixture({
    endingAt: expiredAt,
  });
  await server.onStart();
  const command = stringify({
    type: "subathon.recovery.apply",
    batchId: "revive-finished",
    note: "Verified timer correction",
    entries: [],
    timeAdjustmentSeconds: 900,
  });
  await server.onMessage(command, sender);
  assert.equal(server.endingAt, expiredAt + 900000);
  assert.equal(server.timeAddedInSeconds, 900);
  assert.equal(alarms.length, 1);
  await server.onAlarm();
  const tick = broadcasts.findLast((x) => x.type === "subathon.tick");
  assert.ok(
    tick.remainingTimeInSeconds > 0 && tick.remainingTimeInSeconds <= 300,
  );
  assert.equal(alarms.length, 2);
  await server.onMessage(command, sender);
  assert.equal(server.endingAt, expiredAt + 900000);
  assert.equal(server.timeAddedInSeconds, 900);
});

test("recovery does not start a paused or not-yet-started timer", async () => {
  for (const timer of [
    { endingAt: null, pausedAt: null },
    { endingAt: Date.now() - 600000, pausedAt: Date.now() - 900000 },
  ]) {
    const { server, sender, alarms } = fixture(timer);
    await server.onStart();
    await server.onMessage(
      stringify({
        type: "subathon.recovery.apply",
        batchId: "stopped-recovery",
        note: "Verified timer correction",
        entries: [],
        timeAdjustmentSeconds: 60,
      }),
      sender,
    );
    assert.equal(alarms.length, 0);
    assert.equal(server.pausedAt, timer.pausedAt);
    if (timer.endingAt === null) assert.equal(server.endingAt, null);
  }
});

test("paused overnight contributions still count", async () => {
  const { server } = fixture({
    endingAt: now - 3600000,
    pausedAt: now - 7200000,
  });
  await server.onStart();
  await deliver(server, notification());
  assert.equal(server.increments.tier1.length, 1);
});
test("an unknown goal removal does not remove another goal", async () => {
  const { server, sender } = fixture({
    goals: [{ id: crypto.randomUUID(), name: "Keep me", target: 50 }],
  });
  await server.onStart();
  await server.onMessage(
    stringify({ type: "subathon.goal.remove", id: "missing" }),
    sender,
  );
  assert.equal(server.goals.length, 1);
});
test("storage version changes never erase contributions", async () => {
  const { server } = fixture({
    version: "old",
    increments: {
      tier1: [{ id: "legacy", userName: "Gifter", value: 20 }],
      tier2: [],
      tier3: [],
      bits: [],
    },
  });
  await server.onStart();
  assert.equal(server.increments.tier1[0]?.value, 20);
});
test("recovery is additive, attributed, and safe to retry after a restart", async () => {
  const f = fixture();
  await f.server.onStart();
  await deliver(f.server, notification(), "live-event");
  const command = {
    type: "subathon.recovery.apply",
    batchId: "verified-opening",
    note: "Twitch activity feed",
    entries: [
      {
        id: "recovered-event",
        kind: "tier1",
        userName: "OriginalGifter",
        value: 20,
        occurredAt: new Date(now - 600000).toISOString(),
      },
    ],
  };
  await f.server.onMessage(stringify(command), f.sender);
  const restarted = new Server(f.room);
  await restarted.onStart();
  await restarted.onMessage(stringify(command), f.sender);
  assert.equal(
    restarted.increments.tier1.reduce((s, i) => s + i.value, 0),
    25,
  );
  assert.equal(
    restarted.increments.tier1.find((e) => e.id === "recovered-event")
      ?.userName,
    "OriginalGifter",
  );
});
test("anonymous cheers and bit effects accumulate without double counting cheers", async () => {
  const { server } = fixture();
  await server.onStart();
  const end = server.endingAt!;
  await deliver(
    server,
    notification("channel.cheer", {
      bits: 50,
      is_anonymous: true,
      user_name: null,
    }),
  );
  await deliver(
    server,
    notification("channel.bits.use", { bits: 50, type: "cheer" }),
  );
  await deliver(
    server,
    notification("channel.bits.use", { bits: 50, type: "power_up" }),
  );
  assert.equal(
    server.increments.bits.reduce((s, e) => s + e.value, 0),
    100,
  );
  assert.equal(server.endingAt, end + 60000);
});
test("cap credits only the applied seconds and still counts the full gift", async () => {
  const { server } = fixture({ maxAdditionalSeconds: 100 });
  await server.onStart();
  await deliver(server, notification());
  assert.equal(server.timeAddedInSeconds, 100);
  assert.equal(server.increments.tier1[0].value, 5);
});
test("inactive events are retained for recovery", async () => {
  const { server, data } = fixture({ endingAt: null });
  await server.onStart();
  await deliver(server, notification(), "pending-event");
  assert.equal(server.increments.tier1.length, 0);
  assert.equal(data.get("event:pending-event")?.outcome, "pending-inactive");
});
test("public overlay connections cannot change the timer", async () => {
  const { server } = fixture();
  await server.onStart();
  const end = server.endingAt;
  await server.onMessage(
    stringify({ type: "subathon.time.add", timeInSeconds: 600 }),
    { state: null, send: () => {} } as any,
  );
  assert.equal(server.endingAt, end);
});
test("editor tokens are signed and scoped to a room", async () => {
  const token = await createEditorToken("secret", "7imberwolf", "morocodes");
  assert.ok(await verifyEditorToken("secret", "7imberwolf", token));
  assert.equal(await verifyEditorToken("other", "7imberwolf", token), null);
  assert.equal(await verifyEditorToken("secret", "other-room", token), null);
});
test("webhook signature verification accepts signed payloads and rejects tampering", async () => {
  const body = JSON.stringify(notification());
  const id = "verified-id";
  const timestamp = new Date().toISOString();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode("test-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = Array.from(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(id + timestamp + body),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const headers = {
    "Twitch-Eventsub-Message-Id": id,
    "Twitch-Eventsub-Message-Timestamp": timestamp,
    "Twitch-Eventsub-Message-Signature": "sha256=" + sig,
    "Twitch-Eventsub-Message-Type": "notification",
  };
  const valid = await processTwitchWebhook(
    new Request("https://example.com", {
      method: "POST",
      headers,
      body,
    }) as any,
    { TWITCH_SECRET: "test-secret" },
  );
  assert.equal(valid instanceof Response, false);
  const invalid = await processTwitchWebhook(
    new Request("https://example.com", {
      method: "POST",
      headers,
      body: body + " ",
    }) as any,
    { TWITCH_SECRET: "test-secret" },
  );
  assert.equal((invalid as Response).status, 403);
});

test("editor connections work when PartyKit wakes through an alarm without room.id", async () => {
  const f = fixture();
  f.room.env.EDITOR_SECRET = "test-secret";
  Object.defineProperty(f.room, "id", {
    get() {
      throw new Error("Party.id is not yet initialized");
    },
  });
  const token = await createEditorToken(
    "test-secret",
    "7imberwolf",
    "morocodes",
  );
  const conn: any = {
    setState: (value: any) => {
      conn.state = value;
    },
    send: () => {},
  };
  await f.server.onStart();
  await f.server.onConnect(conn, {
    request: new Request(
      "https://example.com/parties/main/7imberwolf?token=" +
        encodeURIComponent(token),
    ),
  } as any);
  assert.equal(conn.state.canEdit, true);
});

test("custom Power-up payloads are accepted and credited", async () => {
  const f = fixture();
  await f.server.onStart();
  const end = f.server.endingAt!;
  await deliver(
    f.server,
    TwitchNotificationSchema.parse(
      notification("channel.bits.use", {
        bits: 100,
        type: "custom_power_up",
        custom_power_up: { id: "test", name: "Effect" },
      }),
    ),
  );
  assert.equal(f.server.endingAt, end + 60000);
});

test("recovering a late start preserves earned time and is safe to retry", async () => {
  const f = fixture({ timeAddedInSeconds: 150 });
  await f.server.onStart();
  const end = f.server.endingAt!;
  const message = {
    type: "subathon.recovery.apply",
    batchId: "late-start",
    note: "Verified stream start",
    entries: [],
    elapsedAdjustmentSeconds: 599.191,
    timeAdjustmentSeconds: 60,
  };
  await f.server.onMessage(stringify(message), f.sender);
  await f.server.onMessage(stringify(message), f.sender);
  assert.equal(f.server.endingAt, end - 539191);
  assert.equal(f.server.timeAddedInSeconds, 210);
});

function setupCommand() {
  return {
    type: "subathon.setup",
    operationId: crypto.randomUUID(),
    expectedCampaignId: "legacy",
    startingTimeInSeconds: 7200,
    maxAdditionalSeconds: 36000,
    incrementValues: {
      tier1Seconds: 150,
      tier2Seconds: 150,
      tier3Seconds: 150,
      bitsStep: 100,
      bitsStepSecond: 60,
    },
    goals: [{ id: crypto.randomUUID(), name: "New goal", target: 50 }],
  };
}
test("new setup archives the previous campaign, preserves duplicate protection, and survives restart", async () => {
  const { server, data, sender, room, broadcasts } = fixture();
  await server.onStart();
  await deliver(server, notification(), "original-gift");
  await server.onMessage(stringify({ type: "subathon.pause" }), sender);
  const command = setupCommand();
  await server.onMessage(stringify(command), sender);
  assert.equal(broadcasts.at(-1).type, "message.ack");
  assert.equal(server.endingAt, null);
  assert.equal(server.subathonTimeInSeconds, 7200);
  assert.equal(server.increments.tier1.length, 0);
  assert.ok([...data.keys()].some((k) => k.startsWith("campaign-archive:")));
  assert.ok([...data.values()].some((v) => v?.entry?.id === "original-gift"));
  assert.ok(data.has("event:original-gift"));
  const restarted = new Server(room);
  await restarted.onStart();
  assert.equal(restarted.campaignId, command.operationId);
  assert.equal(restarted.goals[0]?.name, "New goal");
  await restarted.onMessage(stringify({ type: "subathon.start" }), sender);
  const ending = restarted.endingAt;
  await restarted.onMessage(stringify(command), sender);
  assert.equal(
    restarted.endingAt,
    ending,
    "retry after a lost acknowledgement cannot reset the new timer",
  );
  await deliver(restarted, notification(), "original-gift");
  assert.equal(restarted.increments.tier1.length, 0);
});
test("setup refuses running timers and stale campaign drafts", async () => {
  const { server, sender, broadcasts } = fixture();
  await server.onStart();
  await server.onMessage(stringify(setupCommand()), sender);
  assert.match(broadcasts.at(-1).message, /Pause/);
  assert.equal(server.campaignId, "legacy");
  await server.onMessage(stringify({ type: "subathon.pause" }), sender);
  await server.onMessage(
    stringify({ ...setupCommand(), expectedCampaignId: "stale" }),
    sender,
  );
  assert.match(broadcasts.at(-1).message, /Another editor/);
  assert.equal(server.campaignId, "legacy");
});
test("a failed setup keeps the old timer and contributions intact", async () => {
  const { server, sender, room, data } = fixture();
  await server.onStart();
  await deliver(server, notification(), "kept-gift");
  await server.onMessage(stringify({ type: "subathon.pause" }), sender);
  const previous = structuredClone([...data]);
  const ending = server.endingAt;
  const put = room.storage.put;
  room.storage.put = async (key: any, value: any) => {
    if (typeof key === "object" && key.campaignId)
      throw new Error("simulated storage failure");
    return put(key, value);
  };
  await server.onMessage(stringify(setupCommand()), sender);
  assert.deepEqual([...data], previous);
  assert.equal(server.endingAt, ending);
  assert.equal(server.increments.tier1[0]?.value, 5);
});
test("a delayed event from the old campaign cannot count toward a fresh setup", async () => {
  const { server, sender, data } = fixture({ endingAt: null });
  await server.onStart();
  await server.onMessage(stringify(setupCommand()), sender);
  await server.onMessage(stringify({ type: "subathon.start" }), sender);
  const request = new Request("https://example.com/parties/main/7imberwolf", {
    headers: {
      "Twitch-Eventsub-Message-Id": "old-delayed",
      "Twitch-Eventsub-Message-Timestamp": new Date(now - 60000).toISOString(),
    },
  });
  await (server as any).handleTwitchNotification(request, notification());
  assert.equal(server.increments.tier1.length, 0);
  assert.equal(
    data.get("event:old-delayed").outcome,
    "before-current-campaign",
  );
});
test("overlay appearance persists, broadcasts, and validates colors and effects", async () => {
  const { server, sender, room, broadcasts } = fixture();
  await server.onStart();
  const appearance = {
    timerColor: "#ff0000",
    goalColor: "#00ff00",
    previewBackground: "#111111",
    timerOutlineWidth: 5,
    goalOutlineWidth: 4.5,
    shadowSize: 6,
  };
  await server.onMessage(
    stringify({ type: "subathon.appearance.update", appearance }),
    sender,
  );
  assert.deepEqual(
    broadcasts.findLast((x) => x.type === "subathon.updated").appearance,
    appearance,
  );
  const restarted = new Server(room);
  await restarted.onStart();
  assert.deepEqual(restarted.appearance, appearance);
  // A page opened before text effects were added must not reset them on save.
  await server.onMessage(
    stringify({
      type: "subathon.appearance.update",
      appearance: {
        timerColor: appearance.timerColor,
        goalColor: appearance.goalColor,
        previewBackground: appearance.previewBackground,
      },
    }),
    sender,
  );
  assert.deepEqual(server.appearance, appearance);
  await server.onMessage(
    stringify({
      type: "subathon.appearance.update",
      appearance: { ...appearance, timerColor: "url(https://example.com)" },
    }),
    sender,
  );
  assert.equal(broadcasts.at(-1).type, "message.error");
  assert.deepEqual(server.appearance, appearance);
  for (const invalid of [
    { timerOutlineWidth: -1 },
    { goalOutlineWidth: 9 },
    { shadowSize: 17 },
  ]) {
    await server.onMessage(
      stringify({
        type: "subathon.appearance.update",
        appearance: { ...appearance, ...invalid },
      }),
      sender,
    );
    assert.equal(broadcasts.at(-1).type, "message.error");
    assert.deepEqual(server.appearance, appearance);
  }
});
test("the upgraded Twitch client adds credentials and resolves Helix paths correctly", async () => {
  const { server, room } = fixture();
  room.env.TWITCH_CLIENT_ID = "client";
  room.env.TWITCH_CLIENT_SECRET = "secret";
  const requests: Request[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: any, init: any) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request);
    return Response.json(
      request.url.includes("/oauth2/token")
        ? { access_token: "test-token", expires_in: 3600, token_type: "bearer" }
        : {
            data: [
              { id: "123", login: "7imberwolf", display_name: "7imberwolf" },
            ],
          },
    );
  };
  try {
    const result = await server.onRequest(
      new Request(
        "https://example.com/parties/main/7imberwolf?query=broadcaster",
      ) as any,
    );
    assert.equal(result.status, 200);
    assert.equal(
      requests[1]?.url,
      "https://api.twitch.tv/helix/users?login=7imberwolf",
    );
    assert.equal(
      requests[1]?.headers.get("Authorization"),
      "Bearer test-token",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
