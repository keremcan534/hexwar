# BUDGET SIMPLIFICATION — RESULT

Implementation of the conclusions in `BUDGET_ANALYSIS.md`. Nothing merged; branch is for review.

## BASE COMMIT / BRANCH

| | |
|---|---|
| Analysed source commit | `1fee091` (`master`) |
| Branch point | `ec08b01` — docs-only on top of `1fee091`; `git diff master -- src/` was empty |
| Source branch | `claude/imperial-eye-simplification-rlumzv` |
| New branch | **`experiment/simple-budget`** |

No other experiment was read, merged or cherry-picked. `master` untouched.

## CONTROLS BEFORE / AFTER

| Before (10) | After (5) | Why |
|---|---|---|
| Tax — Lower / Middle / Upper | **Taxation** (one rate) | One formula with three weights. Incidence is now a *government* property: the ruling party's ideology selects progressive / flat / regressive (`TAX_STRUCTURES`). Rate = how much, government = who bears it. |
| Tariff | **Tariff** | kept |
| Military Wages + Military Procurement | **Army** | Both pointed the same way, cost the same money, hit the same party band. |
| Education | **Education** | kept |
| Public Health + Welfare | **Welfare** | Health's only two consumers (population-growth multiplier, `standardOfLiving`) moved to Welfare; rate 0.30 + 0.46 → 0.76. Effect merged, not deleted. |
| adminFunding | *(removed)* | 0.012× the noise floor. Slider gone, **cost kept** and made automatic. |
| Subsidy policy | *(removed)* | One rule for everyone: strategic war industry is subsidised while at war and loss-making. |
| "War Budget…" preset | *(removed)* | A one-click preset for five sliders is unnecessary when there are five sliders. |

## TREASURY WRITERS BEFORE / AFTER

**27 → 1.** The only `nation.gold` mutation in `src/` is inside `settle()` (`treasury.js:94`).

The report said ~24. The real number was 27: `cities.js pay()` mutated `nation[resource] -= amount` in a generic loop, so **no `.gold` grep could find it**. That was the hidden writer.

## BALANCE PATH BEFORE / AFTER

Before: `nationBudget()` and `fiscalBalance()` wrote the treasury independently and shared no term; 22 further sites wrote it directly; `updateLedger()` then rebuilt a 35-key record from 11 scratch fields.

After: every movement is `settle(nation, line, amount)` — treasury and ledger line in one statement. `closeWeek()` only *aggregates*. `ledger.unreconciled` is computed against a stamped opening treasury, so a movement outside `settle()` is detected rather than silently absorbed.

**Weekly balance definitions: 4 → 1.** `hud.js:719`, `hud.js:1137`, `screens.js:782`, `screens.js:1778` all read `weeklyBalanceOf()` → `ledger.net`.

## STATE REMOVED

- 11 scratch fields: `outlayGold`, `procurementGold`, `subsidyGold`, `projectGold`, `dividendGold`, `shareCostGold`, `shareSaleGold`, `interestGold`, `borrowedGold`, `repaidGold`, `defaultedGold`
- `economy.taxes{}`, `militaryWages`, `militaryProcurement`, `adminFunding`, `armySpending`, `subsidyPolicy`, `fiscalNet`
- `taxEfficiency()`, `FUEL_FIX` (unreachable else branch), `SUBSIDY_POLICIES`, `applySubsidyPolicy` player-only path, `socialShare()`, `warBudgetPanel()`, `fiscalBalance`'s dead `industrialOutput` parameter
- `updateLedger()` — 93 lines of reconstruction

`SAVE_VERSION` 15 → 16. Old saves are cleanly rejected; no migration written (experimental branch).

## FORMULAS SIMPLIFIED

| Formula | Before | After |
|---|---|---|
| Tax collected | Σ per-class rate, then × `taxEfficiency` on the **sum** only | base × rate × structure weight, per class, gross = net |
| Weekly balance | three overlapping definitions | `income − expenses`, aggregated from booked lines |
| Administration | cost × `adminFunding` slider | automatic; superlinear in cities, light in provinces/population |
| Army effects | two sliders → four formulas | one slider → the same four formulas, all surfaced in the UI |
| UI notes | 3 formulas re-derived by hand, 2 of them wrong | `budgetBreakdown()`; the UI derives nothing |

## BUGS FOUND WHILE IMPLEMENTING

1. **A third unbooked treasury credit the analysis missed.** `construction.js:884` added `administrations × 80` gold for legacy ADMINISTRATION buildings with no ledger entry at all. (The report found two; this is the third.)
2. **The hidden 27th writer** — `cities.js pay()`, above.
3. **`setBudgetPolicy` propagated NaN.** `clamp(Math.round(NaN))` is NaN, so one bad input would have turned the whole budget into NaN. Caught by the new contract audit, now rejected.
4. **`audit:debt` was reporting a false negative** — it read renamed ledger fields and concluded borrowing/interest/repayment were dead, while the live game showed debt 496 at 20.5%/yr.

## MEASUREMENTS

All from the harness in `scripts/audit/`; identical seed and warm-up per matrix, one lever at a time, war suppressed unless stated.

### EDUCATION 10% vs 90% (§19, mandatory)

Same nation, seed, population, starting literacy, tech state, other policies.

| Horizon | Education | Cost/wk | Literacy | Research/wk | **Technologies** | Points unspent |
|---|---|---|---|---|---|---|
| 520 wk | 10% (floors to 25) | 11.4 | 0.213 | 2.11 | 6 | 39 |
| 520 wk | 90% | 40.9 | 0.566 | 3.87 | **7** | 164 |
| 1500 wk | 10% | — | 0.235 | 2.17 | 10 | 349 |
| 1500 wk | 90% | — | 0.637 | 4.30 | **20** | 54 |

Before the fix, the same 1500-week comparison gave **7 vs 8** with ~600 points stranded. The unspent-points column **inverts** after the fix: high education now spends its research, low education cannot afford the next tier.

### THE RESEARCH SINK (§20)

Three causes measured, all three fixed without touching the tech tree (all 65 technologies, prerequisites and activation years unchanged):

1. `LITERACY_APPROACH` 0.001 → 0.004 — half-life was 693 weeks (13 game years).
2. Early-research penalty 0.12/yr cap 4× → 0.06/yr cap 2.5× — researching ahead of the calendar is the *only* thing surplus research can buy, and a 4× penalty closed that door. Penalty kept, not deleted.
3. `TECH_BASE_COST` 260 → 120 — right size for 65 techs across 100 years.

### TAX LOW vs HIGH (isolated, 90 wk)

| | Tax 5% | Tax 70% |
|---|---|---|
| Collected | 39.20 | **455.40** |
| Lower-class satisfaction | 0.560 | **0.490** |

### ARMY LOW vs HIGH

| | 25% | 100% |
|---|---|---|
| Combat power | ×0.66 | ×0.89 |
| Reinforcement | ×0.27 | ×0.36 |
| Training | — | rises with funding |

### WELFARE LOW vs HIGH

| | 0% | 100% |
|---|---|---|
| Cost | 0.00 | 151.87 |
| Satisfaction term | +0.00 | **+0.14** |
| Population growth | ×1.00 | ×1.35 |

### TARIFF LOW vs HIGH (live browser)

10% → 90%: revenue 2.67 → **10.58**; import value 26.7 → **0** — the trade-off is real, high tariffs price imports out.

### TREASURY SCARCITY (§11)

Player levers pinned, 60 wk warm-up + 140 wk:

| Setting | Net | Treasury |
|---|---|---|
| Minimal (edu 0, wel 0, army 25, tax 20) | **+76.7** | 13,176 |
| Moderate (50 / 50 / 60, tax 30) | **−4.6** | 2,410 |
| Maximal (100 / 100 / 100, tax 30) | **−116.4** | **0** |
| Maximal + tax 60% | **−61.8** | **0** |

You can afford part of it, never all of it — not even taxing at 60%.

World health, 300 weeks, 28 nations: no defaults, median expense/income ≈ 1.0, `unreconciled` = 0 everywhere.

**Two calibrations were tried and reverted** (both recorded in `cities.js`): weighting administration toward population taxed *existence* rather than *scale* and halved world median income; a later attempt collapsed a large economy from 249.7 to 37.0 income and started defaults.

## REAL CHROMIUM PLAY (§36)

Real Chromium, `npm run dev`, played through the UI only — no internal state touched. **No page errors.**

Baseline at week 35, then each control moved:

| Step | Treasury | Income | Spending | Net | Literacy | Techs | Satisfaction |
|---|---|---|---|---|---|---|---|
| Baseline | 303 | 59.3 | 43.7 | +15.6 | 3.5% | 0 | 0.536 |
| Education → 100% | 0 | 51.7 | 78.3 | −26.6 | 7.1% | 0 | 0.565 |
| + Welfare → 100% | 0 | 44.5 | 89.0 | −44.4 | 14.2% | 1 | 0.629 |
| + Tax → 5% | 0 | 36.7 | 104.3 | −67.6 | 21.3% | 1 | 0.655 |

1. **Education raised** — cost jumps 0 → 34.1/wk on screen; literacy 3.5% → 25.4%, research 1.37 → 2.29/wk, techs 0 → 2. Visible and expensive.
2. **Taxes cut** — income 21.3 → 2.0, satisfaction 0.536 → 0.655. Both directions legible.
3. **Welfare raised** — cost and satisfaction term both shown live.
4. **Army funding** — combat ×1.00, reinforcement ×0.68, training ×0.94, supply 57% displayed from the real formulas.
5. **Tariffs raised** — revenue up, imports priced out (above).
6. **Do nothing for a long time** — a *normally playing* nation no longer accumulates; an extreme minimal state still does (see Known problems).
7. **Debt / default triggered naturally** — treasury 0, debt 496, interest 20.5%/yr, a "Defaulted ¤72.7" line on the ledger. The screen explains why.

The class tax rows sum **exactly** to the collected total (18.8 + 10.6 + 3.9 = 33.3), and income − spending equals the displayed balance (78.1 − 26.9 = +51.2).

## AI CONTEXT COST BEFORE / AFTER

| Measure | Before | After |
|---|---|---|
| Budget controls | 10 | **5** |
| Treasury write sites | 27 | **1** |
| Scratch accounting fields | 11 | **0** |
| Weekly-balance definitions | 4 | **1** |
| Ledger | 35 keys, rebuilt weekly from scratch fields | 20 lines, aggregated from booked entries |
| Duplicated UI formulas | 5 (2 wrong) | **0** |
| Modules reading a budget lever | 14 | **9** |
| AI/player rule asymmetries | 4 | **0** |
| **Context cost** | **4 / 5** | **2 / 5** |

`treasury.js` is 213 lines, imports no other game module, and is testable in Node alone. Changing a budget rule now means reading it plus one function in `economy.js`.

## KNOWN PROBLEMS

1. **Extreme minimal states still hoard.** A nation with education 0, welfare 0 and minimum army banks ~53k over 260 weeks (`audit:tax` reports this). Normal play is constrained; deliberate austerity is not. The underlying reason is out of scope: **`settlement` (the trade surplus) is 24–96 gold/week of income no budget lever touches** — for one measured nation, 49% of all income. Fixing that means changing where trade income lands, which is Trade architecture (§2).
2. **Administration is shaped by city count**, which correlates with wealth only loosely. A population-heavy, few-city nation underpays. Two attempts to reweight toward population made things worse and were reverted.
3. **`audit:budget` still reports 2 LOW findings** inherited from the old model (workforce quality is a stateless multiplier; administration never had a province-control channel). Neither is a regression.
4. Tax incidence is derived from party ideology rather than a first-class policy axis, because `politics.js` has no tax axis and §2 forbids redesigning it. It works, but it is a derived rule rather than an explicit one.
5. Education's payoff is still slower than one campaign-quarter: at 520 weeks it is +1 technology, at 1500 weeks +10. That is a deliberate long-investment shape, but a player checking after two game years sees mostly cost.

## FINAL VERDICT

**BETTER.**

The accounting is now true by construction rather than by reconstruction: one writer, one close, one balance, and a self-check (`unreconciled`) that makes any future violation loud. Three unbooked treasury paths, a NaN hole and a false-negative audit were fixed. Ten controls became five, each with one benefit and one cost that the screen states in the simulation's own numbers — the UI can no longer drift from the model because it derives nothing.

The constraint binds for a normally playing nation, and Education — the one chain the analysis showed was strategically dead — now converts research into technology at double the rate when funded.

The two honest gaps: a deliberately austere state can still hoard, and the reason is trade income the budget does not own. That is the next mechanic to look at, not this one.
