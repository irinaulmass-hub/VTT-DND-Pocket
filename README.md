# D&D VTT Control Console (v3.7.0 — Web Edition)

A browser-based virtual tabletop (VTT) for Dungeons & Dragons. The DM runs a Node.js server on their machine; everyone else — players, a projector, a tablet — connects via any web browser on the local network. No Electron, no installs on client devices.

> **Previous version (Electron):** tagged `v1.0-electron` / `v1.0` in this repo.

---

## How It Works

| Who | URL | What they see |
|-----|-----|---------------|
| DM | `http://localhost:3000` | Full control panel |
| Players / Projector | `http://<server-ip>:3000/remote/player` | Player view (maps, fog, audio, overlays) |
| Map Builder | `http://localhost:3000/map-builder` | Tile-based map editor |

> The DM panel runs on the DM's machine only. There is no separate remote DM interface — all DM controls are in the main panel at `http://localhost:3000`.

The DM panel and player screen stay in sync via WebSocket. Everything the DM does — showing a map, playing audio, updating fog of war — is pushed to all connected player browsers instantly.

---

## Features

### Maps & Scenes
- **Area › Scene › Map hierarchy** — Organize content as e.g. *Phandalin › Stonehill Inn › Ground Floor*
- **Live search** — Filter maps by area, scene, or map name; filter audio by category or track title
- **Chain navigation** — Each map row has a dropdown to jump-to any other map in the same scene
- **Image fit modes** — Per-map cycling button: 📐 Fit / 🔲 Cover / ⬜ Fill; setting is saved per map
- **Scene Builder** — Create and edit scenes; assign per-map ambience audio, fog toggle, and fit mode; file picker auto-fills image URL

### Map Builder
A full tile-based map editor accessible at `/map-builder` from the DM machine (link in the DM panel header).

**Tools:**
| Tool | Description Tile palette — 49
**Token tool:**
- **Player tab** — pick a player from your saved roster; their class icon and color are applied automatically
- **NPC tab** — choose from 25 standard mob types (each with a unique icon and color) or enter a custom label; tokens auto-number (e.g. Goblin 1, Goblin 2…)

**Tile palette — 50 procedural tile types across 10 groups, plus 132 Kenney pixel-art tiles:**

| Group | Tiles |
|-------|-------|
| **Ground** | Stone Floor, Wood Floor, Dirt, Cave |
| **Terrain** | Grass, Sand, Snow, Swamp, Lava |
| **Water** | Water, Deep Water |
| **Walls** | Wall, Stone Wall, Ruined Wall, Door, Cave Opening, Pit |
| **Buildings** | Cabin, Ruined Cabin, Tent, Well |
| **Roads** | Road ─, Road │, Road +, Road ↗ ↖ ↘ ↙ (corners), Road T-N/S/E/W (11 variants) |
| **Nature** | Tree, Large Tree, Pine, Palm, Hill |
| **Mountains** | Mountain, Scree, Alpine, Earthy, Tundra, Slate |
| **Animals** | Horse, Cow |
| **Effects** | Aura (orange/red/blue), Fire (orange/blue) |
| **Kenney Dungeon** | 132 pixel-art tiles (K-0000 – K-0131) from the [Kenney Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon) pack |

Procedural tiles render from canvas code — no external files. Kenney tiles are served from `public/assets/tiles/` and render with crisp pixel-art scaling (`image-rendering: pixelated`). Both tile types save and restore normally via the `.map.json` format.

> Kenney Tiny Dungeon tileset is released under **CC0 1.0 Universal** (public domain). No attribution required. See [kenney.nl](https://kenney.nl) for more free game assets.

**Grid:** Configurable columns × rows (4–60 × 4–40) and cell size (16–96 px). Changes apply without losing painted tiles.

**Fog of War in the Map Builder:**
- Click **🌫 Fog** to enter fog-painting mode. The fog layer appears as a dark semi-transparent overlay.
- Paint fog cells by clicking/dragging; reveal or hide individual cells.
- **👁 Reveal All** / **🌑 Hide All** shortcuts appear when fog mode is active.
- **📡 Send Live** broadcasts the built map as a PNG to all connected player screens with live fog applied.
- Enemy/mob tokens in fogged cells are automatically hidden from the player view.

**Undo / Clear:** ↩ Undo steps back one paint action; 🗑 Clear resets the entire canvas.

**Saving a Map:** Click **💾 Save Map** to open the save dialog.
- Enter a filename.
- By default, saving does **not** add the map to a scene — check **Add to scene list** only when you want it to appear in the DM panel.
- When adding to a scene, the **Area** and **Scene label** fields are smart dropdowns that show your existing areas/scenes; choose **＋ New…** to create a new one.
- Saving the same image path to an area it already belongs to is silently de-duplicated.
- The map is exported as a PNG and saved to `public/assets/maps/`. A `.map.json` file is saved alongside it preserving the full editable state.

**Opening a Map for Editing:** Click **📂 Open Map** — two tabs:
- **🗂 Builder Maps** — maps saved from the builder (have an editable `.map.json`); restores tiles, tokens, labels, fog, and features exactly.
- **🖼 Any Image** — every image in `public/assets/maps/`; opens it as a background on a blank grid so you can add tiles, features, fog, and overlays on top, then save as a new builder map.

**Map Features (traps, puzzles, reveals, effects):**
- Switch to the **🎯 Feature** tool to define named overlay regions on the map.
- Paint cells onto the map, then click **+ Add Feature from Selection** to open the feature editor.
- Each feature has a **name**, **type**, **color**, and optional description. The type drives the animation automatically:

| Type | Player Animation | Notes |
|------|-----------------|-------|
| **Pit** | Cells stagger open with a spreading darkness animation | Permanent reveal |
| **Trap** | Snap/spring flash on cells + screen shake | One-shot style |
| **Puzzle** | Continuous pulsing blue glow on cells | Click glowing cells to open a sub-map lightbox (if a linked map image is configured) |
| **Reveal** | Dark overlay drops away, cells fade into view | Area reveal |
| **Effect** | Sub-type picker: 🔥 Fire / ✨ Sparks / 💥 Explosion / 🌀 Aura — each with a unique looping animation | Environmental effects |

- Features are saved inside the `.map.json` and are invisible on the player screen until triggered.
- In the DM Map Control panel, a **🎯 Map Features** section appears with **⚡ Trigger** and **↩ Reset** buttons per feature. Puzzle features with a linked sub-map also show a **🗺 Sub-map** button that opens the image in a fullscreen DM lightbox.
- Triggered feature cells are highlighted on the DM's fog map and token map overlays with type-specific animations so the DM can see exactly what players see.

**Moveable Objects:**
- Switch to the **🔧 Object** tool to place interactive or decorative objects on the map.
- Click any cell to open the object editor. Objects are saved inside the `.map.json`.
- **Icon options:** choose an emoji (e.g. 🪨 🚪 🪵) or a tile ID from the builder tile library.
- **Size:** 0.5× / 0.75× / 1.0× / 1.3× relative to a grid cell.
- **Auto-animation:** Spin / Sway (horizontal or vertical) / Float — plays continuously at Slow / Normal / Fast speed. Great for flames, floating platforms, spinning traps.
- **Interactive objects** — check *Interactive* to allow click-to-interact:
  - **Interact by:** Players / DM only / Both
  - **Click action:**
    - *Rotate* — object rotates by 90°/180°/270° on click
    - *Slide* — object moves from its placed cell (A-state) to a destination cell (B-state) defined in the builder via **Pick on Map**
  - **Can Reset:** toggle A↔B on each click (default) or one-way (stays in B-state after first interaction)
  - **Blocks movement:** flag for future pathfinding integration
- Click an existing object dot to re-open its editor. Objects are listed in the **Objects** sidebar section while the Object tool is active.
- At runtime, object positions and rotation states are tracked server-side and replayed to reconnecting clients. The DM can drag any object to a new cell directly on the DM map.

---

### Fog of War (Scene Maps)
- Per-map 20×20 grid fog managed in the Scene Builder
- DM fog editor shows the map as background with semi-transparent fog cells overlaid — click or drag to reveal or hide cells
- Reveal All / Hide All shortcuts
- Fog state is pushed to player screens in real time and saved per-map in `scenes.json`
- **🌫 Runtime fog toggle** — even maps without fog configured in the Scene Builder can have fog enabled at any time via the **🌫 Fog** button in the Map Control toolbar; click again to disable, which clears the fog overlay on all player screens immediately

### Audio
- Categorized library (grouped by `Category - Title.ext` naming convention)
- Preview tracks locally on the DM machine before broadcasting
- **Loop** or **Once** buttons per track — sends with the correct loop flag to players
- Per-map ambience with a 🔁/▶️ toggle saved on the scene
- **Auto-stop** — audio stops automatically when switching to a new map view
- **⏹ Stop All Audio** — immediately silences both DM previews and all player screens

### Player Screen
- **Tap-to-begin overlay** — full-screen overlay on first load; dismissing it unlocks browser audio autoplay
- **Player Login** — on the tap overlay, players choose between *▶ Tap to Begin* (guest / audio-unlock only) or *⚔ Login as Character*:
  - Login shows a dropdown populated from the **Player Roster** (`seeds/players.json`) — the DM controls who appears in the list
  - Selecting a name and clicking *Enter Session* binds that player to their roster character and closes the overlay
  - Login is persisted in `sessionStorage` so a page refresh silently re-binds without prompting again
  - **⚔ Log Off** button appears in the bottom-left corner after login; clicking it releases the binding and returns to the tap overlay
- **Player-controlled token movement** — once logged in, a player can drag their own token on the map:
  - Only the token whose label matches the logged-in player's name is interactive; all other tokens remain locked
  - Supports both mouse drag and touch drag (with scroll suppression on mobile)
  - Drag sends a `move-player-token` WebSocket action; the server validates ownership before updating positions
  - Movement is reflected in real time on every connected screen — player views and the DM Map Control panel all update simultaneously
  - **Movement can be locked by the DM** — see Token Overlay section below
- **Overlay popups** — dice rolls, initiative order, sent text, and sent images appear as a timed semi-transparent parchment panel anchored to the **top-center** of the screen so attack animations and tokens remain visible beneath it
- Auto-dismiss timers: Dice 8 s · Initiative 12 s · Text 15 s · Image 20 s
- **Fullscreen button** — ⛶ in the corner; useful for projector displays to hide browser chrome
- **🔄 Sync button** — a resync button appears in the top-right corner (below fullscreen); clicking it sends a full state sync request without logging out, or force-reconnects the WebSocket if the connection is down; the button spins green briefly to confirm; particularly useful for the central projector screen that no one is actively watching
- **Projector resilience** — the guest (non-logged-in) projector screen has hardened connection logic: max reconnect backoff is 3 s, a 35 s watchdog detects zombie sockets, the tab restores sync instantly on wake from sleep (`visibilitychange`), reconnects immediately on network restore (`online` event), and the tap-to-begin overlay is automatically dismissed on page refresh so the projector never needs a physical walk-over just to re-tap
- **Player Dice Roller** — after logging in, a compact HUD bar appears at the bottom-left of the player screen next to the Log Off button:
  - Buttons for d4, d6, d8, d10, d12, d20, and d% (d100)
  - Rolling triggers the full 3D dice animation on the rolling player's screen
  - The same anonymous roll animation plays on every other connected player screen (including the tap-to-enter screen) simultaneously
  - The DM sees a named entry in the **🎲 Player Rolls** log beneath the Initiative Tracker: who rolled, which die, and the result — color-coded green for nat-20 crits and red for nat-1 fails, auto-clearing after 20 seconds

### Map Control Panel
- **⬛ BLACKOUT** — toggles a solid black overlay that covers the *entire* player screen including any popups. Click again to reveal. Audio stops on blackout.
- **🧹 CLEAR** — dismisses any open popup (initiative, text, image overlay) without disturbing the current scene image or audio.
- **🌫 Fog** — runtime fog toggle button; appears whenever a map is loaded; enables or disables fog of war for any map regardless of Scene Builder settings; fog state is broadcast to all player screens instantly.
- Fog of war controls and token/draw overlay tools are embedded directly in this panel when a map is active.

### Initiative Tracker
- Add mobs/NPCs by name and roll; add players from the **Player Roster**
- **Player Roster** — persistent list of players stored in `seeds/players.json`. Add/remove players once; they persist across server restarts.
- **Add All Players to Round** — rolls for all rostered players and adds them to the current round in one click.
- PC entries show a **PC** badge in the initiative list so you can distinguish players from mobs at a glance.
- **⚔️ Send** — broadcast current order to players.
- **⏭️ Next** — advance turn and broadcast.
- **🧹 Clear Mobs** — removes all mob/NPC entries but keeps PC entries in the list for the next encounter.
- **🔄 Hard Reset** — clears the entire initiative list including players (prompts for confirmation).
- **Persistence** — the current round, turn position, and all entries survive a page refresh (saved to `localStorage`).
- **⚔️ Send** and **⏭️ Next** buttons are always visible in the Initiative Tracker panel.
- **Condition rings on map tokens** — conditions assigned in the tracker automatically drive colored rings on the corresponding map token; rings expire and update as turns advance.
- **📍 Mobs on Map quick-add** — a collapsible section lists every non-player token on the current active map as chip buttons:
  - **Click** a chip → pre-fills the mob name field so you can enter a roll and add normally
  - **Shift+click** → adds the mob instantly with a random d20 roll
  - Chips for mobs already in the initiative list appear dimmed; the section header shows a live count
- **🎯 Combat Targeting System** — each initiative entry has a **🎯 Target** button to assign who that combatant attacks:
  - Players tap a mob token on their own screen to set it as their target; their chosen target is highlighted with a pulsing red ring
  - The DM can also assign targets manually for any combatant (players, mobs, or NPCs) using the 🎯 Target panel in the initiative entry — useful when a player can't connect a browser
  - When **Next Turn** is clicked, attack animations fire automatically before advancing:
    - Active player has a target → attack animation plays on that target on all screens
    - Active mob has players targeting it (or a DM-assigned target) → attack animation plays on those player tokens
  - Animation type is class-aware: Sorcerer / Wizard / Druid / Cleric / Priest / Bard → ✨ spell flash; all others → ⚔️ sword swipe
  - Target assignments are stored server-side and replayed to late-joining players
  - Clearing a scene resets all targeting state
- **⚔️ Attack Log** — a running log below the initiative table records every auto-triggered attack: attacker name (gold), target(s) (red), spell/sword icon, and timestamp. A **Clear** button wipes the log.

### Monster Lookup

Real-time monster stat block lookup powered by the [Open5e API](https://open5e.com/).

- **Wildcard / partial-name search** — searches by `name__icontains`, so typing `"goblin"` returns Goblin, Goblin Boss, Dust Goblin, Chaos-Spawn Goblin, etc. (up to 20 results)
- When multiple matches are found, clickable result buttons appear — select one to load its full stat block
- Stat block displays: size/type/alignment, AC, HP, speed, ability scores + modifiers, saving throws, skills, immunities/resistances/vulnerabilities, senses, languages, special traits, actions, bonus actions, reactions, and legendary actions
- Results are cached per session to avoid redundant API calls
- Press **Enter** in the search box or click **🔍 Search** to query

> Monster data is provided by **[Open5e](https://open5e.com/)** — an open-source 5e SRD API maintained by the community. All monster stat blocks are drawn from officially licensed SRD content via their free public API at `https://api.open5e.com/`.

### Reference Panel

The Reference panel is a tabbed quick-reference hub for DMs, with live API lookups for game content.

**⚔️ Conditions tab**
- **Active Conditions chart** — shows each combatant currently in initiative and any conditions assigned to them at a glance
- **Condition Dictionary** — filterable reference for all standard 5e conditions with advantage/disadvantage, auto-fail, and speed penalty notes
- **Custom conditions** — add homebrew conditions with name, type (buff/debuff), and notes
- **Drag-and-drop conditions** — drag any condition row directly onto an initiative tracker entry or a token dot on the map to apply it; a popup appears to set the number of rounds (or mark as permanent ∞); condition rings update instantly on both the DM view and player screen

**📊 Rules tab** — static quick-reference tables (no internet required):
- Difficulty Class (DC) scale (5–30)
- Attack & hit rules (crits, nat 1, advantage/disadvantage situations, flanking, two-weapon fighting)
- Cover bonuses (half, three-quarters, full)
- Concentration & spellcasting rules
- Common item costs (torches, potions, spell material components, etc.)

**✨ Spells tab** — live spell lookup via the [Open5e API](https://open5e.com/):
- Search by name and/or filter by spell level (Cantrip–9th)
- Returns level, school, casting time, range, duration, concentration/ritual flags, source document, and full description
- All content is openly licensed OGL/CC material; each card shows its source document

**💰 Items tab** — live item lookup via the [Open5e API](https://open5e.com/):
- Switch between **Weapons & Armor** and **Magic Items**
- Weapons show category, cost, damage dice, damage type, weight, and special properties; armor shows AC, cost, weight, and stealth disadvantage flag
- Magic items show type, rarity, attunement requirements, and full description
- Uses Open5e `/v1/weapons/` and `/v1/armor/` endpoints (searches both in parallel and merges results); magic items use `/v1/magicitems/`
- All results include source document badge (e.g. 📖 5e Core Rules)

**🎯 Feats tab** — live feat lookup via the [Open5e API](https://open5e.com/) (falls back to the [D&D 5e SRD API](https://www.dnd5eapi.co/)):
- Search by feat name; returns prerequisite and full description

**🔍 Global search bar** — type a term, pick a category (Spells / Items / Feats / Conditions), press Go — automatically switches to the correct tab and fires the search.

> Reference lookup data (spells, items, feats) is provided by **[Open5e](https://open5e.com/)** — a community-maintained open-source API serving only OGL and Creative Commons licensed 5e content. All data is free to use. API endpoint: `https://api.open5e.com/v1/`. Feat fallback provided by the **[D&D 5e SRD API](https://www.dnd5eapi.co/)** at `https://www.dnd5eapi.co/api/`.

### Token Overlay

- **Combat targeting indicators on the map** — targeted mob tokens display a pulsing red ring and 🎯 crosshair badge:
  - On a **logged-in player screen**: only their own target pulses
  - On a **spectator / projector screen** (no login) or the **DM map**: all currently targeted mobs pulse
- Place colored token markers directly on any scene map in the DM panel
- Color codes: 🔴 Enemy · 🔵 Friend · 🟡 Unknown · 🟢 Player
- **Class icons** — player tokens automatically display a class emoji (🗡️ Rogue, 🛡️ Fighter, 🔮 Sorcerer, etc.) and a unique class color drawn from the player roster
- **Mob type icons** — 25 standard monster types (Goblin 👺, Dragon 🐉, Skeleton 💀, Vampire 🧛, etc.) each with a distinct color; auto-numbering labels each placed token (Goblin 1, Goblin 2…)
- **Class enemies** — enemy placement picker also includes a **Classes** optgroup (Rogue, Wizard, Fighter, etc.) for humanoid NPCs; uses icon + class color same as player tokens
- **Named enemies / NPCs** — optional **Name** field when placing enemy tokens; deduped with a counter suffix if multiple copies are placed (e.g. *Glasstaff*, *Glasstaff 2*). Leave blank for auto-numbering
- **Friend / Unknown tokens** — simple optional name field; no mob type picker
- **📦 Item tokens** — place item markers (Chest, Gold, Sword, Potion, and 17 more types) directly on the map:
  - Square shape, gold border, emoji icon (e.g. 🎁 🪙 ⚔️)
  - Hidden automatically by fog of war, just like enemy tokens
  - Never targetable by players; never added to initiative
  - 20 item types: Chest, Gold, Sword, Shield, Potion, Scroll, Bow, Staff, Dagger, Amulet, Ring, Helmet, Boots, Gloves, Spellbook, Bomb, Key, Gem, Bag, Unknown
- **👁️ Invisibility toggle** — every token (enemies, friends, players, items) has an eye button in the TOKEN PLACEMENT list:
  - 👁️ = visible to players (default)
  - 🙈 = hidden from players — DM sees a faded token with purple border; player screens skip it entirely
  - Also accessible in the collapsible "Tokens on Map" section in the right sidebar
- **💀 Death / KO state** — each token row in the TOKEN PLACEMENT list has a 💀/💚 button to toggle the token's death state:
  - 💀 = defeated/KO — a red ✕ overlay is drawn over the token on the DM map and all player screens
  - 💚 = alive (default)
- **Right-click context menu** — right-clicking a token dot directly on the DM map opens a context menu with quick actions: toggle visibility (👁️/🙈), toggle death (💀/💚), remove token (✕), and jump to that token's initiative entry
- **Condition rings** — when a combatant in the initiative tracker has active buffs or debuffs, their map token displays colored rings: 🟢 green for buffs, 🔴 red for debuffs; multiple conditions stack as concentric rings outward
  - Rings update instantly when conditions are added, removed, or expire on turn advance
  - Token list below the map shows condition badges with icon, name, and rounds remaining
  - **💫 Rings: ON/OFF toggle** — show or hide condition rings on the player/projector screen without affecting the DM map view
- **Mob type picker** — choose a standard mob type from a dropdown or enter a custom name; looking up a mob type can auto-pull its stat block from the Monster Lookup
- **Auto-add to initiative** — toggle to automatically add a placed token to the current initiative round
- **Add Party (one-click placement)** — when 🟢 Player color is active, click **🧑‍🤝‍🧑 Add Party** then click anywhere on the map to place all party members in a compact grid centered on that point with no overlapping; existing tokens are moved rather than duplicated
- Tokens persist per map-key in state; drag tokens to reposition or click ✕ to remove
- **Send Live** broadcasts the current map with all tokens overlaid to player screens
- **Real-time player movement** — when a logged-in player drags their own token, the DM Map Control panel updates instantly alongside all player screens; no manual resend needed
- **Player movement lock** — each player token row in the token list has a 🔒/🔓 button to lock or unlock that player's ability to drag their token:
  - 🔒 = movement currently locked (player cannot drag their token)
  - 🔓 = movement unlocked (player can drag freely)
  - **🔒 Lock All** button in the Token Placement header locks every player at once; click again (shown as **🔒 All Locked**) to unlock all
  - Lock state is enforced server-side — a locked player's `move-player-token` messages are silently dropped
  - A 🟢 indicator next to a name means that player is currently logged in via the player screen
  - Locks persist until the DM unlocks them or the server restarts
- **🚫 Off mode (token placement)** — token placement starts in **Off** mode by default; no tokens are placed accidentally when loading a map. Click a color to activate placement; click the active color again (or the 🚫 Off button) to disable it. The mob and player type pickers are hidden while placement is off.
- **👥 Move Party (group move)** — a **👥 Move Party** toggle button appears in the token header:
  - While active, click any player token dot to select/deselect it (gold highlight)
  - **☑ All Players** selects every player token at once; **✕ Clear** deselects all
  - Lasso-drag on empty map space to box-select multiple tokens
  - Dragging any selected token moves the entire selection by the same delta, keeping relative positions intact
  - The button label shows a count of currently selected tokens, e.g. *👥 Move Party (3)*
- **Feature cell overlay on DM map** — when a map with builder features is loaded, feature cell boundaries are shown directly on both the fog map preview and the token map as dashed outlines in each feature's color; triggered features fill solid so the DM can see exactly what the players are seeing without needing a second screen
- **Persistent token state** — all token positions across every map survive server restarts; the DM's full tokenState is synced to `data/state.json` on every update and restored automatically on reconnect

### Annotations & Drawing

- Freehand draw annotations directly on the active map in the DM panel
- Choose pen color and stroke width; drawn lines appear as an overlay layer over the map and tokens
- Annotations are cleared when loading a new map or on **🗑 Clear**
- Useful for circling points of interest or drawing attention live during play

### DM Panel UX
- **Draggable sections** — grab the ⠿ handle on any panel header and drag it to reorder; layout is saved per-browser in `localStorage`
- **Send Text** — push a labelled text block as a timed overlay to players
- **Send Image** — push any image URL or local file upload as a timed overlay
- **Dice Roller** — d4 through d100; optional broadcast to players with a 3D animated die on the player screen
- **Connected indicator** — live count of connected player browsers shown in the header; hover it to see a tooltip listing each connected client by name or guest ID
- **No-fog full width** — when a scene map has fog disabled the Map Control panel expands so the token/draw area fills the full panel width
- **Token overlay on fog map** — when a fog map is active the DM fog grid preview also shows read-only token dots so the DM can see token positions while painting fog without switching panels

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm

### Install

```bash
npm install
```

### Run

```bash
node server.js
```

Server starts on **port 3000**.

- **DM Panel:** `http://localhost:3000` — password protected
- **Player Screen:** `http://<your-ip>:3000/remote/player` — open to all devices on the network

To find your local IP on Windows:
```
ipconfig
```
Look for **IPv4 Address** under your active adapter (usually `192.168.x.x`).

### Run with Docker (optional)

A `Dockerfile` and `docker-compose.yml` are included if you prefer a containerized setup.

```bash
docker compose up --build
```

The server starts on **port 3000** as normal.

#### Mode 1 — Local dev (default, bind mounts)

Map files, audio, seeds, and server state are **mounted from your local disk** so changes take effect immediately without rebuilding the image:

| Host path | Container path | Purpose |
|-----------|---------------|---------|
| `./public/assets/maps` | `/app/public/assets/maps` | Map images |
| `./public/assets/audio` | `/app/public/assets/audio` | Audio files |
| `./seeds` | `/app/seeds` | Scene & player roster data |
| `./data` | `/app/data` | Server state (`state.json`) |

> If you edit source files (`server.js`, `dm/app.js`, etc.) you must rebuild: `docker compose up --build`

#### Mode 2 — Standalone (portable / ship to another machine)

All assets are **baked into the image** at build time — no local files needed on the target machine. Only `data/` is mounted so server state survives container restarts:

```bash
docker compose -f docker-compose.yml -f docker-compose.standalone.yml up
```

Use this when deploying to a machine that doesn't have your local asset folders. Just bring the built image + both compose files.

#### DM Password

Copy `.env.example` to `.env` and set your password:

```bash
cp .env.example .env
```

`.env`:
```
DM_PASSWORD=mysecretpassword
```

`.env` is gitignored — never commit real passwords. The default password is `dm1234`.

---

## DM Password

The DM panel is password protected. The default password is:

```
dm1234
```

### Changing the password

**Option 1 — Environment variable (recommended):**
```powershell
$env:DM_PASSWORD="yournewpassword" ; node server.js
```
The password only applies for that server run. Set it every time you start, or add it to a start script.

**Option 2 — Change the default in source:**

Edit line 13 of `server.js`:
```js
const DM_PASSWORD = process.env.DM_PASSWORD || 'dm1234';
```
Replace `dm1234` with your password. Don't commit this to a public repo.

### Logging out
Click the **🔒 Lock** button in the top-right of the DM panel header. This clears your session and redirects back to the login page.

> Sessions are in-memory — restarting the server automatically logs everyone out.

> **Token & map state persists across restarts.** Token positions for every map are saved to `data/state.json` on every change and restored automatically when the server starts. The `data/` folder is created automatically and is not committed to git.

---

## Project Structure

```
├── server.js               # Express + WebSocket server (port 3000)
├── dm/
│   ├── index.html          # DM control panel UI
│   ├── app.js              # DM panel logic (scenes, audio, fog, initiative, drag-drop layout)
│   └── styles.css          # DM panel styles
├── map-builder/
│   ├── index.html          # Map Builder UI (tools, palette, grid controls)
│   ├── builder.js          # Map Builder logic (tile paint, fog, undo, save/send)
│   └── styles.css          # Map Builder styles
├── remote/
│   ├── player.html         # Player screen layout (tap overlay, login form, popup overlay, blackout overlay)
│   └── player.js           # Player screen logic (login, image, audio, fog, token drag, overlays)
├── public/assets/
│   ├── maps/               # Map images (.jpg, .png, .webp, .gif)
│   └── audio/              # Audio files (.mp3, .ogg, .wav)
├── seeds/
│   ├── scenes.json         # Scene/view data persisted by the server
│   └── players.json        # Player roster (name list) persisted by the server
└── shared/types/           # Shared TypeScript type definitions
```

---

## Adding Content

### Maps
Drop image files into `public/assets/maps/`. Available immediately in the Scene Builder file picker — no server restart needed.

### Audio
Drop audio files into `public/assets/audio/`. Use the naming convention:

```
Category - Title.mp3
```

Examples: `Battle - Epic Battle.mp3`, `Atmosphere - Tavern Night.mp3`

The server automatically groups them by category in the audio panel.

| Filename | Category | Title |
|----------|----------|-------|
| `Battle - Epic Battle.mp3` | Battle | Epic Battle |
| `Atmosphere - Tavern Night.ogg` | Atmosphere | Tavern Night |
| `Dungeon Ambience.mp3` | *(ungrouped)* | Dungeon Ambience |

---

## Scene Data

Scenes are stored in `seeds/scenes.json`. Structure:

```json
[
  {
    "id": "phandalin-stonehill-inn-123",
    "tab": "Phandalin",
    "label": "Stonehill Inn",
    "views": [
      {
        "id": "...-view-0",
        "label": "Ground Floor",
        "image": "/assets/maps/stonehill_ground.png",
        "audio": "/assets/audio/Atmosphere - Tavern Night.mp3",
        "audioLoop": false,
        "fog": true,
        "fit": "contain"
      }
    ]
  }
]
```

---

## API Reference

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/` | DM control panel |
| GET | `/map-builder` | Map Builder |
| GET | `/remote/player` | Player screen |
| GET | `/api/scenes` | Load all scenes |
| POST | `/api/scenes` | Save all scenes |
| GET | `/api/players` | Load player roster |
| POST | `/api/players` | Save player roster |
| GET | `/api/audio` | List audio files grouped by category |
| GET | `/api/maps` | List map files |
| POST | `/api/map-builder/save` | Export map PNG + save editable `.map.json` state |
| GET | `/api/map-builder/states` | List maps with an editable state file |
| GET | `/api/map-builder/state?name=` | Load editable state for a named map |
| POST | `/api/overlay` | Push timed overlay (title, html, duration ms) to players |
| POST | `/api/stopaudio` | Stop audio on all players |
| POST | `/api/blackout` | Toggle blackout overlay on players (solid black over everything) |
| POST | `/api/clear` | Dismiss open popups on players (scene image is preserved) |
| WS | `/ws` | Real-time sync channel |

### WebSocket Message Types

| Type | Direction | Payload |
|------|-----------|---------|
| `SHOW_SCENE_VIEW` | server → player | `{ image, audio, audioLoop, fogKey, fit }` |
| `UPDATE_FOG` | server → player | `{ fogKey, cells }` |
| `PLAY_AUDIO` | server → player | `{ url, loop }` |
| `STOP_AUDIO` | server → player | — |
| `OVERLAY` | server → player | `{ title, data, duration }` |
| `BLACKOUT` | server → player | `{ active: true\|false }` |
| `CLEAR` | server → player | — |
| `DICE_ROLL` | server → player | `{ die, result }` — anonymous roll broadcast to all players |
| `PLAYER_DICE_ROLL` | server → DM | `{ name, die, result }` — named roll for DM log |
| `TRIGGER_FEATURE` | server → player | `{ feature, allFeatures, mapKey, mapMeta }` |
| `RESET_FEATURE` | server → player | `{ featureId, mapKey }` |
| `MOVEMENT_LOCK` | server → player | `{ name, locked }` |
| `MOVEMENT_LOCK_ALL` | server → player | `{ locked }` |
| `LOGGED_IN_PLAYERS` | server → DM | `{ players: [...names] }` |
| `SET_TARGET` | server → all | `{ player, target }` — combat target assignment (player name → mob label) |
| `ATTACK_ANIMATION` | server → player | `{ attacker, targets[] }` — triggers sword/spell animation on target tokens |
| `SET_FOG_KEY` | server → player | `{ fogKey }` — activates or clears fog overlay on player screens at runtime |
| `UPDATE_OBJECTS` | server → all | `{ objects[], objectStates{} }` — full object definitions + current states |
| `OBJECT_STATE_CHANGE` | server → all | `{ objId, state }` — single object state update after an interaction or DM drag |

**DM → Server additional actions:**

| Action | Payload | Effect |
|--------|---------|--------|
| `set-target` | `{ target }` | Player sets their own attack target |
| `dm-set-target` | `{ player, target }` | DM assigns a target on behalf of any combatant (stored server-side) |
| `trigger-attack` | `{ attacker, targets[] }` | DM broadcasts attack animation to all player screens |
| `update-objects` | `{ objects[] }` | DM pushes object definitions for the current map |
| `interact-object` | `{ objId }` | Player or DM clicks an interactive object (toggle A↔B) |
| `move-object` | `{ objId, col, row }` | DM drags an object to a new cell |

---

## DM Panel Layout

Sections can be reordered by dragging the **⠿** handle in each panel header. The order is saved in `localStorage` per browser. To reset to default, run in the browser console:
```js
localStorage.removeItem('dm-panel-order');
```

Default order:
1. Map Control *(active map, BLACKOUT, CLEAR, fog, tokens, drawing)*
2. Initiative Tracker
3. Reference *(Active Conditions · Condition Dictionary)*
4. Dice Roller
5. Send Text
6. Send Image
7. Monster Lookup
8. Scene Builder

---

## Credits & Acknowledgements

### Monster Data — Open5e

Monster stat blocks are powered by **[Open5e](https://open5e.com/)**, a free and open-source API providing 5th Edition SRD content.

- **API:** `https://api.open5e.com/`
- **GitHub:** [open5e/open5e-api](https://github.com/open5e/open5e-api)
- **License:** Content is drawn from the [Systems Reference Document (SRD)](https://dnd.wizards.com/resources/systems-reference-document) released under the [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/) by Wizards of the Coast.
- Some monster entries originate from third-party 5e supplements (Tome of Beasts, Creature Codex, etc.) also published through Open5e under their respective licenses.

Many thanks to the Open5e contributors for maintaining this invaluable free resource for the D&D community.

---

## License

MIT
