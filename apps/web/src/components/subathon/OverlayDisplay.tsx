import type {
  Appearance,
  SubathonUpdatedMessage,
} from "@subathon-goal-tracker/messages/schema";
import { overlayProgress } from "./overlay-state";
import "./Overlay.css";

export function OverlayDisplay({
  state,
  seconds,
  connected,
  appearance,
}: {
  state: SubathonUpdatedMessage | null;
  seconds: number;
  connected: boolean;
  appearance: Appearance;
}) {
  const formatted = `${Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const { subs, goal } = overlayProgress(state);
  return (
    <div className="subathon-screen">
      <div id="subathon-container" className="subathon-container">
        <div className="overlay-state" style={{ color: appearance.goalColor }}>
          {!state
            ? "Connecting…"
            : !connected
              ? "Reconnecting…"
              : state.pausedAt !== null
                ? "Paused"
                : state.endingAt === null
                  ? "Ready to start"
                  : seconds === 0
                    ? "Time complete"
                    : ""}
        </div>
        <div
          className="font-outline-3 font-outline-black text-5xl tracking-wider overlay-time"
          style={{ color: appearance.timerColor }}
        >
          {state ? formatted : "--:--:--"}
        </div>
        <div
          className="font-outline-2 font-outline-black overlay-goal"
          style={{ color: appearance.goalColor }}
        >
          {goal ? (
            <>
              <span>Next goal: {goal.name}</span>
              <br />
              <span>
                {subs.toLocaleString()} / {goal.target.toLocaleString()} subs
              </span>
            </>
          ) : state?.goals.length ? (
            <>
              <span>All goals reached!</span>
              <br />
              <span>{subs.toLocaleString()} subs</span>
            </>
          ) : state ? (
            <span>{subs.toLocaleString()} subs</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
