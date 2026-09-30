# Investibet Design System (design.md)

Adopted Sept 30, 2026. The visual authority for every screen going forward. Source: Refero style reference for Partiful (style 2849c1d3, partiful.com), adapted onto Investibet's locked constraints. This file supersedes the Sandclock-based token discipline in `investibet-design-direction.md` section 3; that doc's product-structure decisions (board anatomy from Turf and Sleeper, points-forward pills, reveal rules) stay in force.

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

## 2. Tokens

Canvas and surfaces (unchanged values, Partiful roles):

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0E1220` | Canvas. The "white marble", inverted. |
| `--bg2` | `#151A2C` | Card surface. Floats by tone, not shadow. |
| `--bg3` | `#1E2439` | Inset surface: pills, inputs, chips. |
| `--line` | `#2A3149` | Hairlines. |
| `--ink` | `#EEF0F8` | Primary text and the filled action color. |
| `--muted` / `--dim` | `#8B92AB` / `#5C627A` | Secondary / tertiary text, legal. |

Money and state colors, now strictly semantic (this is the change: mint is no longer the action color):

| Token | Value | Only ever means |
|---|---|---|
| `--mint` | `#4FE3A8` | Ownership, gains, points, won. |
| `--coral` | `#FF6B5B` | The sportsbook timeline; destructive confirms. Never a loss state. |
| `--gold` | `#F5C451` | Streaks and pot. |
| Tints | `*2` variants | State pill and panel backgrounds. |

Washes (surfaces and overlays only, never interactive elements):

| Token | Value | Use |
|---|---|---|
| `--wash-party` | `linear-gradient(160deg, rgba(248,196,255,.10), rgba(150,196,255,.05))` | Celebration surfaces: pot card, win reveal card, milestone and share cards, app-top glow. |
| `--wash-calm` | `linear-gradient(180deg, rgba(150,196,255,.07), transparent)` | Quiet section lift: empty states, education cards. |

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
- **Chips and tabs**: pill container logic; the active item fills white with dark text, inactive items are `--bg3` with `--muted` text.
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

## 6. Applying it

`apps/web/src/styles.css` is the single skin; this adoption ships as a token and component pass there (no screen rewrites). Future sessions build components from section 3 recipes. The share card renderer (session 3) and milestone cards (session 5) use the white-card-on-wash language and the tilt scatter.
