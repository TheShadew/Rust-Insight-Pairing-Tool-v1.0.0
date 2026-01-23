# Rust Pulse Pairing Tool - Source Code

This repository contains the **complete source code** for the Rust Pulse Pairing Tool. This is provided for transparency so users can verify exactly what the application does before downloading.

## What This App Does

The Rust Pulse Pairing Tool is an Electron-based desktop application that:

1. **Connects to Steam** - Opens the official Facepunch companion login page to authenticate with your Steam account
2. **Listens for Rust+ Pairing** - When you pair a server or device in-game, it captures the pairing notification
3. **Stores credentials locally** - Saves your paired servers and devices in a local JSON file on your computer
4. **Syncs to cloud (optional)** - If logged in, syncs your paired data to the Rust Pulse web app

## What This App Does NOT Do

- ❌ **Does NOT access any files** outside its own storage folder
- ❌ **Does NOT run system commands** or execute external programs
- ❌ **Does NOT send data anywhere** except the official Rust Pulse web app (rust-pulseweb-production.up.railway.app)
- ❌ **Does NOT store passwords** - only OAuth tokens from Steam/Google
- ❌ **Does NOT contain hidden or obfuscated code** - everything is readable in this repo

## Security Features

The app follows Electron security best practices:

- `contextIsolation: true` - The UI cannot directly access Node.js APIs
- `nodeIntegration: false` - Prevents arbitrary code execution
- `sandbox: false` (required for pairing functionality, but isolated via preload)
- All communication between UI and main process goes through a strict preload bridge

## Source Code Structure

```
src/
├── main/
│   └── index.ts        # Main Electron process (backend logic)
├── preload/
│   └── index.ts        # Secure bridge between UI and main process
└── renderer/
    ├── index.html      # HTML entry point
    └── src/
        ├── App.tsx     # React UI component
        ├── main.tsx    # React entry point
        └── styles/
            └── globals.css  # Tailwind CSS styles
```

## File-by-File Explanation

### `src/main/index.ts` - Main Process

This is the "backend" of the app. Here's what each section does:

| Lines | Purpose |
|-------|---------|
| 6-9 | **Imports** - Uses official Electron APIs and the Rust Pulse core pairing library |
| 12-39 | **Data storage** - Defines the structure for storing paired servers/devices locally |
| 46-80 | **Window creation** - Creates the app window with security settings |
| 94-173 | **Cloud login** - Opens a popup to the Rust Pulse web app for Google login |
| 186-249 | **Steam pairing** - Handles the Rust+ pairing flow |
| 252-353 | **`getSteamAuthToken()`** - Opens official Facepunch login page, captures JWT token |
| 450-491 | **Cloud sync** - Sends paired data to the Rust Pulse API |

**Key URLs used:**
- `https://companion-rust.facepunch.com/login` - Official Facepunch Steam login
- `https://rust-pulseweb-production.up.railway.app` - Rust Pulse web app

### `src/preload/index.ts` - Security Bridge

This file defines the **only** functions the UI can call:

- `window.minimize()` / `window.close()` - Window controls
- `auth.login()` / `auth.logout()` - Cloud account login
- `pairing.start()` / `pairing.stop()` - Start/stop pairing listener
- `sync.toCloud()` - Sync data to cloud

The UI **cannot** access the filesystem, run commands, or do anything else.

### `src/renderer/src/App.tsx` - User Interface

This is purely the React UI - buttons, lists, status messages. It can only communicate with the main process through the preload bridge.

## Building From Source

If you want to build the app yourself:

```bash
# Clone this repo
git clone https://github.com/TheShadew/Rust-Pulse-Pairing-Tool-v1.0.0.git

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

**Note:** Building requires the `@rust-pulse/core` package which handles the Rust+ protocol communication. This is part of the main Rust Pulse monorepo.

## Downloads

Pre-built releases are available on the [Releases page](https://github.com/TheShadew/Rust-Pulse-Pairing-Tool-v1.0.0/releases).

### Windows SmartScreen Warning

Windows may show a warning when running the installer because the app is not code-signed with an expensive certificate. This is normal for open-source/indie software. You can:

1. Click "More info" 
2. Click "Run anyway"

The source code here proves exactly what the app does - nothing malicious.

## Questions?

Join the [Rust Pulse Discord](https://discord.gg/your-invite) for support.

---

**This source code is provided for transparency. The main Rust Pulse project is maintained separately.**
