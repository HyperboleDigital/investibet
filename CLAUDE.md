# Investibet — Claude Code Handover (Sept 28, 2026)

Paste this at the start of every Claude Code session. Read it fully before touching code. Then read `README.md`, `investibet-project-handoff.md`, `investibet-mvp-handoff.md`, `investibet-design-standards.md`.

## What exists and where we are

Monorepo, deployed and running:
- `apps/web` React + Vite + TS PWA on Vercel. Screens: Gate (email magic link), Lines, Picks, Cup (leaderboard + pot), Home, Reveal overlay, Slip sheet, simulated Brokerage sheet.
- `services/engine` Node on Render. Pulls lines from The Odds API (6 US leagues, h2h/spreads/totals) 4x/day, scores every 10 min, simulated fills at next market price (Stooq), settlement, props on demand behind a flag.
- `packages/core` pure math, Vitest, green: implied, profit, basePoints, streakMultiplier, grade, scoreSequence, bestFifteen, potSplit, counterfactualDelta, project, marketOpen. **All money and points math lives here and nowhere else. Add tests for anything new before wiring it.**
- `supabase/migrations/0001_init.sql` schema, RLS, `lock_pick()` RPC, `leaderboard` view, seeded `stock_lines`.

Just fixed (commit these first if not already in main): prices loader used the wrong variable and crashed before lines loaded; line fetch now chunks by 60 games to dodge the 1000-row cap; signup is email only; `mobile-web-app-capable` meta added.

Owen's rules: read the docs first, build one feature per session, stop at each checkpoint for review, full-file handoffs, migration-first (new SQL file per change, never edit 0001). Flag conflicts with locked decisions instead of silently complying.

## Locked decisions (do not reopen)

- No custody. No real orders yet. Brokerage connection stays simulated until told otherwise.
- Free tier plays the entire game. Gold never gates gameplay.
- Points = the American odds hit, stake-independent. Best 15 picks per week. Streaks 3 = 1.5x, 5 = 2x. Losses = 0, never negative.
- Pot: 60% pro-rata by points, 40% top 10. Gold 2x weighting affects pot share only, never rank.
- No chance-based reveals, no mystery boxes, no celebration of pick frequency. Confetti only on streak and invested milestones.
- App never recommends a stock. Lines are shown, never ranked by return. Disclaimer on every projection.
- Options and anything that can expire worthless: never. If a loss screen could say anything other than "you still own this," it is the wrong feature.
- No em dashes in any user-facing copy.

## Vocabulary (apply everywhere, including code comments and DB copy)

You are not betting. You are investing with a pick attached. The words:

| Sportsbook says | We say |
|---|---|
| Bet, wager | **Pick** (noun), **Back** (verb: "Back the Eagles") |
| Bet amount, wager | **Stake** (it buys stock) |
| Place bet | **Lock** |
| Bet slip | **Slip** |
| Parlay | **Stack** (multiple picks, one stake, one stock) |
| Payout, winnings | **Points** (and pot share) |
| Bankroll, balance | **Owned** (portfolio value) |
| Lost | **Missed** (streak resets, stock stays) |
| Cash out | n/a in beta |

Never "bet," "wager," "gamble," "win money," "cash out" in UI. The brand name keeps "bet"; the product copy does not.

## Design standard: Apple HIG, Hard Rock Bet simplicity

Follow `investibet-design-standards.md` exactly. In practice:
- System font only, tabular numerals, 44pt targets, safe areas, Dynamic Type, reduced motion.
- **Icons, not emoji.** Replace every emoji (🔥 flames, trophies) with inline SVG icons. Use SF Symbol shapes: `flame.fill`, `trophy.fill`, `sportscourt`, `football.fill`, `basketball.fill`, `baseball.fill`, `hockey.puck.fill`, `star.fill`, `chart.line.uptrend.xyaxis`, `magnifyingglass`. Build a `<Symbol name="..." />` component with an SVG sprite so icons are one import.
- Sport filter is a horizontal chip row with the sport icon + label, like Hard Rock Bet's top bar. Add a search field above the board (team name, matchup).
- One primary action per screen. The slip is the hero: opens with spring, stake slider dominates, stock choice below, one big Lock button that says exactly what it does.
- Live-updating numbers roll (add `react-countup` or a tiny rolling-number component). Points, pot share, owned value, projections all roll on change.
- Empty states give directions. Errors say what to do.

## Build order (one session each, checkpoint after each)

### 1. Board polish and search
- Sport chips with icons. Search field. Game cards show matchup, kickoff, and the three markets in one card (Hard Rock style: ML / Spread / Total pills side by side per team) instead of a global market switcher. Keep the switcher as a filter if it helps density on mobile.
- Show implied % and points on every pill. Selected pill fills mint, slip badge bounces +1.
- Checkpoint: Owen scans the board on his phone and finds tonight's game in under 5 seconds.

### 2. Stacks (multi-pick slips) and the points preview
- Slip supports 1 to 6 legs. Combined American odds = product of decimal odds, converted back. Points for a Stack = combined odds on the $100 basis (a +600 stack = 600 pts). One stake, one stock, all legs must hit; Flex: if exactly one leg misses, the stack scores 40% of its points and the streak survives (PrizePicks Flex pattern). Put `stackOdds()`, `stackPoints()`, `gradeStack()` in `packages/core` with tests first.
- DB: new migration adds `stacks` table (id, user_id, stake, ticker, odds, status, points, counted) and `picks.stack_id`. `lock_stack()` RPC validates every leg the way `lock_pick()` does. Settlement grades stacks when all legs are final.
- Slip shows, live as you drag the stake: **Points if it hits**, **You keep (always the stake)**, **In 5 years** for the chosen stock, and the sportsbook-equivalent profit in small text ("a sportsbook would pay $34 on this and keep your $20 if it missed").
- Checkpoint: Owen locks a 3-leg Stack, sees its odds, its points, and what stock it buys.

### 3. Share
- Every locked slip and every settled result gets a share card: rendered client-side with `html-to-image`, app tokens, no screenshots. Card shows the picks, odds, points, stock, and the two-timeline line ("Sportsbook would have kept $20. I own $20 of NVDA."). Web Share API on mobile, copy-image fallback on desktop. Also a share link `/s/:slipId` that renders a read-only public version of the slip (new `public_slips` view exposing display name, picks, odds, ticker, status only).
- "Tail this pick": opening a shared slip pre-fills the viewer's own slip with the same legs (they choose their own stake and stock).
- Checkpoint: Owen shares a slip to the group chat and a friend tails it.

### 4. Stocks: favorites, education, projections
- Favorites list per user (`stock_favorites` table). Star icon on every stock row; Favorites tab first in the picker.
- Each stock gets an education card (tap the row's info icon): what it is in one plain sentence (index fund / ETF / single stock / bond fund), its line (10-yr avg return, worst drop), and a projection ladder for **$100 at 1 / 5 / 10 / 20 / 25 years** using compound growth at the disclosed average. Add `project()` cases to core tests for 20 and 25.
- Add a `kind` column to `stock_lines` (etf, index, stock, bond) and a `blurb` column. Seed with plain-English one-liners. Never rank by return, never say "best."
- Checkpoint: Owen picks a favorite from the star list and reads a card for an ETF he did not know.

### 5. Profile and the counterfactual
- New Profile tab replaces Home's stats section. Shows: Owned (live portfolio value), Staked, the sportsbook timeline to the cent, wins/misses/streak, season points, rank tier (Bronze 0 / Silver 100 / Gold 350 / Platinum 800 / Diamond 2000, climbs only), badges, favorites.
- Projection module: current owned value at 1 / 5 / 10 / 20 / 25 years at the blended average of the user's actual holdings, gain frame first, then "a sportsbook would have kept $X." Disclaimer always. Shareable milestone card at $100 / $500 / $1,000 invested.
- Global leaderboard on Cup: month tab (pot race) and season tab (rank tiers). Pinned "your row." Realtime via Supabase channel.
- Checkpoint: Owen's profile tells the whole story in one screen.

### 6. Gold
- Stripe Checkout + Customer Portal, $9/mo, `subscriptions` table synced by webhook (new engine route `/stripe/webhook`). `profiles.tier` = free | gold.
- Gold perks, live: 2x pot weighting (pot share only, rank unchanged), 1 streak freeze per month (auto-applied to the first miss, shown as a shield icon on the streak), unlimited favorites lists, projection ladder to 25 years (free sees to 10), Gold badge on leaderboard.
- Gold pitch appears after 7 days of activity, never before (Duolingo rule). Free users see a foregone-pot-share counter on the Cup: "Gold would hold 6.1% of this pot instead of 3.4%."
- **Win Bonus (per-pick cash) stays behind a flag, off.** Attorney review before it turns on.
- Checkpoint: Owen subscribes in test mode, sees the shield and 2x weighting.

### 7. Dopamine pass
- Reveal: 1.2s suspense shimmer, flip, points roll up, streak flame grows one state (SVG, 4 states), Gold pot-share rolls second. Confetti only on streak 3 / 5 and invested milestones.
- Sounds: lock, win, streak. Off by default on web.
- Haptics on lock and reveal.
- Notifications via web push (VAPID): lines up Thursday, results, Monday "your $20 bought 0.11 NVDA at $182.40," weekly recap.
- Checkpoint: Owen gets a reveal on his phone and screenshots it without being asked.

## Not now
Real brokerage orders, custody, options, native app, referral system, admin dashboard, ads, paid-entry anything.

## Definition of done for this handover
A new user opens the link, enters an email, sees tonight's lines with icons and search, backs a 3-leg Stack with $20 on a favorite ETF, sees exactly the points and the 5-year number before locking, shares the slip to a friend who tails it, and when the games go final both see a reveal, the global leaderboard, and a profile that shows what a sportsbook would have kept versus what they own in 5, 10, 20, and 25 years.
