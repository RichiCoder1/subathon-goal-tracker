import { ClientMessageSchema } from "@subathon-goal-tracker/messages/schema";
import { parse } from "superjson";

export function parseMessage(message: string) {
  let parsedMessage: object | null;
  try {
    parsedMessage = parse(message);
  } catch {
    parsedMessage = null;
  }

  return ClientMessageSchema.safeParse(parsedMessage);
}
