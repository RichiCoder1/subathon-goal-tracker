import { useRef, useState } from "react";
import {
  SetupSubathonSchema,
  type Goal,
  type SetupSubathon,
  type SubathonUpdatedMessage,
} from "@subathon-goal-tracker/messages/schema";

export function SetupSubathonForm({
  state,
  room,
  disabled,
  onSubmit,
  onCancel,
}: {
  state: SubathonUpdatedMessage;
  room: string;
  disabled: boolean;
  onSubmit: (command: SetupSubathon) => boolean;
  onCancel: () => void;
}) {
  const [identity] = useState(() => ({
    operationId: crypto.randomUUID(),
    expectedCampaignId: state.campaignId,
  }));
  const [hours, setHours] = useState(4);
  const [extra, setExtra] = useState(20);
  const [subSeconds, setSubSeconds] = useState(150);
  const [bitsStep, setBitsStep] = useState(100);
  const [bitsSeconds, setBitsSeconds] = useState(60);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [review, setReview] = useState<SetupSubathon | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const running =
    state.endingAt !== null &&
    state.pausedAt === null &&
    state.remainingTimeInSeconds > 0;
  const subs = [
    ...state.increments.tier1,
    ...state.increments.tier2,
    ...state.increments.tier3,
  ].reduce((n, e) => n + e.value, 0);
  const bits = state.increments.bits.reduce((n, e) => n + e.value, 0);
  return (
    <div className="setup-form">
      <p>
        For a new event, choose the timer and goals below. To continue this
        subathon tomorrow, use Pause and Resume instead.
      </p>
      {running && (
        <p className="connection-warning">
          Pause the current timer before applying a new setup. You can prepare
          the settings now.
        </p>
      )}
      {error && (
        <p role="alert" className="tracker-error">
          {error}
        </p>
      )}
      {!review ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const result = SetupSubathonSchema.safeParse({
              type: "subathon.setup",
              ...identity,
              startingTimeInSeconds: hours * 3600,
              maxAdditionalSeconds: extra * 3600,
              incrementValues: {
                tier1Seconds: subSeconds,
                tier2Seconds: subSeconds,
                tier3Seconds: subSeconds,
                bitsStep,
                bitsStepSecond: bitsSeconds,
              },
              goals,
            });
            if (!result.success) {
              setError("Check the timer values and each goal name and target.");
              return;
            }
            setError("");
            setReview(result.data);
            requestAnimationFrame(() => reviewHeading.current?.focus());
          }}
        >
          <div className="settings-fields">
            <label>
              Starting hours
              <input
                type="number"
                min="0.25"
                step="0.25"
                required
                value={hours}
                onChange={(e) => setHours(e.target.valueAsNumber)}
              />
            </label>
            <label>
              Maximum additional hours
              <input
                type="number"
                min="0"
                step="0.25"
                required
                value={extra}
                onChange={(e) => setExtra(e.target.valueAsNumber)}
              />
              <span className="muted">
                {extra
                  ? `${hours + extra} hours total. Pause between days.`
                  : "No time cap."}{" "}
                Use 0 for no cap.
              </span>
            </label>
            <label>
              Seconds per sub (all tiers and resubs)
              <input
                type="number"
                min="1"
                step="1"
                required
                value={subSeconds}
                onChange={(e) => setSubSeconds(e.target.valueAsNumber)}
              />
            </label>
            <label>
              Bits needed
              <input
                type="number"
                min="1"
                step="1"
                required
                value={bitsStep}
                onChange={(e) => setBitsStep(e.target.valueAsNumber)}
              />
            </label>
            <label>
              Seconds per that many bits
              <input
                type="number"
                min="0"
                step="1"
                required
                value={bitsSeconds}
                onChange={(e) => setBitsSeconds(e.target.valueAsNumber)}
              />
              <span className="muted">
                Smaller cheers and Power-ups accumulate.
              </span>
            </label>
          </div>
          <h3>Goals for the new event</h3>
          <div className="button-row">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setGoals(
                  state.goals.map((g) => ({ ...g, id: crypto.randomUUID() })),
                )
              }
            >
              Copy current goals
            </button>
            <button
              type="button"
              className="secondary"
              disabled={goals.length >= 100}
              onClick={() =>
                setGoals([
                  ...goals,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    target: (goals.at(-1)?.target ?? 0) + 50,
                  },
                ])
              }
            >
              Add a goal
            </button>
          </div>
          {!goals.length && (
            <p className="muted">
              No goals yet. You can add them now or later.
            </p>
          )}
          {goals.map((goal, index) => (
            <div className="setup-goal" key={goal.id}>
              <label>
                Goal {index + 1}
                <input
                  required
                  maxLength={200}
                  value={goal.name}
                  onChange={(e) =>
                    setGoals(
                      goals.map((g) =>
                        g.id === goal.id ? { ...g, name: e.target.value } : g,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Target subs
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={goal.target}
                  onChange={(e) =>
                    setGoals(
                      goals.map((g) =>
                        g.id === goal.id
                          ? { ...g, target: e.target.valueAsNumber }
                          : g,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="text-button"
                aria-label={`Remove setup goal ${index + 1}`}
                onClick={() => setGoals(goals.filter((g) => g.id !== goal.id))}
              >
                Remove
              </button>
            </div>
          ))}
          <div className="button-row">
            <button>Review new setup</button>
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div>
          <h3 tabIndex={-1} ref={reviewHeading}>
            Review before replacing this subathon
          </h3>
          <p>
            <strong>{hours} starting hours</strong> ·{" "}
            {extra
              ? `up to ${extra} extra hours (${hours + extra} total)`
              : "no time cap"}
            .
          </p>
          <p>
            Every sub adds {subSeconds} seconds. Every {bitsStep} accumulated
            bits adds {bitsSeconds} seconds.
          </p>
          <p>
            {review.goals.length} goals. Text colors stay the same. The timer
            waits until you press Start.
          </p>
          {review.goals.length > 0 && (
            <details>
              <summary>Review goals</summary>
              <ul>
                {review.goals
                  .toSorted((a, b) => a.target - b.target)
                  .map((g) => (
                    <li key={g.id}>
                      {g.target} subs — {g.name}
                    </li>
                  ))}
              </ul>
            </details>
          )}
          <div className="reset-confirmation">
            <p>
              The current timer, {subs.toLocaleString()} subs, and{" "}
              {bits.toLocaleString()} bits will be archived and cleared. A
              backup downloads first. Current totals may change as new events
              arrive.
            </p>
            <label>
              Type {room} to confirm
              <input
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                className="destructive"
                disabled={disabled || running || confirmation !== room}
                onClick={() => onSubmit(review)}
              >
                Archive and create new subathon
              </button>
              <button
                className="secondary"
                disabled={disabled}
                onClick={() => {
                  setReview(null);
                  setConfirmation("");
                }}
              >
                Back to edit
              </button>
              <button
                className="secondary"
                disabled={disabled}
                onClick={onCancel}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
