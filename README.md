# Lean Stature System

_Formerly Prep Calculator. The Worker, database and repository keep the old `leanligercalc` / `prep-calculator` names, so URLs and data are unchanged._

Five integrated tools for contest prep and body recomposition planning, plus a **Today** home screen that pulls them together:

0. **Today** (the house icon; the app opens here) — everything due today on one page. See [Today and badges](#today-and-badges).

The **Plan** tab opens on **Overview** (`plan-overview.tsx`, internally `activeTab` `plan`): the goal and date, where the member is in the plan (start, now on the trend, goal), the Planned vs actual chart (*Recent / Whole plan*), the phases (cut, reverse, maintain) with a today marker, "How it's going" from the weekly review, today's targets, and the next week whose daily target changes by 25 kcal or more. On a computer it adds a **To go** figure, a **Share plan** button (the plan summary, shared or copied) and a **This week** strip (each day's type and the plan's weight by Sunday). Its other sections are **Calendar** (the Roadmap below) and **Settings** (`plan-settings.tsx`, internally `timeline`): a short list (About you, Goal, Speed, Activity, Eating plan, After the goal), each row showing its current value and opening its own page; rows a coach's macros override carry a lock. **Eating plan** opens the carb-cycling page (internally `carbs`) with a back link. One **Advanced** fold (`plan-advanced-fields.tsx`) holds what most people never change: daily deficit instead of speed, known maintenance, metabolic adaptation, protein, the fat minimum and (carb cycling only) the high- and low-day carb swing; it opens by itself once one of them has been changed. **Run the guided setup again** (and *Set up my plan* on an empty Overview) opens the **guided setup** (`plan-setup.tsx`): five steps (about you, goal, how fast, activity, eating plan), with Gentle / Moderate / Fast showing each one's goal date, length and average calories; nothing is saved until Finish. The old Timeline page's summary, projected curve and week-by-week table are gone: the Overview and Calendar carry them.
1. **Timeline** (Plan) — reverse-engineers prep duration (or a required start date) from a safe weekly fat loss rate, with a week-by-week milestone table and projection chart (the **Projected curve**: planned weight and body fat by week, plus the member's weigh-ins inside the plan's dates as small dots on their exact day, a quick reality check while editing the plan; the full comparison with the trend is Progress → Plan vs actual).
2. **Macros** (Plan; internally still the `carbs` tab) — an **Eating pattern** switch: **Same every day** (the default: one set of numbers, the daily target, every day; steps and training are already in the Timeline's maintenance) or **Carb cycling**, which builds a weekly high / medium / low carb rotation whose 7-day calorie, protein, carb, and fat totals average out *exactly* to your target. A note at the top says what the Food log is using today (`foodLogToday`, from `dayTargetFinder` in `src/lib/day-targets.ts`): the Roadmap's number when today is inside it (Timeline calories, stepped down weekly and adjusted by check-ins, so usually lower than this page), otherwise this plan's.
3. **Roadmap** (Plan) — expands the two into a day-by-day calendar from start date to goal date: calories and macros for every single day.
4. **Food** — a **Food log** against each day's targets (scan a barcode, search by name, or type numbers from the label) and, in its **Fasting** section, an intermittent fasting timer.
5. **Progress** (internally `checkin`) — log weigh-ins, see predicted vs actual, and get calorie adjustments worked out from your real rate of loss.

**The Timeline sets the calories; Macros splits them** (`src/lib/plan-link.ts`). The weekly rate on the Timeline is the one place a member sets how fast they lose. Whenever the Timeline has a plan, Macros shows **this week** of it (`currentPlanWeek()`): that week's maintenance and daily target, including any check-in change, with protein and the fat floor worked out at that week's projected weight and body fat, exactly as the Roadmap does (`weekCalorieTarget()` is shared). Before the plan starts it's the first week; after it ends, the last. A line above the numbers says which ("Week 5 of 18 of your plan · planned weight 194.1 lb · Change on Timeline"). The two numbers are shown, not typed. So Macros, the Roadmap, the Food log and Today always agree; on days outside the Roadmap's dates the Food log uses its nearest week too. Only while the Timeline has no plan are maintenance and the daily target typed on Macros (defaulting to 20% under maintenance). There is no goal picker (the old −20% / −10% / ±0% one only ever changed Macros' own numbers, never the Food log during a plan) and no carb-cut slider; the card that had one is now **Your macros at maintenance** (protein from body weight, fat as a share of calories, carbs the rest, with "Your daily target is 1,957 kcal, 701 under it"). To make the relationship to maintenance obvious, Macros shows each day type against maintenance ("613 under maintenance"), a sentence under the day cards ("Every day is below your maintenance of 2,658 kcal. High days are high compared with your other days, not with maintenance…"), a solid maintenance line above the bars of the weekly chart next to the dashed daily-target line, and what maintenance is made of in week 1 ("2,248 base + 254 steps + 156 training", or "your known maintenance" / "your activity level"). The average day is called the "daily target" throughout (never "baseline"), so it can't be mistaken for maintenance.

**Same every day vs carb cycling** (`cycleCarbs` on the carb inputs, off by default; URL `cc`): not carb cycling is run as seven identical days (`effectiveCarbInputs` sets 0 high / 7 medium / 0 low), so the Roadmap, Food log, Today and Progress need no second code path; each Roadmap day and Food log target carries `steady`, and every screen that would name a day type (Food log pill, Roadmap badges, legend and day detail, the habits line, text exports, the Macros page's schedule, sliders, weekly chart and balance table) hides it or says "Daily target" instead. The choice lives only in Plan → Macros; the Food log just shows the day's target.

**First week** (`first-week-card.tsx`): on Today until done or hidden (remembered on the device): set your goal (anything changed from the starting example), first weigh-in, log a meal, finish a workout, turn on reminders (opens Settings). Each step ticks itself off from the member's data; the next one shows how and has a button.

**Accessibility** (Settings → Accessibility, `src/lib/accessibility.ts`): text size (Default / Large 112.5% / Larger 125%, scaling the rem-based layout), stronger contrast (darker secondary text and firmer borders, a heavier focus ring) and reduce motion; kept on the device and applied before first paint like the theme. Every icon-only button has a screen-reader label (checked across all components).

**Tabs**: **Today**, **Plan** (Timeline · Macros · Roadmap), **Progress**, **Food**, **Training** and **Ranks** (the leaderboards). On phones they are a bar fixed to the bottom of the screen (icon over label; hidden while a text field has focus so it doesn't ride up on the keyboard; the rest timer sits above it via `--bottom-nav`); on wider screens a row under the header. Internal tab ids are unchanged (`macros`, `checkin`, `leaderboard`, and `timeline` / `carbs` / `roadmap` for Plan's sections), so old links (`?t=carbs`) and saved tabs still land in the right place; Plan reopens on the section last used.

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
    plan-overview.tsx       Plan → Overview
    plan-settings.tsx       Plan → Settings (the list and its pages)
    plan-setup.tsx          Guided plan setup
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

### Look and feel

- **Molten gold** (end of `globals.css`): a warm glow behind the top of every page; cards (`ui/card.tsx`, `.molten-card`) are rounder (22 px) with a gradient from a warm top edge, a faint gold rim and a soft drop shadow. Solid gold fills (`bg-primary`) are glossy gradients, as are green (`bg-success`) and the three macro colours; buttons, switches and tabs are pills with a gold-tinted selected state. The calorie, habit and fasting rings paint with the `molten-gold` / `molten-green` SVG gradients defined once in `layout.tsx`, with a soft glow in dark mode. On phones the tab bar floats as a rounded bar above the bottom edge (`--bottom-nav` keeps the rest timer above it). The typeface is Manrope, self-hosted with `next/font` (no request to Google from members' phones). Light mode keeps the same shapes with deeper golds.

- **Text** is one step larger than Tailwind's defaults (`tailwind.config.ts`): 13 px small print, 15 px body; hard-coded 10 / 11 px sizes went up to 11 / 12 px.
- **Macro colours** are gold protein, sky-blue carbs and rose fat, chosen to be told apart at a glance in both themes (`globals.css`).
- **Section switchers** (`ui/segmented.tsx`) never squash a label onto two lines; when the options don't fit, the row scrolls sideways.
- **Explanations** that only need reading once use `ui/hint.tsx`: shown in full the first time, then folded to a small "How this works" link (remembered per device).
- **Food log:** the day's name sits above a summary card: a calorie ring (what's left in the middle) beside the protein, carb and fat bars, then chips: the day type, **Training day · Upper A** (or *Training today?*), which opens the before/after carb split in place (`training-carbs-card.tsx`), and **Roadmap targets · Protein 81 g to go**, which opens where the targets come from and the scorecard note. A water strip (six bottles) follows. Each meal is its own card with **+ Add**; an empty one shows a dashed "+ Add dinner" and "Copy yesterday's dinner". **Add food** is docked beside the log on a computer and slides up as a sheet on phones: "Add to Dinner", meal chips, a search box, **Scan · Describe · Photo · Quick add** (Describe and Photo say why when they can't be used, e.g. outside Whop), then **Recent · Saved meals · My foods** tabs, where the round + re-adds a recent food in one tap. Adding closes the sheet on phones and highlights the new food in its meal for a few seconds; a floating **Log food** button opens the sheet from anywhere.
- **Today:** a plain header (the date, **Today**, and an "x of y done" pill that turns green when everything is done), then the cards still to do: a calorie ring with protein, carb and fat bars, the workout ("Workout · 7 exercises", the day large, its exercises on one line, a full-width Start), the habits with a dot per habit above the list, and steps. A logged weigh-in is a one-line pill at the end ("Weigh-in 180.2 lb −0.6 lb", the trend's change over a week); other finished cards still fold under **Done today**.
- **Training:** a page title over **Workouts · Programs · Tools**. Workouts: the day as a hero card ("Upper / Lower · day 3 of 4 · ~65 min", the day's exercises with their targets, a tall Start, then other days, the program picker and Empty workout), three tiles for this week (workouts since Monday, weight lifted, PRs), **Recent** with date badges and PR pills, and **Workout settings** (rest, reps left, finish reminder) folded at the end. Programs: the active program (from your coach or not, "4 days a week · week 1 of 8", and this week as a strip with today lit), a card per day that opens the editor, then the calendar and **Your programs** with a dashed **+ New program**. Tools: the plate calculator as the hero, then two tiles, **Form check** and **Sets per muscle** ("Hamstrings +5 under target"), that open their cards, with Strength trends (by muscle group) and the library beside. In a workout: an "In progress · 24 min" card with a gold Finish, big rounded set boxes, a glowing green tick and a tinted row for done sets, the one-side pill, and a floating rest timer with a large countdown, round − and +, Skip and a glowing bar.
- **Ranks:** a page title, Lifts first (then Habits, Challenges, Badges). Lifts: pill chips for the lift, the top three on a podium (first in the middle, tallest and glowing; ratio and weight on each block), the rest below with your row lit, and "Verified lifts only · ranked by weight ÷ bodyweight".
- **Feedback:** ticks pop in (`animate-pop`), and Settings → Reduce motion turns that off with every other animation.
- **Footer:** one line ("Estimates, not promises, and not medical advice"), with the full wording behind **Read more**.

### Speed

The app runs on the member's phone, so speed comes from how much code it downloads and how much it redraws, not from the server.

- **Split bundles.** `app-root.tsx` loads the member app or the coach dashboard, never both. In `app-shell.tsx`, Today is the only tab in the start-up bundle. Every other tab (and with them the Recharts library) is loaded with `next/dynamic`, then fetched one at a time while the phone is idle, about a second after start (`usePrefetchTabs`). `lazy-panel.tsx` is the brief placeholder if a tab is opened before its code arrives.
- **Charts redraw only when their data changes.** `WeightCurveChart`, `ProgressChart` and `WeeklyMacroChart` are `React.memo`. The Timeline and Macros calculators pass them a `useDeferredValue` copy of the results, so typing updates the numbers first and the chart catches up a beat later.
- **Saves wait for a pause.** The on-device copy and the URL are written 250 ms after the last change. The cloud plan is written 800 ms after. Anything still waiting is sent the moment the app is closed or backgrounded (`pagehide` / `visibilitychange`, with a `keepalive` request), so a quick edit-and-leave isn't lost.

Measured locally on desktop (phones are several times slower), from before these changes to after:

| Measure | Before | After |
|---|---|---|
| JavaScript at start-up | ~1.6 MB | ~0.7 MB |
| Progress tab switch | 103 ms | 23 ms |
| Training tab switch | 51 ms | 14 ms |
| Timeline keystroke | 41–65 ms | 13–18 ms (chart finishes in the background) |

## What the user has to know

The only inputs required are things people actually know about themselves:

**Current weight · Height · Age · Sex**

Body fat percentage is *derived*, not asked for. Requiring it is a hard stop for most users — very few have had a DEXA or BodPod scan, and a guessed number silently corrupts every downstream projection. Weight, height, age, and sex are entered once on a shared profile panel and drive both calculators.

### Maintenance calories — Mifflin-St Jeor

```
BMR = 10·kg + 6.25·cm − 5·age + s        s = +5 (male) / −161 (female)
TDEE = BMR × 1.2                          resting + daily life (~3,000 steps)
     + (steps − 3,000) ÷ 1,000 × 0.4 · kg   net cost of walking
     + training days × 3 · kg ÷ 7          ≈ an hour of lifting, averaged per day
```

New plans estimate maintenance from **daily steps and training days** (`src/lib/activity.ts`): walking at ~5 km/h costs ~2.5 kcal/kg/h above rest, ~0.5 kcal/kg/km, and a kilometre is ~1,300 steps, so 1,000 steps ≈ 0.4 kcal/kg. At 200 lb, 10,000 steps add ~250 kcal and four training days ~155 kcal/day. The Timeline shows the breakdown, and the intake-floor warning says how much 1,000 extra steps a day buys. Plans saved before this (no `activitySource`) keep the old **activity-level** multiplier — 1.2 / 1.375 / 1.55 / 1.725 / 1.9 — until the member switches, so nobody's targets move on their own; share links carry `as`, `st` and `td`.

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

The rate runs from 0.25% to 1% a week, with four presets: Gentle 0.25%, Conservative 0.5%, Moderate 0.75% and Aggressive 1%. Gentle suits members who are already lean or want a deficit they barely notice; at 200 lb it is about 0.5 lb a week (roughly a 250–300 kcal/day deficit), and the Timeline shows the longer finish date plainly. Or type a **daily deficit** (kcal/day) under the presets: `rateForDailyDeficit()` finds the rate whose week-1 deficit is that number (the inverse of `dailyDeficitForRate()`, the simulation's first-week arithmetic), so slider, presets and box stay in step. Like any rate, the deficit then eases as weight comes down, and the box says where it ends up (500 kcal/day at 200 lb eases to "about 415 kcal/day by week 27"). Typed deficits can go beyond the slider (0.1–3% a week); above 1% the usual warning shows. **Keep it the same every week** (`fixedDeficit`, URL `fd`) holds that deficit every week instead: each week's rate is whatever the deficit loses at that week's weight and body fat, so the weekly loss climbs a little as weight drops (500 kcal at 200 lb: 0.51% → 0.60%, 24 weeks instead of 27). Warnings use the steepest week and the average rate; the slider or a preset switches back to a rate.

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

### After the goal: reverse diet or maintenance

`src/lib/reverse-diet.ts`, with the **After your goal** card on Plan → Timeline (`after-goal-card.tsx`). Once the diet's last week ends, the member eats one of:

- **Reverse** (the default, also for plans saved before this existed): from the last diet week's target (with any check-in change) up to maintenance, adding **+50 / +100 / +150 kcal a day each week** (`reverseStep`, URL `rs`), then maintenance. Capped at 26 weeks.
- **Maintain:** straight to maintenance.
- **Keep deficit:** the last diet week's calories, as before.

Maintenance is the model's estimate at the end weight **without** metabolic adaptation (`tdeeAtWeight`), since the reverse is how metabolism climbs back. The schedule starts the day after the Roadmap's last day. `currentPlanWeek` (Macros) and `dayTargetFinder` (Food log, Today) both follow it: a day past the goal gets that week's calories, split with the member's carb plan at the end weight, labelled "Reverse diet week 3 of 8" or "Maintenance" (`DayTarget.source === "after"`). Check-in calorie changes stop at the goal; coach-set macros still win. Setting: `afterGoal` (URL `ag`).

## The roadmap

The roadmap is the **Calendar** section of the **Plan** tab. Internally `roadmap` is still its own `activeTab` value, so links that open it (`?t=roadmap`) and saved tabs keep working.

The roadmap combines the two engines, each doing what it is best at:

- The **timeline** sets how much to eat each week. Its targets step down as body weight and maintenance fall, so week 12 is not week 1.
- The **carb-cycling engine** splits that week's budget across high / medium / low days.

The carb-cycling allocation is re-run **for every week**, not once, because both of its inputs move: the calorie target drops, and protein and the fat floor are set per pound of a body weight that is also dropping. Each week still averages exactly to its timeline target (verified within 0.3 kcal/day across all 18 weeks of the default plan).

Macros shows the same numbers as the roadmap's current week, so the two never disagree.

**Which day is which.** The carb-cycling engine only needs counts ("2 high, 3 medium, 2 low"); a calendar needs to know that Monday is a high day. `weekday-pattern.ts` places them automatically — high days spread through the week, low days offset half a gap so they fall between hard sessions:

| Schedule | Auto pattern (Mon → Sun) |
|---|---|
| 2 / 3 / 2 | H M L M H L M |
| 3 / 2 / 2 | H M H L M H L |
| 1 / 3 / 3 | H L M M L M L |

Users can click any weekday to change it, in either Carb cycle or the Roadmap. The counts follow the pattern, and changing the counts directly discards a hand-placed pattern so it can't go stale. The pattern travels in shared links as seven letters (`wp=HMLMHLM`).

**Calendar.** One month at a time, Monday-first. Each day shows its type, calories, and (on wider screens) P/C/F grams; weeks with an allocation problem carry a dot. It's a proper ARIA grid with a single tab stop — arrow keys move by day and week, Home/End jump within the week, and moving past a month edge pages the calendar. Selecting a day shows its full macros, that week's projected weight, the change in intake from the previous week, any coaching note, and copy buttons for the day or the whole week.

## Check-ins: predicted vs actual

The **Progress** tab (internally `checkin`; weigh-ins can also be logged on Today) is where members log and review weigh-ins. The app compares them with the plan and recommends calorie changes. Its **Plan vs actual** chart has a *Recent / Whole plan* switch (the Roadmap no longer repeats it); the Roadmap shows logged weights on the calendar. A second chart, **Weight vs calories** (`weekly-intake-chart.tsx`, 8 / 12 / 26 weeks), stacks each week's average protein, fat and carbs as bars with the week's calorie target as a tick (an amber cap when the average ran more than 100 kcal over), the weekly weigh-in average as a line, and the plan's weight as an optional dashed line (Weight · Plan · Calories layers). Tapping a week shows its calories vs target, weight change vs the plan's, and the macros. The coach's member view uses the same chart without the plan layers. The Weigh-in section is one line at the top (*Today [weight] lb Save*, with date, calories and note behind a toggle), the two charts, and on a computer the **Weekly review** beside them (status, the numbers, and a recommended change with **Apply** or **Keep**). **Calorie changes applied** and **Weigh-in history** are folded rows underneath.

The tab has three sections (`CheckinSection` in `checkin-tab.tsx`): the daily **Weigh-in** (log, progress vs plan, calorie changes, weigh-in history) and **Habits** (internally `habits`), and **Check-in**, which holds the weekly and monthly jobs under a second switch: **Check-in** (internally `scorecard`: the coach check-in and My progress report), **Photos** and **Measurements**. The section ids are unchanged, so links to `photos` or `measurements` still open the right place. Each place has one job: **Today** is where the day's habits are ticked (its card is called **Daily non-negotiables**, the list's one name everywhere, with *Your week* linking here), and **Progress → Habits** is for review and repair: the **Weekly scorecard** first (Mon–Sun grid, the week's % and zone, past weeks, "Day streak · Green weeks" above it, each habit's last 28 days under *See each habit*), then **Fix a day or edit habits** (the checklist in `mode="fix"`, folded until opened and opening on yesterday, for a missed tick, a forgotten step count or changing the list), plus **Steps this week** for step trackers. The separate Streaks & consistency card and the weekly self-review are gone: the review's questions live in the check-in (wins, struggles, and an optional **Focus for next week**); old reviews stay stored. The coach dashboard still shows the full Streaks & consistency card. Only Weigh-in needs a goal to be set. The step habit (`link: "steps"`) has a box for the day's step count, stored under the reserved `_steps` entry; once a count is logged the habit follows it, ticking at the plan's daily steps (10,000 when the plan uses an activity level). **Step sync from iPhone** (`step-sync-card.tsx`, `worker/steps-sync.ts`, migration `0023`): a web app can't read Apple Health, so an Apple Shortcut does it. The member makes a personal key in the card (shown once; only its SHA-256 hash is stored in `step_tokens`), and the card walks through a daily 9 PM automation: Find Health Samples (Steps, today, grouped by day) → Get Details (Value) → Format Date (`yyyy-MM-dd`) → Get Contents of URL, a `POST /api/steps-sync` with `Authorization: Bearer lss_…` and `{ "steps", "date" }`. That route is the one API route signed with something other than a Whop session, and the key can do nothing but set a day's `_steps` (merged into that day's log, ticking the steps habit at the plan's target, the same as typing it). Numbers sent as text are accepted; bad keys get one 401 message whether wrong or turned off; requests are rate limited per IP. "Show setup again" makes a new key (the old one stops working); "Turn off" deletes it; "Delete all my data" removes it. The app reloads habit days when it comes back to the foreground (at most once a minute), so synced steps appear without a restart. Today's steps card links here. **Steps this week** compares the weekly average with the plan and, when the plan is step-based, says what the gap is worth in kcal and how many extra steps close it — weekly, never by adding calories back each day. The open section lives in the app shell, so links from other tabs land on the right one (Nutrition and the leaderboard open Habits; the roadmap's "Log a weigh-in" opens Weigh-in).

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

**Weekly weigh-ins vs calories** (`weekly-intake-chart.tsx`, `src/lib/weekly-intake.ts`; Progress → Weigh-in, under Plan vs actual): for the last 8, 12 or 26 Monday–Sunday weeks, a bar for the average logged day (days with food only) stacked protein / fat / carbs by their calories (4 / 9 / 4) on the right axis, and the week's average weigh-in as a line on the left axis. Weeks without food have no bar; the line joins across weeks without weigh-ins. The tooltip shows grams, calories and how many food days and weigh-ins the week rests on. Picking a longer range loads older food logs (`onEnsureFoodLoaded`).

**Plateau detector** (`src/lib/plateau.ts`, `plateau-card.tsx`): during the diet (from its start to the goal date; not in a reverse diet or maintenance), when the least-squares slope of the last 14 days of weigh-ins (5+ readings over 10+ days) shows less than 0.1% of body weight lost a week, or a gain, a card at the top of Progress → Weigh-in says how long it's been flat (14 or 21 days) and what to try in order: check the tape (water can hide fat loss), tighten the logging, 2,000 more steps (with its kcal), or 100–150 kcal less, and after 8+ weeks of dieting a 1–2 week diet break. The coach dashboard flags it as *Plateau 2+ weeks*.

**Milestones** (`src/lib/milestones.ts`, `worker/milestones.ts`, migration `0028`): every 15 minutes the cron checks members who saved a weigh-in or measurement since the last run. Every 5 lb lost (start = the average of the first three weigh-ins from the plan's start; now = the average of the latest week's, up to three) and every inch off the waist (first measurement against the latest) is a milestone; a new highest one is stored in `milestones` (one row per member and kind, only ever going up, so a regain and re-loss doesn't repeat it) and sent as a Whop notification ("Down 10 lb!"), in kg or cm for kg users. The coach's Today **Celebrate** list shows milestones from the last 7 days.

## Measurements and progress photos

On the Progress tab, under the weight chart:

- **Measurements** (`src/lib/measurements.ts`, `measurements-card.tsx`): a weekly log of waist, hips, chest, arms and thighs (any subset), stored in inches and shown in cm for kg users. Tiles show each site's latest value and change since the first entry; the chart plots the chosen site against the **weight trend** on twin axes, so a stalling scale with a shrinking waist is obvious. "How to measure" gives consistent landmarks. Works in local mode too (`measurements` table / local storage key), and appears read-only in the coach dashboard.
- **Progress photos** (`src/lib/photos.ts`, `worker/photos.ts`, `photos-card.tsx`) — **optional and private**: front / side / back per date, before/after views, and delete any time.
  - **Take photo** (`pose-camera.tsx`) opens a live 3:4 camera with the member's last photo of that pose laid faintly over it (strength slider), a centre line and thirds, front/back switch and a 3 s / 10 s self-timer, so each week lines up with the last. What's saved is exactly the framed 3:4 crop; the front camera previews mirrored (guide too) but saves the true image. Without a usable camera it falls back to **Choose photo** (the phone's picker), with the reason.
  - **Monthly comparison** (`physique-compare-card.tsx`, `POST /api/physique/compare` in `worker/physique.ts`, migration `0024`): the AI compares the newest photo of each pose with the one closest to a month earlier (any earlier set at least 14 days back can be picked), told both dates and the nearest weigh-in to each, and writes What Changed, Body Fat Then vs Now, Visible Improvements, Still to Work On and a **Shareable Summary** (third person, no name, only what the photos show) with a Copy button. Stored in `physique_analyses` as `source = 'compare'` with `before_date` and the photo ids used, so past comparisons can be re-read with their photos; kept out of the regular analysis list and the coach's program-focus card. Counts toward the same daily limit. The card flags when this month's comparison is due; the coach sees the newest one on the member's page under their photos (same photo-sharing rule).
    - **Measured numbers** (`src/lib/physique-stats.ts`): the comparison is also given the nearest weigh-in and tape measurements to each date, the main compound lifts' best estimated 1RM before vs after (`MAIN_LIFTS` only; at most 3) and how many days habits were logged, as facts to trust over visual guesses. They're stored with it (`physique_analyses.stats`, migration `0025`) and shown as chips ("−3.5 lb", "Waist −1.2 in", "Back squat +12 lb") in the member's units.
    - **Share image** (`src/lib/share-image.ts`): one tap draws a 1080 × 1350 charcoal-and-gold image on the device (title "28-day transformation", dated before/after of the chosen pose, the chips, the shareable summary, "Lean Stature System"). Share opens the phone's share sheet where allowed; Save downloads it; on iPhone press-and-hold on the preview saves it too.
    - **Testimonials:** a member switch, *My coach may use my comparisons as testimonials* (`testimonial_consent`, `GET/PUT /api/testimonial-consent`). The coach dashboard's **Testimonials** view (`GET /api/coach/testimonials`, `worker/testimonials.ts`) lists only members who said yes **and** share their photos and belong to the whop, each with their newest comparison, Copy summary and the share image. Either switch off takes them off the list at once.
    - **Comparison-ready push** (`worker/compare-nudges.ts`, cron every 15 min): once a member's new photos make a comparison possible (newer than their last comparison by 14+ days, with an older set to compare to), a Whop notification once per new set, sent 30 min after their last upload so front, side and back are one message (`compare_nudges`).
    - **Body fat over time:** a small chart of the estimated body fat range from every analysis and comparison (`bodyFatSeries`), on the member's card and the coach's.
    - **Photo-day reminder** (`worker/photo-day.ts`, cron every 15 min): "It's photo day: N weeks since your last progress photos. Same spot, same light, same poses." once per gap, when the newest photo is 28+ days old (members whose newest is over 120 days old aren't reminded), around 9am in the time zone from their reminders (2pm UTC if unknown), never while paused. On by default; the photos card has a *Monthly photo-day reminder* switch (`photo_settings.photo_day`, `PUT /api/photo-settings { photoDay }`). `photo_day_nudges` records which gap was announced.
  - **Your transformation** (`photo-compare.tsx`, also on the coach view): pick any two dates of a pose and compare them as a **Slider** (drag to wipe from before to after; a real range input, so it works by keyboard too) or **Side by side**, or play every photo of the pose as a **Timelapse** (newest 30, three speeds, scrub bar). Each photo is resized and re-encoded as JPEG on the device (max 1440 px), which strips EXIF/location data, then stored in the private R2 bucket bound as `PHOTOS` under `u/<userId>/<id>.jpg`. There are no public URLs: images stream through the Worker after an identity check, with `Cache-Control: private, no-store`. The server only accepts real JPEG bytes up to 2 MB, 400 per member. **Coach access is off by default**: only while the member switches on *Share my photos with my coach* (`photo_settings`) can an admin of their whop view them (`GET /api/coach/photo`, re-checked on every request). Photos never appear on the leaderboard. Cloud mode only — never stored in the browser. "Delete all my data" removes the objects as well as the rows. Tables from migration `0008`.

**Storage limits** (`src/lib/photos.ts`, checked in `worker/photos.ts` since every upload passes through the Worker): each member can upload **12 photos a day** (UTC; `MAX_PHOTO_UPLOADS_PER_DAY`, counted in `photo_uploads` from migration `0016`, so deleting and re-uploading doesn't reset it), and uploads stop for everyone once all photos together reach **9 GB** (`PHOTO_STORAGE_CAP_BYTES`), which keeps R2 inside Cloudflare's free 10 GB. The photo card says which limit was hit and turns **Add photo** off; existing photos stay viewable and deletable. The coach dashboard shows "Progress photo storage: X of 9 GB used" (amber from 80%). To allow more, raise `PHOTO_STORAGE_CAP_BYTES` (R2 costs about $0.015 per GB a month beyond the free tier).

**Turning photos on** needs Cloudflare R2, which Cloudflare only enables after a payment method is on file (the free tier covers 10 GB). Once it's enabled: `npx wrangler r2 bucket create leanligercalc-photos`, add `"r2_buckets": [{ "binding": "PHOTOS", "bucket_name": "leanligercalc-photos" }]` to `wrangler.jsonc`, and deploy. Until then the photos card says "Coming soon".

**Time to measure** (`worker/measure-day.ts`, `measure-reminder.tsx`, `GET/PUT /api/measurement-settings`, migration `0028`): like photo day, a Whop notification around 9am (their reminders' time zone, else 2pm UTC) once the newest measurement is 28+ days old, for members who measured in the last 120 days and haven't turned it off (the switch under Progress → Check-in → Measurements; on by default, `measurement_settings`). One per gap (`measure_day_nudges`), not while paused, and a day later if a photo-day reminder went out in the last 20 hours, so the two don't arrive together.

## Physique analysis

**Physique analysis** (`src/lib/physique.ts`, `worker/physique.ts`, `physique-card.tsx`): on the Progress tab under the photos card. A vision model reads the member's front, side and back photos and replies with an estimated body fat **range**, their 2–3 strongest muscle groups, 2–3 target areas, and a plan for the next mesocycle. The prompt calibrates to natural, drug-free standards, refuses medical diagnoses, says so when lighting or clothing limits a read, and frames weaknesses as target areas rather than faults.

Two sources, both `POST /api/physique`:

- `{ "source": "saved" }` — the newest front, side and back already in R2. Answers 409 naming the poses that are missing rather than guessing from two angles.
- `{ "source": "upload", "images": [...] }` — a one-off set of three, resized on the device like any photo upload, **never added to the gallery**. This route reads its own body because three base64 photos are far larger than `readJson`'s shared cap.

`GET /api/physique` returns the last 20 analyses (newest first) plus today's remaining count, so a member can re-read an earlier breakdown without spending another. Only the reply text is stored (`physique_analyses`), never a copy of the photos; "Delete all my data" removes it along with `physique_usage`.

**Off until the `GEMINI_API_KEY` secret is set** (`npx wrangler secret put GEMINI_API_KEY`, a free key from <https://aistudio.google.com/apikey>); without it the card doesn't show, the same way meal photos work. Each member gets 3 a day (`physique_usage`), counted before the call so retries can't run up the bill. The model is `gemini-3.8-flash` or `PHYSIQUE_MODEL` — Google retires models on its own schedule, so a 404 naming the model means set a current one; list what the key can use with `curl -H "x-goog-api-key: $GEMINI_API_KEY" https://generativelanguage.googleapis.com/v1beta/models`. `GEMINI_API_BASE` exists only to point local tests at a stand-in. Safety filters can refuse the photos outright (`promptFeedback.blockReason`) or cut generation short (`finishReason`); both answer 422 with advice on clothing and lighting rather than a raw provider error. Table from migration `0022`.

## Today and badges

The **Today** tab (`today-tab.tsx`) is the screen a member opens each morning. A fresh open always starts here; a reload (the tab is in the URL) stays where it was. It reads and writes the same data as the other tabs — nothing new is stored on the server.

- **Header:** the date, "X of N done today", and a ring per task: weigh-in, workout (finished, or a rest day), food (anything logged; the ring fills toward the calorie target), habits (all of them; fills as they're ticked) and steps (at target; only when a habit is linked to steps). Tapping a ring jumps to its card.
- **Layout:** what's still to do comes first. A finished task folds to one line under **Done today** (tap it to open the card again, e.g. to untick a habit). Food stays open all day because it's a running total. Only the first unfinished weigh-in or workout gets the gold button, so the page has one obvious next step.
- **Weigh-in:** log today's weight right there, or see it with the trend.
- **Workout:** resume the one in progress; what was finished today; "Rest day"; otherwise the active program's next day with its first exercises and **Start** (`createWorkout`, the same as the Training tab, pre-filled from last time) — or a link to pick a program.
- **Food:** calories left (big), eaten vs target, and protein, against today's targets (`src/lib/day-targets.ts`, shared with Nutrition: the roadmap's day, else the weekly carb plan).
- **Habits:** today's checklist — tick boxes, and −/+ for number goals. **Mark as rest day** sits at the top (when a habit is linked to workouts and nothing's been trained today): it excuses the workout habit on the weekly scorecard, up to 3 a week, and counts as today's workout in the header. The workout card shows **Undo** while it's on.
- **Steps:** today's count against the plan's step target (10,000 when maintenance comes from an activity level); ticks the steps habit at the target.
- **Fasting:** fasting / eating window / time to eat, with the next meal time. Hidden until a fasting window is set up (Food → Fasting).
- Each card links to its full tab and sub-section. Accounts with nothing logged see a welcome card pointing to the timeline.

**Badges** (`src/lib/badges.ts`, `badges-card.tsx`) — 23 milestones worked out from data members already log, so nothing extra is stored and they stay correct if entries are edited or deleted: 1 / 10 / 50 / 100 workouts; first / 10 / 25 PRs (same records as the trophy in the logger); 7 / 30 / 100-day habit streaks (80%+ days) and four Green Zone weeks; 1 / 30 / 100 weigh-ins; 5 / 10 / 20 lb (2 / 5 / 10 kg) down on the weight trend; first measurements; first food logged, 7 days in a row, 30 days; first 10K-step day and 30 of them. The card lives on **Ranks → Badges** and shows the latest earned (with the date where it's knowable), the two closest to done, and the full set. A **New badge!** banner appears on Today when one is earned, with a link to Ranks → Badges; which ones a member has already seen is kept per device in local storage (on the first visit everything already earned counts as seen, so existing members don't get a flood).

## Training

The **Training** tab (`training-tab.tsx`) has three sections. **Workouts** is today's workout, the workout log and the rest timer. **Tools** holds the plate calculator, form checks, Strength trends and the exercise library (it also opens during a workout, and asking for a form check from an exercise page lands here). **Programs** is the coach's plan on a calendar (below) and, under it, every program the member has, with **Build my own** and **From a template** (internally the section is still `program`).

- **Program calendar** (`program-calendar.tsx`, `src/lib/program-schedule.ts`): a program the coach sends with a schedule (start date, training weekdays, 1–26 weeks) becomes a month calendar — each training day is a session, taking the program's days in turn (Upper A, Lower A, Upper B, Lower B, Upper A…). Sessions show **done**, **done on another day** (a workout from the program within 3 days of its date counts for it, preferring the same program day), **today**, **planned** or **missed**; tap one for its exercises and **Start** (today or a missed one). The header has the coach's note, progress ("5 of 24 done · 1 missed") and today's line: "Today in your plan · Lower B", "Rest day · Next: Thu · Upper B" (with **Do it today**), "Done for today", or "Plan finished". The Workouts section's next-up card and the Today screen follow the same plan when the active program has one; without a schedule they keep the plain rotation. The schedule is kept with the program in the plan (`Program.schedule`); members can't change it, but their coach can (see **Edit a member's program**).

- **Exercise library** (`src/lib/exercises.ts`): 84 common lifts, plus 9 one-arm and one-leg versions (single-arm lat pulldown, cable row, cable curl, machine lateral raise, triceps pushdown and overhead extension; single-leg pendulum squat, leg extension and seated leg curl) that share their two-sided version's drawings grouped by muscle and equipment, each with two form cues and, where they go by other names, search aliases (searching "overhead press machine" finds Machine shoulder press; hyphens count as spaces) and a "Watch a demo" link (a YouTube search, or the exercise's own `video` link — fill in the `VIDEOS` map to attach your own). Ids are permanent: workouts and programs refer to them. Members can add their own exercises (name, muscle, equipment, cues, optional https video link). Bodyweight exercises log *added* weight and are tracked in reps.

- **One side at a time** (`isOneSide`, `setVolume`, `weakerSide` in `src/lib/training.ts`): only those 9 one-arm and one-leg exercises are logged one side at a time (`Exercise.oneSide`); every other exercise is unchanged, and there is no switch. Each workout stores it (`WorkoutExercise.oneSide`), so nothing logged before is re-counted. Reps are per side (*Reps/side*); *Left/right differ?* takes each side's reps for a set (`WorkoutSet.left` / `right`), and the set's reps become the weaker side's, so records, the estimated max and the add-weight advice follow it. Volume counts both sides (weight × left + right, or × reps × 2). Sets read `90 × 10/side` or `90 × L8/R10`, and when one side was behind on every split set last time, the exercise says which and by how much.
- **Exercise drawings** (`src/lib/exercise-art.ts`, `exercise-art.tsx`, `public/exercise-art/`): every library exercise has a line drawing next to its name (library, picker, workout logger, program editor and Assign, next-up lists, Program calendar, Today) and both positions of the movement on its page; members' own exercises show a dumbbell icon. The files are white lines on transparency used as CSS masks (`.exercise-art`), painted with the text colour so they follow light and dark mode. Ab wheel and cable crunch have one drawing (the set's others show the wrong position). Drawings are from [Workout Guide](https://github.com/bryllim/workout-guide) by Bryl Lim, based on Everkinetic artwork, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); the credit shows under the drawings on each exercise page, and `public/exercise-art/CREDITS.txt` records the changes made. Those files stay under CC BY-SA 4.0.
- **Programs** (`src/lib/training.ts`): three templates — Full body (A/B), Upper / Lower (4 days), Push / Pull / Legs — or build your own (up to 8 programs, 7 days, 12 exercises a day). Each entry has sets, a rep range and an optional rest (main lifts 3:00; otherwise the member's default, 2:30 unless changed). "Next up" is the day after the last finished workout from the active program.
- **Logging** (`workout-logger.tsx`): starting a day pre-fills every set with what was lifted last time; the member adjusts weight/reps and ticks ✓. Ticking a set copies its numbers into an empty next set and starts the rest timer. A trophy marks a set that beats the previous best (estimated 1RM, or reps for bodyweight), and a nudge appears when every set hit the top of the rep range last time. The workout saves as you go (debounced, flushed when the page is hidden) and resumes after a reload; one left open for 12 h stops counting as in progress. **Finish** keeps only completed sets and ticks *Completed workout* on the Progress scorecard (clearing a rest-day mark for that day). Finished workouts can be edited or deleted from *Recent workouts*.
- **Reps in reserve** (`RIR_CHOICES`, `progressionAdvice` in `src/lib/training.ts`): after ticking a set, one tap records how many reps were left (0 = all out … 4+); un-ticking clears it, and a switch on the Training tab turns the question off (`trackRir`). The suggestion under each exercise uses it: every set at the top of the rep range with reps to spare → add weight (about 5 lb / 2.5 kg, or 10 lb / 5 kg when every set had 3+ left); top of the range but the hardest set all out → repeat the weight; not at the top yet but every set had 3+ left → push for more reps (or, without a rep range, add weight). Without RIR it's the plain rule (top of the range → add weight). Effort shows in "Last time", exercise history and recent workouts, e.g. "185 × 8 (2 left)". Old workouts without it load as before.
- **"Finished your workout?" reminders** (`src/lib/workout-nudge.ts`, the minute scheduler in `worker/reminders.ts`, migration `0018`): a workout in progress whose saved copy hasn't changed for 10 minutes (no set ticked, nothing typed) gets a Whop notification asking if it's finished, then "Still training?" every 5 minutes while nothing changes. Any change starts the 10 minutes again; finishing or discarding the workout stops them. They stop after 12 in a row (an hour), so a workout left open overnight doesn't notify all night. On by default; the **Remind me to finish my workout** switch on the Training tab turns them off (`TrainingSettings.finishReminders`, read by the scheduler from the saved plan). Sent where the member last opened the app (`worker/experiences.ts`); `workout_nudges` remembers the last one per workout. A workout logged with no signal looks idle to the server until it uploads, so it can be reminded about meanwhile.
- **Works with bad gym signal** (`src/lib/workout-backup.ts`, `src/lib/habit-backup.ts`): every workout change is written to the phone first and only marked synced once the server has that exact version, so losing signal mid-workout and closing the app loses nothing. Uploads retry when the browser reports it's back online, every 30 s while anything is waiting, and on the next open; a hung request times out after 15 s. Opening the app with no signal shows the workout from the phone (a synced copy of any workout in progress is kept for this), and logging carries on. Finishing or discarding offline works too, as do habit ticks (including "Completed workout" on finish). Food log days and weigh-ins (including deleting one) work the same way (`src/lib/day-backup.ts`). A "N changes saved on this phone" badge by the tabs, and the note in the workout, appear only once an upload has actually failed (not during the normal save a moment after each change). Each copy is tagged with the Whop user it belongs to (`/api/session` returns it), so a shared phone never uploads one person's workout to another account. On reconnect, a phone copy still in progress is dropped if the server already has that workout finished (finished on another device); a change the server refuses as invalid is dropped rather than retried forever. The Training tab says when changes are waiting ("saved on this phone, uploads when you're back online"). Unsynced copies are kept up to 60 days; "Delete all my data" clears them.
- **Plate calculator** (`src/lib/plates.ts`, `plate-calculator.tsx`): a card on the Training tab — type a total, see the plates for each side, drawn on the whole bar (both sides, heaviest against the collars, in gym colours: 45 blue, 35 green, 25 red, 10 yellow, 5 white, 2.5 silver; kg uses competition colours, 25 red, 20 blue, 15 yellow, 10 green; a very heavy load scrolls sideways; plate numbers read upright) — with **Barbell** / **Machine** check boxes: Barbell takes the bar's weight off the total first, Machine (plate-loaded leg press, hack squat…) splits the whole total into plates and draws the machine in the middle; the card remembers the choice on the device — and a **Plates** button on barbell exercises during a workout, showing the loading for the next set's weight as it's typed. Standard plates (45/35/25/10/5/2.5 lb, or 25/20/15/10/5/2.5/1.25 kg in kg mode), heaviest first; a 45 or 35 lb (20 or 15 kg) bar, remembered on the device; when a total can't be made exactly it shows the closest lighter load and how much short. The card also works the other way round: **Plates → weight** has a box (with −/+) for how many of each plate are on one side, and shows the total on the bar (plus the bar, or plates only for Machine) and the drawing as you type (`weightFromCounts`; up to 20 of a plate a side).
- **Swap an exercise** (`swapExercise` in `src/lib/training.ts`): the ⇄ button on any exercise with sets left opens the picker filtered to the same muscle. Nothing done yet: it's replaced in place. Part done: the done sets stay logged on the original and the rest move to the replacement right after it. The replacement keeps the program's target and rest and is pre-filled from its own last session. "Also use it in <program · day> from now on" changes the program too (`swapInProgram`).
- **Form checks** (`form-checks.tsx`, `src/lib/form-checks.ts`, `worker/form-checks.ts`): a member sends a video link of a set (any exercise; "Get a form check" on an exercise's page picks it) with an optional question. Admins of the community see **Form checks to review** on the Training tab, watch it and reply (with one-tap starters); the member gets a Whop notification ("Coach feedback: Barbell back squat") and sees the feedback under **Your form checks**. Private to the member and the community's admins, checked with Whop on every call. Up to 3 waiting and 100 kept per member; withdraw or delete any time. Table from migration `0012`; "Delete all my data" removes them. Needs `WHOP_API_KEY`, like the lift leaderboard.
- **Rest timer** (`rest-timer.tsx`): counts down to a timestamp, so it's right after the phone pauses the page; kept in local storage across reloads. Quick picks 2:00 / 2:30 / 3:00 (the pick sticks for that exercise), ±15 s, Skip. At zero it chimes (Web Audio, unlocked by the tap that started it) and vibrates where supported (not iPhone); it only sounds if the page is open at that moment. The screen is kept awake during a workout where the browser allows it.
- **Gym mode** (`gym-mode.ts`, a switch in the live workout header, remembered per phone): set rows become 56 px boxes and a big done button (the *Previous* column drops out, since *Last time* already shows it), Add/Remove set and Finish grow, and the rest timer takes the whole screen (`GymRest`: a countdown up to 12rem tall, 2:00 / 2:30 / 3:00, and 80 px −15 / +15 / Skip, then **Next set**; **Shrink** returns to the bar for that rest). The header says whether the screen-on lock actually held; where it's refused (some browsers, or Whop's frame), it says to set Auto-Lock to Never while training instead of claiming the screen stays on.
- **Strength trends** (`strength-trends-card.tsx`, `src/lib/strength-trends.ts`; Training → Tools, and a member's Training tab on the coach dashboard): every lift trained in the last 4 weeks, grouped by muscle (Chest, Back, Quads… in the library's order; the member's own exercises by their muscle), with a small line of its sessions, its estimated max now (best reps for bodyweight exercises), the change over 6 weeks and **Stronger** (more than +2%), **Holding** or **Slipping** (more than −2%); **New** until a lift has 3 sessions over 2 weeks. The change compares the best of the last two sessions with the best of the two around six weeks before (or the first two). Slipping lifts come first within each group; **6 weeks | All time** switches the change to since each lift's first session ("+12.5% since Sep 1"). It replaced the old Lift progress chart. Tapping a lift opens its page, whose chart opens on **Best weight** (then Volume, Sets, Every set, and Est. 1RM last). Each exercise page now also has **Sets** (working sets per session) and **Every set** (each set as a dot, heavier higher, more reps bigger), and **Rep records**: the heaviest weight for 1–5, 6–8, 9–12 and 13+ reps, with the date.
- **Progress** (`exercise-progress.tsx`): tap any exercise for best est. 1RM (Epley: weight × (1 + reps ÷ 30)), heaviest weight, sessions and last time; a chart of est. 1RM / best weight / volume (best set / total reps for bodyweight) with personal records marked; and the full history.

Weights are stored in pounds and shown in the member's unit. Programs, own exercises and rest settings live in the plan document (`tracking.training`, re-sanitised on load — entries pointing at a deleted exercise are dropped; `PLAN_MAX_BYTES` is 256 kB to fit them at their limits). Workouts have their own table (`workouts`, one JSON row per workout validated by `validateWorkout()`, up to 2,000 per member) from migration `0009`, or the `prep-calculator:workouts:v1` local storage key outside Whop. The coach dashboard doesn't show training yet, and strips it from the plans it loads.

**Sets per muscle** (`src/lib/muscle-volume.ts`, `muscle-volume-card.tsx`): on Training's home and on a member's Training tab for the coach, finished sets this week or last week per muscle, as bars with a line at 10. Each exercise counts for its main muscle and half a set for its usual helpers (chest work for triceps and shoulders, back for biceps, shoulders for triceps, quads and hamstrings for glutes, glutes for hamstrings). Chest, back, shoulders, quads, hamstrings and glutes under 10 sets in the last finished week are called out; arms, calves and core aren't, since they get work from other lifts or are optional.

## Lift leaderboard

Ranks → **Lifts** (`lift-board.tsx`, `src/lib/lift-board.ts`, `worker/lift-board.ts`): verified one-rep squat, bench press and deadlift, ranked by **weight ÷ bodyweight** (ties: the heavier lift, then the earlier submission). Each member's best approved lift per exercise counts.

- **Submitting:** lift, weight, bodyweight (pre-filled from the latest weigh-in), date (last 12 months), a **video link** (https — YouTube unlisted, Instagram, Google Drive…; the app stores only the link) and an optional note. One pending submission per lift at a time, 30 per lift kept. The form shows the ratio and says what other members will see.
- **Review:** admins of the community (checked with Whop on every call) get a *Lifts to review* queue in the same tab — watch, then **Approve**, or **Reject** with a reason (one-tap presets or free text). Admins can also remove an approved entry from the board. The member gets a Whop notification either way (with their rank, or the reason). Review happens inside the community's app view, not the company coach dashboard, because submissions belong to a community (`exp_…`).
- **Visibility:** pending and rejected submissions are seen only by the member and admins. Approved ones show the member's Whop name and photo, weight, ratio, date and a Watch button to everyone in that community. Bodyweight is never sent to other members (though it can be worked out from weight ÷ ratio — the form says so). User ids are never sent; admins also get submission ids so they can remove entries.
- **Storage:** `lift_submissions` (migration `0010`). Withdrawing deletes the row; "Delete all my data" removes them all. Needs `WHOP_API_KEY` (access checks, profile, notifications), like the streak leaderboard.

## Daily habits and the weekly scorecard

The Progress tab includes the **Daily Self-Accountability Scorecard**:

- **Seven daily non-negotiables**, ticked each day: protein target (±10 g), calorie target, pre-logged meals, step target, hydration (100+ oz), 7+ hours sleep, completed workout. Protein and calorie rows show that day's targets from the roadmap. Members can rename, reorder, remove or add habits (tick-box or number goal); "Scorecard" restores the seven.
- **Rest days**, up to 3 per Mon–Sun week, excuse the workout habit only.
- **Pause mode** (Settings; `src/lib/pause.ts`, `pause-settings.tsx`): sick or travelling, a member pauses for up to 14 days — starting today, up to 2 days back ("sick since yesterday"), or planned up to 60 days ahead for a trip; one at a time. Paused days don't count for or against anything: streaks freeze (habit, daily, Green Zone weeks, badges, the community leaderboard), the weekly score leaves them out (scorecard cells show ⏸), and the scheduler sends no reminders, fasting included. Anything logged still saves. Pauses live in the plan (`tracking.pauses`), never in the habit logs: scoring wraps the logs with `withPauses`, which marks paused days on the fly, so "Resume now" or cancelling leaves nothing behind (days already paused stay excused). Today shows a banner with **Resume now**; the coach dashboard shows "Paused · sick to Oct 15" and doesn't flag a paused member as inactive.
- **Weekly consistency score** = ticks completed ÷ (habits × 7 − rest days) × 100, with the sheet's zones: 80–100% green, 60–79% yellow, under 60% red. The printed formula, `(checks / 49) − (rest days) × 100`, can't be computed literally (it subtracts days from a fraction); this is the intent the sheet encodes, since only the workout row's total is left open. A week in progress is scored on days so far, today's unticked boxes aren't misses until the day is over, and days before a member's first log don't count.
- **Weekly self-audit**: the friction audit — what trigger caused the week’s biggest slip-up. (The sheet’s “top 3 wins” and “adjustment rule for next week” were removed from the app; the `wins` and `rule` fields still exist in the data model, so older entries are kept but no longer shown.)

- **Streaks & consistency** (`src/lib/streaks.ts`, `consistency-card.tsx`), all derived from the daily logs — nothing extra is stored. Each habit shows a flame streak on the daily checklist and its share of the last 30 days; the card adds an overall streak of days at **80%+ of that day’s habits** (not “all seven”, so one miss doesn’t erase weeks of work), consecutive **Green Zone weeks**, best-ever streaks, and an 8-week trend. Same rules as the scorecard: a rest day neither extends nor breaks the workout streak, today never counts against you until it’s over, and days before the first log don’t count.

- **Reminders** (Settings panel — the gear at the top left; `src/lib/reminders.ts`, `reminders-settings.tsx`): optional Whop notifications at times each member picks — a **morning weigh-in** (skipped if today's weight is already logged), an **evening habits** nudge ("3 habits left today · keep your 12-day streak going", skipped once everything's done), a **bedtime downtime** nudge 15, 20 or 30 minutes before the bedtime they set ("Time to wind down · bed at 10:30 PM"; when the weigh-in reminder is on too, it adds how much sleep that leaves before it and flags under 7 hours), and a **Sunday recap** (scorecard %, weight change vs last week's average, average protein from the food log). They share the fasting scheduler (`worker/reminders.ts`), its once-per-day and catch-up rules, and its 40-sends-per-minute budget; preferences sync with the plan and are copied to the `reminders` table (migrations `0006`, `0011` for downtime).

- **Community leaderboard** (its own **Leaderboard** tab; opt-in; `src/lib/leaderboard.ts`, `worker/leaderboard.ts`, `leaderboard-tab.tsx`, `leaderboard-card.tsx`): members who join are ranked within their Whop community on **Streak** (current 80%+ days in a row), **This week** (scorecard %) and **This month** (80%+ days so far — a built-in monthly challenge). Anyone in the community can view it; joining or viewing is checked against Whop access to that experience. Stats are computed on the server from each participant's habit logs in their own time zone, so only name, Whop photo and those four numbers ever leave the server — other members' ids, logs, weight and food never do. Leaving deletes the entry (`leaderboard` table, migration `0007`), as does "Delete all my data".

Habit definitions sync with the plan; daily logs (`habit_logs`) and reviews (`weekly_reviews`) have their own tables, added by migrations `0002` and `0003`. "Delete all my data" removes all of it.

**What's working for you** (`src/lib/insights.ts`, `habit-insights-card.tsx`; Progress → Habits): the last 16 finished Mon–Sun weeks, each with its weight change (the least-squares slope through that week's weigh-ins and the day before, ×7; 4+ readings over 4+ days), split three ways: weeks averaging the plan's step target or more (rounded to the thousand; 4+ days with a count), Green weeks (80%+ on the scorecard), and weeks with food logged 6+ days. A comparison shows when both sides have 3+ weeks and differ by 0.15 lb a week or more: "In weeks you averaged 9,000+ steps, you lost 0.4 lb more a week (−0.9 vs −0.5 lb a week)". Labelled as a pattern, not proof.

## Nutrition: food log and barcode scanning

The **Food** tab (internally still the `macros` tab, so saved tabs and links keep working) has three sections: **Food log**, **Water** and **Fasting** (the timer below). The food log tracks what a member eats against that day's targets — the Roadmap's numbers for the day, or the Carb Cycling tab's week for days outside the Roadmap.

**Adding food**

- **Scan** — a live camera view reads EAN-13, EAN-8, UPC-A and UPC-E barcodes. Chrome on Android uses the browser's built-in `BarcodeDetector`; everywhere else (including every iPhone, which has no such API) uses ZXing compiled to WebAssembly. The ~1 MB decoder loads only on the first scan and is served from this site (`public/zxing/`, copied from `node_modules` by `scripts/copy-zxing.mjs` on every build), not a CDN.
- **Photo fallback** — if the live camera is unavailable or blocked, members take a photo of the barcode instead; the file picker hands over a picture without granting the page camera access, so this works even inside an embed that doesn't allow the camera.
- **Type the barcode**, **search by name**, or **quick add** straight from the label. Recent foods re-add in one tap.
- **Amount and numbers, editable** (`food-amount-editor.tsx`, `FoodBasis` / `editBasis` in `src/lib/food.ts`): adding a food and editing a logged one (the pencil) use the same editor. Switch between **Servings** and **Grams** (or ml); when the label doesn't say how much a serving weighs, it asks ("How many grams is 1 serving?") and converts the amount. Calories, protein, carbs and fat for the amount are editable: a typed number becomes the food's new per-gram (or per-serving) basis, so it keeps scaling with the amount, and changing protein, carbs or fat moves the calories by 4 / 4 / 9 kcal a gram.
- **My foods** — anything typed in can be saved. A saved barcode beats the database, so a product that's missing or wrong only has to be entered once ("Fix numbers").
- **Saved meals** (`src/lib/saved-meals.ts`): the bookmark next to a meal in the day's log saves its foods as a named meal ("My usual breakfast"); **Saved meals** logs the whole meal into the meal picked in Add food in one tap, with Undo. Up to 20 meals of 15 foods, kept in the plan document (`tracking.savedMeals`, re-validated like food log entries); saving with an existing name updates it. Not sent to the coach dashboard.
- **Water** (Food → **Water**; `src/lib/water.ts`, `water-card.tsx`): six bottle buttons, 16.9 oz (500 ml) each — six make 101.4 oz, the scorecard's 100+ oz goal. Tapping a bottle fills up to it; tapping the last full one empties it. The count is stored on the day's habit log (`_water`, 0–20) and the hydration habit (link `water`; the default "Hit hydration goal (100+ oz)" is linked automatically) ticks itself at six and unticks below, like the step habit. Shows ounces, or litres in kg mode, plus the week at a glance; past days can be filled in. Works offline like other habit ticks.
  - **Hydration reminders** (`src/lib/water-reminders.ts`, `worker/water-reminders.ts`, `GET/PUT/DELETE /api/water-reminders`, migration `0027`): a switch on the Water card, every 1 h / 1½ h / 2 h / 3 h between a start and end time (default 8:00 to 20:00) in the phone's time zone, with a countdown to the next one. A Whop notification goes out at the start time and every interval up to the end ("Time to hydrate: 2 of 6 bottles so far today"), each slot once (up to 10 minutes late; a longer outage doesn't send a backlog), from the every-minute cron. Skipped once the day's six bottles are ticked, and while paused. Turning it on mid-day counts the slots already past as sent. Saved on the server (`water_reminders`), not in the plan; needs the app opened inside Whop.

**Where the numbers come from**

| Source | Used for | Setup |
|---|---|---|
| [USDA FoodData Central](https://fdc.nal.usda.gov) | Barcodes (branded foods, matched on the exact GTIN) and search (whole foods such as "chicken breast" first, then branded) | Required: `npx wrangler secret put USDA_API_KEY` with a free key from <https://fdc.nal.usda.gov/api-key-signup>. Without it, scan and search say the food database isn't set up. |

USDA is the only source (Open Food Facts was removed). Its branded foods are mostly US products, so a scan elsewhere is often "not found"; the member types the label in once and it's kept in My foods. Entries logged from Open Food Facts before the switch keep their numbers and "Open Food Facts" label.

Lookups go through the Worker, which caches every answer in the `food_cache` table (found products 30 days, misses and searches 1 day), so each product is fetched upstream once rather than once per member. These two routes are public — food logging has to work outside Whop too — and hold no personal data; a per-IP rate limit (`FOOD_LIMITER`, 40 a minute) stops the Worker being used as a free proxy. Barcodes: USDA's search matches a GTIN only as stored (usually zero-padded to 14 digits, while a scan reads 12), so a scan is tried as 14, as scanned, 13 and 12 digits (and a UPC-E code's long form) until an exact match; one form failing doesn't stop the others. Barcode answers are cached under `usda2:bc:` and searches under `usda:q:`, so nothing cached from Open Food Facts, or by the first USDA-only build that missed padded GTINs, is served again.

The amount picker always shows the calories and macros it's about to log, flags labels whose calories don't match their macros (4/4/9), and the attribution line reminds members to check against the label.

**Repeat a meal.** *Repeat a meal* lists meals from the last two weeks (the same foods in the same amounts count once) to log again in one tap, into the same meal; once a day has food, *Same as yesterday* chips add any meal yesterday had that today doesn't (`recentMeals` in `src/lib/food.ts`). *Copy the day before* still fills an empty day.

**Photo estimate** (`meal-photo.tsx`, `worker/meal-photo.ts`, `src/lib/meal-photo.ts`): Add food → **Photo**. The phone shrinks the photo (768 px JPEG) and the Worker asks Gemini (`gemini-3.8-flash`, or `MEAL_PHOTO_MODEL`) for each food's grams, calories and macros as JSON (`responseMimeType: application/json`); the member edits any of it, removes items, and adds them all in one go (logged in grams, so changing the amount scales the macros). The photo is sent to Google for that request and never stored here. **Off until the `GEMINI_API_KEY` secret is set** — the same key and credit balance as physique analysis; without it the Photo button doesn't show. Each member gets 10 a day (`meal_photo_usage`), counted before the call so retries can't run up the bill; if the Gemini prepay credit runs out (HTTP 402) the member is told estimates are paused and the attempt is given back. `GEMINI_API_BASE` exists only to point local tests at a stand-in.

**Nutrition label photo** (`src/lib/label-photo.ts`, `worker/label-photo.ts`, `POST /api/food/label`): in the type-it-in form (a barcode USDA doesn't have, *Quick add from label*, or a product without nutrition), **Read the label from a photo** opens the camera; the phone sends a 1280 px JPEG, Gemini reads the per-serving column (or per 100 g when that's all there is; kJ converted) as JSON, and the name, brand, serving size, calories, protein, carbs and fat fill the form for the member to check before saving (to My foods, so the barcode is remembered). Unreadable labels come back as an error rather than guesses. 15 a day per member (`ai_usage`), same Gemini key; the photo isn't kept.

**Describe a meal** (Add food → **Describe**; `src/lib/meal-describe.ts`, `worker/meal-describe.ts`, `POST /api/food/describe`): the member types or says what they ate ("2 eggs, toast with butter, black coffee", up to 400 characters). Gemini splits it into foods with grams and macros (amounts as given, typical portions otherwise, cooking fat and milk in drinks as their own items), returned in the photo estimate's shape and shown in the same editable list (`EstimateReview` in `meal-photo.tsx`) before anything is logged. The microphone button uses the browser's speech recognition where there is one (Chrome, Edge, Safari) and is hidden otherwise; the keyboard's own dictation always works. 30 a day per member (`ai_usage` kind `meal-describe`); shown when the AI key is set, like photo estimates.

**Training-day carb split** (`src/lib/training-carbs.ts`, `training-carbs-card.tsx`): on Food for today, when a workout is planned today in the active program, in progress or done, a card above Add food suggests putting about 25% of the day's carbs in the meal 1–3 hours before and 35% in the meal within about 2 hours after, with about a quarter of the day's protein (20–50 g) in each; the day's totals don't change. After a workout it shows only the refuel meal. On other days it folds to one line ("Training today?") for members who train without a calendar.

**Calorie ring** (`macro-donut.tsx`). Under the day's calories, a ring shows where they came from: protein, carbs and fat by their calories (4 / 4 / 9 kcal per gram), whole percentages that add to 100, labelled around the outside on leader lines in the macro colours, with the calories eaten in the middle and the target's split underneath ("Target: 37% protein · 33% carbs · 30% fat"). Before anything is logged it shows the target's split, faded. Plain SVG on a fixed viewBox, so it scales with the card.

**Habit scorecard link.** Once a day has food logged, its *Hit daily protein target* and *Hit calorie target* boxes on the Progress scorecard follow the log: protein within ±10 g, calories within ±100 kcal. Those two rows also show eaten vs target ("165 / 180 g").

**Intermittent fasting.** Members enter their meal times (or start from a 16:8, 18:6, 20:4 or OMAD preset and adjust). The eating window runs from the first meal to the last and the fast from the last meal to the next day's first, so 12:00 / 16:00 / 20:00 shows as **16:8**. A ring timer counts down to the next meal: while fasting it shows hours fasted of the total, inside the window it shows the next meal and when the window closes, and for 30 minutes after each meal time it says *Time for Meal 2 — eat now*. Times are the device's local clock, windows can't cross midnight, and the meal times sync with the plan (`tracking.fasting`). Logic: `src/lib/fasting.ts`; card: `src/components/fasting-card.tsx`.

**Fasting notifications (Whop).** Members can switch on a Whop notification for when their eating window opens (at the first meal) and closes (30 minutes after the last meal, when the timer switches to "fasting"). They arrive in the Whop mobile app and on whop.com. How it works:

- Switching it on saves the first/last meal, the member's time zone and their Whop experience id (from the `/experiences/exp_…` URL) to `fasting_reminders` (migration `0005`). Switching it off, clearing the meal times, or "Delete all my data" removes the row.
- A Cron Trigger runs every minute (`worker/reminders.ts`). For each member it works out their local time; when an event is due it calls Whop's [create notification API](https://docs.whop.com/api-reference/notifications/create-notification) with `user_ids` set to that member only. Each notification goes out once per local day, with a 10-minute catch-up window for a late run (including across midnight), and failures are retried on the next run inside that window.
- It needs the proper Whop app (for member identity) and its API key with the `notification:create` permission. Until `WHOP_API_KEY` is set, the scheduler does nothing and the switch explains that notifications aren't available yet.
- Limits: up to 40 sends per minute (the free plan allows 50 outgoing requests per run; the rest go the next minute). The table is read once a minute, which stays inside D1's free read allowance for a few thousand members.

**Storage.** Food logs (`food_logs`, one row per day) and saved foods (`my_foods`) follow the same cloud/local rules as weigh-ins; on-device logs keep the last 365 days. Meals can be pre-logged up to 7 days ahead. "Delete all my data" removes all of it. Tables are added by migration `0004`.

## Coach dashboard

**Program focus from the physique analysis** (`physique-focus-card.tsx`, `src/lib/physique-focus.ts`, `GET /api/coach/member-physique` in `worker/physique-focus.ts`): on a member's page, under their training program. It reads the member's latest physique analysis, gated exactly like their photos (sharing progress **and** photos with the coach), finds the muscles its *Target Areas for Growth* names (each line counts for the area it leads with; lines about areas that couldn't be judged or aren't visible yet are skipped; at most 3), and drafts about **3 extra hard sets a week** for each on the chosen program: sets go onto isolation work first (rep ranges reaching 12+), at most +2 per exercise and never past 6; if two or more are still to place, one isolation exercise is added to the day that already trains that region (e.g. lateral raise, calf raise, seated leg curl). The coach can change the muscles, untick any change, and **Send**: it goes out as an ordinary program edit (`PUT /api/coach/member-training`), so the member's app applies it on next open and they get a notification. Hidden when there's no analysis or no photo sharing.

**Member check-in drafts** (`draftCheckin` in `src/lib/checkins.ts`, `checkin-card.tsx`): a new week's check-in arrives with *Wins*, *Struggles* and *Focus for next week* written from the week's numbers (the same preview the coach gets): weight against last week's average (good or bad depending on whether the goal is to lose, gain or hold), weigh-ins, days of food logged, average calories and protein against the plan's week targets (or the coach's macros), workouts against planned training days, steps against the goal, the habit score and photos. Focus is the most basic thing that slipped (weigh in daily, log every day, calories, protein, workouts, steps). The ratings are never guessed: the member rates how the week felt, edits anything, and sends. *Clear the draft* empties the three boxes; editing a sent check-in isn't re-drafted.

**AI check-in reply drafts** (`src/lib/checkin-draft.ts`, `worker/checkin-drafts.ts`, `POST /api/coach/checkins/draft`): in a member's *Weekly check-ins*, **Draft with AI** fills the reply box with a 90–180 word draft for the coach to edit and send as usual (nothing is sent or saved by drafting). Gemini gets the check-in (ratings with what each end of the scale means, wins, struggles, question, focus), the week's numbers, the plan's calorie, protein and step targets for that day (or the coach's macros), the goal weight, the coach's last two replies to this member (for voice and follow-up), the coach's private notes (background only, never quoted) and an optional style note the coach keeps on their device (*Your style for AI drafts*). It's told to use only the numbers given, say when weight data is thin, and steer anything medical to a professional. 60 drafts a day per coach (`ai_usage`).

Opening the app from the **Whop creator dashboard** (Whop serves it at `/dashboard/[companyId]`) shows a read-only coach view instead of the member app (`src/components/app-root.tsx` picks the view from the URL):

**Coach access — opt-in** (`src/lib/sharing.ts`, `worker/sharing.ts`, `coach-access.tsx`; table from migration `0013`). A member's data reaches the dashboard only while they share it; it's **off for everyone by default**, existing members included. Members who don't share are listed under **Not sharing with you** with their Whop name and photo only — the server doesn't read, let alone send, their data. **Ask to share** sends the member a Whop notification (in the community they last opened the app in) and a prompt on Today and in Settings → Coach access: **Share** or **Not now**. After "Not now" you can ask again after 7 days; a request can be cancelled until it's answered. Members can turn sharing on themselves and off any time (access ends immediately); **Stop viewing** on a member's page turns it off from your side. Shared: plan, weigh-ins, measurements, habits and streaks, food totals and pause status. Progress photos need both switches (coach access and photo sharing). "Delete all my data" removes the choice too.

**Automatic nudges** (Library → **Automatic nudges**; `src/lib/nudges.ts`, `worker/nudges.ts`, `coach-nudges.tsx`; `GET`/`PUT /api/coach/nudges`; tables from migration `0029`). Four rules per whop, each with a switch, a number of days (2–30) and the message members get: **No check-in** (9 days), **No food logged** (3), **No weigh-in** (4), **No workout** (5 days since a finished one). The cron checks each whop with a rule on once a day, every 15 minutes between 17:00 and 19:45 UTC until it's done: its current members from Whop who share their progress, not paused today and not nudged today. A rule is due once that many whole days have passed since they last did it (or since they started sharing, so new sharers aren't nudged about the time before); the first due rule in that order goes out as a Whop notification titled "From your coach", one request per community for everyone getting the same message. Each gap gets one nudge (`coach_nudges_sent` keeps the day it was about), so a member who stops logging food hears about it once, not daily. **Sent lately** lists the last 50; each also shows on the member's **Timeline**. "Delete all my data" removes a member's nudge records.

**Assign programs and habits** (dashboard → **Assign programs & habits**; `src/lib/assignments.ts`, `worker/assignments.ts`, `coach-assign.tsx`, `assignment-cards.tsx`; tables from migration `0014`). Send a **training program** (start from a template or build one in the same editor members use — library exercises only, so it works in every member's app — and, by default, a **schedule**: start date, training days and weeks, with a summary like "24 workouts · Oct 12 – Nov 22"; it appears on the member's Program calendar with the note) or a **habit set** (starting from the scorecard's seven) to **everyone**, a **saved group**, or **one member**, with an optional note. Members get a Whop notification (one request per community, many members at once) and a card on Today: **Add to my training** adds the program as their active one (id `coach_…`, so using it twice doesn't duplicate it; a member with 8 programs is asked to delete one first) and **Use these habits** replaces their daily list (past ticks and streaks stay); or **Not now**. **Your programs** (`coach_programs`, migration `0015`): "Save to my programs" keeps a program you build (with its usual training days and weeks, not dates) for reuse; it then appears at the top of the program step — one tap loads it with its schedule pre-filled, "Save changes" updates it, "Save as new" keeps a variation, and it can be deleted. Saved per whop, so every admin sees the same list; up to 50. Days still being built are kept; a program needs at least one exercise to save. The **Sent** list shows "3 of 12 used it · 1 not now · 8 waiting" and can cancel one (members who haven't answered stop seeing it). **Groups** are named lists of members, saved per whop. Only people Whop lists as current members are ever sent anything. Assigning doesn't read member data, so it doesn't need them to share. "Delete all my data" removes a member's assignment records.

**Edit a member's program** (a member's page → **Training program**; `src/lib/program-edits.ts`, `worker/program-edits.ts`, `coach-member-program.tsx`; table from migration `0017`). Shows every program the member has (active one first) with its days and exercises; **Edit program** opens the same editor, and **Save changes** stores the edit. Needs the member to be sharing (Coach access on), like seeing their progress. The coach never writes into the member's plan directly — the member's app saves its whole plan in one piece, so a direct write could be overwritten. Instead the edit waits in `coach_program_edits` (one per member and program; saving again replaces it), the member gets a Whop notification, and their app applies it the next time it opens ("Your coach updated your program “Upper / Lower”", above whichever tab is open) and confirms it to the server only after a plan save that includes it, so closing the app straight away can't lose it. Name, days and exercises can change; its id and whether it's active stay. **Calendar**: under the program's name the coach sees its Program calendar exactly as the member does, read-only (every workout by date with done, moved, missed or planned from their logs, progress, the note, today's line, and a tap on a day for its exercises). **Change dates** edits the start date, weeks, training days and note (with the "32 workouts · Oct 19 – Dec 13" summary), **Take off the calendar** removes it, and a program without dates gets **Put on the calendar**. Dates travel with the edit (`dates` on the PUT: the calendar, or null to remove it; an edit without it keeps the member's), so they reach the app the same way. For a program from a challenge, the dashboard notes that the leaderboard keeps the challenge's own dates. **Program blocks** (`coach-next-block.tsx`, `blockToActivate`/`nextBlock` in `src/lib/program-schedule.ts`): under a program on a calendar, **Next block** shows what's queued after it, or **Queue the next block**: pick one of the member's other programs (it gets dates from the day after this one ends, as a program edit) or one of your saved programs (sent to them as a program with those dates), with training days, weeks and a note. When the active program's calendar has finished, the member's app makes the program whose calendar runs today active and says so ("Your last program finished. Your next one, “Strength Block”, is now your active program."); a program sent with a later start while the current one is still running waits instead of taking over. A member's own program without dates is never switched away from. New exercises come from the library; the member's own exercises already in it can stay. Until it's applied, the dashboard shows the edited version with "Your changes from Oct 10 reach Dev's app next time they open it." "Delete all my data" removes a member's waiting edits.

- **At a glance:** members, how many logged in the last 3 days, how many need attention, and the average scorecard this week.
- **Member list**, sorted so the people who need you come first, with filters for *Behind plan* (from the same adaptive analysis the member sees), *Red Zone* (scorecard under 60% this week), *No logs 3+ days* and *No plan*, plus search.
- **Member detail:** weight vs plan (chart, actual vs planned rate per week, goal), the Streaks & consistency card, daily food totals for the last week, and recent weigh-ins. `?member=user_…` opens a member directly.
- **Member Training tab sections** (`coach-dashboard.tsx`): a switcher at the top, **Lift progress** (Strength trends by muscle group; opens first) · **Workout log** · **Sets per muscle** · **Program & calendar** (the Training program card with its calendar and next block, then Program focus), so nothing needs long scrolling. Workouts load once and stay loaded while switching; **Assign program** in the member header opens Program & calendar.
- **Member workouts** (`coach-member-workouts.tsx`, `GET /api/coach/member-workouts`, `coachMemberWorkouts` in `worker/program-edits.ts`): under the member's program, Strength trends, then a **Workout log** of their newest 500 workouts (finished and in progress): name, date, sets, volume and duration; tap one for every exercise's sets ("245 × 7 (2 left)") and its note; tap an exercise (in the log or the chart's list) for its own page with best est. 1RM, heaviest, sessions, the Best weight / Volume / Sets / Every set / Est. 1RM chart and full history. Read-only, and only while the member shares their progress with the coach, like their program.
- **Layout** (`coach-dashboard.tsx`, `coach-today.tsx`): four sections, one job each, in a side menu on a computer and a bottom bar on phones. **Today** is only what needs the coach: a greeting ("Good morning, Coach", how many share and need you today), the *Reply to check-ins*, *Reach out* and *Celebrate* lists and this week's numbers; on phones, three counts, a *Needs you · At risk · All* switch and a card per member. **Inbox** (`CoachInbox`) is the check-ins waiting for a reply, oldest first: the list beside the open check-in, with the member's week in one line, their flags and health score, *Open profile*, *Skip for now*, the AI draft and voice reply; **Send & next** replies and opens the next one (on phones the list and the check-in take turns). **Members** is the full-width table (member with tags and flags, health score, week %, weight change a week, last log, check-in status) with quick filters *All · At risk · Check-ins to review · On track*, the other flags in a menu, search (in the header on a computer), sort and tags; a member opens as their own page: a header with their flags and *Reply to check-in*, *Set macros*, *Assign program*, *Add note* and *Stop viewing*, tabs **Overview**, **Timeline**, **Check-ins**, **Nutrition**, **Training** and **Body**, and their notes and tags beside it on a computer (under it on a phone). **Library** holds *Programs & habits* (assign programs and habit sets) and *Wins & testimonials*, with the photo storage meter. The header has *Find a member*, lb / kg and refresh.
- **Flags** (`src/lib/coach.ts`): the reasons a member needs a look: *Check-in to review*, *Behind plan*, *Habits slipping* (Red Zone), *No weigh-in 4+ days*, *No workouts this week* (only for members who trained in the last 30 days), *Strength slipping* (a lift whose estimated max fell more than 2% over six weeks; the member page names the lifts, from ten weeks of finished workouts the overview now reads), *No check-in this week*, *No logs*, *No plan*; paused members aren't flagged for missing logs. Each reason is also a filter. The overview now carries each sharing member's workout days (30 days) and latest check-ins.
- **Health score** (`healthScore` in `src/lib/coach.ts`): one 0–100 number per member: logging (days with any log in the last 7, 40 points), adherence (this week's habit scorecard, 35; logging again for members without habits) and trend vs plan (25: on track 25, collecting or settling 18, ahead 15, behind 8, no weigh-ins 5, no plan 12). Green 75+, yellow 50–74, red under 50. Shown on every member row and, with its breakdown, on the member's page; **Sort** the list by most urgent, health score (lowest first) or name. Paused members have no score.
- **Coach notes** (`GET/PUT /api/coach/notes`, `coach_notes`): a private note per member on their page; only the whop's admins see it.
- **Weekly check-ins** (`src/lib/checkins.ts`, `worker/coaching.ts`, `checkins`): members send one a week from **Progress → Check-in**: energy, hunger, sleep, stress and training from 1 to 5, wins, struggles and a question. The server fills in the 7 days' numbers from their logs (average weight and the change from the week before, weigh-ins, workouts, average steps, food, habit score, photos), shown as a preview first. The coach reads them on the member's page and replies; the member gets a Whop notification and sees the reply in the app. Sending again the same week replaces it until the coach has replied.
- **Voice replies** (`voice-reply.tsx`, `worker/voice-replies.ts`, migration `0021`): under a check-in, **Record** up to 30 seconds in the browser (MediaRecorder; mp4 on Safari, webm elsewhere), or **Upload a voice memo** when Whop's dashboard blocks the microphone. The clip goes to the PHOTOS bucket under `voice/<member>/…` (no public URL; a new one replaces the old), counts as the reply (the member is notified) and a written reply can follow. Both sides play it by fetching it with their sign-in and playing it from memory (an `<audio src>` request wouldn't carry the app token on iPhone). Over 30 s, over 2 MB or non-audio files are refused; "Delete all my data" removes them.
- **Set macros** (`src/lib/coach-macros.ts`, `coach_macros`, `GET /api/my-macros`): the coach enters protein, carbs and fat (calories follow at 4 / 4 / 9) and an optional note; the member is notified and, while set, those are every day's targets in the Food log, Today, the calorie and protein habits and the scorecard (`dayTargetFinder`'s `coachMacros`), with a banner on Plan → Macros and Roadmap. *Back to their plan* clears them.
- **Challenges** (`src/lib/challenges.ts`, `challenge_entrants`, `assignments.challenge`): in Assign, a scheduled program can be sent with *Make it a challenge*. Members get a *Join challenge* invite; joining adds the program and puts them (Whop name and photo) on its leaderboard, ranked by finished workouts from that program between its start and end dates (ties share a rank). Members see it under **Ranks → Challenges**; the coach opens it from the Sent list.
- **Progress report** (`src/lib/progress-report.ts`, `progress-report.tsx`, `GET /api/report`, `GET /api/coach/report`): one page of before and after from the member's whole history, laid out for a screenshot or testimonial: start, latest and change in weight with a weekly-average line, lowest and goal; before and after photos (the earliest and latest of the same pose, front first); measurements at the start and now; up to six lifts' estimated 1RM from first to best (main lifts first); weeks, workouts and check-ins. Coaches open it with **Progress report** on a member's page (only while the member shares their progress; photos only if they share photos too) and can **Send** it, which notifies the member. Members open **My progress report** under Progress → Check-in at any time.
- **Member tags** (`src/lib/member-tags.ts`, `member-tags.tsx`, `coach_tags` / `member_tags`): each whop starts with Competitor, Lifestyle, Injured, VIP and Inactive; coaches rename, recolour, add (up to 20) and delete them under **Edit tags** on any member's page, and tap tags on or off per member. Tags show on member rows, filter the list (*Tags:* chips with counts) and are an audience in Assign (*A tag*: everyone with it right now). Only the whop's admins see tags; deleting one removes it from everyone.

**Who can see what** (`worker/coach.ts`, `GET /api/coach/overview?company=biz_…`): the viewer must have a verified Whop token *and* be an `admin` of that company — checked with Whop's access API on every load. The members shown are that company's current members according to Whop's member list (which also supplies names and avatars, not stored); nobody else's data is ever returned. History is limited to 4 months of weigh-ins, 3 months of habits and 2 weeks of daily food totals (no individual foods, no self-audit notes, no saved foods). Members are told in the Progress tab and the privacy policy.

**Whop setup:** in the app's settings in Whop's developer dashboard, set the **Dashboard path** to `/dashboard/[companyId]` and add the **`member:basic:read`** permission (approve the update in your whop). Then open the app from your whop's dashboard.

- **Safety flags** (`src/lib/coach.ts`): *Losing too fast* when the plan analysis's observed rate is over 1.25% of body weight a week, and *Eating under the minimum* when 3 of the last 7 logged days are under the plan's intake floor (8 kcal per lb, at least 1,200; days under 500 kcal look unfinished and don't count). Both sort above everything else, and show in the Reach out list like the other flags.
- **Celebrate** (`coach-today.tsx`): the third Today list, members with a milestone in the last 7 days ("Down 10 lb since starting · Waist down 1 in"), from the overview's `milestones`.
- **Member timeline** (`coach-member-timeline.tsx`, `src/lib/member-timeline.ts`, `worker/member-timeline.ts`, `GET /api/coach/member-timeline`): a member's **Timeline** tab is one feed to skim before a call, newest first and grouped by day: a line a week for weigh-ins (count, average, change on the week before) plus any weigh-in notes, check-ins (ratings, wins, struggles, question) and your replies (written or voice), your notes, programs and habits you sent and whether they took them, program edits (applied or waiting), macros you set, milestones, measurements with changes, finished workouts (sets and volume, both sides of one-side sets) and progress photo days (only if they share photos). Filters *All · Check-ins · Body · Training · Your actions*; 90 days, then *Show older* for 180 days and a year. Same admin, membership and sharing checks as the other member routes.
- **Weekly weigh-ins vs calories for coaches** (`coach-member-food.tsx`, `worker/member-food.ts`, `GET /api/coach/member-food`): on a member's Food tab, the same chart members have, from 26 weeks of daily totals loaded for that one member (the overview still carries only two weeks of food for everyone). Totals only; same admin, membership and sharing checks as the other member routes.

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
| Goal not reached within the 156-week cap (a slow rate on a big goal) | warning |
| Prep longer than 52 weeks (plan a diet break) | info |
| Schedule does not total 7 days | danger |
| Medium days cannot balance the schedule | danger |
| Low-day carbs below 30g | warning |
| Protein below 0.8 g/lb | warning |
| Weekly calories drifted >2% from target | warning |

## State persistence

State is kept in local React state and mirrored two ways:

- **LocalStorage** — a returning user lands back on their last setup.
- **URL query string** — a coach can send a client a link that opens pre-filled. Use the **Share** button in the header. A query only counts as a plan when it carries plan keys (`decodeStateFromQuery`); a link with just a tab (`?t=checkin`) or someone else's parameters opens that tab on the saved plan (`tabFromQuery`) instead of replacing it with defaults.

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

**Sign-in on the Whop iPhone app.** Whop's proxy is meant to attach the signed `x-whop-user-token` to every request, but the Whop iPhone app only attaches it to the page load, not to the page's own `fetch()` calls, so the API saw a signed-out member and everything logged there stayed on the phone. The Worker therefore verifies the token on the page load and writes it into the page (`<meta name="app-user-token">`, `servePageWithToken` in `worker/auth.ts`; that page is served `private, no-store`, never as a 304), and `src/lib/whop-token.ts` sends it back on same-origin `/api/` calls as `x-app-user-token`. It's the same Whop-signed JWT, verified the same way (issuer, audience = this app, ES256), so it grants nothing a proxied request doesn't; when the proxy's own header is present it wins. Only a token that verifies is ever written into a page.

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
