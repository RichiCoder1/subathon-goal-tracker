// Auth.js validates the double-submit CSRF cookie on both POST endpoints.
export async function authenticate(action: "signin/twitch" | "signout") {
  const csrf = await fetch("/api/auth/csrf", { cache: "no-store" });
  if (!csrf.ok) throw new Error("Sign-in is unavailable. Please try again.");
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const response = await fetch(`/api/auth/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({ csrfToken, callbackUrl: location.href }),
  });
  if (!response.ok)
    throw new Error("Could not complete sign-in. Please try again.");
  const { url } = (await response.json()) as { url: string };
  location.assign(url);
}
