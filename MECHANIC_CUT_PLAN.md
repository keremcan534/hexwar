# MECHANIC CUT PLAN — Imperial Eye / HexWar

Companion to `MECHANIC_PRUNING_AUDIT.md`. **Analysis and plan only — nothing here has been
implemented.** Every proposal lists current dependencies, migration strategy, save compatibility,
AI impact, and UI impact. `SAVE_VERSION` is currently 14 (`save.js:32`); proposals note where a
bump vs. a lenient loader is the right call.

Guiding rules (from the repo's own docs, restated once):
- Keep repeated **decisions**, remove repeated **execution** (`CLAUDE.md` delegation rule).
- Money buys **capacity**, never units (`BETA_REPAIR_MASTERPLAN.md` §5 — absolute rule).
- Construction capacity stays scarce; the placeable Construction Sector goes. These are different things.
- Nothing is preserved for sunk cost; nothing is deleted without tracing consumers first.

---

## CUT NOW

Dead machinery with zero player-facing behaviour. Cutting these loses no decision and no simulation
output; each was verified against consumers by grep/trace (see audit §7).

### 1. Equipment tiers (`units.js:22-49`, `regiment.tier`)
- **Dependencies:** `upkeepWeight`, `armyPower` read `tierInfo` — both always resolve tier 1 (multiplier 1.0). No writer above 1 exists; upgrade cost requires `iron`, which `turn.js` deletes from budgets.
- **Migration:** inline tier-1 constants into `upkeepWeight`/`armyPower`; delete `EQUIPMENT_TIERS`, `tierInfo`, `regimentTier`, the `tier` field on `createRegiment`.
- **Save compat:** loader ignores unknown `tier` on old regiments — no version bump needed. Stop writing it.
- **AI impact:** none (AI never modernises).
- **UI impact:** remove tier labels ("Levy") from military rows.
- **Note:** if modernisation ever returns, it should return as a *national doctrine/tech outcome*, not per-regiment clicking — record the intent in `docs/tasarim.md` before deleting.

### 2. Multi-regiment division machinery (`units.js:162-212, 251-281`, `military.js:453-464`)
- **Dependencies:** loss distribution, `refreshArmy` dominant-type scan, `armyComposition` — all iterate a permanently 1-element array.
- **Migration:** collapse `unit.regiments[0]` to direct fields; simplify loss/refresh code.
- **Save compat:** loader maps old `regiments: [r]` → flat fields. No bump needed if the loader accepts both for one release; otherwise bump to 15.
- **AI impact:** none ("one unit = one regiment" is already the AI's stated model, `ai.js:216`).
- **UI impact:** composition line simplifies.

### 3. Dead flags `type.entrenched` / `type.support` OR wire them
- Battles never read them; the UI advertises behaviour ("infantry doubles terrain bonus", "artillery decisive in a stack") that does not exist — a lie to the player.
- **Preferred:** wire them in `battles.js` (this is also the cheapest way to make the infantry-only meta false). If not wired this pass, delete the flags *and the UI copy* together.

### 4. Dead state and dead notification kinds
- `economy.inventory` (written, never read), `economy.armySpending` (legacy), `city.foodStore`, `nation.rank`/`rankBonus` (always 1), notification kinds `GROWTH`, `INFRA`, `PROVINCE` (never emitted), `houseSupport` shim (keep only if diagnostic scripts still import it — check `scripts/`).
- **Save compat:** stop writing; loader tolerates their absence. No bump.
- **Exception:** keep `CRISIS` and `RESEARCH` kinds — both are claimed by KEEP-BUT-FIX items below (coalition warning, research-complete prompt).

### 5. Dead-end goods and never-built factories
- `synthetic_oil`, `explosives`, `clippers` are produced into a void; `SYNTHETIC_OIL_PLANT`, `EXPLOSIVES_FACTORY`, `CLIPPER_YARD`, `DYE_WORKS` were never built by any nation in 300 measured turns.
- **Choice per good:** give it a consumer (explosives → ammunition input; clippers → the convoy pool that already gates navy recruitment) **or** cut the good + factory. Do not ship producers without consumers.
- **Save compat:** cut goods need a loader that drops unknown market/factory entries — bump to 15 recommended if any are removed.
- **AI impact:** `investmentOptions` stops offering them (it mostly already doesn't — margin filter).
- **UI impact:** shorter factory picker — pure win on mobile.

### 6. UI shells that promise nothing
- Trade per-good policy buttons (disabled, "not wired yet"): **decide now** — P2-8 says they'd be a real lever post-R-01. Either schedule the wiring (see KEEP BUT FIX → Trade) or delete the buttons and keep the caption's honesty. Do not keep disabled controls another campaign.
- Politics "Release Nations" tab (permanently disabled buttons): remove the tab until the feature exists; the dossier can keep the data.
- Politics "Decisions" tab (empty): remove until the event system exists.
- `industrialRightsOn` / FACTORY_RIGHTS peace term: the term is purchasable but buys nothing. **Cut the term from `PEACE_TERMS`** until wired — selling a no-op for war score is a trap. (`CONCESSION` works; keep it.)

---

## CONVERT

Mechanics whose abstraction level is wrong: real effects, fake geography.

### 7. Construction Sector building → national Construction Capacity investment
**The constraint is protected; only the building ritual goes.**
- **Current dependencies:** `constructionPower` = `(5 + sectors×5 × upkeepFactor) × (1 + tech)` (`construction.js:224-231`); cement demand derives from build work; capture transfers buildings (`captureConstructionAt`); AI ladder builds sectors first (`construction.js:533-569`); save carries them in `nation.construction.buildings`.
- **Migration strategy:** replace the sector count with a national **Construction Capacity level** (0..N, same +5/level, same upkeep per level so the fiscal profile is identical). Raising a level costs gold *and enters the same construction queue as a project* — so build power still builds build power, the compounding tension survives, and the P1-5 gap ("money cannot buy capacity") closes with the mechanics we already have. Sources stay: base 5 + levels + infrastructure tech. Keep the regional *slot* system for whatever remains placeable (forts, factories) — slots are the anti-spam brake and are praised.
- **Save compatibility:** on load of v14, `capacityLevel = count(buildings, 'CONSTRUCTION_SECTOR')`; drop the building records. Bump `SAVE_VERSION` to 15 with this one-way migration.
- **AI impact:** replace the ladder's first rung with "invest in capacity when starved" — same trigger (`queuedWork > power × 12`), simpler code.
- **UI impact:** Construction screen header gains one "Capacity: level N (+5/wk each) — Invest" row; the 4-button palette shrinks; region rows remain for placeable things. Net fewer taps.
- **War capture:** today conquering the anchor hex steals the sector. Replace with the existing occupation lever: occupied regions already drop out of the atlas and default already degrades capacity via `upkeepFactor` — losing territory can reduce effective capacity proportionally to lost development instead. No gameplay is lost; a nonsensical rule ("national ministry changes hands because hex 88,14 fell") disappears.

### 8. University building → national Higher Education institution
- **Current dependencies:** `universityWorkforceBonus` (cap +24%) feeds factory hiring (`economy.js:1842`) and the literacy target (`economy.js:3024`); literacy feeds research points (`technology.js:203-216`). Post-R-18 this chain is real — effects must be migrated, not deleted.
- **Migration strategy:** a national **Higher Education level 0..4** (Academies → Regional Universities → National System → Research Institutions, per the brief's sketch). Level up = gold + a project in the construction queue (shares build power — the README's chain survives) + an education-budget floor to *maintain* the level (decay pressure creates the first genuine reason to keep the slider off its max-or-nothing poles). Effects: identical scalars mapped level→bonus (L4 = today's +24% cap so balance is unchanged), plus this becomes the natural future hook for research direction and qualified-POP growth.
- **Save compatibility:** on load, `higherEd = min(4, ceil(count(UNIVERSITY)/1.5))` (6-building cap → level 4). Same v15 bump as #7.
- **AI impact:** ladder rung "build 1 university" becomes "raise higher education when gold-rich and literate" — one condition swap.
- **UI impact:** one institution card (Politics or Budget screen) replaces a map-placement flow. The budget line "schools qualify workers; universities amplify it" finally points at a visible object.

### 9. Administration building → merged administrative capacity (see MERGE #11)

---

## MERGE

### 10. Two militancies + display-only cohesion → one unrest concept
- **Dependencies:** `nationalMilitancy` (reforms gate + movements), cohort `militancyOf`/`consciousnessOf` (display-only, self-documented as unread), "Internal Cohesion" (inline display).
- **Migration:** stability stays the single simulated meter (protected). Reform "heat" keeps its formula but is renamed/presented as pressure derived from the same satisfaction inputs. Population-screen MIL/CON columns are deleted **or** cohort militancy becomes the *one* formula feeding both the display and the reform gate. Internal Cohesion is deleted until something reads it.
- **Save compat:** none of these are saved. No bump.
- **AI/UI impact:** none / two fewer columns and one fewer fake stat.

### 11. Three administration concepts → one State Capacity system
- **Dependencies:** Administration building (+4% tax each, one consumer), `adminFunding` slider (`taxEfficiency = 0.55 + 0.45×f`, measured one-way optimum ORTA-18), `administrationCost` (`cities.js:203`, measured near-zero), README's promised super-linear empire cost (undelivered), promised control channel (unbuilt).
- **Migration strategy:** one **Administrative Capacity** driven by the budget line, where *cost scales with population + provinces + capital distance* (the README design, finally delivered) and output is tax efficiency **and** the control-recovery channel the code comment promised. The slider then has a real curve: underfund a big empire and collection + postwar integration degrade; overfunding has diminishing returns. Expansion becomes a budget decision, exactly as the brief sketches — no building #17, ever.
- **Save compatibility:** building count folds into a starting capacity credit on load (v15). `adminFunding` value carries over unchanged.
- **AI impact:** `adjustSocialAI`/`adjustFiscalAI` already move sliders; delete the ladder's administration rung.
- **UI impact:** Budget screen's admin slider gains the "why this number" breakdown (stability tooltip pattern — already the house style); construction palette loses a button.

### 12. Duplicate computations and contradictory numbers
- Merge the twice-computed ideology/issue mixes (`reforms.js` vs `census.js`) into one source; unify the two literacy figures, two unemployment figures, two weekly balances (Beta 2 §8-9); make the battle card use province names like the notification already does.
- **Risk:** low, display-layer; but each removes a "which number is true?" tax.

---

## AUTOMATE

Repeated execution with no decision content. In every case the *decision* named is kept.

### 13. Recruitment execution (decision kept: what mix, under which caps)
- Quantity ordering ("Order ×5", shift-click), and/or a standing **army intent** ("maintain 20 infantry / 6 artillery") that feeds the same queue the AI already uses (`README`: AI uses the same queue — the plumbing exists).
- Training slots, equipment gates, manpower draw, blocker strings: untouched (protected).
- Queue reorder: same ⤒/⤓ fix construction got (R-11), shared widget.
- **AI impact:** none. **Save:** none. **UI:** one quantity control + one intent card.

### 14. Commander assignment default (decision kept: which general leads which front)
- Flip `autoAssign` default to **on** (`command.js:140`) — the beta asked for exactly this. Manual reassignment stays.
- **Save compat:** existing saves keep their stored toggle; only new nations change. No bump.

### 15. Theater-level stance orders (decision kept: where to attack)
- One national/per-war "advance / hold" that fans out to that war's commands; per-general override stays for the players who want it. Kills the seven-clicks ritual.
- **Prerequisite bug:** stances silently reverting (B2-021) must be root-caused first — automation on top of a revert bug automates the bug.

### 16. Subsidy policy (decision kept: which industries the state protects)
- Replace per-plant toggles with a policy: "subsidise military industries in wartime" / "subsidise none" / manual list. Give the player the same auto-cleanup the AI already has (`economy.js:2441-2446`).
- **Save compat:** existing `factory.subsidized` booleans seed the manual list. No bump.

### 17. Factory build flow (decision kept: what, where, whose money)
- Modal stays open after purchase; multi-queue from one visit; stable table sort (P2-3 is a bug). 160 clicks → ~20 for the same decisions.

### 18. Division delegation — wire `orders.js`
- Add the AUTO/HOLD controls the design rule assumes (`CLAUDE.md`), plus expose `selectNextIdle`. The layer exists and runs every turn; only buttons are missing.

---

## KEEP

Working, low-burden, correctly abstracted — do not redesign casually.

- **Trade auto-clearing + ledger/dossier** — correct abstraction; the screen answers "why" without demanding anything.
- **Private investment & project support** — praised automation with a meaningful override.
- **Automatic factory upgrades, hiring, worker assignment** — "the growth decision belongs to the economy."
- **War budget macro button** — the intent-layer pattern; consider more presets, never more sliders.
- **City founding** — rare, real location decision.
- **Front derivation from borders** — delegation done right (its `command.js` CPU cost is a perf task, not a design one).
- **Diplomacy's honest minimalism** — no fake buttons; expansion is future work.
- **Population/census as a read-only ledger** — after trimming confession filler and dead columns (#10).
- **Hegemony scoreboard, rally points, auto-officer creation, automatic borrowing.**

---

## KEEP BUT FIX

The concept earns its place; the current implementation leaks player attention or fails the
one-obvious-answer test.

### 19. Fort — the location-test survivor, currently failing it
- Keep placeable **only** with real geography: per-province (or hex) placement, effect on that
  place's battles, visible on the map, and an assault that *feels* different (siege time, the
  Engineer interaction already exists). Fix the perverse rule where a fort's bonus vanishes the
  moment its own region is partially occupied — forts must matter *most* exactly then.
- AI must place them toward threats (borders/capital/chokepoints), not by free-slot count.
- If this redesign isn't worth its cost, the honest fallback is **cut the building** and let
  terrain + entrenchment + cities carry defence — both testers played 68–70 years without missing it.

### 20. Budget sliders — give every knob a second defensible answer
- Tariff: retaliation/import-cost pain so 100% stops being free (measured exploit YÜKSEK-4).
- adminFunding: resolved by MERGE #11.
- Social programs: real costs at scale (they're ¤21/wk for +24 stability today) and/or ties into
  Higher-Education maintenance (#8) so max-everything stops being the answer.
- Taxes: a satisfaction/flight curve that actually bends revenue (no Laffer today, ORTA-19).

### 21. Reforms — keep the chamber, make the ladders honest
- The upper-house gate is praised and protected. Fix: wire or cut the **10 of 21 ladders that feed
  no modifier** (`penal_system`, `voting_system`, `debt_law`, `slavery`, `public_meetings`,
  `border_policy`, `conscription`, plus the three structural ones that only reshape the chamber).
  Each kept ladder needs at least one consequence chain; `conscription` has an obvious one
  (manpower/training), `debt_law` another (credit capacity).
- `school_system` should feed the education/Higher-Ed chain, not just cost money.
- Silent constitutional changes (B2-017) get narration — a halting or at least distinct notification.

### 22. Technology — fewer, fatter, actually wired
- Follow the repo's own audit: wire the six dead modifiers **one at a time, measured** (P1-6), or
  delete the ones not worth wiring; kill the always-1 rank bonus; emit `RESEARCH` on completion and
  let the player actually hold the direction decision (auto-pick currently races them and no
  notification ever invites them back).
- Author the remaining categories only under the "every tech unlocks / changes behaviour / creates
  demand — no +2% filler" rule already written in `TECHNOLOGY_GAMEPLAY_AUDIT.md` §9. Military techs
  are the highest-value gap: they are what breaks the infantry-only meta (Beta 2 §15).

### 23. Infamy / coalitions — make the brake bind
- The anti-snowball device the whole hegemony design rests on has never fired in three campaigns
  (peak 33/22 with no coalition; salami raids at ≤6.5 forever). Fixes are tuning, not new systems:
  charge annexation at the peace table meaningfully against the decay rate, slow decay while at war,
  and emit the already-defined `CRISIS` (halting) notification when a coalition forms.
- This also treats the "yearly salami raid" again?-moment at its cause: the repeated attack decision
  stays available but stops being free.

### 24. Navy — shrink to its real size
- Today: one hull, per-ship manual orders forever, no blockade/transport/supremacy, admirals excluded
  from the command layer, structurally impossible before 1850 with no explanation.
- Either give fleets the same delegation land has (a naval command with a patrol/escort/raid intent —
  smallest honest version), or park the navy behind an explicit "not yet a system" gate like
  diplomacy does. Do not leave a fully-manual micro sink attached to zero strategic output.
- Fix the missing "why" on pre-1850 impossibility (P2-7) either way.

### 25. Notifications — tier the feed
- Two tiers (consequential vs ambient), a scrollable log (Beta 1 §21-10), auto-expire for routine
  cards, never overlaying panel tabs (P2-4). Emit-or-delete the five dead kinds. War/peace/coalition/
  government-change are consequential; factory level-ups are ambient.

### 26. Disband — wire the existing function
- `disband()` exists, refunds survivors to their home provinces, has no caller. Army size is currently
  a one-way population ratchet (B2-024). One button on the unit sheet.

### 27. Construction queue widget — finish R-11
- Drag-or-jump reordering already half-done (⤒/⤓); remaining: stable row identity across redraws,
  and the 8+-row viewport overflow. Same fixes apply to the training queue (shared widget).

---

## DO NOT TOUCH

Protected by measured playtest praise. Redesigning these loses the game's best moments.

1. **Build power scarcity** — base 5/week, queue, compounding investment, regional slot limits.
2. **The mobilisation constraint** — training slots, weeks-per-regiment, equipment stockpiles that
   block orders with reason strings. *Money never buys soldiers.*
3. **The peace table** — war score as a budget, priced terms, map-click demands (Beta 3 W-1).
4. **Automatic debt/default chain** — "the reason I could genuinely fail" (the E-1 death-spiral floor
   is a balance patch, not a redesign).
5. **Stability model + itemised "why" tooltip** — the house explanation pattern; extend it, don't rebuild it.
6. **Upper-house composition gating reform direction.**
7. **Recruitment permanently consuming population** (with #26 as its release valve).
8. **The disabled-reason discipline** — every blocked control says why; the construction screen's
   silent rows were the one violation and cost a whole campaign. This is a hard invariant for all
   changes in this plan.
9. **Planning 100%→40% on attack** — the single number that teaches hold-vs-advance.
10. **"WHY THE PRICE MOVES" / trade dossier explanations.**

---

## SEQUENCING NOTE (for the approval discussion)

Cheap, zero-risk, high-yield first: CUT NOW items (#1–6) and the AUTOMATE defaults (#14, #17, #18)
touch no balance. The building conversions (#7, #8, #11) are one coordinated save-version-15 change
and should land together. The KEEP-BUT-FIX economy items (#20, #22, #23) shift measured baselines
(`audit:long-run`, `audit:market`, `audit:war-pressure`) and each needs its own measurement pass per
the repo's standing practice: **you do not repair what you have not measured.**

Open dependency flagged during this audit: `audit:save` is already failing on master (battles don't
round-trip; 100-week divergence, per `AUTONOMOUS_DEV_REPORT.md`). Any save-version-15 migration work
should fix or at least not worsen that first.
