# Investibet — Design and Development Standards

**Apple's Human Interface Guidelines are the standard for every screen we ship, web or native. When a choice is open, do what iOS does.**

Sources (read before designing):
- HIG: https://developer.apple.com/design/human-interface-guidelines/
- Apple Design Resources (Figma/Sketch iOS UI kits, color guides): https://developer.apple.com/design/resources/#ios-apps
- SF Symbols (7,000+ icons): https://developer.apple.com/sf-symbols/

Apple's current design principles: hierarchy (the important thing is obvious at a glance), harmony (feels native to the device), consistency (familiar patterns, no relearning). Our own filter sits on top: every screen must make "the money is safe and it's yours" obvious.

---

## 1. Layout

- Mobile-first, single column, max width 520pt on larger screens
- Respect safe areas on all four sides. Sticky headers and tab bars offset by the insets
- 16pt side margins on iPhone, 20pt on iPad. 8pt grid for spacing
- Tab bar at the bottom, 4 tabs max (Lines, Picks, Cup, Home). Never hide it on core screens
- Modals and slips are bottom sheets with a grabber, drag to dismiss, scrim behind. The slip is the most important component in the app
- Content scrolls, chrome does not. Wide content (tables) scrolls inside its own container, never the page

## 2. Typography

- Web: system font stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui`). Native: SF Pro via the system. Never load a custom body font
- Tabular numerals everywhere a number can change (`font-variant-numeric: tabular-nums`). Rolling numbers must not jitter
- Type scale follows Apple's text styles: Large Title 34, Title 1 28, Title 2 22, Headline 17 semibold, Body 17, Callout 16, Subhead 15, Footnote 13, Caption 12. Minimum 11pt, and 11 is for legal lines only
- Support Dynamic Type. Layouts must survive the largest accessibility size without truncating money
- Sentence case for labels and buttons. No all-caps eyebrows

## 3. Color

- Dark theme is the product. Midnight background, mint for gains and ownership, coral for the sportsbook timeline, gold for streaks and pot. Never use red for a loss (red means "your money is gone"; here it isn't)
- Minimum contrast 4.5:1 for text, 3:1 for large text and icons (WCAG AA, which Apple's Accessibility guidance also asks for)
- Color never carries meaning alone. Every state also has a label, icon, or position
- Use semantic tokens (`--mint`, `--coral`, `--gold`, `--muted`), never raw hex in components

## 4. Touch targets and controls

- 44 x 44pt minimum for anything tappable. No exceptions, including odds pills, list rows, and the feedback button
- Buttons say what happens: "Lock $20 on Jets → NVDA", "Log your buy", "Save pot". Never "Submit", "OK", "Continue"
- One primary action per screen, filled. Secondary actions are tinted or plain
- Destructive actions are coral and confirm first
- Sliders for stake, native pickers for dates, switches for on/off settings
- Disabled means visibly disabled and explains why in the button label ("Over your $100 weekly cap")

## 5. Motion and feedback

- Durations: 120ms feedback, 240ms transitions, 600 to 1200ms reveals only
- Springs for physical things (sheets, badges). Ease-out for everything else
- Respect `prefers-reduced-motion`: reveals become fades, nothing else animates
- Haptics on lock and on reveal. Light impact for taps, success notification for wins. Never haptics on scroll or passive updates
- Motion answers a user action. No ambient animation, no fade-and-slide on every card
- Confetti only on streak milestones and invested milestones. Never on pick placement or frequency (the Massachusetts line)

## 6. Icons and imagery

- SF Symbols for every icon, native and web (export as SVG). Match weight to adjacent text weight. Prefer filled variants for selected tab states
- No emoji as UI icons in production (fine in beta copy). Flames and trophies become symbols before public launch
- App icon built with Icon Composer for the layered iOS 26 style. Mint mark on midnight, no text in the icon
- Share cards are images rendered from the app's own tokens, not screenshots

## 7. Copy

- Plain verbs, sentence case, second person. "You own $20 of NVDA." Never "Your investment has been successfully processed"
- Empty states are directions: "Lines drop Thursday", not "No data"
- Errors say what went wrong and what to do: "Couldn't lock. Try again." Never apologize, never vague
- Money is always exact to the cent when settled, rounded to the dollar when projected, and projections are always labeled hypothetical with the assumption disclosed
- Vocabulary is fixed across the flow: pick, stake, lock, line, log your buy, points, pot, streak. A button called Lock produces a toast that says Locked

## 8. Accessibility (ship blockers)

- VoiceOver labels on every control, including odds pills ("Jets, plus 170, 37 percent implied")
- Focus order matches visual order. Visible focus ring on web
- Dynamic Type and reduced motion supported (above)
- Nothing timed out that the user can't redo. Reveals can be replayed from the Picks tab

## 9. Web-specific (PWA phase)

- `viewport-fit=cover`, safe-area insets in CSS, `theme-color` set to midnight
- Installable with a manifest, standalone display mode, no browser chrome
- 100ms tap response. No hover-only interactions
- Everything must work with the network gone: cached shell, last-known board, queued feedback

## 10. Review checklist before any screen ships

1. Can you tap everything with a thumb, one-handed, without precision?
2. Is the one important number the biggest thing on the screen?
3. Does the loss state say "you still own this" somewhere visible?
4. Does it survive largest Dynamic Type and reduced motion?
5. Would this screen pass App Review tomorrow?

---

Apply this doc with the CTO plan (motion rules, component list) and the MVP handoff (locked decisions). When the three disagree, this doc wins on look and feel, the handoff wins on product rules.
