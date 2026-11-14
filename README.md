# Voyage Editor

The map, item, NPC and quest editor for Voyage. It opens in a browser, draws maps with the game's own renderer, and
publishes what you make into the shared assets folder's `customs` folder, where
[Voyage-Client](https://github.com/comcad/Voyage-Client) and [Voyage-Server](https://github.com/comcad/Voyage-Server)
read it. It is a patch system: the assets stay as the extractor made them, and `customs` holds the files that stand in
for theirs.

```
voyage-assets/            # made by the Voyage WZ extractor from your own game files
├── Map/ Npc/ String/ ...
└── customs/              # what the editor publishes: the same layout
    ├── Map/Map/Map1/100000000.img.json
    └── String/Map.img.json
Voyage-Client/  Voyage-Server/  Voyage-Editor/   # each pointed at ../voyage-assets
```

## Running it

You need Node.js 18 or later (or Docker) and an assets folder made by the
[Voyage WZ Extractor](https://github.com/comcad/Voyage-Wz-Extractor) from your own `.wz` files.

```sh
cd Voyage-Editor
npm install
node server.js
# → http://localhost:3001
```

Or with Docker: `docker compose up --build -d` (host networking; the assets folder is `../voyage-assets` unless
`VOYAGE_ASSETS` in a `.env` file says otherwise).

## Settings

`conf/editor.conf` (TOML) holds the settings. The editor makes it from the tracked `conf/editor.conf.dist` on its
first start; the template documents each key. **Restart the editor after a change.**

| Key | Default | Meaning |
|---|---|---|
| `Editor.Host` | `"0.0.0.0"` | Address the editor listens on |
| `Editor.Port` | `3001` | Port the editor listens on |
| `Editor.Password` | `""` | The password to sign in with; without one the editor answers only the machine it runs on |
| `Editor.AssetsDir` | `"../voyage-assets"` | The assets folder, shared with the client and the server; publishing writes its `customs` folder |
| `Editor.DataDir` | `"data"` | Where your drafts, what you published and your pictures are kept |

## What it edits

| Tab | What it is for |
|---|---|
| **Maps** | Move, add and remove NPCs, monsters, portals, footholds, ropes, seats, reactors, tiles, objects and backgrounds; wire a portal to another map; start a map of your own, empty or from a copy |
| **Items** | An item's or an equip's name, description, stats and icon; one of your own from a copy |
| **NPCs** | An NPC's name and pictures; one of your own from a copy or from a picture |
| **Quests** | A quest's text, the NPC that gives it and the one that takes it back, what it needs, what it gives, what is said |
| **Import** | Pictures of your own for all of the above (kept as PNG); the ones for maps are the object set and the background set named `custom` in the map editor |

**Save** keeps a draft only the editor sees. **Publish** writes it into `customs`: a map, an NPC or an equip as its
whole file; an item or a quest put into the file the assets keep it in with its neighbours; its name put into the
String file it belongs to; the pictures where its tree says they are. Every file is written whole, with everything
published in it. **Stop publishing** takes yours out again, and players get the assets' own.

After publishing, players get a changed map the next time they enter it (the client looks at `customs` again on its
own); restart Voyage-Server for the game server to read the new files.

The editor only ever takes out files it wrote itself (`data/customs-written.json` lists them). A file you put in
`customs` by hand stays, and the editor builds on it: a String file of yours gets the names put into it.

> The sign-in is a password over plain HTTP. Keep the port off the internet (or behind HTTPS), and without a password
> reach it through an SSH tunnel: `ssh -L 3001:127.0.0.1:3001 you@server`, then open `http://localhost:3001`.

## Project layout

```
Voyage-Editor/
├── server.js             # the web server: sign-in, the page, the assets to draw with, the editor's routes
├── store.mjs             # drafts and what is published (data/), and writing the customs folder from them
├── build.mjs             # bundles src/editor/main.js → public/Editor.js (esbuild)
├── configmgr.mjs         # reads conf/*.conf (TOML)
├── editorconfigs.mjs     # server.js's settings
├── conf/editor.conf.dist # settings template
├── public/               # index.html, editor.css, Editor.js (built)
├── src/
│   ├── editor/           # the tabs: maps.js (with mapview.js, mapdoc.js), things.js, import.js
│   └── *.js              # the map renderer and what it uses, copied from Voyage-Client
├── data/                 # your work: gitignored
└── Dockerfile, docker-compose.yml
```

`src/*.js` (map.js, assets.js and the rest) are Voyage-Client's own files: when the client's renderer changes, copy
them over again.

## Credits and license

Made from Voyage-Client's admin page. MIT, as Voyage-Client (`LICENSE.txt`). No game files, and nothing made from
them, are in this repository.
