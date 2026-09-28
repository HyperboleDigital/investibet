# Investibet — CTO Execution Plan
**How to build a sportsbook-grade experience, solo, in weeks, without reinventing anything.**
Companion to the master plan and MVP spec. This doc covers the how: architecture, tooling, the interaction inventory, the design process, and the build order.

---

## 1. The CTO's framing

The product thesis is psychological, not technical: every interaction a bettor already has muscle memory for, we replicate, and we swap what the money does. So the engineering priority order is:

1. **Feel** (latency, motion, feedback): a sportsbook that lags is dead. Every tap answers in under 100ms, every state change animates, every result has a reveal.
2. **Trust** (nothing ever looks wrong with money): stakes, odds, points, and portfolio numbers are always consistent, always explainable, never surprising.
3. **Speed to learn**: instrument everything so the beta answers questions with data.
4. Everything else.

We are not building a fintech backend. We are building a game client on top of two vendors (odds, brokerage) and a database. Treat it that way.

---

## 2. Architecture (one screen)

```
[PWA client: React + Vite + TS]  <-- Supabase Realtime (live pot share, leaderboard, game state)
        |                                        |
        v                                        v
[Supabase: Postgres, Auth, RLS, Storage]  <--> [Node service on Railway: settlement, odds ingest, SnapTrade, payouts]
                                                 |            |              |
                                          [The Odds API] [SnapTrade API] [n8n on Railway: notifications]
                                                                                |
                                                                     [Resend email / Twilio SMS / Web Push]
[PostHog: events + session replay]   [Sentry: errors]
```

**Why this shape:** it is the agent-platform stack you already run (pnpm monorepo, Supabase, Railway, n8n). Zero new infrastructure to learn. Supabase Realtime is the one addition and it is the feature that makes the pot share and leaderboard feel alive.

**Monorepo:** `investibet/` with `apps/web` (PWA), `services/engine` (Node: ingest, settlement, integrations), `packages/core` (pure TypeScript: odds math, points math, streak logic, counterfactual math, all unit-tested, zero dependencies). The core package is the asset: when you go native later, it moves unchanged.

**PWA now, native later, on purpose.** A PWA ships without app review (no fight over the word "bet"), installs to the home screen, and iOS has supported web push for installed PWAs since 16.4. Native (Expo / React Native) comes after the beta proves the loop, reusing `packages/core` and the design tokens. Do not start in React Native to save a rewrite; you would pay the learning cost during the one month you cannot afford it.

---

## 3. The stack, tool by tool (chosen for speed and feel)

**Client**
- React 18 + Vite + TypeScript, Tailwind, shadcn/ui for primitives (bottom sheets, tabs, toasts)
- **Motion (framer-motion)**: every micro-animation. Layout animations for leaderboard reordering, `AnimatePresence` for reveals, spring physics on the slip drawer
- **Vaul**: the bottom-sheet slip drawer. This is the single most important component; sportsbooks live in that drawer
- **Lottie (lottie-react)**: the win reveal, streak flame states, milestone celebrations. Buy or commission 4 to 6 files (see section 6)
- **react-countup / motion number**: rolling numbers for points, cashback, pot share, the counterfactual. Numbers that roll feel like winnings; numbers that snap feel like spreadsheets
- **canvas-confetti**: used ONLY on streak milestones and invested milestones ($100, $500, $1,000 invested). Never on pick placement or frequency. This is the Massachusetts line in code
- **Howler.js**: 3 sounds total: lock, win, streak. Off by default on web, on by default in the native app later. Sportsbooks are silent on web too
- **Vibration API**: haptic tick on lock and reveal where supported (Android; iOS limited)
- **vite-plugin-pwa**: installable, offline shell, web push
- **html-to-image**: generates the shareable recap and reveal cards client-side

**Backend and data**
- Supabase: Postgres with RLS (users see only their rows), Auth magic link, Realtime channels for `pool_share`, `leaderboard`, `game_state`, Storage for share cards, `pg_cron` for scheduled jobs if you want to skip a separate scheduler
- Node service on Railway: odds ingest (cached, once daily per league), scores poller (every 5 min during live windows), settlement (idempotent, replayable), SnapTrade integration, payout batch
- n8n: notification workflows (Thursday lines-up, Sunday results, Monday buy confirmation, weekly recap). You already run it; keep notification logic out of the app code
- Resend (email), Twilio (SMS), web push via VAPID

**Vendors**
- The Odds API: lines and scores. Lock odds at pick time onto the pick row
- SnapTrade: connections, order placement (Webull, Public, Moomoo), holdings for portfolio value. Sandbox first with Alpaca Paper
- Stock lines: computed once from free historical data (Yahoo/Stooq CSVs) into a static `stock_lines` table. No live market data needed in v1; portfolio value comes from SnapTrade holdings

**Observability (non-negotiable from day one)**
- PostHog: events + session replay + funnels. Session replay is how you watch a friend hesitate on the slip without asking them
- Sentry: errors with user context
- A `settlement_runs` table: every settlement logged, replayable, so a wrong score feed never corrupts points permanently

---

## 4. The interaction inventory (what we are replicating, exactly)

Study these in Mobbin (it has full recorded flows for DraftKings, FanDuel, PrizePicks, Underdog, Robinhood) before designing a single screen. Do not guess what a sportsbook feels like; watch the recordings. Then build this list.

| # | Moment | Sportsbook pattern | Investibet version | Component |
|---|---|---|---|---|
| 1 | Scanning the board | Tap an odds pill, it fills, slip badge bounces +1 | Same, plus the stock line shows under the pill once selected | Motion layout + badge spring |
| 2 | Opening the slip | Bottom sheet slides up with spring, stake keypad | Same sheet; stake slider + keypad; win/lose/5-year numbers roll as stake changes | Vaul + countup |
| 3 | Choosing the stock | (no equivalent) | Odds-board-styled list: name, tag, line in green, worst drop in muted. Selected row highlights | List with layout animation |
| 4 | Locking the pick | Button press, haptic, "Bet placed" stamp, slip badge clears | Button press, haptic, "Locked" stamp, then "Buys NVDA at Monday open" line settles in | Motion + vibration |
| 5 | Waiting | "Open bets" tab with live score chips, pulsing "LIVE" | "Live picks" tab, live scores, pulse; portfolio value visible alongside | Realtime channel |
| 6 | The reveal (win) | Slip flips green, cash-out amount animates, sometimes confetti | 1.2s suspense (card shimmer, odds visible), then flip, points roll up, streak flame grows one state, Gold cashback rolls in second. Confetti ONLY if a streak milestone hit | Lottie + countup + AnimatePresence |
| 7 | The reveal (loss) | Slip turns red, dismissed | Gentle grey settle, then a card slides in: "Sportsbook timeline: -$20. Yours: you own $20 of NVDA." Streak flame dims, does not shatter | Motion slide-in |
| 8 | Leaderboard | Rank list, your row pinned | Rank list with layout animation on reorder, your row pinned, live pot share rolling | Realtime + layout animation |
| 9 | Pot ticker | (bonus balance) | "You hold 4.2% of $100" updating live all weekend | Realtime + countup |
| 10 | Monday buy confirmation | (none) | Push/SMS: "Your $20 bought 0.11 NVDA at $182.40." Tap opens portfolio | n8n + web push |
| 11 | Home / counterfactual | Balance + promos | Two timelines, exact numbers, rolling on every visit; 1/5/10-year ladder | Countup + chart |
| 12 | Share | Screenshot culture | One-tap recap card (win reveal, monthly recap, season recap) rendered to image | html-to-image |
| 13 | Streak states | Streak badge | Flame with 4 states: none, warm (2), hot (3, 1.5x), blazing (5, 2x) | Lottie |
| 14 | Empty states | "No bets yet" | "Lines drop Thursday" with countdown; counterfactual still live | Motion |

**Motion rules (write these into the design tokens):** durations 120ms (feedback), 240ms (transitions), 600 to 1200ms (reveals only). Springs for physical things (drawer, badges), ease-out for everything else. Reduced-motion respected. Nothing animates on the money-in path except confirmation feedback; all the drama lives on the money-out and results path.

---

## 5. Design process (the fast version)

**Day 0 to 2: study, then wireframe**
- Mobbin: record notes on DraftKings, PrizePicks, Underdog, and Robinhood flows for the 14 moments above. Screenshot the best version of each moment into a Figma reference board
- Wireframe the 6 core screens in Reloom or straight in Figma: Board, Slip, Stock picker, Live picks, Reveal, Home/counterfactual
- Use the frontend-design skill in Claude (and Claude Design for polished mockups) to generate first-pass UI in your dark palette. You already have a working visual language from the deck: midnight background, mint for gains, coral for the sportsbook timeline, gold for streaks. Keep it
- FDC (your father) does the brand mark and the share-card templates. Brand is where an award-winning design house is a real advantage over every other side project

**Day 3 onward: component-first build**
- Build the design tokens and 8 components before any screen: OddsPill, StakeSlider, StockRow, SlipSheet, PickCard (pending / live / won / lost states), StreakFlame, RollingNumber, LeaderRow
- Every component gets its states in a Storybook-lite page (`/dev/components`) so you can review motion on your phone without navigating the app
- Screens are then assembly, not design

**Rule for Claude Code sessions:** open with the project handoff, MVP spec, this doc, and the component page. Build one component or one job per session, stop for review, full-file handoffs.

---

## 6. Assets and small spends that buy a lot of feel

- Lottie files: win reveal, 4 flame states, milestone burst. LottieFiles marketplace has usable ones for $0 to $30 each; a commissioned set from a motion designer runs $300 to $800 and is worth it after the beta proves the loop
- Sounds: 3 files from a royalty-free library, $0 to $20
- Fonts: one tabular-figure numeric font (numbers must not jitter when they roll). Inter or JetBrains Mono for numbers is free
- Icons: Tabler or Lucide, free

Total: under $100 for beta.

---

## 7. Engineering disciplines that matter for a money-adjacent game

- **Idempotent settlement.** A settlement run can be replayed safely. Points are derived from pick rows plus results, never mutated by hand. If a score feed is wrong, fix the result row and re-run; points recompute
- **Odds locked on the pick row.** Never join back to a live odds table for scoring
- **`packages/core` is pure and tested.** Vitest on odds conversion, points, streak multipliers, best-15 selection, pro-rata pot split, counterfactual ledger. These tests are the spec
- **RLS on by default.** A user can never read another user's picks or connection data. Leaderboards read from a view that exposes only display name, points, rank
- **Secrets in Railway/Supabase vaults**, SnapTrade user secrets encrypted at rest, no brokerage credentials ever touch your servers (SnapTrade's portal handles the login)
- **Feature flags** (a `flags` table is enough): cashback, parlays, streak survivor, SnapTrade lane. Ship dark, flip in the beta when ready
- **One Playwright happy path**: login, pick, lock, settle (with a mocked score), see reveal. Runs on every deploy

---

## 8. Build order (aligned to the master plan's weeks)

**Week 1: rails.** Monorepo, Supabase schema and RLS, magic link, odds and scores ingest into `games`, `stock_lines` seeded, `packages/core` math with tests, `/dev/components` page with tokens and the 8 components in their states.

**Week 2: the loop.** Board, Slip, Stock picker, Lock (writes pick with locked odds), Live picks tab with Realtime, settlement job, Leaderboard with pot share. Checkpoint: Owen locks a real pick and is auto-scored.

**Week 3: the feel.** Reveal and loss screens with Lottie and rolling numbers, counterfactual home, share cards, notifications via n8n, PostHog and Sentry wired, SnapTrade connect and order placement behind a flag (fallback: "log your buy" with screenshot upload). Two-friend soft test.

**Week 4: ship.** Fixes, invite flow, onboarding call, Season 1 opens Oct 1.

**After the gate (Dec onward):** Gold and Stripe, payouts via a payout API, parlays, Streak Survivor, season ranks, then Expo native app reusing `packages/core` and tokens, with push and haptics done properly.

---

## 9. What I would refuse to build in month one (CTO veto list)

- A custom odds engine, a custom KYC flow, any custody, a native app, a referral system, an admin dashboard beyond a Supabase table view, real payments, or a second sport beyond what the slate needs. Every one of these is a week you do not have and a question the beta does not ask.

---

## 10. The one-sentence summary for the next Claude Code session

Build a fast, dark, spring-animated PWA game client on Supabase and a small Node service, replicate the 14 sportsbook moments from the inventory with motion and rolling numbers, keep all money math in a tested core package, instrument everything, and let the beta tell us what to build next.
