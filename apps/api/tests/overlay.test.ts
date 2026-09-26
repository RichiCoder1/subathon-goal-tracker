import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyOverlayMessage,
  remainingOverlaySeconds,
  overlayNeedsResync,
  overlayProgress,
} from "../../web/src/components/subathon/overlay-state";
import { SubathonUpdatedMessageSchema } from "../../../packages/messages/src/schema";

const snapshot = (extra: Record<string, unknown> = {}) =>
  SubathonUpdatedMessageSchema.parse({
    type: "subathon.updated",
    goals: [],
    increments: { tier1: [], tier2: [], tier3: [], bits: [] },
    incrementValues: {
      tier1Seconds: 150,
      tier2Seconds: 150,
      tier3Seconds: 150,
      bitsStep: 100,
      bitsStepSecond: 60,
    },
    maxAdditionalSeconds: 72000,
    remainingTimeInSeconds: 120,
    endingAt: 1000000,
    pausedAt: null,
    ...extra,
  });

test("overlay counts down between packets and never displays a negative time", () => {
  const sample = applyOverlayMessage(null, snapshot(), 1000);
  assert.equal(remainingOverlaySeconds(sample, 6500), 115);
  assert.equal(remainingOverlaySeconds(sample, 130000), 0);
});
test("pause, contributions while paused, and resume synchronize from server snapshots", () => {
  let sample = applyOverlayMessage(null, snapshot({ pausedAt: 500000 }), 1000);
  assert.equal(remainingOverlaySeconds(sample, 999999), 120);
  sample = applyOverlayMessage(
    sample,
    snapshot({
      pausedAt: 500000,
      remainingTimeInSeconds: 270,
      endingAt: 1150000,
    }),
    1000000,
  );
  assert.equal(remainingOverlaySeconds(sample, 1100000), 270);
  sample = applyOverlayMessage(
    sample,
    snapshot({ remainingTimeInSeconds: 270, endingAt: 2000000 }),
    1100000,
  );
  assert.equal(remainingOverlaySeconds(sample, 1102000), 268);
});
test("ticks cannot initialize the overlay or override a pause or a newer timer adjustment", () => {
  const tick = {
    type: "subathon.tick" as const,
    remainingTimeInSeconds: 100,
    endingAt: 1000000,
  };
  assert.equal(applyOverlayMessage(null, tick, 1000), null);
  const paused = applyOverlayMessage(
    null,
    snapshot({ pausedAt: 500000 }),
    1000,
  );
  assert.equal(applyOverlayMessage(paused, tick, 2000), paused);
  const adjusted = applyOverlayMessage(
    null,
    snapshot({ remainingTimeInSeconds: 270, endingAt: 1150000 }),
    1000,
  );
  assert.equal(applyOverlayMessage(adjusted, tick, 2000), adjusted);
  const updated = applyOverlayMessage(
    adjusted,
    { ...tick, remainingTimeInSeconds: 269, endingAt: 1150000 },
    2000,
  );
  assert.equal(remainingOverlaySeconds(updated, 2000), 269);
});
test("reconnection replaces stale time, counts and goals rather than accumulating them", () => {
  let sample = applyOverlayMessage(null, snapshot(), 0);
  const fresh = snapshot({
    remainingTimeInSeconds: 500,
    endingAt: 9999999,
    increments: {
      tier1: [{ id: "one", userName: "Gifter", value: 50 }],
      tier2: [],
      tier3: [{ id: "three", userName: "Subscriber", value: 1 }],
      bits: [{ id: "bits", userName: "Gifter", value: 1000 }],
    },
    goals: [
      { id: crypto.randomUUID(), name: "Reached", target: 50 },
      { id: crypto.randomUUID(), name: "Next", target: 100 },
    ],
  });
  sample = applyOverlayMessage(sample, fresh, 30000);
  sample = applyOverlayMessage(sample, fresh, 31000);
  assert.equal(overlayProgress(sample!.state).subs, 51);
  assert.equal(overlayProgress(sample!.state).goal?.target, 100);
  assert.equal(remainingOverlaySeconds(sample, 32000), 499);
  sample = applyOverlayMessage(
    sample,
    snapshot({ endingAt: null, remainingTimeInSeconds: 14400 }),
    33000,
  );
  assert.equal(remainingOverlaySeconds(sample, 90000), 14400);
  assert.equal(overlayProgress(sample!.state).subs, 0);
});
test("a silent running connection requires resync; a paused or finished timer does not", () => {
  assert.equal(
    overlayNeedsResync(applyOverlayMessage(null, snapshot(), 0), 16000),
    true,
  );
  assert.equal(
    overlayNeedsResync(
      applyOverlayMessage(null, snapshot({ remainingTimeInSeconds: 5 }), 0),
      16000,
    ),
    true,
  );
  assert.equal(
    overlayNeedsResync(
      applyOverlayMessage(null, snapshot({ pausedAt: 500000 }), 0),
      16000,
    ),
    false,
  );
  assert.equal(
    overlayNeedsResync(
      applyOverlayMessage(null, snapshot({ remainingTimeInSeconds: 0 }), 0),
      16000,
    ),
    false,
  );
});
