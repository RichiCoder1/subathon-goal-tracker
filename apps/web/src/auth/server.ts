import { Auth, type AuthConfig } from "@auth/core";
import type { Session } from "@auth/core/types";

export async function getSession(
  request: Request,
  config: AuthConfig,
): Promise<Session | null> {
  const response = await Auth(
    new Request(new URL("/api/auth/session", request.url), {
      headers: request.headers,
    }),
    config,
  );
  if (!response.ok) throw new Error("Unable to read your sign-in session.");
  const session = (await response.json()) as Session | null;
  return session?.user ? session : null;
}
