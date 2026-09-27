# Investibet

Sports picks where the stake buys stock you keep. Losing loses nothing.

Everything is live except the brokerage order, which is simulated during beta (fake connect, fill at next market price).

```
apps/web         PWA (React + Vite + TS). Login, lines board, slip, picks, cup, home, reveals
services/engine  Node on Railway. Odds ingest, scores, simulated fills, settlement, props on demand
packages/core    Pure math: grading, points, streaks, best-15, pot split, counterfactual. Tested.
supabase/        Schema, RLS, lock_pick() RPC, seed stock lines
```

## Deploy (about 30 minutes)

1. **Supabase**: new project → SQL editor → paste `supabase/migrations/0001_init.sql` → run. Auth → Email → enable magic links. Copy URL, anon key, service key.
2. **The Odds API**: get a key at the-odds-api.com. Free tier is fine for beta (engine pulls 4x/day per sport, ~24 requests/day/sport).
3. **Engine on Railway**: new service from this repo, root `services/engine`, env from `.env.example` (SUPABASE_URL, SUPABASE_SERVICE_KEY, ODDS_API_KEY). Health check `/health`. On first boot it pulls prices and the full slate.
4. **Web on Vercel**: root `apps/web`, build `pnpm --filter @investibet/web build`, output `apps/web/dist`. Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_ENGINE_URL (Railway URL), VITE_ENABLE_PROPS=false.
5. Add the Vercel URL to Supabase Auth → URL configuration → redirect URLs.

## Run locally
```
pnpm install
cp .env.example .env   # fill it in
pnpm test              # core math
pnpm dev:engine        # http://localhost:8787
pnpm dev:web           # http://localhost:5173
```

## Manual jobs
```
curl -X POST $ENGINE/jobs/odds     # pull lines now
curl -X POST $ENGINE/jobs/scores   # pull finals + settle
curl -X POST $ENGINE/jobs/prices   # refresh prices + fill queued buys
```

## Flags
`flags` table: `props` (off by default). Turn on and set VITE_ENABLE_PROPS=true to show player props. Props are pickable today; they settle when a stats feed is wired into `settle()` (moneyline, spread, total settle automatically from the scores feed).

## What ships next (post-gate)
Real SnapTrade connection replacing `brokerage_connections.simulated`, Gold, payouts, parlays, Streak Survivor, native wrapper.
