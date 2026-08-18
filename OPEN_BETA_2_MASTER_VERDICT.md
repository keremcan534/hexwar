# OPEN BETA 2 — MASTER VERDICT

Written after the blind campaign (`OPEN_BETA_2_FULL_CAMPAIGN_REPORT.md`), after reading
Test #1 and the repair documents, and after technical verification
(`OPEN_BETA_1_VS_2.md`).

**Campaign:** seed `8V9X3W`, Ossria Emirate, 1 JAN 1836 → 1 JAN 1904 (68 of 100 years).

---

## 1. IS IMPERIAL EYE NOW FUN?

**For about fifteen years, genuinely. After that, no.**

The 1836–1850 stretch is a good strategy game. I found my own problem on the Trade screen
(raw exports collapsing while manufactures pinned at an 8× ceiling), chose my own answer
(education first, then industry), paid for it with a tax rise I could see costing me
household satisfaction, and got a war I hadn't prepared for. Everything in that paragraph
is the game working exactly as intended.

Then the decisions run out. Between 1854 and 1881 — twenty-seven years — my only inputs
were one reform a year, from a list where every option is permanently at 100% support, and
one afternoon of factory building. Nothing was declared on me. No event fired. Nothing
threatened me. My treasury went from ¤10,000 to ¤405,000 while I held the Fastest button.

**Better than Test #1?** Yes, clearly. Stability moves and explains itself, education
pays off over sixty years, debt can ruin you, the AI closes its wars. Those are real
gains and they are felt, not just measured. But the shape of the campaign is the same:
a strong first act, and then a game that stops asking questions.

---

## 2. IS THE ECONOMY NOW A GAME RATHER THAN A SCOREBOARD?

**Half of it is. The half that punishes you is a game; the half that rewards you is still
a scoreboard.**

The downside is real now. Test #1's defining bug is gone: the Budget screen prints
*"External settlement · import deficit is settled out of the treasury −¤412.1"* **inside**
Total expenses. I felt it — a trade deficit took me from ¤18,098 to ¤4,323 of debt at
20.5% interest with credit exhausted in four years.

The upside never became a game. I finished with **¤477,295** and nothing to buy. Maxing
*every* social budget line in the game costs about ¤55/week against a ¤394/week surplus.
Factories are bottlenecked on build power, armies on three training slots. There is no
infrastructure to fund, no influence to purchase, no navy worth having, no technology to
buy. REMAINING P1-5 says this out loud and it is now the largest design gap in the build.

One live exploit confirms the asymmetry: **tariffs at 100% are free money.** I ran them
there for fifty years and collected ¤433/week with no retaliation and no visible cost.
`audit:trade-consequence` independently reports **24 of 66 nations still profiting from a
trade deficit** through tariff extraction. The settlement fix closed the hole in the
treasury; it did not close the hole in the incentive.

---

## 3. CAN THE PLAYER ACTUALLY SUFFER ECONOMIC FAILURE?

**Yes. This is the clearest win of the repair pass.**

Measured in my own campaign: treasury ¤18,098 → ¤0; debt ¤0 → ¤4,323; interest
4.0% → 6.1% → **20.5%**; available credit ¤6,450 → **¤0**; weekly balance **−¤494**. Every
step was legible on one screen, and the cause — a war I could not win, on top of a trade
deficit I could not fix — was my own decision.

Two qualifications:

- **Recovery is too cheap.** Signing peace and moving two sliders restored me to +¤93/week
  within six months. Five years of ruin, undone in half a year.
- **It is not punitive.** Nothing about the calibration felt unfair, and the AI world did
  not collapse: 3 of 66 nations in debt at 1845, total ¤6,978, no bankruptcy cascade.

---

## 4. DOES LOSING A WAR MATTER?

**It costs you money now. It still costs you nothing else.**

I lost a two-year war to Maresh at −31 war score with 16% of my border region occupied.
The AI refused to settle for nothing — *"They are winning and will not sign for
nothing — they expect about 9 more at the table"* — and imposed **War Reparations**.

Then I went looking for the bill and could not find it. No territory changed hands. No
reparations line ever appeared in my Budget. My treasury sat unchanged at ¤13,138 and my
manpower jumped from 85K to 133K.

So the **refusal** is fixed — Test #1's free white peace is gone, `peace-stakes-audit`
passes 5/5 — but the **consequence** is still invisible to the player. The war cost me
¤130–270/week while it ran, and nothing after it ended.

---

## 5. CAN AI FINISH WARS?

**Yes. Fixed.**

Both of my wars were ended by the AI's own initiative. Maresh, winning, proposed
proportionate terms and closed. Elanria, losing, proposed peace repeatedly. AI–AI wars
concluded in the dispatch feed (*"Norurgrad imposed terms on Ireshia"*). Test #1's
"three nations occupied me for over a decade and never converted it into a peace deal"
did not recur once.

Arguably over-corrected in the other direction: after 1840, **no nation declared war on me
for sixty-four years**, despite my two wars of aggression, my occupations, and my fall
from rank 1 to rank 11.

---

## 6. DOES COMMANDING A WAR PROVIDE AGENCY?

**No. This is the weakest system in the build and it has not moved since Test #1.**

Test #1: *"I selected a general, pressed Start Offensive, and watched for seven years."*
Test #2 is the same, plus new confusion:

- The command dock's **"Toggle the offensive" does nothing** on its own, and no war
  control in the game — offensive, stance, target — has a pressed state, an active class,
  or an aria-state. You cannot tell what you have ordered.
- The control that works is a per-commander **"Start Offensive"** buried below the fold in
  a scrolling panel, and it must be pressed for each of your command slots individually.
- **Move orders are right-click only** and nothing says so; left-click silently deselects.
- The Military screen has **no "advancing" state at all** in its status string
  (military.js:328) — it only ever prints "facing X" or "holding the border" — so it
  contradicted the front panel every time I checked.

The measured outcome: 26 divisions at **100% strength, 100% organization, 0 engaged, 0 on
the march**, "No active province battles", war score frozen at +8 for twelve months, at a
cost of ¤129/week.

The headless `military-strategy-audit` is clean (median front occupancy 62.5%, 82.7% of
divisions settled in position, 0 unreachable targets) — but it exercises the **AI's**
command path, not the player's manual one. The gap between that audit and my campaign is
the thing to investigate.

---

## 7. DOES POLITICS MATTER?

**Once, memorably. Then not at all.**

The one genuinely great political beat in 68 years: "Hold Election" was greyed with
*"There is no electorate: no election can be held under the current franchise"*, so I
enacted **Only Landed** — and my government changed from Presidential Dictatorship to
Constitutional Monarchy on the spot, with 28,000 voters appearing where there had been
none. Later, **Weighted Wealth** produced Prussian Constitutionalism and swung economic
policy back to State Capitalism, which is what finally let me build factories. That chain
is real, discoverable, and satisfying.

Everything around it is inert:

- **Every reform sat at 100.0% support in every year of both campaigns.** The only gate is
  a 12-month national cooldown. There is no reform you must build support for.
- **Population ideology never moved**: 35.8/29.5/23.5/11.1 in 1836 → 35.6/29.4/23.9/11.1
  in 1874, through four decades in which farmers fell from 40% to 28% and literacy went
  0% → 61%. Frozen ideology freezes the electorate, so every election returned the same
  party. (Test #1's population *did* drift — Conservative → Socialist 37.6%, Orthodox →
  Reformed 74% — so this is a regression against the previous build.)
- **Four government changes happened silently**, including the one that forbade me from
  spending my money for roughly thirty years.
- **No events, no decisions, no movements that act, no releasable nations.**

---

## 8. DOES POPULATION MATTER?

**Yes — as the best long-run simulation in the game, and almost only that.**

| | 1836 | 1900 |
|---|---|---|
| Farmers | 40.2% | **10.1%** |
| Factory Workers | 18.1% | **34.9%** |
| Clerks | 7.6% | **24.1%** |
| Literacy | 0% | 68% |
| Employment | 78% | 97% |

I caused that over sixty-four years by funding schools and building industry, and I could
read it happening. It is believable, legible and slow in the right way. **Protect it.**

It also drives real decisions in one place: needs-met fell to 77% and my population
started shrinking; Welfare and Public Health at 100% for ¤21/week took stability from 30%
to 54% and reversed the decline within nine months. That is the cleanest cause-and-effect
loop in the build.

Against that: culture is inert (36% Girnsk minority, 13 provinces, zero consequences in 68
years), religion is a single confession that is never referenced, ideology is frozen, and
movements are explicitly labelled indicators. And the period illusion breaks on minute
one: a society that is **35.8% socialist and 11.1% fascist in 1836**, with a Labour Union
party leading the national return, is not the nineteenth century.

---

## 9. DOES TECHNOLOGY FEEL PLAYER-DRIVEN?

**Barely. It is new since Test #1, and it is half-built.**

What works: I chose my research from five live options, read cost, effect and a blunt
honest ETA (*"260 RP · At current rate 208 wk"*), and **Education spending visibly drove
the rate** — 1.26 → 5.25 research points per week as literacy went 0% → 68%. That chain
is the R-18/R-19 work landing, and it is the reason technology is player-driven *at all*.

What doesn't: **four of five categories are dead buttons** whose only explanation is an
invisible `title` reading *"Not yet authored"* — so research can never improve an army, a
navy, commerce or culture, ever. The one live category delivers flat percentages
(+4% RGO, +6% throughput, +10% construction). Industry unlocks are **calendar-gated**
("available from 1850/1870/1880/1900"), not research-gated, so research doesn't even open
new buildings. I completed roughly five technologies in 68 years and stopped opening the
screen after the first hour.

Countries cannot become technologically different from one another in any way I could
observe.

---

## 10. DOES THE LATE GAME STILL DIE?

**Yes — strategically for certain, and performance-wise to a degree I could measure but
not fully attribute.**

**Strategically: dead, and in the same way as Test #1.** By 1880 money was solved,
stability was solved, employment was solved, literacy was solved, technology was
irrelevant, diplomacy did not exist, war could not change a border, and the map had not
altered a single hex since 1836. My early choices *did* create late consequences — the
1836 education decision is visible in the 1900 workforce — but nothing I could do in 1900
mattered at all. No new constraints replaced the old ones. Not one.

**Performance: measurably worse, partly beyond the game.** Headless, product world, no
rendering:

| era | ms/week | weeks/s |
|---|---|---|
| 1836 | 22.8 | 43.8 |
| 1850 | 42.6 | 23.5 |
| 1875 | 47.3 | 21.2 |
| **1900** | **222.2** | **4.5** |
| 1936 | 90.1 | 11.1 |

The simulation genuinely gets **~10× more expensive by 1900**. That much is the game's own.

**My in-browser figures were not.** In a second session I regenerated the same seed and
measured a **fresh 1836 world with two divisions**: 0.6 fps, with rAF stalls of
1617 / 1994 / 1994 / 2004 ms — while the game's profiler recorded nothing worse than
`clock-tick` 33.5 ms, `sim` 20.1 ms, autosave 24.1 ms. An empty 1836 world stalls
*identically* to the 1903 one. The ~2-second stalls are the automation environment.

So I **retract** the in-browser collapse as evidence against the game, and I retract the
army-scale hypothesis with it. My stated reason for stopping the blind campaign at 1904
was wrong. The late-game performance question is **INCONCLUSIVE in the browser** and needs
re-measuring on real hardware; only the headless curve stands.

---

## 11. DID ANY REPAIR CREATE A NEW SERIOUS PROBLEM?

**Yes — one serious, one moderate, one probable.**

**1. SERIOUS — the peace repair made winning impossible.**
`MAX_WAR_SCORE = 100`, and `warScore` is `(occupation × 0.75 + edge × 0.25) × 100`, where
`occupation` is a **share** of the enemy's territory. Peace **terms** are correctly priced
on that 0–100 scale (14–65). **Provinces are not**: `provinceWarCost` is an absolute
development figure — Lundland (18 hexes) = **80**, Norrgau (16 hexes) = **85**.

Measured in play: 5½ years at 1.9× superiority → war score **+10**. Three years at **6.1×**
with 105 divisions → **+28**. Test #1's player gained three provinces; I gained none, and
**no border anywhere in the world moved in 68 years.** Test #1 said losing was free; Test
#2 says winning is unreachable. `MAX_DEMAND_PROVINCES = 3` is decorative.

**2. MODERATE — attrition appears to have been repaired out of existence.**
Test #1's army decayed 13,000 → 5,000 and could not be replaced. Mine held **100%
strength and 100% organization through five continuous years of war** and never dropped
below 87%. Combined with **no disband control anywhere**, army size is now a one-way
ratchet that permanently consumed 147,000 of my people (960K → 813K).

**3. PROBABLE — the tariff incentive survived the settlement fix.**
Net trade now leaves the treasury, but `tariffRevenue = importValue × tariff/100` still
has no counter-entry, so at high tariff rates importing remains net profitable. The audit
flags 24/66 nations profiting from a deficit; I ran tariffs at 100% for fifty years and
collected ¤433/week for it.

**Not repair damage** (checked explicitly): trade deficits are not absurdly punitive,
economies do not collapse too easily, imports are not double-charged, households are not
impoverished, industry is profitable, AI economies do not bankrupt themselves, wars do end,
stability is not hypervolatile, and there is no revolt spam. World shortages did not
disappear unrealistically — they went the other way (14 → 26).

---

## 12. WOULD YOU START ANOTHER CAMPAIGN NOW?

**No — not this build.**

I would stop somewhere around 1870, as I effectively did. I would come back immediately
for a build where war can move a border, money buys something, and something happens to me
that I did not cause. The 1836–1850 opening is strong enough that I want the rest of it.

---

## 13. THE FIVE BIGGEST REMAINING PROBLEMS

**1. War cannot change the map.** Province prices (80–85) and achievable war score (10–28)
are on incompatible scales. In 68 years, on a 69-nation world with wars in it, not one hex
changed hands anywhere. Fix the units — normalise `provinceWarCost` against the same 0–100
budget the terms already use, or make occupation accrue score far faster.

**2. Money has no sink.** ¤477,295 and ¤55/week of things to spend it on. The single
biggest reason the late game has no decisions in it. Let gold buy *capacity* — training
slots, construction throughput, industrial subsidy, diplomatic influence — never units.

**3. Commanding a war has no agency and no feedback.** One unambiguous offensive order,
with a visible pressed state, that does not silently revert; a documented move order; and
an "advancing" case in the Military screen's status string.

**4. Nothing ever happens to you.** No events, no decisions, no coalitions that fire, no
crises, no diplomacy. Twenty-seven consecutive years of my campaign contained no input I
could make that would change my situation. Reform support permanently at 100% and frozen
population ideology are the same problem in the political layer.

**5. The late game gets ~10× more expensive by 1900** on the headless bench (22.8 →
222.2 ms/week). That curve is the game's own and is worth profiling. *(My in-browser
0.06 wk/s figure is retracted — it reproduced identically on an empty 1836 world, so it
was the test environment.)* Separately, and still true: there is no way to reduce an army
once raised.

*(Honourable mention: the Construction screen is the one place in this build that disables
a control without saying why — and it cost me the entire construction pillar for
sixty-eight years because I concluded on day one that the feature was broken.)*

---

## 14. THE FIVE THINGS THAT MUST NOT BE REDESIGNED

**1. The stability model and its tooltip.**
```
Household satisfaction  +35.3
Occupied territory      −6.0  (16% of 49 hexes)
War exhaustion          −5.2  (1 front)
Unemployment            −5.2  (12,333 without work)
= Stability             18.8%
```
Test #1's stability was frozen at 44% for sixty years and explained by the word
"stability". This is the best single repair in the pass. Use this pattern everywhere.

**2. The education → literacy → research chain.** Test #1: 24% → 23% over 62 years.
Test #2: **0% → 68%**, with research rising 1.26 → 5.25/week. It was my campaign goal, it
paid off over decades, and I could feel it. Do not touch it.

**3. The workforce transformation model.** Farmers 40% → 10%, factory workers 18% → 35%,
clerks 8% → 24%, across sixty-four years, caused by my decisions. The best long-run
simulation in the game and the main reason I kept playing.

**4. The disabled-reason discipline, and the Trade screen.** *"Blocked — Small Arms short:
10 needed, 6.0 in stock"*, *"treasury short by ¤88"*, *"not yet invented — available from
1850"*, *"There is no electorate"*, *"The election is 18 weeks away; it can be called in
the last 12 weeks"*, and "WHY THE PRICE MOVES" with its per-good producers/consumers
dossier. Most shipped strategy games do not do this. Extend it — starting with the
construction rows.

**5. The economic consequence chain: settlement → debt → interest → credit limit, and
automatic borrowing.** *"deficits draw on credit, surpluses repay"* is low-micro and
high-stakes, and it is the reason I could genuinely fail. Also keep the mobilisation
constraint (three training slots, weeks per regiment, equipment stockpiles that block
orders) — money still cannot buy an army, and that remains one of the best ideas here.

---

## FINAL

**Test #1 asked: "Is there a game here?"** It answered yes, with a superb economy demo and
no consequences.

**Test #2 asked: "Did the repairs turn that game into a campaign worth finishing?"**

The repairs are real and they are good work. Economic failure exists. Stability lives and
explains itself. Education pays off across sixty years. The AI finishes its wars. A
franchise reform can change your form of government. Six of Test #1's ten worst moments
cannot happen in this build.

But the campaign is still not worth finishing, and the reason has moved rather than gone.
Test #1 could not lose; I could not win. Test #1's money was infinite and useless; mine
was ruinable and still useless above ¤50,000. Test #1's late game had no decisions; so did
mine, for twenty-seven consecutive years.

**This build is a better game than the one Test #1 played, and it dies at the same point
in the calendar.** The next pass should not add systems — there are already more systems
here than the campaign uses. It should make three of them bite: let a war move a border,
give money something to buy, and let something happen to the player that they did not
cause.

**Player score: 5/10, up from Test #1's 7/10 on a different world — and that drop is not a
contradiction.** Test #1 scored a promising demo generously. I played a more honest,
more consequential, more finished game for sixty-eight years and found that it still
stops being a game around year forty. The parts that work are worth 8. The late game is
worth 0.
