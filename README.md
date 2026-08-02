# Prep Calculator

Two integrated tools for contest prep and body recomposition planning:

1. **Fat Loss Timeline** — reverse-engineers prep duration (or a required start date) from a safe weekly fat loss rate, with a week-by-week milestone table and projection chart.
2. **Carb Cycling** — builds a weekly high / medium / low carb rotation whose 7-day calorie, protein, carb, and fat totals average out *exactly* to your target.

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
    format.ts               Display formatting
    defaults.ts             Default inputs and schedule presets
    persistence.ts          LocalStorage + URL query state, with sanitisation
    utils.ts                cn() class merger
  components/
    ui/                     shadcn-style Radix primitives
    app-shell.tsx           Tabs, shared state, persistence wiring
    profile-card.tsx        Shared biometrics panel (both tabs)
    fat-loss-calculator.tsx
    carb-cycling-calculator.tsx
    weight-curve-chart.tsx  Recharts weight + body fat curve
    weekly-macro-chart.tsx  Recharts 7-day calorie bars
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

| Setting | Value |
|---|---|
| Build command | `npm run build:static` |
| Build output directory | `out` |
| Framework preset | None |

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

There is no test runner wired into `package.json`. Adding Vitest and porting these cases into `src/lib/*.test.ts` would be the natural next step.

## Disclaimer

Projections are models, not promises. Real weight loss is noisy — water, glycogen, sodium, and menstrual cycles all move the scale more in a day than fat does in a week. Track weekly averages and adjust from actual trend data.

This tool is for general fitness planning and is not medical or nutritional advice.
