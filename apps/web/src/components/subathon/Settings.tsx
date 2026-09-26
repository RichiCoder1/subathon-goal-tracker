import { useEffect, useRef, useState } from "react";
import usePartySocket from "partysocket/react";
import { parse, stringify } from "superjson";
import {
  ServerMessageSchema,
  ClientMessageSchema,
  type ClientMessage,
  type SubathonUpdatedMessage,
} from "@subathon-goal-tracker/messages/schema";
import type { Session } from "@auth/core/types";
import { GeneralSettingsForm } from "./SettingsForm";
import "./Settings.css";

const expectedEvents = [
  "channel.subscribe",
  "channel.subscription.gift",
  "channel.subscription.message",
  "channel.cheer",
  "channel.bits.use",
];
const duration = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((s % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
};
const total = (entries: { value: number }[]) =>
  entries.reduce((sum, e) => sum + e.value, 0);
export function SettingsPage({
  host,
  room,
  broadcasterId,
  callbackOverride,
}: {
  host: string;
  room: string;
  broadcasterId: string;
  callbackOverride: string | null;
  session: Session | null;
}) {
  const [state, setState] = useState<SubathonUpdatedMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState("Connecting to the tracker…");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const goalForm = useRef<HTMLFormElement>(null);
  const [subscriptions, setSubscriptions] = useState<any[] | null>(null);
  const [query, setQuery] = useState("");
  const [minutes, setMinutes] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState<
    "timer" | "totals" | null
  >(null);
  const ws = usePartySocket({
    host,
    room,
    query: async () => {
      const response = await fetch(
        `/api/subathon/${encodeURIComponent(room)}/token`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        setError(await response.text());
        throw new Error("Editing access unavailable");
      }
      return { token: ((await response.json()) as { token: string }).token };
    },
    onOpen() {
      setConnected(true);
      setError("");
      setNotice("Connected.");
      ws.send(stringify({ type: "subathon.twitch.subscriptions.get" }));
    },
    onClose() {
      setConnected(false);
      setNotice("Reconnecting. Controls are unavailable until connected.");
      setPending(null);
      pendingRef.current = null;
    },
    onError() {
      setConnected(false);
      setError(
        "Could not connect. Check your connection or reload to sign in again.",
      );
    },
    onMessage(event) {
      let payload: unknown;
      try {
        payload = parse(event.data);
      } catch {
        setError(
          "The tracker sent an unexpected response. Reconnect before editing.",
        );
        return;
      }
      const result = ServerMessageSchema.safeParse(payload);
      if (!result.success) {
        setError(
          "The tracker sent an unexpected response. Reload before editing.",
        );
        return;
      }
      const message = result.data;
      if (message.type === "subathon.updated") setState(message);
      if (message.type === "subathon.tick")
        setState((current) =>
          current
            ? {
                ...current,
                remainingTimeInSeconds: message.remainingTimeInSeconds,
                endingAt: message.endingAt,
              }
            : null,
        );
      if (message.type === "subathon.twitch.subscriptions")
        setSubscriptions(message.subscriptions);
      if (message.type === "message.error") {
        setError(message.message);
        setPending(null);
        pendingRef.current = null;
      }
      if (
        message.type === "message.ack" &&
        message.action === pendingRef.current
      ) {
        setNotice(message.message);
        if (message.action === "subathon.time.add") setMinutes("");
        if (message.action === "subathon.goal.add") goalForm.current?.reset();
        setPending(null);
        pendingRef.current = null;
      }
    },
  });
  useEffect(() => {
    const refresh = setInterval(() => ws.reconnect(), 12 * 60 * 1000);
    return () => clearInterval(refresh);
  }, [ws]);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setError(
        "No confirmation received. Reconnect to check whether the change was saved.",
      );
      setPending(null);
      pendingRef.current = null;
      ws.reconnect();
    }, 15000);
    return () => clearTimeout(timer);
  }, [pending, ws]);
  function send(message: ClientMessage) {
    if (!connected || ws.readyState !== WebSocket.OPEN || pendingRef.current)
      return false;
    const valid = ClientMessageSchema.safeParse(message);
    if (!valid.success) {
      setError("Check the form values and try again.");
      return false;
    }
    setError("");
    setNotice("Saving…");
    setPending(message.type);
    pendingRef.current = message.type;
    ws.send(stringify(valid.data));
    return true;
  }
  const disabled = !connected || pending !== null;
  const overlayPath = `/subathon/${encodeURIComponent(room)}/overlay`;
  const callback = `https://${callbackOverride || host}/parties/main/${room}`;
  const active =
    state?.endingAt != null &&
    state?.pausedAt == null &&
    (state?.remainingTimeInSeconds ?? 0) > 0;
  const subs = state
    ? total(state.increments.tier1) +
      total(state.increments.tier2) +
      total(state.increments.tier3)
    : 0;
  const bits = state ? total(state.increments.bits) : 0;
  const entries = state
    ? Object.entries(state.increments).flatMap(([kind, items]) =>
        items.map((item) => ({ ...item, kind })),
      )
    : [];
  const totals = entries.reduce((all, item) => {
    const key = item.userName.toLowerCase();
    const row = all.get(key) ?? { userName: item.userName, subs: 0, bits: 0 };
    if (item.kind === "bits") row.bits += item.value;
    else row.subs += item.value;
    all.set(key, row);
    return all;
  }, new Map<string, { userName: string; subs: number; bits: number }>());
  const label = (kind: string) =>
    kind === "bits" ? "Bits" : `Tier ${kind.slice(-1)} subs`;
  const timestamp = (item: (typeof entries)[number]) =>
    item.occurredAt ??
    (/^[0-9a-f]{8}-[0-9a-f]{4}-7/.test(item.id)
      ? new Date(
          parseInt(item.id.replaceAll("-", "").slice(0, 12), 16),
        ).toISOString()
      : null);
  function download() {
    if (!state) return;
    const blob = new Blob(
      [
        JSON.stringify(
          { exportedAt: new Date().toISOString(), room, state },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${room}-subathon-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const enabledTypes = expectedEvents.filter((type) =>
    subscriptions?.some(
      (s) =>
        s.type === type &&
        s.status === "enabled" &&
        s.transport?.callback === callback,
    ),
  );
  return (
    <main className="tracker-settings">
      <header className="tracker-heading">
        <h1>{room}’s subathon</h1>
        <div className="button-row">
          <a href={overlayPath} target="_blank" rel="noreferrer">
            Open OBS overlay
          </a>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  new URL(overlayPath, location.href).href,
                );
                setNotice(
                  "Overlay link copied. Paste it into an OBS Browser Source.",
                );
              } catch {
                setError(
                  "Could not copy. Open the overlay and copy its address.",
                );
              }
            }}
          >
            Copy overlay link
          </button>
        </div>
      </header>
      <div
        className={`tracker-status ${!connected ? "connection-warning" : ""}`}
        role="status"
      >
        {connected ? "Tracker connected" : "Disconnected"}
        {notice && notice !== "Connected." ? ` · ${notice}` : ""}
        {subscriptions !== null && (
          <>
            {" "}
            ·{" "}
            <a href="#twitch-heading">
              Twitch events {enabledTypes.length}/{expectedEvents.length}
            </a>
          </>
        )}
      </div>
      {subscriptions !== null &&
        enabledTypes.length < expectedEvents.length && (
          <p className="connection-warning" role="status">
            Some Twitch events are missing. Subs or bits may not add time.{" "}
            <a href="#twitch-heading">Check the Twitch connection</a>.
          </p>
        )}
      {error && (
        <div role="alert" className="tracker-error">
          {error} <button onClick={() => ws.reconnect()}>Reconnect</button>
        </div>
      )}
      {!state ? (
        <p>Loading the timer, goals, and contributions…</p>
      ) : (
        <>
          <section aria-labelledby="timer-heading">
            <h2 id="timer-heading">Timer</h2>
            <div className="timer-line">
              <output className="timer-digits">
                {duration(state.remainingTimeInSeconds)}
              </output>
              <span>
                {state.endingAt === null
                  ? "Not started"
                  : state.pausedAt !== null
                    ? "Paused"
                    : state.remainingTimeInSeconds === 0
                      ? "Finished"
                      : "Running"}
              </span>
            </div>
            <p className="contribution-summary">
              {subs.toLocaleString()} subs · {bits.toLocaleString()} bits
            </p>
            <p>
              {duration(state.timeAddedInSeconds)} extra time earned
              {state.maxAdditionalSeconds
                ? ` · ${duration(Math.max(0, state.maxAdditionalSeconds - state.timeAddedInSeconds))} left before the cap`
                : " · No cap"}
            </p>
            {!!state.maxAdditionalSeconds &&
              state.timeAddedInSeconds >= state.maxAdditionalSeconds && (
                <p>
                  Time cap reached. New subs and bits still count toward goals.
                </p>
              )}
            <p className="muted">
              Pause at the end of day one, then resume for day two. Goals and
              earned time carry over.
            </p>
            <div className="button-row">
              <button
                className={active ? "secondary" : ""}
                disabled={
                  disabled ||
                  active ||
                  (state.endingAt !== null &&
                    state.remainingTimeInSeconds === 0)
                }
                onClick={() => send({ type: "subathon.start" })}
              >
                {state.pausedAt !== null ? "Resume timer" : "Start timer"}
              </button>
              <button
                className={active ? "" : "secondary"}
                disabled={disabled || !active}
                onClick={() =>
                  send({ type: "subathon.pause", pausedAt: Date.now() })
                }
              >
                Pause timer
              </button>
            </div>
            {state.endingAt !== null && state.remainingTimeInSeconds === 0 && (
              <p>Finished. Add time below or use Reset controls.</p>
            )}
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const seconds = Number(minutes) * 60;
                if (
                  seconds < 0 &&
                  !window.confirm(
                    `Subtract ${Math.abs(Number(minutes))} minutes from the timer?`,
                  )
                )
                  return;
                send({ type: "subathon.time.add", timeInSeconds: seconds });
              }}
            >
              <label>
                Adjust time (minutes)
                <input
                  type="number"
                  name="minutes"
                  required
                  step="0.5"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  disabled={disabled}
                  placeholder="For example, 5 or −5"
                />
              </label>
              <button
                className="secondary"
                disabled={disabled || !Number(minutes)}
              >
                {Number(minutes)
                  ? `${Number(minutes) < 0 ? "Subtract" : "Add"} ${Math.abs(Number(minutes))} min`
                  : "Apply adjustment"}
              </button>
            </form>
            <p className="muted">
              Manual additions use the same time cap. Subtracting time frees
              that amount under the cap.
            </p>
          </section>
          <section aria-labelledby="goals-heading">
            <h2 id="goals-heading">
              Goals <span className="muted">{subs.toLocaleString()} subs</span>
            </h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Goal</th>
                    <th>Subs</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.goals
                    .toSorted((a, b) => a.target - b.target)
                    .map((goal) => (
                      <tr key={goal.id}>
                        <td>{goal.name}</td>
                        <td>{goal.target}</td>
                        <td>
                          {subs >= goal.target
                            ? "Reached"
                            : `${goal.target - subs} to go`}
                        </td>
                        <td>
                          <button
                            className="text-button"
                            aria-label={`Remove ${goal.name}`}
                            disabled={disabled}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Remove the goal “${goal.name}”?`,
                                )
                              )
                                send({
                                  type: "subathon.goal.remove",
                                  id: goal.id,
                                });
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  {!state.goals.length && (
                    <tr>
                      <td colSpan={4}>
                        Add the first goal below. Contributions are still being
                        counted.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <form
              ref={goalForm}
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = new FormData(form);
                send({
                  type: "subathon.goal.add",
                  name: String(data.get("name")),
                  target: Number(data.get("target")),
                });
              }}
            >
              <label>
                Goal name
                <input
                  name="name"
                  required
                  maxLength={200}
                  disabled={disabled}
                />
              </label>
              <label>
                Target subs
                <input
                  type="number"
                  name="target"
                  required
                  min="1"
                  step="1"
                  disabled={disabled}
                />
              </label>
              <button disabled={disabled}>Add goal</button>
            </form>
          </section>
          <section aria-labelledby="contributions-heading">
            <div className="section-heading">
              <h2 id="contributions-heading">Contributions</h2>
              <button className="secondary" onClick={download}>
                Download backup
              </button>
            </div>
            <label className="search-field">
              Find a contributor
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Twitch name"
              />
            </label>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Contributor</th>
                    <th>Subs</th>
                    <th>Bits</th>
                  </tr>
                </thead>
                <tbody>
                  {[...totals.values()]
                    .filter((item) =>
                      item.userName.toLowerCase().includes(query.toLowerCase()),
                    )
                    .sort((a, b) => b.subs - a.subs || b.bits - a.bits)
                    .map((item) => (
                      <tr key={item.userName.toLowerCase()}>
                        <td>{item.userName}</td>
                        <td>{item.subs.toLocaleString()}</td>
                        <td>{item.bits.toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!entries.length && (
              <p>
                No contributions yet. Twitch events will appear here as they
                arrive.
              </p>
            )}
            <details>
              <summary>Individual events ({entries.length})</summary>
              <div className="table-scroll event-history">
                <table>
                  <thead>
                    <tr>
                      <th>Contributor</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Time</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries
                      .filter((item) =>
                        item.userName
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .sort((a, b) =>
                        (timestamp(b) ?? "").localeCompare(timestamp(a) ?? ""),
                      )
                      .map((item) => (
                        <tr key={item.id}>
                          <td>{item.userName}</td>
                          <td>{label(item.kind)}</td>
                          <td>{item.value}</td>
                          <td>
                            {item.source === "recovery" ? "≈ " : ""}
                            {timestamp(item)
                              ? new Date(timestamp(item)!).toLocaleString()
                              : "Not recorded"}
                          </td>
                          <td title={item.note}>
                            {item.source === "recovery"
                              ? "Recovered"
                              : item.source === "manual"
                                ? "Manual"
                                : "Twitch"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <section>
            <h2>Time rules</h2>
            <GeneralSettingsForm
              value={{
                incrementValues: state.incrementValues,
                maxAdditionalSeconds: state.maxAdditionalSeconds,
              }}
              startingSeconds={state.startingTimeInSeconds}
              disabled={disabled}
              onSubmit={(values) =>
                send({ type: "subathon.settings.update", ...values })
              }
            />
          </section>
          <section>
            <h2 id="twitch-heading">Twitch connection</h2>
            <p>
              {subscriptions === null
                ? "Checking events…"
                : `${enabledTypes.length} of ${expectedEvents.length} event types connected.`}
            </p>
            <ul className="event-types">
              {expectedEvents.map((type) => (
                <li key={type}>
                  {type.replace("channel.", "").replaceAll(".", " ")}:{" "}
                  {enabledTypes.includes(type)
                    ? "Connected"
                    : "Missing or pending"}
                </li>
              ))}
            </ul>
            <button
              disabled={disabled}
              onClick={() =>
                send({
                  type: "subathon.twitch.subscriptions.create",
                  broadcasterId,
                  callbackUrl: callback,
                })
              }
            >
              Repair Twitch connection
            </button>
          </section>
          <details
            className="reset-section"
            onToggle={(e) => {
              if (!e.currentTarget.open) setResetConfirmation(null);
            }}
          >
            <summary>Reset controls</summary>
            <p>
              These start a new timer or clear the displayed totals. Use Pause
              to continue the same subathon tomorrow.
            </p>
            <div className="button-row">
              <button
                className="secondary"
                disabled={disabled}
                onClick={() => setResetConfirmation("timer")}
              >
                Reset timer…
              </button>
              <button
                className="secondary"
                disabled={disabled}
                onClick={() => setResetConfirmation("totals")}
              >
                Clear totals…
              </button>
            </div>
            {resetConfirmation && (
              <div className="reset-confirmation">
                <p>
                  {resetConfirmation === "timer"
                    ? "Reset to four hours and clear earned timer time? A backup file will download first. Contribution totals will remain."
                    : "Clear all displayed contribution totals? A backup file will download first. The timer will remain."}
                </p>
                <div className="button-row">
                  <button
                    className="destructive"
                    disabled={disabled}
                    onClick={() => {
                      download();
                      send(
                        resetConfirmation === "timer"
                          ? {
                              type: "subathon.reset",
                              remainingTimeInSeconds: 14400,
                            }
                          : { type: "subathon.increments.reset" },
                      );
                      setResetConfirmation(null);
                    }}
                  >
                    Confirm{" "}
                    {resetConfirmation === "timer"
                      ? "timer reset"
                      : "clear totals"}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setResetConfirmation(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </details>
        </>
      )}
    </main>
  );
}
