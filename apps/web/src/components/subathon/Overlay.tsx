import usePartySocket from "partysocket/react";
import { useEffect, useRef, useState } from "react";
import "./Overlay.css";
import { ServerMessageSchema } from "@subathon-goal-tracker/messages/schema";
import { parse } from "superjson";
import {
  applyOverlayMessage,
  remainingOverlaySeconds,
  overlayNeedsResync,
  overlayProgress,
  type OverlaySample,
} from "./overlay-state";

export const Overlay = ({ host, room }: { host: string; room: string }) => {
  const [sample, setSample] = useState<OverlaySample | null>(null);
  const sampleRef = useRef<OverlaySample | null>(null);
  const state = sample?.state ?? null;
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(0);
  const socket = usePartySocket({
    host,
    room,
    onOpen() {
      setConnected(false); // The new connection must receive its full snapshot.
    },
    onClose() {
      setConnected(false);
    },
    onError() {
      setConnected(false);
    },
    onMessage(event) {
      try {
        const result = ServerMessageSchema.safeParse(parse(event.data));
        if (!result.success) {
          setConnected(false);
          socket.reconnect();
          return;
        }
        const message = result.data;
        const at = performance.now();
        const next = applyOverlayMessage(sampleRef.current, message, at);
        if (next === sampleRef.current) return;
        sampleRef.current = next;
        setSample(next);
        if (message.type === "subathon.updated") setConnected(true);
        setNow(at);
      } catch {
        setConnected(false);
        socket.reconnect();
      }
    },
  });
  useEffect(() => {
    const timer = setInterval(() => {
      const at = performance.now();
      setNow(at);
      if (
        socket.readyState === WebSocket.OPEN &&
        overlayNeedsResync(sampleRef.current, at)
      ) {
        setConnected(false);
        socket.reconnect();
      }
    }, 250);
    const resume = () => {
      if (document.visibilityState === "visible") socket.reconnect();
    };
    const online = () => socket.reconnect();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", online);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", online);
    };
  }, [socket]);
  const seconds = remainingOverlaySeconds(sample, now);
  const formatted = `${Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const { subs, goal } = overlayProgress(state);
  return (
    <div className="subathon-screen flex w-screen h-screen bg-[#7edeff] p-2 items-center justify-center">
      <div id="subathon-container">
        <div className="overlay-state">
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
        <div className="font-outline-3 font-outline-black text-5xl tracking-wider text-[#fdff42] overlay-time">
          {state ? formatted : "--:--:--"}
        </div>
        <div className="font-outline-2 font-outline-black text-white overlay-goal">
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
};
