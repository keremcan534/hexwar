# MECHANIC PRUNING AUDIT — Imperial Eye / HexWar

**Scope:** every player-facing mechanic in the current build, audited for the attention it demands
versus the decisions it creates. Analysis only — no code was changed.

**Evidence base:** full code trace of `src/game/*`, `src/ui/*` (file:line references throughout), plus
the project's own measured playtests: `OPEN_BETA_PLAYTEST_DIARY.md`, `OPEN_BETA_FULL_CAMPAIGN_REPORT.md`,
`OPEN_BETA_2_*`, `OPEN_BETA_3_PLAYTEST.md`, `SYSTEM_AUDIT_REPORT.md`, `TECHNOLOGY_GAMEPLAY_AUDIT.md`,
`REMAINING_OPEN_BETA_ISSUES.md`, `BETA_REPAIR_LOG.md`, and the design rules in `CLAUDE.md`,
`README.md`, `docs/tasarim.md`.

**The single most important playtest finding for this audit** (Beta 1, §7): *"Things I wished were
automated and would have lost nothing: **nothing**."* Every micro complaint in three campaigns was
about the **execution** of a decision, never the decision itself. The pruning target is therefore
clicks-per-decision and dead systems — not decisions. The design docs already state the rule twice:

- `CLAUDE.md`: "Every feature that creates per-unit work for the player must be delegable via
  `orders.js`. Micromanagement is the fastest-growing cost on mobile."
- `docs/tasarim.md` §12: "Every system added will have a summary-at-a-glance line and an automatic mode."
- `docs/tasarim.md` §6 supplies the fake-depth test: "Every option must be defensible; if one is
  clearly superior it is not a choice."

---

## 1. MASTER TABLE

Micro = per-interaction click burden (1 low … 5 severe). Scaling = how workload grows with empire
size (1 constant … 5 linear-or-worse). Integration = how many consequence chains the system feeds.

| SYSTEM | WHAT PLAYER DOES | DECISION CREATED | FREQUENCY | CONSEQUENCE | MICRO | SCALING | INTEGRATION | VERDICT | REASON |
|---|---|---|---|---|---|---|---|---|---|
| **Construction capacity (build power)** | Watches the 5/wk pool, orders priority | "What does my country build first?" | Constant background, decisions every few months | Everything buildable waits on it | 1 | 1 | High (buildings, factories, upgrades, cement) | **DO NOT TOUCH** | Praised in every beta as the game's best constraint; protected in `BETA_REPAIR_MASTERPLAN.md` §5 |
| **Construction queue (widget)** | Reorders/cancels projects, 5 buttons/row | Real priority decision | Monthly-ish | Direct build order | 3 | 3 | High | **KEEP + POLISH** | Decision praised, widget was the #1 Beta 1 micro complaint; ⤒/⤓ fixed it partly, rows still renumber, 8+ rows overflow (P2-1, P2-3) |
| **Construction Sector (placeable)** | Picks a region, queues the building | None — effect is a national counter (`construction.js:224-231`), region irrelevant | A few per campaign | +5 build power each | 2 | 2 | Feeds build power only | **CONVERT** | Fails the location test completely; keep the capacity, remove the placement ritual |
| **Administration (placeable)** | Picks a region, queues the building | None — flat national +4% tax, cap 6 (`construction.js:239-242`) | Rare (nobody built one in 3 campaigns) | +24% tax max | 2 | 2 | One consumer (`economy.js:2264`) | **MERGE** | Location irrelevant; third redundant admin concept next to `adminFunding` slider and `administrationCost` |
| **University (placeable)** | Picks a region, queues the building | None — flat national workforce/literacy scalar (`construction.js:244-246`) | Rare (never built by testers) | +24% hiring, literacy target | 2 | 2 | Feeds literacy → research (post R-18) | **CONVERT** | Location irrelevant; belongs at the national institution level with the education budget |
| **Fort (placeable)** | Picks a region, queues the building | Weak — region-wide flat +8%/level, no pass/border/hex logic (`construction.js:248-256`, `battles.js:74-78`) | Rare (never built by testers) | Defence buff that silently dies when its own region is partially occupied | 2 | 2 | One consumer (battles) | **REDESIGN** | Only building where location *could* matter; current implementation is "province defense +8% region-wide" spam-bait, and no campaign ever prompted one |
| **Factory building** | Opens per-state modal, one click per plant, modal closes each time | Real: which industry, which state, state vs private money | Bursts; 160 clicks for one Beta 2 build spree | Core economy | 4 | 4 | Very high | **KEEP + POLISH** | The what/where decision is good (`README`: "the player decides what to plant where; growth belongs to the economy"); the interaction violates the delegation rule |
| **Factory upgrades** | Nothing — automatic (`economy.js:1695-1727`) | — | — | Levels grow themselves | 1 | 1 | High | **KEEP** | Model automation: decision-free execution already delegated |
| **Factory subsidies** | Toggles ¤ per plant, must remember to un-toggle | Weak — AI gets auto-cleanup (`economy.js:2441-2446`), player doesn't | Weekly nag at scale | Silent treasury drain; measured no industry effect (ORTA-33) | 4 | 5 | Low | **AUTOMATE** | Classic maintenance mechanic; strategic version is "subsidise war industries", a policy, not 29×N toggles |
| **Private project support (¤)** | Click = 25% of shortfall, shift = all | Real: accelerate the capitalists or not | Occasional | Faster industrialisation | 2 | 3 | Medium | **KEEP** | Praised as good automation with a good override |
| **Arms production lines** | Re-points each ARMS_FACTORY among 5 equipment families | Real: which equipment family starves | When stocks run dry | 50% efficiency reset per switch | 3 | 4 | High (blocks recruitment) | **KEEP + POLISH** | The decision is strategic; needs a national "priority" intent instead of per-plant buttons |
| **Trade** | Reads the ledger; one interaction total (select a good) | None manual — everything clears automatically | Optional | Shortages shown, not managed | 1 | 1 | High | **KEEP** | Already the correct abstraction; the 4 disabled per-good policy buttons are a shell (P2-8) to wire or delete |
| **Tariff slider** | Sets it to 100% and leaves it for 50 years | None — measured free money, no downside (YÜKSEK-4; 99% of AI nations at 100%) | Once | +¤433/wk free | 1 | 1 | Medium | **KEEP + FIX** | Fails the one-obvious-answer test until protectionism has a cost |
| **Tax sliders (3 classes)** | Sets them | Weak — no Laffer curve, monotone revenue (ORTA-19) | Rarely | Satisfaction dip only | 1 | 1 | Medium | **KEEP + FIX** | Structure fine; needs a real tradeoff curve |
| **Social sliders (edu/health/welfare)** | Maxes them immediately, never touches again | None — "absurdly cheap for the effect" (Beta 2 §18); health measured +0.7% pop over 260 wk (ORTA-21) | Once | Stability +24 for ¤21/wk | 1 | 1 | Education feeds literacy→research; health nearly dead | **KEEP + FIX** | Chain design is right (protected), costs are fake; must price real tension into it |
| **adminFunding slider** | Never lowers it | None — one-way optimum, net +16.54/wk at 100% (ORTA-18); promised control channel never built | Once | Hidden penalty if ignorant | 1 | 1 | Tax efficiency only | **MERGE** | A knowledge tax, not a choice; fold into one administrative-capacity system |
| **War budget button** | One click on war/peace transitions | Real macro intent | Per war | Swings 5 sliders correctly | 1 | 1 | Medium | **KEEP** | Exactly the intent-layer pattern this audit wants everywhere |
| **Loans/debt** | Nothing — automatic borrowing/repay/default | Consequence, not busywork | — | "The reason I could genuinely fail" (Beta 2) | 1 | 1 | High | **DO NOT TOUCH** | Praised; only the no-way-back death spiral (Beta 3 E-1) needs balancing |
| **Recruitment** | One click per regiment, 12 regiments = 12 clicks; ▲▼✕ per queue row | Weak — "infantry is always the answer" (Beta 2 §15); the *cap* is the good part | Every mobilisation, dozens of times late-game | Army size | 4 | 5 | High | **AUTOMATE (execution)** | Keep training slots/equipment gates (protected); add quantity orders/army intent; the unit-mix decision needs tech to make non-infantry viable |
| **Disband** | Impossible — function exists, no caller (`recruitment.js:263`) | Absent decision | — | Army is a one-way population ratchet (B2-024) | — | — | — | **KEEP + FIX** | Wire the existing function; recruitment-consumes-population is praised but needs its release valve |
| **Commander creation** | Auto (default on), paid from treasury | Minimal | Yearly refresh | Officer corps | 1 | 1 | Medium | **KEEP** | Named as model automation in Beta 1 §20 |
| **Commander assignment** | Per-division appoint/change/dismiss; autoAssign exists but defaults OFF | Real: which general leads which front | Constant while at war | 57 unassigned divisions at Beta 2 end | 4 | 5 | High | **AUTOMATE (default)** | The praised automation already exists — the default is wrong for a mobile-first game |
| **Per-general stance/target/aggression** | 7 commands = 7 separate "Start Offensive" clicks; stances silently revert (B2-021) | Real: where to attack | Per war phase | Front behaviour | 4 | 4 | High | **KEEP + FIX** | Repeated *decision* worth keeping; needs a theater/national-level order and the revert bug killed |
| **Front lines** | Nothing — derived from borders weekly | Delegation target | — | Armies hold/advance themselves | 1 | 1 | High | **KEEP** | Correct design per README; 67% of late-game CPU cost is here (perf, not design) |
| **orders.js delegation (AUTO/HOLD)** | Unreachable — no UI button sets AUTO or HOLD (`hud.js:866` only emits "clear") | The design's core promise | — | Player cannot delegate divisions despite `CLAUDE.md` naming this the rule | — | — | — | **KEEP + FIX** | The delegation layer the whole design leans on is dead UI |
| **Navy** | Drives each warship by hand, forever; no admiral front logic (`command.js:890-894`) | None — no blockade, no supremacy, no transport role | Per ship per target | "Never built a ship in 68 years. Never had a reason." (Beta 2) | 5 | 5 | Near zero | **REDESIGN (shrink)** | Fully manual per-ship micro attached to a system with no strategic output; abstract it, don't extend it |
| **Equipment tiers** | Nothing — all 246 divisions tier 1 after 300 wk; upgrade path removed, cost requires a deleted good (SYSTEM_AUDIT) | None | — | None | — | — | Dead | **CUT NOW** | Measured dead machinery carried in every save and power formula |
| **Multi-regiment divisions** | Nothing — no code path ever adds a second regiment (`units.js:309-340`) | None | — | None | — | — | Dead | **CUT NOW** | 1-element-array machinery in loss distribution, composition, refresh |
| **War declaration / peace offers** | Declare; accept/reject offers; build peace deals on the map | Real and praised (Beta 3 W-1: "readable and rewarding") | Per war | Territory, terms, truce | 2 | 2 | High | **DO NOT TOUCH** | Peace table is the best-reviewed screen in the game |
| **Diplomacy (rest)** | Nothing — no alliances/relations by design, honest about it | — | — | — | 1 | 1 | Low | **KEEP** | Honest absence beats fake buttons; expansion is future work, not pruning |
| **Infamy / coalitions** | Watches a number | Should constrain conquest — never fires (Beta 1: 33/22, nothing; Beta 3: salami raids never bind it) | — | A threat that never fires (P2-6) | 1 | 1 | Should be high | **KEEP + FIX** | The anti-snowball brake the design depends on (`tasarim.md` §1) is decorative at current decay tuning |
| **Reforms** | One click per step, global cooldown | Real when the chamber gates direction (praised); cosmetic when support sits at 100% forever | ~1/year max | 11 of 21 ladders feed the sim; 10 feed nothing | 2 | 1 | Medium | **KEEP + FIX** | Keep the chamber gate; wire or cut the 10 no-effect ladders; monotone enact-all shape fails the choice test |
| **Elections** | Optional early call in a 12-wk window; otherwise automatic | Marginal | ~1/year | Government flips silently (B2-017: six constitutional changes as silent stat edits) | 1 | 1 | Medium | **KEEP + FIX** | Automation right, narration absent — consequence invisible |
| **Politics meters** | Reads stability, two different "militancy" numbers, display-only "cohesion" | — | — | Stability real and praised; cohort MIL/CON feed nothing (`census.js:119`) | 1 | 1 | Mixed | **MERGE** | One unrest concept, one formula; delete or wire the display-only meters |
| **Technology** | May pick a tech; auto-pick fills the slot anyway, no completion notification ever fires | Near none — cheapest-first for everyone; 6 of 8 tech modifiers unread; `rank` bonus dead | Rare | 7 unlock techs matter; rest is +X% wallpaper | 1 | 1 | Low (2 wired modifiers) | **KEEP + FIX** | Own audit already says it: fewer, fatter techs; wire modifiers one at a time; give the player the direction choice for real |
| **Population screen / census** | Pure inspection; 18 columns, no action affects the sim | None (by design: a ledger) | Optional | Archaeology, not story (Beta 1 §12) | 1 | 1 | Read-only | **KEEP** | Cheap, honest, informative; only trim its fake columns (confession filler, dead MIL/CON) |
| **Cities (found)** | Stands an army, clicks found | Real: where — spacing + work radius | Few per campaign | RGO/admin/recruit anchor | 1 | 2 | Medium | **KEEP** | Low frequency, real location decision |
| **Notifications** | Dismisses cards; war halts the game (post R-12) | — | Constant | Existential and trivial still one visual language; 5 defined kinds never emitted; no log | 3 | 3 | — | **KEEP + FIX** | Attention is the scarcest resource on mobile; feed needs tiers + a scrollable log (Beta 1 §19-6, §21-10) |
| **Hegemony score** | Reads it | End-of-campaign scoring | — | Victory at final turn only | 1 | 1 | Low | **KEEP** | Scoreboard, zero burden |

---

## 2. LOCATION TEST — the placeable buildings

The test: does WHERE create strategy? Quoted effects from code.

| Building | Effect as implemented | Location matters? | Ruling |
|---|---|---|---|
| Construction Sector | `sectors × 5` build power, counted nationally (`construction.js:224-231`); region slot is the only spatial fact | **No.** A sector in the capital and a sector on the frontier are the same integer | Convert to national capacity |
| Administration | `1 + min(0.24, count × 0.04)` on national taxes (`construction.js:239-242`) | **No.** | Merge into one admin-capacity system |
| University | `min(0.24, count × 0.04)` national hiring + literacy-target scalar (`construction.js:244-246`, `economy.js:1842`, `economy.js:3024`) | **No.** | Convert to a national Higher Education institution |
| Fort | +8%/building to *every tile of the whole state region* (`construction.js:248-256`); consumed once in `battles.js:74-78`; **bonus disappears if any part of its own region is occupied** (occupied regions drop out of `constructionAtlas`, `construction.js:275-278`) | **Barely** — region granularity, no pass/terrain/border logic, and the anchor hex (`q,r` = region display centre) is cosmetic | Redesign at hex/province level or fold into terrain+entrenchment |
| Factory | One-per-type-per-state; inputs come from the national/world market, hiring is national; only spatial effect is competing with the local RGO for labour (`economy.js:1899-1914`, `provinces.js:521-529`) | **Weakly** — the state choice is a population/labour choice, not a geographic one | Keep; the what/where framing is still the game's best economic decision |

Three of the four state buildings are national `+X%` counters wearing a map costume. The player pays
attention (open screen → pick building → pick region → manage queue slot) for a decision that does
not exist. The Beta 1 verdict was empirical: *"I built one Construction Sector and never had a
reason to build any of the other three building types."*

**Construction capacity is a different thing and is explicitly protected.** The scarcity (5/week
base, queue, regional slots, cement demand) produced the game's most-praised moments. The audit
finding is only that the *placeable Construction Sector building* contributes no locational
decision to that mechanic.

---

## 3. THE "AGAIN?" TEST — documented moments

All from the project's own playtest diaries:

1. **Queue promotion, ~20 clicks** (Beta 1): "I demoted the very item I was trying to promote." Partly fixed (⤒/⤓); rows still renumber, 8+ rows overflow.
2. **Twelve regiments = twelve clicks** on a re-rendering button (Beta 1 §7); by Beta 2 it was "the only micro the late game offered."
3. **Seven Start-Offensive clicks, silently reverting, forever** (Beta 2 §7, B2-021).
4. **"Take N loose units" per general** because autoAssign defaults off; 57 orphan divisions at campaign end (Beta 2).
5. **~160 clicks to queue 75 factories** through a modal that closes after every purchase (Beta 2 §7).
6. **Re-finding a state in a table that re-sorts under the cursor** (Beta 1 §7; P2-3, still open).
7. **Dismissing notification cards to reach panel tabs** — "four clicks to reach a tab, constantly" (Beta 1 §7; P2-4, still open).
8. **Per-ship naval orders after every target dies** — no command layer for fleets at all (`command.js:890-894`).
9. **The yearly salami raid** (Beta 3 W-2): "has the truce expired? yes. attack." — same decision, zero new information, and the dominant strategy.

Items 1–8 are repeated *execution* (reduce). Item 9 is a repeated *decision that has collapsed into
one answer* — an incentive problem (infamy/truce tuning), not an interaction problem.

---

## 4. DECISION FREQUENCY vs DEPTH

| Frequency | Mechanics | Depth check |
|---|---|---|
| CONSTANT | notifications; front watching; (late-game) recruit clicks | Recruit clicking is constant + zero variation → worst offender |
| WEEKLY | subsidy drains if toggled; stance re-clicks (bug); private project support | Only project support carries a decision |
| MONTHLY | construction/factory queueing; arms line switching | Genuine decisions — keep, cheapen the clicks |
| YEARLY | reform step; election window; officer refresh (auto) | Reform choice is real only when the chamber gates it |
| EVERY FEW YEARS | wars, peace tables, war budget flips | The good bursts; peace table praised |
| ONCE PER ERA | tech unlocks arriving; navy becoming possible (1850, unannounced — P2-7) | Fine |
| ONCE PER CAMPAIGN | slider setup (taxes/tariff/social/admin) | One-obvious-answer sliders are "once and never again" — fake knobs until costs are real |

---

## 5. MECHANICAL CANCER FLAGS

Criteria: high frequency + low variation + low consequence + high clicks + poor automation + scales with empire.

1. **Per-regiment recruitment clicking** — 5/6 criteria. Scales with army size; identical every time.
2. **Per-plant subsidy toggles** — 5/6. Scales with factory count (29 types × N states); the AI has cleanup logic the player lacks.
3. **Per-general offensive clicks with silent revert** — 5/6 (the revert makes it infinite).
4. **Per-ship naval orders** — 5/6. Scales with fleet size, zero strategic payoff attached.
5. **Manual commander assignment under the default-off toggle** — 4/6, self-inflicted by a default.
6. **Factory build modal (closes per purchase)** — 4/6 during build sprees.

None of these carries a decision that would be lost by automating/batching the execution.

---

## 6. EMPIRE SCALE TEST

- **3 → 25 states:** state-building placement grows linearly (25 states × 4 building types × slot
  bookkeeping) while the decision content stays "cap the national counter at 6" — the exact bad
  pattern the brief names. Factories likewise grow the click count linearly (`+` per state, modal per plant).
- **26 → 105 divisions (measured, Beta 2):** recruitment and assignment burden grew linearly; the
  interesting military decisions (where to attack, which general) did not.
- **Simulation cost:** weekly tick 19 → 171 ms by 1899, 67% of it front-line derivation in
  `command.js` (Beta 3). Frame rate survives via 5.5 ms slicing — a perf item, not a design item.
- **Admin cost that should scale doesn't:** README promises super-linear administrative cost with
  empire size; measured cost is 0.03–0.10 gold (ORTA-18). The one mechanic that *ought* to push back
  on empire scale is decorative.

---

## 7. FAKE DEPTH & MAINTENANCE & TRAPS

**One-obvious-answer list (all measured):** adminFunding at 100% (never wrong, ORTA-18); tariff at
100% (free money, YÜKSEK-4 — 99% of AI nations agree); social sliders maxed (¤21/wk for +24
stability, Beta 2 §18); infantry-only armies (Beta 2 §15); "build all four building types to their
national caps" (once affordable, nothing differentiates the order beyond build power first).

**Maintenance mechanics:** subsidy toggles (status-quo upkeep); stance re-clicking (bug-driven
upkeep); Administration building as designed is textbook "population grows → bureaucracy low →
build #17" — it never even got that far because nobody built #1.

**Traps / knowledge taxes:** construction rows silently disabled when gold < cost (cost an entire
Beta 2 campaign — the game's only control that disables without a reason string); navy structurally
impossible before 1850 with no "why" (P2-7); economic policy silently forbidding state factory
investment for thirty years (Beta 2, B2-017); subsidy toggles silently draining the treasury.

**Dead machinery carried in saves and formulas (player-invisible weight):**

| Item | Evidence |
|---|---|
| `EQUIPMENT_TIERS` / `regiment.tier` | always 1; upgrade path removed; cost requires deleted `iron` (`units.js:22-49`, SYSTEM_AUDIT) |
| Multi-regiment arrays + composition/loss machinery | no path adds regiment #2 (`units.js:309-340`) |
| `type.entrenched` / `type.support` flags | UI-only; battles never read them (`military.js:46,53` promises unbacked) |
| 6 of 8 tech modifiers (`rgoOutput`, `factoryThroughput`, `inputEfficiency`, `literacyCap`, `supplyConsumption`, `morale`) | computed, displayed, read nowhere (P1-6) |
| `nation.rank` / research `rankBonus` | never assigned; bonus always 1 (`technology.js:203-216`) |
| `economy.inventory` | written weekly, never read (`economy.js:3172`) |
| `economy.armySpending` | legacy, clamped weekly, unread |
| `city.foodStore` | written, never read |
| Notification kinds `CRISIS`, `GROWTH`, `INFRA`, `RESEARCH`, `PROVINCE` | defined, never emitted (`notifications.js:20-41`) |
| `disband()` | exported, no caller (`recruitment.js:263`) |
| `industrialRightsOn` (FACTORY_RIGHTS peace term) | exported, no consumer — the peace term buys nothing (`economy.js:1351-1358`) |
| Dead-end goods `synthetic_oil`, `explosives`, `clippers` + their factories; `DYE_WORKS` never built by anyone in 300 turns | produced into a void (economy agent trace, ORTA-26) |
| Confession/religion column | no religion system; deterministic filler (`census.js:47-74`) |
| Cohort `militancyOf`/`consciousnessOf` | "no mechanic reads this" per its own comment (`census.js:119`) |
| "Internal Cohesion %" | computed inline for display, read by nothing (`screens.js:692`) |
| Trade per-good policy buttons | rendered disabled with a "not wired" caption (`tradeScreen.js:166-172`) |
| Politics "Decisions" tab (empty) and "Release Nations" tab (disabled buttons) | permanent stubs |
| `orders.js` AUTO/HOLD | unreachable from UI |

---

## 8. DUPLICATE SYSTEMS

| Concept | Overlapping expressions | Ruling |
|---|---|---|
| **Administration** | Administration building (+4% tax/each) · `adminFunding` slider (taxEfficiency) · `administrationCost` in `cities.js:203` (unaffected by either) · promised-but-unbuilt control channel | Merge into ONE administrative-capacity system with a real tradeoff |
| **Unrest** | `economy.stability` · `nationalMilitancy` (reforms.js) · cohort `militancyOf` (census.js, different formula, same name, feeds nothing) · unemployment counted three separate times as an unrest input | One concept: stability (praised). Delete or derive the rest from it |
| **Education** | education slider → literacy stock · University building → same literacy target + hiring · `school_system` reform ladder → cost only, touches no literacy | One Higher-Education/education institution consuming the slider; reform ladder should feed it or go |
| **Construction** | build power (good) · Construction Sector building (a counter) · regional slots (good) | Keep the two real scarcities, drop the building ritual |
| **Ideology / issue mixes** | computed twice from the same tables (`reforms.js:320/780` vs `census.js:231/245`), shown on two screens with drift | Single source |
| **Budget** | `nation.budget` (cities.js pools) + `economy.ledger`/`fiscalNet`, summed in three different places; two literacy figures, two unemployment figures, two weekly balances on screen (Beta 2 §8-9) | Single ledger, single number per concept |
| **Factory unlock** | `availableFrom` calendar OR tech unlock | Acceptable dual-gate (tech pulls date forward) — keep, it's the tech tree's only real content |
| **Foreign-population problem** | infamy annex multiplier · `tileEfficiency` culture penalty · citizenship policy · display-only "cohesion" | Three wired ones are fine; delete the fourth or wire it |

---

## 9. VALUE SCORECARDS (majors)

Scores 1–5. MicroB/ScaleB are burdens (5 = worst).

| System | Decision | Consequence | Clarity | Agency | Replay | MicroB | ScaleB | Integration | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| Construction capacity | 5 | 5 | 4 | 5 | 4 | 1 | 1 | 5 | DO NOT TOUCH |
| Construction Sector bldg | 1 | 3 | 3 | 2 | 1 | 2 | 2 | 2 | CONVERT |
| University bldg | 1 | 2 | 2 | 2 | 1 | 2 | 2 | 3 | CONVERT |
| Administration bldg | 1 | 2 | 3 | 2 | 1 | 2 | 2 | 1 | MERGE |
| Fort bldg | 2 | 2 | 1 | 2 | 2 | 2 | 2 | 1 | REDESIGN |
| Factories (build/where) | 4 | 5 | 3 | 4 | 4 | 4 | 4 | 5 | KEEP + POLISH |
| Trade (auto-clearing) | 2 | 4 | 4 | 2 | 3 | 1 | 1 | 5 | KEEP |
| Budget sliders | 2 | 3 | 3 | 3 | 1 | 1 | 1 | 4 | KEEP + FIX |
| Debt/default | 3 | 5 | 4 | 3 | 3 | 1 | 1 | 5 | DO NOT TOUCH |
| Recruitment (constraint) | 4 | 5 | 5 | 3 | 3 | 4 | 5 | 5 | KEEP constraint, AUTOMATE execution |
| Command/generals | 4 | 4 | 2 | 4 | 3 | 4 | 4 | 5 | KEEP + FIX |
| Navy | 1 | 1 | 1 | 2 | 1 | 5 | 5 | 1 | REDESIGN (shrink) |
| Peace table | 5 | 5 | 5 | 5 | 4 | 2 | 2 | 5 | DO NOT TOUCH |
| Reforms | 3 | 3 | 4 | 3 | 2 | 2 | 1 | 3 | KEEP + FIX |
| Technology | 1 | 2 | 3 | 1 | 1 | 1 | 1 | 2 | KEEP + FIX |
| Infamy/coalitions | 2 | 1 | 3 | 1 | 2 | 1 | 1 | 2 | KEEP + FIX |
| Notifications | — | — | 2 | — | — | 3 | 3 | — | KEEP + FIX |
| Population/census | 1 | 1 | 4 | 1 | 2 | 1 | 1 | 1 | KEEP (ledger) |
| Stability | 3 | 4 | 5 | 3 | 3 | 1 | 1 | 5 | DO NOT TOUCH |

---

## 10. MECHANIC DELETION TEST — what decision would be lost?

- Construction Sector building gone (capacity preserved): **no decision lost** — "which region hosts sector #3" was never a decision.
- University building gone (effects moved to an institution): **no decision lost**; a Higher-Education investment level *creates* one.
- Administration building gone: **no decision lost** — nobody built one in three campaigns.
- Fort building gone as-is: **no current decision lost** — but a *potential* decision (defend the pass, cover the capital) dies with it; hence redesign, not cut.
- Equipment tiers / multi-regiment machinery / dead modifiers / dead goods gone: **nothing lost**, saves and formulas get lighter.
- Subsidy toggles automated into policy: the lost "decision" is remembering to un-toggle — that is maintenance, not strategy.
- Per-regiment clicking replaced by quantity/intent orders: the training-slot scarcity (the actual decision) is untouched.

The systems where deletion would genuinely destroy decisions — build power, training caps, equipment
gates, debt, the chamber gate on reforms, the peace table, stability — are exactly the ones every
campaign praised. They are marked DO NOT TOUCH in the cut plan.
