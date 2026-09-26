import usePartySocket from "partysocket/react";
import { useEffect, useRef, useState } from "react";
import { OverlayDisplay } from "./OverlayDisplay";
import {
  AppearanceSchema,
  ServerMessageSchema,
} from "@subathon-goal-tracker/messages/schema";
import { parse } from "superjson";
import {
  applyOverlayMessage,
  remainingOverlaySeconds,
  overlayNeedsResync,
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
  return (
    <OverlayDisplay
      state={state}
      seconds={seconds}
      connected={connected}
      appearance={state?.appearance ?? AppearanceSchema.parse({})}
    />
  );
};
