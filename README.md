# Prep Calculator

Five integrated tools for contest prep and body recomposition planning:

1. **Fat Loss Timeline** — reverse-engineers prep duration (or a required start date) from a safe weekly fat loss rate, with a week-by-week milestone table and projection chart.
2. **Carb Cycling** — builds a weekly high / medium / low carb rotation whose 7-day calorie, protein, carb, and fat totals average out *exactly* to your target.
3. **Roadmap** — expands the two into a day-by-day calendar from start date to goal date: calories and macros for every single day.
4. **Nutrition** ("Food" on phones) — a **Food log** against each day's targets (scan a barcode, search by name, or type numbers from the label) and, in its **Fasting** section, an intermittent fasting timer.
5. **Check-in** — log weigh-ins, see predicted vs actual, and get calorie adjustments worked out from your real rate of loss.

The timeline's derived calorie target can be handed straight over to the carb cycling tool with one click.

## Getting started

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:3000>.

Other scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`.

Requires Node.js 20+ (developed and verified against Node 24.18.1 LTS, npm 11.16).

## Architecture

```
src/
  app/
    layout.tsx              Root layout + pre-paint theme script
    page.tsx                Renders <AppShell />
    globals.css             Design tokens (light + dark), Tailwind layers
  lib/                      ← all math and pure logic lives here
    types.ts                Shared domain types
    units.ts                Unit conversion + energy constants
    dates.ts                UTC-safe ISO date helpers
    body-composition.ts     BMR, TDEE, and body fat from biometrics
    fat-loss.ts             Timeline simulation engine
    carb-cycling.ts         Weekly macro rotation engine
    weekday-pattern.ts      Which weekday is high / medium / low
    roadmap.ts              Day-by-day plan from timeline + rotation
    format.ts               Display formatting
    defaults.ts             Default inputs and schedule presets
    persistence.ts          LocalStorage + URL query state, with sanitisation
    food.ts                 Food log types, validation, label maths, database normalising
    food-lookup.ts          Barcode lookup + food search (via the Worker)
    barcode-reader.ts       Camera / photo barcode decoding (native or ZXing)
    utils.ts                cn() class merger
  components/
    ui/                     shadcn-style Radix primitives
    app-shell.tsx           Tabs, shared state, persistence wiring
    profile-card.tsx        Shared biometrics panel (both tabs)
    fat-loss-calculator.tsx
    carb-cycling-calculator.tsx
    weight-curve-chart.tsx  Recharts weight + body fat curve
    weekly-macro-chart.tsx  Recharts 7-day calorie bars
    roadmap-calendar.tsx    Month calendar, day detail, week list
    weekday-pattern-editor.tsx  Click-to-cycle Mon–Sun day types
    macros-tab.tsx          Daily targets, food log, My foods
    add-food-card.tsx       Scan / search / quick add / amount picker
    barcode-scanner.tsx     Live camera view with a photo fallback
    milestone-table.tsx
    macro-card.tsx
    field.tsx, stat.tsx, warnings.tsx, copy-button.tsx, theme-toggle.tsx
```

Every calculation is a pure function in `src/lib/`. Components never do arithmetic beyond formatting, which means the engines can be unit-tested or reused server-side without touching React.

## What the user has to know

The only inputs required are things people actually know about themselves:

**Current weight · Height · Age · Sex**

Body fat percentage is *derived*, not asked for. Requiring it is a hard stop for most users — very few have had a DEXA or BodPod scan, and a guessed number silently corrupts every downstream projection. Weight, height, age, and sex are entered once on a shared profile panel and drive both calculators.

### Maintenance calories — Mifflin-St Jeor

```
BMR = 10·kg + 6.25·cm − 5·age + s        s = +5 (male) / −161 (female)
TDEE = BMR × activity factor             1.2 / 1.375 / 1.55 / 1.725 / 1.9
```

This replaced an earlier "kcal per pound of body weight" shortcut, which implicitly assumes an average height and misestimates tall or short people badly. Users who have tracked their intake at stable weight can still enter a measured maintenance figure, which overrides the equation and is scaled as they get lighter.

### Body fat — Deurenberg

```
BF% = 1.20·BMI + 0.23·age − 10.8·sex − 5.4        sex = 1 (male) / 0 (female)
```

**This estimate has a caveat that matters a lot for this app's audience.** It is a population regression against BMI, and BMI cannot distinguish muscle from fat, so a trained lifter will read several points high. The app handles this three ways:

1. The number is labelled **Estimated** rather than presented as fact.
2. At BMI ≥ 27 with no measurement, an inline notice explains that muscle may be inflating the reading.
3. An **"I know my body fat %"** button reveals an optional override for users who *do* have a measurement — relabelling the figure **Measured** and bypassing the equation. This is deliberately opt-in and never blocks anyone.

Sex only has male/female because that is how the coefficients in both equations are published. Users for whom neither fits can supply a measured body fat percentage and a known maintenance figure, which bypasses both equations entirely — this is called out in the field's help text.

## The fat loss model

The timeline is a **week-by-week simulation**, not a single division, because everything moves as body weight moves.

**Dynamic rate curve.** The target is a percentage of *current* weight, so weekly pounds shrink as you do:

```
W(n) = W(0) · (1 − r)^n
```

At 200 lb and 0.75%/week that is 1.50 lb in week 1 but 1.31 lb by week 18. The closed-form inverse is used for fractional-week precision and as a cross-check on the simulation:

```
n = ln(Wₙ / W₀) / ln(1 − r)        weeks to a target
r = 1 − (Wₙ / W₀)^(1/n)            rate required to make a fixed date
```

**Composition tracking.** Weight lost is split into fat and lean tissue, and the two are priced differently — 3500 kcal/lb for adipose, 824 kcal/lb for fat-free mass. Treating all tissue as 3500 kcal/lb is the classic error that makes naive calculators over-promise. The split itself depends on two things:

- **Aggressiveness** — roughly 95% of loss comes from fat at 0.5%/week, falling to about 80% at 1.0%/week.
- **Existing leanness** — the leaner you already are, the more lean tissue the body surrenders (Forbes' curve). 20% body fat is the neutral pivot.

**Falling maintenance.** Height, age, and sex stay fixed as weight falls, so each week's weight is fed back through Mifflin-St Jeor to get that week's maintenance. Metabolic adaptation is layered on top — an asymptotic drop approaching 10%, since most adaptation happens in the first couple of months rather than accruing linearly forever.

**Intake floor.** Prescribed intake is clamped at the higher of 1200 kcal and 8 kcal/lb. Weeks that hit the floor are flagged, and the guidance is to open the gap with activity rather than further food cuts — the projection assumes the deficit is still achieved.

These coefficients are a practical fit to the literature, not a claim of individual precision. Two people at the same rate will diverge.

## The carb cycling model

The design principle is that **protein and fat are weekly-budgeted and carbohydrate does the cycling**. That ordering is what makes "the week averages out exactly" fall out of the math instead of needing a correction pass:

1. Protein is identical every day → weekly protein total is exact.
2. Fat is drawn from a fixed weekly budget, weighted so low days carry more of it (high 0.8 / medium 1.0 / low 1.35) → weekly fat total is exact.
3. High and low days move carbs off baseline by the configured percentages, and **medium days absorb the remainder** → weekly carb total is exact.

Three exact weekly macro totals imply an exact weekly calorie total, so the average day always lands on target with no drift.

**Edge cases handled:**

- **No medium days.** Nothing is left to absorb the imbalance, so the two swings are forced to cancel each other (`nHigh · boost = nLow · cut`) by shrinking whichever side is larger.
- **Fat floor.** Each day gets at least the higher of the percentage-of-calories rule and the g/lb rule. Days below the floor are raised, and the shortfall is reclaimed proportionally from days that still have room.
- **Impossible schedules.** A large high-day boost with too few medium days requires negative medium-day carbs. Because the displayed value is clamped at zero, the *pre-clamp* number is what gets checked — otherwise a broken plan is indistinguishable from one that legitimately lands on zero.
- **Crowded-out carbs.** When protein plus the fat floor already consume the whole calorie target, the plan is marked infeasible rather than silently producing negative carbs.

## The roadmap

The roadmap is a sub-section of the **Carb Cycling** tab (its *Weekly plan | Roadmap* switch). Internally `roadmap` is still its own `activeTab` value, so links that open it (`?t=roadmap`, Check-in's "Open the roadmap") and saved tabs keep working.

The roadmap combines the two engines, each doing what it is best at:

- The **timeline** sets how much to eat each week. Its targets step down as body weight and maintenance fall, so week 12 is not week 1.
- The **carb-cycling engine** splits that week's budget across high / medium / low days.

The carb-cycling allocation is re-run **for every week**, not once, because both of its inputs move: the calorie target drops, and protein and the fat floor are set per pound of a body weight that is also dropping. Each week still averages exactly to its timeline target (verified within 0.3 kcal/day across all 18 weeks of the default plan).

The daily target and carb deficit on the Carb Cycling tab are deliberately *not* used here — the timeline is what gets you to the goal on a specific date.

**Which day is which.** The carb-cycling engine only needs counts ("2 high, 3 medium, 2 low"); a calendar needs to know that Monday is a high day. `weekday-pattern.ts` places them automatically — high days spread through the week, low days offset half a gap so they fall between hard sessions:

| Schedule | Auto pattern (Mon → Sun) |
|---|---|
| 2 / 3 / 2 | H M L M H L M |
| 3 / 2 / 2 | H M H L M H L |
| 1 / 3 / 3 | H L M M L M L |

Users can click any weekday to change it, in either the Weekly plan or the Roadmap. The counts follow the pattern, and changing the counts directly discards a hand-placed pattern so it can't go stale. The pattern travels in shared links as seven letters (`wp=HMLMHLM`).

**Calendar.** One month at a time, Monday-first. Each day shows its type, calories, and (on wider screens) P/C/F grams; weeks with an allocation problem carry a dot. It's a proper ARIA grid with a single tab stop — arrow keys move by day and week, Home/End jump within the week, and moving past a month edge pages the calendar. Selecting a day shows its full macros, that week's projected weight, the change in intake from the previous week, any coaching note, and copy buttons for the day or the whole week.

## Check-ins: predicted vs actual

The **Check-in** tab is where members log weigh-ins. The app compares them with the plan and recommends calorie changes; the Roadmap plots the same comparison and shows logged weights on the calendar.

The tab has five sub-sections (`CheckinSection` in `checkin-tab.tsx`): **Weigh-in** (log, progress vs plan, calorie changes, weigh-in history), **Daily non-negotiables** (habit checklist with streaks & consistency), **Measurements**, **Progress photos** and **Weekly scorecard**. Phones show short labels. Only Weigh-in needs a goal to be set. The open section lives in the app shell, so links from other tabs land on the right one (Nutrition and the leaderboard open Daily non-negotiables; the roadmap's "Log a weigh-in" opens Weigh-in).

### Where the data lives

| Mode | When | Storage |
|---|---|---|
| **Cloud** | Opened inside a configured Whop app | Cloudflare D1, keyed by the member's Whop user id — follows them across devices |
| **Local** | Anywhere else: direct link, plain embed, Whop not yet configured | This browser only, and the app says so |

The mode is decided at startup by `GET /api/session`. When a member who logged locally later opens the app in cloud mode, their local weigh-ins are uploaded (the cloud copy wins if both have the same day) and the local copy is cleared, so nothing is stranded on one device.

### Identity

Inside a Whop app iframe, Whop's proxy adds a signed JWT (`x-whop-user-token`) to every same-origin request. `worker/auth.ts` verifies it the same way Whop's official `@whop/api` package does — ES256, issuer `urn:whopcom:exp-proxy`, `sub` is the user id — with two tightenings: the audience **must** equal `WHOP_APP_ID` (Whop's own verifier treats it as optional), and keys come from Whop's published JWKS rather than one hard-coded key, so a key rotation can't lock everyone out. The user id is only ever taken from a verified token, never from a request body or URL.

### The adjustment maths (`src/lib/adaptive.ts`)

- **Rate, not single readings.** A least-squares line through up to 21 days of weigh-ins; daily weight swings 2–4 lb on water alone.
- **Enough data first.** At least 6 weigh-ins spanning at least 10 days before any verdict.
- **Dead band.** Within 0.2 lb/week (or 15% of the planned rate) is on track.
- **Real maintenance** = intake + (weekly loss × energy per lb) / 7, using the timeline's fat-vs-lean energy density. Logged calories are used when at least 5 days in the window have them; otherwise planned intake is assumed and the app says so.
- **Small steps.** Each change is capped at ±300 kcal/day, rounded to 25, starts at the next diet-week boundary (so every week still averages exactly to its target), and never goes below the intake floor — any shortfall becomes an activity target instead.
- **Let it settle.** No new recommendation for 14 days after a change takes effect.
- **Faster isn't better.** Losing well ahead of plan recommends eating *more*, since fast loss costs lean mass.

Accepted changes are stored with the plan and shift the roadmap's calories from their week onward. The timeline's predicted weights deliberately don't move — that's the line being steered back to.

### API (`worker/index.ts`)

| Route | Purpose |
|---|---|
| `GET /api/session` | Cloud or local, and why |
| `GET /api/weigh-ins` | All of my weigh-ins |
| `PUT /api/weigh-ins/:date` | Create or replace one day |
| `DELETE /api/weigh-ins/:date` | Remove one day |
| `GET` / `PUT /api/plan` | My saved setup, including applied adjustments |
| `GET /api/food-logs?from&to` | My food logs in a date range (≤ 400 days) |
| `PUT /api/food-logs/:date` | Replace one day's food log (`[]` deletes it) |
| `GET /api/my-foods` · `PUT` / `DELETE /api/my-foods/:id` | Foods I typed in myself |
| `PUT` / `DELETE /api/fasting-reminders` | Turn my fasting notifications on (or update them) / off |
| `PUT` / `DELETE /api/reminders` | Set my weigh-in / habits / recap reminder times / turn them all off |
| `GET` / `PUT` / `DELETE /api/measurements[/:date]` | My body measurements |
| `GET` / `POST /api/photos`, `GET` / `DELETE /api/photos/:id`, `PUT /api/photo-settings` | My progress photos (optional) and whether my coach may see them |
| `GET /api/coach/overview?company=biz_…` | Coach dashboard data — admins of that whop only |
| `GET /api/coach/photo?company&member&id` | A member’s photo — admins only, and only while that member shares |
| `GET` / `PUT` / `DELETE /api/leaderboard` | View (members of that community), join, or leave the streak leaderboard |
| `GET /api/workouts` · `PUT` / `DELETE /api/workouts/:id` | My workouts (saved while in progress, too) |
| `GET /api/lift-board?experience=exp_…` | Lift leaderboard, my submissions, and (admins) the review queue |
| `POST /api/lift-board/submissions` · `DELETE …/:id` · `PUT …/:id/review` | Submit a lift / withdraw mine / approve or reject (admins of that community) |
| `GET /api/food/barcode/:code` | **Public.** Product for a barcode |
| `GET /api/food/search?q=` | **Public.** Search products by name |
| `DELETE /api/me` | Delete everything stored about me |

Writes require `application/json` (so cross-site HTML forms can't reach them), bodies are size-capped, every field is re-validated server-side with the same rules the browser uses (`src/lib/tracking.ts`), and responses are `Cache-Control: no-store`.

### Switching on cloud sync

Until these steps are done the app runs in local mode everywhere — nothing breaks.

1. **Log in to Cloudflare from this machine** (opens a browser):
   ```bash
   npx wrangler login
   ```
2. **Create the database** and paste the printed `database_id` into `wrangler.jsonc`:
   ```bash
   npx wrangler d1 create leanligercalc
   ```
3. **Create the tables:**
   ```bash
   npm run db:migrate
   ```
4. **Create a Whop app** in Whop's developer dashboard. In its **Hosting** section set the base URL to `https://leanligercalc.lean-liger-fitness.workers.dev` and leave the app path at Whop's default, `/experiences/[experienceId]` — the Worker serves the app at `/experiences/*` and `/dashboard/*`. Install it into your whop, and paste its app id (`app_…`) into `WHOP_APP_ID` in `wrangler.jsonc`. The app id is public, not a secret.
5. **Fasting notifications (optional):** in the Whop developer dashboard, give the app the `notification:create` permission, copy its **API key**, and store it as a secret. Paste the key only when Wrangler prompts for it:
   ```bash
   npx wrangler secret put WHOP_API_KEY
   ```
6. **Deploy:**
   ```bash
   npm run deploy
   ```

From then on, **always deploy with `npm run deploy`**. A drag-and-drop upload in the Cloudflare dashboard replaces the Worker with static files only, which silently removes the check-in API.

### Local development

```bash
npm run dev:worker
```

builds the static export, applies migrations to a local database, and runs the real Worker at `http://127.0.0.1:8787`. To exercise fasting notifications locally without contacting Whop, run `wrangler dev --test-scheduled --var WHOP_API_KEY:test --var WHOP_API_BASE:http://127.0.0.1:9999` against a stub server, and trigger the scheduler through the local explorer (`POST /cdn-cgi/local/explorer/api/local/scheduled?worker=leanligercalc` with `{"cron":"* * * * *"}`). Copy `.dev.vars.example` to `.dev.vars` to act as a test user without Whop's proxy. That shortcut is honoured **only** for requests to localhost, so it can't be used against production even if the variable leaked into production config.

### Privacy

Body weight and food logs are health data. Members can delete everything from Settings (the gear at the top left, behind an "Are you sure?" step; `data-settings.tsx`) at any time (`DELETE /api/me` removes their weigh-ins, habits, reviews, food logs, saved foods, measurements, photos, workouts, lift submissions and plan). The privacy policy is at **`/privacy/`** (`src/app/privacy/page.tsx`), linked from the footer and the Settings panel. Every statement in it describes what the code actually does — when a feature changes what is stored or who it is shared with, update the policy in the same change and bump its effective date.

## Measurements and progress photos

On the Check-in tab, under the weight chart:

- **Measurements** (`src/lib/measurements.ts`, `measurements-card.tsx`): a weekly log of waist, hips, chest, arms and thighs (any subset), stored in inches and shown in cm for kg users. Tiles show each site's latest value and change since the first entry; the chart plots the chosen site against the **weight trend** on twin axes, so a stalling scale with a shrinking waist is obvious. "How to measure" gives consistent landmarks. Works in local mode too (`measurements` table / local storage key), and appears read-only in the coach dashboard.
- **Progress photos** (`src/lib/photos.ts`, `worker/photos.ts`, `photos-card.tsx`) — **optional and private**: front / side / back per date, a first-vs-latest comparison, and delete any time. Each photo is resized and re-encoded as JPEG on the device (max 1440 px), which strips EXIF/location data, then stored in the private R2 bucket bound as `PHOTOS` under `u/<userId>/<id>.jpg`. There are no public URLs: images stream through the Worker after an identity check, with `Cache-Control: private, no-store`. The server only accepts real JPEG bytes up to 2 MB, 400 per member. **Coach access is off by default**: only while the member switches on *Share my photos with my coach* (`photo_settings`) can an admin of their whop view them (`GET /api/coach/photo`, re-checked on every request). Photos never appear on the leaderboard. Cloud mode only — never stored in the browser. "Delete all my data" removes the objects as well as the rows. Tables from migration `0008`.

**Turning photos on** needs Cloudflare R2, which Cloudflare only enables after a payment method is on file (the free tier covers 10 GB). Once it's enabled: `npx wrangler r2 bucket create leanligercalc-photos`, add `"r2_buckets": [{ "binding": "PHOTOS", "bucket_name": "leanligercalc-photos" }]` to `wrangler.jsonc`, and deploy. Until then the photos card says "Coming soon".

## Training

The **Training** tab (`training-tab.tsx`) is a workout log with an exercise library, programs, a rest timer and progress charts.

- **Exercise library** (`src/lib/exercises.ts`): 78 common lifts grouped by muscle and equipment, each with two form cues and a "Watch a demo" link (a YouTube search, or the exercise's own `video` link — fill in the `VIDEOS` map to attach your own). Ids are permanent: workouts and programs refer to them. Members can add their own exercises (name, muscle, equipment, cues, optional https video link). Bodyweight exercises log *added* weight and are tracked in reps.
- **Programs** (`src/lib/training.ts`): three templates — Full body (A/B), Upper / Lower (4 days), Push / Pull / Legs — or build your own (up to 8 programs, 7 days, 12 exercises a day). Each entry has sets, a rep range and an optional rest (main lifts 3:00; otherwise the member's default, 2:30 unless changed). "Next up" is the day after the last finished workout from the active program.
- **Logging** (`workout-logger.tsx`): starting a day pre-fills every set with what was lifted last time; the member adjusts weight/reps and ticks ✓. Ticking a set copies its numbers into an empty next set and starts the rest timer. A trophy marks a set that beats the previous best (estimated 1RM, or reps for bodyweight), and a nudge appears when every set hit the top of the rep range last time. The workout saves as you go (debounced, flushed when the page is hidden) and resumes after a reload; one left open for 12 h stops counting as in progress. **Finish** keeps only completed sets and ticks *Completed workout* on the Check-in scorecard (clearing a rest-day mark for that day). Finished workouts can be edited or deleted from *Recent workouts*.
- **Rest timer** (`rest-timer.tsx`): counts down to a timestamp, so it's right after the phone pauses the page; kept in local storage across reloads. Quick picks 2:00 / 2:30 / 3:00 (the pick sticks for that exercise), ±15 s, Skip. At zero it chimes (Web Audio, unlocked by the tap that started it) and vibrates where supported (not iPhone); it only sounds if the page is open at that moment. The screen is kept awake during a workout where the browser allows it.
- **Progress** (`exercise-progress.tsx`): tap any exercise for best est. 1RM (Epley: weight × (1 + reps ÷ 30)), heaviest weight, sessions and last time; a chart of est. 1RM / best weight / volume (best set / total reps for bodyweight) with personal records marked; and the full history.

Weights are stored in pounds and shown in the member's unit. Programs, own exercises and rest settings live in the plan document (`tracking.training`, re-sanitised on load — entries pointing at a deleted exercise are dropped; `PLAN_MAX_BYTES` is 256 kB to fit them at their limits). Workouts have their own table (`workouts`, one JSON row per workout validated by `validateWorkout()`, up to 2,000 per member) from migration `0009`, or the `prep-calculator:workouts:v1` local storage key outside Whop. The coach dashboard doesn't show training yet, and strips it from the plans it loads.

## Lift leaderboard

Leaderboard → **Lifts** (`lift-board.tsx`, `src/lib/lift-board.ts`, `worker/lift-board.ts`): verified one-rep squat, bench press and deadlift, ranked by **weight ÷ bodyweight** (ties: the heavier lift, then the earlier submission). Each member's best approved lift per exercise counts.

- **Submitting:** lift, weight, bodyweight (pre-filled from the latest weigh-in), date (last 12 months), a **video link** (https — YouTube unlisted, Instagram, Google Drive…; the app stores only the link) and an optional note. One pending submission per lift at a time, 30 per lift kept. The form shows the ratio and says what other members will see.
- **Review:** admins of the community (checked with Whop on every call) get a *Lifts to review* queue in the same tab — watch, then **Approve**, or **Reject** with a reason (one-tap presets or free text). Admins can also remove an approved entry from the board. The member gets a Whop notification either way (with their rank, or the reason). Review happens inside the community's app view, not the company coach dashboard, because submissions belong to a community (`exp_…`).
- **Visibility:** pending and rejected submissions are seen only by the member and admins. Approved ones show the member's Whop name and photo, weight, ratio, date and a Watch button to everyone in that community. Bodyweight is never sent to other members (though it can be worked out from weight ÷ ratio — the form says so). User ids are never sent; admins also get submission ids so they can remove entries.
- **Storage:** `lift_submissions` (migration `0010`). Withdrawing deletes the row; "Delete all my data" removes them all. Needs `WHOP_API_KEY` (access checks, profile, notifications), like the streak leaderboard.

## Daily habits and the weekly scorecard

The Check-in tab includes the **Daily Self-Accountability Scorecard**:

- **Seven daily non-negotiables**, ticked each day: protein target (±10 g), calorie target, pre-logged meals, step target, hydration (100+ oz), 7+ hours sleep, completed workout. Protein and calorie rows show that day's targets from the roadmap. Members can rename, reorder, remove or add habits (tick-box or number goal); "Scorecard" restores the seven.
- **Rest days**, up to 3 per Mon–Sun week, excuse the workout habit only.
- **Weekly consistency score** = ticks completed ÷ (habits × 7 − rest days) × 100, with the sheet's zones: 80–100% green, 60–79% yellow, under 60% red. The printed formula, `(checks / 49) − (rest days) × 100`, can't be computed literally (it subtracts days from a fraction); this is the intent the sheet encodes, since only the workout row's total is left open. A week in progress is scored on days so far, today's unticked boxes aren't misses until the day is over, and days before a member's first log don't count.
- **Weekly self-audit**: the friction audit — what trigger caused the week’s biggest slip-up. (The sheet’s “top 3 wins” and “adjustment rule for next week” were removed from the app; the `wins` and `rule` fields still exist in the data model, so older entries are kept but no longer shown.)

- **Streaks & consistency** (`src/lib/streaks.ts`, `consistency-card.tsx`), all derived from the daily logs — nothing extra is stored. Each habit shows a flame streak on the daily checklist and its share of the last 30 days; the card adds an overall streak of days at **80%+ of that day’s habits** (not “all seven”, so one miss doesn’t erase weeks of work), consecutive **Green Zone weeks**, best-ever streaks, and an 8-week trend. Same rules as the scorecard: a rest day neither extends nor breaks the workout streak, today never counts against you until it’s over, and days before the first log don’t count.

- **Reminders** (Settings panel — the gear at the top left; `src/lib/reminders.ts`, `reminders-settings.tsx`): optional Whop notifications at times each member picks — a **morning weigh-in** (skipped if today's weight is already logged), an **evening habits** nudge ("3 habits left today · keep your 12-day streak going", skipped once everything's done), and a **Sunday recap** (scorecard %, weight change vs last week's average, average protein from the food log). They share the fasting scheduler (`worker/reminders.ts`), its once-per-day and catch-up rules, and its 40-sends-per-minute budget; preferences sync with the plan and are copied to the `reminders` table (migration `0006`).

- **Community leaderboard** (its own **Leaderboard** tab; opt-in; `src/lib/leaderboard.ts`, `worker/leaderboard.ts`, `leaderboard-tab.tsx`, `leaderboard-card.tsx`): members who join are ranked within their Whop community on **Streak** (current 80%+ days in a row), **This week** (scorecard %) and **This month** (80%+ days so far — a built-in monthly challenge). Anyone in the community can view it; joining or viewing is checked against Whop access to that experience. Stats are computed on the server from each participant's habit logs in their own time zone, so only name, Whop photo and those four numbers ever leave the server — other members' ids, logs, weight and food never do. Leaving deletes the entry (`leaderboard` table, migration `0007`), as does "Delete all my data".

Habit definitions sync with the plan; daily logs (`habit_logs`) and reviews (`weekly_reviews`) have their own tables, added by migrations `0002` and `0003`. "Delete all my data" removes all of it.

## Nutrition: food log and barcode scanning

The **Nutrition** tab (labelled "Food" on phones; internally still the `macros` tab, so saved tabs and links keep working) has two sections: **Food log** and **Fasting** (the timer below). The food log tracks what a member eats against that day's targets — the Roadmap's numbers for the day, or the Carb Cycling tab's week for days outside the Roadmap.

**Adding food**

- **Scan** — a live camera view reads EAN-13, EAN-8, UPC-A and UPC-E barcodes. Chrome on Android uses the browser's built-in `BarcodeDetector`; everywhere else (including every iPhone, which has no such API) uses ZXing compiled to WebAssembly. The ~1 MB decoder loads only on the first scan and is served from this site (`public/zxing/`, copied from `node_modules` by `scripts/copy-zxing.mjs` on every build), not a CDN.
- **Photo fallback** — if the live camera is unavailable or blocked, members take a photo of the barcode instead; the file picker hands over a picture without granting the page camera access, so this works even inside an embed that doesn't allow the camera.
- **Type the barcode**, **search by name**, or **quick add** straight from the label. Recent foods re-add in one tap.
- **My foods** — anything typed in can be saved. A saved barcode beats the database, so a product that's missing or wrong only has to be entered once ("Fix numbers").

**Where the numbers come from**

| Source | Used for | Setup |
|---|---|---|
| [Open Food Facts](https://world.openfoodfacts.org) | Barcodes and search | None — free, no key |
| [USDA FoodData Central](https://fdc.nal.usda.gov) | Extra barcodes; whole foods in search ("chicken breast") | Optional: `npx wrangler secret put USDA_API_KEY` with a free key from <https://fdc.nal.usda.gov/api-key-signup> |

Lookups go through the Worker, which caches every answer in the `food_cache` table (found products 30 days, misses and searches 1 day), so each product is fetched upstream once rather than once per member. These two routes are public — food logging has to work outside Whop too — and hold no personal data; a per-IP rate limit (`FOOD_LIMITER`, 40 a minute) stops the Worker being used as a free proxy. If the Worker can't get an answer, barcode lookups fall back to asking Open Food Facts directly from the browser.

Open Food Facts is crowd-sourced: most products are right, some are wrong (per-serving numbers typed into the per-100 g fields is the usual mistake). The amount picker always shows the calories and macros it's about to log, flags labels whose calories don't match their macros (4/4/9), and the attribution line reminds members to check against the label.

**Habit scorecard link.** Once a day has food logged, its *Hit daily protein target* and *Hit calorie target* boxes on the Check-in scorecard follow the log: protein within ±10 g, calories within ±100 kcal. Those two rows also show eaten vs target ("165 / 180 g").

**Intermittent fasting.** Members enter their meal times (or start from a 16:8, 18:6, 20:4 or OMAD preset and adjust). The eating window runs from the first meal to the last and the fast from the last meal to the next day's first, so 12:00 / 16:00 / 20:00 shows as **16:8**. A ring timer counts down to the next meal: while fasting it shows hours fasted of the total, inside the window it shows the next meal and when the window closes, and for 30 minutes after each meal time it says *Time for Meal 2 — eat now*. Times are the device's local clock, windows can't cross midnight, and the meal times sync with the plan (`tracking.fasting`). Logic: `src/lib/fasting.ts`; card: `src/components/fasting-card.tsx`.

**Fasting notifications (Whop).** Members can switch on a Whop notification for when their eating window opens (at the first meal) and closes (30 minutes after the last meal, when the timer switches to "fasting"). They arrive in the Whop mobile app and on whop.com. How it works:

- Switching it on saves the first/last meal, the member's time zone and their Whop experience id (from the `/experiences/exp_…` URL) to `fasting_reminders` (migration `0005`). Switching it off, clearing the meal times, or "Delete all my data" removes the row.
- A Cron Trigger runs every minute (`worker/reminders.ts`). For each member it works out their local time; when an event is due it calls Whop's [create notification API](https://docs.whop.com/api-reference/notifications/create-notification) with `user_ids` set to that member only. Each notification goes out once per local day, with a 10-minute catch-up window for a late run (including across midnight), and failures are retried on the next run inside that window.
- It needs the proper Whop app (for member identity) and its API key with the `notification:create` permission. Until `WHOP_API_KEY` is set, the scheduler does nothing and the switch explains that notifications aren't available yet.
- Limits: up to 40 sends per minute (the free plan allows 50 outgoing requests per run; the rest go the next minute). The table is read once a minute, which stays inside D1's free read allowance for a few thousand members.

**Storage.** Food logs (`food_logs`, one row per day) and saved foods (`my_foods`) follow the same cloud/local rules as weigh-ins; on-device logs keep the last 365 days. Meals can be pre-logged up to 7 days ahead. "Delete all my data" removes all of it. Tables are added by migration `0004`.

## Coach dashboard

Opening the app from the **Whop creator dashboard** (Whop serves it at `/dashboard/[companyId]`) shows a read-only coach view instead of the member app (`src/components/app-root.tsx` picks the view from the URL):

- **At a glance:** members, how many logged in the last 3 days, how many need attention, and the average scorecard this week.
- **Member list**, sorted so the people who need you come first, with filters for *Behind plan* (from the same adaptive analysis the member sees), *Red Zone* (scorecard under 60% this week), *No logs 3+ days* and *No plan*, plus search.
- **Member detail:** weight vs plan (chart, actual vs planned rate per week, goal), the Streaks & consistency card, daily food totals for the last week, and recent weigh-ins. `?member=user_…` opens a member directly.

**Who can see what** (`worker/coach.ts`, `GET /api/coach/overview?company=biz_…`): the viewer must have a verified Whop token *and* be an `admin` of that company — checked with Whop's access API on every load. The members shown are that company's current members according to Whop's member list (which also supplies names and avatars, not stored); nobody else's data is ever returned. History is limited to 4 months of weigh-ins, 3 months of habits and 2 weeks of daily food totals (no individual foods, no self-audit notes, no saved foods). Members are told in the Check-in tab and the privacy policy.

**Whop setup:** in the app's settings in Whop's developer dashboard, set the **Dashboard path** to `/dashboard/[companyId]` and add the **`member:basic:read`** permission (approve the update in your whop). Then open the app from your whop's dashboard.

## Validation and warnings

| Condition | Level |
|---|---|
| Required rate exceeds 1% of body weight per week | danger |
| Selected rate exceeds 1%/week | danger |
| Timeline tighter than the selected rate allows | warning |
| Weeks clamped at the intake floor | warning |
| More than ~18% of projected loss is lean mass | warning |
| Projected end body fat below the essential-fat floor (5% male / 12% female) | danger |
| Projected end body fat within 3 points of that floor | warning |
| Prep longer than 52 weeks (plan a diet break) | info |
| Schedule does not total 7 days | danger |
| Medium days cannot balance the schedule | danger |
| Low-day carbs below 30g | warning |
| Protein below 0.8 g/lb | warning |
| Weekly calories drifted >2% from target | warning |

## State persistence

State is kept in local React state and mirrored two ways:

- **LocalStorage** — a returning user lands back on their last setup.
- **URL query string** — a coach can send a client a link that opens pre-filled. Use the **Share** button in the header.

The query string is user-editable, so every restored value passes through `sanitize*` in `persistence.ts` before reaching the engines. Restoration happens in an effect after mount rather than during render, which avoids a hydration mismatch (neither storage nor `window.location` exists during SSR).

## Embedding (Whop)

The app is served with a `Content-Security-Policy` permitting these frame ancestors, configured in `next.config.mjs`:

```
frame-ancestors 'self' https://whop.com https://*.whop.com;
```

`X-Frame-Options` is deliberately **not** set. It is the older, coarser mechanism — its only values are `DENY` and `SAMEORIGIN`, so it cannot express an allow-list or a wildcard subdomain, and browsers give it precedence over `frame-ancestors` when both are present. Setting it at all would defeat the CSP.

Two things to know:

- **`frame-ancestors` must be an HTTP response header.** It is ignored when delivered via a `<meta http-equiv>` tag.
- **The CSP is scoped to `frame-ancestors` only.** Adding `script-src` or `default-src` here would white-screen the app: `app/layout.tsx` runs an inline script to apply the stored theme before first paint, and Next.js injects its own inline bootstrap and hydration scripts. Locking those down requires threading a nonce through middleware.

To add another origin (a staging host, say), extend the `FRAME_ANCESTORS` array in `next.config.mjs`.

### Deploying to Cloudflare Pages (static export)

Because the app is entirely client-side, it builds to a complete static site — no server runtime needed:

```bash
npm run build:static
```

That writes `out/` (~1.5 MB). Cloudflare Pages settings:

Cloudflare has two flows, and the fields differ:

**Pages (git integration)** — no deploy command exists; Cloudflare uploads the folder itself:

| Setting | Value |
|---|---|
| Build command | `npm run build:static` |
| Build output directory | `out` |
| Framework preset | None |

**Workers Builds** — uses [`wrangler.jsonc`](wrangler.jsonc), an assets-only Worker with no `main` entry point since the app has no server side:

| Setting | Value |
|---|---|
| Build command | `npm run build:static` |
| Deploy command | `npx wrangler deploy` |

Or deploy straight from your machine without git:

```bash
npx wrangler pages deploy out --project-name=prep-calculator
```

`headers()` does **not** run in a static export, so the CSP is served from [`public/_headers`](public/_headers) instead, which Next copies to `out/_headers` at build time. Cloudflare Pages and Netlify both read that file. **The frame-ancestors list is duplicated between `next.config.mjs` and `public/_headers` — change both together.**

The build target is chosen by `NEXT_OUTPUT`: unset gives the Node server build (`headers()` active, for Vercel/Render/VPS); `export` gives the static build (`_headers` active). `npm run build` and `npm run build:static` cover both, and `scripts/build-static.mjs` sets the variable in a way that works on Windows and Linux alike.

### Behind a reverse proxy

If the app is deployed behind nginx, the proxy must not undo the policy. `deploy/nginx.conf` is a working reference. The two things that break the embed:

- **nginx injecting `X-Frame-Options`.** It appears in most hardening baselines and in Mozilla's generated configs. Browsers honour it ahead of `frame-ancestors`, and it cannot express an allow-list, so one stray `SAMEORIGIN` silently defeats the CSP.
- **nginx adding a second `Content-Security-Policy`.** Two CSP headers are enforced independently and the browser takes the intersection, so a second policy can only narrow the first, never widen it. Let the app own the CSP.

Worth knowing: `proxy_hide_header` only filters headers coming *from upstream* — it cannot remove a header nginx itself added with `add_header`. Stock nginx has no directive for that. The usual workaround relies on the fact that `add_header` directives are inherited only when the child block declares none of its own, so adding any one of them inside `location /` drops **all** inherited headers — including HSTS and `X-Content-Type-Options`. Either re-declare them explicitly or use `more_clear_headers` from the headers-more module. `deploy/nginx.conf` spells both out.

Same principle applies on Vercel, Netlify, and Cloudflare: check their header rules for an `X-Frame-Options` entry, since those layers sit in front of Next.js and cannot be overridden from `next.config.mjs`.

### Storage inside a third-party frame

Browsers partition `localStorage` by top-level site, so a setup saved while embedded on Whop is separate from one saved visiting the app directly — expected, but worth knowing. Where storage is blocked outright (Safari with *Prevent Cross-Site Tracking*, some private modes), `persistence.ts` and the theme script both swallow the error and fall back to defaults rather than throwing. The URL query string still works in all cases and is the reliable way to hand a client a pre-filled setup.

## Verification

`npm run typecheck` (tsc --noEmit) and `npm run build` both pass with zero errors and zero warnings. The production build renders the page as static content; the app was then exercised in a real browser against `npm run start`.

The engines were additionally exercised against a JavaScript port run in headless Chrome. Results:

| Scenario | Outcome |
|---|---|
| 200 lb @ 20% → 175 lb at 0.75%/wk | 18 weeks; closed-form cross-check 17.74 ✓ |
| Weekly loss decay | 1.50 lb → 1.31 lb across the prep ✓ |
| Body-fat goal, 200 lb @ 25% → 12% | 35 weeks, ends 167.8 lb — correctly *below* the 170.5 lb that holding lean mass constant would predict ✓ |
| Required rate for 8 / 12 / 16 / 20 / 30 week windows | 1.66 / 1.11 / 0.83 / 0.67 / 0.44 %/wk; warning fires on the first two ✓ |
| 150 lb @ 10% → 135 lb at 1%/wk | All weeks clamped at the floor, lean-loss and low-body-fat warnings fire ✓ |
| Carb cycling 2H/3M/2L | Weekly average exactly on target, delta 0 ✓ |
| No medium days, 3H/0M/4L | Delta 0 ✓ |
| 0H/7M/0L (no cycling) | Delta 0 ✓ |
| 4H/1M/2L at +50% boost | Correctly detected as unbalanceable ✓ |
| Protein + fat floor exceeding calories | Marked infeasible ✓ |

Biometric equations were checked by hand against the running app:

| Profile | Expected | App |
|---|---|---|
| 200 lb, 5'10", 30, male | BMI 28.69, Deurenberg 25.1%, Mifflin×1.55 = 2,904 | 28.7 / 25.1% / 2,904 ✓ |
| 150 lb, 5'10", 28, female | BMI 21.52, Deurenberg 26.9%, Mifflin×1.55 = 2,310 | 21.5 / 26.9% / 2,310 ✓ |
| 150 lb @ 19% measured | Lean 121.5 lb → 134 g protein at 1.1 g/lb | 134 g ✓ |

The female profile targeting 118 lb correctly raised the *female* essential-fat danger at a projected 10.5%, where the male threshold would not have fired.

The frame-ancestors policy was verified by A/B test — serving a page from a second local origin that frames the app, and comparing network traces:

| Config | Result |
|---|---|
| Test origin **absent** from the list | Document request `ERR_BLOCKED_BY_RESPONSE`, zero subresources fetched |
| Test origin **present** in the list | Document + all 7 CSS/JS subresources fetched normally |

Both directions matter. The deny case alone would also be produced by a *malformed* policy, and the allow case alone by an *absent* one — only the pair shows the directive is being parsed and applied as written. The header was confirmed present on both the HTML document and `/_next/static/*` assets.

The same A/B was then repeated against the **static export**, serving `out/` through a local server that applies `out/_headers` the way Cloudflare Pages does — same result in both directions. The exported build was also driven in a browser to confirm it is fully functional and not a degraded artifact: hydration succeeds, and editing body weight recomputes the derived body fat (25.1% → 30.3%), TDEE (2,904 → 3,115 kcal) and prep duration (18 → 37 weeks) live, with charts rendering and a clean console.

Caveat: the local server emulates Cloudflare's `_headers` handling. Cloudflare's own parser is authoritative, so confirm with `curl -I` against the deployed URL after the first deploy.

Running the app end-to-end surfaced two issues that neither type checking nor the math harness could catch, both since fixed:

- The two tabs reported different weekly losses for the same deficit (1.5 lb vs 1.36 lb), because carb cycling divided by a flat 3500 kcal/lb while the timeline priced lean tissue separately. Both now route through `weeklyLossFromDeficit()`.
- The milestone table's footer counted the week-0 baseline row, so an 18-week prep advertised "19 weeks".
- The inches half of the feet/inches height pair had a non-breaking-space label, leaving it with no accessible name — screen readers announced its value instead. It now carries an `sr-only` label and an explicit `aria-label`.

Later fixes surfaced the same way:

- **Event-date mode dated every milestone wrong.** The simulation dated its weekly rows from the start-date field before the required start was known, so "I know my show date" mode showed the milestone table starting on the wrong day. Rows are now re-anchored on the computed required start.
- **Every visit after the build day threw React error #418.** This is a static export, and the default start date is "today" — so the HTML froze the build date while the browser computed the real one, and React discarded the server HTML on every load. The calculators now render client-side only, behind a skeleton; the built HTML contains no dates at all, which makes the mismatch impossible rather than merely unlikely.

There is no test runner wired into `package.json`. Adding Vitest and porting these cases into `src/lib/*.test.ts` would be the natural next step.

## Disclaimer

Projections are models, not promises. Real weight loss is noisy — water, glycogen, sodium, and menstrual cycles all move the scale more in a day than fat does in a week. Track weekly averages and adjust from actual trend data.

This tool is for general fitness planning and is not medical or nutritional advice.
