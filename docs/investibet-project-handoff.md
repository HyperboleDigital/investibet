# Investibet — Project Handoff (start every new session here)

**Read this first, then the doc index below. Do not relitigate locked decisions.**

## What this is

Investibet: sports picks where the stake buys stock you keep. Losing loses nothing (money is already invested in the user's own brokerage account). Winning pays points and, for Gold, cash.

**Mission filter for every feature and decision:** does this move money out of the gambling loop and into ownership? If no, cut it.

**One-liner:** The only betting app where losing the bet still builds wealth.

**Founder context:** Owen Ferreira. This is a side project. Primary focus is Hyperbole Digital (agency + agent platform, $10k MRR goal). Sales actions precede build actions every week. Investibet gets nights-and-weekends energy until the beta proves retention.

## Doc index (project knowledge)

1. **investibet-executive-summary.md** — the what and why. Problem, solution loop, mechanics, revenue, roadmap. Notion-ready. Share this with investors or advisors.
2. **investibet-master-plan.md** — the plan. Gotchas we missed (market closed on weekends: buys queue to next open), MVP must/should/won't, the Sept sprint, friends beta playbook, costs, bootstrapping, legal/IP status, seed path, exit options, weekly checklist.
3. **investibet-cto-plan.md** — the technical and design execution plan. Architecture, stack choices, the 14-moment sportsbook interaction inventory, motion rules, design process, engineering disciplines, build order, CTO veto list.
4. **investibet-mvp-handoff.md** — the how. Full build spec: locked decisions, core loop, reward economy, points/tiers/leaderboards spec, counterfactual engine spec, Streak Survivor, whale rules, scale notes, build phases, data model, legal checklist.
5. **Investibet-Pitch-Deck.pptx** — 12-slide investor deck (dark theme). Slightly behind the docs: still shows the older bonus-shares model on some slides. Rebuild from the exec summary before any real pitch.
6. **Research artifacts (in past chats):** brokerage affiliate program reference (bounty terms, windows, incentivized-traffic compliance) and the dopamine/revenue playbook (Robinhood, PrizePicks, Duolingo, DraftKings mechanics + Massachusetts regulatory lines).

## Locked decisions (do not reopen without Owen)

- **No custody, no Alpaca.** Users' own brokerage accounts. Custody is revisited only at ~100k users as a revenue upgrade, never for safety.
- **Brokers: Webull (primary), Public, Moomoo** via SnapTrade trade placement. Robinhood scrapped for v1 (SnapTrade read-only there). Supported brokers are deliberately the same ones that pay affiliate bounties.
- **Rewards are cash via payout rails, never stock delivery.** Delivering stock into third-party brokerages is impossible. Stop trying.
- **Free tier plays the entire game** (all picks, parlays, streaks, pot eligibility). Gold ($9/mo) is the only tier with per-pick cashback: 5% of would-be profit, capped $25/mo. Free win screens show foregone Gold earnings.
- **Points = the American odds** of a won pick, flat-$100 basis, stake-independent (+170 = 170 pts, -200 = 50 pts, parlay = combined multiplier x 100). Best 15 picks/week count. Streaks multiply (3 = 1.5x, 5 = 2x). Losses = 0 points, never negative.
- **Two leaderboard tracks:** monthly points race feeds the pot (60% pro-rata weighted, 40% top-10; Gold 2x weighting affects pot share only, NEVER rank). Season rank Bronze→Diamond, climbs only, permanent badges. Plus Streak Survivor mode (longest streak of month wins fixed prize, one live pick at a time) and per-sport badges.
- **Solvency rule:** reward caps + pot = fixed % of trailing revenue. No jackpot drawings, no chance reveals, no mystery boxes (Massachusetts fined Robinhood $7.5M for those). Celebrate money invested and streaks kept, never pick frequency.
- **No fees on withdrawal ever;** $0.99 for instant only. Winnings default to "roll into next pick" (reimbursed against next verified buy); credit can never strand (partial use fine, 30-day auto-payout).
- **App never recommends stocks.** Stock browser shows each ticker's "line" (10-yr avg return + worst drop + personality tag), searchable, never ranked by return, disclaimers always.
- **The crown jewel feature:** exact loss-counterfactual. Per-pick, compute the sportsbook-timeline outcome from real odds and results, to the cent. Show on home screen, EVERY loss screen, monthly/season recap cards, with 1/5/10-yr projections (disclosed assumptions).

## Revenue stack

Gold subs ($9/mo) + broker bounties ($20-70 per new funded account; written rewarded-traffic approval required before sending traffic) + $0.99 instant cashout. Later: sponsored boost weeks, streak freezes, gift-card margin, B2B responsible-gaming licensing.

## Current status + next physical-world actions

- Planning complete. Nothing built yet.
- [ ] SnapTrade account + sandbox keys; day-one test: Webull trade-PIN order placement + trading tier pricing
- [ ] Text the group chat: 15-20 friends committed to a 6-week beta season (8 verbal commits before Phase 2 build starts — Owen's own sales-before-build rule)
- [ ] Apply to affiliate programs (Webull via Awin/CJ, Moomoo) WITH written disclosure of the rewarded-traffic model
- [ ] Fintech attorney (few hours): contest rules page, Gold-pot vs paid-entry state laws, tax rails
- [ ] Rebuild pitch deck from exec summary when a real pitch is scheduled (include prediction-market positioning: exchange-side economics, no-loss moat vs Kalshi/Robinhood)

## Working style (match this)

- Direct, opinionated recommendations with a pick called out; options in twos and threes
- Scannable bullets over prose docs; ready-to-use deliverables
- No em dashes in copy. Plain-spoken, bold claims backed by proof (Hyperbole voice)
- Flag conflicts with locked decisions instead of silently complying; keep prior context active without re-litigating
- Full-file code handoffs, phase checkpoints, migration-first
- Beta metrics that matter: 80%+ weekly active pickers, 3+ picks/user/week, week-6 vs week-1 retention. Phase 0 answers the only open question: retention. Everything else is execution.

## Competitive context (Sept 2026): prediction markets are the new top dogs

- Kalshi ($22B, ~$31B/month volume, ~65-89% sports) and Polymarket ($15B) now move 3x the monthly handle of all legal US sportsbooks. Kalshi is valued at ~20x revenue as an EXCHANGE; DraftKings at ~3x as a BOOKMAKER. Revenue model determines multiple. Investibet is on the exchange side of that line: we never hold the other side of a pick. Lead with it.
- Their legal position ("event contracts, not bets") is under heavy state attack (Kentucky suit, Arizona criminal charges, Massachusetts and Nevada bans on sports markets) because users still lose their stake. Ours is structurally different: nobody loses their stake. Do not borrow their framing; ours is stronger.
- Robinhood now owns a CFTC exchange: "bet inside your brokerage" is coming to every brokerage app. It still loses stakes. Our moat = no-loss structure + mission. First sentence of every pitch.
- UX to adopt: show implied probability next to odds on every slip (their users think in %). Distribution lesson: live inside other apps and feeds (embeddable counterfactual data) rather than chasing installs.
- Odds-source option: Kalshi public API market prices as our "lines" (public market data, not bookmaker numbers). Sandbox-test next to The Odds API.
- New acquirer candidates: Kalshi, Polymarket, Robinhood all need a responsible-play story as states close in. Add to exit list.

## Options and advanced trading: NO (locked decision)

- Options are ruled out. They break the core promise ("losing the pick loses nothing") because contracts can expire worthless, they are regulatory poison (Robinhood's options gamification drove its worst scrutiny), broker approval tiers block many users, and SnapTrade options placement is only confirmed on Public, not Webull.
- The design rule that decided it, apply to all future feature ideas: if a feature would make the loss screen say anything other than "you still own this," it is the wrong feature.
- The degen appetite is served instead by an explicit risk ladder in the stock lines board: favorites (index funds) -> value plays (sector ETFs, dividend stocks) -> longshots (volatile single stocks) -> market parlays (2x/3x leveraged ETFs, gated behind a confirmation screen with worst-drop stat shown). Assets that swing hard but never expire.
- Options revisit conditions (parked, not planned): post-custody, post-scale, separately branded "Advanced" mode with appropriateness screening and attorney sign-off. Not this year.
