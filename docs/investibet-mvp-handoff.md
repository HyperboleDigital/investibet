# Investibet Handoff v3 (Consolidated Economy + Build Spec)

**One-line product:** Sports picks where the stake buys stock you keep. Losing loses nothing. Winning pays.
**Mission filter for every feature:** does this move money out of the gambling loop and into ownership?

---

## Locked decisions (do not relitigate without Owen)

- No Alpaca / no custody. Users' own brokerage accounts via SnapTrade.
- Webull-first: SnapTrade supports TRADE PLACEMENT on Webull (trade PIN), Public, Moomoo. Robinhood scrapped for now (read-only via SnapTrade; no manual lane in v1).
- No jackpot drawings, no chance-based reveals, no mystery boxes, no scratch-offs (Massachusetts fined Robinhood $7.5M for exactly this).
- Rewards: cash via payout rails, never stock delivery. Stock delivery to third-party brokerages is impossible; stop trying.
- Free tier plays the ENTIRE game. Gold pays better, never unlocks gameplay.
- Celebrate money invested and streaks kept. Never celebrate pick frequency.
- No em... no fees on withdrawals ever. Fee on SPEED only ($0.99 instant).
- App never recommends specific stocks. Lines are displayed info, never rankings or "hot picks."

---

## The core loop (4 steps)

1. **Pick the game.** Real moneyline odds from The Odds API. Two-tap More/Less style UI (PrizePicks pattern).
2. **Set the stake.** Slider $5-$100. Win/lose/5-year projection numbers update LIVE as slider drags.
3. **Pick what it buys.** Stock browser where every ticker shows its "line": 10-yr avg return + worst drop + personality tag (favorite / longshot / vet). Searchable, alphabetical. Never sorted by return.
4. **Lock the slip.** Order places in-app instantly via SnapTrade (Webull/Public/Moomoo only in v1). Failed or unplaced orders by game time = pick void.

---

## Reward economy

**Per-win cashback (instant dopamine):**
- Rate: 0% (free) / 5% (Gold) of would-be sportsbook profit. Free wins cash from the monthly pot only; Gold wins per-pick cash AND the pot
- Lands in winnings balance the moment the game settles, with animated reveal + suspense beat
- Cap: $25/mo Gold (free tier has no cashback, so no cap needed)
- In-app framing: "$X off your next pick" (profit-boost language bettors know)

**Points (two tracks, same points):**
- Points = the American odds of each won pick (flat-$100 basis), stake-independent
- Streak multipliers: 3 wins = 1.5x, 5 wins = 2x. Loss resets streak only. Flex softener on parlay: miss one leg = keep partial points, streak survives (PrizePicks Flex pattern)
- Streak freeze token: earnable first, Gold perk later (Duolingo pattern)
- **Track 1 Monthly:** resets monthly, feeds the pot. Split: 60% pro-rata by points, 40% top-10 leaderboard
- **Track 2 Season:** accumulates Sep-Feb. Tiers: Bronze / Silver / Gold / Platinum / Diamond. Rank never decreases. End of season: permanent badge + small next-season perk + shareable recap card

**The pot:**
- Fixed monthly amount, funded as a set % of LAST month's actual revenue (subs + bounties). Beta: Owen seeds $100/mo
- Payout to winnings balance

**Winnings balance rules:**
- Roll into next pick (DEFAULT, big button): next verified stock buy triggers reimbursement to their bank, dollar-for-dollar, any purchase size, partial use fine
- Cash out free: 2-3 days (batched ACH)
- Cash out instant: $0.99
- Under $5 rolls to next month; anything idle 30 days auto-pays out. Credit can NEVER strand.
- $600+/yr per user = W-9 + 1099 (use a payout API that handles it: Tremendous / Stripe)

**Loss-counterfactual home screen (the crown jewel):**
- Persistent module: "You've built $X invested, projected ~$Y in 5 yrs. A sportsbook would have kept ~$Z."
- Lead with gain frame, reinforce with avoided-loss frame. Daily/weekly granularity. Updates every pick (Acorns pattern). Disclosed return assumption + past-performance disclaimer ALWAYS.
- Shareable milestone cards (I Am Sober pattern)

---

## Revenue stack

1. Gold $9/mo: the ONLY tier with per-pick cashback (5%, $25 cap), plus streak freezes and 2x pot weighting. Pitch AFTER ~7 days (Duolingo rule). Free win reveals show foregone Gold earnings ("You left $6.80 on the table this month")
2. Broker bounties: Webull primary ($20-70/funded acct, $100 deposit tier, ~30-45 day window), Moomoo secondary ($40). Only NEW accounts pay. Onboarding shows the broker's own free-stock promo as info ("their offer, their terms") - we never promise it
3. Instant-cashout fee $0.99
4. Later: sponsored boost weeks, streak-freeze purchases, gift-card redemption margin, B2B responsible-gaming licensing
5. Payout-screen affiliate button: "Turn your winnings into a new brokerage account" (bounty at highest-intent moment)

**Reward budget rule: monthly caps + pot = fixed % of trailing revenue. Rewards can never outrun income.**

---

## Build phases

**Phase 1 - Rails (checkpoint: Owen review)**
- [ ] SnapTrade account, sandbox keys; verify Webull trade-PIN flow + trading tier pricing FIRST (day-one test)
- [ ] Supabase schema + magic link auth
- [ ] Odds API ingest (NFL + NBA weekly slate)
- [ ] Stock "lines" data: 10-yr avg return + max drawdown per ticker (compute from historical data, cache in Supabase)

**Phase 2 - The loop (checkpoint: Owen review)**
- [ ] 4-step pick flow with live-updating stake slider
- [ ] In-app order placement (Webull sandbox first, then Public/Moomoo)
- [ ] Settlement job: scores ingest, points + streak math, cashback accrual with caps
- [ ] Winnings balance + credit ledger (roll-forward draws, 30-day auto-payout)

**Phase 3 - The feel (checkpoint: friends beta)**
- [ ] Win reveal animation with suspense beat; loss screen shows "you still own $X of [ticker]"
- [ ] Monthly leaderboard + pot split; season points + rank tiers
- [ ] Loss-counterfactual home module + shareable cards
- [ ] Payout screen: 4 buttons (roll / free / instant / open-a-brokerage)

**Data model additions:** users(+season_points, rank_tier, streak, winnings_balance), picks(+ticker, order_id or verified_txn, points, cashback), pool_config, credit_ledger, payouts, stock_lines(ticker, avg_return_10y, max_drawdown)

---

## Beta plan (6-week season, 15-20 friends)

- Owen funds: $100/mo pot + cashback (max exposure ~$75-100/mo with caps). This is user research spend.
- Soft-launch dial available: points + pot only at first, switch on cashback when comfortable
- Metrics: weekly active pickers (80%+), picks/user/week (3+), verification rate (85%+ express lane), week 6 vs week 1 retention, new brokerage accounts opened
- Gate: loop holds -> affiliate applications (disclose rewarded-traffic model IN WRITING, get written approval before sending traffic), fintech attorney (contest rules page, state review for paid-tier pot, W-9/1099 setup), Gold build

## Legal checklist (attorney, few hours, before public launch)
- Contest rules page (skill contest, free entry path, disclosed pot)
- Gold-tier richer pot vs paid-entry contest laws (possible geo-fence 3-5 strict states)
- Rewarded-traffic written approval from each affiliate program
- Projection screen disclosures (Acorns model: disclosed assumption + results-will-vary)
- Tax reporting rails ($600 threshold)

## Open questions (parked)
- SnapTrade trading-tier pricing at scale
- Naming: "Investibet" vs app-store/broker-partner optics of "bet"
- Which % of trailing revenue feeds the pot (start 30-40%?)

---

## Points, leaderboards, tiers (full spec)

**Points currency:**
- POINTS = THE ODDS, literally: a won pick pays its American odds as points on a flat-$100 basis. +170 dog = 170 pts. -200 fav = 50 pts. +450 = 450 pts. Parlay = combined multiplier x 100 (a +600 parlay = 600 pts). Stake size NEVER affects points.
- Streak multipliers: 3 straight = 1.5x, 5 straight = 2x. Parlay: full parlay profit if all legs hit, flex-partial if one misses (streak survives flex)
- Losses = 0 points and streak reset. NEVER negative points. Worst month is zero.

**Monthly leaderboard (money race):**
- Resets on the 1st. Pot split: 60% pro-rata by weighted points, 40% top-10 descending shares
- Gold 2x weighting applies to POT SHARE ONLY. Rank order always uses raw points. Money never buys leaderboard position.

**Season rank (pride race):**
- Raw points accumulate Sep-Feb (Season 1). Tiers: Bronze 0 / Silver 100 / Gold 350 / Platinum 800 / Diamond 2000 (tune in beta, target ~5% Diamond)
- Rank climbs only, never decays. Season end: permanent profile badge + small next-season perk + shareable recap card

**All-time career page:**
- Lifetime points, win rate, biggest parlay, longest streak, badge wall of past season ranks. Never resets.

## Loss-counterfactual engine (the crown jewel, spec)

**The exact calculation (not an estimate):**
- Per pick, compute the sportsbook-timeline outcome from real odds + real result: loss = -stake, win = +profit at locked odds
- Running sum = "sportsbook timeline" balance, exact to the cent, auditable from the user's own pick history
- Actual timeline = live portfolio value (SnapTrade holdings from picks) + winnings balance + pot earnings

**Projections:** current invested total x disclosed historical avg return, shown at 1 / 5 / 10 years. Gain frame first, avoided-loss second, disclaimer always ("hypothetical, based on X% historical avg, results will vary").

**Placements:**
- Home screen: permanent two-timeline module, updates on every pick
- EVERY loss screen: "Sportsbook timeline: -$20. Your timeline: you own $20 of [ticker]." Losses are the product's best proof.
- Monthly + season recap shareable cards
- Gold paywall: "Gold would have paid you $X this month" (foregone-earnings counter on free-tier wins)

**Data:** counterfactual_ledger(user_id, pick_id, sportsbook_delta, running_total); projections computed client-side from portfolio value + cached avg-return assumptions.

---

## Streak Survivor mode (ESPN Streak for the Cash pattern)

- Longest verified-pick streak of the calendar month wins a fixed prize (beta $50, scales with revenue). Loss resets survivor streak to zero (the brutal ESPN reset is the point; base streak-multiplier system is unaffected)
- One live survivor pick at a time (ESPN rule; creates pick-selection drama)
- Every survivor pick is still a normal pick: stake buys stock, points accrue
- Precedent: ESPN ran this free-entry 2008-2017+, paid ~$9M in prizes, monthly prizes $30k-$100k

## Sport badges

- Track points per sport (column already exists on picks)
- Monthly + season awards: Top NBA / NFL / soccer / tennis picker by sport points
- Badges live on the all-time career page badge wall

## Whale rules (fairness, not solvency)

- WE ARE NEVER FINANCIALLY EXPOSED TO STAKE SIZE: stakes buy stock in the user's own account (zero exposure), cashback is capped per user per month, pot is fixed. No custody switch or stake limit needed for safety, ever.
- Whale fairness SOLVED BY DESIGN: points are odds-based and stake-independent, so a $5 player and a $1,000 player earn identical points for identical picks. All leaderboards are pure skill. (Replaces the earlier $100 qualifying-stake cap.)
- Volume exploit plug: only your BEST 15 picks per week count toward points (spray all you want; top slate scores). Doubles as bad-week forgiveness.
- Later if needed: High Roller bracket (separate leaderboard + pot for $100+ average stakes)

## Scale notes

- 10-1,000 users: current stack idles. No changes.
- ~10,000: negotiate SnapTrade per-connected-account pricing (biggest variable cost), upgrade odds API tier, payout ops already contained by batching + $5 minimum + tax automation
- ~100,000: queue settlement jobs, hire support, and REVISIT custody: at this scale float/sweep revenue on balances outweighs compliance cost. Custody is a revenue upgrade earned at scale, never a safety requirement.

---

## Risk ladder + no options (locked)

- NO OPTIONS EVER in this product tier. Contracts that can expire worthless break "losing the pick loses nothing." Rule for all features: if the loss screen could say anything other than "you still own this," reject the feature.
- Stock browser tiers: Favorites (index funds) / Value (sector ETFs, dividends) / Longshots (volatile singles) / Market Parlays (2x-3x leveraged ETFs, confirmation gate + worst-drop stat, keep OUT of friends-beta v1; add behind a flag after week 2 of beta if requested)
- Slip displays implied probability next to American odds (prediction-market fluency): implied % = 100/(odds+100) for positive odds, |odds|/(|odds|+100) for negative
- Odds-source experiment (parked): Kalshi public API market prices as an alternative "lines" source to The Odds API
