import fs from "node:fs";
const host = process.argv[2] || "api.richicoder1.partykit.dev";
const room = process.argv[3] || "7imberwolf";
const protocol = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "ws" : "wss";
const socket = new WebSocket(`${protocol}://${host}/parties/main/${room}`);
const timeout = setTimeout(() => {
  console.error("No state received.");
  process.exit(1);
}, 15000);
socket.addEventListener("message", (e) => {
  const packet = JSON.parse(e.data);
  const state = packet.json ?? packet;
  if (state.type !== "subathon.updated") return;
  fs.mkdirSync(".recovery", { recursive: true });
  const capturedAt = new Date().toISOString();
  const path = `.recovery/${room}-${capturedAt.replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(path, JSON.stringify({ capturedAt, state }, null, 2));
  console.log(
    JSON.stringify(
      {
        path,
        endingAt: state.endingAt,
        incrementValues: state.incrementValues,
        totals: Object.fromEntries(
          Object.entries(state.increments).map(([kind, entries]) => [
            kind,
            entries.reduce((sum, e) => sum + e.value, 0),
          ]),
        ),
      },
      null,
      2,
    ),
  );
  clearTimeout(timeout);
  socket.close();
  setTimeout(() => process.exit(0), 1000);
});
socket.addEventListener("error", () => {
  console.error("Could not read tracker.");
  process.exit(1);
});
