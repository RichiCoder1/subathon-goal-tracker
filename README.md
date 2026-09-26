# Subathon Goal Tracker

Twitch contributions, moderator controls, and an OBS overlay. Astro/React serves the website on Cloudflare Workers; PartyKit stores each channel's timer and contribution history.

- [Home](https://subathon.puplications.dev/)
- [7imberwolf controls](https://subathon.puplications.dev/subathon/7imberwolf/settings)
- [7imberwolf OBS overlay](https://subathon.puplications.dev/subathon/7imberwolf/overlay)

## Running the stream

Sign in with Twitch as the broadcaster or a named editor. The current editor list is in `packages/messages/src/access.ts`; it was seeded from 7imberwolf's active moderators on September 26, 2026. It is an explicit list, not an automatically synchronized moderator role.

Start with four hours. Each sub, including a shared resub, adds 150 seconds regardless of tier. Every cumulative 100 bits adds 60 seconds; cheers, Power-ups, and custom Power-ups count. The event has 20 additional hours available, for 24 hours total. **Pause at the end of each day's stream and Resume the next day.** The separate 12-hour daily limit is managed by the streamer; the tracker caps the combined earned time.

Use minute adjustments for corrections. Positive manual adjustments consume the same cap; negative adjustments free that amount. Download a backup before making large changes. Set up / reset prepares a new campaign in one operation: choose starting hours, contribution rates, the earned-time cap, and goals, then review and confirm the channel name. Pause a running timer first. Previous settings and contributions are archived, a backup downloads, and the new timer waits for Start. Repeating a request cannot reset the campaign twice.

The settings page shows the five required Twitch event connections. Repair reconnects missing subscriptions without removing healthy ones. If authorization was revoked, the broadcaster must sign in again. The OBS URL stays the same and its background is always transparent, including in dark mode. Overlay colors lets you preview and save timer and goal text colors. The preview background is shown only on the settings page. Saved text colors sync to connected OBS sources; refresh the Browser Source once to load this upgrade.

## Local development

Use Node 22.12+ (Node 24 LTS recommended) and the pinned pnpm version (`corepack pnpm install`, then `corepack pnpm dev`). Development uses a local PartyKit instance, not `--live`. Run focused checks with `corepack pnpm test`, API type checks with `corepack pnpm --filter api exec tsc --noEmit`, and build with `corepack pnpm --filter web build`.

Local secrets are not tracked. Configure `apps/api/.env` with `TWITCH_BASE_URL=https://api.twitch.tv/helix/`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_SECRET` (webhook signing), and `EDITOR_SECRET` (settings access signing). Configure `apps/web/.dev.vars` with `AUTH_SECRET`, the Twitch client ID/secret, and the same `EDITOR_SECRET`. Use separate local signing secrets. Register the local OAuth callback if testing sign-in locally. Production web authentication reads runtime bindings, so stale local secrets cannot overwrite production authentication during a build.

Regenerate Worker types with `corepack pnpm --filter web cf-typegen` when bindings change. Both applications pass TypeScript checks. Authentication uses `@auth/core` directly with CSRF-protected sign-in/out and runtime Cloudflare bindings. Astro 7 develops and builds against Cloudflare’s runtime; no separate KV session store is needed.

## Deploying

Deploy the API with `corepack pnpm --filter api deploy`. Do not add `--with-vars` unless intentionally updating every environment variable: an old local `.env` can replace working production credentials. Set `EDITOR_SECRET` on both services through their secret/environment commands.

Run `corepack pnpm --filter web build:production`, then run `wrangler versions upload` and `wrangler versions deploy <version-id>@100% --yes` from `apps/web` using its installed Wrangler. The build selects `CLOUDFLARE_ENV=production`; Wrangler follows its generated configuration. Do not add `--env` after the build. This updates the existing Worker without changing routes. The production account is `80db9794f2580aa741a8fb8bbc3278e3`. Existing Twitch and authentication secrets are retained.

## Recovery and attribution

Storage migrations are additive. Twitch delivery IDs prevent retry duplicates. Gift-recipient notifications are ignored in favor of the gift batch; the overlapping cheer notification from `channel.bits.use` is ignored in favor of `channel.cheer`. Inactive events are kept in storage for an explicit recovery, rather than silently discarded. There is no automatic full Twitch history replay.

`scripts/snapshot.mjs` saves a read-only backup under ignored `.recovery/`. `scripts/reconcile.mjs` compares a saved Twitch moderator activity feed with a later tracker snapshot; it is scoped to the September 26 recovery and only produces a report. `scripts/control.ts` sends a reviewed, schema-validated command using a local signing-secret file. Recovery commands use a stable batch ID, retain contributor names and evidence notes, and can be retried without counting twice. Never commit credentials or raw recovery evidence.

See [the recovery record](docs/recovery-2026-09-26.md), [Opus’s first UI review](docs/ui-review.md), and [the follow-up review](docs/ui-review-follow-up.md).

Direct dependencies are upgraded to current stable releases, including Astro 7, React 19.3, TypeScript 7, and Wrangler 4.141. PartyKit 0.0.115 is still its latest release; its existing hosted room/storage is retained to preserve live data. Scoped dependency overrides patch its older local esbuild and Miniflare/Undici dependencies. The dependency audit reports zero known vulnerabilities as of September 26, 2026.

Twitch reports resubs when the viewer shares the resub message. Unshared renewals and bits spent through third-party extensions are not available through these subscriptions. Twitch can also emit both subscribe and resub-message events for a returning subscriber without a shared transaction ID; this tracker deduplicates delivery retries, but cannot perfectly correlate that case. Sources: [Twitch subscriptions](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), [Twitch PubSub migration notes](https://dev.twitch.tv/docs/pubsub/).
