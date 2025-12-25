# Playwright P2P Browser Gateway

This is a specialized "Proxy Server" that allows you and your audience to connect to a P2P application (like the WebRTC Video Call System) via a server-side Headless Browser.

## How it works

1. **The Server** (Node.js) runs a Headless Chromium browser using Playwright.
2. **You (The Host)** connect to this server via a Web Interface. You can control the browser (click, type) to join meetings, manage setting, etc.
3. **The Audience** connects to this server to **watch** the live stream of the browser. They see exactly what the browser sees.

## Why use this?

- **Network Isolation**: The P2P connection happens on the server, not your local machine.
- **Scalability**: Your audience connects to this server (HTTP/Stream), NOT the P2P Mesh. This prevents the WebRTC mesh from becoming overloaded with hundreds of viewers.
- **Recording/Restreaming**: The browser view can be easily captured or restreamed effectively.

## Installation

```bash
cd browser-proxy
npm install
npx playwright install chromium
```

## Running

```bash
node index.js
```

Then open [http://localhost:3001](http://localhost:3001).

## Usage

1. Enter the URL of your P2P App (e.g. `http://localhost:3000` or your public URL).
2. Click **Launch**.
3. Interact with the page to join the room.
4. Share the link with your audience. (For read-only audience, you can modify `index.html` to hide controls).
