/**
 * Headless Chrome CDP stills + recording frames for the flyer critic packet.
 * Usage: node scripts/capture-flyer-stills.mjs
 * Expects Vite at BASE (starts it if needed).
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('.', import.meta.url)));
const OUT = join(ROOT, 'critic-packets', 'flyer-20260905');
const REC = join(OUT, 'recording');
const CHROME_CANDIDATES = [
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const PORT = 9231;
const VITE_PORT = 5177;
const BASE = `http://127.0.0.1:${VITE_PORT}`;

const SHOTS = [
  { shot: 'canyon-bank', file: 'canyon-bank.png' },
  { shot: 'canyon-hairpin', file: 'canyon-hairpin.png' },
  { shot: 'wormhole-helix', file: 'wormhole-helix.png' },
  { shot: 'rift-loop', file: 'rift-loop.png' },
];

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitHttp(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok || res.status === 404) return true;
    } catch {
      /* not up */
    }
    await sleep(250);
  }
  return false;
}

async function getPageWsUrl() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const json = await res.json();
  const page = json.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) throw new Error('no page target');
  return page.webSocketDebuggerUrl;
}

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const next = ++id;
      pending.set(next, { resolve, reject });
      ws.send(JSON.stringify({ id: next, method, params }));
    });
}

async function waitReady(send, shot = '', tries = 50) {
  for (let i = 0; i < tries; i++) {
    const ev = await send('Runtime.evaluate', {
      expression: 'window.__FLYER_STILL && window.__FLYER_STILL.ready ? JSON.stringify(window.__FLYER_STILL) : null',
      returnByValue: true,
    });
    const v = ev?.result?.value;
    if (v) {
      const meta = JSON.parse(v);
      if (!shot || meta.shot === shot) return meta;
    }
    await sleep(150);
  }
  throw new Error('flyer still not ready' + (shot ? ' for ' + shot : ''));
}

async function screenshot(send, dest) {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const buf = Buffer.from(shot.data, 'base64');
  await writeFile(dest, buf);
  console.log('wrote', dest, buf.length);
  return buf.length;
}

async function captureShot(send, shot, file) {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Runtime.evaluate', { expression: 'window.__FLYER_STILL = null' }).catch(() => {});
  await send('Page.navigate', {
    url: `${BASE}/flyer-stills.html?shot=${shot}&ribbon=1&_=${Date.now()}`,
  });
  await sleep(250);
  const meta = await waitReady(send, shot);
  console.log('ready', meta);
  await sleep(80);
  await screenshot(send, join(OUT, file));
  return meta;
}

async function findChrome() {
  const { access } = await import('node:fs/promises');
  for (const p of CHROME_CANDIDATES) {
    try {
      await access(p);
      return p;
    } catch {
      /* next */
    }
  }
  throw new Error('no Chrome binary');
}

const chromePath = await findChrome();
console.log('chrome', chromePath);
let vite = null;
let chrome = null;

try {
  await mkdir(OUT, { recursive: true });
  await mkdir(REC, { recursive: true });

  const viteUp = await waitHttp(`${BASE}/flyer-stills.html`, 4);
  if (!viteUp) {
    vite = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort', '--host', '127.0.0.1'], {
      cwd: ROOT,
      stdio: 'ignore',
      shell: true,
    });
    const ok = await waitHttp(`${BASE}/flyer-stills.html`, 50);
    if (!ok) throw new Error('vite did not start on ' + BASE);
    console.log('vite', BASE);
  }

  chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${PORT}`,
      '--headless=new',
      '--hide-scrollbars',
      '--window-size=1600,900',
      '--use-gl=angle',
      '--enable-webgl',
      `--user-data-dir=${join(process.env.TEMP || '.', `cube-flyer-cdp-${Date.now()}`)}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let wsUrl = '';
  for (let i = 0; i < 30; i++) {
    try {
      wsUrl = await getPageWsUrl();
      break;
    } catch {
      await sleep(200);
    }
  }
  if (!wsUrl) throw new Error('no chrome page ws');
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  const send = cdp(ws);
  await send('Page.enable');
  await send('Runtime.enable');
  try {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1600,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
  } catch (err) {
    console.warn('skip device metrics', err?.message || err);
  }

  const metas = [];
  for (const s of SHOTS) {
    const meta = await captureShot(send, s.shot, s.file);
    metas.push(meta);
  }
  await mkdir(join(OUT, 'notes'), { recursive: true });
  await writeFile(join(OUT, 'notes', 'shots.json'), JSON.stringify(metas, null, 2));

  if (!process.argv.includes('--no-record')) {
    await send('Runtime.evaluate', { expression: 'window.__FLYER_STILL = null' }).catch(() => {});
    await send('Page.navigate', {
      url: `${BASE}/flyer-stills.html?shot=canyon-hairpin&frame=0&_=${Date.now()}`,
    });
    await sleep(250);
    await waitReady(send, 'canyon-hairpin');
    for (let i = 0; i < 16; i++) {
      if (i > 0) {
        await send('Runtime.evaluate', {
          expression: 'window.__flyerStep()',
          returnByValue: true,
        });
        await sleep(40);
      }
      const name = `canyon-hairpin-${String(i).padStart(2, '0')}.png`;
      await screenshot(send, join(REC, name));
    }
  }

  ws.close();
} finally {
  chrome?.kill();
  if (vite) vite.kill();
}
