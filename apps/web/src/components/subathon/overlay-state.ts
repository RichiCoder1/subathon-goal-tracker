import type {
  ServerMessage,
  SubathonUpdatedMessage,
} from "@subathon-goal-tracker/messages/schema";

export type OverlaySample = {
  state: SubathonUpdatedMessage;
  receivedAt: number;
};

// receivedAt/now use the browser's monotonic clock, not its wall clock.
export function applyOverlayMessage(
  current: OverlaySample | null,
  message: ServerMessage,
  receivedAt: number,
): OverlaySample | null {
  if (message.type === "subathon.updated")
    return { state: message, receivedAt };
  if (message.type !== "subathon.tick" || !current) return current;
  // A full snapshot owns the timer state. Late ticks cannot undo a pause,
  // reset, or time adjustment, nor initialize a newly connected overlay.
  if (
    current.state.pausedAt !== null ||
    current.state.endingAt === null ||
    message.endingAt !== current.state.endingAt
  )
    return current;
  return {
    state: {
      ...current.state,
      remainingTimeInSeconds: message.remainingTimeInSeconds,
    },
    receivedAt,
  };
}

export function remainingOverlaySeconds(
  sample: OverlaySample | null,
  now: number,
) {
  if (!sample) return 0;
  const { state, receivedAt } = sample;
  const elapsed =
    state.endingAt !== null && state.pausedAt === null
      ? Math.max(0, now - receivedAt) / 1000
      : 0;
  return Math.max(0, Math.ceil(state.remainingTimeInSeconds - elapsed));
}

export function overlayNeedsResync(sample: OverlaySample | null, now: number) {
  // Running timers receive a tick every second. Allow transient network jitter.
  return (
    !!sample &&
    sample.state.endingAt !== null &&
    sample.state.pausedAt === null &&
    sample.state.remainingTimeInSeconds > 0 &&
    now - sample.receivedAt > 15000
  );
}

export function overlayProgress(state: SubathonUpdatedMessage | null) {
  const subs = state
    ? ["tier1", "tier2", "tier3"].reduce(
        (sum, kind) =>
          sum +
          state.increments[kind as "tier1" | "tier2" | "tier3"].reduce(
            (n, e) => n + e.value,
            0,
          ),
        0,
      )
    : 0;
  const goal = state?.goals
    .toSorted((a, b) => a.target - b.target)
    .find((goal) => goal.target > subs);
  return { subs, goal };
}
