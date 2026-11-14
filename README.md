<div align="center">

<img src="https://github.com/user-attachments/assets/f3327f7f-5a19-403d-b881-d540287cdf14" width="120" height="120" alt="Voyage MapleStory map editor logo" />

# Voyage Editor: Voyage-Client Map Editor

**An open-source Voyage-Client v83 (GMS) map, item, NPC and quest editor that runs in your browser.**
Pure JavaScript · Part of Voyage, with Voyage-Client and Voyage-Server

<br />

![License](https://img.shields.io/github/license/comcad/Voyage-Editor?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5%2018-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)
[![Voyage-Client](https://img.shields.io/badge/Client-Voyage--Client-blue?style=flat-square)](https://github.com/comcad/Voyage-Client)
[![Stars](https://img.shields.io/github/stars/comcad/Voyage-Editor?style=flat-square&logo=github)](https://github.com/comcad/Voyage-Editor/stargazers)
[![Forks](https://img.shields.io/github/forks/comcad/Voyage-Editor?style=flat-square&logo=github)](https://github.com/comcad/Voyage-Editor/forks)
[![Last commit](https://img.shields.io/github/last-commit/comcad/Voyage-Editor?style=flat-square)](https://github.com/comcad/Voyage-Editor/commits/main)

</div>
<img width="2872" height="1448" alt="image" src="https://github.com/user-attachments/assets/312d9637-7013-4e0e-bcae-717a81a58c8d" />


<br />

**Voyage Editor** is an open-source **Voyage-Client map editor** for **v83 (GMS)**, with editors for items, equips, NPCs and quests beside it. It opens in a web browser, draws maps with [Voyage-Client](https://github.com/comcad/Voyage-Client)'s own renderer, and publishes what you make into the shared assets folder's `customs` folder, where Voyage-Client and [Voyage-Server](https://github.com/comcad/Voyage-Server) read it. It works like a patch system: the assets stay as the extractor made them, and `customs` holds the files that stand in for theirs.

The repository contains the editor page, the small Node.js server that serves it and writes the `customs` folder, and a Dockerfile for running it.


## 🧭 The Voyage Projects

Voyage is four projects that work together, all reading one assets folder made from your own game files:

| Project | What it does |
|---|---|
| [Voyage-Client](https://github.com/comcad/Voyage-Client) | The web client: serves the game to browsers and relays them to the game server |
| [Voyage-Server](https://github.com/comcad/Voyage-Server) | The game server: reads the same assets, with an admin page |
| **Voyage-Editor** (this one) | The map, item, NPC and quest editor: publishes what you make into the assets' `customs` folder |
| [Voyage-Wz-Extractor](https://github.com/comcad/Voyage-Wz-Extractor) | Turns your own `.wz` files into the assets folder the other three read |

```
voyage-assets/                 # made by the extractor from your own .wz files
├── Map/ Npc/ String/ ...
└── customs/                   # what Voyage-Editor publishes: files that stand in for the assets' own
Voyage-Client/  Voyage-Server/  Voyage-Editor/    # each pointed at ../voyage-assets
```

## ✨ Features of the MapleStory Editor

| | Area | What's included |
|---|---|---|
| 🗺️ | **Maps** | Open any map of the game's and see it as players do: backgrounds, tiles, objects, NPCs, monsters and portals, drawn by the game's own renderer |
| 🧱 | **Map making** | Start a map of your own, empty or as a copy of another; its name and street name, and every setting of its `info` |
| 👾 | **Life** | Add, move and remove NPCs and monsters, picked by name or number |
| 🚪 | **Portals** | Add and move portals and wire them to another map's portal, with every portal type explained |
| 🪜 | **Ground** | Footholds drawn along the ground, ropes and ladders, seats and reactors |
| 🎨 | **Scenery** | Tiles, objects and backgrounds by set, on any of the eight layers, with snapping and animation if you want them |
| ✅ | **Checks** | Before publishing, a list of what would go wrong on the map (no ground, no place to arrive, something standing on nothing) |
| ↩️ | **Undo** | Undo and redo every change, and drafts that only the editor sees until you publish |
| 🗡️ | **Items & equips** | An item's or an equip's name, description, stats and icon; one of your own from a copy |
| 🧑 | **NPCs** | An NPC's name and pictures; one of your own from a copy or from a picture |
| 📜 | **Quests** | A quest's text, the NPC that gives it and the one that takes it back, what it needs, what it gives, what is said |
| 🖼️ | **Import** | Pictures of your own (PNG) for all of the above; the ones for maps become the `custom` object and background sets |

## 🧩 How the Voyage-Client Editor Works in a Browser

```
┌──────────────────┐     HTTP      ┌──────────────────┐   reads    ┌─────────────────────────┐
│     Browser      │ ◄───────────► │    server.js     │ ─────────► │     voyage-assets/      │
│   (Editor.js)    │               │ Express + store  │   writes   │ └── customs/            │
└──────────────────┘               └────────┬─────────┘ ─────────► └────────────▲────────────┘
                                            │                                   │ read
                                   ┌────────┴─────────┐              ┌──────────┴──────────┐
                                   │      data/       │              │    Voyage-Client    │
                                   │ drafts, pictures │              │    Voyage-Server    │
                                   └──────────────────┘              └─────────────────────┘
```

The browser draws maps with the client's renderer from the assets `server.js` serves (the `customs` folder's files first). Your drafts and what you published are kept in `data/`; publishing writes the files players and the game server need into `customs`, where Voyage-Client and Voyage-Server read them.

## 📋 Requirements

- A folder of Voyage-Client v83 GMS extracted asset files (your own), extracted with the [Voyage-Wz-Extractor](https://github.com/comcad/Voyage-Wz-Extractor)
- [Voyage-Client](https://github.com/comcad/Voyage-Client) and [Voyage-Server](https://github.com/comcad/Voyage-Server) pointed at the same assets folder, to play what you make
- **Either** Node.js ≥ 18 **or** Docker

## 🚀 Quick Start: Run the MapleStory Editor

### 1. Clone the repo

```sh
git clone https://github.com/comcad/Voyage-Editor.git
cd Voyage-Editor
```

### 2. Extract assets

The WZ extractor lives in its own repo: **[Voyage-Wz-Extractor](https://github.com/comcad/Voyage-Wz-Extractor)** (pure Node, zero dependencies).

> [!NOTE]
> Use your own Voyage-Client v83 GMS asset files.

```sh
cd ..                                # beside Voyage-Editor, not inside it
git clone https://github.com/comcad/Voyage-Wz-Extractor
cd Voyage-Wz-Extractor
node wz-extract.mjs <path-to-wz-folder> ../voyage-assets
cd ../Voyage-Editor
```

The assets folder is shared: Voyage-Editor, Voyage-Client and Voyage-Server all point at the same one (here `voyage-assets`, beside the repos; `Editor.AssetsDir` in `conf/editor.conf`). If you already run the client, use its assets folder.

### 3. Run it

<details>
<summary><b>🐳 Option A: Docker</b></summary>

<br />

Builds the image (installs dependencies and bundles the editor page), then runs it with the assets folder mounted in. It uses **host networking**, so it binds `Editor.Port` directly.

```sh
cd Voyage-Editor
docker compose up --build -d
# → http://<your-host-ip>:3001
```

Manage it with `docker compose logs -f`, `docker compose restart` and `docker compose down`. Settings live in `conf/editor.conf` and your work in `data/`, both mounted into the container; the assets folder is `../voyage-assets` unless `VOYAGE_ASSETS` says otherwise (a `.env` file beside `docker-compose.yml` will do).

</details>

<details>
<summary><b>🟢 Option B: Node directly</b></summary>

<br />

```sh
cd Voyage-Editor
npm install
node server.js
# → http://localhost:3001
```

The server bundles the editor page (`src/editor/main.js` → `public/Editor.js`) on start via `build.mjs`. Run `node build.mjs` to rebuild it on its own.

</details>

### 4. Edit

Open `http://<host>:3001` and sign in with `Editor.Password` (without one, the editor answers only the machine it runs on). Open a map by its name or number, change it, **Save** a draft, and **Publish** when it is ready. 🛠️

## ⚙️ Settings

`conf/editor.conf` (TOML) holds every setting. The editor creates it from the tracked `conf/editor.conf.dist` on first start; that template documents each key and its default. `editor.conf` is gitignored, so your settings stay local.

Other `conf/*.conf` files are read too (each key in only one file), and `node server.js --conf <dir>` reads another folder. **Restart the editor after a change.**

| Key | Default | Meaning |
|---|---|---|
| `Editor.Host` | `"0.0.0.0"` | Address the editor listens on |
| `Editor.Port` | `3001` | Port the editor listens on |
| `Editor.Password` | `""` | The password to sign in with; without one the editor answers only the machine it runs on |
| `Editor.AssetsDir` | `"../voyage-assets"` | The assets folder, shared with Voyage-Client and Voyage-Server, relative to `server.js`; publishing writes its `customs` folder |
| `Editor.DataDir` | `"data"` | Where your drafts, what you published and your pictures are kept, relative to `server.js` |

## 🗂️ Customs

Publishing writes the assets folder's `customs` folder, laid out like the assets folder itself:

```
voyage-assets/
└── customs/
    ├── Map/Map/Map1/100000000.img.json      # your Henesys, in place of the assets' own
    ├── Map/Map/Map9/990000001.img.json      # a map of your own: only customs has it
    ├── Item/Consume/0200.img.json           # the potions' file, with yours in it
    ├── String/Map.img.json                  # the names, with yours in them
    └── Npc/_custom/npcs/guide.png           # a picture of your own
```

- A map, an NPC or an equip is written as its whole file.
- An item or a quest is put into the file the assets keep it in with its neighbours, and its name into the String file it belongs to.
- Every file is written whole, with everything published in it. **Stop publishing** takes yours out again, and players get the assets' own.

Players get a changed file the next time they change maps (the client looks at `customs` again on its own); restart Voyage-Server for the game server to read the new files.

The editor only ever takes out files it wrote itself (`data/customs-written.json` lists them). A file you put in `customs` by hand stays, and the editor builds on it: a String file of yours gets the names put into it. The assets folder itself is never written to.

> [!CAUTION]
> The sign-in is a password over plain HTTP. Keep the port off the internet (or behind HTTPS), and without a password reach it through an SSH tunnel: `ssh -L 3001:127.0.0.1:3001 you@server`, then open `http://localhost:3001`.

## 📁 Project Layout

<details>
<summary><b>Click to expand the directory tree</b></summary>

```
Voyage-Editor/
├── data/                 # your drafts, what you published and your pictures: gitignored
├── public/
│   ├── index.html
│   ├── editor.css
│   └── Editor.js         # built editor bundle: gitignored, generated at build/boot
├── src/
│   ├── editor/
│   │   ├── main.js       # entry point: sign-in and the tabs
│   │   ├── maps.js       # the map editor's bar, panel and pickers
│   │   ├── mapview.js    # the canvas: drawing, picking, dragging
│   │   ├── mapdoc.js     # a map being edited: its tree, undo, checks
│   │   ├── things.js     # items, equips, NPCs and quests
│   │   ├── import.js     # pictures of your own
│   │   └── ui.js, api.js # small helpers
│   └── *.js              # the map renderer and what it uses, copied from Voyage-Client (map.js, assets.js, ...)
├── conf/
│   ├── editor.conf.dist  # settings template; server.js creates editor.conf from it
│   └── editor.conf       # your local config (gitignored)
├── server.js             # Express server: sign-in, the page, the assets to draw with, the editor's routes
├── store.mjs             # drafts and what is published (data/), and writing the customs folder from them
├── build.mjs             # bundles src/editor → public/Editor.js (esbuild)
├── configmgr.mjs         # reads conf/*.conf (TOML)
├── editorconfigs.mjs     # server.js's settings
├── package.json          # Node dependencies
├── Dockerfile, docker-compose.yml, .dockerignore
├── LICENSE.txt
├── .gitignore            # data/, node_modules/, conf/*.conf are excluded
└── README.md
```

`src/*.js` are Voyage-Client's own files: when the client's renderer changes, copy them over again.

</details>

## ❓ FAQ

<details>
<summary><b>What is a Voyage-Client map editor?</b></summary>

<br />

A tool for changing the maps of a Voyage-Client server, or making new ones: where the ground is, where monsters spawn, which NPCs stand where, where portals lead. Voyage Editor is one for v83 that runs in a web browser and draws each map with the game client's own renderer, so a map looks in the editor the way players see it.

</details>

<details>
<summary><b>How do players get what I make?</b></summary>

<br />

Publishing writes it into the assets' `customs` folder. [Voyage-Client](https://github.com/comcad/Voyage-Client) serves those files in place of the assets' own, and players get them the next time they change maps. [Voyage-Server](https://github.com/comcad/Voyage-Server) reads the same files when it restarts, so the game server knows the new ground, spawns and stats too.

</details>

<details>
<summary><b>Does it change my extracted assets?</b></summary>

<br />

No. The assets folder is only ever read; everything goes into `customs`. Delete a file from `customs` (or stop publishing it in the editor) and the game is as the assets have it again.

</details>

<details>
<summary><b>Can I use it with another server?</b></summary>

<br />

The files it writes are the game's own JSON, laid out as the assets are, so any server that reads Voyage's assets folder can use them. A server that reads XML `wz` folders can't read them as they are.

</details>

<details>
<summary><b>Where are my drafts?</b></summary>

<br />

In `data/` (`Editor.DataDir`): a folder for each kind (`maps/`, `npcs/`, `equips/`, `items/`, `quests/`), with what you published in `published/` and the pictures you brought in in `pictures/`. Keep it with the editor: it is what the `customs` folder is written from.

</details>

## 💬 Community

Questions, feedback, or want to help test? Come hang out on Discord.

[![Discord](https://img.shields.io/badge/Discord-discord.gg%2FSCVxm6tB4g-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/SCVxm6tB4g)

## 🙏 Credits

- **Renderer:** [Voyage-Client](https://github.com/comcad/Voyage-Client), whose map renderer draws every map here (the editor began as the client's admin page)
- **Server:** [Voyage-Server](https://github.com/comcad/Voyage-Server)

## 📄 License

- **License:** [MIT](LICENSE.txt)


## ⚠️ Disclaimer

**Voyage Editor is an unofficial, fan-made, non-commercial project. It is not affiliated with, endorsed by, sponsored by, or connected to Nexon Korea Corporation, Nexon America Inc., or any of their subsidiaries or affiliates ("Nexon").**

### Trademarks & Copyright
MapleStory, its name, logos, characters, artwork, music, sound effects, text, game data, and all related assets are the property of Nexon and its licensors. All trademarks and copyrights belong to their respective owners. The name "MapleStory" is used in this repository for identification and compatibility description only and does not imply any association with Nexon.

### No Game Assets Included
This repository contains **no** copyrighted Nexon assets. That includes `.wz` files, extracted images, audio, maps, and any other game data. It contains only original source code written by the contributors.

To use this software, you must supply your own legally obtained copy of the game files. You are solely responsible for ensuring you have the legal right to possess and use them. The contributors do not provide, host, link to, or distribute these files and will not assist in obtaining them.

### No Nexon Code
This is an independent implementation. It does not contain and was not derived from Nexon's proprietary client source code or binaries. It reads only the game files you extract yourself, for interoperability purposes.

### Intended Use
This software is provided for educational, research, and interoperability purposes, and for use with self-hosted servers on a private, non-commercial basis. It is not intended to circumvent any technological protection measure, to replace or compete with any official Nexon product or service, or to be used for commercial gain.

The contributors do not sell this software, charge for access, or accept payment for in-game items or advantages. Anyone who does so with this software acts on their own account and at their own risk.

### Official Servers
Use of this software with Nexon's official servers is **not supported** and may violate Nexon's Terms of Service, potentially resulting in account action. Do not use it for that purpose.

### License Scope
The MIT license in this repository applies **only** to the original source code written by the contributors. It grants no rights to any Nexon trademarks, assets, or other intellectual property.

### No Warranty
THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING FROM THE USE OF THIS SOFTWARE.

### Your Responsibility
You are responsible for complying with all applicable laws and with any license or terms of service that apply to the game files and servers you use.

### Takedown Requests
If you are a rights holder and believe this repository infringes your rights, please contact **[xcomcadx@gmail.com]** or open an issue. Your request will be reviewed and addressed promptly.


<div align="right">

[⬆ Back to top](#voyage-editor-Voyage-Client-map-editor)

</div>
