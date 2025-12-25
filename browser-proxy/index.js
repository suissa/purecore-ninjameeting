const express = require('express');
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3001; // Running on 3001 to avoid conflict with main app 2000/3000

let browser = null;
let page = null;
let broadcastInterval = null;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API to launch browser
app.post('/api/launch', async (req, res) => {
  const { url, width = 1280, height = 720 } = req.body;

  if (browser) {
    return res.status(400).json({ error: 'Browser already running' });
  }

  try {
    console.log(`Launching browser to ${url}...`);
    browser = await chromium.launch({
      headless: true, // Use headless for server environment
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox']
    });

    const context = await browser.newContext({
      viewport: { width, height },
      permissions: ['camera', 'microphone']
    });

    page = await context.newPage();
    await page.goto(url);

    // Start broadcasting
    startBroadcast();

    res.json({ status: 'launched', url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// API to close browser
app.post('/api/close', async (req, res) => {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
    clearInterval(broadcastInterval);
    res.json({ status: 'closed' });
  } else {
    res.status(400).json({ error: 'No browser running' });
  }
});

// Websocket for interacting with the page (User only, theoretically)
io.on('connection', (socket) => {
  console.log('Client connected to proxy control');

  socket.on('interaction', async (data) => {
    if (!page) return;
    try {
      if (data.type === 'click') {
        await page.mouse.click(data.x, data.y);
      } else if (data.type === 'type') {
        await page.keyboard.type(data.text);
      } else if (data.type === 'press') { // New: Handle key presses
        await page.keyboard.press(data.key);
      }
    } catch (e) {
      console.error('Interaction error:', e);
    }
  });
});

function startBroadcast() {
  if (broadcastInterval) clearInterval(broadcastInterval);

  // Broadcast screenshot every 100ms (10fps)
  broadcastInterval = setInterval(async () => {
    if (!page) return;
    try {
      const buffer = await page.screenshot({ type: 'jpeg', quality: 50 });
      io.emit('frame', buffer.toString('base64'));
    } catch (e) {
      console.error('Screenshot error:', e);
      clearInterval(broadcastInterval);
    }
  }, 100);
}

// MJPEG Stream Endpoint (Alternative to Socket.io for simple players)
app.get('/stream.mjpg', (req, res) => {
  if (!page) return res.status(404).send('No active session');

  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=myboundary',
    'Cache-Control': 'no-cache',
    'Connection': 'close',
    'Pragma': 'no-cache'
  });

  const streamInterval = setInterval(async () => {
    if (!page) {
      clearInterval(streamInterval);
      return res.end();
    }
    try {
      const buffer = await page.screenshot({ type: 'jpeg', quality: 50 });
      res.write(`--myboundary\nContent-Type: image/jpeg\nContent-Length: ${buffer.length}\n\n`);
      res.write(buffer);
      res.write('\n');
    } catch (e) {
      clearInterval(streamInterval);
    }
  }, 100);

  req.on('close', () => {
    clearInterval(streamInterval);
  });
});

server.listen(PORT, () => {
  console.log(`Browser Proxy running on http://localhost:${PORT}`);
});
