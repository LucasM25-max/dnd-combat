# Fable

*(working title — repo name `dnd-combat`)*

**A 3D voxel D&D RPG platform containing multiple playable campaigns of different structures, powered by one faithful 5e rules engine, alongside a standalone Endless Mode.**

This README is the living design document.

---

## 1. The Concept

Fable is not "a D&D RPG with an idle mode attached." It is a platform:

```text
                         FABLE
                           │
             ┌─────────────┴─────────────┐
             │                           │
       STORY MODE                  ENDLESS MODE
             │                           │
      ┌──────┼──────┐                    │
      │      │      │                    │
 Tutorial  Story   Sandbox          Continuous
   │        │        │                 5e combat
   │        │        │                    │
 Garrick   Custom/  Custom/         Party + Gambits
           guided   full creation         │
      │      │      │                     │
      └──────┴──────┴─────────────┬───────┘
                                  │
                           SHARED 5e ENGINE
                                  │
                        Shared characters,
                      rules, items, abilities
```

- **Story Mode** — a library of authored campaigns, each free to have its own structure, cast, setting, tone and degree of player freedom. The **Tutorial Campaign** is five linked adventures running levels 1 to 7; it is self-contained, and **not** the template every future campaign must follow.
- **Endless Mode** — a standalone, always-running idle mode in the Idle Champions mold, with its own economy and prestige loop. Complete as a game on its own.
- **One faithful 5e rules engine** underneath everything. Same dice, same stat blocks, same maths, whether you're playing a tactical boss fight or watching wave 300 resolve at max speed.

The guiding principle:

> **The writers create the person. The player creates the adventurer.**

### Top-level menu

```text
STORY MODE
  The Tutorial Campaign  (5 adventures, levels 1-7)
  Campaign 1
  Campaign 2
  ...

ENDLESS MODE
```

The two modes are **Story Mode** (the campaign library) and **Endless Mode** (the idle lane).

---

## 2. Technical Direction

### Stack
- **TypeScript everywhere.**
- **Rendering:** Three.js (with React for UI, e.g. React Three Fiber). Voxel assets authored in MagicaVoxel, exported to glTF, instanced for crowds.
- **Build:** Vite. Monorepo layout:
  - `packages/rules` — the 5e engine. Pure TS, **zero rendering dependencies**.
  - `packages/campaign` — the campaign framework: loading, world state, quests, flags, progression rules.
  - `packages/content` — schemas and all game content (campaigns, creatures, items, spells).
  - `apps/web` — the client.

### Architecture principles
- **Four clean layers: rules → content → campaign structure → presentation.** This separation was valuable when the plan was one adventure; with a campaign library it is essential.
- The rules engine is **pure and headless** so it can run in a Web Worker, in unit tests, and at high speed for Endless Mode.
- **Deterministic reducer + seeded RNG** → reproducible fights, verifiable saves, fast-forwarded idle catch-up.
- **Everything is data.** Abilities, creatures, items, dialogue, quests and whole campaigns live in JSON, not code. This is the decision that makes a campaign library possible at all.
- **One ruleset, one engine, never two combat systems.**
- **Client-authoritative.** No multiplayer, so no server. Keep the engine pure anyway, in case that changes.
- **Saves:** IndexedDB, with export/import. Offline idle progress replays the sim from `lastSeen`.
- **Web performance budget:** cap tactical grids (~20×20), pool entities, keep idle simulation in a worker so it never blocks the main thread.

---

## 3. Rules Engine (`packages/rules`)

A direct adaptation of 5e, not a D&D-flavoured abstraction.

### v1 scope
- Ability scores, proficiency bonus, advantage/disadvantage
- Initiative, turn order, action / bonus action / reaction / movement
- AC, attack rolls, damage types, resistance and vulnerability
- Saving throws and DCs, ability checks and skills
- Conditions (Poisoned, Prone, Frightened, Grappled, …)
- Concentration, spell slots, short and long rests, death saves
- Weapon Masteries (2024 rules) and Heroic Inspiration

### Effect DSL
Abilities are composable data, never hardcoded:

```json
{ "on": "attackHit", "apply": "condition.poisoned", "save": { "ability": "con", "dc": 11 } }
```

The single most important early decision — it is what lets new campaigns add content without engine changes.

### Testing
Unit-tested against known 5e cases from day one. The engine must be trustworthy before anything is drawn on screen.

---

## 4. The Campaign Framework (`packages/campaign`)

Campaigns are **first-class content objects**, not a list of scenes.

```text
Campaign
├── metadata          name, blurb, recommended level, tone
├── world             setting, regions, travel rules
├── locations         exploration scenes, hubs, dungeons
├── characters        protagonist(s), companions, NPCs
├── factions          reputation tracks
├── quests            main, side, optional
├── encounters        combat setups bound to maps
├── dialogue          node graphs with flags and conditions
├── progression       XP curve, level cap, milestone rules
├── campaign rules    what's allowed to carry in and out
└── story structure   freedom profile (below)
```

A single campaign can freely mix linear story, semi-open quests, open-world locations, optional encounters and branching outcomes. The engine must handle both *"follow this carefully authored story"* and *"here's a 40-hour region, decide what you want to do"* without two different RPG systems.

### Structure as an explicit design parameter

Every campaign declares its **freedom profile**. Internal design philosophy, not necessarily shown to the player as a graph.

**Railroaded**
```text
Story        █████
Freedom      ██
Exploration  ██
Char. focus  █████
```

**Semi-open**
```text
Story        ████
Freedom      ████
Exploration  ████
Char. focus  ████
```

**Sandbox**
```text
Story        ███
Freedom      █████
Exploration  █████
Char. focus  ███
```

This lets us say deliberately: *Campaign A is a narrative experience. Campaign B is an exploration experience.* Rather than forcing every adventure into one template.

### Character Customisation Level

A campaign-level setting governing how much mechanical authorship the player gets:

| Level | Meaning |
|---|---|
| **Fixed** | Fully authored character. Identity *and* build locked. (The Fouled Stream / Garrick.) |
| **Guided** | Authored identity; player picks subclass, feats, spells within a narrow frame. |
| **Flexible** | Authored identity and role; player chooses class and build freely. |
| **Full** | Player-created character inside the campaign's world. |

The standard for most campaigns is an **authored narrative identity with a player-selectable mechanical identity**:

> *"You are Captain Elena Vey, an exiled knight."*

The campaign owns who Elena is — her history, relationships, personality, role in the story. The player owns class and build choices, ability allocation, equipment, spells, combat style and (where supported) appearance.

### Party composition is a campaign choice

No global rule. A campaign may start with a solo protagonist, a duo, a full party, or recruit the party gradually. The Fouled Stream is solo because that suits a tutorial — not because the game is solo.

### Campaign progression rules (the balance layer)

Essential once campaigns differ wildly: a campaign that hands out a powerful sword early must not wreck another one. Each campaign declares:

- Starting level and starting equipment
- Level cap and XP curve
- Imported characters allowed?
- Imported equipment allowed?
- Difficulty scaling
- Whether Endless Mode upgrades apply

This supports both *"take your existing hero into this campaign"* and *"this is a curated experience; everyone starts from scratch"* on one shared engine.

### Personality as a real system

Characters carry an authored personality archetype — **Reckless, Pragmatic, Idealistic, Cautious, Ambitious, Compassionate**, and so on.

Personality influences:
- Dialogue options available
- NPC reactions and relationship drift
- Occasional unique choices only that archetype can take
- Combat tendencies (and gambit defaults in idle)
- Special personality traits and abilities

Crucially, the player is **not** forced to build the character mechanically around the personality. Garrick is Reckless by authorship; you can still play him carefully.

---

## 5. Content (`packages/content`)

### Schemas
`campaign`, `scene`, `creature`, `spell`, `item`, `feature`, `condition`, `encounter`, `map`, `dialogue`, `quest`, `faction`, `character`.

### Scene nodes
Scenes are graphs of nodes — `dialogue` / `check` / `encounter` / `exploration` / `reward` — with flags and conditional edges.

### Legal
Use SRD 5.2.1 (CC-BY) stat blocks and spells only. Original prose is our own. Avoid non-SRD monsters and published adventure text.

> **Open item:** confirm the Twig Blight and Treant stat blocks exist in SRD 5.2.1. The 2024 SRD monster list is trimmed relative to the full Monster Manual. If a creature is absent, rebuild it as original content or substitute an SRD fungal creature.

### Long term
An in-browser campaign/encounter editor so new content needs no code.

---

## 6. The Tutorial Protagonist — Garrick Vell, "the Pride of High Ery"

A title he gave himself. Nobody else in High Ery uses it.

**Customisation Level: Fixed.** Garrick is the one fully authored character in the game — fixed identity, fixed personality, fixed build. That is exactly what makes him the ideal tutorial vehicle, and it is a deliberate exception rather than the house style.

### Concept
Mid-twenties, broad, loud, genuinely competent and absolutely certain he's more competent than that. Served a short, uneventful stint as a caravan guard out of Greyhawk and talks about it like a war. Came home to High Ery to find the stream running with scum and the elders worrying — and saw, finally, a monster worth killing and a story worth telling.

He is not a fool and not a coward. He's a young man who has never yet been properly beaten, and the adventure's job is to introduce that possibility.

### Voice
Narrates his own fights. Named his sword. Treats retreat as a tactical concept that applies to other people. Warms up fast, apologises badly, and is quietly more attached to his village than he'd admit out loud.

### Personality: Reckless
The first implementation of the personality system. Offers tempting high-risk options in dialogue and combat — attack with advantage, take it in return — so the player *plays* his character rather than reading it.

### Stat block (SRD 5.2, Fighter 1, Human, Soldier)

| | |
|---|---|
| **STR** | 17 (+3) |
| **DEX** | 13 (+1) |
| **CON** | 15 (+2) |
| **INT** | 8 (−1) |
| **WIS** | 10 (+0) |
| **CHA** | 12 (+1) |

Standard array plus the Soldier background's +2 STR / +1 CON. The INT 8 and CHA 12 are the character: not a thinker, pretty convincing anyway.

- **AC 19** — chain mail (16) + shield (2) + Defense fighting style (1)
- **HP 14** — 10 + 2 CON + 2 from Tough
- **Speed** 30 ft. **Proficiency** +2
- **Saves:** STR +5, CON +4
- **Skills:** Athletics +5, Intimidation +3 (Soldier); Perception +2, Survival +2 (Fighter); Insight +2 (Human *Skillful*)
- **Feats:** Savage Attacker (Soldier), Tough (Human *Versatile*)
- **Human traits:** *Resourceful* — Heroic Inspiration on every long rest. A lovely tutorial mechanic for teaching rerolls.
- **Second Wind:** bonus action, 1d10+1 HP, 2 uses per short rest. His lifeline as a solo level 1; teach it explicitly in the first fight.
- **Weapon Masteries:**
  - **Longsword (Sap)** — target has disadvantage on its next attack
  - **Handaxe (Vex)** — on a hit, advantage on your next attack against it
- **Gear:** chain mail, shield, longsword ("Oathkeeper" — he named it; there was no oath), two handaxes, a spear, dice from his guard days, a travelling pack.

### Why these choices
AC 19 means a Twig Blight (+3 to hit) connects only on a 16+, so a lone PC can survive a pack. Defense + Tough + Second Wind give three independent dials for tuning survivability without touching the monsters. Sword-and-board also makes the over-confidence *readable* — he looks like a tank and plays like one, right up until the ooze.

---

## 7. Campaign Presentation

- **Exploration:** free movement (WASD or click-to-move) over a voxel scene with interactables — talk, loot, check, trigger.
- **Combat:** 5 ft square grid. When an encounter fires, the *same* scene converts in place — grid overlay fades in, initiative rolls with a visible d20. No loading screen. Exploration and combat read from one voxel tile dataset.
- **Speed controls** 1× / 4× / instant-resolve, plus a **Take Control** button that hands any AI-driven turn back to the player.
- Companions are driven by the gambit AI by default and can be taken over manually at any time.

Progression within a campaign is straight 5e levelling, bounded by that campaign's progression rules. Meta progression stays in-fiction — roster, downtime, renown with factions.

---

## 8. The Tutorial Campaign

**Self-contained, five adventures, levels 1 to 7.** The Tutorial Campaign is a complete arc that teaches every system in the engine by introducing one new pillar per adventure. It ends; it does not lead into Campaign 1, and it does not set the structural template for the campaign library.

- **Customisation Level:** Fixed for Adventure 1, loosening to **Guided** from Adventure 2 onward as companions and level-ups arrive
- **Freedom profile:** Railroaded at the start, drifting to Semi-open by Adventure 4
- **Progression rules:** fresh start, no imports, no Endless Mode upgrades applied

### The arc at a glance

| # | Adventure | Level | Party | New pillar it teaches |
|---|---|---|---|---|
| 1 | **The Fouled Stream** | 1 | Solo (Garrick) | Core loop: exploration, dialogue, grid combat, conditions |
| 2 | **Miner Difficulties** | 2 | +1 companion | Dungeon crawling, random encounters, hazards, a monster you can resolve without killing |
| 3 | **The Winged God** | 3 | Full party of 4 | Escort, faction attitude, moral choice, first real boss |
| 4 | **Horns of the Beast** | 5 | 4 | Overland travel, journey stages, betrayal, artifacts and curses |
| 5 | **Boreal Ball** | 7 | 4 | Social encounters as a full system: Renown, attitudes, a party where combat is the interruption |

Level gaps (3 → 5 → 7) are intentional. Between adventures the party is in **downtime** — which is where Endless Mode, shopping and companion scenes live for players who want them, and where a simple "time passes, you level" transition serves players who don't.

### Companions

The solo-Fighter rule applies **only to Adventure 1**. Adventure 2 pairs Garrick with one companion (Cleric — slots, healing, concentration); Adventure 3 fills the party to four (adding Rogue and Wizard). By Adventure 5, all four have authored relationships with each other and with the campaign's NPCs. Each is **Guided**: authored identity, player-chosen subclass, feats and spells.

---

### Adventure 1 — The Fouled Stream *(Level 1, solo)*

**Situation.** An alien fungus in a cave is polluting the stream that flows past the village of High Ery; the fungus has spawned vile creatures in and around the cave.

High Ery itself is **backstory, not a level** — Garrick comes from there, but the game opens at the First Fork. Encounter order is faithful to the outline: **Fork → Borogrove → Blights → Cave**.

#### Scene 1 — The First Fork (exploration, no combat)

**Purpose:** teach movement, interaction and ability checks. Target 5–7 minutes.

**The place.** A mile upstream of High Ery, late afternoon. The main river runs wide and brown-green; from the south a smaller stream slides out of a little wood to join it. The water where they meet is *wrong* — a seam of grey scum curling downstream, pale fungal shelves bracketing the tributary's banks like bad teeth. Low sun, long shadows through birch, mist on the water. Audio does heavy lifting: the river is loud and healthy, the tributary is oddly quiet.

**Voxel staging.** A compact exploration bowl, ~60×40 tiles, bounded naturally — river north, dense wood south and east, the road back to High Ery west (walk that way and Garrick says something dismissive about going home). One clear sight-line: the tributary leads south into the trees, and the mist draws the eye.

**Beats:**
1. **Arrival.** Garrick steps off the road, player-controlled from the first frame. No cutscene. A floating prompt teaches movement, then never appears again.
2. **The riverbank** *(Investigation DC 10, or just walk close)*. The scum has a direction. *"Upstream. Of course it's upstream. Everything unpleasant is."* Teaches interactables and the check UI.
3. **The fungal shelf** *(Nature DC 12)*. Garrick will likely fail — deliberately. It establishes he's out of his depth on anything bookish and sets up Borogrove as the one who knows. On a rare success: the growth isn't native to the Flanaess at all. **This is where Heroic Inspiration gets taught** — offer the reroll here.
4. **Dead fish / deer tracks.** Optional flavour. Perception DC 10 reveals bear tracks heading upstream — a quiet plant for the Berserk Bear. Rewards curiosity with foreshadowing, not loot.
5. **The blackened twig.** A brittle, examinable twig among the deadwood. Garrick dismisses it. The player will recognise it in twenty minutes.
6. **The crossing.** A fallen birch over the tributary. **Athletics DC 10** to cross fast, or walk thirty seconds to a ford. Garrick is +5; he'll make it, and he'll be smug. Teaches multiple solutions, and that his stat line means something.

**Design rule:** first checks never gate progress. A failure gives a weaker hint and costs nothing.

**Exit.** No fight here, so the scene ends on atmosphere: mist thickening, birdsong stopping, the sense of being watched as Garrick follows the tributary south. He reads it as "something's afraid of me." It's Borogrove, watching.

#### Scene 2 — Journey Upstream (dialogue)

Borogrove, a kindly Treant who keeps watch over the wood, steps out of what Garrick took for a tree. The dialogue-system showcase, and the first real test of the interactive-story goal.

- **Tonal engine:** Borogrove is kindly, ancient, slow and completely unimpressed by swagger. Garrick is loud and in a hurry. Both the comedy and the character work come from that mismatch.
- **Choice axis:** boast / listen / be honest. All three reach the same information — the source is a cave the stream spills out of — but they set a relationship flag that changes Borogrove's warmth on the Journey Home and whether he teases Garrick about the blights.
- **The acorn.** He gives it over regardless. If swallowed it conveys the benefits of a *Potion of Healing* and the *Lesser Restoration* spell. But *how* it's explained depends on whether the player listened: brush him off and the Lesser Restoration property goes unmentioned, so the player may not realise they can cure the Brown Bear later. A real consequence from a dialogue choice in the first ten minutes.
- Optional **Insight DC 12** to notice Borogrove is frightened, not merely concerned — the corruption is spreading faster than he admits.
- Teaches: dialogue UI, NPC relationships, receiving and inspecting an item, consumables in inventory.

#### Scene 3 — Twig Blights (first combat)

Just outside the cave mouth. The stream spills from a dark cave in a rock face; deadwood litters the approach. The grid converts in place.

- **Three blights, not six.** Six is a party encounter; three is a tense solo one. Each dies to one longsword hit, so the lesson is action economy: Garrick can only kill one per turn, so he *will* take hits. (The six-blight version survives as an Endless Mode wave.)
- **Teaching order, matched to the fight's own rhythm:**
  1. Turn one — move and attack.
  2. Turn two — they surround him; the UI surfaces **Sap** on the longsword.
  3. Turn three — around half HP, the UI surfaces **Second Wind**.
  The whole 2024 Fighter kit taught in three turns.
- **Fire vulnerability** is in their stat block. Garrick has no fire at level 1, but dry brush on the map lets him shove a blight into it — teaching that the environment is part of the rules.
- **The payoff:** the brittle twig from scene one. The player has been told the wood is sick, met someone afraid of it, and *then* gets ambushed. Dread, then release.
- Borogrove's acorn is already in inventory — the correct safety net for a lone level-1 Fighter, and a lesson in item use under pressure.
- Losing should be survivable: death saves, then a narrative failure state (he wakes bruised by the ford, mocked by his own inner monologue) rather than a reload screen.

#### Remaining encounters

- **Corrupted Cave** — the Underdark Warren map, trimmed: ignore the secret door and inner chambers; close the south, east and north tunnels. Enter from the southeast following the stream.
- **Entrance** — a Shrieker Fungus alerts the cave. Four Bullywug Warriors with fungal growths respond. Teaches approach choice (stealth vs. noise), the alert mechanic, and conditions.
- **Berserk Bear** — a Brown Bear in a southeastern side cave, Poisoned by the water. Curing the Poisoned condition (the acorn, or anything else) ends the encounter peacefully. Teaches that conditions and items are real alternatives to violence.
- **Ooze's Lair** — a Psychic Gray Ooze and six Stirges at the north end of the stream. Boss fight: saves, concentration, attached enemies. Destroying the brain-like fungus in the water grants a bonus 100 XP.
- **Journey Home** — Borogrove again. A replacement acorn if the first was used; a *Staff of Flowers* if the source was purified. Branching epilogue keyed to the relationship flag from Scene 2. The campaign ends here, complete.

**Why this is the vertical slice:** it exercises dialogue, exploration, skill checks, three combats, conditions, items, a non-combat solution and branching rewards. If it ships, the engine is proven.

---

### Adventure 2 — Miner Difficulties *(Level 2, +1 companion)*

**Situation.** Miners outside the village of Blackstone dug into an Underdark tunnel and a Hook Horror found its way in, then got trapped when the hole collapsed behind it. It has eaten a few miners. The rest won't go back down.

**Hook.** Mayor Kristryd Splitanvil, a Lawful Good dwarf, hires the party on the strength of their work at the Fouled Stream — the first time the campaign acknowledges the player's own history. She offers a topaz worth 500 GP for killing or driving off the creature.

**New systems this adventure introduces:**
- **Dungeon crawling** — a multi-level map with real navigation, rather than a linear scene chain. The Mine map, three levels, player-chosen route.
- **The random encounter table** — rolled on entering each distinct area. This is the engine's first *procedural* content and a direct feeder into Endless Mode's wave generator; build them on the same spawner.
  - 1: four Violet Fungi + one Rust Monster — teaches equipment loss as a threat
  - 2: one Giant Spider + two Swarms of Insects — teaches swarms and area damage
  - 3: one Darkmantle + three Piercers — teaches ambush from above and darkness
  - 4: yellow mold on a miner's remains — teaches environmental hazards
  - 5: one Gelatinous Cube — teaches engulf, and that some fights should be avoided
  - 6: Sounds of Terror — the tracking encounter
- **Hazards as first-class map objects** (yellow mold, unstable rubble, darkness and light sources).
- **A stalking antagonist.** "Sounds of Terror" fires twice: the first roll is only clacking echoes and gouged walls; the second is the Hook Horror itself. It is hungry but what it actually wants is to get home, and it **retreats from a fight going badly** — teaching fleeing enemies and morale.
- **The non-violent solution, escalated.** The Underdark connection in the southeast of the bottom level is rubble-choked. Clear it and the hook horror hears its kin, hurries past the party and leaves forever. Bonus 200 XP each. A whole dungeon resolved without the boss fight — a much bigger version of the Berserk Bear lesson.

**Why it's second:** it proves procedural encounters, dungeon navigation and the AI's retreat behaviour, all of which Endless Mode needs.

---

### Adventure 3 — The Winged God *(Level 3, full party of four)*

**Situation.** A Red Dragon Wyrmling drove a band of kobolds out of their warren and claimed it as a lair. The displaced kobolds are raiding merchants in the Cairn Hills, hoping the dragon will accept them back as servants.

**Hook.** Nondy Barducks, a Lawful Neutral gnome merchant, hires the party to escort his wagon to the mining village of Diamond Lake. 150 GP each.

**New systems:**
- **Escort and travel-with-an-objective** — a moving protectee with its own HP and an AI that panics.
- **Creature attitude as a mechanic** (Hostile / Indifferent / Friendly) and the ability to shift it through play.
- **A branching structure with no wrong answer:**
  - *Kobold Bandits* — eight Kobold Warriors surround the wagon shouting "For the Winged God!" If four fall, the rest flee. A captured kobold explains everything.
  - *Pursue them* → **Kobold Camp**, where they refuse to fight and beg for help.
  - *Carry on* → **Kobold Supplicants**, where twelve Kobold Warriors and six Winged Kobolds approach humbly with the same offer: drive off the dragon and they'll return Nondy's stolen goods.
  - Either route reaches the same place. The player's choice colours *how* — the campaign's first real demonstration that branching isn't about locking content away.
- **The moral turn.** The enemies from the opening fight become the quest-givers. Teaches that attitude is changeable and violence is one option among several.
- **The first true boss.** The Volcanic Caves, cut small: four Magma Mephits and three Smoke Mephits at the entrance, then the Red Dragon Wyrmling on its hoard — Nondy's crate (400 GP), 4,200 CP / 2,000 SP / 180 GP, seven 50 GP gems, a Potion of Healing, a Rope of Climbing, and Spell Scrolls of Alarm and Comprehend Languages. Bonus 400 XP each for defeating **or driving off** the dragon.
- **Legendary-adjacent combat design:** breath weapon recharge, flight, a lair that fights back. The first encounter that genuinely needs four characters and justifies the full formation UI.

---

### Adventure 4 — Horns of the Beast *(Level 5)*

**Situation.** A forgotten ruin in the Amedio Jungle holds a fiendish artifact, the Horns of the Beast. A villain intends to claim it.

**Hook.** Melchis, an unassuming human merchant — secretly a Chaotic Evil Fiend Cultist devoted to Iuz — hires the party to escort an expedition to a lost jungle temple. 2,000 GP in trade bars, half on arrival, half on safe return, plus his "limited magical ability."

**New systems:**
- **Overland travel as a structured journey** in three stages, with pace, supplies and per-day encounter rolls. This is the biggest new subsystem in the campaign and the foundation for any future open or semi-open campaign.
  - **Stage 1 — Sea.** Passage across Jeklea Bay at ~1½ hexes a day, ambushed near the end by two Sahuagin Priests, six Sahuagin Warriors and a Water Elemental. Teaches: ship maps, aquatic combat, an NPC crew that stays out of the way.
  - **Stage 2 — Jungle.** ~180 miles, a d20 roll per day: mostly nothing (1–14), then a territorial Giant Ape, a hunting Tyrannosaurus Rex, three Allosauruses, two Ankylosauruses, an Indifferent band of jungle humans, or four Minotaurs of Baphomet hunting captives for the temple. Teaches: attitude-driven encounters where fleeing, talking or avoiding are all valid.
  - **Stage 3 — Lakeshore.** 90 miles of coast. Day two brings heavy rain obscuring vision and quicksand pits; the front rank may sink while two Giant Crocodiles attack. Teaches: weather, terrain hazards and split-party crisis management.
- **A travelling NPC with a hidden agenda.** Melchis accompanies the party for the whole adventure. The dialogue system needs long-arc NPC state and foreshadowing the player can catch (or miss) — the single strongest argument for having built the relationship-flag system properly back at Borogrove.
- **The ruins.** The western half of the Dungeon Hideout ground floor, stairs ignored. Six Minotaurs of Baphomet, spread out, converging on the sound of combat — teaches dynamic reinforcement and sound propagation.
- **Artifacts and curses.** The Horns rest on a pedestal in the northwest. Melchis grabs for them and, if he succeeds, transforms into a Hezrou and attacks. A character who dons them suffers Demonic Possession, removable only by Remove Curse. Searching Melchis yields a Bag of Holding with twelve 250 GP trade bars and a Spell Scroll of Teleportation Circle with a sigil sequence.
- **Knowledge as a reward:** casting Identify reveals the Horns can only be destroyed in the River Oceanus, in the Upper Planes. A deliberate loose thread the campaign never resolves.
- Bonus 1,000 XP each.

---

### Adventure 5 — Boreal Ball *(Level 7)*

**Situation.** The Baron of the Boreal Ball, a minor Feywild noble, holds an unending ball in his ice palace. Beneath the revelry run schemes and intrigues.

**Hook.** A magical invitation arrives and teleports the party to the ball at the appointed hour.

**New systems:**
- **Social encounters as a full mechanical system**, structurally parallel to combat. Three dances; each dance, every character chooses an activity — dance, mingle, observe, scheme — and can earn **up to 1 Renown per character per dance** by making a positive impression.
- **Renown as a visible score** driving the adventure's outcome, exactly as HP drives a fight. The campaign's climax is a number you raise by talking.
- **A cast with attitudes that move:**
  - **Cannifer**, a Satyr Revelmaster, Hostile — used to being the centre of attention.
  - **Daris**, a Friendly fun-loving Dryad who wants to be seen dancing with everyone.
  - **Fidget**, an Indifferent Pixie, pranks all evening and harms nobody.
  - **Granny Snailtongue**, a Hostile Green Hag who helps at every turn purely to put the party in her debt — teaches that a Friendly-looking offer is not a safe one.
  - **Raxas Albrethin**, an arrogant Chaotic Neutral drow Mage, Hostile, wants the party humiliated — but flips to Friendly once Renown reaches 6.
- **Combat as the interruption, not the point.** After the second dance, Varka — a Neutral Evil Hobgoblin Warlord — bursts in with a Hobgoblin Captain and five Hobgoblin Warriors, offended by the party's presence. Defeating them grants +2 Renown. A level 7 party in ballroom clothes: teaches that the social scene and the tactical grid are the same world.
- **Conclusion.** The Baron appears after the third dance. At Renown 6 or more, each character receives a **Charm of the Boreal Ball** — one casting of Ice Knife at level 3, then it vanishes. Bonus 1,700 XP each.
- **Why it ends here:** the campaign closes on the opposite of how it opened. Adventure 1 was a lone over-confident fighter swinging a sword at a twig. Adventure 5 is four accomplished adventurers who win by being charming. Garrick's arc, mechanically expressed.

---

### Content and licensing note

> These five adventures are adapted from the 2024 *Dungeon Master's Guide* adventure outlines (pp. 122–125). **They are not SRD content.** The SRD 5.2.1 covers the rules, and many but not all of the creatures.
>
> Before anything ships publicly, every adventure needs a pass to:
> - Replace non-SRD creatures (Hook Horror, Darkmantle, Piercer, Rust Monster, Minotaur of Baphomet, Satyr Revelmaster, Sahuagin Priest, and others may not be present) with SRD equivalents or original statblocks.
> - Rewrite all situations, hooks, NPCs and place names as original prose. Greyhawk specifics — Iuz, the Flanaess, the Cairn Hills, Diamond Lake, the Amedio Jungle, Jeklea Bay — must be replaced with our own setting.
> - Keep the *structure* (which is not copyrightable) and discard the *expression* (which is).
>
> Treat the current text as a design scaffold, not shippable content. Tracked as the top open question.

---

---

## 9. Endless Mode

**A first-class, standalone mode.** Not downtime, not a side-system, not campaign-gated. A player who never opens a campaign should be able to launch the game, go to Endless Mode, and have a complete, satisfying loop.

### The view: side-scrolling lane
- **Persistent side-view panel.** Party formation on the left; enemies stream in from the right down a continuous 3D voxel lane. Always visible while the mode is active — not a menu, not a log, not a send-and-check-back system.
- **Continuous flow.** As one wave dies the next spawns instantly with a brief transition — a new corridor section scrolls in, a door kicks open. No loading, no downtime. The lane just keeps going.
- **Speed controls:** 1× / 2× / 4× / max (instant-resolve with a scrolling damage ticker).
- **Visual feedback:** floating damage numbers, crit flashes, condition icons above heads, kill counters. This is the "watch your party work" screen and the renderer should stay busy.

### How 5e fits a continuous lane
- **Every wave is a real 5e encounter**, resolved at high speed by the gambit AI. Same engine, same stat blocks, same dice. The 5e maths is the source of truth for DPS, never an abstraction layered on top.
- **Resource attrition is dramatically simplified** to keep flow:
  - **HP auto-restores between waves** — each wave break is an automatic short rest; Second Wind refreshes, HP tops off.
  - **Spell slots refresh every 10 waves** — an automatic long-rest milestone, marked in the lane with a campfire animation.
  - **No death or failure state.** When the party would TPK they "hold the line": damage stops, kills stop, and you sit at the wall until you upgrade or prestige. No game over, no resource spiral.
- **Enemy scaling is the wall, not resource drain.** Enemy HP scales exponentially per wave (~10–15% compounding). AC and attack bonus scale far more slowly, so the 5e maths stays functional — advantage/disadvantage still matters, crits still land hard. Eventually DPS can't keep up with the HP curve. That's the wall.

### Wave and area structure
- **Areas:** themed dungeon zones (Fungal Caverns, Goblin Warrens, Undead Crypt, …), ~50 waves each.
- **Wave composition:** early waves are weak mobs (1–3 creatures); later waves add elites and mixed groups, with a mini-boss at wave 25 and a boss at wave 50.
- **Area progression:** clear wave 50 to unlock the next area, or buy it early with gold. Campaign progress can also unlock areas as a bonus, but **gold is the primary path**.
- **Looping:** past wave 50 the area loops at higher difficulty with a multiplier badge (Area 1 ×2, ×3, …) for players who prefer farming to pushing.

### Economy and progression (gold-driven)
- **Gold per kill**, scaling with wave number and area. Boss waves drop big chunks. Primary currency.
- **The upgrade tree:**
  - **Gear upgrades** — +1 sword, better armour, stat-boosting items, improving the real 5e stats that drive DPS.
  - **Formation slots** — start with one (solo Fighter); buy slots 2, 3 and 4 to place recruited companions in the lane. More slots = more DPS = deeper pushes.
  - **Area unlocks** — new monster types and environments.
  - **Passive buffs** — "+5% gold find", "+10% crit damage", "short rest heals 10% more". Small multiplicative bonuses that stack.
  - **Gambit upgrades** — better AI priorities, e.g. "focus fire lowest HP" instead of "attack nearest".
- **Harder monsters pay better.** You push deeper not only for the number going up, but because wave 200 goblins pay 50× what wave 10 goblins pay.

### Prestige: "Renown"
- **At the wall**, prestige resets the current run to wave 1 and grants **Renown**, a permanent multiplier currency scaled to the highest wave reached.
- **Renown grants:** global damage multiplier, global gold multiplier, starting gear tier.
- **Flavour without dependency:** tales of your deeds spreading across the realm. Thematic, but requires no campaign knowledge.

### Relationship to campaigns
Flexible, and deliberately non-coercive in both directions.

- **Campaigns can provide** Endless Mode with characters, equipment, abilities, areas, special enemies and gambits.
- **Endless Mode provides** gold, Renown, generic progression and long-term optimisation.
- **Never required.** A player must never need to grind Endless Mode to enjoy a campaign. Campaigns stay balanced as RPG experiences in their own right.
- **Never gatekept.** Endless Mode is fully playable without touching a campaign; campaign unlocks are shortcuts, not keys.
- **The campaign progression rules decide** whether imported characters, imported gear and Endless Mode upgrades apply at all. A curated campaign can switch all of it off.

---

## 10. Build Order

Priority is unchanged at the top: **play the tutorial first, then Endless Mode.** The campaign framework is generalised out of working code rather than designed in a vacuum.

The Tutorial Campaign is now five adventures and roughly 15 hours of content, so it is no longer a single milestone. It is interleaved: ship the opening, ship Endless Mode, then grow the tutorial adventure by adventure as each new pillar gets built.

### Milestone 1 — Playable tutorial opening
1. **Rules engine core**, scoped to what the opening needs: d20 rolls, advantage/disadvantage, ability checks vs. DC, attack rolls, AC, damage, HP, initiative, conditions scaffold. Unit-tested.
2. **Garrick as a real data file**, plus a character sheet UI.
3. **Scene 1 — The First Fork:** voxel exploration, interactables, skill checks.
4. **Scene 2 — Journey Upstream:** dialogue system, Borogrove, the acorn.
5. **Scene 3 — Twig Blights:** in-place grid conversion, tactical combat, Sap and Second Wind tutorials.
6. Ship as the demo.

> Build these as **generic systems with the tutorial as their first consumer** — scene loader, dialogue graph, check resolver, encounter runner. Nothing Fouled-Stream-specific belongs in code.

### Milestone 2 — Finish Adventure 1
Corrupted Cave, Shrieker and Bullywugs, Berserk Bear, Ooze's Lair, Journey Home. *The Fouled Stream* complete, start to finish, as a playable self-contained adventure.

### Milestone 3 — Endless Mode
1. Continuous wave spawner + auto-resolve loop on the 5e engine.
2. Side-view voxel renderer: party left, enemies streaming right.
3. Gold economy + one upgrade path (gear).
4. First area — **Fungal Caverns**, 50 waves: blights → bullywugs → ooze boss at wave 50.
5. Prestige loop.
6. Additional areas, formation slots, gambit upgrades.

> The wave spawner here and the random encounter table in Adventure 2 are the same system. Build it once, in this milestone, with Endless Mode as the first consumer.

### Milestone 4 — The campaign framework
Required before Adventure 2, because that is where companions, levelling and multi-adventure state begin. Generalise into `packages/campaign`:
- Campaign loading, multi-adventure arcs, and the Story Mode library menu
- World state, quests, factions, flags, branching, cross-adventure history (Kristryd must be able to reference the Fouled Stream)
- Character definitions and **player-directed character customisation** (Fixed / Guided / Flexible / Full)
- The personality system, generalised from Garrick's Reckless
- Campaign progression rules, the balance layer, downtime between adventures
- Companions, party formation and roster management
- Levelling past 1, through to 7

### Milestone 5 — Adventures 2 and 3
- **Miner Difficulties** — dungeon navigation, procedural encounter tables, hazards, morale and retreating enemies.
- **The Winged God** — escort AI, creature attitude system, branching-to-the-same-place structure, the first real boss with flight and a breath weapon.

### Milestone 6 — Adventure 4
**Horns of the Beast** — the overland travel system in three stages, per-day encounter rolls, weather and terrain hazards, long-arc NPC state and betrayal, artifacts and curses. The largest single subsystem in the campaign, and the groundwork for any semi-open campaign later.

### Milestone 7 — Adventure 5
**Boreal Ball** — social encounters as a full mechanical system, the Renown score, shifting attitudes, charms and supernatural gifts. Tutorial Campaign complete.

### Milestone 8 — The first post-tutorial campaign
A non-tutorial campaign with a different structure — semi-open, a Guided or Flexible protagonist, a recruited party, higher level cap. The real proof of the platform.

### Milestone 9 — Content pipeline
In-browser campaign and encounter editor, so later campaigns need no engineering time.

---

## 11. Settled Decisions

| Question | Decision |
|---|---|
| Name | **Fable** (working title) |
| Platform | Web only |
| Rules | Direct 5e adaptation, SRD 5.2.1 base |
| The two modes | **Story Mode** (campaign library) and **Endless Mode** (idle lane) |
| Tutorial | A five-adventure self-contained campaign, levels 1 to 7 |
| Tutorial protagonist | Garrick Vell, premade human Fighter, Reckless, Fixed |
| Tutorial party | Solo in Adventure 1; +1 in Adventure 2; four from Adventure 3 |
| Later campaigns | Authored identity, player-chosen build; customisation level per campaign |
| Party size | A campaign design choice, not a global rule |
| Movement | Grid in combat, free movement in exploration |
| Multiplayer | No |
| Endless Mode | First-class continuous lane, gold-driven, standalone, never mandatory |
| Cross-mode carryover | Governed by each campaign's progression rules |

## 12. Open Questions

- **Licensing pass on all five adventures** (see the note in section 8). The single biggest outstanding item: non-SRD creatures must be substituted or rebuilt, and all prose, NPCs and Greyhawk place names replaced with original material.
- Confirm which creatures in the arc actually exist in SRD 5.2.1 — Twig Blight, Treant, Hook Horror, Darkmantle, Piercer, Rust Monster, Minotaur of Baphomet, Satyr Revelmaster, Sahuagin, Red Dragon Wyrmling, Hobgoblin Warlord, Green Hag, Pixie, Dryad.
- Our own setting: Fable needs a world to replace Greyhawk, defined before Adventure 4's travel map.
- Identity of the three companions, and how much of their build the player controls.
- Exact XP and gold curves for Endless Mode scaling.
- How far character appearance customisation goes in voxel art.
- Art budget and asset pipeline ownership.
