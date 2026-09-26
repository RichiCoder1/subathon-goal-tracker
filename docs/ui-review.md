# Settings usability review

Claude Opus 5.5, medium effort; September 26, 2026. Code review, not a browser test.

The screenshot at `.recovery/settings-preview.png` doesn't exist, so this review is based only on the six files. I didn't edit anything. Each item is marked by how safe it is to ship mid-stream: **copy** = text only, **CSS** = styling only, **small** = a few lines of logic.

## Prioritized improvements

### 1. Make connection and Twitch problems obvious at the top (small + CSS)
Right now `Settings.tsx:66` shows plain text like **"Connected · Connected."** (it says it twice). The Twitch event check is at the very bottom of the page (`:93`). If an event type is missing, subs stop adding time and nobody notices.

Replace the status line with one strip:

```
● Live · Twitch events 5/5 · Last saved: Goal added
```
- Disconnected: red strip, **"Disconnected. Buttons are off until we reconnect."** plus a Reconnect button.
- Fewer than 5 events: amber strip, **"Twitch: 3 of 5 events connected. Subs or bits may not add time."** plus a link to `#twitch-heading`.
- Show the notice only when it isn't just "Connected."

Also, the token failure path (`:25`) puts raw response text on screen. Use friendlier copy: **"You don't have editor access for this channel. Sign in with the account 7imberwolf added as a moderator."**

### 2. Fix the timer buttons, especially Start after the timer finishes (small, correctness)
`active` is false when `remainingTimeInSeconds === 0`, so **Start timer** becomes clickable after the timer finishes (`:55`, `:74`). I haven't checked what the server does with that.
- When finished: disable Start and show **"Finished. Add time below or use Reset controls."**
- Style the likely next action as the primary button: **Pause** while running, **Resume** while paused. The other button uses `secondary`.
- Put the state next to the digits with a time: **"Running · ends ~11:42 PM"** (from `endingAt`) or **"Paused since 1:05 AM · Resume for day two"**. This replaces the static line at `:73`.

### 3. Adjust time in minutes, and confirm before subtracting (small)
Mods think in minutes, and typing "-300" live is easy to get wrong.
- Label: **"Adjust time (minutes)"** with `step="0.5"`; convert to seconds when sending.
- Add preset chips that **fill the field without sending**: `+1 min`, `+5 min`, `+15 min`, `−5 min`.
- Change the button text to show what will happen: **"Add 5:00"** / **"Subtract 5:00"**. Negative values get a `window.confirm`, matching how goal removal already works.
- Add one line saying whether manual adjustments count toward the 20 h cap. I couldn't tell from these files.

### 4. Show the time rules as a plain sentence and remove the hardcoded hint (copy + small)
`SettingsForm.tsx:13` always says **"20 additional + 4 starting = 24 hours total"**, even after someone changes the cap. "Bits per time increment" and "Seconds per bit increment" are also hard to read.

Add a live summary above the fields, built from the current values:

> **Every sub (any tier) adds 2:30. Every 100 bits adds 1:00; smaller cheers add up. Extra time is capped at 20 h (24 h total with the 4 h start).**

- Rename the bits fields to **"Bits needed"** and **"Seconds added per that many bits"**.
- Show `= 2:30` next to each seconds field.
- Work out the "N additional + 4 starting" hint from the values, or remove it.

### 5. Show how much of the cap is used (small)
`:72` shows "02:30:00 earned of 20:00:00 additional time". Change it to:

> **2:30 of 20:00 extra hours used · 17:30 left**

When the cap is reached: **"Cap reached. New subs and bits are still counted for goals but won't add time."** (Check that this matches the server's behavior.)

### 6. One contributor row with Subs and Bits columns (small)
The totals table (`:88`) sorts bits and subs together by raw number, so 500 bits ranks above 20 subs, and one person can appear twice. Use one row per person, sorted by subs and then bits:

| Contributor | Subs | Bits |
|---|---|---|

In the Goals header, point out the next goal: **"Next: Cosplay stream: 12 to go"**.

### 7. Layout fixes (CSS, safe)
- `Layout.astro:7` uses `w-lvw`. On Windows, that width includes the scrollbar, so the page scrolls sideways. Use `w-full`.
- `Layout.astro:9` is an `<h1>`, and the settings page has its own `<h1>`, so there are two. Change the layout title to a link home: `<a href="/" class="font-semibold">Subathon Goal Tracker</a>`.
- Optional: make the timer and Pause/Resume stay visible while scrolling on phones: `position:sticky; top:0; background:Canvas;` with a bottom border.

### 8. Make reset side effects clear (copy)
Confirming a reset downloads a backup automatically (`:95`), but the copy doesn't say so. Change the confirm text to:

> **"Reset to 4:00:00 and clear earned time? A backup file will download first. Contribution totals stay."**

Also clear `resetConfirmation` when the `<details>` closes, so a stale confirm button doesn't reappear later.

## Suggested homepage (replaces the Astro starter)

Keep it server-only with no JS. The page already has `prerender = false`, so a GET form can redirect. It reuses `Settings.css` by wrapping in `.tracker-settings`, so the system font, blue accent, and light/dark styles come along.

**Check first:** is the `room` URL segment the Twitch login (`7imberwolf`) or the numeric broadcaster ID? And is the settings route `/subathon/{room}/settings`? The overlay path `/subathon/{room}/overlay` comes from `Settings.tsx:53`.

```astro
---
import Layout from '../layouts/Layout.astro';
import '../components/subathon/Settings.css';
export const prerender = false;
const channel = Astro.url.searchParams.get('channel')?.trim().toLowerCase();
if (channel && /^[a-z0-9_]{3,25}$/.test(channel)) return Astro.redirect(`/subathon/${channel}/settings`);
const invalid = channel !== undefined;
---
<Layout>
  <main class="tracker-settings">
    <h1>Subathon tracker</h1>
    <p class="muted">4 h start · every sub adds 2:30 · every 100 bits adds 1:00 · up to 20 extra hours · paused overnight</p>

    <section aria-labelledby="wolf">
      <h2 id="wolf">7imberwolf</h2>
      <div class="button-row">
        <a href="/subathon/7imberwolf/settings">Open moderator controls</a>
        <a href="/subathon/7imberwolf/overlay" target="_blank" rel="noreferrer">Open OBS overlay</a>
      </div>
      <p class="muted">For OBS, add a Browser Source with the overlay link.</p>
    </section>

    <section aria-labelledby="other">
      <h2 id="other">Another channel</h2>
      <form method="get" class="inline-form">
        <label>Twitch channel name<input name="channel" required pattern="[A-Za-z0-9_]{3,25}" autocomplete="off" placeholder="e.g. 7imberwolf" /></label>
        <button>Open controls</button>
      </form>
      {invalid && <p role="alert" class="tracker-error">Use a Twitch name: 3–25 letters, numbers, or underscores.</p>}
    </section>
  </main>
</Layout>
```

The rules line is hardcoded here. That's fine for this one stream, but update it if the settings change. You could also style the two main links as buttons by adding `a.button` next to the existing `.tracker-settings button` rule.

## What to ship during the stream
- **Right now (copy/CSS only):** #7, #8, the copy parts of #4, and the homepage.
- **Next, small logic that fixes risks:** #1 and #2.
- **During a break:** #3, #5, #6.