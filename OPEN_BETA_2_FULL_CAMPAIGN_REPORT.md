# OPEN BETA 2 — FULL CAMPAIGN REPORT

**Build:** Imperial Eye v0.1.0
**Campaign:** seed `8V9X3W` · 160 × 96 · 36% land · 69 nations
**Played:** 1 JAN 1836 → **1 JAN 1904** (year 68 of a 100-year campaign)
**Nation:** Ossria Emirate — assigned, not chosen. Rank 1 of 69 at start.
**Method:** blind. No source code read, no console cheats, no save editing, no
knowledge of any previous test. Written before reading anything about Test #1.

**Why it stopped at 1904:** the simulation fell to 0.06–0.11 in-game weeks per real
second at 0.2–0.3 fps and stayed there, at peace, with nothing marching. Reaching 1936
would have taken six-plus hours of real time. I did not fake the remainder.

> **One caveat that colours everything below.** I could not build a single state building
> — Construction Sector, Fort, Administration or **University** — in sixty-eight years,
> because on day one every state row was disabled and nothing told me why. Every
> judgement about construction, build power, fortification and universities below is
> therefore made from a campaign in which that pillar was never used.
>
> **⚠ PHASE B CORRECTION (added after code inspection; the verdict below is left as
> written).** This was **my misdiagnosis, not a broken system.** The rows disable when
> the treasury cannot cover the cost — a Construction Sector is ¤100 and I had ¤50 — and
> they carry no reason string at all. I tested only on 1 JAN 1836, concluded the feature
> was broken, and never reopened the screen. Verified live at ¤477,295: rows enabled,
> one click queued a sector. The defect is a **missing disabled-reason on the one screen
> in this game that omits it**, and its effect on my campaign was total. Two further
> findings — B2-010 (Escape) and B2-015 (war declarations do not pause) — are also
> withdrawn as inconclusive; both work in code and my fast-forward automation would have
> masked them. See `OPEN_BETA_1_VS_2.md` §0.

---

## 1. FIRST IMPRESSION

The main menu is the best thing in the build and it is not close. "THE LONG CENTURY ·
1836", a rotating painted scene, drifting fog, music, and a randomised epigraph — mine
was *"A gun on a headland is an argument the sea must answer."* The loading screen has
its own line: *"Fortunes were made and ruined here, over flowers."* Someone with taste
made this, and it promised a game I wanted to play.

Then New Campaign: seed, map size, continentality, land ratio, great powers → Generate →
and I am **already playing**, as a nation nobody asked me about. There is no country
selection. I was handed Ossria and told *"You lead the world."*

That is a bad opening beat twice over. A grand-strategy player expects to choose their
problem, and being handed rank 1 of 69 before making a single decision removes the
problem entirely.

The first hour after that was genuinely good. The information architecture is far better
than I expected: the Trade screen has a literal "WHY THE PRICE MOVES" box; the Military
screen refuses to build artillery with *"Blocked — Treasury short: 55 needed, 50 on
hand"*; the Population screen is Victoria-grade. And within ten minutes I had found a
real strategic problem on my own — **literacy 0%, research 1.26/week, every technology
costs 260 RP, "At current rate: 208 wk"** — and a lever I could see (Education at 0% in
the budget). That is exactly how an opening should work.

**FIRST IMPRESSION: strong.** The game looks and reads like it knows what it is.

---

## 2. MY CAMPAIGN STORY

I decided the interesting question was not "can I conquer" but **"can a hegemon actually
modernise, or is rank 1 just a number?"** My primary goal was industrial modernisation;
my secondaries were breaking the political lock, holding my 36% Girnsk minority, and
finding out what money is for.

**1836.** Passed Basic School System. The upper house instantly locked and told me
exactly why. Discovered Construction was broken. Set Education to 100%.

**1836–1838.** The world market split in half in six months — every raw material I sell
collapsed to pennies, every manufactured good I buy hit an 8× price ceiling. My economy
went into deficit. I raised taxes and tariffs, watched stability fall as household
satisfaction dropped, and accepted the trade. This was the best stretch of the campaign.

**1838–1840.** Maresh declared war on me and I did not notice for months. Lost the war
at −31, accepted their reparations demand, and could never find the bill. Meanwhile my
government silently became a socialist Presidential Dictatorship whose Interventionist
economic policy forbade me from building factories — with ¤11,000 in the bank.

**1841.** Population had fallen for five years and needs-met was 77%. I set Public
Health and Welfare to 100% for ¤21/week and stability went 30% → 54% while population
turned back up. The single cleanest cause-and-effect loop in the game.

**1844.** Rank 1 → 11. I worked out that "Hold Election" was blocked because I had no
electorate, enacted the **Only Landed** franchise, and turned a Presidential
Dictatorship into a Constitutional Monarchy with 28,000 voters. Best decision I made.
Then every subsequent election returned the same party forever, because the ideology
split has not moved a point since 1836.

**1848–1853.** My war of aggression against Elanria at 1.9× strength. Five and a half
years, ¤18,000 spent to zero, ¤4,323 of debt at 20.5% interest, credit exhausted, and a
final war score of **+10** against a province price of **80**. Nothing gained. White
peace.

**1854–1881.** Twenty-seven years in which nothing asked anything of me.

**1869.** Noticed by accident that the government had handed my economy back —
State Capitalism. Built 75 factories in one sitting with ¤74,406. Four years later 70
were still under construction, because the building that raises build power is the
broken one.

**1874–1900.** Watched my society industrialise. Farmers 40% → 10%. Factory workers
18% → 35%. Clerks 8% → 24%. Literacy 0% → 68%. Treasury ¤10,000 → ¤525,000. This part
is genuinely excellent and it is the reason I kept going.

**1896–1903.** Built the army from 26 to 105 divisions to test whether the 1848 war was
a scale problem. It cost me 147,000 people who never came back. At 6.1× strength I got
to +28 war score in three years and cashed it for a Resource Concession — the only thing
I won in 68 years.

**1903.** The simulation died.

**Borders on 1 January 1904 are identical to 1 January 1836.** Mine and everyone's.

---

## 3. BEST MOMENTS

1. **JUL 1836 — the world market splits.** Opening Trade expecting a bug and finding an
   economic *situation*: raw materials at ¤0.24, manufactures at 8× base, and a
   producers/consumers breakdown telling me exactly why. It gave me a reason to
   industrialise that I worked out myself.
2. **1841 — welfare works.** ¤21/week turned 30% stability into 54% and reversed a
   five-year population decline, and I could watch it happen on two screens.
3. **1844 — the franchise chain.** "There is no electorate" → enact Only Landed → the
   government form changes on the spot. A political decision with a constitutional
   consequence.
4. **1836–1900 — the workforce transformation.** Farmers 40% → 10%, clerks 8% → 24%,
   literacy 0% → 68%. A believable industrial revolution I caused.
5. **1840 — Maresh proposes terms.** A winning AI ending a war on its own initiative
   with a rational demand, clearly explained. It felt like a real opponent.
6. **1849–1853 — going bankrupt.** Debt compounding, interest climbing 4% → 20.5%,
   credit hitting ¤0, all legible on one screen. The ledger is excellent.

---

## 4. WORST MOMENTS

1. **1836 — Construction refuses its own instruction.** "Click a state row" and the
   state rows are disabled. Not a mystery, not friction — a locked door with a sign on
   it saying "open me".
2. **1849 — the empty war.** 26 divisions at 100% strength and 100% organization, all
   "holding the border", 0 engaged, war score frozen at +8 for a year, ¤129/week
   burning. And no way to tell whether the offensive I'd ordered was even on.
3. **1853 — 80 versus 10.** Discovering that five and a half years of war bought me
   one-eighth of the cheapest province on the menu.
4. **1854–1881 — twenty-seven empty years.** Not "waiting for something to finish".
   No action available that would change my situation.
5. **1869 — finding out by accident** that my economic policy had been switched thirty
   years earlier and had been silently forbidding me to spend my money.
6. **1903 — the clock stops.** One in-game week per fifteen real seconds. The campaign
   didn't end; it seized.

---

## 5. MECHANIC-BY-MECHANIC VERDICT

Scores out of 10.

| Mechanic | Fun | Depth | Clarity | Micro burden* | Strategic value |
|---|---|---|---|---|---|
| Economy / budget | 7 | 7 | 8 | 2 (good) | 8 |
| World market / trade | 6 | 8 | **9** | 1 (good) | 7 |
| Factories / industry | 6 | 6 | 7 | 6 (bad) | 7 |
| Construction | — | — | — | — | **0 (broken)** |
| Population / society | 5 | 8 | 7 | 1 (good) | 5 |
| Politics / reforms | 4 | 5 | **8** | 2 (good) | 4 |
| Stability | 6 | 4 | **9** | 1 (good) | 6 |
| Education / literacy | 7 | 4 | 6 | 1 (good) | 8 |
| Technology | 2 | 2 | 6 | 1 | 2 |
| Military / recruitment | 3 | 4 | 7 | 7 (bad) | 3 |
| Commanding war | **1** | 2 | **2** | 8 (bad) | 1 |
| Peace / war terms | 6 | 7 | 8 | 2 (good) | **3** |
| Diplomacy | 2 | 2 | 5 | 2 | 2 |
| AI | 3 | — | — | — | 3 |
| Navy / logistics | — | — | — | — | never used |

\* *Micro burden: 1 = costs almost no clicks, 10 = relentless repetition.*

**Overall craft note:** the *readouts* in this game are consistently far better than the
*systems* behind them. Almost every screen explains itself well. The problem is that
several of them are explaining a system that doesn't do anything.

---

## 6. MECHANICS I IGNORED

- **Navy.** Never built a single ship in 68 years. Never had a reason. My nation has
  "Maritime access" and it never mattered once.
- **Logistics.** Opened it twice. Production lines exist and can be switched between
  Small Arms / Artillery / Tanks / Aeroplanes / Convoys with an efficiency penalty —
  a good HOI-ish idea I never once needed to engage with.
- **Culture.** 36% of my population is a foreign nationality across 13 provinces. In 68
  years it produced no unrest, no event, no decision, no separatism, nothing. It drifted
  from 35.3% to 25.2% on its own. It is a number on a pie chart.
- **Technology.** After the first hour I stopped opening it. Four of five categories are
  dead buttons ("Not yet authored"), and the fifth is a slow drip of flat percentages.
- **Diplomacy.** There is no diplomacy to do — no alliances, no guarantees, no rivalries,
  no relations to manage. Only "Declare War".
- **The map itself, after ~1860.** Nothing on it ever changed, so I stopped looking.

**That a "mobile-first grand strategy" can be played for seventy in-game years while
ignoring the navy, logistics, culture, technology and diplomacy entirely is the most
important structural finding in this report.**

---

## 7. MECHANICS THAT CREATED BAD MICRO

1. **Recruiting.** The only repeated action the late game offers: open Military, click
   "Order" ten times, wait eleven weeks, repeat. I did this dozens of times. It is pure
   same-click repetition with no decision in it — infantry is always right because
   artillery and armour are gated on equipment I can't make.
2. **Assigning divisions to commanders.** "Auto-assign leaders" is **off by default**.
   Until I found it, every new division sat "without an officer" and I had to click
   "Take N loose units" per general. At the end I still had **57 divisions without an
   officer**.
3. **Starting the offensive per commander.** Seven command slots, seven separate
   "Start Offensive" clicks buried in a scrolling panel — and they silently revert, so
   it is a chore you must repeat, forever, with no feedback.
4. **Building factories.** Nine states × up to thirteen viable industries, each behind a
   "+" that opens a modal that closes after every single purchase. Queueing 75 factories
   meant roughly 160 clicks.

---

## 8. UI PAIN POINTS

**The good first, because it deserves it:**
- Disabled-reason text is often outstanding: *"Blocked — Small Arms short: 10 needed,
  6.0 in stock"*, *"There is no electorate: no election can be held under the current
  franchise"*, *"The election is 18 weeks away; it can be called in the last 12 weeks"*,
  *"treasury short by ¤88"*, *"not yet invented — available from 1850"*.
- The stability tooltip is a model of its kind: named terms, signed values, an equals
  line.
- Peace Talks highlighting the enemy's provinces in red on the map is excellent.
- The truce system ("ELANRIA — TRUCE (14 TURNS)", Declare War greyed with the count) is
  clean.

**The pain:**
1. **Critical information lives in browser-native `title` tooltips** — factory recipes,
   reform support breakdowns, tech-category disable reasons. On a mobile-first game
   these are unreachable by touch entirely.
2. **No pressed state on the war controls.** The offensive toggle and the three stance
   buttons have no active class, no `aria-pressed`, nothing. You cannot tell what you
   have ordered.
3. **Right-click move orders are undocumented**, and left-click silently deselects.
4. **"Accept terms" rejected the peace.**
5. **The tab bar clips** Politics and Technology at 961px with no scroll affordance.
6. **Escape doesn't close the province panel** — it opens the main menu instead.
7. **Notifications are sticky and never expire.** A 1838 war declaration was still on my
   screen in 1851.
8. **Existential and trivial events look identical.** "Maresh declared war on us" and
   "Clothing Factory reached level 5" are the same card in the same corner, and neither
   pauses.
9. **Numbers contradict each other across screens**: two literacy figures (68% vs 56%),
   two unemployment figures (5,000 vs 134K), two weekly balances (+53 vs +31), "27
   provinces" vs "308 provinces", generals listed twice.
10. **Can't zoom out to see the world.** No world view, no minimap.
11. **Tax sliders don't preview.** Expense sliders do. You cannot see what a tax change
    does until after you commit.
12. **The Budget screen is all zeros before the first tick** — so you cannot plan your
    opening economy at all.

---

## 9. PACING

| Era | Verdict |
|---|---|
| **1836–1841** | **Good.** A real problem, real levers, a war I didn't ask for, a genuine economic crisis. |
| **1841–1853** | **Good→mixed.** The welfare loop and the franchise chain are real decisions; the Elanria war is a five-year dead end. |
| **1854–1881** | **Dead.** Twenty-seven years, one meaningless reform per year, nothing else. |
| **1881–1900** | **Slow but watchable.** The industrial transformation is visibly happening; I am a spectator to it. |
| **1900–1903** | **Broken.** War at 6.1× yields one concession; the simulation then stops. |

**BOREDOM LOG — exact periods where nothing capable of changing my situation existed:**
- **1854–1869 (15 years).** No war, no event, no buildable anything (policy + broken
  construction), one reform per year from a list where every option is at 100% support.
- **1870–1881 (11 years).** Factories building themselves at 5 build power/week.
- **1884–1896 (12 years).** Treasury ¤300,000 → ¤525,000 with no sink.

The middle third of this campaign has no gameplay in it.

---

## 10. DIFFICULTY

**Too easy, in the way that matters least, and impossible in the way that matters most.**

- Surviving is trivial. My stability never went below 19%, I was never invaded
  successfully, and no coalition ever formed (infamy peaked at 3.2 of 22).
- Getting rich is automatic. ¤50 → ¤476,000 while I mostly pressed Fastest.
- Losing a war costs nothing you can find.
- **Winning a war is impossible.** 80 war score for a province; three years at 6.1×
  superiority yields 28.

The only real difficulty spike in 68 years was self-inflicted — the 1849–1853 bankruptcy
spiral — and it was fixed in six months by signing peace and moving two sliders.

---

## 11. ECONOMY VERDICT

**The strongest system in the game, and the one closest to being finished.**

What works:
- **Failure is real and legible.** I went bankrupt. Debt compounded, interest climbed
  4% → 20.5%, available credit hit ¤0, weekly balance −¤494. Every step readable on one
  screen. Borrowing being automatic ("deficits draw on credit, surpluses repay") is a
  good, low-micro design.
- **Import dependence hurts.** Exports ¤12/week against imports ¤424/week nearly killed
  me, and the causal chain from "world price ceiling" to "my treasury" was followable.
- **Taxes have a real cost.** Raising them visibly drops household satisfaction and
  therefore stability.
- **The Trade screen is the best-explained screen in the game.**
- **Household welfare matters.** Needs-met drives population and stability, and spending
  on Welfare/Health measurably fixes both.

What doesn't:
- **Money becomes infinite and useless.** ¤476,000 by 1904, +¤389/week, and the entire
  set of things to spend it on is: factories (blocked by policy for 30 years, then
  bottlenecked by build power), army (bottlenecked at 3 training slots), and social
  budget lines that cost **¤55/week combined**. There is no sink. No infrastructure, no
  subsidies worth taking, no navy worth having, no diplomacy to buy.
- **The market never converges.** Shortages went from 14 to 26 across 68 years of global
  industrialisation. A hard core of goods — Fabric, Cement, Fertilizer, Fuel, Regular
  Clothes — sat at exactly 8× base for the entire campaign, and Coal was "highest
  pressure" for sixty years running.
- **Raw materials are permanently worthless.** Grain ¤2.00 → ¤0.24. A resource-rich
  agrarian nation is structurally doomed and can do nothing about it.

**Verdict: the economy is a game, not a scoreboard — for about the first fifteen years.
After that it is a scoreboard again, because you win it and there is nothing left to
buy.**

---

## 12. POPULATION / SOCIETY VERDICT

**Half museum, half the best long-run system in the build.**

The transformation is real and it is excellent:

| | 1836 | 1900 |
|---|---|---|
| Farmers | 40.2% | **10.1%** |
| Factory Workers | 18.1% | **34.9%** |
| Clerks | 7.6% | **24.1%** |
| Literacy | 0% | 68% |
| Employment | 78% | 97% |

I caused that, over sixty-four years, by paying for schools and building factories, and
I could read it happening. That is a genuine grand-strategy payoff and it should be
protected.

Everything else on the screen is decoration:
- **Ideology never moves.** Socialist 35.8 / Conservative 29.5 / Liberal 23.5 / Fascist
  11.1 in 1836; 35.6 / 29.4 / 23.9 / 11.1 in 1874. Which means the electorate can never
  change, which means elections are theatre.
- **Culture is inert.** 36% Girnsk minority, 13 provinces, zero consequences ever.
- **Religion is 100% one confession** and never referenced again.
- **Movements are explicitly labelled "an indicator, not a simulated organisation".**

And the period illusion breaks immediately: a society that is 35.8% socialist and 11.1%
fascist in **1836**, with a Labour Union party leading the national return, is not the
19th century.

---

## 13. POLITICS / REFORMS VERDICT

**Beautifully presented; almost no game inside it.**

The presentation is genuinely first-rate. Reform tooltips give type, support, required
threshold, ruling-ideology support, unrest and movement pressure, and a verdict. The
upper-house lock came with the clearest explanation of a soft-lock I have seen in a
strategy game.

But:
- **Support is permanently 100% on every reform, in every year.** There is never a
  reform you must build support for. The only gate is a 12-month timer.
- **Every government change happened silently** — four of them, including the one that
  forbade me from spending my money for thirty years.
- **Elections always return the same party** because ideology is frozen.
- **Decisions: "the event system is not built yet."** Zero events in 68 years.
- **Release Nations: "not implemented, so the buttons stay closed."**
- **Movements: indicators only.**

So three of the four Politics tabs are declarations that a system does not exist, and
the fourth is a once-a-year timer.

The one genuinely great beat — enacting a franchise and watching the government form
change — proves the chain *can* work. It just has nothing feeding it.

---

## 14. TECHNOLOGY VERDICT

**The weakest system in the game. Technology is not something I play; it is barely
something I watch.**

- **Four of five categories are dead buttons.** Army, Navy, Commerce, Culture: all
  "0/30", all disabled, with the sole explanation being an invisible tooltip reading
  *"Not yet authored"*. **Research can never make an army better. Ever.**
- The one live category delivers **flat percentages**: RGO output +4%, factory
  throughput +6%, construction power +10%. No unlocks, no branching, no identity.
- **Industry unlocks are calendar-gated, not research-gated** — "not yet invented —
  available from 1850/1870/1880/1900". So research doesn't even open new industries;
  the year does.
- I completed roughly **five technologies in sixty-eight years**. The tech screen's own
  estimate at start was 208 weeks each.
- The one thing that *is* player-driven — Education spending → literacy → research rate,
  1.26/wk → 5.25/wk — works and feels good. But it only makes a bad tree arrive slightly
  less slowly.

Countries cannot become technologically different from each other in any way I could
observe.

---

## 15. MILITARY / FRONTLINE VERDICT

**This is where the game fails hardest.**

**Preparation** is fine on paper — manpower, equipment stockpiles, production lines,
training slots, blocked-with-reason recruitment. The constraint that money can't buy an
army fast (3 training slots) is *correct design*. But there is no decision in it:
infantry is always the answer because artillery, armour and aircraft need equipment my
industry can't supply, and no research can improve any unit.

**Command** is the disaster:
- The global "Toggle the offensive" **does nothing**, and has no pressed state.
- The working control is a per-commander "Start Offensive" buried below the fold, and it
  must be repeated for every command slot.
- Offensives **silently revert to "holding"**, while a different screen still claims
  "ADVANCING".
- Move orders are **right-click only** and nothing says so; left-click deselects.
- I could not distinguish my mistakes from the system's behaviour, which is the exact
  failure mode that makes a war system unusable.

**Concrete evidence, 19 MAY 1849:** at war 16 months, 26 divisions, **100% strength,
100% organization**, all seven commands "holding the border", **0 engaged, 0 on the
march**, "No active province battles", war score frozen at +8 for twelve months,
¤129/week spent.

**Scale barely helps.** 26 divisions → +8 in six months. 86 divisions at 6.1× superiority
→ +19 in six months, +28 in three years. Province price: 80.

**Battles do exist and are readable** when they happen — round counter, both sides'
strength and organisation, per-round losses, terrain note. They're just named after raw
hex coordinates ("Battle of 21, 18") and they don't add up to anything.

**Armies are a one-way ratchet.** No disband. 105 divisions permanently consumed 147,000
of my people and permanently destroyed my frame rate.

---

## 16. DIPLOMACY / PEACE VERDICT

**Peace: surprisingly good. Diplomacy: absent.**

The peace system is one of the better-designed things here. War score as a budget;
provinces priced by size; a menu of non-territorial terms (Reparations, Demilitarisation,
Resource Concession, Industrial Rights, Liberate Minorities, Vassalise) with plain-English
descriptions; a 3-province cap per treaty; the enemy's provinces highlighted in red on
the map; a truce afterwards with a visible countdown. **Choosing a Resource Concession
to fix my sixty-year Coal shortage was the single best strategic decision the game let
me make.**

The problems:
- **The prices are set so high that the menu is decorative.** In 68 years I could afford
  exactly one item from it, once.
- **The AI's peace behaviour is one-directional.** Winning, it demanded reparations —
  rational and well-explained. Losing by 28, it offered only white peace and never
  conceded anything, ever.
- **Losing cost me nothing findable.** I lost a war at −31 with territory occupied,
  accepted a reparations demand, and no reparations line ever appeared in my budget.
- **There is no diplomacy at all.** No alliances, no guarantees, no rivals, no relations,
  no influence, no spheres. The Diplomacy screen is a list of nations with a Declare War
  button next to each — and at peace it isn't even reachable from the tab bar.
- **Declaring war is one unconfirmed click** with no war goal and no infamy preview.

---

## 17. AI VERDICT

Judged only on what I could see.

**Clever things the AI did:**
- Maresh declared war on me, fought competently, occupied 16% of my border region, drove
  my war score to −31, and then **proposed a rational, proportionate peace on its own
  initiative** and ended the war. That is a complete, sensible arc.
- AI wars happen elsewhere and conclude: *"Norurgrad imposed terms on Ireshia."*
- One AI, Halria, compounded enormously — hegemony 393 → **3580** while mine went
  393 → 1161. Something out there is playing well.

**Absurd things the AI did:**
- **Nothing, for sixty-two years.** After Maresh's war ended in 1840, not one nation
  declared war on me, approached me, allied against me, or reacted to my two wars of
  aggression in any visible way.
- **No border on the world map changed in 68 years** — not mine, not anyone's. Wars
  happen and resolve to nothing.
- Elanria, a nation I invaded twice, went from 77K to 91K people and 18 to 21 industry
  levels across 44 years. A typical AI nation is effectively frozen while the leader
  triples.
- Elanria never counter-attacked, never took a province from me, and never offered
  anything but white peace when losing.

**Verdict:** the AI has a functioning war-and-peace loop and nothing else. It does not
appear to have economic priorities I could detect, diplomatic goals, or any reaction to
a player who declares two aggressive wars and takes reparations.

---

## 18. BALANCE / EXPLOITS

- **Tariffs at 100% are free money.** ¤433/week of tariff take with no visible downside
  — no retaliation, no diplomatic cost, no shortage penalty I could attribute to it. I
  left them at 100% for fifty years.
- **Peace is strictly dominant.** War costs ¤130–270/week and returns almost nothing;
  peace restores a bankrupt treasury in six months. The optimal strategy is to never
  fight, which I discovered by 1853 and followed for the rest of the campaign.
- **Social spending is absurdly cheap for its effect.** ¤21/week bought me +24 stability
  and reversed a national population decline. Every player will max these immediately
  and never think about them again.
- **Private capital industrialises for you.** My plants went 5 → 23 → 38 levels with zero
  input from me. The player is optional to their own industrial revolution.
- **Infamy is a non-mechanic.** Two wars of aggression, occupations, imposed terms —
  peak infamy 3.2 out of a coalition threshold of 22. It decays back to 0 within months.

**The exploit I never found is the one that matters: there is no way to convert money
into power.** That is the balance hole the whole late game falls through.

---

## 19. REALISM / BELIEVABILITY

**What's believable:** the industrialisation curve (farmers → factory workers → clerks
over sixty years) is the most convincing thing in the game. The debt spiral is
convincing. Terms-of-trade collapse for a raw-material exporter is convincing and
interesting. Recruitment permanently consuming population is a real and under-used idea.

**What breaks it:**
- **A 35.8% socialist, 11.1% fascist population in 1836**, with a Labour Union party
  leading the national return. The ideology model has no period in it.
- **An Absolute Monarchy with a scheduled election** and a "Hold Election" button.
- **A world with no events.** Sixty-eight years in which nothing whatsoever happened to
  my country that I did not do myself.
- **Static borders.** Sixty-eight years of a 69-nation world with wars in it, and not one
  hex changed hands anywhere.
- **A price ceiling at exactly 8× base** that a dozen goods sit on permanently. Real
  shortages are resolved by supply; these never are.
- **Battles named "Battle of 21, 18"** after hex coordinates.

---

## 20. LATE GAME HEALTH

**The late game removes constraints instead of creating them, and then it stops
working.**

- **Money:** solved. ¤476,000 and nothing to buy.
- **Stability:** solved. Two sliders, ¤21/week, permanently.
- **Population:** solved. 97% employment.
- **Literacy:** solved. 68%.
- **Technology:** irrelevant — flat percentages, four dead categories.
- **Military:** larger but not more capable; and 105 divisions actively harm you.
- **Diplomacy:** never existed.
- **The map:** unchanged since 1836.
- **New problems to replace the old ones:** none. Not one.

My early choices *did* create late consequences — the education spending in 1836 is
visible in the 1900 workforce, and that is real. But nothing I could do in 1900 mattered
at all.

And then, at 1903, **the simulation collapsed to 0.06–0.11 weeks per real second and
0.2–0.3 fps** and did not recover. The late game does not merely die strategically; it
stops running.

---

## 21. WOULD I KEEP PLAYING?

**After 2 hours (≈1841): YES.**
Real economic problem, real levers, a war I didn't choose, a political lock explained
well enough to plan around. I wanted to know what happened next.

**After midgame (≈1874): NO.**
This is the honest answer. Twenty years of one meaningless reform per year, a war system
I'd proven couldn't win, and a treasury I couldn't spend. In a real session I would have
stopped somewhere around 1870 and I only continued because this is a test.

**After late game (1900–1904): NO.**
Even setting aside the performance collapse. There was nothing left to decide.

**Would I immediately start another campaign? NO** — but I would come back for a build
where construction works, war can change a border, and something happens to me that I
didn't cause. The bones here are good enough that I'd want to.

---

## 22. TOP 10 CHANGES I WOULD REQUEST

1. **Fix the Construction queue (B2-001).** Four buildings including University are
   unreachable. Everything downstream of build power is unassessable until this works.
   *(Phase B correction: the queue is not broken — the state rows disable silently when
   the treasury cannot cover the cost. The change needed is a **disabled-reason string**
   on the row and a greyed price on the building tile, matching what the factory picker
   already does. It cost me the entire construction pillar for sixty-eight years, so it
   stays at #1.)*
2. **Make war able to change a border.** Either war score must accumulate 5–10× faster,
   or provinces must cost a fraction of what they do. As it stands the entire military
   half of the game cannot affect the map, and in 68 years no border on the planet moved.
3. **Rebuild the offensive control.** One clearly-labelled order, with a visible pressed
   state, that does not silently revert. Document right-click. This is the single worst
   UX failure in the build.
4. **Give money something to buy.** Infrastructure, subsidies that matter, navies worth
   having, diplomatic influence, buying technology, funding another nation's war —
   anything. ¤476,000 with a ¤55/week ceiling on social spending is the late game's
   central failure.
5. **Fix the late-game simulation cost (B2-025).** 0.1 weeks/second at 105 divisions
   ends the campaign regardless of everything else. And give the player a way to
   **disband divisions**.
6. **Make ideology move.** Frozen ideology freezes the electorate, which freezes
   elections, which freezes politics. Everything in the political layer is downstream of
   this one number never changing.
7. **Announce consequential events properly.** War declarations and government changes
   must pause, or at minimum look different from "a factory reached level 5". I fought a
   war and changed constitution four times without being told.
8. **Build the event/decision system.** Sixty-eight years in which nothing happened *to*
   me is the reason the middle third of this campaign has no gameplay.
9. **Add country selection**, with a short "here is your situation and your problem"
   briefing. Being silently assigned the world's #1 power is the worst possible opening.
10. **Make reform support actually vary.** Every reform at 100.0% forever means the
    reform screen — one of the best-presented screens in the game — contains no decision.

**Honourable mentions:** move critical info out of native `title` tooltips (mobile-first
game); reconcile the contradictory numbers across screens; let me see the whole world map.

---

## 23. DO NOT CHANGE THESE

1. **The main menu and the whole presentation layer.** Scenes, epigraphs, typography,
   loading lines, the map's look. It is the best thing here.
2. **The disabled-reason discipline.** *"Blocked — Small Arms short: 10 needed, 6.0 in
   stock"*, *"There is no electorate"*, *"treasury short by ¤88"*, *"The election is 18
   weeks away; it can be called in the last 12 weeks"*. Almost every strategy game gets
   this wrong. Keep doing it everywhere.
3. **The stability tooltip format** — named terms, signed contributions, an equals line.
   Use this pattern for everything.
4. **The Trade screen**, especially the per-good producers/consumers/demand-by-source
   breakdown and "WHY THE PRICE MOVES".
5. **The workforce transformation model.** Farmers → factory workers → clerks over sixty
   years, driven by literacy and industry. This is the best long-run simulation in the
   build and the main reason I kept playing.
6. **Automatic borrowing** ("deficits draw on credit, surpluses repay") and the debt/
   interest/credit-limit model. Low-micro, high-consequence, exactly right.
7. **The peace-terms menu design** — war score as a budget, priced options, plain
   descriptions, red provinces on the map, and the post-war truce timer. The *design* is
   good; only the prices are wrong.
8. **Recruitment consuming population permanently.** A real cost most games in this genre
   fudge.
9. **The honesty of the "not built yet" notices.** I'd rather read "the event system is
   not built yet" than be shown invented filler.

---

## 24. FEATURES I NATURALLY WISHED EXISTED

Things I actually reached for and couldn't find, in the order I wanted them:

- A **country selection screen** with a briefing.
- **Something to spend money on** — this is the wish I had most often, for fifty years.
- A **"disband division"** button.
- **Alliances, guarantees, rivalries** — anything diplomatic at all, especially once I
  was rank 11 and being outgrown.
- A **world/strategic map view** to see who was actually winning.
- A **notification log** I could scroll — I missed a war and four constitutional changes.
- **A reason to build a navy.** I have maritime access and never once cared.
- **Something to do with my 36% Girnsk minority** — assimilate them, repress them,
  concede to them, anything.
- **An "events happened this year" summary** at year end.
- **Research I could steer** — priorities, institutions, spies, anything more than
  picking the next +4%.
- A way to see **what my rivals are doing** without clicking each province one at a time.
- **Auto-assign leaders defaulted ON**, and a "queue N infantry" control.

---

## 25. FINAL PLAYER VERDICT

**Imperial Eye is a genuinely good economic and social simulation wearing a grand-strategy
game that doesn't work yet.**

The economy has real failure states — I went bankrupt and it was my fault and I could
see exactly why. The society transforms over decades in a way that is believable,
legible, and caused by my decisions. The presentation is excellent and the
explain-yourself discipline in the UI is better than most shipped games in this genre.
For the first fifteen years I was properly engaged, and the moment in 1844 when a
franchise reform visibly changed my form of government is as good as anything in a
Paradox opening.

But a grand-strategy campaign needs a reason to keep making decisions for a hundred
years, and this build runs out of them around 1855. War cannot change a border — in
sixty-eight years, on a map with sixty-nine nations, **not one hex changed hands
anywhere**. Money becomes infinite and has nothing to buy. Politics is a twelve-month
timer over a frozen population. Technology is four dead buttons and a drip of
percentages. There are no events, no decisions, no diplomacy, and nothing ever happens
to you that you did not do yourself. Then, at 1903, the simulation stops running.

The single most damaging thing I can say is this: **I played for sixty-eight in-game
years and never once opened the navy, never used logistics, never needed technology,
never had a diplomatic relationship, and never changed a border — and I still finished
first-rank-adjacent, unthreatened, and half a million in credit.**

Test #1 asked "is there a game here?" On this evidence: yes, there is one very good game
here — a nineteenth-century economic-and-social simulator with an outstanding readout
layer. The empire is not in it yet.

**Score, as a player: 5/10 today. The parts that work are worth 8; the parts that are
missing or broken are worth 2; and the late game is worth 0.**

I would absolutely play the next build.
