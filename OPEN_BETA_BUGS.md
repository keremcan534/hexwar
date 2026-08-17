# Imperial Eye — Open Beta Bug Log

Build v0.1.0 · save 13. Browser: Chromium 1600×1000, `prefers-reduced-motion: reduce` ON.

Severity: BLOCKER / CRITICAL / MAJOR / MINOR / COSMETIC

---

## ENVIRONMENT NOTE (not a game bug)

The simulation loop is `requestAnimationFrame`-driven, so the game only advances while the tab is
actually composited. In a backgrounded/hidden tab the clock is completely frozen (measured: 0 rAF
callbacks/sec, `document.timeline.currentTime` stuck at 0, date did not move in 6s at Fastest).
That is normal browser behaviour and correct for a game — recording it only because it cost the
first part of this session and because it means **the game cannot run minimised**, which some
players will try during long fast-forwards.

---

## BUG-001 — Browser tab title says "HexWar", game is called "Imperial Eye"
- **Severity:** COSMETIC
- **Context:** page load, every session
- **Expected:** tab reads "Imperial Eye"
- **Actual:** tab reads "HexWar" (working title leaking into the shipped build)
- **Reproducible:** always
- **Player impact:** trivial, but it's the first thing you read and it undercuts an otherwise
  very polished title screen.

## BUG-002 — Main menu rail buttons carry no accessible name
- **Severity:** MINOR (accessibility: MAJOR)
- **Context:** main menu, first boot
- **What I did:** looked at the six icons on the left rail.
- **Actual:** they *do* expand into a labelled flyout on hover ("New Campaign — shape the world
  — seed, size, land ratio"), which works nicely once you find it. But the buttons expose no
  `aria-label` and no `title`, so the accessibility tree is a row of anonymous "button" elements,
  and there is no affordance telling a first-time player the rail is hoverable at all.
- **Reproducible:** always
- **Player impact:** low for sighted mouse users, high for keyboard/screen-reader users.
- *(Downgraded from my first read — I initially thought there were no labels anywhere.)*

## BUG-003 — Nation Overview contradicts the HUD header on province count
- **Severity:** MAJOR (information trust)
- **Context:** 1 JAN 1836, Vasheim, seed BETA1836. Opened Nation Overview from the header.
- **What I did:** compared the two province numbers on screen at the same time.
- **Expected:** the same number, or two clearly different labels.
- **Actual:** header says `33 provinces ◆ 1 city`; Nation Overview says `TERRITORY 306 provinces`.
  Both are labelled "provinces". (306 is presumably hexes/tiles, 33 is administrative provinces.)
- **Reproducible:** always
- **Player impact:** real. On my first screen I could not tell how big my own country was, and
  I spent the rest of the campaign unsure which of the two numbers any other screen meant.

## BUG-004 — Unrounded float printed in the UI
- **Severity:** MINOR / COSMETIC
- **Context:** Nation Overview → ARMED FORCES
- **Actual:** `power 14.06111111111111`
- **Reproducible:** always
- **Player impact:** looks unfinished, and the precision is meaningless to the player.

## BUG-005 — "WEEKLY BALANCE +¤0.0" while the header shows "+19"
- **Severity:** MAJOR
- **Context:** 1 JAN 1836, before the first tick, game paused.
- **Expected:** the two weekly-income readouts agree.
- **Actual:** header treasury delta reads `+19`; Nation Overview weekly balance reads `+¤0.0`.
  `GDP ¤0` and `TAX REVENUE ¤0.0` are also zero at this moment.
- **Reproducible:** always at campaign start (values populate after the first weekly tick).
- **Player impact:** the start-of-game screen — the one where you're supposed to plan your
  opening — shows an economy that appears to not exist. I could not do any opening budget
  planning until I'd unpaused and burned a week.

## BUG-006 — "1 cities"
- **Severity:** COSMETIC
- **Context:** Nation Overview → POPULATION subtitle
- **Actual:** pluralisation not handled: `1 cities`.

## BUG-007 — Hexes are labelled "provinces" on two screens
- **Severity:** MAJOR (terminology)
- **Context:** throughout
- The game has three tiers: **hex** → **province** (Garfell = "6 hexes") → **state**.
- The HUD header correctly says `33 provinces`.
- Nation Overview says `TERRITORY 306 provinces` — that's 306 **hexes**.
- Construction → State Overview says `Keshburg — 47 PROVINCES · 154K POPULATION` — also **hexes**
  (the 11 states' figures sum to exactly 306).
- The province detail panel gets it right: `NATION SIZE 306 hexes`.
- **Player impact:** I could not tell how large my own country was, or compare any two screens.

## BUG-008 — Reform "enact" button is an 11-pixel hit target
- **Severity:** MAJOR (usability)
- **Context:** Politics → Reforms, 2 MAY 1836, enacting Basic School System
- **What I did:** clicked the reform row where the text renders.
- **Expected:** the row is the button.
- **Actual:** the `<li>` renders 280px wide but the `<button>` inside it measures
  **11px wide × 55px tall**. Three clicks on the visible label did nothing with no feedback; the
  reform only enacted when I aimed at the sliver at the row's left edge.
- **Reproducible:** yes, measured directly (`getBoundingClientRect`).
- **Player impact:** high. This is the primary verb of the politics screen, and it reads as
  "reforms are broken / I don't meet some hidden requirement" rather than "you missed."

## BUG-009 — White peace accepted by a winning enemy at −25 war score
- **Severity:** **CRITICAL (balance)** — see the balance report; listed here because it reads as a bug
- **Context:** 2 DEC 1846, Draesh war. War score against me **−25**. Draesh had occupied a large
  part of western Vasheim and taken two cities (City-101, Ironhill, Newhill).
- **What I did:** opened peace talks, demanded nothing, clicked "Sign white peace".
- **Expected:** a nation winning 25–0 does not sign away its entire occupation for free.
- **Actual:** screen stated **"They will sign this treaty."** Peace signed instantly. All occupied
  provinces returned, no territory lost, no reparations, no infamy.
- **Reproducible:** offer was standing for years; the AI had also repeatedly *proposed* terms.
- **Player impact:** removes all stakes from losing a war. See BALANCE-01.

## BUG-010 — Unnamed city "City-101"
- **Severity:** MINOR
- **Context:** 26 NOV 1840, conquest notification
- **Actual:** `City-101 occupied; sovereignty will be decided at peace.` Other cities in the same
  war were named normally (Ironhill, Newhill), so this one has a fallback/placeholder name.

## BUG-011 — Battle reports use raw hex coordinates instead of place names
- **Severity:** MAJOR (information)
- **Context:** every battle notification, 1840–1846
- **Actual:** `Draesh won the battle at 125, 52.` / `Vasheim won the battle at 123, 53.`
- **Expected:** the province name, which exists and is already rendered on the map.
- **Player impact:** across a seven-year war I could never tell *where* I was winning or losing
  without hunting the map by eye. This single change would have made the war legible.

## BUG-012 — Army panel shows two different commanders at once
- **Severity:** MAJOR (usability)
- **Context:** 28 JAN 1846, clicking between generals in the bottom command dock
- **What I did:** clicked Tancred Holt after having Valen Falkner selected.
- **Actual:** the top of the panel updated to `4 DIVISIONS SELECTED` listing Tancred Holt's
  divisions, while the commander card directly below still read
  `COMMANDER — VALEN FALKNER · SKILL 4/5 · 5 DIVISIONS` with Valen's front state and his
  Halt/Start Offensive button.
- **Reproducible:** yes, on every general switch.
- **Player impact:** the Start/Halt Offensive button acts on a commander other than the one whose
  divisions are listed above it. I twice nearly halted the wrong army's advance.

## BUG-013 — War declaration is styled identically to routine notifications
- **Severity:** MAJOR (design/UX)
- **Context:** 22 NOV 1839
- **Actual:** "Draesh declared war on us!" appears in the same toast stack, same size and weight,
  as "Clothing Factory reached level 6."
- **Player impact:** I did not notice I was at war. I found out minutes later because a button
  reading "Open peace talks with Draesh" appeared on the Factories screen. A declaration of war
  should force a pause and a modal.

## BUG-014 — "SEVERE SHORTAGE 100% met · short 0.0/wk"
- **Severity:** MINOR (clarity)
- **Context:** Trade screen, Coal, 1839
- **Actual:** the badge reads `SEVERE SHORTAGE` while the same line says `100% met · short 0.0/wk`.
  Presumably the badge describes the *world* market and the numbers describe *my* nation, but
  nothing says so.

## BUG-015 — "unavailable" with no reason on locked factories
- **Severity:** MAJOR (clarity)
- **Context:** factory build menu, all eras
- **Actual:** Steel Mill / Machine Parts / Electric Gear / Oil Refinery / Synthetic Oil are greyed
  with the tooltip **"unavailable"** and nothing else. The *other* greyed buildings in the same
  menu say **"treasury short by ¤23"**, which is perfectly clear — so the pattern exists and just
  isn't applied here.
- **Extra confusion:** private investors queued a **Steel Mill** in Yarheim in 1836 while the same
  building was "unavailable" to me. Whatever the rule is, the UI presents it as a contradiction.
- **Player impact:** the Oil Refinery is the most profitable building in the game (+61.3/level) and
  I never learned what unlocks it.

## BUG-016 — "power ratio" in the diplomacy list is ambiguous
- **Severity:** MINOR (clarity)
- **Context:** Diplomacy screen nation list
- **Actual:** `Zenorya — 178 provinces · power ratio 0.18` vs `Elytria — 20 provinces · power
  ratio 0.62`. The largest nation in the world has the *lowest* number and a tiny one has a high
  number, so I could not work out which direction the ratio points, and there's no tooltip.
- **Player impact:** this is the only at-a-glance "can I beat them?" figure on the war-declaration
  screen, and I couldn't read it.

## BUG-017 — Net trade is displayed on the Budget screen but excluded from the balance
- **Severity:** **CRITICAL** — this is the most important defect I found
- **Context:** every session; captured cleanly at 29 DEC 1905
- **What I did:** read the Budget screen while running a large import deficit.
- **Actual, on one panel, simultaneously:**
  ```
  Total income              ¤286.2
  Total expenses            ¤102.2
  TARIFFS
    Imports               −¤986.1
    Exports               +¤162.3
    Net                   −¤823.8
  Projected weekly balance  +¤184.0
  ```
  `286.2 − 102.2 = 184.0`. The **−¤823.8 net trade figure is rendered and then ignored.**
- **Reproducible:** always. Visible from the very first tick in 1836 (income 48.1 = taxes only,
  while the tariff block showed net +45.6 that likewise never entered the total).
- **Player impact:** total. The national treasury is disconnected from the trade balance, so:
  - importing your entire food supply and all your iron costs the state **nothing**;
  - trade strategy, tariffs, autarky and blockade have no fiscal meaning;
  - the treasury only ever rises. I finished with **¤280,023** while running a −¤824/week deficit,
    with 65% of my population under enemy occupation and zero coal production.
  This single line invalidates the economic layer's consequences, which is a shame because the
  *modelling* underneath it (see the Trade screen) is the best thing in the game.

## BUG-018 — War-tab score badge shows absurd values
- **Severity:** MAJOR
- **Context:** 1857–1859, war tabs above the map
- **Actual:** the Quengrad tab badge read **"+44K"** and later "+83K" while the peace screen for the
  same war reported a war score of **−31**, then **−48**. Other tabs at the same moment showed
  sane values ("Draesh −6").
- **Player impact:** the badge is the only always-visible war indicator and it was reporting a
  number three orders of magnitude off.

## BUG-019 — Sixty years of education spending produced no literacy change
- **Severity:** MAJOR (balance / invisible consequence — possibly working as designed, but unreadable)
- **Context:** Education budget set to 40% (¤20.9/week) in 1836 and left there; Basic School System
  reform enacted 1836.
- **Expected:** literacy rises over six decades.
- **Actual:** literacy **24% (1837) → 23% (1899)**. Meanwhile factory workers went 7.8% → 47.2%, so
  the pop system is clearly doing *something*; literacy specifically never moved.
- **Player impact:** the budget line says "schools qualify workers; universities amplify it", which
  is a promise the game never visibly keeps. I could not tell whether I was wasting the money.

## BUG-020 — Factory / state tables re-sort unpredictably between renders
- **Severity:** MAJOR (usability)
- **Context:** Factories screen, any time the game is unpaused
- **Actual:** the state list re-orders every refresh. At 10 APR 1836 it was sorted by population
  descending; moments later the same ten states appeared in an unrelated order. On the Construction
  screen the queue rows renumber under the cursor for the same reason.
- **Player impact:** you cannot click the same state twice in a row while time is running. I
  repeatedly opened the build menu for the wrong state. Workaround is to pause first, which
  shouldn't be necessary.

## BUG-021 — Notification stack permanently covers panel controls
- **Severity:** MAJOR (usability)
- **Context:** all screens, whole campaign
- **Actual:** toasts render top-right over the open panel and sit on top of the panel's own tab
  strip (e.g. the Factories screen's "FACTORIES / UNDER CONSTRUCTION" tabs). Dismissing them is
  one click each and new ones arrive constantly.
- **Player impact:** I had to dismiss four toasts to reach a tab, several times.

## BUG-022 — Duplicate general names
- **Severity:** COSMETIC
- **Context:** 1872 and 1878 officer staff
- **Actual:** command dock showed `DORIAN · DORIAN · OSRIC · OSRIC` — two pairs of generals sharing
  a first name, indistinguishable in the dock.

## BUG-023 — Escape does not close panels
- **Severity:** MINOR
- **Context:** Nation Overview, all screens
- **Actual:** pressing Escape does nothing; you must find and click the ✕. Standard for the genre
  is Escape-to-close.

## BUG-024 — Battle panel shows "round 0/20" with 0 losses on both sides
- **Severity:** MINOR (possibly cosmetic, possibly a stalled battle)
- **Context:** 18 NOV 1859, `BATTLE OF 124, 60`
- **Actual:** `round 0/20 · VASHEIM 1K STR 100% ORG 100% VS DRAESH 999 STR 100% ORG 100% ·
  losses: 0 attacker / 0 defender`. Given fronts stayed frozen for years at a time, I could not
  tell whether battles were resolving at all.

## BUG-025 — "Land ratio: 0.00" reads as a broken default
- **Severity:** COSMETIC
- **Context:** New Campaign screen
- **Actual:** the slider displays `0.00`, which a new player reads as "a world with no land". It
  apparently means "automatic" (the other sliders use the word "automatic" — Great Powers shows
  `automatic` at the same position).

## BUG-026 — Per-good trade policy is a non-functional UI shell
- **Severity:** MINOR (honest, but it's dead UI)
- **Context:** Trade screen, every good, whole campaign
- **Actual:** four buttons — AUTO / IMPORT PRIORITY / EXPORT PRIORITY / STRATEGIC RESERVE — above
  the caption *"Trade clears automatically. Per-good policy is a reserved shell — not wired yet."*
- **Player impact:** credit for saying so plainly, but this is the exact control I wanted for
  "corner a commodity / deny a rival", and it's the most prominent unimplemented thing in the build.

