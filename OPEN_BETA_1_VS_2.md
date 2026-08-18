# OPEN BETA — TEST #1 vs TEST #2

**Test #1:** seed `BETA1836`, Vasheim, 1836 → 1905 (~70 years).
**Test #2:** seed `8V9X3W`, Ossria, 1836 → 1904 (68 years). Blind; Test #1 read only
after the Test #2 report was frozen.

Two different worlds, two different nations, two different strategies. Where the two
campaigns are not comparable I say so rather than forcing a verdict.

Categories: **FIXED · IMPROVED · UNCHANGED · REGRESSED · NOT ENCOUNTERED · INCONCLUSIVE**

---

## 0. CORRECTIONS TO MY OWN TEST #2 REPORT

Phase B code inspection overturned two of my blind findings. The Test #2 verdict is left
as written, but these are wrong and must not be acted on as stated.

### B2-001 "Construction queue cannot be populated" — **MY ERROR**

`canQueueConstruction` (construction.js:376) requires `nation.gold >= type.cost`.
A Construction Sector costs **¤100**. On 1 JAN 1836 I had **¤50**. Every state row
therefore rendered `disabled` — correctly.

I tested this *only* on day one, concluded the system was broken, and never re-opened
the screen for the next 68 years. Verified live at 1904 with ¤477,295: rows enabled,
one click queued a Construction Sector, queue went 9 → 10 active.

**The construction system works.** What is real, and what actually cost me the entire
construction pillar for a whole campaign, is this: the screen prints
*"Click a state row or one of your states on the map to add it to the queue"* and then
disables every row **with no reason string at all** — in a game that elsewhere says
*"treasury short by ¤88"*, *"Blocked — Small Arms short: 10 needed"*, *"There is no
electorate"*. Reclassified from **CRITICAL bug** to **MAJOR UX defect**, with unchanged
player impact.

### B2-010 / B2-015 "Escape does nothing" / "war declarations don't pause" — **INCONCLUSIVE**

- Escape: hud.js:316 closes the active screen, and a synthetic `keydown` with
  `code:'Escape'` does close it live. My Phase A negative was a harness artefact.
- War declarations: `NOTIFY.WAR` carries `halt: true` and calls `setSpeed(0)`
  (notifications.js:21,107). My fast-forward loop re-asserted Fastest every cycle, so a
  pause would have been invisible to me. **I cannot claim this is broken.** I *did*
  genuinely miss a war for months — but my own automation is the likely cause.

Everything else in my report stands.

---

## 1. THE THREE P0s

### P0-1 · Trade must reach the treasury — **FIXED (player-confirmed)**

Test #1's single most important defect: `Net −¤823.8` printed beside
`Projected weekly balance +¤184.0`, treasury rising forever.

Test #2, on the same panel, 1853:

```
Imports   −¤424.3    Exports +¤52.8    Net −¤412.1
External settlement · import deficit is settled out of the treasury   −¤412.1
Total expenses 167.3¤   (62.0 visible lines + 105.3 settlement)
Projected weekly balance  −¤494.3
```

The settlement line is present, named, and **inside the total**. I went from ¤18,098 to
zero, then to ¤4,323 of debt at 20.5% interest with available credit at ¤0.

**Test #1: "I finished with ¤280,023 while running a −¤824/week deficit."**
**Test #2: a −¤412/week deficit bankrupted me in four years.** Fixed, and confirmed by
lived experience rather than by the ledger alone.

> **Caveat — the perverse incentive is reduced, not removed.** `audit:trade-consequence`
> (520 wks, 66 nations) still reports **24 of 66 nations profiting from a trade deficit**
> via tariff extraction — e.g. Ulgard: trade balance −193.4, tariff take +300.9,
> settlement −193.4, **net external +107.5**. I exploited exactly this: tariffs at 100%
> paid me ¤433/week for fifty years with no visible downside. The audit flags it as an
> INFO watch item; my campaign shows it is a live dominant strategy. See §7.

### P0-2 · Peace acceptance / war consequence — **FIXED for the losing player, BROKEN for the winning player**

Two halves, opposite verdicts.

**The half that is fixed.** Test #1's signature failure — winning 25–0 and being offered
a free white peace — is gone. Test #2, losing to Maresh at −31:

> *"They are winning and will not sign for nothing — they expect about 9 more at the table."*

And Maresh proactively proposed proportionate terms (War Reparations) and closed the war
itself. `peace-stakes-audit` passes 5/5. **FIXED.**

**The half that is now broken — and this is the biggest single finding of Test #2.**

| | Test #1 | Test #2 |
|---|---|---|
| Provinces gained by the player | **3** (Asterthal, Brammoor, Jorgarde) | **0** |
| How | AI *volunteered* them while losing | never occurred |
| Border changes anywhere in the world | several (dispatch feed) | **none in 68 years** |

Root cause, verified in `peace.js`:

- `MAX_WAR_SCORE = 100`, and `warScore` = `(occupation × 0.75 + edge × 0.25) × 100`,
  where `occupation` is a **share** of the enemy's total developed territory.
- `provinceWarCost` = `2·hexes + pop/3000 + development·0.6·hexes + cities·12` — an
  **absolute** development number, unnormalised.

The peace **terms** are correctly scaled to the 0–100 budget (14–65). The **provinces are
not**: Lundland (18 hexes) priced at **80**, Norrgau (16 hexes) at **85**. To afford one
province you must occupy essentially the entire enemy country. `MAX_DEMAND_PROVINCES = 3`
is decorative.

Measured in play: 5½ years of war at 1.9× superiority → war score **+10**. Three years at
**6.1×** superiority with 105 divisions → **+28**. Ceiling never approached.

**Why Test #1 got provinces and Test #2 got none:** `surrenderOffer` (ai.js:65) concedes
*provinces the winner already occupies*. Test #1's player held ground, so the AI handed it
over. My offensives never converted into held provinces, so `occupiedProvincesOf` returned
nothing and the losing AI could only offer white peace. **The escalating-concession
behaviour Test #1 praised is intact and was correctly protected — I simply never triggered
it.** That is a military-layer failure, not a peace-AI one.

**Net:** Test #1 said *"losing a war is free"*. Test #2 says *"winning a war is
impossible"*. The repair moved the problem rather than solving it.

### P0-3 · Embarked / ocean army recovery — **NOT ENCOUNTERED**

I never built a ship, never staged an amphibious operation, and never saw a land division
at sea. `military-strategy-audit 400` reports **no findings** and "unreachable target: 0
units". Technically verified, not player-verified.

---

## 2. ECONOMY

| Question | Verdict | Evidence |
|---|---|---|
| Did economic failure acquire consequences? | **FIXED** | ¤18,098 → ¤0 → ¤4,323 debt at 20.5%, credit exhausted, −¤494/wk |
| Can persistent import dependence hurt? | **FIXED** | imports ¤424/wk vs exports ¤12/wk was the direct cause of the above |
| Can treasury/debt become meaningful? | **FIXED** | interest scaled 4% → 6.1% → **20.5%** with debt; credit hit ¤0 |
| Does industry income propagate? | **IMPROVED** | upper-class tax went ¤2.5 → ¤136/wk as factories grew (R-15 flowing profit to the upper class is visible) |
| Do unemployment and household welfare matter? | **FIXED** | needs-met 77% → population decline; Welfare+Health 100% for ¤21/wk → stability 30% → 54% and population reversed |
| Does money still become infinite/useless? | **UNCHANGED — still the biggest structural hole** | ¤50 → **¤477,295**, +¤394/wk, with every social budget line maxed costing ¤55/wk total |

Test #1 finished with ¤280,023 and nothing to buy. Test #2 finished with ¤477,295 and
nothing to buy. **The sink problem is untouched** — REMAINING_OPEN_BETA_ISSUES P1-5 says
so explicitly, and it is now the single largest remaining design gap. Money *can* be lost
(a real improvement), but above a low threshold it still has no use.

---

## 3. WAR

| Question | Verdict |
|---|---|
| Can losing a war now cost something? | **IMPROVED, not FIXED.** The AI refuses free white peace and imposes terms — but I accepted a "War Reparations" peace in 1840 and **no reparations line ever appeared in my budget**; I lost no territory and my treasury was untouched. The refusal is real; the bill is still not visible. |
| Does a winning AI demand rational terms? | **FIXED.** Maresh at +31 asked for reparations, not my capital, and said what it wanted. |
| Can AI actually conclude wars? | **FIXED.** Both my wars ended, both by AI initiative. Dispatches showed AI–AI wars concluding ("Norurgrad imposed terms on Ireshia"). Test #1's "three nations occupied me for a decade and never closed" did not recur. |
| Can the PLAYER make meaningful peace demands? | **REGRESSED.** Test #1 gained three provinces. I gained one Resource Concession in 68 years and could never afford a province. |
| Do wars still become endless background weather? | **FIXED.** Test #1 had continuous ambient war 1848–1872. Test #2 had two wars in 68 years, both concluded. Arguably over-corrected: after 1840 nobody ever declared on me again. |

---

## 4. MILITARY

| Question | Verdict |
|---|---|
| Armies permanently stranded at sea? | **NOT ENCOUNTERED** (audit clean) |
| Fronts empty despite available troops? | **INCONCLUSIVE / partly REGRESSED.** `military-strategy-audit` measures median front occupancy 62.5% and 82.7% of divisions settled in position — clean for AI nations. But my own war: 26 divisions at **100% strength, 100% organization, 0 engaged, 0 on the march**, "No active province battles", war score frozen for twelve months. The audit does not exercise the player's manual command path. |
| Usable armies idle while fronts collapsed? | **UNCHANGED.** 57 of my 105 divisions sat "without an officer" at the end. |
| Did armies recover over time? | **REGRESSED — possibly too far.** Test #1's army *decayed* 13,000 → 5,000 and could not be replaced (13 men/week). Mine sat at **100% strength and 100% organization through five years of continuous war** and never dropped below 87%. Attrition appears to have been repaired into non-existence. |
| Did military scale make sense later? | **NO, and it is now actively harmful.** I grew 26 → 105 divisions; it consumed **147,000 people permanently** (960K → 813K), there is **no disband control anywhere**, and it is the strongest correlate of the late-game simulation collapse. |
| Did commanding war provide agency? | **UNCHANGED — still the weakest system.** Test #1: "I pressed Start Offensive and watched for seven years." Test #2: identical, plus a global "Toggle the offensive" that does nothing, no pressed state on any war control, and undocumented right-click move orders. |

One genuine partial fix confirmed: the **two-commanders-in-one-panel** bug (Test #1
BUG-012) did not recur.

---

## 5. WORLD MARKET

| Question | Verdict |
|---|---|
| Did critical shortages converge over decades? | **UNCHANGED at the aggregate.** Test #1 ended with **26** critical shortages. Test #2: 14 (1836) → 16 → 17 → 15 → **26** (1900). Identical end state. |
| Strategic resources stuck at price ceilings? | **IMPROVED but not fixed.** Test #1's signature complaint — coal pinned at 8× base for seventy years — is measurably better: my coal traded at ¤0.48–¤32 rather than sitting at 8× throughout. But **Coal was reported as "highest pressure" every single time I looked, from 1844 to 1900**, and Fabric ¤48 / Cement ¤64 / Fertilizer ¤64 / Fuel ¤80 / Regular Clothes ¤72 sat at exactly 8× base for the entire campaign. That is the same six-good residue REMAINING P1-1 predicts. |
| Did new producers respond? | **FIXED, and clearly visible.** Paper ¤48 → ¤1.68, Furniture ¤96 → ¤1.72, Canned Food ¤21.49 → ¤1.28, Steel ¤12 → ¤1.44, Luxury Furniture ¤272 → ¤4.45. Producers genuinely appeared. This is the most convincing single improvement in the market. |
| An evolving market rather than permanent shortage? | **IMPROVED at the level of individual goods, UNCHANGED at the level of the world.** World trade grew ¤5,762 → ¤56,795 while shortages nearly doubled. This matches P1-1b exactly: compound industrial demand against linear RGO supply. |

Also still present: **`Regular Clothes ¤72.00 — severe shortage 100% met · short 0.0/wk`**
— Test #1 BUG-014, verbatim, unfixed.

---

## 6. POLITICS / STABILITY / EDUCATION

### Stability — **FIXED, and it is one of the best repairs in the pass**

| | Test #1 | Test #2 |
|---|---|---|
| Range over the campaign | **44% for 60 years**, through invasion and occupation | **19% – 58%**, moving every decade |
| Explanation | tooltip read *"national stability"* | full itemised breakdown |

Live tooltip from my campaign, 1840:

```
Household satisfaction  +35.3
Occupied territory      −6.0  (16% of 49 hexes)
War exhaustion          −5.2  (1 front)
Unemployment            −5.2  (12,333 without work)
= Stability             18.8%
```

Occupation, war exhaustion and unemployment are all inputs now, exactly as R-05 claims,
and I could read the cause every time it moved. **Not hypervolatile** — it moved for
stated reasons and recovered when I acted. This is the model the rest of the game should
copy.

### Education / literacy — **FIXED, decisively**

| | Test #1 | Test #2 |
|---|---|---|
| Literacy over the campaign | **24% → 23%** in 62 years | **0% → 68%** in 64 years |
| Research rate | n/a (no tech system) | 1.26/wk → **5.25/wk** |
| Causal chain visible? | no | yes — I set Education 100% in 1836 and watched both climb for six decades |

R-18 (literacy as a stock) and R-19 (literacy → research points) both land. This is the
clearest cause-and-effect chain in the build and it was my primary campaign goal.

*Caveat:* the Technology screen and the Population screen report **different literacy
figures** — 68% vs 56% at 1900, 61% vs 47% at 1874, 52% vs 40% at 1861.

### Politics — **IMPROVED presentation, UNCHANGED depth**

| Question | Verdict |
|---|---|
| Did occupation matter politically? | **FIXED** — it is a named stability term. |
| Did reforms remain meaningful? | **UNCHANGED.** The upper-house gate is still good and its explanation is now excellent. But **every reform sat at 100.0% support in every year of both campaigns**, so the only gate is still the 12-month national cooldown. Test #1: "ten reforms at 100% = a decade-long queue." Test #2: twenty-one reforms at 100%, same queue. |
| Did politics produce consequences rather than statistics? | **PARTLY IMPROVED.** One genuinely great beat that Test #1 never found: enacting **Only Landed** franchise flipped my government from Presidential Dictatorship to Constitutional Monarchy on the spot, and later **Weighted Wealth** produced Prussian Constitutionalism and swung economic policy back to State Capitalism, which unlocked factory building. That chain is real and satisfying. |
| Ideology movement | **UNCHANGED / worse.** Test #1's population genuinely drifted (Conservative-dominant → Socialist 37.6%, Orthodox → Reformed 74%). **Mine did not move at all**: Socialist 35.8/29.5/23.5/11.1 in 1836 → 35.6/29.4/23.9/11.1 in 1874. Frozen ideology froze the electorate, so every election returned Labour Union. |
| Constant revolt spam? | **NO** — zero revolts, zero coalitions, infamy peaked at 3.2/22. Test #1's "infamy 33, no coalition" (B-06) is untested here because I never got near the threshold. |

---

## 7. UI — did these improve in actual use?

| Item | Verdict | Evidence from Test #2 |
|---|---|---|
| Construction queue reorder | **FIXED** | ⤒ ▲ ▼ ⤓ present and working on a 10-item queue; one click to promote |
| Reform click target | **FIXED** | measured **278 × 21 px** — full row width (Test #1: 11 × 55 px) |
| Disabled reasons | **FIXED where Test #1 complained, MISSING where it did not** | zero `"unavailable"` cards; instead *"treasury short by ¤88"*, *"not yet invented — available from 1850"*, *"policy forbids state industry"*, *"There is no electorate"*, *"The election is 18 weeks away; it can be called in the last 12 weeks"*. **But the construction state rows have no reason at all** — the one place it mattered most to me |
| War declarations pause | **INCONCLUSIVE** | code sets `halt: true` → `setSpeed(0)`; my automation re-asserted Fastest so I cannot confirm in play |
| Battle locations | **HALF FIXED** | notification text uses `Battle of <Province>` (battles.js:338) ✔ — but the **battle card on the Diplomacy screen still prints raw hex coordinates** (`screens.js:1888`), and that is where I read it: *"Battle of 21, 18"* |
| Escape | **FIXED** (my Phase A negative was a harness artefact) | hud.js:316 closes the active screen; verified live |
| Stable sorting | **INCONCLUSIVE** | I did nearly all state work paused; never hit Test #1's re-sort problem |
| Notifications | **PARTLY IMPROVED, PARTLY REGRESSED** | they no longer sat over panel tabs for me — but a war-declaration card from 1838 was **still on my map in 1851**, thirteen years later |
| Tab title `HexWar` | **FIXED** — reads "Imperial Eye" |
| Unrounded float | **FIXED** — `power 17.1` |
| Power ratio direction | **FIXED** — *"we are 1.9× their strength"* / *"they are 8.5× our strength"* |
| Hex/province terminology | **UNCHANGED** — "27 provinces" vs "Territory 308 provinces" vs "Highbridge — 74 provinces" |
| Country selection | **UNCHANGED** — still none |
| `Land ratio 0.00` | **UNCHANGED** |
| `SEVERE SHORTAGE 100% met` | **UNCHANGED** |
| Duplicate general names | **UNCHANGED** — Perrin/Perrin, Bertran/Bertran, Ulric/Ulric |
| Per-good trade policy shell | **UNCHANGED** — *"reserved shell — not wired yet"* |
| Navy reachable | **UNCHANGED** — warship blocked on Steamer Convoys in 1836, never built one in 68 years |
| Values ¤0 before first tick | **UNCHANGED** |

---

## 8. TECHNOLOGY — new since Test #1

Test #1 had no technology system to judge. R-19/R-19b added the mechanic and the screen.

**What landed:** research is player-directed (I chose Early Railways over four
alternatives and could read cost, effect and ETA), literacy drives the rate, and the ETA
readout — *"260 RP · At current rate 208 wk"* — is exactly the kind of honest number this
game does well.

**What did not:** four of five categories are `disabled` with a `title` reading **"Not
yet authored"** — so research can never improve an army, a navy, commerce or culture. The
live category delivers flat percentages only, and industry unlocks are **calendar-gated**
("available from 1850/1870/1880/1900"), not research-gated. I completed roughly five
technologies in 68 years and stopped opening the screen after the first hour.

Matches REMAINING P1-6 exactly, including the unwired modifiers.

---

## 9. LONG-RUN PERFORMANCE

Player-facing throughput at Fastest, tab foregrounded, same measurement method as Test #1.

| Era | Test #1 (Vasheim) | Test #2 (Ossria) | Test #2 army |
|---|---|---|---|
| 1836 | **2.9 wk/s** | **2.3 wk/s** | 2 divisions |
| 1850–53 | **1.15 wk/s** | — | — |
| 1863 | — | **1.17 wk/s** (142 fps) | 26 divisions |
| 1874 | — | ~1.2 wk/s | 26 divisions |
| 1903 | *not measured (Test #1 could not get a clean reading past 1899)* | **0.06–0.11 wk/s · 0.2–0.3 fps** | **105 divisions** |

**Early and mid game: UNCHANGED.** 1836 and 1850–1863 are within noise of Test #1 on a
different machine — the ~2.5× slowdown across the first fifteen years reproduces exactly.

**Late game: REGRESSED — but the cause is only partly the game, and I have to say so.**

Headless per-era simulation cost, product world (160×96, 69 nations), seed 8V9X3W, one
process, 15-week sample at each mark — no browser, no rendering:

| era | week | ms / week | weeks / s |
|---|---|---|---|
| 1836 | 0 | **22.8** | 43.8 |
| 1850 | 728 | 42.6 | 23.5 |
| 1875 | 2028 | 47.3 | 21.2 |
| **1900** | 3328 | **222.2** | **4.5** |
| 1936 | 5200 | 90.1 | 11.1 |

So the **simulation itself roughly doubles by 1875 and spikes ~10× at 1900**, then partly
recovers. That is a real, reproducible late-game cost curve and it is worse than the
~2.5×-by-1850 curve Test #1 measured. **The headless run does reach 1936**, in minutes.

What I experienced in the browser was far worse than 222 ms/week — one week took ten to
sixteen *seconds*. Digging into it in Phase B:

- The game's own profiler at 1903 reports frames of **34–42 ms** (`sim` 18–42 ms,
  `render` ~1.2 ms) and clock ticks of 22–60 ms. Autosave measured **38 ms** against a
  **3.85 MB** localStorage save.
- With the game **paused** the browser still delivered only **1.4 fps**, and hiding the
  map canvas entirely changed nothing (1.5 fps). The rAF gap trace was bimodal —
  2–15 ms normally, punctuated by regular **~2000 ms stalls** that appear nowhere in the
  game's own frame or event instrumentation.

**RESOLVED IN A SECOND SESSION — the browser figures were my environment, not the game.**
I regenerated the *same seed* and measured a **fresh 1836 world with 2 divisions**:
**0.6 fps**, with rAF stalls of 1617 / 1994 / 1994 / 2004 ms — while the game's own
profiler recorded nothing worse than `clock-tick` 33.5 ms, `sim` 20.1 ms, autosave
24.1 ms, HUD 12.7 ms. An empty 1836 world stalls **identically** to the 1903 one.

So the ~2-second stalls are the automation/headless-browser environment. **The in-browser
throughput column above does not measure Imperial Eye and should be disregarded**, and the
army-scale hypothesis is withdrawn. What I *can* state:

1. The simulation genuinely gets **~10× more expensive by 1900** (headless, measured).
2. My session became unplayable at 1904, but **for environmental reasons** — so my stated
   reason for stopping the blind campaign was wrong.
3. Test #1's measured 2.9 → 1.15 wk/s across 1836–1850 is a real player-side curve and is
   **not contradicted** by anything I measured; my own 1836 → 1863 figures (2.3 → 1.17)
   reproduce it closely before the environment degraded.

Verdict on late-game performance: **INCONCLUSIVE in the browser, REGRESSED on the
headless bench** (~10× cost growth by 1900). Re-measure on real hardware before acting.

---

## 10. DID THE REPAIR CREATE NEW DAMAGE?

Checked specifically against the brief's list.

| Risk | Verdict |
|---|---|
| Trade deficits absurdly punitive | **NO.** A −¤412/wk deficit on ¤254/wk income bankrupted me in four years — aggressive but survivable, and I recovered fully in six months by raising tariffs and cutting procurement. Calibrated hard, not absurd. |
| Economies collapsing too easily | **NO.** `trade-consequence-audit`: 3/66 nations in debt at 1845, total ¤6,978. No AI bankruptcies surfaced in play. |
| Imports causing double payment | **NO.** Settlement appears once, inside Total expenses; the arithmetic checks out (62.0 + 105.3 = 167.3). |
| Households permanently impoverished | **NO.** Needs-met bottomed at 77% and recovered to 83%; population grew 768K → 960K before *my own recruitment* cut it back. |
| Industry unprofitable | **NO.** 5 → 204 factory levels, +¤367/wk, and I built 108 plants voluntarily because the margins were good. |
| AI economies bankrupting themselves | **NO** (see above). |
| Peace AI impossible to negotiate with | **PARTLY YES — the real damage.** Not because the AI is stubborn: because province prices (80–85) live on a different scale from the 0–100 war score. The player can reach the table and afford nothing on it. |
| Wars never ending / white peace too strict | **NO.** White peace was always available and accepted; both my wars ended cleanly. |
| Army recovery too strong | **YES, probably.** 100% strength and 100% organization sustained through five years of continuous war is not attrition. Test #1's complaint was the opposite; this looks over-corrected. |
| World shortages disappearing unrealistically | **NO — the opposite.** 14 → 26. |
| Stability hypervolatile | **NO.** Healthy 19–58% band, always with a stated cause. |
| Politics constant revolt spam | **NO.** Zero revolts, zero coalitions. |

**Two new problems that did not exist in Test #1:**

1. **Late-game simulation collapse under army scale** (0.06 wk/s at 105 divisions) — with
   **no way to disband a division**, so a player who over-recruits cannot undo it.
2. **The construction screen's silent disable** — Test #1 fought the construction queue
   but always got things built. I never built a single state building in 68 years because
   a ¤50 treasury disabled every row without saying so.

---

## 11. SUMMARY TABLE

| Area | Verdict |
|---|---|
| Trade → treasury (P0-1) | **FIXED** (tariff-extraction incentive partly survives) |
| Losing a war costs something (P0-2a) | **IMPROVED** — refusal works; the bill is still invisible |
| Player can win a war (P0-2b) | **REGRESSED** — 0 provinces in 68 years, 0 border changes worldwide |
| Embarked army recovery (P0-3) | **NOT ENCOUNTERED** |
| Stability responds to conditions | **FIXED** |
| Stability is explained | **FIXED** |
| Education → literacy → research | **FIXED** |
| World market convergence | **IMPROVED** per good, **UNCHANGED** in aggregate |
| Money has a use | **UNCHANGED** |
| Commanding a war | **UNCHANGED** |
| Reform support depth | **UNCHANGED** |
| Ideology movement | **REGRESSED** (Test #1's population drifted; mine did not) |
| Technology as a player system | **IMPROVED** (new), **incomplete** (4/5 categories unauthored) |
| AI concludes wars | **FIXED** |
| AI develops / world changes shape | **REGRESSED** — Test #1 saw conquests and a churning leaderboard; Test #2 saw **not one border move in 68 years** |
| UI disabled reasons | **FIXED** where Test #1 pointed, **still missing** in construction |
| Reform button, queue reorder, tab title, power ratio, floats | **FIXED** |
| Terminology, country selection, navy, per-good policy, duplicate names, `100% met` shortage | **UNCHANGED** |
| Late-game performance | **REGRESSED** under army scale |

---

## 12. THE FULL CENTURY — seed 8V9X3W simulated to the real end date

My blind campaign stopped at 1904, so I ran the *same seed* headlessly to **1936** to
answer the one question it could not. This is simulation output, not player experience —
Ossria is AI-driven here. Wars, borders, market and economy are the world's own.

| era | nations alive | eliminated | changed size | at war | goods at ceiling | in shortage |
|---|---|---|---|---|---|---|
| 1836 | 69 | 0 | 0 | 0 | 0 | 0 |
| 1850 | 69 | 0 | 10 | 16 | 12 | 15 |
| 1875 | 69 | 0 | 11 | 12 | 9 | 16 |
| 1900 | 69 | 0 | 14 | 21 | 11 | 20 |
| **1936** | **69** | **0** | 16 | **22** | **13** | **17** |

Three findings, and they all confirm the blind campaign rather than soften it:

**1. The world never resolves.** A hundred years, sixty-nine nations, **not one
eliminated**. The three largest powers are the same size on the last day as the first:
Ossria 308 tiles, Ossmark 290, Feneesh 249 — **unchanged in 1836, 1850, 1875, 1900 and
1936**. Sixteen nations shift size at the margins; the shape of the world does not move.
My "no border changed in 68 years" was not a fluke of my passivity — it is what the
simulation does when left alone for a century.

**2. War is permanent background weather.** From 0 nations at war in 1836 to **16 by 1850
and 22 by 1936**, sustained the whole time — and it changes nothing. This is Test #1's
*"continuous war as ambient weather"* complaint reproduced exactly, at the end date, with
the player removed from the equation.

**3. The market never converges.** Thirteen goods pinned at the price ceiling and
seventeen in shortage on the final day, versus twelve and fifteen in 1850. Eighty-six
years of global industrialisation moved the shortage count from 15 to 17. This is P1-1b's
compound-demand-vs-linear-supply problem playing out to its conclusion.

Two smaller notes:

- **AI Ossria ends the century in permanent debt** — ¤13,520 at 1900 and ¤13,519 at 1936,
  stability 39–40%, having never repaid it. The post-repair economy bites the AI too, and
  it does not recover. Worth checking against the "AI economies bankrupting themselves"
  risk: it is not a collapse, but it is a sixty-year debt it never clears.
- **The AI army is frozen at 40 units from 1850 to 1936.** Eighty-six years, no growth,
  no decay.

**Verdict on late game, with the end date now in evidence: it does not die — it was never
alive.** Nothing about 1936 differs in kind from 1875. No nation was conquered, no border
of consequence moved, no shortage resolved, no army changed size.
