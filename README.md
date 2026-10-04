# dnd-combat

A working title for a web-based, 3D voxel D&D RPG that fuses a faithful 5e rules engine with a first-class idle mode.

This README is the living design document. It captures everything settled so far: the concept, the rules engine, the premade protagonist, the tutorial adventure, the idle mode, and the build order.

---

## 1. The Concept

- **Web-based 3D voxel D&D RPG.** Faithful 5e rules (SRD 5.2.1 base), directly adapted adventures, strong interactive story.
- **Two first-class modes sharing one engine:**
  - **Story Mode** — hands-on, grid-based tactical 5e combat, dialogue with NPCs, and exploration scenes.
  - **Idle Mode ("The Endless Dungeon")** — a continuous side-scrolling lane in the Idle Champions mold, with its own economy, progression and prestige loop.
- **One ruleset, one engine, never two combat systems.** Idle combat is real 5e combat resolved at speed by AI.
- Single-player only. No backend required for v1.

---

## 2. Technical Direction

### Stack
- **TypeScript everywhere.**
- **Rendering:** Three.js (with React for UI, e.g. React Three Fiber). Voxel assets authored in MagicaVoxel, exported to glTF, instanced for crowds.
- **Build:** Vite. Monorepo layout:
  - `packages/rules` — the 5e engine. Pure TS, **zero rendering dependencies**.
  - `packages/content` — data schemas and all game content.
  - `apps/web` — the client.

### Architecture principles
- The rules engine is **pure and headless** so it can run in a Web Worker, in unit tests, and at high speed for idle mode.
- **Deterministic reducer + seeded RNG** → reproducible fights, verifiable saves, fast-forwarded idle catch-up.
- **Everything is data.** Abilities, creatures, items, dialogue and adventures live in JSON, not code.
- **Client-authoritative.** No multiplayer, so no server. Keep the engine pure anyway, in case that ever changes.
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

This is the single most important early decision — it is what makes new content authorable without engine changes.

### Testing
Unit-tested against known 5e cases from day one. The engine must be trustworthy before anything is drawn on screen.

---

## 4. Content (`packages/content`)

### Schemas
`creature`, `spell`, `item`, `feature`, `condition`, `encounter`, `map`, `dialogue`, `adventure`, `character`.

### Adventure format
Scenes → nodes (`dialogue` / `check` / `encounter` / `exploration` / `reward`), with flags and conditional edges between them. The Fouled Stream ships as `adventures/fouled-stream.json`.

### Legal
Use SRD 5.2.1 (CC-BY) stat blocks and spells only. Original adventure prose is our own. Avoid non-SRD monsters and published adventure text.

> **Open item:** confirm the Twig Blight and Treant stat blocks exist in SRD 5.2.1. The 2024 SRD monster list is trimmed relative to the full Monster Manual. If a creature is absent, either rebuild it as original content or substitute an SRD fungal creature.

### Long term
An in-browser adventure/encounter editor so new content needs no code.

---

## 5. The Protagonist — Garrick Vell, "the Pride of High Ery"

A title he gave himself. Nobody else in High Ery uses it.

### Concept
Mid-twenties, broad, loud, genuinely competent and absolutely certain he's more competent than that. Served a short, uneventful stint as a caravan guard out of Greyhawk and talks about it like a war. Came home to High Ery to find the stream running with scum and the elders worrying — and saw, finally, a monster worth killing and a story worth telling.

He is not a fool and not a coward. He's a young man who has never yet been properly beaten, and the adventure's job is to introduce that possibility.

### Voice
Narrates his own fights. Named his sword. Treats retreat as a tactical concept that applies to other people. Warms up fast, apologises badly, and is quietly more attached to his village than he'd admit out loud.

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

### Future
His flaw should become mechanically expressible: a **Reckless** trait offering tempting high-risk options in dialogue and combat (attack with advantage, take it in return), so the player *plays* his personality rather than reading it.

### Party
The tutorial is **solo**. Companions arrive in adventure two — Cleric first (teaches slots, healing, concentration), then Rogue and Wizard. Active party caps at four, with a larger recruited roster behind it. Companions are driven by the gambit AI by default and can be taken over manually at any time.

---

## 6. Story Mode

### Presentation
- **Exploration:** free movement (WASD or click-to-move) over a voxel scene with interactables — talk, loot, check, trigger.
- **Combat:** 5 ft square grid. When an encounter fires, the *same* scene converts in place — grid overlay fades in, initiative rolls with a visible d20. No loading screen. Exploration and combat read from one voxel tile dataset.
- **Speed controls** 1× / 4× / instant-resolve, plus a **Take Control** button that hands any AI-driven turn back to the player.

### Progression
Straight 5e levelling (1 to ~10 initially): class features, spell choices, ASIs, magic items. Meta progression stays in-fiction — roster recruitment, downtime activities, renown with factions.

---

## 7. The Tutorial — The Fouled Stream

A custom level-1 adventure. An alien fungus in a cave is polluting the stream that flows past the village of High Ery; the fungus has spawned vile creatures in and around the cave.

High Ery itself is **backstory, not a level** — Garrick comes from there, but the game opens at the First Fork. The adventure order is faithful to the outline: **Fork → Borogrove → Blights → Cave**.

### Scene 1 — The First Fork (exploration, no combat)

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

### Scene 2 — Journey Upstream (dialogue)

Borogrove, a kindly Treant who keeps watch over the wood, steps out of what Garrick took for a tree. This is the dialogue-system showcase and the first real test of the interactive-story goal.

- **Tonal engine:** Borogrove is kindly, ancient, slow and completely unimpressed by swagger. Garrick is loud and in a hurry. Both the comedy and the character work come from that mismatch.
- **Choice axis:** boast / listen / be honest. All three reach the same information — the source is a cave the stream spills out of — but they set a relationship flag that changes Borogrove's warmth on the Journey Home and whether he teases Garrick about the blights.
- **The acorn.** He gives it over regardless. If swallowed it conveys the benefits of a *Potion of Healing* and the *Lesser Restoration* spell. But *how* it's explained depends on whether the player listened: brush him off and the Lesser Restoration property goes unmentioned, so the player may not realise they can cure the Brown Bear later. A real consequence from a dialogue choice in the first ten minutes.
- Optional **Insight DC 12** to notice Borogrove is frightened, not merely concerned — the corruption is spreading faster than he admits.
- Teaches: dialogue UI, NPC relationships, receiving and inspecting an item, consumables in inventory.

### Scene 3 — Twig Blights (first combat)

Just outside the cave mouth. The stream spills from a dark cave in a rock face; deadwood litters the approach. The grid converts in place.

- **Three blights, not six.** Six is a party encounter; three is a tense solo one. Each dies to one longsword hit, so the lesson is action economy: Garrick can only kill one per turn, so he *will* take hits. (The full six-blight version survives as an idle-mode grind tier.)
- **Teaching order, matched to the fight's own rhythm:**
  1. Turn one — move and attack.
  2. Turn two — they surround him; the UI surfaces **Sap** on the longsword.
  3. Turn three — around half HP, the UI surfaces **Second Wind**.
  That's the whole 2024 Fighter kit taught in three turns.
- **Fire vulnerability** is in their stat block. Garrick has no fire at level 1, but dry brush on the map lets him shove a blight into it — teaching that the environment is part of the rules.
- **The payoff:** the brittle twig from scene one. The player has been told the wood is sick, met someone afraid of it, and *then* gets ambushed. Dread, then release.
- Borogrove's acorn is already in the inventory — the correct safety net for a lone level-1 Fighter, and a lesson in item use under pressure.
- Losing should be survivable: death saves, then a narrative failure state (he wakes bruised by the ford, mocked by his own inner monologue) rather than a reload screen — at least in the tutorial.

### Remaining encounters (post-demo)

- **Corrupted Cave** — the Underdark Warren map, trimmed: ignore the secret door and inner chambers; close the south, east and north tunnels. Enter from the southeast following the stream.
- **Entrance** — a Shrieker Fungus alerts the cave. Four Bullywug Warriors with fungal growths respond. Teaches approach choice (stealth vs. noise), the alert mechanic, and conditions.
- **Berserk Bear** — a Brown Bear in a southeastern side cave, Poisoned by the water. Curing the Poisoned condition (the acorn, or anything else) ends the encounter peacefully. Teaches that conditions and items are real alternatives to violence.
- **Ooze's Lair** — a Psychic Gray Ooze and six Stirges at the north end of the stream. Boss fight: saves, concentration, attached enemies. Destroying the brain-like fungus in the water grants a bonus 100 XP.
- **Journey Home** — Borogrove again. A replacement acorn if the first was used; a *Staff of Flowers* if the source was purified. Branching epilogue keyed to the relationship flag from Scene 2.

**Why this adventure is the vertical slice:** it exercises dialogue, exploration, skill checks, three combats, conditions, items, a non-combat solution and branching rewards. If it ships, the engine is proven.

---

## 8. Idle Mode — "The Endless Dungeon"

**A first-class, standalone mode.** Not downtime, not a side-system, not story-gated. A player who never opens the campaign should be able to launch the game, go to idle mode, and have a complete, satisfying loop.

### The view: side-scrolling lane
- **Persistent side-view panel.** Party formation on the left; enemies stream in from the right down a continuous 3D voxel lane. Always visible while idle mode is active — not a menu, not a log, not a send-and-check-back system.
- **Continuous flow.** As one wave dies the next spawns instantly with a brief transition — a new corridor section scrolls in, a door kicks open. No loading, no downtime between fights. The lane just keeps going.
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
- **Area progression:** clear wave 50 to unlock the next area, or buy it early with gold. Story progress can also unlock areas as a bonus, but **gold is the primary path**.
- **Looping:** past wave 50 the area loops at higher difficulty with a multiplier badge (Area 1 ×2, ×3, …) for players who prefer farming to pushing.

### Economy and progression (gold-driven)
- **Gold per kill**, scaling with wave number and area. Boss waves drop big chunks. Primary currency.
- **The upgrade tree:**
  - **Gear upgrades** — +1 sword, better armour, stat-boosting items. These improve the real 5e stats that drive DPS.
  - **Formation slots** — start with one (solo Fighter); buy slots 2, 3 and 4 to place recruited companions in the lane. More slots = more DPS = deeper pushes.
  - **Area unlocks** — new monster types and environments.
  - **Passive buffs** — "+5% gold find", "+10% crit damage", "short rest heals 10% more". Small multiplicative bonuses that stack.
  - **Gambit upgrades** — better AI priorities, e.g. "focus fire lowest HP" instead of "attack nearest".
- **Harder monsters pay better.** The whole incentive loop: you push deeper not only for the number going up, but because wave 200 goblins pay 50× what wave 10 goblins pay. Unlocking the Undead Crypt means farming skeletons for more gold than the fungal caves ever gave.

### Prestige: "Renown"
- **At the wall**, prestige resets the current run to wave 1 and grants **Renown**, a permanent multiplier currency scaled to the highest wave reached.
- **Renown grants:** global damage multiplier, global gold multiplier, starting gear tier. Each prestige pushes further, faster.
- **Flavour without dependency:** tales of your deeds spreading across the realm — the more famous you are, the stronger you start. Thematic, but requires no story knowledge.

### Relationship to Story Mode
- **Shared characters and gear.** Upgrades bought in idle carry into story and vice versa. Grinding gold for a +1 longsword makes tactical fights easier; beating a story boss unlocks a new idle area.
- **Independent progression.** Idle has its own area track, prestige loop and high-score (highest wave). A player who only cares about idle never needs to open the story tab.
- **Story is an accelerator, not a gatekeeper.** Beating The Fouled Stream unlocks the Fungal Caverns free instead of paying 10,000 gold — but everything remains purchasable with gold alone.

---

## 9. Build Order

### Milestone 1 — Playable tutorial opening
1. **Rules engine core**, scoped to what the opening needs: d20 rolls, advantage/disadvantage, ability checks vs. DC, attack rolls, AC, damage, HP, initiative, conditions scaffold. Unit-tested.
2. **Garrick as a real data file**, plus a character sheet UI.
3. **Scene 1 — The First Fork:** voxel exploration, interactables, skill checks.
4. **Scene 2 — Journey Upstream:** dialogue system, Borogrove, the acorn.
5. **Scene 3 — Twig Blights:** in-place grid conversion, tactical combat, Sap and Second Wind tutorials.
6. Ship it as the demo.

### Milestone 2 — The Endless Dungeon
1. Continuous wave spawner + auto-resolve loop on the 5e engine.
2. Side-view voxel renderer: party left, enemies streaming right.
3. Gold economy + one upgrade path (gear).
4. First area — **Fungal Caverns**, 50 waves: blights → bullywugs → ooze boss at wave 50.
5. Prestige loop.
6. Additional areas, formation slots, gambit upgrades.

### Milestone 3 — Depth
- Finish The Fouled Stream (cave, bear, ooze, journey home).
- Companions: Cleric, then Rogue and Wizard. Formation and roster management.
- Levelling past 3. Adventure two.
- In-browser adventure editor.

---

## 10. Settled Decisions

| Question | Decision |
|---|---|
| Platform | Web only |
| Rules | Direct 5e adaptation, SRD 5.2.1 base |
| Protagonist | Single premade human Fighter, Garrick Vell |
| Party in tutorial | Solo. Companions from adventure two |
| Movement | Grid in combat, free movement in exploration |
| Multiplayer | No |
| Idle mode | First-class continuous lane, gold-driven, standalone |
| Character creation | Not in v1 — authored over the same schema later |

## 11. Open Questions

- Confirm Twig Blight and Treant are present in SRD 5.2.1; substitute or rebuild if not.
- Exact XP and gold curves for idle scaling.
- Whether the Reckless trait ships with the tutorial or later.
- Art budget and asset pipeline ownership.
