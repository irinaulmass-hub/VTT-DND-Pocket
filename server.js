const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// ── Persistence ───────────────────────────────────────────────
const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ── Characters ────────────────────────────────────────────────
const CHAR_FILE = path.join(DATA_DIR, 'characters.json');

function loadCharacters() {
  try {
    return JSON.parse(fs.readFileSync(CHAR_FILE, 'utf8'));
  } catch {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'seeds', 'characters.json'), 'utf8')); } catch { return { characters: [] }; }
  }
}

function saveCharacters(data) {
  fs.mkdirSync(path.dirname(CHAR_FILE), { recursive: true });
  fs.writeFileSync(CHAR_FILE, JSON.stringify(data, null, 2));
}

function uid(name) {
  return 'c_' + String(name || 'x').toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '_')
    .replace(/^_|_$/g, '')
    + '_' + Date.now().toString(36).slice(-4);
}


function saveState() {
  try {
    const snapshot = {
      currentSceneView, currentFogStates, currentTokens, currentTokensMapKey,
      currentTokensShowRings, currentDrawing, currentDrawingMapKey,
      currentFeatures, currentFeatureStates, currentMapMeta, currentTargets,
      gridEnabled, allPlayersLocked, blackout: currentState.blackout,
      allTokenStates, currentObjectDefs, currentObjectStates,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(snapshot));
  } catch (e) { console.error('saveState error:', e.message); }
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (saved.currentSceneView) currentSceneView = saved.currentSceneView;
    if (saved.currentFogStates) currentFogStates = saved.currentFogStates;
    if (Array.isArray(saved.currentTokens)) currentTokens = saved.currentTokens;
    if (saved.currentTokensMapKey) currentTokensMapKey = saved.currentTokensMapKey;
    if (saved.currentTokensShowRings !== undefined) currentTokensShowRings = saved.currentTokensShowRings;
    if (Array.isArray(saved.currentDrawing)) currentDrawing = saved.currentDrawing;
    if (saved.currentDrawingMapKey) currentDrawingMapKey = saved.currentDrawingMapKey;
    if (Array.isArray(saved.currentFeatures)) currentFeatures = saved.currentFeatures;
    if (saved.currentFeatureStates) currentFeatureStates = saved.currentFeatureStates;
    if (saved.currentMapMeta) currentMapMeta = saved.currentMapMeta;
    if (saved.currentTargets) currentTargets = saved.currentTargets;
    if (typeof saved.gridEnabled === 'boolean') gridEnabled = saved.gridEnabled;
    if (typeof saved.allPlayersLocked === 'boolean') allPlayersLocked = saved.allPlayersLocked;
    if (typeof saved.blackout === 'boolean') currentState.blackout = saved.blackout;
    if (saved.allTokenStates && typeof saved.allTokenStates === 'object') allTokenStates = saved.allTokenStates;
    if (Array.isArray(saved.currentObjectDefs)) currentObjectDefs = saved.currentObjectDefs;
    if (saved.currentObjectStates && typeof saved.currentObjectStates === 'object') currentObjectStates = saved.currentObjectStates;
    console.log('State restored from disk.');
  } catch (e) { console.error('loadState error:', e.message); }
}

const DM_PASSWORD = process.env.DM_PASSWORD || 'dm1234';
const SESSION_SECRET = crypto.randomBytes(32).toString('hex'); 
const dmSessions = new Set(); 

function makeToken() { return crypto.randomBytes(24).toString('hex'); }
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) out[k.trim()] = v.join('=').trim();
  });
  return out;
}
function isDmAuthed(req) { return dmSessions.has(parseCookies(req).dm_token || ''); }

app.get('/dm-login', (req, res) => {
  if (isDmAuthed(req)) return res.redirect('/');
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>DM Login</title>
<style>body{background:#0d1117;color:#e6e6e6;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
.box{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:2.5rem;width:340px;text-align:center;}
h1{color:#d4af37;}input{width:100%;padding:0.65rem;background:#0d1117;border:1px solid #30363d;color:#fff;margin-bottom:1rem;text-align:center;}
button{width:100%;padding:0.65rem;background:#d4af37;font-weight:bold;border:none;cursor:pointer;}</style></head><body>
<div class="box"><h1>🎲 DM Console</h1><form method="POST" action="/dm-login">
<input type="password" name="password" placeholder="Password" autofocus/>
<button type="submit">Enter</button></form>
<div style="color:#ef4444;margin-top:10px;">${req.query.err ? 'Incorrect password.' : ''}</div>
</div></body></html>`);
});

app.post('/dm-login', express.urlencoded({ extended: false }), (req, res) => {
  if (req.body.password === DM_PASSWORD) {
    const token = makeToken();
    dmSessions.add(token);
    res.setHeader('Set-Cookie', `dm_token=${token}; HttpOnly; SameSite=Strict; Path=/`);
    return res.redirect('/');
  }
  res.redirect('/dm-login?err=1');
});

app.get('/dm-logout', (req, res) => {
  dmSessions.delete(parseCookies(req).dm_token || '');
  res.setHeader('Set-Cookie', 'dm_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.redirect('/dm-login');
});

function requireDm(req, res, next) {
  if (isDmAuthed(req)) return next();
  res.redirect('/dm-login');
}

app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
const _mapsDir = path.join(__dirname, 'public/assets/maps');
if (fs.existsSync(_mapsDir)) {
  for (const _sub of fs.readdirSync(_mapsDir)) {
    const _subPath = path.join(_mapsDir, _sub);
    if (fs.statSync(_subPath).isDirectory()) app.use('/assets/maps', express.static(_subPath));
  }
}

const BLOCKED_PATHS = ['/server.js', '/package.json', '/package-lock.json'];
const BLOCKED_PREFIXES = ['/seeds/', '/node_modules/', '/.git/'];
app.use(function (req, res, next) {
  const p = req.path.toLowerCase();
  if (BLOCKED_PATHS.includes(p) || BLOCKED_PREFIXES.some(function (b) { return p.startsWith(b); })) return res.status(403).end();
  next();
});

app.use('/dm', requireDm, express.static(path.join(__dirname, 'dm')));
app.use('/remote', express.static(path.join(__dirname, 'remote')));
app.use('/map-builder', requireDm, express.static(path.join(__dirname, 'map-builder')));

function listFiles(dir, exts) {
  const fullDir = path.join(__dirname, dir);
  if (!fs.existsSync(fullDir)) return [];
  const urlPrefix = `/assets/${dir.split('/').pop()}/`;
  const results = [];
  (function scan(d, urlPath) {
    for (const f of fs.readdirSync(d)) {
      const fp = path.join(d, f);
      if (fs.statSync(fp).isDirectory()) scan(fp, urlPath + f + '/');
      else if (exts.some(ext => f.toLowerCase().endsWith(ext))) results.push(urlPath + f);
    }
  })(fullDir, urlPrefix);
  return results;
}

let currentState = { nowShowing: '—', content: '', blackout: false };
let currentSceneId = null;
let currentSceneView = null;
let currentFogStates = {};
let currentAudio = null;
let currentTokens = [];
let currentTokensMapKey = null;
let currentTokensShowRings = true;
let currentDrawing    = [];
let currentDrawingMapKey = null;
let currentFeatures      = [];
let currentFeatureStates = {};
let currentMapMeta       = null;
let currentObjectDefs    = [];
let currentObjectStates  = {};
const lockedPlayers    = new Set();
let allPlayersLocked   = false;
const loggedInPlayers  = new Map();
let currentTargets     = {};
let gridEnabled        = false;
let allTokenStates     = {};
const clients = new Set();
const dmClients = new Set();
let guestCounter = 0;

loadState();

function broadcastClientCount() {
  for (const c of clients) { if (c.readyState !== WebSocket.OPEN) { clients.delete(c); dmClients.delete(c); } }
  for (const d of dmClients) { if (d.readyState !== WebSocket.OPEN) dmClients.delete(d); }
  const playerCount = clients.size - dmClients.size;
  const connectedList = [];
  for (const c of clients) {
    if (dmClients.has(c)) continue;
    connectedList.push(c.playerName ? { name: c.playerName, type: 'player' } : { name: 'Guest #' + c.guestId, type: 'guest' });
  }
  const payload = JSON.stringify({ type: 'clients', count: playerCount, connectedList });
  for (const dm of dmClients) { if (dm.readyState === WebSocket.OPEN) dm.send(payload); }
}

setInterval(() => { broadcastClientCount(); }, 5000);

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const client of clients) { if (client.readyState === WebSocket.OPEN) client.send(payload); }
}

function sendFullState(ws) {
  if (currentState.blackout) { ws.send(JSON.stringify({ type: 'BLACKOUT', active: true })); return; }
  if (currentSceneView) ws.send(JSON.stringify(currentSceneView));
  else if (currentSceneId) ws.send(JSON.stringify({ type: 'SHOW_SCENE', sceneId: currentSceneId }));
  for (const fogKey of Object.keys(currentFogStates)) ws.send(JSON.stringify({ type: 'UPDATE_FOG', fogKey, fogGrid: currentFogStates[fogKey] }));
  if (currentTokensMapKey) ws.send(JSON.stringify({ type: 'UPDATE_TOKENS', tokens: currentTokens, mapKey: currentTokensMapKey, showRings: currentTokensShowRings }));
  if (currentDrawingMapKey) ws.send(JSON.stringify({ type: 'UPDATE_DRAWING', strokes: currentDrawing, mapKey: currentDrawingMapKey }));
  if (currentFeatures.length) ws.send(JSON.stringify({ type: 'UPDATE_FEATURES', features: currentFeatures, mapKey: currentTokensMapKey, mapMeta: (currentSceneView && currentSceneView.mapMeta) || currentMapMeta || null }));
  for (const [fid, fstate] of Object.entries(currentFeatureStates)) {
    if (fstate === 'triggered') {
      const feat = currentFeatures.find(f => f.id === fid);
      if (feat) ws.send(JSON.stringify({ type: 'TRIGGER_FEATURE', feature: feat, allFeatures: currentFeatures, mapKey: currentTokensMapKey, mapMeta: (currentSceneView && currentSceneView.mapMeta) || currentMapMeta || null }));
    }
  }
  for (const [player, target] of Object.entries(currentTargets)) { if (target) ws.send(JSON.stringify({ type: 'SET_TARGET', player, target })); }
  if (currentObjectDefs.length) ws.send(JSON.stringify({ type: 'UPDATE_OBJECTS', objects: currentObjectDefs, objectStates: currentObjectStates }));
  if (gridEnabled) ws.send(JSON.stringify({ type: 'GRID_TOGGLE', enabled: true }));
}

setInterval(() => {
  for (const ws of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
    try { ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {}
  }
}, 30000);

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  clients.add(ws);
  const dmAuthed = isDmAuthed(req);
  if (dmAuthed) dmClients.add(ws);
  if (!dmAuthed) ws.guestId = ++guestCounter;
  console.log(`Client connected. Total: ${clients.size} | isDM: ${dmAuthed}`);
  broadcastClientCount();
  
  if (!dmAuthed) {
    sendFullState(ws);
  } else {
    ws.send(JSON.stringify({
      type: 'DM_STATE_RESTORE',
      playerCount: clients.size - dmClients.size,
      connectedList: [...clients].filter(c => !dmClients.has(c) && c.readyState === WebSocket.OPEN).map(c => c.playerName ? { name: c.playerName, type: 'player' } : { name: 'Guest #' + c.guestId, type: 'guest' }),
      sceneView: currentSceneView, fogStates: currentFogStates, tokens: currentTokens, tokensMapKey: currentTokensMapKey,
      drawing: currentDrawing, drawingMapKey: currentDrawingMapKey, features: currentFeatures, featureStates: currentFeatureStates,
      blackout: currentState.blackout, loggedInPlayers: [...loggedInPlayers.keys()], lockedPlayers: [...lockedPlayers],
      allPlayersLocked: allPlayersLocked, currentTargets: currentTargets, gridEnabled: gridEnabled, allTokenStates: allTokenStates,
    }));
  }

  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw);
      const isDm = dmClients.has(ws);
      const DM_ACTIONS = ['blackout','show','show-scene-view','clear','clear-scene','play-audio','stop-audio','send-overlay','update-fog','set-rings','update-tokens','update-drawing','dm-connect','trigger-feature','reset-feature','update-features','lock-player','unlock-player','lock-all','unlock-all','trigger-attack','dm-set-target','toggle-grid','sync-all-tokens','update-player-data','update-character'];
        
      if (DM_ACTIONS.includes(message.action) && !isDm) {
        if (message.action === 'dm-connect') ws.send(JSON.stringify({ type: 'auth-required' }));
        return;
      }
      
      switch (message.action) {
        case 'update-player-data': {
          const pName = message.playerName;
          const patch = message.patch;
          if (!pName || !patch) break;
          try {
            const playersPath = path.join(__dirname, 'seeds', 'players.json');
            let players = JSON.parse(fs.readFileSync(playersPath, 'utf8'));
            let p = players.find(x => x.name.toLowerCase() === pName.toLowerCase());
            if (p) {
              for (const key in patch) p[key] = patch[key];
              fs.writeFileSync(playersPath, JSON.stringify(players, null, 2));
              broadcast({ type: 'PLAYER_DATA_UPDATE', player: p });
            }
          } catch(e) { console.error('update-player-data error:', e); }
          break;
        }
        case 'dm-connect':
          dmClients.add(ws);
          ws.send(JSON.stringify({ type: 'clients', count: clients.size - dmClients.size }));
          break;
        case 'request-sync': sendFullState(ws); break;
        case 'blackout': currentState.blackout = !currentState.blackout; broadcast({ type: 'BLACKOUT', active: currentState.blackout }); break;
        case 'show': currentSceneId = message.sceneId || null; broadcast({ type: 'SHOW_SCENE', sceneId: currentSceneId }); break;
        case 'show-scene-view': {
          currentState.blackout = false; currentTokens = []; currentTokensMapKey = message.mapKey || null; currentDrawing = []; currentDrawingMapKey = message.mapKey || null;
          currentFogStates = {}; currentFeatures = Array.isArray(message.features) ? message.features : []; currentFeatureStates = {}; currentTargets = {};
          currentObjectDefs = Array.isArray(message.objects) ? message.objects : []; currentObjectStates = {};
          const sceneViewMsg = { type: 'SHOW_SCENE_VIEW', image: message.image, audio: message.audio || null, fogKey: message.fogKey || null, audioLoop: message.audioLoop !== false, fit: message.fit || 'contain', mapKey: message.mapKey || null, features: currentFeatures, mapMeta: message.mapMeta || null, label: message.label || '' };
          currentSceneView = sceneViewMsg; currentAudio = message.audio ? { url: message.audio, loop: message.audioLoop !== false } : null;
          broadcast(sceneViewMsg); broadcast({ type: 'UPDATE_TOKENS', tokens: [], mapKey: currentTokensMapKey }); broadcast({ type: 'UPDATE_DRAWING', strokes: [], mapKey: currentDrawingMapKey }); saveState(); break;
        }
        case 'clear':
          currentSceneId = null; currentSceneView = null; currentState.blackout = false; currentTokens = []; currentTokensMapKey = null; currentDrawing = [];
          currentDrawingMapKey = null; currentFogStates = {}; currentAudio = null; currentFeatures = []; currentFeatureStates = {}; currentTargets = {}; allTokenStates = {};
          broadcast({ type: 'CLEAR' }); saveState(); break;
        case 'clear-scene':
          currentSceneView = null; currentTokens = []; currentTokensMapKey = null; currentDrawing = []; currentDrawingMapKey = null; currentFogStates = {};
          currentFeatures = []; currentFeatureStates = {}; currentTargets = {}; allTokenStates = {}; broadcast({ type: 'CLEAR_SCENE' }); saveState(); break;
        case 'play-audio': if (message.url) { currentAudio = { url: message.url, loop: message.loop !== false }; broadcast({ type: 'PLAY_AUDIO', url: message.url, loop: message.loop !== false }); } break;
        case 'stop-audio': currentAudio = null; broadcast({ type: 'STOP_AUDIO' }); break;
        case 'send-overlay': broadcast({ type: 'OVERLAY', title: message.title || '', data: message.data || '', duration: message.duration || 10000, subtype: message.subtype || '' }); break;
        case 'update-fog': if (message.fogKey) currentFogStates[message.fogKey] = message.fogGrid; broadcast({ type: 'UPDATE_FOG', fogGrid: message.fogGrid, fogKey: message.fogKey }); saveState(); break;
        case 'set-fog-key': if (currentSceneView) currentSceneView.fogKey = message.fogKey || null; broadcast({ type: 'SET_FOG_KEY', fogKey: message.fogKey || null }); saveState(); break;
        case 'set-rings': currentTokensShowRings = message.showRings !== undefined ? message.showRings : true; broadcast({ type: 'SET_RINGS', showRings: currentTokensShowRings }); break;
        case 'update-tokens':
          currentTokens = Array.isArray(message.tokens) ? message.tokens : []; currentTokensMapKey = message.mapKey || null; currentTokensShowRings = message.showRings !== undefined ? message.showRings : true;
          broadcast({ type: 'UPDATE_TOKENS', tokens: currentTokens, mapKey: currentTokensMapKey, showRings: currentTokensShowRings }); saveState(); break;
        case 'sync-all-tokens': if (message.tokenState && typeof message.tokenState === 'object') { allTokenStates = message.tokenState; saveState(); } break;
        case 'update-drawing': currentDrawing = Array.isArray(message.strokes) ? message.strokes : []; currentDrawingMapKey = message.mapKey || null; broadcast({ type: 'UPDATE_DRAWING', strokes: currentDrawing, mapKey: currentDrawingMapKey }); saveState(); break;
        case 'trigger-feature':
          if (message.featureId) {
            currentFeatureStates[message.featureId] = 'triggered';
            const feat = currentFeatures.find(f => f.id === message.featureId) || (message.feature || null);
            if (feat) broadcast({ type: 'TRIGGER_FEATURE', feature: feat, allFeatures: currentFeatures, mapKey: message.mapKey || currentTokensMapKey, mapMeta: (currentSceneView && currentSceneView.mapMeta) || currentMapMeta || null });
          } break;
        case 'reset-feature': if (message.featureId) { delete currentFeatureStates[message.featureId]; broadcast({ type: 'RESET_FEATURE', featureId: message.featureId, mapKey: message.mapKey || currentTokensMapKey }); } break;
        case 'update-features':
          currentFeatures = Array.isArray(message.features) ? message.features : []; if (message.mapMeta) currentMapMeta = message.mapMeta;
          if (currentSceneView) { currentSceneView.features = currentFeatures; if (message.mapMeta) currentSceneView.mapMeta = message.mapMeta; }
          for (const client of clients) { if (!dmClients.has(client) && client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'UPDATE_FEATURES', features: currentFeatures, mapKey: currentTokensMapKey, mapMeta: message.mapMeta || null })); }
          saveState(); break;
        case 'update-objects': currentObjectDefs = Array.isArray(message.objects) ? message.objects : []; currentObjectStates = {}; broadcast({ type: 'UPDATE_OBJECTS', objects: currentObjectDefs, objectStates: currentObjectStates }); saveState(); break;
        case 'interact-lightbox-object': {
          const lbId = String(message.objId || ''); const lbState = message.state;
          if (!lbId || !lbState || typeof lbState !== 'object') break;
          broadcast({ type: 'LIGHTBOX_OBJECT_STATE', objId: lbId, state: lbState }); break;
        }
        case 'interact-object': {
          const ioId = String(message.objId || ''); const ioDef = currentObjectDefs.find(o => o.id === ioId);
          if (!ioId || !ioDef) break;
          const st = currentObjectStates[ioId] || { activated: false, currentCol: ioDef.col, currentRow: ioDef.row, currentRotation: 0 };
          if (ioDef.clickAction === 'rotate') {
            const deg = Number(ioDef.rotateDeg) || 90; if (!ioDef.canReset && st.activated) break;
            st.currentRotation = st.activated ? 0 : (st.currentRotation + deg) % 360; st.activated = ioDef.canReset ? !st.activated : true;
          } else {
            if (!ioDef.canReset && st.activated) break;
            if (st.activated) { st.currentCol = ioDef.col; st.currentRow = ioDef.row; } 
            else { st.currentCol = ioDef.targetCol ?? ioDef.col; st.currentRow = ioDef.targetRow ?? ioDef.row; }
            st.activated = ioDef.canReset ? !st.activated : true;
          }
          currentObjectStates[ioId] = st; broadcast({ type: 'OBJECT_STATE_CHANGE', objId: ioId, state: st }); saveState(); break;
        }
        case 'move-object': {
          if (!isDm) break; const moId = String(message.objId || ''); if (!moId) break; const moDef = currentObjectDefs.find(o => o.id === moId); if (!moDef) break;
          const mos = currentObjectStates[moId] || { activated: false, currentCol: moDef.col, currentRow: moDef.row, currentRotation: 0 };
          mos.currentCol = Number(message.col) || mos.currentCol; mos.currentRow = Number(message.row) || mos.currentRow;
          currentObjectStates[moId] = mos; broadcast({ type: 'OBJECT_STATE_CHANGE', objId: moId, state: mos }); saveState(); break;
        }
        case 'lock-player': { const lpName = String(message.name || '').trim().slice(0, 64); if (!lpName) break; lockedPlayers.add(lpName); broadcast({ type: 'MOVEMENT_LOCK', name: lpName, locked: true }); break; }
        case 'unlock-player': { const ulpName = String(message.name || '').trim().slice(0, 64); if (!ulpName) break; lockedPlayers.delete(ulpName); broadcast({ type: 'MOVEMENT_LOCK', name: ulpName, locked: false }); break; }
        case 'lock-all': allPlayersLocked = true; broadcast({ type: 'MOVEMENT_LOCK_ALL', locked: true }); break;
        case 'unlock-all': allPlayersLocked = false; broadcast({ type: 'MOVEMENT_LOCK_ALL', locked: false }); break;
        case 'dm-set-target': {
          const dmTgtName = String(message.player || '').trim().slice(0, 64); const dmTgtTarget = String(message.target || '').trim().slice(0, 64);
          if (dmTgtName) { if (dmTgtTarget) currentTargets[dmTgtName] = dmTgtTarget; else delete currentTargets[dmTgtName]; broadcast({ type: 'SET_TARGET', player: dmTgtName, target: dmTgtTarget || null }); }
          break;
        }
        case 'trigger-attack': {
          const atkAttacker = String(message.attacker || '').trim().slice(0, 64);
          const atkTargets = Array.isArray(message.targets) ? message.targets.map(t => String(t).trim().slice(0, 64)).filter(Boolean) : [];
          if (atkAttacker && atkTargets.length) broadcast({ type: 'ATTACK_ANIMATION', attacker: atkAttacker, targets: atkTargets });
          break;
        }
        case 'toggle-grid': gridEnabled = !gridEnabled; broadcast({ type: 'GRID_TOGGLE', enabled: gridEnabled }); saveState(); break;
        case 'player-login': {
          const loginName = String(message.name || '').trim().slice(0, 64); const loginCls = String(message.cls || '').trim().slice(0, 32);
          if (!loginName || !loginCls) break;
          try {
            const playersPath = path.join(__dirname, 'seeds', 'players.json');
            let players = JSON.parse(fs.readFileSync(playersPath, 'utf8'));
            let player = players.find(p => p.name.toLowerCase() === loginName.toLowerCase());
            if (!player) {
              player = { name: loginName, cls: loginCls, hp: 10, maxHp: 10, tempHp: 0, ac: 10, xp: 0, level: 1, stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, spellSlots: { used: 0, max: 0 }, spells: [] };
              players.push(player); fs.writeFileSync(playersPath, JSON.stringify(players, null, 2));
            }
            ws.playerName = player.name; loggedInPlayers.set(player.name, ws); ws.send(JSON.stringify({ type: 'PLAYER_LOGIN_OK', player }));
            if (allPlayersLocked || lockedPlayers.has(player.name)) ws.send(JSON.stringify({ type: 'MOVEMENT_LOCK', name: player.name, locked: true }));
            const loggedInMsg = JSON.stringify({ type: 'LOGGED_IN_PLAYERS', players: [...loggedInPlayers.keys()] });
            for (const dm of dmClients) { if (dm.readyState === WebSocket.OPEN) dm.send(loggedInMsg); }
            broadcastClientCount(); console.log('Player logged in:', player.name);
          } catch (e) { console.error('player-login error:', e); ws.send(JSON.stringify({ type: 'PLAYER_LOGIN_ERR', error: 'Server error during login.' })); }
          break;
        }
        case 'move-player-token': {
          if (!ws.playerName) break; if (allPlayersLocked || lockedPlayers.has(ws.playerName)) break;
          const tokIdx = currentTokens.findIndex(t => t.label === ws.playerName && t.type === 'player'); if (tokIdx === -1) break;
          const nx = Number(message.x); const ny = Number(message.y); if (isNaN(nx) || isNaN(ny) || nx < 0 || nx > 1 || ny < 0 || ny > 1) break;
          currentTokens[tokIdx] = Object.assign({}, currentTokens[tokIdx], { x: nx, y: ny });
          broadcast({ type: 'UPDATE_TOKENS', tokens: currentTokens, mapKey: currentTokensMapKey, showRings: currentTokensShowRings });
          const autoMeta = currentMapMeta || (currentSceneView && currentSceneView.mapMeta) || null;
          if (autoMeta && autoMeta.cols && autoMeta.rows && currentFeatures.length) {
            const autoCol = Math.floor(nx * autoMeta.cols); const autoRow = Math.floor(ny * autoMeta.rows);
            for (const autoFeat of currentFeatures) {
              if (!autoFeat.autoTrigger) continue; if (currentFeatureStates[autoFeat.id] === 'triggered') continue;
              const hit = (autoFeat.cells || []).some(c => c[0] === autoRow && c[1] === autoCol);
              if (hit) { currentFeatureStates[autoFeat.id] = 'triggered'; broadcast({ type: 'TRIGGER_FEATURE', feature: autoFeat, allFeatures: currentFeatures, mapKey: currentTokensMapKey, mapMeta: autoMeta, autoTriggered: true, triggeredBy: ws.playerName }); }
            }
          }
          break;
        }
        case 'set-target': {
          if (!ws.playerName) break; const tgt = String(message.target || '').trim().slice(0, 64);
          if (tgt) currentTargets[ws.playerName] = tgt; else delete currentTargets[ws.playerName];
          broadcast({ type: 'SET_TARGET', player: ws.playerName, target: tgt || null }); break;
        }
        case 'player-dice-roll': {
          if (!ws.playerName) break; const pdie = parseInt(message.die) || 0; const presult = parseInt(message.result) || 0;
          if (!pdie || presult < 1 || presult > pdie) break;
          const dmRollMsg = JSON.stringify({ type: 'PLAYER_DICE_ROLL', name: ws.playerName, die: pdie, result: presult });
          for (const dm of dmClients) { if (dm.readyState === WebSocket.OPEN) dm.send(dmRollMsg); }
          const anonRollMsg = JSON.stringify({ type: 'DICE_ROLL', die: pdie, result: presult });
          for (const c of clients) { if (c !== ws && c.readyState === WebSocket.OPEN) c.send(anonRollMsg); }
          break;
        }
        case 'request-characters': {
          ws.send(JSON.stringify({ type: 'CHARACTERS_UPDATE', characters: loadCharacters().characters }));
          break;
        }
        case 'claim-character': {
          const data = loadCharacters();
          const ch = data.characters.find(c => c.id === message.characterId);
          if (!ch) break;
          data.characters.forEach(c => {
            if (c.claimedBy === message.playerName) c.claimedBy = null;
          });
          ch.claimedBy = message.playerName || 'player';
          saveCharacters(data);
          broadcast({ type: 'CHARACTERS_UPDATE', characters: data.characters });
          ws.send(JSON.stringify({ type: 'CHARACTER_CLAIMED', character: ch }));
          // Also set playerName for movement etc.
          ws.playerName = ch.name;
          loggedInPlayers.set(ch.name, ws);
          const loggedInMsg = JSON.stringify({ type: 'LOGGED_IN_PLAYERS', players: [...loggedInPlayers.keys()] });
          for (const dm of dmClients) { if (dm.readyState === WebSocket.OPEN) dm.send(loggedInMsg); }
          broadcastClientCount();
          break;
        }
        case 'update-character': {
          const data = loadCharacters();
          const idx = data.characters.findIndex(c => c.id === message.characterId);
          if (idx < 0) break;
          const cur = data.characters[idx];
          const patch = message.patch || {};
          data.characters[idx] = {
            ...cur,
            ...patch,
            stats: { ...cur.stats, ...(patch.stats || {}) },
            modifiers: { ...cur.modifiers, ...(patch.modifiers || {}) },
            spellSlots: patch.spellSlots !== undefined ? patch.spellSlots : cur.spellSlots
          };
          saveCharacters(data);
          broadcast({ type: 'CHARACTERS_UPDATE', characters: data.characters });
          broadcast({ type: 'PLAYER_DATA_UPDATE', player: data.characters[idx] });
          break;
        }
      }
    } catch (err) { console.error('Bad message:', err); }
  });

  ws.on('close', () => {
    clients.delete(ws); dmClients.delete(ws);
    if (ws.playerName) {
      loggedInPlayers.delete(ws.playerName);
      // Release claimed character
      try {
        const data = loadCharacters();
        let changed = false;
        data.characters.forEach(c => {
          if (c.claimedBy === ws.playerName) {
            c.claimedBy = null;
            changed = true;
          }
        });
        if (changed) {
          saveCharacters(data);
          broadcast({ type: 'CHARACTERS_UPDATE', characters: data.characters });
        }
      } catch (e) { console.error('release claim error:', e.message); }
      const loggedInMsg = JSON.stringify({ type: 'LOGGED_IN_PLAYERS', players: [...loggedInPlayers.keys()] });
      for (const dm of dmClients) { if (dm.readyState === WebSocket.OPEN) dm.send(loggedInMsg); }
    }
    console.log('Client disconnected. Total: ' + clients.size);
    broadcastClientCount();
  });
});

app.post('/api/show', requireDm, express.json({ limit: '50mb' }), (req, res) => {
  const { label, data } = req.body;
  currentState.nowShowing = label || '—'; currentState.content = data || '';
  broadcast({ type: 'update', content: currentState.nowShowing, data: currentState.content });
  res.json({ ok: true });
});

app.post('/api/overlay', requireDm, express.json({ limit: '1mb' }), (req, res) => {
  const { title, data, duration, subtype } = req.body;
  broadcast({ type: 'OVERLAY', title: title || '', data: data || '', duration: duration || 10000, subtype: subtype || '' });
  res.json({ ok: true });
});

app.post('/api/dice-roll', requireDm, express.json({ limit: '1mb' }), (req, res) => {
  const die = parseInt(req.body.die) || 20; const result = parseInt(req.body.result) || 1;
  broadcast({ type: 'DICE_ROLL', die, result });
  res.json({ ok: true });
});

app.post('/api/stopaudio', requireDm, (req, res) => { broadcast({ type: 'STOP_AUDIO' }); res.json({ ok: true }); });
app.post('/api/blackout', requireDm, (req, res) => { currentState.blackout = !currentState.blackout; broadcast({ type: 'BLACKOUT', active: currentState.blackout }); res.json({ ok: true, blackout: currentState.blackout }); });

app.post('/api/clear', requireDm, (req, res) => {
  currentState.nowShowing = '—'; currentState.content = ''; currentState.blackout = false;
  broadcast({ type: 'CLEAR' });
  res.json({ ok: true });
});

app.post('/api/clear-scene', requireDm, (req, res) => {
  currentSceneView = null; currentTokens = []; currentTokensMapKey = null; currentDrawing = []; currentDrawingMapKey = null;
  currentFogStates = {}; currentFeatures = []; currentFeatureStates = {};
  broadcast({ type: 'CLEAR_SCENE' });
  res.json({ ok: true });
});

app.get('/api/state', (req, res) => { res.json(currentState); });

const https = require('https');
app.get('/api/bestiary/:file', (req, res) => {
  if (!isDmAuthed(req)) return res.status(401).json({ error: 'Unauthorized' });
  const file = req.params.file;
  if (!/^[\w-]+\.json$/i.test(file)) return res.status(400).end();
  const url = 'https://raw.githubusercontent.com/5etools-mirror-2/5etools-mirror-2.github.io/master/data/bestiary/' + file;
  https.get(url, (upstream) => {
    if (upstream.statusCode !== 200) {
      upstream.resume();
      return res.status(upstream.statusCode).end();
    }
    res.setHeader('Content-Type', 'application/json');
    upstream.pipe(res);
  }).on('error', () => res.status(502).end());
});

app.get('/api/maps', (req, res) => {
  const maps = listFiles('public/assets/maps', ['.jpg', '.jpeg', '.png', '.webp']);
  res.json({ maps });
});

app.get('/api/tiles', (req, res) => {
  const tilesDir = path.join(__dirname, 'public/assets/tiles');
  if (!fs.existsSync(tilesDir)) return res.json({ tiles: [] });
  const files = fs.readdirSync(tilesDir)
    .filter(f => f.toLowerCase().endsWith('.png'))
    .sort();
  res.json({ tiles: files });
});

app.get('/api/audio', (req, res) => {
  const files = listFiles('public/assets/audio', ['.mp3', '.ogg', '.wav']);
  const groups = {};
  files.forEach(f => {
    const name = f.split('/').pop();
    const dash = name.indexOf(' - ');
    const cat  = dash > 0 ? name.slice(0, dash).trim() : 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(f);
  });
  const audio = files;
  const categories = Object.keys(groups).sort().map(cat => ({ cat, files: groups[cat] }));
  res.json({ audio, categories });
});

app.get('/api/scenes', (req, res) => {
  try {
    const scenes = JSON.parse(fs.readFileSync(path.join(__dirname, 'seeds', 'scenes.json'), 'utf8'));
    res.json({ scenes });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load scenes.json' });
  }
});

app.post('/api/scenes', requireDm, express.json({ limit: '1mb' }), (req, res) => {
  try {
    const scenes = req.body.scenes;
    if (!Array.isArray(scenes)) return res.status(400).json({ error: 'scenes must be an array' });
    fs.writeFileSync(path.join(__dirname, 'seeds', 'scenes.json'), JSON.stringify(scenes, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save scenes.json' });
  }
});


// ── Character REST API ────────────────────────────────────────
app.get('/api/characters', (req, res) => {
  res.json(loadCharacters());
});

app.post('/api/characters', requireDm, express.json({ limit: '64kb' }), (req, res) => {
  const data = loadCharacters();
  const body = req.body || {};
  const ch = {
    id: uid(body.name),
    name: String(body.name || 'Unnamed').trim(),
    race: body.race || '',
    cls: body.cls || '',
    stats: Object.assign({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, body.stats || {}),
    modifiers: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    hp: Number(body.maxHp) || 10,
    maxHp: Number(body.maxHp) || 10,
    ac: Number(body.ac) || 10,
    xp: 0,
    hasSpellcasting: !!body.hasSpellcasting,
    spellSlots: body.hasSpellcasting
      ? (body.spellSlots || { '1': { max: Number(body.spellSlots1) || 0, used: 0 } })
      : null,
    claimedBy: null
  };
  data.characters.push(ch);
  saveCharacters(data);
  broadcast({ type: 'CHARACTERS_UPDATE', characters: data.characters });
  res.json(ch);
});

app.put('/api/characters/:id', requireDm, express.json({ limit: '64kb' }), (req, res) => {
  const data = loadCharacters();
  const idx = data.characters.findIndex(c => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  const patch = req.body || {};
  const cur = data.characters[idx];
  data.characters[idx] = {
    ...cur,
    ...patch,
    stats: { ...cur.stats, ...(patch.stats || {}) },
    modifiers: { ...cur.modifiers, ...(patch.modifiers || {}) },
    spellSlots: patch.spellSlots !== undefined ? patch.spellSlots : cur.spellSlots
  };
  saveCharacters(data);
  broadcast({ type: 'CHARACTERS_UPDATE', characters: data.characters });
  broadcast({ type: 'PLAYER_DATA_UPDATE', player: data.characters[idx] });
  res.json(data.characters[idx]);
});

app.delete('/api/characters/:id', requireDm, (req, res) => {
  const data = loadCharacters();
  data.characters = data.characters.filter(c => c.id !== req.params.id);
  saveCharacters(data);
  broadcast({ type: 'CHARACTERS_UPDATE', characters: data.characters });
  res.json({ ok: true });
});

const PLAYERS_FILE = path.join(__dirname, 'seeds', 'players.json');
function loadPlayers() {
  try { return JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8')); } catch { return []; }
}
app.get('/api/players', (req, res) => {
  res.json({ players: loadPlayers() });
});
app.post('/api/players', requireDm, express.json({ limit: '64kb' }), (req, res) => {
  try {
    const players = req.body.players;
    if (!Array.isArray(players)) return res.status(400).json({ error: 'players must be an array' });
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(players, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save players.json' });
  }
});

app.get('/map-builder', requireDm, (req, res) => {
  res.sendFile(path.join(__dirname, 'map-builder', 'index.html'));
});

app.post('/api/map-builder/save', requireDm, express.json({ limit: '50mb' }), (req, res) => {
  try {
    const { dataUrl, filename, state } = req.body;
    if (!dataUrl || !filename) return res.status(400).json({ error: 'dataUrl and filename required' });
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!safeName.match(/\.(png|jpg|jpeg)$/i)) return res.status(400).json({ error: 'filename must end in .png or .jpg' });
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    const destDir = path.join(__dirname, 'public', 'assets', 'maps');
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, safeName), buf);
    if (state && typeof state === 'object') {
      const stateFile = safeName.replace(/\.(png|jpg|jpeg)$/i, '.map.json');
      fs.writeFileSync(path.join(destDir, stateFile), JSON.stringify(state));
    }
    res.json({ ok: true, webPath: '/assets/maps/' + safeName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/map-builder/states', requireDm, (req, res) => {
  const destDir = path.join(__dirname, 'public', 'assets', 'maps');
  if (!fs.existsSync(destDir)) return res.json({ states: [] });
  const states = fs.readdirSync(destDir)
    .filter(f => f.endsWith('.map.json'))
    .map(f => f.replace(/\.map\.json$/, ''));
  res.json({ states });
});

app.get('/api/map-builder/state', requireDm, (req, res) => {
  const name = (req.query.name || '').toString();
  if (!name) return res.status(400).json({ error: 'name required' });
  const safeName = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(__dirname, 'public', 'assets', 'maps', safeName + '.map.json');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'No editable state found for this map' });
  try {
    res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', requireDm, (req, res) => { res.sendFile(path.join(__dirname, 'dm', 'index.html')); });
app.use('/dm', requireDm);
app.get('/remote/player', (req, res) => { res.sendFile(path.join(__dirname, 'remote', 'player.html')); });
app.get('/player', (req, res) => { res.sendFile(path.join(__dirname, 'remote', 'sheet.html')); });
app.get('/tv', (req, res) => { res.sendFile(path.join(__dirname, 'remote', 'player.html')); });
app.get('/api/health', (req, res) => res.json({ app: 'vtt-pocket', ok: true }));
app.get('/api/connection', requireDm, (req, res) => {
  const addresses = Object.values(require('os').networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'));
  res.json({ addresses: [...new Set(addresses.map(i => 'http://' + i.address + ':' + PORT))] });
});

const PORT = Number(process.env.PORT) || 3010;
server.listen(PORT, '0.0.0.0', () => {
  let lanIp = 'localhost';
  try {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    const skipNames = ['loopback', 'vethernet', 'nordlynx', 'nordtun', 'tun', 'tap', 'vpn', 'docker', 'wsl', 'virtual', 'hyper-v'];
    outer: for (const name of Object.keys(ifaces)) {
      if (skipNames.some(s => name.toLowerCase().includes(s))) continue;
      for (const iface of ifaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.')) {
          lanIp = iface.address;
          break outer;
        }
      }
    }
  } catch(_) {}
  console.log('');
  console.log('D&D Remote Server running!');
  console.log('  DM Panel:    http://localhost:' + PORT);
  console.log('  Player View: http://localhost:' + PORT + '/remote/player.html');
  console.log('');
  console.log('  LAN access (other devices):');
  console.log('  Player View: http://' + lanIp + ':' + PORT + '/remote/player.html');
  console.log('');
});