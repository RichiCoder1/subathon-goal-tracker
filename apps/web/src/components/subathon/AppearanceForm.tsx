import { useEffect, useState } from "react";
import {
  AppearanceSchema,
  type Appearance,
  type SubathonUpdatedMessage,
} from "@subathon-goal-tracker/messages/schema";
import { OverlayDisplay } from "./OverlayDisplay";

export function AppearanceForm({
  state,
  connected,
  disabled,
  onSave,
}: {
  state: SubathonUpdatedMessage;
  connected: boolean;
  disabled: boolean;
  onSave: (appearance: Appearance) => boolean;
}) {
  const [draft, setDraft] = useState<Appearance | null>(null);
  const saved = JSON.stringify(state.appearance);
  useEffect(() => {
    if (draft && JSON.stringify(draft) === saved) setDraft(null);
  }, [draft, saved]);
  const appearance = draft ?? state.appearance;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(appearance);
      }}
    >
      <p>
        OBS stays transparent. The preview background below is only for checking
        contrast.
      </p>
      <div className="appearance-fields">
        {(
          [
            ["timerColor", "Timer text"],
            ["goalColor", "Goal text"],
            ["previewBackground", "Preview background"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="color"
              value={appearance[key]}
              onInput={(e) =>
                setDraft({ ...appearance, [key]: e.currentTarget.value })
              }
            />
            <span className="muted">{appearance[key]}</span>
          </label>
        ))}
      </div>
      <div className="appearance-fields appearance-effects">
        {(
          [
            ["timerOutlineWidth", "Timer outline", 8],
            ["goalOutlineWidth", "Goal outline", 8],
            ["shadowSize", "Text shadow size", 16],
          ] as const
        ).map(([key, label, max]) => (
          <label key={key}>
            <span>
              {label}{" "}
              <span className="muted">
                {appearance[key] === 0 ? "Off" : `${appearance[key]} px`}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={max}
              step={0.5}
              value={appearance[key]}
              aria-label={label}
              aria-valuetext={
                appearance[key] === 0 ? "Off" : `${appearance[key]} pixels`
              }
              onChange={(e) =>
                setDraft({
                  ...appearance,
                  [key]: e.currentTarget.valueAsNumber,
                })
              }
            />
          </label>
        ))}
      </div>
      <p className="muted">
        Black outlines and shadows help the timer and goals stand out over your
        game. Set a slider to 0 to turn that effect off.
      </p>
      <div
        className="overlay-preview"
        aria-label="Overlay preview"
        style={{ backgroundColor: appearance.previewBackground }}
      >
        <OverlayDisplay
          state={state}
          connected={connected}
          seconds={Math.max(0, Math.ceil(state.remainingTimeInSeconds))}
          appearance={appearance}
        />
      </div>
      <div className="button-row">
        <button disabled={disabled || !draft}>Save overlay appearance</button>
        <button
          type="button"
          className="secondary"
          disabled={!draft}
          onClick={() => setDraft(null)}
        >
          Discard edits
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setDraft(AppearanceSchema.parse({}))}
        >
          Default appearance
        </button>
        {draft && <span className="muted">Previewing unsaved appearance</span>}
      </div>
      <p className="muted">
        Saving updates the text colors, outlines, and shadows in OBS
        automatically.
      </p>
    </form>
  );
}
