<!--
  Shared for external review. Self-contained: no images, no external files needed.
  Every line reference points at the repository this describes; you will not have that
  repository, so treat the citations as provenance, not as things to open.
-->

# Imperial Eye / HexWar — Budget Mechanic: Analysis and Simplification Proposal

**Context for the reader.** Imperial Eye (repo name `hexwar`) is a mobile-first, browser-based
grand-strategy game set in the 19th century — hex map, weekly turns, ~30 AI nations, an economy with
classes, factories, trade, technology and politics. It is written in plain ES modules with Canvas2D:
no dependencies, no build step. Source comments are in Turkish.

**What this document is.** A design review of one mechanic only — the **Budget** — carried out in
three parts: (1) reverse-engineering what the code does today, (2) measuring every budget control in
a headless simulation harness that ships with the project, and (3) proposing the simplest model that
preserves the strategy. **Nothing here has been implemented.** No source file was modified.

**The design goal it was written against.** Simple rules + clear causal connections + repeatable
strategic decisions = depth. Complexity should live *between* systems, not inside every calculation.
A player-facing value should ideally depend on no more than three primary inputs, and any mechanic
whose effect cannot be felt in normal play should be simplified or removed.

**The one methodological idea worth knowing before reading.** Before judging any control, the
*noise floor* was measured: the same scenario was run on six different random seeds with nothing
touched, to see how much each outcome varies on its own. Treasury varies 50.8% seed to seed. A lever
whose entire range moves an outcome by less than that outcome's own seed-to-seed variation cannot be
perceived by a player, no matter what its formula looks like. Every verdict below is anchored to that
comparison rather than to opinion.

---

# The Budget Nobody Has to Balance

> Imperial Eye’s budget has nine sliders, twenty-four treasury writers and a thirty-five line ledger. Measured across a hundred and twenty headless campaigns, most of it does not reach the player. This is what the code does today, what the numbers say about it, and the simplest model that keeps the strategy.

**Evidence:** 120 headless runs | **Horizons:** 160 / 300 / 700 / 900 wk | **Seeds:** 32 distinct | **Noise floor:** treasury CV 50.8% | **Harness:** audit/harness.mjs

> **How every number here was produced**
>
> Each claim comes from `runScenario()` in `scripts/audit/harness.mjs`: one isolated child process per scenario, identical seed and warm-up across a matrix, one lever moved at a time, war suppressed unless the experiment is about war. Levers are re-applied every week so the fiscal AI and the ruling party’s bands cannot drag them back. Headline claims were repeated on two or more seeds.
>
> One caveat that cost a correction: `snapshotNation` exposes individual expense lines but omits `projectCost` and `shareCost`, which on two of three seeds carry **27.6–33.3%** of all outflow. Composition figures here use `ledger.income` and `ledger.expenses`, which are complete; any audit that sums the exposed lines instead will understate spending by roughly a third.
>
> Before any lever was judged, the **noise floor** was measured: six seeds, 160 weeks, default settings, nothing touched. Treasury varies **50.8%** seed to seed, needsMet **26.5%**, stability **5.5%**. A lever whose entire range moves a metric less than that metric’s noise floor cannot be perceived in play, whatever the formula says.


---

## What the budget actually is  
*PART 1*

Reverse-engineered from source. This section describes current code, not intended design; where a comment and the code disagree, the code is reported.


### There is no budget module

The first thing to know is structural: **the budget is not one system, it is two half-systems and a reconstruction.**

*The three representations of a nation’s weekly finances. All three are live at once.*

| Pipeline | Computes | Writes treasury | Source |
|---|---|---|---|
| A — `nationBudget()` | City + province gold production, army *wages*, administration, corruption | gold += budget.net.gold | cities.js:381–457 → turn.js:563 |
| B — `fiscalBalance()` | Class income, three class taxes, tax efficiency, social programmes, construction upkeep | gold += economy.fiscalNet | economy.js:2678–2728 |
| C — `updateLedger()` | Re-reads A and B plus 12 side channels and rebuilds a 35-key record for the screen | none — pure derivation | economy.js:3522–3614 |

Nothing forces A and B to agree, and nothing but C ever adds them up. The fiscal AI has to do the addition by hand every week — `const weekly = (nation.budget?.net?.gold ?? 0) + economy.fiscalNet` appears verbatim in two different functions (economy.js:2746 and economy.js:2855) with a comment explaining that `fiscalNet` alone is misleading. That comment is the system apologising for its own shape.

Beyond A and B, **24 call sites across six modules mutate `nation.gold` directly.** Construction refunds, factory support, unit purchases, treaty tribute, company share sales, nationalisation, tariff settlement, interest, borrowing, repayment and default all write the treasury on their own, then separately deposit a number into an `economy.*Gold` scratch field that `updateLedger` drains and zeroes once a week.


### Canonical state

*The fiscal fields on `nation.economy`. Levers are player-writable; outputs are recomputed every week and stored anyway.*

| Field | Kind | Range | Written by | Source |
|---|---|---|---|---|
| `taxes.lower/middle/upper` | lever ×3 | 0–100 | player slider; `adjustFiscalAI` (capped 5–35/42/45) | economy.js:1631, 2861–2877 |
| `tariff` | lever | −50–100 | player; AI drifts ±2/wk toward party doctrine | economy.js:1635, 2887–2904 |
| `social.education/health/welfare` | lever ×3 | floor–100 | player; `adjustSocialAI` ±10/wk *unclamped* | economy.js:1664, 2777–2790 |
| `militaryWages` | lever | 25–100 | player; `adjustWarFiscalAI` | economy.js:1640, 2951 |
| `militaryProcurement` | lever | 25–100 | player; `adjustWarFiscalAI` | economy.js:1640, 2950 |
| `adminFunding` | lever | 30–100 | player only — no AI writer | economy.js:1649–1652 |
| `subsidyPolicy` | lever | 3 values | player; applied for player only | economy.js:1673, 3859 |
| `armySpending` | legacy alias | 25–100 | writes both military levers; kept for old saves | economy.js:1654–1662 |
| `taxRevenue, tariffRevenue, socialCost, constructionUpkeep, fiscalNet` | derived, stored | — | overwritten every week by `fiscalBalance` | economy.js:2718–2726 |
| `ledger` (35 keys) | derived, stored | — | rebuilt wholesale every week | economy.js:3581–3614 |
| `classes[c].income / taxPaid / satisfaction / needsBudget / savings` | derived, stored | — | `fiscalBalance`, `populationDemand` | economy.js:2702–2709, 2600–2654 |
| `nation.gold`, `nation.debt` | canonical | — | 24 call sites, 6 modules | see above |


### The formulas

Every number the budget produces, transcribed literally. Input count is the number of independent quantities that can change the result.

*Budget formulas as written. Nothing here is paraphrased.*

| Output | Expression | Inputs | Source |
|---|---|---|---|
| Class income | incomePool×weight + wagesPaid×split + (upper: profit×0.5 − withheld) | 7 | economy.js:2700–2707 |
| Tax collected | Σ income_c × taxes_c/100 × taxEfficiency | 4 | economy.js:2708–2716 |
| Tax efficiency | 0.55 + 0.45 × clamp(adminFunding/100, 0.3, 1) | 1 | economy.js:1325–1328 |
| Social cost | (pop/10000) × Σ(level_p × rate_p) + (pop/10000) × socialBurden | 5 | economy.js:1797–1807 |
| Administration cost | ((cities−free)^1.45×0.9 + provinces×0.06 + distance + (pop−free)/10000×0.06) × adminFunding | 5 | cities.js:210–215, 437–439 |
| Army wages | armyWeight × UNIT_UPKEEP.gold × militaryWages/100 | 3 | cities.js:430–433 |
| Combat power | armyPower × (0.55 + wages×0.45) × (0.65 + readiness×0.35) × terrain × general × planning | 6 | battles.js:117–122 |
| Training speed | 0.45 + 0.4×wages + 0.15×supply | 2 | recruitment.js:363–367 |
| Org. recovery | (0.6 + 0.4×wages) × (0.7 + 0.3×supply) | 2 | turn.js:421–425 |
| Reinforcement rate | BASE × (0.25 + funding×0.75) × (1+general) × (1+tech), funding = max(0.25, proc)×supply | 5 | reinforcement.js:21–27 |
| Class satisfaction | 0.35 + afford×0.5 − taxRate×0.28 + welfare×0.14 + reformMood − joblessBite | 6 | economy.js:2649–2654 |
| Literacy target | clamp(0.08 + education×0.62×(1+higherEd) + literacyReach, 0, 0.95) | 3 | economy.js:3804–3809 |
| Literacy stock | literacy += (target − literacy) × 0.001  ← per week | 2 | economy.js:3796, 3811–3817 |
| Research points | (literacy×4 + middleShare×1.5 + clerks + 1) × (1 + researchRate) | 4 | technology.js:337–352 |
| Population growth | … × (1 + health/100×0.35) × nourishment … | 2+ | provinces.js:790 |

Only two of these formulas — tax efficiency and literacy stock — are within the Constitution’s preferred budget of three primary inputs. Class income needs seven, and it is the base of everything: it decides tax revenue, household budgets, satisfaction, stability and ultimately party support.

### CURRENT — the plumbing

```
PLAYER    tax x3   tariff   education  health  welfare   mil.wages  mil.procure  adminFunding  subsidyPolicy
             |        |          |        |       |          |           |            |             |
             +--------|----------+--------+-------+          |           |            +--+          |
             |        |                   |                  |           |               |          |
             v        v                   v                  v           v               v          v
COMPUTE  [fiscalBalance()]     [populationDemand()]   [nationBudget()]   [settleGlobalTrade()]  [22 other write sites]
          economy.js:2678       economy.js:2490        cities.js:381      economy.js:3417       construction, command,
          class income, tax,    household baskets,     city gold,         tariff revenue,       companies, turn
          social, construction  satisfaction           army wages,        external settlement   refunds, purchases,
                |               (writes NO gold)       administration            |              tribute, shares,
                |                                              |                 |              interest, borrowing
                | fiscalNet                    budget.net.gold |                 |                     |
                +-------------------------------+-------------+-----------------+---------------------+
                                                |
                                                v
STATE                        ==========================================
                             ||  TREASURY   nation.gold / nation.debt ||
                             ||  24 write sites across 6 modules      ||
                             ==========================================
                                                |
                                                v
DERIVE                       [ updateLedger()   economy.js:3522 ]
                             rebuilds a 35-key record every week by
                             re-reading everything above

                                                |
                                                v
DISPLAY                      [ Budget screen ] + hud.js:719 + hud.js:1137 + screens.js:782
                             FOUR different "weekly balance" numbers, four formulas
                             re-derives 3 simulation formulas by hand; 2 of them are wrong
```

**Ordering trap.** `fiscalBalance` zeroes `economy.tariffRevenue` at `:2722`; `settleGlobalTrade`
refills it at `:3417`. The fiscal AI runs *between* those two writes, so every week every AI
government decides whether it is solvent while looking at a number that excludes a revenue line
comparable to all three tax sliders combined — and then drifts the tariff, a lever whose income it
structurally cannot see.

**Second ordering trap.** `produce()` runs at `turn.js:481`; `runBattles` at `:512` and
`executeOrders` at `:518`. Territory changes *after* the economy is booked, so a week in which five
provinces change hands books none of them in that week's taxes, RGO output or administration cost.

***CURRENT — the plumbing.** Nine controls feed four unconnected computation paths. Two of them add money to the treasury independently and never see each other’s result; a third settles trade after the fiscal week has already closed its books; twenty-two further sites write `nation.gold` on their own. Because no single function ever computes a balance, a fourth pass has to reconstruct one from thirty-five separate fields so the screen has something to print — and the screen then re-derives three simulation formulas by hand, getting two of them wrong.*


---

## Four balances, none of them agreed  
*PART 1 · ii*

The clearest evidence that the budget has no single owner is that the game cannot tell the player what their balance is. Four figures are on screen, computed four different ways.

*Four numbers, four formulas, all presented to the player as the weekly balance.*

| Where the player sees it | What is computed | What it leaves out | Source |
|---|---|---|---|
| Top bar, next to the treasury | budget.net.gold + fiscalNet | procurement, subsidies, project funding, state purchases, interest, treaty tribute, strategic imports | hud.js:1137 |
| Nation card, labelled “Weekly balance” | fiscalNet alone | all of the above, *plus* city and province revenue, army wages and administration | screens.js:782 |
| Decision card, labelled “weekly gold” | budget.net.gold alone | the mirror image of the row above — taxes, social spending and construction, but it does keep city revenue and army wages | hud.js:719 |
| Budget screen, “Last week’s balance” | ledger.net | nothing — this is the real one | screens.js:1778, economy.js:3613 |

The same panel also fails to add up internally. `fiscalBalance` stores each class’s `taxPaid` **gross** (economy.js:2708) and multiplies only the *sum* by tax efficiency (:2716). The budget screen prints the gross figure on each of the three tax rows (screens.js:1584) and the post-efficiency figure in “Total income” (:1633). At the 30% administration floor the three rows sum to **1.46×** the revenue the treasury actually books, in the same panel, eighty pixels apart.

> **The ordering trap**
>
> `economy.fiscalNet` holds two different quantities within one week. `fiscalBalance` assigns `fiscalNet = taxes − social − construction` (:2725) and deliberately zeroes `tariffRevenue` (:2722). Much later, `settleGlobalTrade` adds the tariff income back (:3417–3420). The fiscal AI runs *between* those two writes.
>
> Tariffs are one of the two largest revenue lines — **41–51%** of income for the measured nation at week 201, and 30.7% against direct taxation’s 34.4% across a 30-nation world at week 161. Either way it is comparable to all three tax sliders combined. So every week, every AI government judges whether it is solvent while looking at a number that excludes half its income. A protectionist nation with a full treasury can conclude it is broke and start cutting schools.


### Expenses the player is never shown

The “Weekly Expenses” column does not sum to `ledger.expenses`, and the gaps are not small.

*Outflow the budget screen omits, misattributes, or prints below its own total.*

| Line | What happens | Size | Source |
|---|---|---|---|
| External settlement (negative) | Counted in `expenses` but rendered under a separate “Tariffs” header *below* the Total expenses figure | 7.4–12.5% of all outflow — more than administration, subsidies and interest combined | economy.js:3579–3580 vs screens.js:1756–1774 |
| `shareCost` | Foreign share purchases have no row on the screen at all | — | screens.js:1616–1737 (11 rows, none for it) |
| Per-programme social cost | `socialShare()` splits one total by *slider level*, ignoring the per-programme rates 0.34 / 0.30 / 0.46. Education and Welfare both at 100 display an equal split when the true ratio is 0.34 : 0.46 | up to 35% misattribution between rows | screens.js:188–194 vs economy.js:1800–1806 |
| Reform-mandated social burden | With all three sliders at 0 but reforms imposing a burden, every social row reads **0** while the money is still spent | 6 of 27 nations at week 520; one paying 8.52 gold/week invisibly | screens.js:191–193 |
| `projectCost` | Forts, national investments, state factories and project top-ups. The screen merges it into “Construction” correctly — but the audit harness does not expose it, so every measurement built on `snapshotNation` is blind to it | 10.5–17.0% of cumulative outflow | harness.mjs:150–157; economy.js:3553–3554 |


### Two promises the code does not keep

Both are cases where a comment or a UI string describes a mechanic that was never implemented or has since been deleted underneath it.

- **Army upkeep is not equipment-weighted.** cities.js:431–432 states that upkeep depends on equipment weight rather than regiment count, “so army modernisation becomes the real late-game expense”. `upkeepWeight()` returns `unit.regiments.length` (units.js:24–26; the equipment tiers the comment refers to were deleted). Army wages are a flat **1 gold per regiment per week** times the slider. There is no modernisation cost channel at all.
- **Reparations collect nothing.** `PEACE_TERMS.REPARATIONS` promises “a share of their treasury income” (peace.js:111–114), but `payTreaties` charges 20% of `budget.net.gold` (turn.js:594–598) — city and province gold minus army wages minus administration, which excludes tax, tariffs and settlement entirely. Median `ledger.income` is 44.8–48.6 while median `budget.net.gold` is 6.2–10.5 and negative for some nations, where `max(0, …)` makes the payment exactly zero. Over a 520-week run, `treatyCost` was **0 for every nation in every measured window**. Winning a war and imposing reparations transfers nothing.

> **The one expense that cannot be switched off**
>
> Three things buy military goods, and they check three different things before spending. Strategic imports clamp against money on hand — `affordable = nation.gold / unitPrice` (economy.js:3250). Retained factory equipment clamps against `retainedBudget / price` (:3894), a budget derived from *last week’s* `ledger.income` rather than from the treasury. Army weekly consumption (:3947) checks **nothing at all**: it subtracts from `nation.gold` unconditionally and pushes it negative, straight into the borrow-or-default branch. Combined with the procurement floor of 25 and the groceries floor at 50%, this is the one outflow a player in a fiscal crisis has no lever against.
>
> It is also, by late game, the *largest* outflow: `procurementCost` was **39.6%** of all spending in weeks 417–520 against army wages’ 9.9%, and within it the split between state-retained factory output and the army simply eating groceries and ammunition at market price flips from 76/24 in the first century to **5/95** thereafter. What the budget screen calls “Military Procurement” is, eventually, the grocery bill.


### Phase-order dependencies

A full read of `turn.js:342–547` and `economy.js:3653–4005` yields roughly **thirty ordering constraints** that the budget slice depends on. Reordering any of them silently changes the simulation rather than breaking it — which is the expensive kind of coupling. A representative few:

- `populationDemand` runs *before* `fiscalBalance`, so household budgets always spend last week’s income (economy.js:2570, comment at 2567).
- Household baskets are priced with *last week’s* import share, because this week’s trade has not cleared (economy.js:2523–2529).
- `settleDebt` is called inside `updateLedger` at :3567, but `economy.ledger` is not reassigned until :3581 — so borrowing capacity is computed against last week’s income (:3436).
- `nation.budget` is computed in `produce()` (turn.js:559) and consumed by `fiscalBalance`’s callers much later; treaty tribute is charged as a share of it (turn.js:597) before the fiscal week runs at all.
- `settleDebt` is reached from two phases and reads a different vintage of `ledger.income` from each — last week’s when called at :3567, this week’s when called from `runNationalEvents` (turn.js:525) or the UI.

> **Conquest is invisible to the week that won it**
>
> `produce()` runs at turn.js:481. `runBattles` runs at :512 and `executeOrders` at :518 — both of which flip `nation.tiles`, `tile.controller` and `province.econ.control`. **A week in which five provinces change hands books none of them in that week’s taxes, RGO output or administration cost.** Then `checkVictory` at :535 scores the pre-battle `nation.budget` against the post-battle `nation.tiles` in the same expression.
>
> This is also the most likely reason the six-seed war test found a 20% attack-power difference and zero economic difference: within a single week, winning does not reach the budget at all.


### Dead and vestigial state

*Budget state that exists but does nothing, or does something other than what it says.*

| Item | Status | Source |
|---|---|---|
| `fiscalBalance(nation, base, industrialOutput)` | Third parameter is never referenced in the body. Industrial value reaches income only via `wagesPaid` and `factoryProfit`. | economy.js:2678 |
| `economy.armySpending` | Write-only inside the game. Only writer is the legacy setter branch; only reader is a `??=` migration that never fires. Serialised anyway. | economy.js:1654–1662, 1285–1286 |
| `FUEL_FIX` | Presented as an A/B flag. Unconditionally `true` in the browser; the entire else branch is unreachable in the shipped game. | economy.js:1719–1720 |
| `economy.subsidyPolicy` | Applied for the human player only. AI nations set `factory.subsidized` through a different code path, so the same stored field means two different things. | economy.js:3858–3859 vs 2984–3007 |
| `INCOME_WEIGHTS` = 0.42 / 0.33 / 0.25 | Fixed forever, never reconciled with actual class populations even though those move every week. A nation whose upper class has collapsed to 1% of the population still books 25% of the income pool to it. | economy.js:2676, 2700–2709 |
| `cancelTraining` refund | Breaks the project’s own accounting law L9. The refund is added to `nation.gold` (recruitment.js:475) without reversing the `outlayGold` the order recorded — the decrement that economy.js:1388 performs for the analogous factory case is simply missing. Reproduced: order infantry for 25, cancel, and the following week Δtreasury exceeds the ledger’s prediction by exactly 25.000. The audit for L9 cannot catch it because it runs with `playerNation = -1` and never cancels an order. | recruitment.js:469–481 |
| `dropInvalidProjects` refund | The same defect a second time. `nation.gold += project.funded` (economy.js:2100) with no `projectGold` decrement — while `cancelConstruction` in the sibling module performs exactly that counter-entry (construction.js:615–617). Two of the three refund paths in the codebase are unbooked; the third shows how it should be done. | economy.js:2092–2102 |
| Education slider minimum | UI renders `min="0"`; the engine floors education at 25/40/55/70 depending on Higher Education level. Dragging to zero snaps back with no explanation — the band note is wired only to tariff and the two army sliders. | screens.js:1598–1600, 1694–1714 vs economy.js:1664–1671 |


---

## Which levers can actually be felt  
*PARTS 5–6*

Every control driven to both extremes on identical seeds, then compared against the measured seed-to-seed noise floor for the metric it is supposed to move.

A lever is only perceivable if moving it across its whole range changes an outcome by more than that outcome varies *by itself* between campaigns. The floor is not a rhetorical device: it was measured first, on six seeds with nothing touched.

| Lever | Effect ÷ noise floor |
|---|---|

*Effect of the lever’s full range ÷ the noise floor of the metric it moves, logarithmic. The brass line is the floor: anything to its left cannot be distinguished from a different random seed. Metrics: tax and welfare on lower-class satisfaction (floor 5.3%), tariff on lower-class satisfaction, health on population (floor 39.1%), administration on treasury (floor 50.8%). The two military levers are excluded here because a peaceful run cannot judge them — see below.*


### Taxation — a real cost attached to a benefit nobody needs

*All three class taxes moved together. Seed tx-a, 40-week warm-up, 160 weeks, peaceful. Seed tx-b confirms every direction.*

| Tax | Tax revenue | Treasury | needsMet | Lower sat. | Stability | Population |
|---|---|---|---|---|---|---|
| 0% | 0.00 | 38,186 | 0.789 | 0.695 | 0.641 | 941,533 |
| 10% | 94.42 | 48,725 | 0.788 | 0.666 | 0.604 | 939,973 |
| 50% | 444.76 | 85,876 | 0.747 | 0.557 | 0.504 | 931,833 |
| 90% | 763.96 | 116,981 | 0.568 | 0.433 | 0.374 | 901,395 |
| 100% | 883.33 | 131,500 | 0.257 | 0.399 | 0.335 | 848,537 |

The damage is real and legible: starve your population and it shrinks, gets miserable, and destabilises. But look at the second column of the first row. **A nation that collects no tax at all for 160 weeks finishes with 38,186 gold, and rising.** The benefit side of taxation is buying a resource the player already has in unusable quantity.

> **Why no lever can matter yet**
>
> Measured against the full ledger totals across three 200-week worlds, the large factory-rich nation — the one a player is most likely to be running — spends **21–51% of its income**. The world’s *median* nation spends **76–95%**. The player’s treasury ends up worth tens to hundreds of weeks of net flow, so whatever a slider does to the flow is absorbed by the stock before it can be seen.
>
> The distribution is bimodal and that is the whole problem: median treasury across 31 nations is **45** gold on a median weekly net of **+0.5**, while five runaway nations sit on 21,000–22,000. The budget constraint binds hard on small AI states and not at all on the one nation with all the sliders. *Simplifying the formulas will not fix this.* Until expenses scale with the empire, the budget is a decoration for exactly the player who is asked to manage it.


### The satisfaction of the dead

At 100% tax the numbers stop being monotone, and the reason is a real defect rather than a balance question.

*Upper class under rising taxation. Seed tx-a, 160 weeks.*

| Tax | Upper population | Upper basket cost | Upper satisfaction |
|---|---|---|---|
| 50% | 27,000 | 60.43 | 0.268 |
| 80% | 17,000 | 43.21 | 0.179 |
| 90% | 11,000 | 26.13 | 0.154 |
| 95% | 7,000 | 16.31 | 0.140 |
| 100% | 0 | 0.0000 | 0.578 |

`affordShare = outOfPocket > 1e-9 ? clamp(spendable / outOfPocket, 0, 1) : 1` (economy.js:2602–2604). A class with no members has no basket, and a basket of zero is trivially affordable, so the fallback branch awards full affordability. Satisfaction becomes `0.35 + 1×0.5 − 1×0.28 = 0.57` — matching the measured 0.578. **An extinct class reports the highest satisfaction in the matrix**, and that figure feeds stability and the display.


### Administration — a 46% number attached to a 0.6% outcome

*adminFunding across its whole legal range. Seed adm-a, 160 weeks. “Net gain” is extra tax collected minus extra administration paid, against the 30% floor.*

| adminFunding | taxEfficiency | Admin cost | Tax revenue | Net gain | Treasury | Control | Stability |
|---|---|---|---|---|---|---|---|
| 30% | 0.685 | 5.19 | 25.38 | — | 16,351 | 100.000 | 0.548 |
| 50% | 0.775 | 8.65 | 28.71 | −0.13 | 16,379 | 100.000 | 0.548 |
| 70% | 0.865 | 12.11 | 32.05 | −0.25 | 16,407 | 100.000 | 0.548 |
| 85% | 0.933 | 14.71 | 34.55 | −0.35 | 16,427 | 100.000 | 0.548 |
| 100% | 1.000 | 17.30 | 37.05 | −0.44 | 16,448 | 100.000 | 0.548 |

The budget screen advertises this lever with “tax efficiency 68% … 100%” (screens.js:1693) — a 46% swing in a number the player can watch move. After 160 weeks the treasury differs by **0.6%**, province control is identical to three decimals, stability is identical to three decimals, and on this seed raising the slider is *net negative*. On the second seed it is net positive by 6.5 gold a week. The sign of the optimum is not stable across seeds, which means there is no strategy to learn.

This is the textbook case the brief describes: **mathematically different, strategically identical.** All 31 AI nations in a 200-week world sit at exactly 100.

At the shipped world size it is weaker still. All four terms of `administrationCost` are floored at zero (cities.js:210–215) and the median nation clears none of the thresholds — 3 free cities, 120 free provinces, 250,000 free people. On a standard 160×96 map only **35–38 of 65 nations pay anything at all**, and the median bill is **0.1–0.3 gold a week** against a median income of 38–71: under half a percent. The slider’s advertised benefit is worth about 46% of tax revenue. A control whose cost is a rounding error and whose benefit is a third of income has exactly one correct setting.

The comment at cities.js:204–208 says the population term was added precisely so that “the slider becomes a real balance”. Measured at product scale, it did not.


### Public Health — wired to something real, but too small to notice

Health has exactly two consumers in the whole codebase: a population growth multiplier `1 + health/100 × 0.35` (provinces.js:790) and a `+2.5` term on `standardOfLiving` (economy.js:2660), which feeds city growth. Given 700 weeks — thirteen game years, far longer than a player will wait — to express a 35% growth bonus:

*Public Health at 0 vs 100, two seeds, 700 weeks, peaceful.*

| Seed | Health | Population | Treasury | Weekly social cost |
|---|---|---|---|---|
| h1 | 0 | 2,400,838 | 144,124 | 27.61 |
| h1 | 100 | 2,448,103 (+2.0%) | 80,153 (−44%) | 101.60 |
| h2 | 0 | 1,003,665 | 63,287 | 17.76 |
| h2 | 100 | 1,017,244 (+1.4%) | 45,820 (−28%) | 48.52 |

Maximum public health for thirteen years buys **1.4–2.0% more people** for **28–44% of the treasury**. Population varies 39.1% between seeds on its own.


### Education — a chain that terminates in a number nothing spends

Education is the one lever with a genuinely interesting causal chain: spending raises the literacy *target*, literacy is a stock that creeps toward it at `0.001` of the gap per week (economy.js:3796), literacy drives research points, research points buy technologies. Every link works. The last one does not convert.

*Education 25 (its effective floor) vs 100, three seeds, 900 weeks — seventeen game years.*

| Seed | Education | Literacy | Research pts/wk | Technologies | Unspent points | Treasury |
|---|---|---|---|---|---|---|
| L1 | 25 | 0.154 | 1.835 | 5 | 23 | 101,955 |
| L1 | 100 | 0.430 | 2.943 | 5 | 477 | 86,067 |
| L2 | 25 | 0.154 | 1.893 | 6 | 243 | 128,059 |
| L2 | 100 | 0.430 | 2.994 | 7 | 63 | 110,876 |
| L3 | 25 | 0.154 | 1.839 | 5 | 35 | 33,719 |
| L3 | 100 | 0.430 | 2.940 | 5 | 456 | 3,261 |

Literacy nearly triples. Research output rises **60%**. Technologies completed rise by **0.33 on average** — one extra technology across three seventeen-year campaigns — because `techCost` applies an early-research penalty of up to 4× against the activation year (technology.js:317–327) and prerequisites gate the rest. The surplus simply accumulates: **477 and 456 unspent points** on two of the three seeds, nearly two technologies’ worth, sitting idle. On seed L3 the same spending removed 90% of the treasury and bought nothing.

This is the brief’s own worked example, found in the wild: mathematically a 60% improvement, strategically no improvement at all.


---

## The military levers, tested where they belong  
*PARTS 5–6 · ii*

A peaceful run cannot judge a war budget. Measured under a forced war, six seeds, 110 weeks after a peaceful warm-up.

These two sliders carry the **largest multipliers in the entire budget domain**, and unlike the social programmes their effects are immediate rather than century-scale:

*Analytic range of the military levers between their real floor (25) and ceiling (100), at full supply.*

| Effect | Formula | at 25% | at 100% | Swing | Source |
|---|---|---|---|---|---|
| Combat power | 0.55 + wages×0.45 | 0.663 | 1.000 | 1.51× | battles.js:118 |
| Training speed | 0.45 + 0.4×wages + 0.15×supply | 0.700 | 1.000 | 1.43× | recruitment.js:365 |
| Org. recovery | (0.6 + 0.4×wages) × (0.7 + 0.3×supply) | 0.700 | 1.000 | 1.43× | turn.js:423 |
| Reinforcement rate | 0.25 + (max(0.25, proc)×supply)×0.75 | 0.438 | 1.000 | 2.29× | reinforcement.js:22–24 |

*Military wages 25 vs 100 under a forced war. Six seeds, means. Procurement held at 100.*

| Metric | wages 25 | wages 100 (requested) | Change |
|---|---|---|---|
| Effective wages reached | 25.0 | 65.0 | clamped by ruling party |
| Army attack power | 28.94 | 36.31 | +20.3% |
| Organisation | 100.00 | 100.00 | 0.0% |
| Strength ratio | 1.00 | 1.00 | 0.0% |
| Tiles occupied by us | 0.00 | 0.00 | 0.0% |
| Territory held | 122.50 | 122.50 | identical, every seed |

Two honest conclusions and one non-conclusion.

- **The effect on paper is real and consistent.** Attack power rose on all six seeds, by 20.3% on average, tracking the analytic prediction for the range actually reached.
- **The player cannot reach the top of the slider.** Asking for 100 produced an effective 60 on four seeds and 75 on two — exactly the pacifist and anti-military ceilings in `fiscalPolicyLimits.armySpendingMax` (politics.js:202), re-clamped every week by `applyGovernmentLimits` (politics.js:206–218). The budget screen does label this band, which is more than the social sliders manage.
- **Whether it changes who wins is untested.** In these runs no territory changed hands in either arm, so a 20% power gap produced no measurable outcome difference. That is a limit of the experiment, not evidence the lever is dead. It needs a harness that reliably produces front movement before anyone can claim either way.

> **The decisive design point does not depend on that**
>
> Both military sliders push in the same direction: pay more, the army works better. There is no game state in which LOW is the right answer, except conserving gold — and gold is the one thing the player has in unusable surplus. A control with a single dominant setting is not a decision; it is a tax on attention. Two of them is the same tax charged twice.


---

## Which of these are decisions  
*PARTS 2 & 12*

A control is a decision only if the player can see it, moving it beats the noise floor, and there is a game state where LOW is correct and another where HIGH is.

*All ten budget controls, classified against measured evidence.*

| Control | Class | Evidence | Action |
|---|---|---|---|
| Tax — lower | [STRONG] | 7.6× the noise floor on satisfaction; drives population, stability and party support. But the revenue it earns is worthless while the treasury is slack, so the honest optimum is always “low”. | [KEEP] |
| Tax — middle | [WEAK] | Same formula, same slope, different constant. `INCOME_WEIGHTS` are fixed at 0.42/0.33/0.25 and never reconciled with actual class populations, so the three sliders are one slider with three weights. | [MERGE] |
| Tax — upper | [WEAK] | As above. The only distinguishing behaviour at the extreme is a defect: at 100% the class dies and reports maximum satisfaction. | [MERGE] |
| Tariff | [STRONG] [DOMINANT] | One of the two largest revenue lines (41–51% of income for a large nation; 30.7% world-wide against taxation’s 34.4%). All 31 nations in a 200-week world converge to 100. Its measured cost is 0.70× the noise floor — below perception. | [SIMPLIFY] |
| Education | [WEAK] | Chain works link by link and converts to nothing: +60% research, +0.33 technologies per 900 weeks, hundreds of points left unspent. Bottom quarter of the slider is inert — the engine floors it at 25. | [KEEP] [FIX THE SINK] |
| Public Health | [WEAK] | Two consumers in the whole codebase. 700 weeks at maximum buys 1.4–2.0% population for 28–44% of the treasury. 0.043× the noise floor. | [MERGE into Welfare] |
| Welfare | [STRONG] | The best lever in the budget: 4.8× the noise floor on satisfaction, 4.6× on stability, at a treasury cost the player can feel (−48.6%). A genuine trade-off with two right answers. | [KEEP] |
| Military Wages | [STRONG] [DOMINANT] | Largest analytic multipliers in the budget (1.43–1.51×), +20.3% measured attack power. But no state makes LOW correct, and the top of the range is unreachable under most governments. | [MERGE] |
| Military Procurement | [STRONG] [DOMINANT] | 2.29× on reinforcement rate. Points the same direction as Wages, costs the same currency, is capped by the same party band, and is moved together with Wages by the AI and by the game’s own “War Budget” preset. | [MERGE with Wages] |
| adminFunding | [REDUNDANT] | 0.012× the noise floor. Treasury differs 0.6% across the whole range; control and stability identical to three decimals; the sign of the optimum flips between seeds. All 31 AI nations sit at 100. No AI writer exists for it at all. | [REMOVE] |
| Subsidy policy | [HIDDEN] | Applies only to the human player (economy.js:3859); AI nations reach the same outcome through a different code path. The same stored field means two different things depending on who owns the nation. | [AUTOMATE] |

> **The game already agrees with this**
>
> Two features in the shipped build are admissions that ten controls is too many. The budget screen has a **“War Budget…”** button (screens.js:1790) that moves five levers at once to a preset. And the whole domain is already delegable — `DELEGATION_AREAS.budget`, “the treasury sets class taxes, social spending and the war budget” (delegation.js:16–20). A mechanic that ships with a “do it for me” button and an autopilot is telling you which parts were never decisions.


---

## The AI does not play the same game  
*PART 14 · RULE 8*

“AI and player should operate under the same core rules.” Four places where they do not, all verified in source.

*Asymmetries between the player’s reachable state and the AI’s.*

| Rule | Player | AI | Source |
|---|---|---|---|
| Tax ceiling | slider runs 0–100; may tax any class at 100% indefinitely | hard-capped at 35 / 42 / 45 per class, floored at 5 — caps that exist only inside `adjustFiscalAI`, not in the setter | economy.js:2873–2874 vs screens.js:1582 |
| Social spending ceiling | setter clamps to 100 | writes `social[id]` directly and unclamped, parking at 105 — 21 of 31 nations | economy.js:2777–2790 vs 1664–1671 |
| Factory build gate | `canBuildFactory` checks unlock date, party policy, cash, region and one-per-state — **never labour** | additionally gated on `gold > 170` and `laborFill ≥ 0.7`; a player can build at 0% employment, the AI cannot | economy.js:1489–1505 vs 3146–3149 |
| Subsidy policy | picks a policy from a dropdown | for a player who also delegates the budget, `adjustWarFiscalAI` overwrites `factory.subsidized` later in the *same function call* — the chosen policy is silently discarded | economy.js:3859 then 3973 → 2945 / 2987 / 3006 |

> **The fiscal AI contradicts itself about what “broke” means**
>
> `adjustSocialAI` defines insolvency relative to the nation’s own scale — `gold < 8×socialSpendingCost×0.25` (economy.js:2759). `adjustFiscalAI`, forty lines later, defines it absolutely: `gold < 80 || weekly < 0` (:2856).
>
> A large nation holding ¤300 against a ¤200/week social bill is broke socially and solvent fiscally. A small nation holding ¤70 against a ¤5/week bill is the reverse. The comment at :2750–2757 records that the absolute thresholds were the *measured bug* — median education collapsing to 0 by 1860 and staying there. The fix was applied to one of the two functions.


---

## The simplest budget that keeps the strategy  
*PARTS 7 & 13*

Five controls instead of ten, one treasury instead of twenty-four writers, one balance instead of four — with the causal network left intact.

*Proposed model. Each lever has one primary benefit, one primary cost, one secondary consequence.*

| Lever | Primary benefit | Primary cost | Secondary consequence | Replaces |
|---|---|---|---|---|
| Taxation | Revenue | Satisfaction ↓ | → stability → party support | 3 class sliders |
| Tariff | Revenue | Import prices ↑ | → retaliation → exports ↓ | unchanged |
| Army | Readiness | Treasury | → war outcome | Wages + Procurement |
| Education | Research | Treasury | → literacy → industry | unchanged |
| Welfare | Satisfaction | Treasury | → population growth | Welfare + Health |

### PROPOSED

```
   ONE TREASURY                  FIVE CONTROLS                   CAUSAL CHAINS  (unchanged)

                      +revenue
   ==============  <------------  [ Taxation  ] --- -satisfaction ---> Satisfaction --> Stability --> Party support
   ||          ||                                                          ^  ^
   || TREASURY ||  <------------  [ Tariff    ] --- -import prices -------+  |
   ||          ||    +revenue                                                |
   || one      ||  <------------  [ Army      ] --- +readiness ---> Readiness --> War outcome
   || writer   ||    -cost                                                   |
   || one      ||  <------------  [ Education ] --- +research ---> Research --> Technology --> Industry --+
   || balance  ||    -cost                                                   |                            |
   ||          ||  <------------  [ Welfare   ] --- +satisfaction -----------+                            |
   ==============    -cost                                                                                |
          ^                                                                                               |
          +------------------  industry widens the tax base  <--------------------------------------------+
```

**Edge list.** Every lever has exactly one money edge and one consequence edge:

| Lever | Money edge | Consequence edge | Then |
|---|---|---|---|
| Taxation | + revenue | − satisfaction | → stability → party support |
| Tariff | + revenue | − import prices (baskets and factory inputs) | → retaliation → exports ↓ |
| Army | − cost | + readiness | → war outcome |
| Education | − cost | + research | → technology → industry |
| Welfare | − cost | + satisfaction | → population growth, stability |

One feedback loop closes the system: industry widens the tax base, which is what makes the budget
worth playing at all.

***PROPOSED.** Every lever has exactly one money edge and one consequence edge, so a player can read the whole domain off the diagram. Nothing in the causal network is deleted: satisfaction still drives stability and politics, education still reaches industry through research, army spending still decides wars. What is removed is the plumbing between the lever and the consequence — the second pipeline, the reconstructed ledger, the three surplus balances, and the four controls that measurement shows nobody can feel.*


---

## The structural half of the change  
*PART 7 · ii*

Removing four sliders is the visible part. These five changes are where the complexity actually lives.


#### 1 · One treasury writer

Replace 24 scattered `nation.gold +=` sites with a single `settle(nation, line, amount)` that moves gold *and* records the ledger line in the same statement. That deletes the eleven `economy.*Gold` scratch fields (`outlayGold`, `procurementGold`, `subsidyGold`, `projectGold`, `dividendGold`, `shareCostGold`, `shareSaleGold`, `interestGold`, `borrowedGold`, `repaidGold`, `defaultedGold`) together with the drain-and-zero pass that reads them, and makes the ledger canonical instead of a weekly reconstruction.


#### 2 · One weekly balance

Fold the gold half of `nationBudget()` into `fiscalBalance()` so city revenue, army wages and administration are computed alongside taxes, social spending and construction. This is what removes the three disagreeing balances, the two hand-written copies of `budget.net.gold + fiscalNet`, and the ordering trap in which the fiscal AI judges solvency without seeing half the nation’s income.


#### 3 · Progressivity becomes a policy, not three numbers

One tax rate. Who pays it is decided by a government policy (regressive / flat / progressive) which sets the incidence split — a real, legible political choice instead of three sliders that share a formula. This also forces the fix that `INCOME_WEIGHTS` needs anyway: incidence must track actual class populations rather than the frozen 0.42/0.33/0.25.


#### 4 · Make research convertible

Education’s chain is the best-designed thing in the domain and it terminates in a pile of unspent points. Either let surplus research buy the next available technology, or soften the up-to-4× early-research penalty (technology.js:317–327). Until then, no simplification of the education formula changes anything, because the formula was never the problem.

> **5 · Make the constraint bind — this one is not optional**
>
> Income runs 2–4× expenses for a large nation, forever. A player who never touches a slider ends 160 weeks with tens of thousands of gold. **No amount of formula simplification creates a decision when the resource being budgeted is not scarce.**
>
> The good news is that the measurements point at the fix. Administration is the one expense already written to scale with the empire — `(cities − 3)^1.45` plus a per-population term (cities.js:210–215) — and in the 31-nation run it was 33% of expenses for the largest nation against 6% for a small one. That shape is correct; it is simply too small, and the slider that scales it is the one lever nobody can feel. Grow the empire-scaling expenses until equilibrium income ≈ expenses, and every surviving lever becomes a decision *without changing a single formula*.


---

## What this costs an agent to understand  
*PARTS 15 & 16*

Counted in the repository, not estimated.

*Context cost of the budget domain, current and proposed.*

| Measure | Now | Proposed | How counted / what removes it |
|---|---|---|---|
| Modules touching a budget lever | 14 | 8 | grep `economy?.(taxes\|tariff\|social\|adminFunding\|militaryWages\|militaryProcurement\|armySpending\|subsidyPolicy)` |
| Modules reading `militaryWages` alone | 7 | 5 | battles, recruitment, reinforcement, turn, cities, economy, screens |
| Treasury write sites | 24 | 1 | single `settle()` choke point |
| Mutable budget fields | 10 levers + 11 scratch + 35 ledger | 5 + 0 + 1 ledger | scratch fields and the reconstruction both disappear |
| Formulas producing a budget number | 15 | 9 | tax efficiency, health growth, the second military path, three of four balances |
| Phase-order dependencies | ~30 | ~12 | counted by reading turn.js:342–547 and economy.js:3653–4005 end to end; merging the two pipelines removes the tariff-zeroing trap and the two `fiscalNet` vintages |
| Named tuning constants | 25 | ~18 | 3 of the 25 are visible anywhere in the UI |
| Duplicated calculations | 5 | 0 | 2 UI copies of sim formulas (one of them wrong by 3.25×), 2 copies of the weekly-balance expression, `floorCost` re-deriving `socialSpendingCost` |
| UI numbers that disagree with the sim | 3 | 0 | reinforcement note, recovery note, gross-vs-net tax rows |
| Conflicting displays of one concept | 4 balances | 1 | hud.js:719, hud.js:1137, screens.js:782, screens.js:1778 |
| Unbooked treasury refunds | 2 of 3 | 0 | a single `settle()` makes the counter-entry structural rather than remembered |


#### AI context cost — now

4 / 5

To change one budget rule correctly you must read `economy.js` (4,018 lines), `cities.js`, `turn.js`, `politics.js` and the budget screen, and you must know that two pipelines write the treasury independently, that `fiscalNet` means two different things depending on when you read it, and that the screen re-derives three formulas by hand. Nothing warns you.


#### AI context cost — proposed

2 / 5

One function computes the balance, one function writes the treasury, one record is the ledger. A change to a lever is local to `fiscalBalance` and its consumer. The remaining cost is inherent: the budget genuinely reaches politics, population, military and technology, and that reach is the game.


---

## Verdict  
*PART 18*

Analysis only. Nothing in this document has been implemented.

### The current budget in one sentence

Ten controls feed two independent pipelines and twenty-two side writers into one treasury that is never empty, after which a third pass reconstructs a balance for a screen that shows three different versions of it.

### What actually creates strategy

**Welfare** — the only lever with a benefit and a cost the player can both feel (4.8× the noise floor on satisfaction, −48.6% treasury). **Taxation** — a genuine, legible harm chain running income → basket → satisfaction → stability → politics. **Tariff** — carrying as much of the budget as all three tax sliders together. And **the causal network itself**, which is well built: education really does reach industry, taxation really does reach party support.

### What is mathematical noise

`adminFunding` at 0.012× the noise floor, sold to the player with a 46% efficiency readout. `health` at 0.043×. The split between three class taxes, which share one formula and a frozen weight table. The split between two military sliders, which push the same way at the same cost under the same cap. Education’s 60% research gain, which buys 0.33 technologies per seventeen years. And `armySpending`, which nothing in `src/` reads.

### Simplest version that preserves the strategy

Five levers — **Taxation, Tariff, Army, Education, Welfare** — each with one benefit, one cost and one downstream consequence; one function that computes the balance; one function that writes the treasury; one ledger that is canonical rather than reconstructed.

### Remove

`adminFunding` and `taxEfficiency` with it — measurably inert, no AI writer, and the source of the gross-versus-net inconsistency on the budget screen. `armySpending` — dead state. The unreachable else branch of `FUEL_FIX`. The dead `industrialOutput` parameter. The eleven `*Gold` scratch fields.

### Merge

Three class taxes → one rate plus a progressivity *policy*. Military Wages + Procurement → one Army budget. Public Health → Welfare, carrying its growth term with it. Subsidy policy → automatic, since it already only exists for the player.

### What must stay

Every causal chain in the right-hand half of the proposed diagram. The point of this pass is to delete plumbing, not consequences. Tax → satisfaction → stability → politics and education → research → technology → industry are the reason the domain is worth keeping at all.

### Expected gameplay loss

[LOW]  Four of the removed or merged controls measure below the noise floor of the metric they are supposed to move; two more are dominated settings with a single correct answer. Nothing a player can currently perceive is lost.

### Expected complexity reduction

[HIGH]  24 treasury writers → 1. Four balances → 1. Ten controls → 5. 56 mutable budget fields → 6. Five duplicated calculations → 0. About thirty ordering constraints down to roughly twelve. Context cost 4/5 → 2/5.

### Recommendation

[SIMPLIFY] But the ordering matters, and it is the opposite of the obvious one. Cutting sliders first would produce a smaller budget that is still not a decision, because the thing preventing decisions is not the number of controls — it is that **the treasury is never scarce.** Make the constraint bind first; then remove the controls that measurement shows nobody can feel; then collapse the plumbing. Done in that order, each step is verifiable with the harness already in the repository.

> **Confidence and limits**
>
> Every table here comes from runs that can be reproduced from `scripts/audit/harness.mjs`. Two claims are explicitly *not* settled: whether the military levers change who wins a war (no territory changed hands in either arm of a six-seed test, so the outcome-level question is untested), and whether tariff retaliation bites, which was not isolated here. Neither affects the structural findings.


---

*Mechanic Atlas · Domain 01, Budget · Analysis and proposal only. Evidence: 120 headless scenario runs across 32 seeds, horizons of 160 to 900 weeks, produced with `scripts/audit/harness.mjs`. Companion to `MECHANIC_CUT_PLAN.md` and `ACCOUNTING_INVARIANTS.md`.*
