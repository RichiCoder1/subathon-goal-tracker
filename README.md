# Subathon Goal Tracker

Twitch contributions, moderator controls, and an OBS overlay. Astro/React serves the website on Cloudflare Workers; PartyKit stores each channel's timer and contribution history.

- [Home](https://subathon.puplications.dev/)
- [7imberwolf controls](https://subathon.puplications.dev/subathon/7imberwolf/settings)
- [7imberwolf OBS overlay](https://subathon.puplications.dev/subathon/7imberwolf/overlay)

## Running the stream

Sign in with Twitch as the broadcaster or a named editor. The current editor list is in `packages/messages/src/access.ts`; it was seeded from 7imberwolf's active moderators on September 26, 2026. It is an explicit list, not an automatically synchronized moderator role.

Start with four hours. Each sub, including a shared resub, adds 150 seconds regardless of tier. Every cumulative 100 bits adds 60 seconds; cheers, Power-ups, and custom Power-ups count. The event has 20 additional hours available, for 24 hours total. **Pause at the end of each day's stream and Resume the next day.** The separate 12-hour daily limit is managed by the streamer; the tracker caps the combined earned time.

Use minute adjustments for corrections. Positive manual adjustments consume the same cap; negative adjustments free that amount. Download a backup before making large changes. Reset controls are separate from Pause and require confirmation; clearing totals archives the stored entries.

The settings page shows the five required Twitch event connections. Repair reconnects missing subscriptions without removing healthy ones. If authorization was revoked, the broadcaster must sign in again. The OBS URL stays the same; refresh its Browser Source to load interface updates.

## Local development

Use Node 22+ and the pinned pnpm version (`corepack pnpm install`, then `corepack pnpm dev`). Development uses a local PartyKit instance, not `--live`. Run focused checks with `corepack pnpm test`, API type checks with `corepack pnpm --filter api exec tsc --noEmit`, and build with `corepack pnpm --filter web build`.

Local secrets are not tracked. Configure `apps/api/.env` with `TWITCH_BASE_URL=https://api.twitch.tv/helix/`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_SECRET` (webhook signing), and `EDITOR_SECRET` (settings access signing). Configure `apps/web/.dev.vars` with `AUTH_SECRET`, the Twitch client ID/secret, and the same `EDITOR_SECRET`. Use separate local signing secrets. Register the local OAuth callback if testing sign-in locally. Production web authentication reads runtime bindings, so stale local secrets cannot overwrite production authentication during a build.

Regenerate Worker types with `corepack pnpm --filter web cf-typegen` when bindings change. `auth-astro` 4.2.0 currently has dependency-source TypeScript errors; the production build and API type check pass. Do not treat those existing dependency errors as a complete frontend type check.

## Deploying

Deploy the API with `corepack pnpm --filter api deploy`. Do not add `--with-vars` unless intentionally updating every environment variable: an old local `.env` can replace working production credentials. Set `EDITOR_SECRET` on both services through their secret/environment commands.

Build the web app, then run `wrangler versions upload --env production` and `wrangler versions deploy <version-id>@100% --env production` from `apps/web` using its installed Wrangler. This updates the existing Worker without changing routes. The production account is `80db9794f2580aa741a8fb8bbc3278e3`. Existing Twitch and authentication secrets are retained.

## Recovery and attribution

Storage migrations are additive. Twitch delivery IDs prevent retry duplicates. Gift-recipient notifications are ignored in favor of the gift batch; the overlapping cheer notification from `channel.bits.use` is ignored in favor of `channel.cheer`. Inactive events are kept in storage for an explicit recovery, rather than silently discarded. There is no automatic full Twitch history replay.

`scripts/snapshot.mjs` saves a read-only backup under ignored `.recovery/`. `scripts/reconcile.mjs` compares a saved Twitch moderator activity feed with a later tracker snapshot; it is scoped to the September 26 recovery and only produces a report. `scripts/control.ts` sends a reviewed, schema-validated command using a local signing-secret file. Recovery commands use a stable batch ID, retain contributor names and evidence notes, and can be retried without counting twice. Never commit credentials or raw recovery evidence.

See [the recovery record](docs/recovery-2026-09-26.md) and [Opus's UI review](docs/ui-review.md).

Twitch reports resubs when the viewer shares the resub message. Unshared renewals and bits spent through third-party extensions are not available through these subscriptions. Twitch can also emit both subscribe and resub-message events for a returning subscriber without a shared transaction ID; this tracker deduplicates delivery retries, but cannot perfectly correlate that case. Sources: [Twitch subscriptions](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), [Twitch PubSub migration notes](https://dev.twitch.tv/docs/pubsub/).
