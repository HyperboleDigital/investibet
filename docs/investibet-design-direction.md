# Investibet — Design Direction v1 (Sept 28, 2026)

Research-locked visual and product direction for the redesign. Read after the design standards doc. Where this doc and the design standards disagree on look and feel, the standards win; where it disagrees with the MVP handoff on product rules, the handoff wins. Nothing here reopens a locked decision. Two items need Owen's call and are flagged in section 8.

## 1. Research summary

- **Screens reviewed:** 14 (Turf x9: dark board, light board, pre-game ticket card, leaderboard, live picks rules, prize/scoring sheet, settings; Apple Sports odds card; Copilot investments; Acorns portfolio). Refero has no Hard Rock Bet, Kalshi, Polymarket, Robinhood or PrizePicks screens; those came from published teardowns and reviewer descriptions (sources in section 9).
- **Flows reviewed:** 2 (Turf "Live event ticket and team pick", 14 steps; Turf "Live onboarding and ticket CTA", 6 steps).
- **Styles reviewed:** 3 in full (Sandclock, Fey, Rarible), 8 in preview. Refero styles cover marketing pages only, so they inform tokens and discipline, not screen layout.

## 2. The brief

Designing the picks board, slip, owned-stock portfolio, cup and reveal for a friends beta on a mobile PWA. Goal: a bettor with Hard Rock Bet muscle memory picks a side in under 5 seconds and feels the stake turn into stock they own. Tone: midnight command center, calm and exact, with drama reserved for results. Main risk: looking like a generic dark fintech template, or like a sportsbook clone that celebrates the wrong things. Must remember: the ticket. Every lock produces a personal ticket; every result flips it. Constraints: system font only, mint/coral/gold roles fixed, 44pt targets, icons not emoji, no logos, no em dashes, picks-not-bets vocabulary.

## 3. Reference lock

```
Primary reference: Turf (Refero app 250) for board structure, card anatomy, numerals, leaderboard
Token discipline: Sandclock style (near-black canvas, tonal elevation, one green accent, tight headings)
Preserve from Turf:
  - Ticket-shaped featured card with side notches and a dashed tear line
  - Huge condensed tabular numerals for scores and odds; team abbreviation under the mark, record under that
  - Frosted glass top controls and a floating pill tab bar
  - Leaderboard rows: medal for top 3, avatar, name, handle, right-aligned number; sticky "Your position" row
  - One deliberate lock gesture that ends in a personalized ticket you can share
Preserve from Sandclock:
  - Elevation by surface tone (three steps), never drop shadows
  - Accent used only for primary action, active state, key metric
  - 12px cards, 16px buttons, 8px grid
Borrow only:
  - Fey: three-step surface ladder and 16px card radius for the slip and ticket
  - Hard Rock Bet: three market pills per team row, sport icon chip row, slip badge counter, Flex as a first-class slip mode
  - Kalshi: implied % beside every price (their cents ARE the implied %)
  - PrizePicks: the multiplier ladder table on multi-leg slips
  - Duolingo: milestone-only celebration, zone divider on the leaderboard, flame with four states
  - Acorns: the "Past" ledger where every row explains how a holding got there
  - Robinhood: holdings rows and the post-2021 celebration restraint and projection disclaimer register
Role rules:
  - Mint = ownership, gains, primary action, active state. Nothing else.
  - Coral = the sportsbook timeline and destructive confirms. Never a loss.
  - Gold = streaks and pot. Never a CTA.
  - Team color = identity accent on a disc or rule. Never a fill behind text, never a CTA.
Media strategy: no logos, no photography. Team identity is a monogram disc: 2 or 3 letter abbreviation in system font on a
  contrast-checked team color. Icons from the Symbol sprite. Share cards rendered from tokens with html-to-image.
Reject:
  - Monospace or serif type (Rarible, Hyperliquid): system font rule wins, tabular-nums does the alignment job
  - Red for No/loss (Polymarket): red means money gone, ours is never gone
  - Light theme variants: dark is the product
  - Promo banners, reward drops, popularity flames on picks (Hard Rock, PrizePicks): celebrates frequency
  - Averaging: this is Turf's structure with Sandclock's discipline, not a blend of nine references
Token commitments (existing palette kept, roles tightened):
  --bg #0E1220 canvas; --bg2 #151A2C card; --bg3 #1E2439 pill/inset; --line #2A3149 hairline
  --ink #EEF0F8 primary text; --muted #8B92AB secondary; --dim #5C627A tertiary and legal
  --mint #4FE3A8; --coral #FF6B5B; --gold #F5C451; each with a 14 to 16 percent tint variant
  Type: SF Pro system stack; numerals tabular; big numbers 34 to 44 at weight 800, tracking -0.03em
  Radius: 12 card, 16 sheet and ticket, 999 pill; 44pt minimum targets
```

## 4. Screen by screen

### 4.1 Lines (the board)

Turf's board plus Hard Rock's pill grid. What changes from the current build:

- **Tonight card.** The first game (next kickoff, or the game with the most picks among friends) renders as a ticket: notched card, two monogram discs with abbreviation and record, kickoff centered, dashed tear line, and below it the three market pills per side. Everything else renders as dense rows. Turf uses this to make one game the hero; for us it answers "find tonight's game in 5 seconds."
- **Team identity.** Monogram disc (team color, contrast-checked) with the ESPN abbreviation, full short name beside it at 15 semibold, record under it at 12 muted. Full name in `title` and the VoiceOver label. No logos.
- **Pill order.** Standard US grid: Spread, Total, Moneyline, left to right, away team on top. See flag 8.1.
- **Pill content.** Line on top (spread number, or O/U total), price in the middle at 15 bold, "38% · 170" underneath. Selected pill fills mint with dark text. Disabled pill dims to 45 percent and the label says why.
- **Live.** In-play games move to the bottom under an "In play" divider with a gold pulse dot; pills stay visible but disabled. No live odds in beta.
- **Chips and search** stay as built. Add a "Starting soon" divider above games within 90 minutes.
- **Badge.** With Stacks, the slip becomes a floating pill at the bottom right showing leg count and combined odds; it springs on each add.

### 4.2 Slip

Vaul-style bottom drawer per the CTO plan. Three modes as segmented control: **Single, Stack, Flex** (Hard Rock has Singles, Parlays, Flex; PrizePicks has Power and Flex). Order of content, top to bottom:

1. Legs list: monogram disc, selection, line, price, remove control. Conflict (both sides of one market) flagged inline the way Hard Rock does.
2. Combined odds and implied % as one big rolling number.
3. Stake slider, $5 to $100, value at 40 weight 800. Numbers below roll on drag.
4. The trio: **Points if it hits** (mint), **You keep** (gold, always the stake), **In 5 years** (needs a stock). Under it in small text: "A sportsbook would pay $34 on this and keep your $20 if it missed."
5. For Stack and Flex, the PrizePicks ladder: "3 of 3 hit: 600 pts. 2 of 3: 240 pts" and for Flex "streak survives one miss."
6. Stock picker: Favorites first (stars), then tiers, search. Rows keep the "+13%/yr, worst drop -34%" line format. Never sorted by return.
7. One button: "Lock $20 on Eagles, Bears → NVDA". A plain press. The CTO plan is explicit that nothing animates on the money-in path except confirmation feedback, so Turf's drag-to-release gesture is rejected for the lock itself (see 8.2 for where Turf's ticket comes in).

### 4.3 The ticket (lock confirmation and share card, one component)

Turf's best idea, adapted. On lock, the drawer content is replaced by a ticket that scales in with a spring: notched card, dashed tear line, the legs, the odds, the stake, the stock, "Buys NVDA at Monday open," the user's handle, season label. Two actions: Share (Web Share on mobile, copy image on desktop) and Done. The same component renders the settled state (points landed, or "Missed. You still own $20 of NVDA.") and is what `/s/:slipId` shows. Build once, use in Lock, Picks, Reveal and Share.

### 4.4 Picks (open and settled)

DraftKings' My Bets filters (Open, Live, Settled) as chips. Each pick is a compact ticket row: monogram disc, selection and odds, status chip, and the buy line "0.11 NVDA at $182.40, now $21.14." Cancel pick stays on open picks before kickoff.

### 4.5 Owned (replaces Home's stats block)

Robinhood holdings plus Acorns' Past ledger, with our two timelines on top.

- Header: **You own $214** as a big rolling number, sparkline of owned value since joining, and under it "Sportsbook timeline: -$40" in coral. That is the counterfactual module, permanent.
- Holdings: one row per ticker: monogram-style disc with ticker, name, shares, value, change since fill. Tapping opens the education card (session 4).
- Ledger: chronological rows, each "Eagles +150 · $20 bought 0.11 NVDA at $182.40 · Mon Sep 22." This is Acorns' Round-Ups history and doubles as the Monday notification text.
- Projection ladder 1/5/10 (Gold to 25) at the blended average of actual holdings, disclaimer in Robinhood's register: "Hypothetical. Based on each fund's 10-year average. Not a guarantee of future results."
- Milestone cards at $100/$500/$1,000 invested, shareable, built from the ticket component.

### 4.6 Cup

Turf's leaderboard with Duolingo's zones.

- Segmented control: Month (pot race), Season (tiers).
- Pot header: amount, your share as a rolling percent and dollars.
- Rows: rank (medals for 1 to 3), avatar disc in the user's favorite team color with initial, name, streak flame with count, points, pot share. A gold hairline divider labeled "Top 10 · 40% of pot" sits between rank 10 and 11.
- Sticky "Your position" row at the bottom with your rank, exactly as Turf does.
- Season tab shows tier badge per row (Bronze to Diamond) and your tier progress bar.

### 4.7 Reveal and dopamine

Duolingo gating, Robinhood restraint. 1.2 second shimmer on the ticket, flip, points roll, flame grows one state, Gold pot share rolls second. Loss flips to grey and slides in the two-timeline card. Confetti only on streak 3 and 5 and invested milestones. Haptics on lock and reveal. Sounds off by default. No ambient motion anywhere.

## 5. Team colors

**Legal position (engineering read, attorney confirms before public launch):** a hex value is not owned. Color earns trademark protection only through secondary meaning (Qualitex 1995, Wal-Mart 2000). The cases that bit (LSU v. Smack Apparel 2008, Alabama v. New Life Art 2012) involved color schemes paired with school references on merchandise or uniform depictions, producing confusion about sponsorship. A monogram disc in a team's color next to a team name used to identify a game, inside a board, creates no plausible sponsorship confusion. What we avoid: logos, stylized wordmarks, helmet or jersey shapes, two-tone stripe patterns that read as a kit, and any copy implying partnership. Footer on the board and in Terms: "Team names identify games and are trademarks of their owners. Investibet is not affiliated with any league or team."

**Data source:** ESPN's public site API, verified today: `site.api.espn.com/apis/site/v2/sports/{sport}/{league}/teams` returns `id`, `abbreviation`, `displayName`, `shortDisplayName`, `color`, `alternateColor` per team. Paths: football/nfl, basketball/nba, baseball/mlb, hockey/nhl, football/college-football, basketball/mens-college-basketball. College needs `?limit=1000` (762 CFB and 362 CBB teams returned). Unofficial and unauthenticated, so import once into Supabase, never call at runtime.

**Schema (migration 0003):**
- `teams(id, league, espn_id, abbreviation, display_name, short_name, color, alt_color, ui_color)` where `ui_color` is chosen at import: `color` if it clears 3:1 against `--bg2`, else `alt_color`, else a neutral.
- `team_aliases(odds_api_name primary key, team_id)` populated from The Odds API `/participants` per sport. Pro leagues match on `displayName` with a small override map (LA Clippers, Washington, Athletics). College normalizes parentheses, "St." and "State," ampersands, then fuzzy matches above 0.9 with a manual review list for the rest.
- Engine job `jobs/teams`: import, contrast-check, alias, log unmatched names. Runs on demand and weekly.
- Board reads `games.home` → alias → `ui_color` and `abbreviation`; falls back to a neutral disc with the first three letters when unmatched, so a missing alias never breaks a card.

## 6. Decision ledger

| Decision | Source | Role or rule preserved | Why |
|---|---|---|---|
| Ticket-shaped hero card for tonight's game | Turf board screens | Featured card carries the most detail; rows stay dense | Answers the 5-second checkpoint; distinctive, not a generic list |
| Monogram disc instead of logos | Turf abbreviation-under-mark pattern; legal research | Team color as identity accent only | Logos are trademark and copyright risk; colors as accents are low risk |
| Spread, Total, ML order | Hard Rock, DraftKings, FanDuel grid | Muscle memory (CTO plan priority 1) | Bettors scan this order without thinking (flagged 8.1) |
| Implied % on every pill | Kalshi pricing in cents; project handoff | Prediction-market fluency | Their users think in percent; ours should too |
| Slip modes Single, Stack, Flex | Hard Rock slip tabs; PrizePicks Power/Flex; MVP handoff Flex rule | Flex = one miss scores 40 percent, streak survives | Same mental model as the apps they already use |
| Ladder table on multi-leg slips | PrizePicks multiplier table | Points shown per outcome | Makes Stack math legible before locking |
| Plain Lock button, no slide gesture | CTO plan motion rule | Nothing animates on the money-in path | Turf's drag gesture is fun but violates the rule; keep drama for results |
| Ticket component for lock, settle, share | Turf personalized ticket; DK Social tail | One component, four uses | Memorable detail; halves the work of sessions 2, 3 and 7 |
| Holdings rows plus ledger on Owned | Robinhood holdings; Acorns Past | Every dollar explained | Trust rule: numbers always explainable |
| Two timelines permanent on Owned header | MVP handoff crown jewel | Gain frame first, avoided loss second | The product's proof |
| Medals, sticky your-row, top-10 divider | Turf leaderboard; Duolingo zones | Rank by raw points, pot share separate | Makes the 60/40 split visible without a paragraph |
| Milestone-only celebration | Duolingo; Robinhood 2021; MVP handoff solvency rule | Confetti on streak 3/5 and invested milestones only | The Massachusetts line |
| Tonal elevation, no shadows, one accent | Sandclock; Fey surfaces | Mint only for action, active, key metric | Keeps the dark theme quiet so results can be loud |
| System font, tabular numerals | Design standards | Rarible mono rejected | Standard wins on look and feel |

## 7. Build order (revision of the handover's seven sessions)

Same sessions, two changes: the visual system and team colors land first because every later screen depends on them, and Home becomes Owned.

1. **Foundation.** Migration 0003 teams and aliases; engine teams job; token and type pass (surface ladder, numeral sizes, pill and card radii, disclaimer footer); Symbol additions (medal, shield, star outline, ticket). Board v2: monogram discs, Spread/Total/ML, Tonight ticket card, In play divider. Checkpoint: Owen finds tonight's game in 5 seconds and every team has a color.
2. **Stacks and the slip.** Core math with tests first; migration 0004 stacks; lock_stack; drawer with three modes, ladder, ticket confirmation. Checkpoint: 3-leg Stack locked, ticket shown.
3. **Share and tail.** Ticket to image, Web Share, `/s/:slipId`, public_slips view, tail pre-fill. Checkpoint: friend tails a slip.
4. **Stocks.** Favorites, kind and blurb columns, education card, 1/5/10/20/25 ladder. Checkpoint: Owen reads a card for an ETF he did not know.
5. **Owned and Cup v2.** Owned tab with header, holdings, ledger, projection; Cup with medals, zones, sticky row, season tiers. Checkpoint: profile tells the story in one screen.
6. **Gold.** Unchanged.
7. **Dopamine pass.** Unchanged, built on the ticket component.

## 8. Flags for Owen

Resolved Sept 28, 2026: 8.1 Spread / Total / ML approved. 8.2 plain Lock button; the drag gesture is not for now. 8.3 team colors ship in session 1, attorney read before public launch. Build order in section 7 approved and now supersedes the handover's.

Revised Sept 29, 2026, after Owen saw it live: the notched ticket visual is rejected. The Tonight hero card is gone; every game renders as a uniform card and the section dividers do the wayfinding. The lock, settle, and share card from 4.3 stays one component but as a plain rounded card, no notches and no tear line. Disc colors keep each team's primary hue, lightened only as far as contrast requires, never swapped to the alternate color.

**8.1 Pill order.** The handover says "ML / Spread / Total." Every US book, and the reviewers' descriptions of Hard Rock's Trending cards, run Spread, Total, Moneyline. Recommendation: switch to the standard order. The current build ships ML first.

**8.2 Turf's lock gesture.** Turf makes you drag a puck toward a team and release to claim a ticket. It is the most memorable thing in their app. The CTO plan says nothing animates on the money-in path except confirmation feedback, so the recommendation is a plain Lock button and the ticket spring-in as the confirmation. If you want the drag gesture anyway, it needs a tap fallback for VoiceOver and a rule change in the CTO plan.

**8.3 Team colors.** Low legal risk as scoped in section 5, but it is a new surface for a beta. Ship it in session 1 behind the `teams` table so it can be turned off per league by clearing `ui_color`. Attorney gets a one-hour read alongside the Win Bonus review.

## 9. Sources

Refero: Turf app 250 (screens 7ad4e47c, b845f7ef, d50b7b7f, eeb7dc28, 60523cc7, 36e6fa1a; flows 9432, 9422); Apple Sports 5db30989; Copilot 0d695435; Acorns a522f747. Styles: Sandclock 100771a2, Fey 08ae8676, Rarible a36fc971.

Web: thelines.com and sharpfootballanalysis.com Hard Rock Bet reviews; oddsassist.com Hard Rock and Kalshi guides; yogonet.com Hard Rock For You hub (Dec 2025); oddsshopper.com Kalshi sports guide; design.withfudge.com Polymarket extraction; Wikipedia Qualitex v. Jacobson; mondaq.com and lexology.com on color trademark and LSU v. Smack Apparel; site.api.espn.com teams endpoints (called directly); github.com/jimniels/teamcolors; the-odds-api.com v4 participants; cnbc.com and robinhood.com newsroom on confetti removal (Mar 2021); robinhood.com future projection support article; usabilitygeek.com Acorns case study; duolingo.deconstructoroffun.com streaks and leagues; prizepicks.com ways to pick; help.underdogsports.com streaks rules; sportsbook.draftkings.com/social.
