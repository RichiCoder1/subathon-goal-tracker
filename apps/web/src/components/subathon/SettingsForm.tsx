import { useEffect, useState } from "react";
import type { UpdateSubathonSettings } from "@subathon-goal-tracker/messages/schema";
type Settings = Pick<
  UpdateSubathonSettings,
  "incrementValues" | "maxAdditionalSeconds"
>;
type SettingsDraft = Omit<Settings, "maxAdditionalSeconds"> & {
  maxAdditionalSeconds: number | null;
};
export function GeneralSettingsForm({
  value,
  onSubmit,
  disabled,
  startingSeconds = 14400,
}: {
  value: Settings;
  onSubmit: (value: Settings) => boolean;
  disabled: boolean;
  startingSeconds?: number;
}) {
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const current = draft ?? value;
  const saved = JSON.stringify(value);
  useEffect(() => {
    if (draft && JSON.stringify(draft) === saved) setDraft(null);
  }, [saved, draft]);
  const change = (key: keyof Settings["incrementValues"], n: number) =>
    setDraft({
      ...current,
      incrementValues: { ...current.incrementValues, [key]: n },
    });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (current.maxAdditionalSeconds === null) return;
        if (
          current.maxAdditionalSeconds === 0 &&
          value.maxAdditionalSeconds > 0 &&
          !window.confirm(
            "Remove the time cap? Future contributions will be able to add unlimited extra time.",
          )
        )
          return;
        onSubmit({
          ...current,
          maxAdditionalSeconds: current.maxAdditionalSeconds,
        });
      }}
    >
      <p className="muted">
        Changes apply to future events. Smaller bit contributions accumulate
        across cheers and Power-ups. Goals count every subscription equally.
      </p>
      <div className="settings-fields">
        <label>
          Maximum additional hours
          <input
            type="number"
            min="0"
            step="0.25"
            required
            value={
              current.maxAdditionalSeconds === null
                ? ""
                : current.maxAdditionalSeconds / 3600
            }
            onChange={(e) =>
              setDraft({
                ...current,
                maxAdditionalSeconds:
                  e.target.value === "" ? null : e.target.valueAsNumber * 3600,
              })
            }
          />
          <span className="muted">
            {current.maxAdditionalSeconds === null
              ? "Enter the maximum additional hours."
              : current.maxAdditionalSeconds
                ? `${current.maxAdditionalSeconds / 3600} additional + ${startingSeconds / 3600} starting = ${(current.maxAdditionalSeconds + startingSeconds) / 3600} hours total.`
                : "No additional time cap."}{" "}
            Use 0 for no cap.
          </span>
        </label>
        {(["tier1Seconds", "tier2Seconds", "tier3Seconds"] as const).map(
          (key, index) => (
            <label key={key}>
              Tier {index + 1} sub (seconds)
              <input
                type="number"
                min="1"
                step="1"
                required
                value={current.incrementValues[key]}
                onChange={(e) => change(key, e.target.valueAsNumber)}
              />
            </label>
          ),
        )}
        <label>
          Bits needed
          <input
            type="number"
            min="1"
            step="1"
            required
            value={current.incrementValues.bitsStep}
            onChange={(e) => change("bitsStep", e.target.valueAsNumber)}
          />
        </label>
        <label>
          Seconds added per that many bits
          <input
            type="number"
            min="0"
            step="1"
            required
            value={current.incrementValues.bitsStepSecond}
            onChange={(e) => change("bitsStepSecond", e.target.valueAsNumber)}
          />
        </label>
      </div>
      <div className="button-row">
        <button disabled={disabled || !draft}>Save time rules</button>
        <button
          type="button"
          className="secondary"
          disabled={!draft}
          onClick={() => setDraft(null)}
        >
          Discard edits
        </button>
        {draft && <span className="muted">Unsaved changes</span>}
      </div>
    </form>
  );
}
