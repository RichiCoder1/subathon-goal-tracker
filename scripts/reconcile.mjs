// Read-only reconciliation. Capture the tracker snapshot AFTER the Twitch feed.
import fs from "node:fs";
import { createHash } from "node:crypto";
const [feedFile, snapshotFile, outputFile] = process.argv.slice(2);
if (!outputFile)
  throw Error("Usage: reconcile.mjs feed.json snapshot.json report.json");
const feed = JSON.parse(fs.readFileSync(feedFile));
const backup = JSON.parse(fs.readFileSync(snapshotFile));
if (Date.parse(backup.capturedAt) < Date.parse(feed.capturedAt))
  throw Error("Capture the tracker snapshot after the feed.");
const key = (e) => `${e.userName.toLowerCase()}:${e.kind}:${e.value}`;
const stored = Object.entries(backup.state.increments).flatMap(
  ([kind, items]) => items.map((e) => ({ ...e, kind })),
);
const unmatched = [...stored];
const missing = [];
const events = [];
for (const [index, row] of feed.rows.entries()) {
  if (row.date !== "Sep 26, 2026") continue;
  const [who, action = "", when = ""] = row.text
    .split("•")
    .map((x) => x.trim());
  let event;
  let match;
  if ((match = action.match(/^Gave out ([\d,]+) Community Sub gifts?/)))
    event = {
      userName: who,
      kind: "tier1",
      value: Number(match[1].replaceAll(",", "")),
    };
  else if ((match = action.match(/^Gifted a \d+ Month Tier ([123]) sub /)))
    event = { userName: who, kind: `tier${match[1]}`, value: 1 };
  else if (
    (match = action.match(/^(?:Resubscribed|Subscribed).*?Tier ([123])/))
  )
    event = { userName: who, kind: `tier${match[1]}`, value: 1 };
  else if ((match = action.match(/^Cheered ([\d,]+) Bits/)))
    event = {
      userName: who,
      kind: "bits",
      value: Number(match[1].replaceAll(",", "")),
    };
  else if ((match = action.match(/^(.+?) used ([\d,]+) Bits/)))
    event = {
      userName: match[1],
      kind: "bits",
      value: Number(match[2].replaceAll(",", "")),
    };
  if (!event) continue;
  const minutes = Number(when.match(/^(\d+) minutes? ago/)?.[1] ?? 0);
  const hours = Number(when.match(/^(\d+) hours? ago/)?.[1] ?? 0);
  event.occurredAt = new Date(
    Date.parse(feed.capturedAt) - (minutes + hours * 60) * 60000,
  ).toISOString();
  event.evidence = row.text;
  events.push(event);
  const at = unmatched.findIndex((e) => key(e) === key(event));
  if (at >= 0) unmatched.splice(at, 1);
  else
    missing.push({
      ...event,
      id: `recovery-20260926-${createHash("sha256")
        .update(feed.capturedAt + ":" + index + ":" + row.text)
        .digest("hex")
        .slice(0, 24)}`,
      note: "Twitch moderator activity feed; event time is approximate (relative timestamp).",
    });
}
const totals = (items) =>
  Object.fromEntries(
    ["tier1", "tier2", "tier3", "bits"].map((kind) => [
      kind,
      items.filter((e) => e.kind === kind).reduce((s, e) => s + e.value, 0),
    ]),
  );
const result = {
  feedFile,
  snapshotFile,
  feedCapturedAt: feed.capturedAt,
  snapshotCapturedAt: backup.capturedAt,
  feedTotals: totals(events),
  missingTotals: totals(missing),
  missing,
  unmatchedStored: unmatched,
};
fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      feedTotals: result.feedTotals,
      missingTotals: result.missingTotals,
      unmatchedStored: unmatched.length,
    },
    null,
    2,
  ),
);
