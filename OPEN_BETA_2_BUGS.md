# OPEN BETA 2 — BUG LOG

Campaign: seed `8V9X3W`, Ossria Emirate, start 1 JAN 1836.
Blind playtest. No source inspection during Phase A. Recorded as encountered.

Severity: BLOCKER / CRITICAL / MAJOR / MINOR / COSMETIC

---

## TEST ENVIRONMENT NOTE (not a game bug)

The automation harness initially could not composite screenshots and reported a
wrong viewport (1440×900 vs the real 961×910), so early clicks landed off-target.
Fixed by fronting the tab. No game behaviour was affected. Recorded only so that
nothing below is mistaken for an environment artefact.

---

> ## ⚠ PHASE B CORRECTIONS (added after code inspection — read before acting)
>
> **B2-001 was my misdiagnosis.** Construction is not broken. `canQueueConstruction`
> requires `nation.gold >= type.cost`; a Construction Sector costs ¤100 and I had ¤50 on
> 1 JAN 1836, so every state row was correctly disabled. I tested only on day one and
> never reopened the screen for 68 years. Verified live at ¤477,295: rows enabled, one
> click queued a sector. **Reclassified below to MAJOR (missing disabled-reason), not
> CRITICAL (broken system).** The player impact in my campaign was nevertheless total.
>
> **B2-010 (Escape) and B2-015 (war declarations don't pause) are INCONCLUSIVE.**
> `hud.js:316` closes the active screen on Escape and it works when a proper `code:
> 'Escape'` event is dispatched; `NOTIFY.WAR` carries `halt: true` and calls
> `setSpeed(0)`. My fast-forward automation re-asserted Fastest every cycle, so a pause
> would have been invisible to me. I cannot claim either is broken.
>
> Everything else in this log stands.

---

## B2-001 — MAJOR *(downgraded from CRITICAL — see corrections above)* — Construction state rows disable with no reason, contradicting the on-screen instruction

**Date/context:** 1 JAN 1836, first session, Construction screen, at peace, treasury ¤50.

**Action:** Selected a building (Construction Sector). The screen instructs:
> "🏗 Construction Sector selected — Click a state row or one of your states on the map to add it to the queue."

Then clicked (a) the Highbridge state row, (b) other state rows, (c) my own
territory on the map in the active State Construction map mode.

**Expected:** The project appears in the Construction Queue.

**Actual:** Queue stays at "0 active / No active projects" in every case.

**What is actually happening (confirmed in Phase B):** the state rows go `disabled`
whenever `nation.gold < CONSTRUCTION_TYPES[selected].cost`. A Construction Sector
costs ¤100 and I had ¤50. The disable is correct; **the silence is the bug.**

The row carries the class `placement-ready` *and* `disabled` at the same time, has
**no `title`, no aria-description, no inline reason, and no greyed-out price**, while
the panel immediately above it says:

> "🏗 Construction Sector selected — Click a state row or one of your states on the map
> to add it to the queue."

Clicking my own territory on the map is likewise silently inert.

**Reproducibility:** 100% whenever treasury < building cost.

**Player impact — total, in my campaign.** I concluded on day one that the system was
broken, never reopened the screen, and played sixty-eight years without ever building a
Construction Sector, Fort, Administration or **University**. Build power stayed at
5/week for the whole campaign, which is why 70 of my 75 queued factories were still
under construction four years after I ordered them.

**Why this is worse than an ordinary missing tooltip:** every comparable control in this
game already does it right — *"treasury short by ¤88"* on the factory picker,
*"Blocked — Small Arms short: 10 needed, 6.0 in stock"* on recruitment, *"There is no
electorate"* on elections. Construction is the one screen that says nothing, and it is
the screen gating four building types.

**Fix:** give the row the same reason string the factory picker already uses, and grey
the building tile itself when the treasury cannot cover it.

**Test contamination:** none applied. No source file was modified during Phase A.

---

## B2-002 — MAJOR — Four of five technology categories are dead buttons

**Date/context:** 1 JAN 1836, Technology screen.

**Action:** Tried to open Army, Navy, Commerce, Culture research categories.

**Expected:** Either research trees, or a visible explanation.

**Actual:** All four are `disabled` and show only "0/30". The sole explanation
is a browser-native `title` tooltip reading **"Not yet authored"** — invisible on
touch, and requiring a ~1s hover on desktop. Only Industry is implemented.

**Player impact:** No military, naval, commercial or cultural research exists.
Research cannot make an army better, ever. The screen advertises 150 techs and
delivers 30. A player sees four inert buttons and no reason.

---

## B2-003 — MAJOR — No event/decision system at all

**Date/context:** 1 JAN 1836, Politics → Decisions.

**Actual:** "No decisions are available. Decisions are one-off acts of state
offered by events and by the situation on the map. The event system is not
built yet, so this register stays empty rather than showing invented entries."

**Player impact:** the campaign has no authored narrative beats whatsoever.
Honest text, but it means nothing ever *happens to* you — only what you and the
AI do mechanically. See also Release Nations: "Releasing them as client states
is not implemented, so the buttons stay closed."

---

## B2-004 — MINOR — "Provinces" means two different things

**Date/context:** 1 JAN 1836, everywhere.

Nation badge says **27 provinces**. Nation Overview says **Territory 308
provinces**. Construction says "Highbridge — 74 provinces". 308 is the hex
count; 27 is the named-province count; the two are never distinguished.

**Player impact:** you cannot trust any territory number you read.

---

## B2-005 — MINOR — Nation Overview economy block reads all zeros at start

**Date/context:** 1 JAN 1836, Nation Overview and Budget.

GDP ¤0, Tax revenue ¤0.0, Weekly balance +¤0.0 — while the top bar
simultaneously shows **+11** weekly. The whole Budget screen is likewise 0.0¤
before the first weekly tick.

**Player impact:** the first thing a new player does is open the budget to plan,
and it is a wall of zeros that contradicts the header. You cannot make an
opening economic decision until you have already unpaused.

---

## B2-006 — MINOR — No country selection in New Campaign

**Date/context:** Main menu → New Campaign → Generate World.

The flow is seed / map size / continentality / land ratio / great powers →
Generate → *you are already playing as an assigned nation*. There is no nation
picker, no "play as" step, no re-roll. I was handed Ossria, which happened to be
rank 1 of 69.

**Player impact:** a grand-strategy player expects to choose. Being assigned the
world's leading power without being asked also removes the whole "who am I and
what is my problem" opening beat.

---

## B2-007 — MINOR — "Land ratio 0.00" reads as "no land"

New Campaign slider runs −0.5…+0.5 with 0 = default, but is displayed as
"0.00" with no unit and no hint. A new player reads 0% land.

---

## B2-008 — MINOR — Top tab bar is clipped with no scroll affordance

At 961px viewport width the management tab bar shows Construction…Population and
clips Politics/Technology. It *does* scroll horizontally, but there is no arrow,
fade or scrollbar to say so. Discovered only by guessing.

---

## B2-009 — MINOR — Critical information lives only in native `title` tooltips

Factory recipes ("1.5 Iron + 0.5 Coal → 1.25 Small Arms"), reform support
breakdowns, and tech-category disable reasons are all browser-native `title`
attributes. On a **mobile-first** game these are unreachable on touch, and on
desktop they need a a long hover and cannot be read from a screenshot.

---

## B2-010 — MINOR — Escape does not close the province panel

Selecting a province opens the recruitment/province panel bottom-left. Escape
does not dismiss it; it toggles the main menu instead. The panel is cleared only
by selecting something else.

---

## B2-025 — CRITICAL — Late-game simulation collapses to ~0.1 weeks/second and 0.3 fps

**Date/context:** measured repeatedly 1903, seed 8V9X3W, 105 divisions, 112 factories,
at war and then at peace.

Player-facing throughput at **Fastest** across the campaign:

| Date | Army | Weeks / real second | FPS |
|---|---|---|---|
| 1836 | 2 | 2.3 | — |
| 1863 | 26 | 1.17 | 142 |
| 1874 | 26 | ~1.2 | — |
| 1903 at war | 105 | 0.06 | 0.3 |
| 1903 at peace, 3 marching | 105 | 0.06–0.11 | 0.2–0.3 |

One in-game week takes 10–16 real seconds. **Covering the whole map with a full-screen
panel changes nothing** (0.08 wk/s, 0.2 fps), so the cost is in the simulation, not the
renderer. It does not recover at peace, and it did not recover after the marching
divisions arrived.

**Player impact:** the campaign ends here. This is the single reason the blind campaign
stopped at year 68 of 100.

**PHASE B calibration — partly the game, partly my harness.**

Headless (no browser), product world, seed 8V9X3W, 15-week sample per mark:

| era | ms/week | weeks/s |
|---|---|---|
| 1836 | 22.8 | 43.8 |
| 1850 | 42.6 | 23.5 |
| 1875 | 47.3 | 21.2 |
| **1900** | **222.2** | **4.5** |
| 1936 | 90.1 | 11.1 |

The simulation is genuinely **~10× more expensive at 1900 than at 1836** — a real,
reproducible cost curve — but headless still reaches 1936 in minutes.

In the browser at 1903 the game's own profiler reported frames of **34–42 ms**
(`sim` 18–42 ms, `render` 1.2 ms), clock ticks 22–60 ms, autosave 38 ms against a
**3.85 MB** localStorage save. Yet with the game **paused** the tab delivered **1.4 fps**,
and hiding the map canvas changed nothing (1.5 fps). The rAF gap trace was 2–15 ms
punctuated by regular **~2000 ms stalls that appear nowhere in the game's own frame or
event instrumentation**.

Those stalls are therefore most likely an artefact of the automation driving this
session. **I cannot attribute the 0.06 wk/s figure entirely to the game.** What stands:
the measured 10× headless cost growth by 1900, and the in-browser fall from 2.3 → 1.17 →
~0.1 weeks/second over the campaign.

Army size (26 → 105 divisions between 1896 and 1900) fits the timing and is the best
remaining candidate for the game-side component — but it is a hypothesis, not a
measurement.

---

## B2-024 — MAJOR — Divisions can never be disbanded, and they permanently eat population

There is no disband, demobilise, or reduce control anywhere in the Military screen —
only "Release command", which unassigns a general. Recruiting from 26 to 105 divisions
between 1896 and 1900 took my population from **960K to 813K** and it never came back.

**Player impact:** army size is a one-way ratchet. Combined with B2-025 this means a
player who over-recruits permanently destroys both their population and their frame
rate, with no way to undo it.

---

## B2-026 — MAJOR — Territorial conquest is unreachable in practice

**Date/context:** 1848–1853 war vs Elanria (26 divisions, 1.9× their strength);
1900–1903 war vs Elanria (86–105 divisions, **6.1×** their strength).

| War | Duration | Final war score |
|---|---|---|
| 1848–1853 | 5½ years | **+10** |
| 1900–1903 | 3 years | **+28** |

A single 16–18 hex province costs **80–85** war score. Even the cheapest non-territorial
term (Industrial Rights) costs 14.

So: five and a half years of total war against a nation half my size bought me nothing
at all; three years at 6.1× superiority bought one Resource Concession.

**Player impact:** the entire military half of the game cannot change the map. In 68
years not one border on the world map moved — mine or anyone's.

---

## B2-020 — MAJOR — The offensive control is undiscoverable, unlabelled, and reverts

Three separate defects in the one control that runs a war:

1. The command dock's **"Toggle the offensive"** button does nothing on its own, and has
   no `aria-pressed`, no active class and no visual pressed state — there is no way to
   know whether the offensive is on.
2. The control that *does* work is a **"Start Offensive"** button inside the
   division-selection panel, below the fold, and it must be pressed **once per
   commander** (I had seven command slots).
3. Commands **silently revert to "holding the border"** within months, while the front
   panel still reads "ADVANCING AGAINST ALL ACTIVE BORDERS". (B2-021)

**Evidence, 19 MAY 1849:** at war with Elanria for 16 months, 26 divisions at 100%
strength / 100% organization, all seven commands "holding the border", Order of battle
"0 engaged · 0 on the march", Diplomacy screen "No active province battles", war score
frozen at +8 for a year, ¤129/week being spent.

---

## B2-021 — MAJOR — Military screen and front panel report contradictory army status

At the same moment the division panel read "FRONT — **ADVANCING** against all active
borders · 5 provinces · 6 divisions · planning 100%" while the Military screen listed
every command as "**holding the border**" with 0 engaged and 0 on the march.

---

## B2-022 — MAJOR — Move orders are right-click only, and nothing says so

The in-game help says *"Select divisions and order a destination."* **Left**-clicking an
enemy province with divisions selected silently **deselects them** and selects the
province instead. **Right**-click is the actual move order. This is never stated in the
help text, the tooltip, or anywhere in the UI.

---

## B2-023 — MAJOR — "Accept terms" rejected the peace

**Date/context:** 27 AUG 1853, Diplomacy screen, Elanria proposing white peace.

Clicked **"Accept terms"**. Result notification: *"We rejected Elanria's terms; the war
goes on."* Had to route through the separate Peace Talks screen → "Sign white peace" to
actually end the war.

Related smaller issue: on the Peace Talks screen the confirm button still reads
**"Sign white peace"** when non-territorial terms are attached — I signed a Resource
Concession treaty using a button labelled "white peace".

---

## B2-027 — MAJOR — Government changes are completely silent

Over 68 years my government changed at least four times —
Absolute Monarchy → Presidential Dictatorship → Constitutional Monarchy →
Prussian Constitutionalism — along with ruling party, upper-house composition,
citizenship policy, trade policy, war policy and **economic policy**.

Not one of these produced a notification, a pause, an event, or any acknowledgement.
I discovered the Interventionism switch (which forbade me from building any factory for
~30 years) by opening the Factories screen for an unrelated reason, and discovered the
switch *back* to State Capitalism the same way, a decade after it happened.

**Player impact:** the most consequential thing that can happen to your country happens
off-screen. See also B2-015.

---

## B2-028 — MAJOR — Reform support is permanently 100%, so reforms are only a timer

Every reform in the list, in every year from 1836 to 1903, read **"Support 100.0% of
50.0%/55.0%/60.0%/68.0% required · Ready to enact"**. Twenty-one simultaneously
available reforms, all at 100%.

The only real gates are (a) the once-per-12-months cooldown (24 months for
constitutional reforms) and (b) whether the upper house happens to permit that class of
law. There is no reform I ever had to *build support for*.

The underlying reason appears to be B2-029.

---

## B2-029 — MAJOR — Population ideology never changes

The ideology split read **Socialist 35.8 / Conservative 29.5 / Liberal 23.5 /
Fascist 11.1** on 1 Jan 1836 and **35.6 / 29.4 / 23.9 / 11.1** in 1874 — after four
decades in which farmers fell from 40% to 28% of the workforce and literacy went from
0% to 61%.

Consequence: the electorate cannot change, so elections always return the same party
(Labour Union won every election I ever held), so the political layer has no dynamics
of its own.

Related realism problem: a society that is **35.8% socialist and 11.1% fascist in 1836**,
with a "Labour Union" party leading the national return at 38%, is not a 19th-century
society. This broke the period illusion within the first minute of the campaign.

---

## B2-030 — MAJOR — World market never converges; shortages increase as the world industrialises

| Year | Shortages | Highest pressure |
|---|---|---|
| 1836 (Jul) | 14 | Fertilizer |
| 1844 | 16 | Coal |
| 1853 | 17 | Coal |
| 1874 | 15 | Coal |
| 1900 | **26** | Coal |

Individual goods do converge — Paper went ¤48 → ¤1.68, Furniture ¤96 → ¤1.72, Canned
Food ¤21 → ¤1.28 as producers appeared, which is genuinely good. But a hard core never
does: **Fabric ¤48, Cement ¤64, Fertilizer ¤64, Fuel ¤80, Regular Clothes ¤72** sat at
exactly 8× base for the entire 68 years, and Coal was "highest pressure" for six
decades running.

Meanwhile raw materials collapse and stay collapsed: Grain ¤2.00 → **¤0.24**,
Timber ¤3.00 → ¤0.36, Fish → ¤0.27.

Also seen: **"Regular Clothes ¤72.00 — severe shortage 100% met · short 0.0/wk"** —
labelled a severe shortage at the price ceiling while reporting 100% of demand met.

---

## B2-031 — MINOR — Two different literacy figures

Technology screen and Population screen disagree, permanently and by a wide margin:

| Date | Technology screen | Population screen |
|---|---|---|
| 1861 | 52% | 40% |
| 1874 | 61% | 47% |
| 1900 | 68% | 56% |

---

## B2-032 — MINOR — Generals are listed twice

From roughly 1848 the generals list and the command dock both showed duplicate entries —
"Perrin Vance ★ · 5 divisions" twice, "Bertran Lindqvist ★★ · 4 divisions" twice, later
"Ulric ★★ · 7" twice. The listed division totals then exceed the army size (35 listed
vs 26 actual) unless you assume the duplicates are display-only.

Auto-created generals also frequently share the same first name.

---

## B2-033 — MINOR — Military Procurement cost does not respond to its own slider

Moving Military Procurement from 60% to 25% changed the stated *effect*
("reinforcement 29%" → "12%") but the cost stayed at exactly **204.6¤** in the same
render. Only the benefit scaled down; the bill did not.

---

## B2-034 — MINOR — Header "weekly gold" and Budget "projected weekly balance" disagree

Header read **+53** while the Budget screen simultaneously projected **+¤31.0**. The two
numbers were never equal at any point in the campaign.

---

## B2-035 — MINOR — Diplomacy screen is unreachable while at peace

There is no Diplomacy tab. The screen listing every nation, their relative strength and
a Declare War button is reachable only (a) from a war-bar chip while already at war, or
(b) by clicking a foreign province on the map and choosing "Open ⟨X⟩ Dossier".

A player at peace has no discoverable way to survey the world's powers.

---

## B2-036 — MINOR — Declaring war takes one click with no confirmation and no war goal

"Declare War" in the foreign-power dossier immediately starts a war. No confirmation
dialog, no war-goal selection, no statement of what the war is *for*, and no preview of
the infamy it will cost.

---

## B2-037 — MINOR — Cannot zoom out far enough to see the world

At maximum zoom-out roughly a quarter of the 160×96 map is visible. There is no
strategic/world view, and no minimap. Judging "who is the biggest power" is impossible
from the map alone.

---

## B2-038 — MINOR — Notifications are sticky and stale

The card *"Maresh declared war on us!"* was still displayed on my map in 1851 — thirteen
years after the declaration and eleven years after that war ended. It is dismissible but
never expires on its own.

---

## B2-012 — MINOR — Stability visibly craters in the first week for no reason

Start value 62%; one week later 43%. The tooltip shows the real computation
(satisfaction +53.8, unemployment −11.0). The 62% was a placeholder that had never been
computed. Because the player's first act is usually a reform, this reads as
"the reform I just passed cost me 19 points of stability".

---

## B2-013 — MINOR — Two different unemployment figures

Stability tooltip: "Unemployment −11.0 (**5,000** without work)".
Population screen, same afternoon: "Unemployed **134K**".

---

## B2-014 — MINOR — Tax sliders show no preview

Expense sliders (Education, Welfare…) update their cost the instant you move them.
**Tax and tariff sliders do not** — every income figure stays frozen until the next
weekly tick, so you cannot see what a tax change will do before committing to it.

---

## B2-015 — MAJOR — War declarations do not interrupt the game

A war declared on me produced a small corner toast at Fastest speed. The game did not
pause, nothing demanded acknowledgement, and I played on for months before noticing the
nation badge said "At war". Compare: a factory reaching level 5 produces a
visually identical notification.

---

## B2-016 — MAJOR — Losing a war had no findable cost

Accepted Maresh's terms in JUN 1840 after losing a two-year war at −31 war score, with
16% of my border region occupied. Terms were "¤ War Reparations".

Result: no territory lost, **no reparations line ever appeared in the Budget**, treasury
unchanged at ¤13,138, manpower jumped 85K → 133K. The only lasting effect I could find
was that the war had ended.

---

## B2-017 — see B2-027 (silent government change)

---

## B2-018 — MINOR — An election is scheduled and simultaneously impossible

Politics header: *"Next election is due: 12 APR 1844 · 11 weeks"*.
"Hold Election" button, directly beneath: *"There is no electorate: no election can be
held under the current franchise."*

(The disabled reason itself is excellent — it told me exactly which reform to chase.)

---

## B2-019 — see B2-036

---

## B2-011 — COSMETIC/CONFUSING — Reform screen states two contradictory reasons at once

After enacting one reform, every other reform switches from a support figure
("100.0% / 50.0%") to "about 12 months", while the footer simultaneously says
**"No law can pass this upper house … This is a political lock, not a bug."**
Two different explanations for the same greyed-out list. Also, "not a bug" is
developer voice leaking into player-facing text.

---
