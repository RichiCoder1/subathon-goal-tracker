# Settings usability review — September 26, 2026

Read-only review by Claude Opus 5.5 at medium effort, before the follow-up implementation. Line numbers and findings describe that snapshot. The follow-up adds cap progress, section navigation, shorter contributor lists, a reviewed atomic setup flow, and shared preview/OBS rendering with configurable colors.

I reviewed the screenshot, `Settings.tsx`, `SettingsForm.tsx`, `Settings.css`, `index.astro`, and also `Overlay.tsx`/`.css` and the reset handling in `apps/api/src/server.ts` for context. I didn't edit anything.

## Top 5 usability fixes

**1. Make the time cap stand out. It matters right now.**
The screenshot shows only 01:29:00 left before the cap, but it looks like any other line of text (`Settings.tsx:309-320`).
- Add a native `<progress value={timeAdded} max={maxAdditional}>` under the timer.
- Give it an amber `.connection-warning` style when less than 10% or 2h remains, and a clear "Cap reached" state.
- No new dependencies.

**2. Move Contributions below the settings.**
With 400+ contributors, the Contributions table pushes Time rules, Twitch connection and Reset far down the page.
- Order the sections: Timer → Goals → Time rules → Twitch → Contributions → Reset.
- Or show only the top 10 contributors, with a `<details>` to see all.
- Keep "Download backup" near the top. It's your safety net.

**3. Narrow the Adjust time field.**
The minutes box stretches about 860px for a 2–3 character number. That hides the Apply button's link to the field and makes the form look like a text search.
- Add `.inline-form.time-adjust label { flex: 0 1 12rem }`.
- Put the helper text in the label so it sits next to the input.

**4. Tidy the goals table.**
- The "Remove" link sits lower than its row (visible in the screenshot) because of `vertical-align: top` plus the text-button's different padding. Use `vertical-align: middle` on `td`.
- Dim goals that are already reached (`.muted`) and highlight the next goal (bold, "next · 24 to go"). This is the row that matches what OBS shows.

**5. Make Reset safe during a live stream.**
The current Reset controls have real problems:
- "Reset timer…" always resets to 4h, whatever the starting time is (hardcoded `14400`, `Settings.tsx:661,674`).
- It works while the timer is running, and it's a separate step from "Clear totals…", so you can end up half-reset.
- Short term: disable both buttons unless the timer is paused or not started, with the note "Pause the timer first".
- Then replace them with the flow below.

Smaller item: the status line keeps showing "Changes saved." forever. Clear it after about 5s.

## Minimal Setup / Reset Subathon flow

**Client:** replace the Reset `<details>` with "Start a new subathon…". It opens a 2-step form in the same place (no modal library).
1. **Configure**, prefilled with defaults:
   - Starting hours: 4
   - Max extra hours: 20
   - Tier 1/2/3 subs: 150s each
   - Bits: 60s per 100 cumulative bits
   - Goal list: editable rows (name, target, remove), plus a "Copy current goals" button
   - You can reuse the fields from `GeneralSettingsForm` by pulling the `settings-fields` block into a shared component.
2. **Review:** a plain summary, for example: "New: 4h start, up to 20h extra (24h max). Sub = 2:30, 100 bits = 1:00. 6 goals. The current campaign (426 subs, 4,625 bits, 20:58:07 left) will be archived and cleared. The timer will wait for Start."
   - The user must type the channel name to enable **Archive and start fresh**.
   - Download the backup file first, as the current code already does.

**Server:** one new atomic message, `subathon.campaign.reset { startingTimeInSeconds, maxAdditionalSeconds, incrementValues, goals, expectedEndingAt }`.
- **Reject** it unless the timer is paused, not started, or finished. Also reject it if `expectedEndingAt !== this.endingAt`, so a stale second tab can't wipe a newer campaign.
- In one `storage.transaction`:
  - Write `campaign-archive:<v7>` containing the full `snapshot()` plus settings.
  - Delete the `contribution:*` keys and `increments`.
  - Save the new goals and settings.
  - Set `endingAt = pausedAt = null`, `subathonTimeInSeconds = start`, `timeAddedInSeconds = 0`, and delete the alarm.
- Remove the old `subathon.reset` and `subathon.increments.reset` buttons once this works.

**Protecting live data:** build and test only on another room (for example a test channel via "Open another channel") or locally. Don't deploy the server change mid-stream without checking that 7imberwolf's room loads exactly as before.

## Appearance (preview background, timer and goal colors)

**Important:** the overlay isn't transparent today. It has an opaque cyan `bg-[#7edeff]` (`Overlay.tsx:86`). Removing it will change what's on stream immediately, so confirm the OBS scene doesn't rely on that color. Also, the "Paused" / "Reconnecting…" status text is `#111` (`Overlay.css:12`) and will be invisible on dark gameplay once the background is transparent. Give it the same black outline as the timer, or use the goal color.

**Data:**
- Add an `appearance: { timerColor, goalColor, previewBackground }` storage key, included in `snapshot()`, with a `subathon.appearance.update` message and a zod hex regex.
- The overlay reads only `timerColor` and `goalColor`. It never reads `previewBackground`, so OBS stays transparent by design.

**Rendering:**
- Pull the inner markup of `Overlay.tsx` into an `OverlayDisplay({ state, seconds, timerColor, goalColor })` component.
- The overlay page wraps it in a transparent container. Settings wraps it in a small preview box (about 360px, `background: previewBackground`).
- That way the preview can't drift from what's actually on stream.

**Placement:** a compact "Overlay" section right after Time rules, collapsed by default:
- The header's "Open OBS overlay" and "Copy overlay link" move here (keep a small copy link in the header).
- One row of three native `<input type="color">`: **Timer text**, **Goal text**, **Preview background (this page only)**.
- The preview box, labeled "Preview".
- One line of helper text: "OBS Browser Source is always transparent. The preview background is only for checking contrast."
- Save / Discard buttons, using the same draft pattern as `GeneralSettingsForm`.
