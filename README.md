# DC2 Visualizer

A **3D live blockchain visualizer** for the [DOGE2](http://explorer.doge2.org/) blockchain.  
Watch blocks arrive in real time, shoot targets in game mode, and share a live public link via Cloudflare — all from your desktop.

> Created by **BitsPleaseYT**

---

## Features

- 🔗 **Live 3D blockchain** — blocks, mempool bubbles, peer nodes, and mining activity rendered in Three.js
- 🎯 **Game mode** — shoot flying targets and blocks for points; gold coins burst on new blocks
- 🎵 **Background music** — LoFi and Energy genres with track controls
- 🌐 **Cloudflare sharing** — one-click public URL (trycloudflare.com) that's safe to share
- 🔒 **Wallet-safe** — only read-only RPC methods are exposed; wallet/send/private keys are hard-blocked

---

## Requirements

| Requirement | Notes |
|-------------|-------|
| [Node.js](https://nodejs.org/) ≥ 18 | Required to run the server |
| [DOGE2 daemon](http://doge2.org/) | `dogecoin2d` running with RPC enabled on port 22655 |
| [cloudflared](https://github.com/cloudflare/cloudflared/releases) | Optional — for public sharing link |

---

## Quick Start (Development)

```bash
# Install dependencies
npm install

# Start just the server (no Electron window)
npm run dev

# Open http://127.0.0.1:3100 in your browser
```

## Desktop App (Electron)

```bash
npm install
npm start
```

---

## Building Installers

```bash
npm install

# Windows (.exe via NSIS)
npm run build:win

# macOS (.dmg)
npm run build:mac

# Linux (AppImage + .deb)
npm run build:linux

# All platforms at once
npm run build
```

Output goes to `dist/`.

---

## DOGE2 Daemon Setup

The visualizer connects to a local `dogecoin2d` RPC on `127.0.0.1:22655`.

Your `dogecoin2.conf` (in `%APPDATA%\Dogecoin2\` on Windows) needs:

```ini
server=1
rpcuser=doge2rpc
rpcpassword=Doge2RpcPass2026!
rpcport=22655
rpcallowip=127.0.0.1
```

> **Security note:** The visualizer only forwards a hardcoded allowlist of read-only RPC methods.  
> Wallet operations (`sendtoaddress`, `dumpprivkey`, etc.) are blocked at the server level.

---

## Cloudflare Sharing

The launcher (`Start-DOGE2-Visualizer.bat` on Windows) automatically starts a  
[trycloudflare.com](https://try.cloudflare.com) tunnel and writes the URL to a text file.  
The URL changes on every restart. Share it freely — your wallet is not accessible through it.

Requires [cloudflared](https://github.com/cloudflare/cloudflared/releases) installed at:  
`C:\Program Files (x86)\cloudflared\cloudflared.exe`

---

## Music

Royalty-free tracks are stored in:

```
music/
  lofi/    ← chill background tracks
  energy/  ← upbeat tracks
```

Add your own `.mp3` files to either folder — they'll appear automatically in the player.

---

## Project Structure

```
DC2 Visualizer/
├── doge2-server.js        # Node.js HTTP server + RPC proxy
├── doge2-visualizer.html  # Three.js 3D visualizer (single file)
├── electron-main.js       # Electron desktop wrapper
├── Start-DOGE2-Visualizer.bat   # Windows launcher (server + Cloudflare)
├── Start-DOGE2-Visualizer.ps1   # PowerShell launcher script
├── icons/                 # App icons (Windows/Mac/Linux)
├── music/
│   ├── lofi/
│   └── energy/
└── package.json
```

---

## License

MIT © BitsPleaseYT
