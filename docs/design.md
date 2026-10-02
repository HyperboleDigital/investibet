# Investibet Design System (design.md)

Adopted Sept 30, 2026; structure layer added Oct 2, 2026. The visual authority for every screen going forward. Source: Refero style reference for Partiful (style 2849c1d3, partiful.com), adapted onto Investibet's locked constraints. This file supersedes the Sandclock-based token discipline in `investibet-design-direction.md` section 3; that doc's product-structure decisions (points-forward pills, reveal rules) stay in force.

Two references, two jobs:

- **Partiful owns the visual layer**: tokens, color meaning, type, radii, washes, action hierarchy (section 1).
- **Hard Rock Bet owns the structural layer**: chrome, layout patterns, and flow, from `docs/reference/hardrock/` (22 screenshots, Oct 2026). Copy structure, never brand: no Hard Rock purple, no logos, no team marks, no bet/wager/payout copy (section 1b).
- `docs/reference/investibet-pick-flow-mockup.html` is the slip's **content spec** only: the Win / Miss / In 5 yrs trio, stock rows styled as odds lines with personality tags ("The favorite · steady"), the streak multiplier spelled out ("170 × 1.5x streak"), the sportsbook-comparison fine print, the disclaimer. Its mint-filled Lock button is superseded by this file's white primary action; content survives, skin does not.

## 1. Reference lock

```
Primary reference: Partiful (Refero style 2849c1d3-8068-407a-93c1-24c69ead084f)
North star: confetti on midnight. The chrome stays quiet and monochrome while the money
  and the results explode with color. Partiful puts celebration in content, never in chrome.
Preserve from Partiful:
  - Monochrome action hierarchy: filled buttons are white-on-midnight (their black-on-white,
    inverted for our dark canvas). No colored accent ever fills a primary action.
  - Gradient washes as surfaces only: pink-to-mauve (party) and periwinkle (calm) tints on
    section and card backgrounds. Never on a button, input, badge, or text.
  - Full-pill (999px) radius for badges, status tags, chips, tab selectors. 12px cards,
    16px sheets and modals, 8px compact buttons.
  - Display type: the biggest number or headline on a screen is very heavy (800+) with
    tight tracking (-0.03em to -0.04em). One title size plus one body size per card, never three.
  - Semantic state colors used for states only (their Going/Maybe/Cant-go trio).
  - Tilted scatter (plus or minus 10-15 degrees) for showcase imagery: our share cards
    and milestone cards, never for functional UI.
  - Soft floating shadow only on elements that float (toast, floating slip bar). Flat
    tonal elevation everywhere else.
Reject from Partiful:
  - White canvas: dark theme is the product (locked). The wash opacities are retuned for midnight.
  - Custom display font: system font only (locked). The display voice is SF Pro at weight 800
    with Partiful's tracking, not a loaded webfont. Revisit only if Owen licenses a face.
  - Warm Sand active-nav accent: active nav is pure white here; gold is reserved for streaks and pot.
  - Emoji as UI (their RSVP circles): Symbol sprite only (locked).
```

## 1b. Reference lock: Hard Rock Bet structure

```
Structural reference: Hard Rock Bet iOS app, docs/reference/hardrock/ IMG_5065-5086
Preserve from Hard Rock:
  - Floating pill tab bar: capsule floating above the bottom edge, soft shadow, 5 slots,
    icon + 11pt label, selected tab gets a filled pill highlight. Fifth slot is the
    account: for them a balance, for us the initials avatar (we never show a cash balance).
  - Top chrome: search field first, then a filter chip row (all-sports icon, Trending,
    Live), then a league chip row with sport icons. Selected chip = outlined + tinted.
  - Board: games grouped by league under a sport-icon header with "View more lines";
    per game a two-row grid with three labeled market columns (SPREAD / TOTAL / WINNER);
    kickoff line with calendar icon under each game.
  - Floating selection bar: when 1+ legs are selected, a pill bar floats above the tab
    bar ("2 picks" left, stake-earns line right). Picking never leaves the board.
  - Slip: numpad with quick-add chips (+$5 +$10 +$25), big editable stake, two-column
    Stake / Earns header, leg list with connecting line and remove icons.
  - Locked celebration sheet: rising sheet, mark + "Locked in.", full slip card, then
    stacked actions (Track, Share with friends, Done).
  - Pick cards (My Bets pattern): selection + odds top row, "TO HIT" eyebrow, matchup,
    kickoff, Stake | Earns columns, ID small, Share top right; All/Upcoming/Live/Finished
    underlined tabs; centered line-art empty states with one sentence.
  - Profile: stacked display-type name, initials avatar with edit pencil, cards for
    account value and rewards, then a settings list with version number at bottom.
Reject from Hard Rock:
  - All branding: purple, logos, team marks, emoji (🤘), "bet/wager/payout/balance" copy.
  - Promo noise: reward drops, odds boosts, mystery anything (locked: no chance-based
    reveals). Our one promo slot rotates the Cup pot and milestone nudges only.
  - Editorialized bet suggestions ("Popular Bets" built by the house). Our featured
    Stacks are generated from most-picked legs, never editorialized.
```

## 2. Tokens

Canvas and surfaces (light since Oct 2 PM, Owen's call: the product is light like the Hard Rock references, Partiful's native ground):

| Token | Value | Role |
|---|---|---|
| `--bg` | `#F2F3F7` | Canvas. iOS grouped-background gray. |
| `--bg2` | `#FFFFFF` | Card surface. |
| `--bg3` | `#ECEDF2` | Inset surface: pills, inputs, chips, odds pills. |
| `--line` | `#E2E4EC` | Hairlines. |
| `--ink` | `#171B2E` | Primary text and the filled action color. |
| `--muted` / `--dim` | `#6F7590` / `#9CA1B6` | Secondary / tertiary text, legal. |

Money and state colors, strictly semantic (mint is never the action color), darkened for contrast on white:

| Token | Value | Only ever means |
|---|---|---|
| `--mint` | `#0FA36E` | Ownership, gains, points, won. The accent on every odds pill. |
| `--coral` | `#E8503A` | The sportsbook timeline; destructive confirms. Never a loss state. |
| `--gold` | `#C08A14` | Streaks and pot. |
| Tints | `*2` variants | State pill and panel backgrounds, ~10% alpha. |

Washes (surfaces and overlays only, never interactive elements), retuned up for the light canvas:

| Token | Value | Use |
|---|---|---|
| `--wash-party` | `linear-gradient(160deg, rgba(243,187,255,.30), rgba(150,196,255,.14))` | Celebration surfaces: pot card, win reveal card, milestone and share cards, app-top glow. |
| `--wash-calm` | `linear-gradient(180deg, rgba(150,196,255,.14), transparent)` | Quiet section lift: empty states, education cards. |

Floating shadow is `--float: 0 8px 24px rgba(23,27,46,.14)`, only on elements that float (nav, selection bar, toast, sheets).

Type (system stack, tabular numerals, Dynamic Type support all stay locked):

| Role | Size / weight / tracking |
|---|---|
| Display (reveal number, stake, pot) | 34-44px / 800 / -0.04em |
| Screen title | 22px / 800 / -0.03em |
| Card title | 17px / 700 / -0.02em |
| Body | 14-15px / 400-600 / -0.01em |
| Caption, legal | 12px / 400 / 0 |

Radius: cards 12, sheets and modals 16, compact buttons 8, full-width buttons 12, everything pill-shaped 999. Shadows: `0 0 20px rgba(0,0,0,.45)` on floating elements only.

## 3. Component recipes

- **Primary button**: `--ink` fill, `--bg` text, weight 700, tracking -0.02em, radius 12 (full-width) or 8 (compact). Says exactly what it does ("Lock $20 on Eagles, Bears → NVDA"). One per screen.
- **Ghost button**: transparent, 1px `--line` border, `--ink` text.
- **Destructive**: coral tint fill, coral text, two-tap confirm.
- **Filter chips** (leagues, Trending, Live, stock tiers): pill, inactive is `--bg3` with `--muted` text; selected is outlined (`--ink` border) + tinted (`rgba(255,255,255,.1)`), Hard Rock's pattern in our monochrome. Changed Oct 2 from the white-fill rule.
- **Segmented controls** (Month | Season, Stacks | Singles): the active segment fills white with dark text.
- **Content tabs** (All | Upcoming | Live | Finished on Picks): underlined active tab, no pill.
- **Floating pill tab bar**: capsule, `--bg2` at 96% over blur, 1px `--line`, floating shadow (it floats), radius 999. Active tab gets a `rgba(255,255,255,.09)` pill fill with `--ink` icon and label; inactive `--muted`. No mint in chrome. Fifth slot is the initials avatar on the periwinkle gradient, coral dot when something needs attention.
- **Floating selection bar**: white pill, dark text, floating shadow, rises with a spring. Left "N picks" at weight 800, right "$X stake earns Y pts" with the points rolling. It is a primary action, so it is white (monochrome action rule), never mint.
- **Promo card**: `--wash-party` over `--bg2`, dismissible x in a soft circle, one per screen, rotates Cup pot and milestone nudges only.
- **League header**: sport icon + 17px/700 league name, ghost pill "View more lines" right.
- **Slip trio** (from the pick-flow mockup): Win in `--mint` with the multiplier spelled out, Miss in neutral ("you still own $20 of NVDA"), In 5 yrs in `--gold`; sportsbook-comparison fine print in `--dim` beneath; disclaimer always.
- **Status pills** (res chips): full pill, tinted background. Won = mint on `--mint2`. Push/Void = gold on `--gold2`. Missed = `--muted` on `rgba(255,255,255,.05)`; never red, the money did not go anywhere.
- **Market pills** (mpill): unchanged anatomy (line, big mint points, odds and implied % beneath). Selected fills mint: allowed, selection is a money-semantic state, not chrome.
- **Pot card**: `--wash-party` over `--bg2`. The one permanently celebratory surface.
- **Win reveal card**: `--wash-party` background, mint border, display number rolls. Miss reveal stays flat gray with the two-timeline panel.
- **Share, ticket and milestone cards**: white-surface cards (Partiful's card language survives on export images), scattered at a slight tilt in galleries only.
- **Nav**: active tab white, inactive muted. No mint in chrome.
- **Toast**: white pill, dark text, floating shadow.

## 4. Do / Don't

Do: keep chrome monochrome so money colors stay loud; one display number per screen; washes for celebration surfaces; pills for anything stateful; left-align body copy; keep 44pt targets, safe areas, reduced-motion, VoiceOver labels (all locked).

Don't: color-fill a primary action; gradient a button, badge, or text; use more than two type sizes in one card; use gold outside streaks and pot; use coral for a loss; load a webfont; use emoji as UI; put shadows on non-floating surfaces.

## 5. Conflicts with prior locked decisions, and the resolutions taken

1. **Partiful is light, our theme is dark (locked).** Resolution: keep midnight, port the system (monochrome actions, washes, radii, type energy). The washes run at 5-10% opacity so they read as glow, not decoration.
2. **Partiful's brand lives in a custom display face; our standard is system font only (locked).** Resolution: SF Pro 800 with Partiful's tracking is the display voice. If Owen ever licenses a display font, it appears only at 26px and above, per Partiful's own rule.
3. **Mint was previously the primary action color (direction doc section 3).** Changed by this adoption: actions are white, mint means money. This makes the Lock button white. Flagged to Owen at adoption; revert is one token if it feels wrong on the phone.
4. **Warm Sand nav accent** rejected: collides with gold's locked meaning.
5. **Selected chips were white-filled (this file, Sept 30); the Hard Rock adoption (Oct 2) changes them to outlined + tinted.** Segmented controls keep the white fill so the two states stay distinguishable. Revert is one CSS rule if it reads muddy on the phone.
6. **The pick-flow mockup fills the Lock button mint.** Superseded by resolution 3 above: actions are white, mint means money. The mockup is content spec only.
7. **Hard Rock's fifth tab is a cash balance.** We never show a cash balance; the slot is the initials avatar opening a balanceless Profile that leads with Owned.
8. **Dark theme was locked Sept 28-30; Owen reversed it Oct 2 PM.** The product is light, matching the Hard Rock references and Partiful's native white ground. Primary actions are now ink-filled (dark button, white text, Partiful's original polarity). The section 1 "Reject: white canvas" line is void. Dark may return later as a mode, not the default.

## 6. Applying it

`apps/web/src/styles.css` is the single skin; the Partiful adoption shipped as a token and component pass there, and the Hard Rock structure landed with the Oct 2 shell rebuild (floating tab bar, chips, selection bar, league-grouped board). Still to build from section 1b: the numpad slip, the locked celebration sheet, the Picks cards with underlined tabs, and the game page. The share card renderer (overhaul session 3) and milestone cards use the white-card-on-wash language and the tilt scatter.
