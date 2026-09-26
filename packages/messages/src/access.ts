// Active Twitch moderators captured for the September 2026 event.
export const editors: Record<string, string[]> = {
  "7imberwolf": [
    "morocodes",
    "azibytes",
    "fuzzylunarex",
    "orbitusaltaris",
    "remmus_wolf",
    "7imber_bot",
    "sery_bot",
  ],
};
export function canEditRoom(room: string, login: string) {
  return room === login || (editors[room] ?? []).includes(login);
}
const encoder = new TextEncoder();
async function key(secret: string) {
  if (!secret) throw new Error("Settings signing secret is not configured");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function createEditorToken(
  secret: string,
  room: string,
  login: string,
) {
  const payload = btoa(
    JSON.stringify({ room, login, expiresAt: Date.now() + 15 * 60 * 1000 }),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await key(secret),
    encoder.encode("subathon-editor:" + payload),
  );
  return (
    payload +
    "." +
    Array.from(new Uint8Array(signature), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("")
  );
}
export async function verifyEditorToken(
  secret: string,
  room: string,
  token: string | null,
) {
  try {
    const [payload, signature, extra] = (token ?? "").split(".");
    if (extra || !payload || !/^[a-f0-9]{64}$/.test(signature ?? ""))
      return null;
    const bytes = Uint8Array.from(signature.match(/../g)!, (s) =>
      parseInt(s, 16),
    );
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await key(secret),
        bytes,
        encoder.encode("subathon-editor:" + payload),
      ))
    )
      return null;
    const claims = JSON.parse(atob(payload));
    if (
      claims.room !== room ||
      typeof claims.login !== "string" ||
      !Number.isFinite(claims.expiresAt) ||
      claims.expiresAt <= Date.now() ||
      !canEditRoom(room, claims.login)
    )
      return null;
    return claims as { room: string; login: string; expiresAt: number };
  } catch {
    return null;
  }
}
