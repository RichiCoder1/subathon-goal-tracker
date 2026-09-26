import Twitch from "@auth/core/providers/twitch";
import type { AuthConfig } from "@auth/core";
type AuthEnvironment = {
  AUTH_SECRET?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
};
export function createAuthConfig(env: AuthEnvironment) {
  return {
    basePath: "/api/auth",
    secret:
      env.AUTH_SECRET ||
      (import.meta.env.DEV ? import.meta.env.AUTH_SECRET : undefined),
    trustHost: true,
    providers: [
      Twitch({
        clientId:
          env.TWITCH_CLIENT_ID ||
          (import.meta.env.DEV ? import.meta.env.TWITCH_CLIENT_ID : undefined),
        clientSecret:
          env.TWITCH_CLIENT_SECRET ||
          (import.meta.env.DEV
            ? import.meta.env.TWITCH_CLIENT_SECRET
            : undefined),
        authorization: {
          params: {
            scope:
              "openid user:read:email user:bot bits:read channel:read:subscriptions channel:read:editors",
          },
        },
      }),
    ],
  } satisfies AuthConfig;
}
export default createAuthConfig({});
