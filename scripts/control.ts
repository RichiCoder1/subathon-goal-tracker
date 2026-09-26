// Operator tool: sends a reviewed JSON command using the shared editor secret.
// Keep the secret file outside source control. Never print the token or secret.
import fs from "node:fs";
import { createEditorToken } from "../packages/messages/src/access";
import { ClientMessageSchema } from "../packages/messages/src/schema";
import { stringify, parse } from "../apps/api/node_modules/superjson";

async function main() {
  const [host, room, login, secretFile, commandFile] = process.argv.slice(2);
  if (!commandFile)
    throw new Error(
      "Usage: control.ts host room login secret-file command-file",
    );
  const command = ClientMessageSchema.parse(
    JSON.parse(fs.readFileSync(commandFile, "utf8")),
  );
  const token = await createEditorToken(
    fs.readFileSync(secretFile, "utf8").trim(),
    room,
    login,
  );
  const protocol = host.startsWith("localhost") ? "ws" : "wss";
  const socket = new WebSocket(
    `${protocol}://${host}/parties/main/${room}?token=${encodeURIComponent(token)}`,
  );
  const timeout = setTimeout(() => {
    console.error("No confirmation. Check live state before retrying.");
    process.exit(1);
  }, 30000);
  socket.addEventListener("open", () => socket.send(stringify(command)));
  socket.addEventListener("message", (event) => {
    const message = parse<any>(String(event.data));
    if (message.type === "subathon.twitch.subscriptions")
      console.log(JSON.stringify(message));
    if (
      (message.type === "message.ack" && message.action === command.type) ||
      message.type === "message.error"
    ) {
      console.log(JSON.stringify(message));
      clearTimeout(timeout);
      socket.close();
      setTimeout(
        () => process.exit(message.type === "message.error" ? 1 : 0),
        100,
      );
    }
  });
  socket.addEventListener("error", () => {
    console.error("Connection failed.");
    process.exit(1);
  });
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
