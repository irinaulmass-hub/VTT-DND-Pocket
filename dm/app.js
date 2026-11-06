// ============================================================
//  DM Control Panel — app.js
// ============================================================

// ── Security: HTML escape helper ─────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── State ────────────────────────────────────────────────────
var ws            = null;
var initiative    = [];
var currentTurn   = 0;
var isBlackout    = false;
var sceneData     = [];
var currentTab    = null;
var fogGrid       = null;
var fogRows       = 20;
var fogCols       = 20;
var fogMapUrl     = null;
var activeFogKey  = null;
var currentViewFogKey   = null; // raw fogKey for current view, used by runtime fog toggle
var currentViewImageUrl = null; // image URL for current view
var lastSceneViewPayload = null; // cached for re-sync when server restarts
var lastMapPayload       = null; // last actual map/scene (not Send Image)
var lastSceneWasSentImage = false; // true when Send Image (not a real map) was last sent

// Token overlay state
var tokenState         = {};     // mapKey -> array of {id,x,y,color,label,mobType?}
var activeTokenMapKey  = null;
var selectedTokenColor  = null; // null = placement off
var autoAddToInit       = true;  // toggle: auto-add tokens to initiative
var showPlayerRings     = true;  // toggle: show condition rings on player screen
var fogDeferredInit     = {};    // mapKey -> [{label, roll}] waiting for fog reveal
var selectedMobType     = '';    // current mob type name for token labels
var selectedEnemyName  = '';    // optional named override for enemy placement (e.g. "Klarg")
var selectedFriendName = '';    // optional name for Friend/Unknown token placement
var selectedPlayerName = null;
var addPartyMode       = false; // place entire party on one click
var movePartyMode      = false; // move entire party as one unit
var selectedTokenIds   = new Set(); // token ids selected for group move
var activeTokenMapUrl  = null;

// Player movement lock state (DM-side)
var loggedInPlayersList = [];   // names of currently logged-in players
var playerLockState     = {};   // { name: true/false }
var allPlayersLockedDm  = false;

// Map feature overlay state (DM-side)
var dmMapFeatures   = [];   // feature definitions for current map
var dmMapMeta       = null; // { cols, rows } for current map
var dmTriggeredFeat = {};   // { featureId: true } — which features are triggered

// Moveable objects (DM-side)
var dmObjects      = [];   // object definitions for current map
var dmObjStates    = {};   // objId -> { activated, currentCol, currentRow, currentRotation }
var _dmObjDragging = null; // { objId, startX, startY, startCol, startRow } during drag

// Combat targeting state (DM-side)
var dmTargets = {};  // playerName -> targetLabel
var gridEnabled = false; // DM-toggled grid overlay

// Item token state
var selectedItemType = 'Chest'; // current item type for placement

// ── Mob icons & colours ───────────────────────────────────────
// ── Item icons ───────────────────────────────────────────────
var ITEM_ICONS = {
  'Chest': '🎁', 'Gold': '🪙', 'Potion': '🧪', 'Scroll': '📜',
  'Weapon': '⚔️', 'Shield': '🛡️', 'Armor': '🥋', 'Key': '🗝️',
  'Gem': '💎', 'Staff': '🪄', 'Bow': '🏹', 'Ring': '💍',
  'Book': '📖', 'Lantern': '🪔', 'Barrel': '🛢️', 'Loot': '💰',
  'Trap': '⚙️', 'Door': '🚪', 'Amulet': '📿', 'Food': '🍖',
};

var MOB_ICONS = {
  Bandit: '🗡️', Bugbear: '🐻', Cultist: '🕯️', Dragon: '🐉',
  Drow: '🕷️', 'Gelatinous Cube': '🫧', Ghoul: '👻', Giant: '🏔️',
  Gnoll: '🦴', Goblin: '👺', Guard: '💂', Hobgoblin: '⚔️',
  Kobold: '🦎', Mimic: '📦', Ogre: '🪨', Orc: '🪓',
  Owlbear: '🦉', Skeleton: '💀', Spy: '🕵️', Thug: '👊',
  Troll: '🌲', Vampire: '🧛', Werewolf: '🐺', Wolf: '🐕', Zombie: '🧟',
};
var MOB_COLORS = {
  Bandit: '#92400e', Bugbear: '#7c3aed', Cultist: '#450a0a', Dragon: '#b91c1c',
  Drow: '#312e81', 'Gelatinous Cube': '#4d7c0f', Ghoul: '#374151', Giant: '#6b7280',
  Gnoll: '#78350f', Goblin: '#15803d', Guard: '#1e40af', Hobgoblin: '#9b1c1c',
  Kobold: '#b45309', Mimic: '#854d0e', Ogre: '#6b21a8', Orc: '#14532d',
  Owlbear: '#713f12', Skeleton: '#4b5563', Spy: '#0f766e', Thug: '#b45309',
  Troll: '#44403c', Vampire: '#7f1d1d', Werewolf: '#292524', Wolf: '#44403c', Zombie: '#3d6b47',
};
// ── Player class icons & colours ──────────────────────────────
var MOB_ICONS_CLASS = {
  Rogue: '🗡️', Priest: '✝️', Cleric: '✝️', Sorcerer: '🔮',
  Wizard: '🪄', Fighter: '🛡️', Paladin: '⚔️', Druid: '🌿',
  Ranger: '🏹', Bard: '🎵', Monk: '👊', Barbarian: '💢', FatChub: '🐷',
};
var CLASS_COLORS_DM = {
  Rogue: '#7c3aed', Priest: '#0ea5e9', Cleric: '#0ea5e9', Sorcerer: '#6366f1',
  Wizard: '#4f46e5', Fighter: '#ea580c', Paladin: '#d4af37', Druid: '#16a34a',
  Ranger: '#22c55e', Bard: '#ec4899', Monk: '#f97316', Barbarian: '#dc2626', FatChub: '#ef4444',
};

// Draw / Annotation state
var drawStrokes          = {};    // mapKey -> [{color, width, erase, points:[{x,y}]}]
var activeDrawMapKey     = null;
var drawTool             = { color: '#ef4444', width: 0.006, erase: false };
var drawControlsExpanded = false;
var drawModeActive       = false; // true = annotations canvas active on token map
var tokenMapExpanded     = false; // true = token map shown at full height
var fogMapExpanded       = false; // true = fog of war map shown at full height

// Scene Builder working state
var sbViews       = [];   // array of { label, image, audio }
var sbAudioList   = [];   // populated from /api/audio
var sbEditingId   = null; // id of scene being edited, or null for new

// Search state
var sceneSearchTerm = '';
var audioSearchTerm = '';
var sbCategories    = [];   // cached from /api/audio

// ── DOM refs ─────────────────────────────────────────────────
var statusDot    = document.getElementById('status-dot');
var clientCount  = document.getElementById('client-count');
var clientCountTooltip = document.getElementById('client-count-tooltip');
var clientCountWrap    = document.getElementById('client-count-wrap');
var connectedList = [];

if (clientCountWrap) {
  clientCountWrap.addEventListener('mouseenter', function () {
    if (!clientCountTooltip) return;
    if (!connectedList.length) {
      clientCountTooltip.textContent = 'No players connected';
    } else {
      clientCountTooltip.innerHTML = connectedList.map(function (c) {
        var icon = c.type === 'player' ? '⚔️' : '👤';
        return '<div>' + icon + ' ' + c.name + '</div>';
      }).join('');
    }
    clientCountTooltip.style.display = 'block';
  });
  clientCountWrap.addEventListener('mouseleave', function () {
    if (clientCountTooltip) clientCountTooltip.style.display = 'none';
  });
}
var blackoutBtn  = document.getElementById('blackout-btn');
var clearBtn     = document.getElementById('clear-btn');
var toggleFogBtn = document.getElementById('toggle-fog-btn');
var resendMapBtn = document.getElementById('resend-map-btn');
var sendTextBtn  = document.getElementById('send-text-btn');
var sendImageBtn = document.getElementById('send-image-btn');
var imageFile    = document.getElementById('image-file');
var imagePreview = document.getElementById('image-preview');
var diceResult   = document.getElementById('dice-result');
var initList     = document.getElementById('init-list');

// ============================================================
// WebSocket
// ============================================================
// ============================================================
// DM State Restore (on reconnect / refresh / map-builder return)
// ============================================================
function restoreDmState(msg) {
  // Update player count immediately — most reliable source on reconnect
  if (typeof msg.playerCount === 'number') {
    clientCount.textContent = msg.playerCount + ' connected';
  }
  if (Array.isArray(msg.connectedList)) connectedList = msg.connectedList;

  // Blackout
  if (msg.blackout) {
    isBlackout = true;
    blackoutBtn.classList.add('active');
  } else {
    isBlackout = false;
    blackoutBtn.classList.remove('active');
  }

  if (!msg.sceneView) return; // no active map — nothing to render

  var sv = msg.sceneView;
  var mapKey = sv.mapKey;
  var fogKey = sv.fogKey;

  // Restore playback variables
  lastSceneViewPayload = { action: 'show-scene-view', image: sv.image, audio: sv.audio, audioLoop: sv.audioLoop !== false, fit: sv.fit || 'contain', fogKey: fogKey, mapKey: mapKey, label: sv.label || '' };
  lastMapPayload = lastSceneViewPayload;
  lastSceneWasSentImage = false;
  activeFogKey = fogKey || null;
  currentViewFogKey   = mapKey || fogKey || null;
  currentViewImageUrl = sv.image || null;
  activeTokenMapKey = mapKey || null;

  // Restore fog grid into window.fogStates so renderFogControls picks it up
  if (fogKey && msg.fogStates && msg.fogStates[fogKey]) {
    if (!window.fogStates) window.fogStates = {};
    window.fogStates[fogKey] = msg.fogStates[fogKey];
    fogGrid = window.fogStates[fogKey];
    fogMapUrl = sv.image;
    if (fogGrid && fogGrid.length) {
      fogRows = fogGrid.length;
      fogCols = (fogGrid[0] && fogGrid[0].length) ? fogGrid[0].length : fogCols;
    }
  }

  // Restore token state for the active map
  if (mapKey && msg.tokens && msg.tokens.length) {
    tokenState[mapKey] = msg.tokens;
  }
  // Restore all maps' token states (persisted across restarts)
  if (msg.allTokenStates && typeof msg.allTokenStates === 'object') {
    Object.keys(msg.allTokenStates).forEach(function (k) {
      if (!tokenState[k] || !tokenState[k].length) {
        tokenState[k] = msg.allTokenStates[k];
      }
    });
  }

  // Restore draw strokes
  var drawKey = msg.drawingMapKey || mapKey;
  if (drawKey && msg.drawing && msg.drawing.length) {
    if (!drawStrokes[drawKey]) drawStrokes[drawKey] = [];
    drawStrokes[drawKey] = msg.drawing;
    activeDrawMapKey = drawKey;
  }

  // Restore lock state
  loggedInPlayersList = Array.isArray(msg.loggedInPlayers) ? msg.loggedInPlayers : [];
  allPlayersLockedDm  = !!msg.allPlayersLocked;
  playerLockState     = {};
  if (Array.isArray(msg.lockedPlayers)) {
    msg.lockedPlayers.forEach(function (n) { playerLockState[n] = true; });
  }

  // Show map control panel and set title
  var mapControlGrid  = document.getElementById('map-control-grid');
  var mapControlTitle = document.getElementById('map-control-title');
  if (mapControlGrid) {
    mapControlGrid.style.display = 'grid';
    var hasFog = !!fogKey;
    mapControlGrid.style.gridTemplateColumns = hasFog ? '2fr 1px 3fr' : '1fr';
    var mcgDivider2    = document.getElementById('map-control-divider');
    var fogControlsEl2 = document.getElementById('fog-controls-container');
    if (mcgDivider2)    mcgDivider2.style.display    = hasFog ? '' : 'none';
    if (fogControlsEl2) fogControlsEl2.style.display = hasFog ? '' : 'none';
  }
  if (mapControlTitle) mapControlTitle.textContent = sv.label || (sv.image || '').split('/').pop().replace(/\.[^.]+$/, '') || 'Active Map';

  // Fog controls
  var fogContainer = document.getElementById('fog-controls-container');
  if (fogKey) {
    renderFogControls(sv.image, fogKey);
  } else if (fogContainer) {
    fogContainer.innerHTML = '';
  }

  // Token controls
  renderTokenControls(sv.image, mapKey);

  // Draw controls
  if (!drawStrokes[mapKey]) drawStrokes[mapKey] = [];
  renderDrawControls(sv.image, mapKey);

  // Feature controls — use saved features if available, else re-fetch from map builder
  var featureContainer = document.getElementById('feature-controls-container');
  if (featureContainer) featureContainer.innerHTML = '';
  // Restore combat targets
  if (msg.currentTargets && typeof msg.currentTargets === 'object') {
    dmTargets = msg.currentTargets;
  }
  if (typeof msg.gridEnabled === 'boolean') {
    gridEnabled = msg.gridEnabled;
  }

  if (msg.features && msg.features.length) {
    dmMapFeatures = msg.features;
    dmMapMeta     = sv.mapMeta || null;
    renderFeatureControls(mapKey, msg.features, sv.mapMeta || null);
    updateDmFeatureOverlay();
  } else {
    var mapBaseName = (sv.image || '').replace(/.*\//, '').replace(/\.[^.]+$/, '');
    if (mapBaseName) {
      fetch('/api/map-builder/state?name=' + encodeURIComponent(mapBaseName))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (state) {
          var mapFeatures = (state && Array.isArray(state.features)) ? state.features : [];
          var mapObjects_ = (state && Array.isArray(state.objects)) ? state.objects : [];
          var mapMeta = state ? { cols: state.cols, rows: state.rows } : null;
          dmMapFeatures = mapFeatures;
          dmMapMeta     = mapMeta;
          dmTriggeredFeat = {};
          dmObjects = mapObjects_;
          dmObjStates = {};
          // Re-push features + objects to server so it has them for broadcasts
          wsSend({ action: 'update-features', features: mapFeatures, mapKey: mapKey, mapMeta: mapMeta });
          wsSend({ action: 'update-objects', objects: mapObjects_ });
          renderFeatureControls(mapKey, mapFeatures, mapMeta);
          updateDmFeatureOverlay();
          renderDmObjectLayer();
        })
        .catch(function () {});
    }
  }
  updateFogToggleBtn();
}

function connectWebSocket() {
  var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(protocol + '//' + window.location.host + '/ws');
  ws.onopen = function () {
    statusDot.classList.remove('off');
    statusDot.classList.add('on');
    ws.send(JSON.stringify({ action: 'dm-connect' }));
    // Re-push scene state so server has it for any newly connecting players.
    // This handles server restarts where in-memory state is lost.
    if (lastSceneViewPayload) {
      wsSend(lastSceneViewPayload);
      if (activeFogKey) sendFogUpdate(activeFogKey);
      if (activeTokenMapKey) { sendTokenUpdate(activeTokenMapKey); sendDrawUpdate(activeTokenMapKey); }
    }
  };
  ws.onmessage = function (event) {
    var msg = JSON.parse(event.data);
    if (msg.type === 'auth-required') {
      // Session expired (server restarted). Reload so requireDm redirects to login.
      location.reload();
      return;
    }
    if (msg.type === 'DM_STATE_RESTORE') {
      restoreDmState(msg);
      return;
    }
    if (msg.type === 'clients') {
      clientCount.textContent = msg.count + ' connected';
      if (Array.isArray(msg.connectedList)) connectedList = msg.connectedList;
    }
    if (msg.type === 'BLACKOUT') {
      isBlackout = msg.active;
      blackoutBtn.classList.toggle('active', !!msg.active);
    }
    if (msg.type === 'LOGGED_IN_PLAYERS') {
      loggedInPlayersList = Array.isArray(msg.players) ? msg.players : [];
      if (activeTokenMapKey && activeTokenMapUrl) renderTokenControls(activeTokenMapUrl, activeTokenMapKey);
    }
    if (msg.type === 'MOVEMENT_LOCK') {
      if (msg.name) playerLockState[msg.name] = msg.locked;
      if (activeTokenMapKey && activeTokenMapUrl) renderTokenControls(activeTokenMapUrl, activeTokenMapKey);
    }
    if (msg.type === 'MOVEMENT_LOCK_ALL') {
      allPlayersLockedDm = msg.locked;
      if (activeTokenMapKey && activeTokenMapUrl) renderTokenControls(activeTokenMapUrl, activeTokenMapKey);
    }
    if (msg.type === 'UPDATE_TOKENS') {
      var tkMapKey = msg.mapKey || activeTokenMapKey;
      if (tkMapKey && Array.isArray(msg.tokens)) {
        tokenState[tkMapKey] = msg.tokens;
        // Only re-render if this update is for the currently visible map
        if (tkMapKey === activeTokenMapKey && activeTokenMapUrl) {
          renderTokenControls(activeTokenMapUrl, activeTokenMapKey);
        }
      }
    }
    if (msg.type === 'PLAYER_DICE_ROLL') {
      var logWrap = document.getElementById('player-dice-log-wrap');
      var logDiv  = document.getElementById('player-dice-log');
      if (logDiv) {
        if (logWrap) logWrap.style.display = 'block';
        var isCrit = (msg.die === 20 && msg.result === 20);
        var isFail = (msg.die === 20 && msg.result === 1);
        var entry = document.createElement('div');
        entry.style.cssText = 'font-size:0.78rem;padding:0.2rem 0.4rem;border-radius:3px;margin-bottom:2px;' +
          'background:' + (isCrit ? 'rgba(74,222,128,0.15)' : isFail ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.04)') + ';' +
          'color:' + (isCrit ? '#4ade80' : isFail ? '#f87171' : '#c9d1d9') + ';' +
          'border-left:3px solid ' + (isCrit ? '#4ade80' : isFail ? '#f87171' : '#374151') + ';';
        entry.textContent = msg.name + ' rolled d' + msg.die + ': ' + msg.result +
          (isCrit ? ' \uD83C\uDF1F CRIT!' : isFail ? ' \uD83D\uDC80 FAIL' : '');
        logDiv.appendChild(entry);
        logDiv.scrollTop = logDiv.scrollHeight;
        setTimeout(function () {
          if (entry.parentNode) entry.parentNode.removeChild(entry);
          if (logDiv.children.length === 0 && logWrap) logWrap.style.display = 'none';
        }, 20000);
      }
      return;
    }
    if (msg.type === 'SET_TARGET') {
      if (msg.player) {
        if (msg.target) {
          dmTargets[msg.player] = msg.target;
        } else {
          delete dmTargets[msg.player];
        }
        renderInitiative();
        if (activeTokenMapKey && activeTokenMapUrl) renderTokenControls(activeTokenMapUrl, activeTokenMapKey);
      }
      return;
    }
    if (msg.type === 'ATTACK_ANIMATION') {
      // DM map animation is now played locally in playDmAttackAnimation() — skip WS echo
      return;
    }
    if (msg.type === 'GRID_TOGGLE') {
      gridEnabled = !!msg.enabled;
      if (activeTokenMapKey && activeTokenMapUrl) renderTokenControls(activeTokenMapUrl, activeTokenMapKey);
      return;
    }
    // Auto-trigger: server fires TRIGGER_FEATURE when a player token touches an auto-trigger feature
    if (msg.type === 'TRIGGER_FEATURE' && msg.autoTriggered && msg.feature) {
      var atFeat = msg.feature;
      dmTriggeredFeat[atFeat.id] = true;
      updateDmFeatureOverlay();
      // Update the rendered card buttons if visible
      var card = document.getElementById('feat-card-' + atFeat.id);
      if (card) {
        var tBtn = card.querySelector('.btn-danger');
        var rBtn = card.querySelector('.btn-secondary');
        if (tBtn) { tBtn.disabled = true; tBtn.textContent = '✓ Triggered'; tBtn.style.opacity = '0.55'; }
        if (rBtn) { rBtn.disabled = false; rBtn.style.opacity = '1'; }
      }
      return;
    }
    if (msg.type === 'UPDATE_OBJECTS') {
      dmObjects    = Array.isArray(msg.objects) ? msg.objects : [];
      dmObjStates  = (msg.objectStates && typeof msg.objectStates === 'object') ? msg.objectStates : {};
      renderDmObjectLayer();
      return;
    }
    if (msg.type === 'OBJECT_STATE_CHANGE') {
      if (msg.objId && msg.state) {
        dmObjStates[msg.objId] = msg.state;
        renderDmObjectLayer();
      }
      return;
    }
    // ── Party Manager updates ─────────────────────────────────
    if (msg.type === 'PLAYER_LOGIN_OK' || msg.type === 'PLAYER_DATA_UPDATE') {
      if (msg.player && msg.player.name) {
        upsertPartyPlayer(msg.player);
        renderParty();
      }
      return;
    }
    if (msg.type === 'PLAYER_LOGOUT' || msg.type === 'PLAYER_DISCONNECTED') {
      if (msg.name || (msg.player && msg.player.name)) {
        var leaveName = msg.name || msg.player.name;
        var p = partyPlayers.find(function (x) { return x.name === leaveName; });
        if (p) {
          p.online = false;
          renderParty();
        }
      }
      return;
    }
    // Character system
    if (msg.type === 'CHARACTERS_UPDATE') {
      characterRoster = msg.characters || [];
      if (typeof renderCharacterRoster === 'function') renderCharacterRoster();
      if (typeof renderCharacterSheets === 'function') renderCharacterSheets();
      return;
    }
    if (msg.type === 'PLAYER_DATA_UPDATE' && msg.player && typeof characterRoster !== 'undefined') {
      var idx = characterRoster.findIndex(function (c) {
        return c.id === msg.player.id || c.name === msg.player.name;
      });
      if (idx >= 0) characterRoster[idx] = Object.assign({}, characterRoster[idx], msg.player);
      else if (msg.player.id) characterRoster.push(msg.player);
      if (typeof renderCharacterSheets === 'function') renderCharacterSheets();
      if (typeof renderCharacterRoster === 'function') renderCharacterRoster();
    }
  };
  ws.onclose = function () {
    statusDot.classList.remove('on');
    statusDot.classList.add('off');
    setTimeout(connectWebSocket, 3000);
  };
  ws.onerror = function () {};
}

function wsSend(data) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

// ============================================================
// Quick Actions
// ============================================================
blackoutBtn.addEventListener('click', function () {
  fetch('/api/blackout', { method: 'POST' });
});
clearBtn.addEventListener('click', function () {
  isBlackout = false;
  blackoutBtn.classList.remove('active');
  if (lastSceneWasSentImage) {
    // Clear the scene image from players, then also clear overlays
    fetch('/api/clear-scene', { method: 'POST' });
    fetch('/api/clear', { method: 'POST' });
    lastSceneViewPayload = null;
    lastMapPayload = null;
    lastSceneWasSentImage = false;
  } else {
    fetch('/api/clear', { method: 'POST' });
  }
});
resendMapBtn.addEventListener('click', function () {
  if (!lastMapPayload) return;
  wsSend(lastMapPayload);
  if (activeFogKey) sendFogUpdate(activeFogKey);
  if (activeTokenMapKey) { sendTokenUpdate(activeTokenMapKey); sendDrawUpdate(activeTokenMapKey); }
});

if (toggleFogBtn) toggleFogBtn.addEventListener('click', toggleMapFog);

document.getElementById('reset-map-btn').addEventListener('click', function () {
  // Wipe server scene state
  fetch('/api/clear-scene', { method: 'POST' });
  // Reset DM in-memory state — including fog/token/draw overlays so they don't bleed into the next map load
  lastSceneViewPayload = null;
  lastMapPayload = null;
  lastSceneWasSentImage = false;
  activeFogKey = null;
  currentViewFogKey   = null;
  currentViewImageUrl = null;
  activeTokenMapKey = null;
  activeDrawMapKey = null;
  window.fogStates = {};   // clear all cached fog grids
  fogGrid = null;
  fogMapUrl = null;
  drawStrokes = {};        // clear all annotation strokes
  tokenState = {};         // clear all token positions
  dmMapFeatures   = [];    // clear feature overlay state
  dmMapMeta       = null;
  dmTriggeredFeat = {};
  dmObjects       = [];
  dmObjStates     = {};
  // Collapse the map control panel
  var mapControlGrid  = document.getElementById('map-control-grid');
  var mapControlTitle = document.getElementById('map-control-title');
  if (mapControlGrid)  mapControlGrid.style.display = 'none';
  if (mapControlTitle) mapControlTitle.textContent = 'no map active';
  // Clear all rendered sub-panels
  var els = ['fog-controls-container','token-controls-container','token-map-container','draw-controls-container','feature-controls-container'];
  els.forEach(function (id) { var el = document.getElementById(id); if (el) el.innerHTML = ''; });
  updateFogToggleBtn();
});

document.getElementById('send-text-popup-btn').addEventListener('click', function () {
  showSendTextPopup(this);
});
document.getElementById('send-image-popup-btn').addEventListener('click', function () {
  showSendImagePopup(this);
});

// ============================================================
// Send Text (hidden panel — kept for element ID compatibility)
// ============================================================
sendTextBtn.addEventListener('click', function () {
  var label = document.getElementById('text-label').value.trim();
  var raw   = document.getElementById('text-content').value.trim();
  if (!raw) return;
  var html = raw.replace(/\n/g, '<br>');
  fetch('/api/overlay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: label || '', data: html, duration: 15000 })
  });
});

// ============================================================
// Send Image — populate map library dropdown
// ============================================================
(function loadMapDropdown() {
  fetch('/api/maps')
    .then(function (r) { return r.json(); })
    .catch(function () { return { maps: [] }; })
    .then(function (data) {
      var sel = document.getElementById('image-map-select');
      if (!sel) return;
      (data.maps || []).forEach(function (url) {
        var label = url.split('/').pop().replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        var opt = document.createElement('option');
        opt.value = url;
        opt.textContent = label;
        sel.appendChild(opt);
      });
    });
})();

document.getElementById('image-map-select').addEventListener('change', function () {
  var url = this.value;
  if (!url) return;
  document.getElementById('image-url').value = url;
  imagePreview.innerHTML = '<img src="' + url + '" />';
  // Clear file picker so it doesn't conflict
  imageFile.value = '';
});

// ============================================================
// Send Image — auto-fill URL from file picker
// ============================================================
imageFile.addEventListener('change', function (e) {
  var file = e.target.files[0];
  if (!file) return;
  // Clear dropdown so it doesn't conflict
  var sel = document.getElementById('image-map-select');
  if (sel) sel.value = '';
  document.getElementById('image-url').value = '/assets/maps/' + file.name;
  imagePreview.innerHTML = '<img src="' + URL.createObjectURL(file) + '" />';
});

sendImageBtn.addEventListener('click', function () {
  var label = document.getElementById('image-label').value.trim();
  var url   = document.getElementById('image-url').value.trim();
  if (url) {
    sendImage(label || 'Image', url);
  } else if (imageFile.files[0]) {
    var reader = new FileReader();
    reader.onload = function (ev) { sendImage(label || imageFile.files[0].name, ev.target.result); };
    reader.readAsDataURL(imageFile.files[0]);
  }
});

function sendImage(label, src) {
  // Show the image full-screen on the player view (same as a scene map, no fog/tokens/audio)
  lastSceneViewPayload = { action: 'show-scene-view', image: src, fit: 'contain', audio: null, fogKey: null, mapKey: null, audioLoop: false };
  lastSceneWasSentImage = true;
  wsSend(lastSceneViewPayload);
}

// ============================================================
// Maps & Scenes Panel
// ============================================================
function autoIcon(name) {
  var n = (name || '').toLowerCase();
  if (/cave|mine|tunnel|underground|dungeon/.test(n)) return '🪨';
  if (/forest|woods|grove|tree|jungle/.test(n)) return '🌲';
  if (/town|village|city|inn|tavern|market|phandalin|shop/.test(n)) return '🏘️';
  if (/temple|shrine|church|chapel/.test(n)) return '⛪';
  if (/battle|war|combat|siege/.test(n)) return '⚔️';
  if (/sea|coast|ocean|river|lake|water/.test(n)) return '🌊';
  if (/castle|keep|tower|fort/.test(n)) return '🏰';
  if (/camp|wilderness|road|trail/.test(n)) return '⛺';
  if (/swamp|marsh|bog/.test(n)) return '🌿';
  if (/mountain|peak|cliff/.test(n)) return '🏔️';
  return '🗺️';
}

// Renders a single scene group (title row + view rows with chain dropdown)
function renderSceneGroup(container, scene, sIdx) {
  var sceneDiv = document.createElement('div');
  sceneDiv.className = 'scene-group';

  // Persist collapsed state per scene id across re-renders
  var collapseKey = 'scene-collapsed-' + (scene.id || sIdx);
  var isCollapsed = sessionStorage.getItem(collapseKey) === '1';

  var titleRow = document.createElement('div');
  titleRow.className = 'scene-title';
  titleRow.style.cursor = 'pointer';
  titleRow.title = 'Click to collapse / expand';

  // Chevron
  var chev = document.createElement('span');
  chev.style.cssText = 'font-size:0.6rem;color:#888;margin-right:4px;display:inline-block;transition:transform 0.15s;flex-shrink:0;';
  chev.textContent = '▾';
  if (isCollapsed) chev.style.transform = 'rotate(-90deg)';
  titleRow.appendChild(chev);
  var firstViewImg = scene.views && scene.views.length ? scene.views[0].image : '';
  if (firstViewImg) {
    var sceneThumb = document.createElement('img');
    sceneThumb.src = firstViewImg;
    sceneThumb.style.cssText = 'width:32px;height:32px;object-fit:cover;border-radius:4px;flex-shrink:0;';
    titleRow.appendChild(sceneThumb);
  }
  titleRow.appendChild(document.createTextNode(scene.label));

  var delBtn = document.createElement('button');
  delBtn.textContent = '🗑';
  delBtn.title = 'Delete scene';
  delBtn.className = 'btn btn-danger btn-small';
  delBtn.style.marginLeft = 'auto';
  delBtn.onclick = (function (id) {
    return function () {
      if (!confirm('Delete "' + scene.label + '"?')) return;
      var remaining = sceneData.filter(function (s) { return s.id !== id; });
      fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes: remaining })
      }).then(function () { currentTab = null; renderScenesPanel(); });
    };
  })(scene.id);

  var editBtn = document.createElement('button');
  editBtn.textContent = '✏️';
  editBtn.title = 'Edit scene';
  editBtn.className = 'btn btn-secondary btn-small';
  editBtn.onclick = (function (si) {
    return function () { editScene(si); };
  })(sIdx);
  var sceneActions = document.createElement('div');
  sceneActions.className = 'scene-actions';
  sceneActions.appendChild(editBtn);
  sceneActions.appendChild(delBtn);
  titleRow.appendChild(sceneActions);
  sceneDiv.appendChild(titleRow);

  // Views wrapper — collapsible
  var viewsWrap = document.createElement('div');
  viewsWrap.style.display = isCollapsed ? 'none' : '';

  // Toggle on title click (but not on action buttons)
  titleRow.addEventListener('click', function (e) {
    if (e.target.closest('.btn')) return;
    var nowCollapsed = viewsWrap.style.display !== 'none';
    viewsWrap.style.display = nowCollapsed ? 'none' : '';
    chev.style.transform = nowCollapsed ? 'rotate(-90deg)' : '';
    sessionStorage.setItem(collapseKey, nowCollapsed ? '1' : '0');
  });

  scene.views.forEach(function (view, vIdx) {
    // In search mode, views may carry _origIdx (their position in the real scene.views array)
    var realVIdx = (view._origIdx !== undefined) ? view._origIdx : vIdx;
    var row = document.createElement('div');
    row.className = 'view-row';

    // Line 1: thumb + label + audio indicator
    var rowTop = document.createElement('div');
    rowTop.className = 'view-row-top';

    var thumb = document.createElement('img');
    thumb.src = view.image;
    thumb.className = 'view-thumb';
    rowTop.appendChild(thumb);

    var lbl = document.createElement('span');
    lbl.textContent = view.label;
    lbl.className = 'view-label';
    rowTop.appendChild(lbl);

    if (view.fog) {
      var fogIcon = document.createElement('span');
      fogIcon.textContent = '🌫️';
      fogIcon.title = 'Fog of War enabled';
      fogIcon.style.cssText = 'cursor:help;flex-shrink:0;font-size:0.9rem;';
      rowTop.appendChild(fogIcon);
    }

    if (view.audio) {
      var audioIcon = document.createElement('span');
      audioIcon.textContent = '🎵';
      audioIcon.title = 'Ambience: ' + view.audio.split('/').pop();
      audioIcon.style.cssText = 'cursor:help;flex-shrink:0;font-size:0.9rem;';
      rowTop.appendChild(audioIcon);

      var loopToggle = document.createElement('button');
      var isLoop = view.audioLoop !== false;
      loopToggle.textContent = isLoop ? '🔁' : '▶️';
      loopToggle.title = isLoop ? 'Ambience loops — click to play once' : 'Ambience plays once — click to loop';
      loopToggle.className = 'btn btn-small';
      loopToggle.style.cssText = 'padding:0.1rem 0.3rem;font-size:0.75rem;background:transparent;border:1px solid #555;margin-left:2px;';
      loopToggle.onclick = (function (si, vi2, btn) {
        return function (e) {
          e.stopPropagation();
          var scene = sceneData[si];
          var v = scene.views[vi2];
          v.audioLoop = !(v.audioLoop !== false);
          btn.textContent = v.audioLoop ? '🔁' : '▶️';
          btn.title = v.audioLoop ? 'Ambience loops — click to play once' : 'Ambience plays once — click to loop';
          fetch('/api/scenes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scenes: sceneData })
          });
        };
      })(sIdx, realVIdx, loopToggle);
      rowTop.appendChild(loopToggle);
    }
    row.appendChild(rowTop);

    // Line 2: Show + fit toggle + chain dropdown
    var rowBtns = document.createElement('div');
    rowBtns.className = 'view-row-btns';

    var fitModes = ['contain', 'cover', 'fill'];
    var fitLabels = { contain: '📐 Fit', cover: '🔲 Cover', fill: '⬜ Fill' };
    var curFit = view.fit || 'contain';
    var fitBtn = document.createElement('button');
    fitBtn.textContent = fitLabels[curFit];
    fitBtn.title = 'Fit: contain (letterbox) | Cover: crop to fill | Fill: stretch';
    fitBtn.className = 'btn btn-small';
    fitBtn.style.cssText = 'font-size:0.7rem;background:transparent;border:1px solid #555;flex:none;width:auto;';
    fitBtn.onclick = (function (si, vi2, btn) {
      return function (e) {
        e.stopPropagation();
        var v = sceneData[si].views[vi2];
        var idx = fitModes.indexOf(v.fit || 'contain');
        v.fit = fitModes[(idx + 1) % fitModes.length];
        btn.textContent = fitLabels[v.fit];
        fetch('/api/scenes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenes: sceneData })
        });
      };
    })(sIdx, realVIdx, fitBtn);
    rowBtns.appendChild(fitBtn);

    var showBtn = document.createElement('button');
    showBtn.textContent = '▶ Show';
    showBtn.className = 'btn btn-primary btn-small';
    showBtn.onclick = (function (si, vi) {
      return function () { showSceneView(si, vi); };
    })(sIdx, realVIdx);
    rowBtns.appendChild(showBtn);

    // Chain dropdown — only show when scene has more than one view
    // Use the full original scene.views list so chain targets are always correct
    var originalViews = sceneData[sIdx] ? sceneData[sIdx].views : scene.views;
    if (originalViews.length > 1) {
      var chainSel = document.createElement('select');
      chainSel.className = 'chain-select';
      var defOpt = document.createElement('option');
      defOpt.value = '';
      defOpt.textContent = '⛓ Chain to…';
      chainSel.appendChild(defOpt);
      originalViews.forEach(function (v, vi2) {
        if (vi2 === realVIdx) return;
        var opt = document.createElement('option');
        opt.value = vi2;
        opt.textContent = v.label || ('Map ' + (vi2 + 1));
        chainSel.appendChild(opt);
      });
      rowBtns.appendChild(chainSel);

      var goBtn = document.createElement('button');
      goBtn.textContent = '→ Go';
      goBtn.className = 'btn btn-secondary btn-small';
      goBtn.onclick = (function (si, sel) {
        return function () {
          var vi = parseInt(sel.value);
          if (!isNaN(vi) && vi >= 0) showSceneView(si, vi);
        };
      })(sIdx, chainSel);
      rowBtns.appendChild(goBtn);
    }

    row.appendChild(rowBtns);
    viewsWrap.appendChild(row);
  });

  sceneDiv.appendChild(viewsWrap);
  container.appendChild(sceneDiv);
}

function renderScenesPanel() {
  var term = (sceneSearchTerm || '').toLowerCase().trim();
  fetch('/api/scenes')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      sceneData = data.scenes || [];
      var mapList = document.getElementById('map-list');
      mapList.innerHTML = '';

      if (!sceneData.length) {
        mapList.innerHTML = '<p style="color:#888;font-size:0.85rem;">No scenes yet — use the Scene Builder below.</p>';
        return;
      }

      // ── Search mode: show matching scenes/views regardless of tab ──
      if (term) {
        var hits = [];
        sceneData.forEach(function (scene, sIdx) {
          var tabMatch   = (scene.tab   || '').toLowerCase().indexOf(term) !== -1;
          var labelMatch = (scene.label || '').toLowerCase().indexOf(term) !== -1;
          // If area or scene name matches → show whole scene with all views
          if (tabMatch || labelMatch) {
            hits.push({ scene: scene, sIdx: sIdx, filteredViews: null });
            return;
          }
          // Otherwise filter to only views whose label matches
          // Attach _origIdx so renderSceneGroup uses the correct index into sceneData
          var matchingViews = [];
          (scene.views || []).forEach(function (v, origIdx) {
            if ((v.label || '').toLowerCase().indexOf(term) !== -1) {
              var copy = Object.assign({}, v, { _origIdx: origIdx });
              matchingViews.push(copy);
            }
          });
          if (matchingViews.length) {
            hits.push({ scene: scene, sIdx: sIdx, filteredViews: matchingViews });
          }
        });

        if (!hits.length) {
          mapList.innerHTML = '<p style="color:#888;font-size:0.85rem;">No results for &ldquo;' + escHtml(sceneSearchTerm) + '&rdquo;</p>';
          return;
        }
        var totalViews = hits.reduce(function (n, h) {
          return n + (h.filteredViews ? h.filteredViews.length : (h.scene.views || []).length);
        }, 0);
        var info = document.createElement('div');
        info.style.cssText = 'font-size:0.75rem;color:#888;margin-bottom:0.5rem;';
        info.textContent = totalViews + ' map' + (totalViews !== 1 ? 's' : '') + ' in ' +
          hits.length + ' scene' + (hits.length !== 1 ? 's' : '') + ' for "' + sceneSearchTerm + '"';
        mapList.appendChild(info);
        hits.forEach(function (h) {
          // For view-only hits, render a synthetic scene with just the matching views
          var sceneToRender = h.filteredViews
            ? Object.assign({}, h.scene, { views: h.filteredViews })
            : h.scene;
          renderSceneGroup(mapList, sceneToRender, h.sIdx);
        });
        return;
      }

      // ── Normal tab mode ──
      var tabs = [];
      sceneData.forEach(function (s) {
        var t = s.tab || s.label;
        if (tabs.indexOf(t) === -1) tabs.push(t);
      });
      if (!currentTab || tabs.indexOf(currentTab) === -1) currentTab = tabs[0];

      var tabBar = document.createElement('div');
      tabBar.className = 'tab-bar';
      tabs.forEach(function (tab) {
        var firstImg = '';
        sceneData.forEach(function (s) {
          if ((s.tab || s.label) === tab && !firstImg && s.views && s.views.length) firstImg = s.views[0].image;
        });
        var btn = document.createElement('button');
        btn.className = 'btn btn-small tab-btn ' + (tab === currentTab ? 'btn-primary' : 'btn-secondary');
        if (firstImg) {
          var tImg = document.createElement('img');
          tImg.src = firstImg;
          tImg.style.cssText = 'width:22px;height:22px;object-fit:cover;border-radius:3px;margin-right:5px;vertical-align:middle;flex-shrink:0;';
          btn.appendChild(tImg);
        }
        btn.appendChild(document.createTextNode(tab));
        btn.onclick = function () {
          if (activeFogKey) {
            wsSend({ action: 'update-fog', fogKey: activeFogKey, fogGrid: null });
            activeFogKey = null;
          }
          document.getElementById('fog-controls-container').innerHTML = '';
          document.getElementById('token-controls-container').innerHTML = '';
          var dcEl = document.getElementById('draw-controls-container');
          if (dcEl) dcEl.innerHTML = '';
          var fcEl = document.getElementById('feature-controls-container');
          if (fcEl) fcEl.innerHTML = '';
          var mcg = document.getElementById('map-control-grid');
          if (mcg) mcg.style.display = 'none';
          var mct = document.getElementById('map-control-title');
          if (mct) mct.textContent = 'no map active';
          currentTab = tab;
          renderScenesPanel();
        };
        tabBar.appendChild(btn);
      });
      mapList.appendChild(tabBar);

      sceneData.forEach(function (scene, sIdx) {
        if ((scene.tab || scene.label) !== currentTab) return;
        renderSceneGroup(mapList, scene, sIdx);
      });
    })
    .catch(function (e) {
      document.getElementById('map-list').textContent = 'Error loading scenes: ' + e.message;
    });
}

// ── Fog toggle helpers ────────────────────────────────────────────────────────
function updateFogToggleBtn() {
  var btn = document.getElementById('toggle-fog-btn');
  if (!btn) return;
  btn.style.display = currentViewFogKey ? '' : 'none';
  var on = !!activeFogKey;
  btn.textContent    = on ? '🌫 Fog: ON' : '🌫 Fog';
  btn.style.background  = on ? '#1d4a1d' : '';
  btn.style.borderColor = on ? '#22c55e' : '';
  btn.style.color       = on ? '#86efac' : '';
}

function toggleMapFog() {
  if (!currentViewFogKey) return;
  var mapControlGrid = document.getElementById('map-control-grid');
  var mcgDivider     = document.getElementById('map-control-divider');
  var fogControlsEl  = document.getElementById('fog-controls-container');
  if (activeFogKey) {
    // ── Turn fog OFF ───────────────────────────────────────────
    wsSend({ action: 'update-fog', fogKey: activeFogKey, fogGrid: null });
    wsSend({ action: 'set-fog-key', fogKey: null });
    activeFogKey = null;
    if (lastSceneViewPayload) lastSceneViewPayload.fogKey = null;
    if (fogControlsEl) fogControlsEl.innerHTML = '';
    if (fogControlsEl) fogControlsEl.style.display = 'none';
    if (mcgDivider)    mcgDivider.style.display    = 'none';
    if (mapControlGrid) mapControlGrid.style.gridTemplateColumns = '1fr';
  } else {
    // ── Turn fog ON ────────────────────────────────────────────
    activeFogKey = currentViewFogKey;
    if (lastSceneViewPayload) lastSceneViewPayload.fogKey = activeFogKey;
    if (fogControlsEl) fogControlsEl.style.display = '';
    if (mcgDivider)    mcgDivider.style.display    = '';
    if (mapControlGrid) mapControlGrid.style.gridTemplateColumns = '2fr 1px 3fr';
    renderFogControls(currentViewImageUrl, activeFogKey);
    sendFogUpdate(activeFogKey);
    wsSend({ action: 'set-fog-key', fogKey: activeFogKey });
  }
  updateFogToggleBtn();
}

function showSceneView(sceneIdx, viewIdx) {
  var scene  = sceneData[sceneIdx];
  var view   = scene.views[viewIdx];
  var fogKey = view.id || (sceneIdx + '-' + viewIdx);
  currentViewFogKey   = fogKey;
  currentViewImageUrl = view.image;
  var useFog = view.fog === true;
  var newFogKey = useFog ? fogKey : null;

  // If switching away from a fog scene, clear the player's fog overlay
  if (activeFogKey && activeFogKey !== newFogKey) {
    wsSend({ action: 'update-fog', fogKey: activeFogKey, fogGrid: null });
  }
  activeFogKey = newFogKey;

  // Stop any playing audio before switching scene view
  wsSend({ action: 'stop-audio' });

  // Pass fogKey (fog) and mapKey (tokens) so player can correlate overlays
  lastSceneViewPayload = { action: 'show-scene-view', image: view.image, audio: view.audio || null, audioLoop: view.audioLoop !== false, fit: view.fit || 'contain', fogKey: useFog ? fogKey : null, mapKey: fogKey, label: view.label || '' };
  lastSceneWasSentImage = false;
  lastMapPayload = lastSceneViewPayload;
  wsSend(lastSceneViewPayload);

  // Only show fog controls if this view has fog enabled
  var fogContainer = document.getElementById('fog-controls-container');
  if (useFog) {
    renderFogControls(view.image, fogKey);
    // Send initial fog state immediately so player screen shows fog on Show
    sendFogUpdate(fogKey);
  } else {
    fogContainer.innerHTML = '';
  }

  // Always show token controls for the active map
  renderTokenControls(view.image, fogKey);
  // Immediately sync tokens for this map (may be empty, which clears any old tokens on players)
  sendTokenUpdate(fogKey);

  // Draw / annotation controls — reset collapsed state on new map
  if (activeDrawMapKey !== fogKey) { drawControlsExpanded = false; drawModeActive = false; }
  renderDrawControls(view.image, fogKey);
  sendDrawUpdate(fogKey);

  // Show the Map Control panel and label it with the view name
  var mapControlGrid  = document.getElementById('map-control-grid');
  var mapControlTitle = document.getElementById('map-control-title');
  if (mapControlGrid) {
    mapControlGrid.style.display = 'grid';
    mapControlGrid.style.gridTemplateColumns = useFog ? '2fr 1px 3fr' : '1fr';
    var mcgDivider    = document.getElementById('map-control-divider');
    var fogControlsEl = document.getElementById('fog-controls-container');
    if (mcgDivider)    mcgDivider.style.display    = useFog ? '' : 'none';
    if (fogControlsEl) fogControlsEl.style.display = useFog ? '' : 'none';
  }
  if (mapControlTitle) { mapControlTitle.textContent = view.label || 'Active Map'; }
  updateFogToggleBtn();

  // Feature controls — async fetch map state to get saved features
  var featureContainer = document.getElementById('feature-controls-container');
  if (featureContainer) featureContainer.innerHTML = '';
  var mapBaseName = (view.image || '').replace(/.*\//, '').replace(/\.[^.]+$/, '');
  if (mapBaseName) {
    fetch('/api/map-builder/state?name=' + encodeURIComponent(mapBaseName))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (state) {
        var mapFeatures = (state && Array.isArray(state.features)) ? state.features : [];
        var mapObjs_  = (state && Array.isArray(state.objects)) ? state.objects : [];
        var mapMeta = state ? { cols: state.cols, rows: state.rows } : null;
        // Store on DM side so feature overlay can show cell positions
        dmMapFeatures   = mapFeatures;
        dmMapMeta       = mapMeta;
        dmTriggeredFeat = {};
        dmObjects   = mapObjs_;
        dmObjStates = {};
        // Push feature definitions + objects to server so reconnecting players receive them
        wsSend({ action: 'update-features', features: mapFeatures, mapKey: fogKey, mapMeta: mapMeta });
        wsSend({ action: 'update-objects', objects: mapObjs_ });
        renderFeatureControls(fogKey, mapFeatures, mapMeta);
        updateDmFeatureOverlay();
        renderDmObjectLayer();
      })
      .catch(function () { /* no state file — map may not be from builder */ });
  }
}

// ============================================================
// Draw / Annotation Controls
// ============================================================
function sendDrawUpdate(mapKey) {
  wsSend({ action: 'update-drawing', strokes: drawStrokes[mapKey] || [], mapKey: mapKey });
}

function renderDrawControls(mapUrl, mapKey) {
  activeDrawMapKey = mapKey;
  if (!drawStrokes[mapKey]) drawStrokes[mapKey] = [];

  var container = document.getElementById('draw-controls-container');
  if (!container) return;
  container.innerHTML = '';

  // ── Header row with Draw Mode toggle ─────────────────────────
  var strokeCount = (drawStrokes[mapKey] || []).length;
  var headerRow = document.createElement('div');
  headerRow.style.cssText = 'display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;' +
    'padding:0.5rem 0;border-top:1px solid #21262d;';

  var strokeBadge = strokeCount
    ? '<span style="color:#facc15;font-size:0.7rem;margin-left:0.25rem;">(' + strokeCount + ' stroke' + (strokeCount !== 1 ? 's' : '') + ')</span>'
    : '';
  var headerLabel = document.createElement('span');
  headerLabel.style.cssText = 'color:#aaa;font-size:0.8rem;user-select:none;';
  headerLabel.innerHTML = '✏️ Annotations' + strokeBadge;
  headerRow.appendChild(headerLabel);

  // Draw mode toggle button — activates/deactivates the canvas on the token map
  var drawToggleBtn = document.createElement('button');
  drawToggleBtn.textContent = drawModeActive ? '🖊 Draw Mode ON' : '🖊 Draw Mode OFF';
  drawToggleBtn.style.cssText = [
    'flex:none', 'white-space:nowrap', 'padding:0.25rem 0.75rem',
    'font-size:0.78rem', 'font-weight:bold', 'border-radius:4px', 'cursor:pointer',
    'border:2px solid ' + (drawModeActive ? '#facc15' : '#555'),
    'color:' + (drawModeActive ? '#facc15' : '#888'),
    'background:' + (drawModeActive ? 'rgba(250,204,21,0.12)' : 'transparent'),
    drawModeActive ? 'box-shadow:0 0 6px rgba(250,204,21,0.4)' : ''
  ].join(';') + ';';
  drawToggleBtn.onclick = function () {
    drawModeActive = !drawModeActive;
    renderTokenControls(mapUrl, mapKey);
    renderDrawControls(mapUrl, mapKey);
  };
  headerRow.appendChild(drawToggleBtn);

  container.appendChild(headerRow);
  if (!drawModeActive) return; // tools only shown when draw mode is on

  // ── Tool row ─────────────────────────────────────────────────
  var toolRow = document.createElement('div');
  toolRow.style.cssText = 'display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.4rem;align-items:center;';

  var colorOpts = [
    { color: '#ef4444', label: '🔴 Red'    },
    { color: '#facc15', label: '🟡 Yellow' },
    { color: '#ffffff', label: '⚪ White'  },
    { color: '#38bdf8', label: '🔵 Cyan'   },
    { color: '#4ade80', label: '🟢 Green'  },
  ];
  colorOpts.forEach(function (opt) {
    var btn = document.createElement('button');
    btn.textContent = opt.label;
    var isActive = !drawTool.erase && drawTool.color === opt.color;
    btn.style.cssText = [
      'flex:none', 'white-space:nowrap', 'padding:0.25rem 0.65rem',
      'font-size:0.78rem', 'font-weight:bold', 'border-radius:4px',
      'border:2px solid ' + opt.color, 'cursor:pointer', 'color:#fff',
      'background:' + (isActive ? opt.color : 'rgba(0,0,0,0.4)'),
      isActive ? 'box-shadow:0 0 7px ' + opt.color : ''
    ].join(';') + ';';
    btn.onclick = function () { drawTool.color = opt.color; drawTool.erase = false; renderDrawControls(mapUrl, mapKey); };
    toolRow.appendChild(btn);
  });

  // Eraser
  var eraserBtn = document.createElement('button');
  eraserBtn.textContent = '🧹 Erase';
  var eraserActive = drawTool.erase;
  eraserBtn.style.cssText = [
    'flex:none', 'white-space:nowrap', 'padding:0.25rem 0.65rem',
    'font-size:0.78rem', 'font-weight:bold', 'border-radius:4px',
    'border:2px solid #888', 'cursor:pointer', 'color:#fff',
    'background:' + (eraserActive ? '#555' : 'rgba(0,0,0,0.4)'),
    eraserActive ? 'box-shadow:0 0 7px #aaa' : ''
  ].join(';') + ';';
  eraserBtn.onclick = function () { drawTool.erase = true; renderDrawControls(mapUrl, mapKey); };
  toolRow.appendChild(eraserBtn);

  var sep = document.createElement('span');
  sep.style.cssText = 'color:#444;margin:0 0.25rem;';
  sep.textContent = '|';
  toolRow.appendChild(sep);

  // Width buttons
  [{ label: '— Thin', val: 0.003 }, { label: '— Med', val: 0.007 }, { label: '— Thick', val: 0.015 }].forEach(function (w) {
    var btn = document.createElement('button');
    btn.textContent = w.label;
    var isActive = drawTool.width === w.val;
    btn.style.cssText = [
      'flex:none', 'padding:0.25rem 0.55rem', 'font-size:0.78rem',
      'border-radius:4px', 'cursor:pointer', 'color:#ccc',
      'border:1px solid ' + (isActive ? '#aaa' : '#555'),
      'background:' + (isActive ? '#374151' : 'transparent')
    ].join(';') + ';';
    btn.onclick = function () { drawTool.width = w.val; renderDrawControls(mapUrl, mapKey); };
    toolRow.appendChild(btn);
  });

  // Undo + Clear
  var undoBtn = document.createElement('button');
  undoBtn.textContent = '↩ Undo';
  undoBtn.className = 'btn btn-secondary btn-small';
  undoBtn.style.cssText = 'margin-left:auto;flex:none;white-space:nowrap;';
  undoBtn.onclick = function () {
    if (drawStrokes[mapKey] && drawStrokes[mapKey].length) {
      drawStrokes[mapKey].pop();
      sendDrawUpdate(mapKey);
      renderDrawControls(mapUrl, mapKey);
    }
  };
  toolRow.appendChild(undoBtn);

  var clearBtn = document.createElement('button');
  clearBtn.textContent = '🗑 Clear';
  clearBtn.className = 'btn btn-danger btn-small';
  clearBtn.style.cssText = 'flex:none;white-space:nowrap;';
  clearBtn.onclick = function () {
    drawStrokes[mapKey] = [];
    sendDrawUpdate(mapKey);
    renderDrawControls(mapUrl, mapKey);
  };
  toolRow.appendChild(clearBtn);
  container.appendChild(toolRow);
}

// ============================================================
// Audio Panel
// ============================================================
function renderAudioPanel() {
  fetch('/api/audio')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      sbAudioList  = data.audio      || [];
      sbCategories = data.categories || [];
      applyAudioDisplay();
    })
    .catch(function (e) {
      document.getElementById('audio-list').textContent = 'Error loading audio: ' + e.message;
    });
}

function applyAudioDisplay() {
  var term = (audioSearchTerm || '').toLowerCase().trim();
  var audioList = document.getElementById('audio-list');
  audioList.innerHTML = '';

  if (!sbCategories.length) {
    audioList.textContent = 'No audio found in public/assets/audio/';
    return;
  }

  sbCategories.forEach(function (group) {
    var catMatches = !term || group.cat.toLowerCase().indexOf(term) !== -1;

    // If category name matches, show all tracks; otherwise filter by track name
    var matchingFiles = group.files.filter(function (url) {
      if (catMatches) return true;
      var name = url.split('/').pop();
      var dash = name.indexOf(' - ');
      var displayName = dash > 0 ? name.slice(dash + 3) : name;
      displayName = displayName.replace(/\.[^/.]+$/, '').toLowerCase();
      return displayName.indexOf(term) !== -1;
    });
    if (!matchingFiles.length) return;

    var hdr = document.createElement('div');
    hdr.className = 'audio-cat-hdr';
    hdr.innerHTML = '<span class="audio-cat-arrow">▼</span> ' + escHtml(group.cat) +
      ' <span style="color:#555;font-size:0.72rem;">(' + matchingFiles.length + ')</span>';
    audioList.appendChild(hdr);

    var section = document.createElement('div');
    section.className = 'audio-cat-body';

    matchingFiles.forEach(function (url) {
      var name = url.split('/').pop();
      var dash = name.indexOf(' - ');
      var displayName = dash > 0 ? name.slice(dash + 3) : name;
      displayName = displayName.replace(/\.[^/.]+$/, '');

      var row = document.createElement('div');
      row.className = 'audio-row';

      // Hidden audio element for DM local preview
      var audio = document.createElement('audio');
      audio.src = url;
      audio.style.display = 'none';
      row.appendChild(audio);

      // ▶/⏸ preview toggle
      var playBtn = document.createElement('button');
      playBtn.className = 'audio-preview-btn';
      playBtn.title = 'Preview locally';
      playBtn.innerHTML = '▶';
      playBtn.onclick = function () {
        // Pause all other previews in the panel
        document.querySelectorAll('#audio-list audio').forEach(function (a) {
          if (a !== audio) { a.pause(); a.currentTime = 0; }
        });
        document.querySelectorAll('.audio-preview-btn').forEach(function (b) {
          if (b !== playBtn) b.innerHTML = '▶';
        });
        if (audio.paused) {
          audio.play();
          playBtn.innerHTML = '⏸';
        } else {
          audio.pause();
          audio.currentTime = 0;
          playBtn.innerHTML = '▶';
        }
      };
      audio.addEventListener('ended', function () { playBtn.innerHTML = '▶'; });
      row.appendChild(playBtn);

      var lbl = document.createElement('span');
      lbl.textContent = displayName;
      lbl.className = 'audio-label';
      row.appendChild(lbl);

      var btn = document.createElement('button');
      btn.innerHTML = '⟳ LOOP';
      btn.title = 'Send to player screen (loops)';
      btn.className = 'audio-send-btn audio-send-loop';
      btn.onclick = (function (u) {
        return function () { broadcastAudio(u, true); };
      })(url);
      row.appendChild(btn);

      var btnOnce = document.createElement('button');
      btnOnce.innerHTML = '▶ ONCE';
      btnOnce.title = 'Send to player screen (plays once)';
      btnOnce.className = 'audio-send-btn audio-send-once';
      btnOnce.onclick = (function (u) {
        return function () { broadcastAudio(u, false); };
      })(url);
      row.appendChild(btnOnce);

      section.appendChild(row);
    });

    audioList.appendChild(section);

    hdr.addEventListener('click', function () {
      var collapsed = section.style.display === 'none';
      section.style.display = collapsed ? '' : 'none';
      hdr.querySelector('.audio-cat-arrow').textContent = collapsed ? '▼' : '▶';
    });
  });
}

function broadcastAudio(url, loop) {
  wsSend({ action: 'play-audio', url: url, loop: loop !== false });
}

document.getElementById('stop-audio-btn').addEventListener('click', function () {
  fetch('/api/stopaudio', { method: 'POST' });
  // Also stop any locally-playing audio preview elements in the DM panel
  document.querySelectorAll('#audio-list audio').forEach(function (a) {
    a.pause();
    a.currentTime = 0;
  });
});

// ============================================================
// Map Feature Controls
// ============================================================
function renderFeatureControls(mapKey, feats, mapMeta) {
  var container = document.getElementById('feature-controls-container');
  if (!container) return;
  container.innerHTML = '';
  if (!feats || feats.length === 0) return;

  var ANIM_LABELS = {
    'shake-reveal': 'Shake & Reveal',
    'flash-red':    'Red Flash',
    'pulse-gold':   'Gold Pulse',
    'fade-in':      'Fade In',
    'flash-white':  'White Flash',
  };
  var FEAT_ICONS = { pit: '⬛', trap: '💥', puzzle: '🧩', reveal: '👁', effect: '✨' };

  var header = document.createElement('div');
  header.style.cssText = 'border-top:1px solid #21262d;padding-top:0.6rem;margin-top:0.25rem;';
  var hLabel = document.createElement('span');
  hLabel.style.cssText = 'color:#aaa;font-size:0.8rem;font-weight:bold;';
  hLabel.textContent = '🎯 Map Features';
  header.appendChild(hLabel);
  container.appendChild(header);

  // Track per-feature triggered state client-side for button toggling
  var triggeredSet = {};

  var grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem;';
  container.appendChild(grid);

  feats.forEach(function (feat) {
    var card = document.createElement('div');
    card.id = 'feat-card-' + feat.id;
    card.style.cssText = 'background:#1f2937;border-radius:5px;padding:0.4rem 0.6rem;' +
      'border-left:3px solid ' + (feat.color || '#c0392b') + ';min-width:160px;flex:1 1 160px;';

    var nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-size:0.82rem;font-weight:bold;color:#e6e6e6;margin-bottom:0.25rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    nameEl.textContent = (FEAT_ICONS[feat.type] || '?') + ' ' + feat.name;
    nameEl.title = feat.description || feat.name;
    card.appendChild(nameEl);

    var animEl = document.createElement('div');
    animEl.style.cssText = 'font-size:0.72rem;color:#6b7280;margin-bottom:0.35rem;';
    // Show type-specific info instead of raw animation key
    var typeInfoMap = {
      pit: '⬛ Pit opens', trap: '💥 Trap springs', puzzle: '🧩 Puzzle',
      reveal: '👁 Area revealed', effect: '✨ Effect'
    };
    var typeInfo = typeInfoMap[feat.type] || feat.type || '';
    if (feat.type === 'effect' && feat.effectSubtype) typeInfo += ' — ' + feat.effectSubtype;
    if (feat.type === 'puzzle' && feat.linkedMap) typeInfo += ' — has sub-map';
    animEl.textContent = typeInfo + ' • ' + (feat.cells || []).length + ' cells';
    card.appendChild(animEl);

    if (feat.autoTrigger) {
      var autoEl = document.createElement('div');
      autoEl.style.cssText = 'font-size:0.7rem;color:#facc15;margin-bottom:0.3rem;';
      autoEl.textContent = '⚡ Auto-triggers on player contact';
      card.appendChild(autoEl);
    }

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:0.3rem;flex-wrap:wrap;';

    var trigBtn = document.createElement('button');
    trigBtn.className = 'btn btn-small btn-danger';
    trigBtn.textContent = '⚡ Trigger';
    trigBtn.style.cssText += 'flex:1 1 100%;font-size:0.78rem;white-space:nowrap;';
    // Apply initial state from tracked triggered set (e.g. after auto-trigger or page restore)
    var alreadyTriggered = !!dmTriggeredFeat[feat.id];
    if (alreadyTriggered) {
      trigBtn.disabled = true;
      trigBtn.textContent = '✓ Triggered';
      trigBtn.style.opacity = '0.55';
    }
    trigBtn.onclick = function () {
      triggeredSet[feat.id] = true;
      dmTriggeredFeat[feat.id] = true;
      wsSend({ action: 'trigger-feature', featureId: feat.id, mapKey: mapKey, feature: feat });
      trigBtn.disabled = true;
      trigBtn.textContent = '✓ Triggered';
      trigBtn.style.opacity = '0.55';
      resetBtn.disabled = false;
      resetBtn.style.opacity = '1';
      updateDmFeatureOverlay();
    };
    btnRow.appendChild(trigBtn);

    var resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-small btn-secondary';
    resetBtn.textContent = '↩ Reset';
    resetBtn.disabled = !alreadyTriggered;
    resetBtn.style.cssText += 'flex:1;font-size:0.78rem;opacity:' + (alreadyTriggered ? '1' : '0.4') + ';';
    resetBtn.onclick = function () {
      delete triggeredSet[feat.id];
      delete dmTriggeredFeat[feat.id];
      wsSend({ action: 'reset-feature', featureId: feat.id, mapKey: mapKey });
      trigBtn.disabled = false;
      trigBtn.textContent = '⚡ Trigger';
      trigBtn.style.opacity = '1';
      resetBtn.disabled = true;
      resetBtn.style.opacity = '0.4';
      updateDmFeatureOverlay();
    };
    btnRow.appendChild(resetBtn);

    // Puzzle: open sub-map lightbox
    if (feat.type === 'puzzle' && feat.linkedMap) {
      var subMapBtn = document.createElement('button');
      subMapBtn.className = 'btn btn-small btn-secondary';
      subMapBtn.textContent = '\ud83d\uddfa Sub-map';
      subMapBtn.style.cssText = 'flex:1;font-size:0.75rem;white-space:nowrap;';
      (function (f) {
        subMapBtn.onclick = function () { openDmSubMapLightbox(f); };
      }(feat));
      btnRow.appendChild(subMapBtn);
    }

    card.appendChild(btnRow);
    grid.appendChild(card);
  });
}

// ============================================================
// Fog of War Controls
// ============================================================
function renderFogControls(mapUrl, fogKey) {
  fogMapUrl = mapUrl;
  if (!window.fogStates) window.fogStates = {};
  if (!window.fogStates[fogKey]) {
    window.fogStates[fogKey] = [];
    for (var r = 0; r < fogRows; r++) {
      window.fogStates[fogKey].push([]);
      for (var c = 0; c < fogCols; c++) {
        window.fogStates[fogKey][r].push(false);
      }
    }
  }
  fogGrid = window.fogStates[fogKey];

  var container = document.getElementById('fog-controls-container');
  container.innerHTML = '';

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:0.5rem;margin-bottom:0.5rem;';

  var clearFogBtn = document.createElement('button');
  clearFogBtn.textContent = 'Hide All';
  clearFogBtn.className = 'btn btn-warning btn-small';
  clearFogBtn.style.cssText = 'flex:none;min-width:0;padding:0.25rem 0.9rem;font-size:0.75rem;';
  clearFogBtn.onclick = function () {
    window.fogStates[fogKey] = [];
    for (var r = 0; r < fogRows; r++) {
      window.fogStates[fogKey].push([]);
      for (var c = 0; c < fogCols; c++) window.fogStates[fogKey][r].push(false);
    }
    renderFogControls(fogMapUrl, fogKey);
    sendFogUpdate(fogKey);
  };
  btnRow.appendChild(clearFogBtn);

  var revealBtn = document.createElement('button');
  revealBtn.textContent = 'Reveal All';
  revealBtn.className = 'btn btn-secondary btn-small';
  revealBtn.style.cssText = 'flex:none;min-width:0;padding:0.25rem 0.9rem;font-size:0.75rem;';
  revealBtn.onclick = function () {
    window.fogStates[fogKey] = [];
    for (var r = 0; r < fogRows; r++) {
      window.fogStates[fogKey].push([]);
      for (var c = 0; c < fogCols; c++) window.fogStates[fogKey][r].push(true);
    }
    // Flush all deferred initiative entries for this map
    if (fogDeferredInit[fogKey] && fogDeferredInit[fogKey].length) {
      fogDeferredInit[fogKey].forEach(function (entry) {
        var alreadyIn = initiative.some(function (e) { return e.name === entry.label; });
        if (!alreadyIn) addToInitiative(entry.label, entry.roll, false, '');
      });
      fogDeferredInit[fogKey] = [];
    }
    renderFogControls(fogMapUrl, fogKey);
    sendFogUpdate(fogKey);
  };
  btnRow.appendChild(revealBtn);
  container.appendChild(btnRow);

  // Fog of War map header with expand button
  var fogHeaderRow = document.createElement('div');
  fogHeaderRow.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;';
  var title = document.createElement('div');
  title.textContent = '🌫️ Fog of War';
  title.style.cssText = 'font-size:0.7rem;font-weight:bold;text-transform:uppercase;letter-spacing:0.08em;color:#555;flex:1;';
  fogHeaderRow.appendChild(title);
  var fogExpandBtn = document.createElement('button');
  fogExpandBtn.style.cssText = 'font-size:0.72rem;padding:0.18rem 0.5rem;border-radius:4px;cursor:pointer;border:1px solid #30363d;background:#0d1117;color:#888;white-space:nowrap;';
  fogExpandBtn.textContent = fogMapExpanded ? '⊟ Shrink' : '⊞ Expand';
  fogExpandBtn.title = 'Toggle fog map zoom level';
  fogExpandBtn.onclick = function () {
    fogMapExpanded = !fogMapExpanded;
    mapImg.style.maxHeight = fogMapExpanded ? 'none' : '340px';
    fogExpandBtn.textContent = fogMapExpanded ? '⊟ Shrink' : '⊞ Expand';
  };
  fogHeaderRow.appendChild(fogExpandBtn);
  container.appendChild(fogHeaderRow);

  // Map preview with fog grid overlaid
  var mapWrap = document.createElement('div');
  mapWrap.style.cssText = 'position:relative;display:inline-block;max-width:100%;margin-bottom:0.5rem;border:1px solid #444;';

  var mapImg = document.createElement('img');
  mapImg.src = mapUrl;
  mapImg.style.cssText = 'display:block;max-width:100%;max-height:' + (fogMapExpanded ? 'none' : '340px') + ';object-fit:contain;user-select:none;pointer-events:none;';
  mapWrap.appendChild(mapImg);

  var grid = document.createElement('div');
  grid.style.cssText = 'position:absolute;inset:0;display:grid;' +
    'grid-template-columns:repeat(' + fogCols + ',1fr);' +
    'grid-template-rows:repeat(' + fogRows + ',1fr);';

  // Paint-brush state: track whether mouse is held and what value we're painting
  var isPainting = false;
  var paintValue = true; // true = reveal, false = hide

  // Throttle WebSocket sends while dragging
  var fogSendTimer = null;
  function scheduleFogUpdate() {
    if (fogSendTimer) return;
    fogSendTimer = setTimeout(function () {
      fogSendTimer = null;
      sendFogUpdate(fogKey);
    }, 60);
  }

  function paintCell(cell, r, c) {
    if (fogGrid[r][c] === paintValue) return; // already this value, skip
    fogGrid[r][c] = paintValue;
    cell.style.background = paintValue ? 'transparent' : 'rgba(0,0,0,0.85)';
    scheduleFogUpdate();
    // If revealing a cell, flush any deferred initiative entries at this position
    if (paintValue === true && fogDeferredInit[fogKey]) {
      var remaining = [];
      fogDeferredInit[fogKey].forEach(function (entry) {
        if (entry.fr === r && entry.fc === c) {
          var alreadyIn = initiative.some(function (e) { return e.name === entry.label; });
          if (!alreadyIn) addToInitiative(entry.label, entry.roll, false, '');
        } else {
          remaining.push(entry);
        }
      });
      fogDeferredInit[fogKey] = remaining;
    }
  }

  document.addEventListener('mouseup', function () { isPainting = false; });

  for (var row = 0; row < fogRows; row++) {
    for (var col = 0; col < fogCols; col++) {
      (function (r, c) {
        var cell = document.createElement('div');
        cell.style.cssText = 'cursor:crosshair;box-sizing:border-box;border:1px solid rgba(255,255,255,0.08);background:' +
          (fogGrid[r][c] ? 'transparent' : 'rgba(0,0,0,0.85)') + ';transition:background 0.1s;';

        cell.addEventListener('mousedown', function (e) {
          e.preventDefault();
          isPainting = true;
          // Paint mode is opposite of current cell value (toggle on first touch)
          paintValue = !fogGrid[r][c];
          paintCell(cell, r, c);
        });

        cell.addEventListener('mouseenter', function () {
          if (isPainting) paintCell(cell, r, c);
        });

        grid.appendChild(cell);
      })(row, col);
    }
  }
  mapWrap.appendChild(grid);

  // Token overlay on fog map — display only, pointer-events:none so fog painting still works
  var fogTokenOverlay = document.createElement('div');
  fogTokenOverlay.id = 'fog-token-overlay';
  fogTokenOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;';
  mapWrap.appendChild(fogTokenOverlay);

  // Feature cell overlay on fog map — shows outlines for all features, filled when triggered
  var fogFeatOverlay = document.createElement('div');
  fogFeatOverlay.className = 'dm-feat-overlay';
  fogFeatOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;';
  mapWrap.appendChild(fogFeatOverlay);

  // Object layer on fog map
  var fogObjLayer = document.createElement('div');
  fogObjLayer.className = 'dm-obj-layer';
  fogObjLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;';
  mapWrap.appendChild(fogObjLayer);

  container.appendChild(mapWrap);
  updateFogTokenOverlay();
  updateDmFeatureOverlay();
  renderDmObjectLayer();
}

function sendFogUpdate(fogKey) {
  if (ws && ws.readyState === 1 && fogMapUrl) {
    wsSend({ action: 'update-fog', mapUrl: fogMapUrl, fogGrid: fogGrid, fogKey: fogKey });
  }
}

// Refresh the read-only token dots shown on the fog map preview.
// Called whenever tokens change while a fog map is active.
function updateFogTokenOverlay() {
  var overlay = document.getElementById('fog-token-overlay');
  if (!overlay) return;
  overlay.innerHTML = '';
  var mapKey = activeFogKey || activeTokenMapKey;
  if (!mapKey) return;
  var tokens = tokenState[mapKey] || [];
  tokens.forEach(function (tok) {
    var dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;width:16px;height:16px;border-radius:50%;' +
      'background:' + tokenBgColor(tok) + ';' +
      'border:1.5px solid rgba(255,255,255,0.75);' +
      'display:flex;align-items:center;justify-content:center;flex-direction:column;overflow:hidden;' +
      'left:' + (tok.x * 100) + '%;top:' + (tok.y * 100) + '%;transform:translate(-50%,-50%);' +
      'pointer-events:none;';
    dot.title = tok.label || '';
    if (tok.type === 'player' && tok.cls && MOB_ICONS_CLASS[tok.cls]) {
      var ic = document.createElement('span');
      ic.textContent = MOB_ICONS_CLASS[tok.cls];
      ic.style.cssText = 'font-size:9px;line-height:1;pointer-events:none;';
      dot.appendChild(ic);
    } else if (tok.mobType && MOB_ICONS[tok.mobType]) {
      var ic = document.createElement('span');
      ic.textContent = MOB_ICONS[tok.mobType];
      ic.style.cssText = 'font-size:9px;line-height:1;pointer-events:none;';
      dot.appendChild(ic);
    } else if (tok.label) {
      var lbl = document.createElement('span');
      lbl.textContent = tok.label.slice(0, 3);
      lbl.style.cssText = 'color:#fff;font-weight:bold;font-size:6px;font-family:sans-serif;line-height:1;pointer-events:none;';
      dot.appendChild(lbl);
    }
    overlay.appendChild(dot);
  });
}

// ============================================================
// Mob Token Overlay
// ============================================================
function tokenCssColor(color) {
  return color === 'red'   ? '#dc2626'
       : color === 'blue'  ? '#2563eb'
       : color === 'green' ? '#16a34a'
       : color === 'item'  ? '#92400e'
       : '#ca8a04';
}
function tokenBgColor(tok) {
  if (tok.type === 'item') return '#78350f';
  if (tok.type === 'player' && tok.cls && CLASS_COLORS_DM[tok.cls]) return CLASS_COLORS_DM[tok.cls];
  if (tok.mobType && MOB_COLORS[tok.mobType]) return MOB_COLORS[tok.mobType];
  if (tok.mobType && CLASS_COLORS_DM[tok.mobType]) return CLASS_COLORS_DM[tok.mobType];
  return tokenCssColor(tok.color);
}

// ── Condition ring box-shadow ─────────────────────────────────
// Buff = green ring, Debuff = red ring, stacked 4px per condition outward
function makeConditionShadow(tok) {
  var conds = tok.conditions || [];
  if (!conds.length) return '0 1px 6px rgba(0,0,0,0.9)';
  var shadows = [];
  conds.forEach(function (c, i) {
    var r = (i + 1) * 4;
    shadows.push('0 0 0 ' + r + 'px ' + (c.type === 'buff' ? '#22c55e' : '#ef4444'));
  });
  shadows.push('0 2px 8px rgba(0,0,0,0.9)');
  return shadows.join(',');
}

// Refresh all .dm-feat-overlay divs (on fog map and token map) to show
// feature cell outlines and triggered fills for the DM.
function updateDmFeatureOverlay() {
  var TYPE_COLORS = { pit: '#1a0a00', trap: '#7f1d1d', puzzle: '#1e3a5f', reveal: '#14532d', effect: '#7c2d12' };
  var TYPE_ANIM   = { pit: 'dm-feat-pit', trap: 'dm-feat-trap', puzzle: 'dm-feat-puzzle', effect: 'dm-feat-effect' };
  document.querySelectorAll('.dm-feat-overlay').forEach(function (overlay) {
    overlay.innerHTML = '';
    if (!dmMapFeatures.length || !dmMapMeta) return;
    var cols = dmMapMeta.cols, rows = dmMapMeta.rows;
    if (!cols || !rows) return;
    dmMapFeatures.forEach(function (feat) {
      var defaultColor = TYPE_COLORS[feat.type] || '#7f1d1d';
      var isTriggered  = !!dmTriggeredFeat[feat.id];
      (feat.cells || []).forEach(function (cell) {
        var r = cell[0], c = cell[1];
        var cd = document.createElement('div');
        cd.dataset.featId = feat.id;
        if (isTriggered && TYPE_ANIM[feat.type]) cd.classList.add(TYPE_ANIM[feat.type] + '-triggered');
        cd.style.cssText = 'position:absolute;box-sizing:border-box;pointer-events:none;' +
          'left:' + (c / cols * 100) + '%;top:' + (r / rows * 100) + '%;' +
          'width:' + (100 / cols) + '%;height:' + (100 / rows) + '%;' +
          'background:' + (isTriggered ? (feat.color || defaultColor) : 'transparent') + ';' +
          'border:1px dashed ' + (feat.color || defaultColor) + ';' +
          'opacity:' + (isTriggered ? '0.75' : '0.4') + ';' +
          'transition:background 0.3s,opacity 0.3s;';
        overlay.appendChild(cd);
      });
    });
  });
}

// ── DM puzzle sub-map lightbox ────────────────────────────────
function openDmSubMapLightbox(feat) {
  var lb = document.getElementById('dm-submap-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'dm-submap-lightbox';
    lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.93);z-index:9999;' +
      'display:flex;align-items:center;justify-content:center;flex-direction:column;gap:0.75rem;';
    document.body.appendChild(lb);
  }
  lb.innerHTML = '';
  lb.style.display = 'flex';
  var title = document.createElement('div');
  title.textContent = '\ud83d\uddfa\ufe0f ' + escHtml(feat.name || 'Sub-map');
  title.style.cssText = 'color:#e6e6e6;font-size:1.1rem;font-weight:bold;';
  lb.appendChild(title);
  var img = document.createElement('img');
  img.src = feat.linkedMap;
  img.style.cssText = 'max-width:85vw;max-height:78vh;object-fit:contain;border-radius:4px;' +
    'box-shadow:0 0 30px rgba(99,179,237,0.4);';
  lb.appendChild(img);
  var closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-secondary';
  closeBtn.textContent = '\u2715 Close';
  closeBtn.onclick = function () { lb.style.display = 'none'; };
  lb.appendChild(closeBtn);
}

// ── DM Moveable Object Layer ──────────────────────────────────
function renderDmObjectLayer() {
  document.querySelectorAll('.dm-obj-layer').forEach(function (layer) {
    layer.innerHTML = '';
    if (!dmObjects.length || !dmMapMeta) return;
    var cols = dmMapMeta.cols, rows = dmMapMeta.rows;
    if (!cols || !rows) return;
    var SPEED = { slow: '4s', normal: '2.5s', fast: '1.2s' };
    var isFogLayer = layer.parentElement && layer.parentElement.id && layer.parentElement.id.indexOf('fog') >= 0;
    dmObjects.forEach(function (obj) {
      var st = dmObjStates[obj.id] || { activated: false, currentCol: obj.col, currentRow: obj.row, currentRotation: 0 };
      var size = parseFloat(obj.size) || 1.0;
      var el = document.createElement('div');
      el.className = 'dm-obj-cell' + (obj.interactive ? ' dm-obj-interactive' : '') + (st.activated ? ' dm-obj-activated' : '');
      el.dataset.objId = obj.id;
      el.style.cssText =
        'left:' + ((st.currentCol + (1 - size) / 2) / cols * 100) + '%;' +
        'top:' + ((st.currentRow + (1 - size) / 2) / rows * 100) + '%;' +
        'width:' + (size / cols * 100) + '%;' +
        'height:' + (size / rows * 100) + '%;' +
        'transform:rotate(' + (st.currentRotation || 0) + 'deg);' +
        'border-color:' + (obj.color || '#fbbf24') + ';';
      // Drag indicator
      var drag = document.createElement('span');
      drag.className = 'dm-obj-drag';
      drag.textContent = '⠿';
      el.appendChild(drag);
      // Icon
      var iconEl = document.createElement('div');
      iconEl.className = 'obj-icon' + (obj.autoAnim && obj.autoAnim !== 'none' ? ' anim-' + obj.autoAnim : '');
      if (obj.autoAnim && obj.autoAnim !== 'none') {
        iconEl.style.setProperty('--obj-dur', SPEED[obj.animSpeed] || '2.5s');
      }
      if (obj.iconType === 'tile' && obj.tileId) {
        iconEl.style.cssText = 'width:80%;height:80%;background-size:cover;background-position:center;' +
          'background-image:url(/assets/Tiles/' + encodeURIComponent(obj.tileId) + ');';
      } else {
        iconEl.style.cssText = 'font-size:1.1em;line-height:1;';
        iconEl.textContent = obj.emoji || '\uD83D\uDD27';
      }
      el.appendChild(iconEl);
      // Click to interact (token map layer only, not fog layer)
      // Keep layer pointer-events:none so fog/token clicks pass through empty cells;
      // individual object elements opt-in with pointer-events:auto.
      if (!isFogLayer) {
        el.style.pointerEvents = 'auto';
        (function (oId, stSnap) {
          el.onclick = function (e) {
            e.stopPropagation();
            wsSend({ action: 'interact-object', objId: oId });
          };
          // Drag to move — track on document so pointer-events:none layer doesn't block
          el.addEventListener('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            _dmObjDragging = { objId: oId, lastCol: stSnap.currentCol, lastRow: stSnap.currentRow, layer: layer, cols: cols, rows: rows };
          });
        }(obj.id, st));
      }
      layer.appendChild(el);
    });
    // Ensure layer itself never swallows events (only individual elements do)
    layer.style.pointerEvents = 'none';
  });

  // Document-level drag handlers (attached once, guard with _dmObjDragging)
  if (!renderDmObjectLayer._docDragBound) {
    renderDmObjectLayer._docDragBound = true;
    document.addEventListener('mousemove', function (e) {
      if (!_dmObjDragging) return;
      var lay = _dmObjDragging.layer;
      var rect = lay.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width;
      var py = (e.clientY - rect.top) / rect.height;
      var c = Math.max(0, Math.min(_dmObjDragging.cols - 1, Math.floor(px * _dmObjDragging.cols)));
      var r = Math.max(0, Math.min(_dmObjDragging.rows - 1, Math.floor(py * _dmObjDragging.rows)));
      if (c !== _dmObjDragging.lastCol || r !== _dmObjDragging.lastRow) {
        _dmObjDragging.lastCol = c;
        _dmObjDragging.lastRow = r;
        wsSend({ action: 'move-object', objId: _dmObjDragging.objId, col: c, row: r });
      }
    });
    document.addEventListener('mouseup', function () { _dmObjDragging = null; });
  }
}

// ── Token condition picker popup ──────────────────────────────
function sendTokenUpdate(mapKey) {
  // Enrich tokens with conditions from initiative tracker before broadcasting
  var enriched = (tokenState[mapKey] || []).map(function (tok) {
    var entry = initiative.find(function (e) { return e.name === tok.label; });
    var t = Object.assign({}, tok);
    t.conditions = entry ? (entry.conditions || []) : [];
    return t;
  });
  wsSend({ action: 'update-tokens', tokens: enriched, mapKey: mapKey, showRings: showPlayerRings });
  // Persist full tokenState (all maps) so it survives server restart
  wsSend({ action: 'sync-all-tokens', tokenState: tokenState });
}

// Snap a normalized (0-1) position to the nearest grid cell centre when grid is enabled
function snapPosToGrid(x, y) {
  if (!gridEnabled || !dmMapMeta) return { x: x, y: y };
  var sc = Math.max(0, Math.min(dmMapMeta.cols - 1, Math.floor(x * dmMapMeta.cols)));
  var sr = Math.max(0, Math.min(dmMapMeta.rows - 1, Math.floor(y * dmMapMeta.rows)));
  return { x: (sc + 0.5) / dmMapMeta.cols, y: (sr + 0.5) / dmMapMeta.rows };
}

function renderTokenControls(mapUrl, mapKey) {
  activeTokenMapKey = mapKey;
  activeTokenMapUrl = mapUrl;
  if (!tokenState[mapKey]) tokenState[mapKey] = [];
  refreshMapMobsSection();

  var container = document.getElementById('token-controls-container');
  container.innerHTML = '';
  var mapContainer = document.getElementById('token-map-container');
  if (mapContainer) mapContainer.innerHTML = '';

  // Color picker buttons — appended directly into the flex header container
  // Off button
  var offBtn = document.createElement('button');
  offBtn.textContent = '🚫 Off';
  var placementOff = selectedTokenColor === null;
  offBtn.title = placementOff ? 'Placement is disabled — click a color to enable' : 'Stop placing tokens';
  offBtn.style.cssText = [
    'flex:none', 'white-space:nowrap', 'padding:0.3rem 0.75rem',
    'font-size:0.78rem', 'font-weight:bold', 'border-radius:4px',
    'border:2px solid ' + (placementOff ? '#6b7280' : '#374151'),
    'cursor:pointer', 'color:' + (placementOff ? '#e5e7eb' : '#6b7280'),
    'background:' + (placementOff ? 'rgba(107,114,128,0.3)' : 'rgba(0,0,0,0.2)'),
    placementOff ? 'box-shadow:0 0 6px rgba(107,114,128,0.6)' : ''
  ].join(';') + ';';
  offBtn.onclick = function () {
    selectedTokenColor = null;
    selectedPlayerName = null;
    addPartyMode = false;
    renderTokenControls(mapUrl, mapKey);
  };
  container.appendChild(offBtn);

  [
    { color: 'red',    label: '🔴 Enemy'   },
    { color: 'blue',   label: '🔵 Friend'  },
    { color: 'yellow', label: '🟡 Unknown' },
    { color: 'green',  label: '🟢 Player'  },
    { color: 'item',   label: '🎁 Item'    }
  ].forEach(function (opt) {
    var btn = document.createElement('button');
    btn.textContent = opt.label;
    var bg = tokenCssColor(opt.color);
    var isActive = selectedTokenColor === opt.color;
    btn.style.cssText = [
      'flex:none',
      'white-space:nowrap',
      'padding:0.3rem 0.75rem',
      'font-size:0.78rem',
      'font-weight:bold',
      'border-radius:4px',
      'border:2px solid ' + bg,
      'cursor:pointer',
      'color:#fff',
      'background:' + (isActive ? bg : 'rgba(0,0,0,0.4)'),
      'letter-spacing:0.3px',
      'transition:background 0.15s',
      isActive ? 'box-shadow:0 0 8px ' + bg : ''
    ].join(';') + ';';
    btn.onclick = function () {
      // Clicking the active color again turns placement off
      selectedTokenColor = (selectedTokenColor === opt.color) ? null : opt.color;
      selectedPlayerName = null;
      addPartyMode = false;
      renderTokenControls(mapUrl, mapKey);
    };
    container.appendChild(btn);
  });

  // Auto-add to initiative toggle
  var initToggleBtn = document.createElement('button');
  initToggleBtn.style.cssText = 'flex:none;font-size:0.75rem;padding:0.28rem 0.6rem;border-radius:4px;cursor:pointer;white-space:nowrap;' +
    'border:1px solid ' + (autoAddToInit ? '#4ade80' : '#555') + ';' +
    'background:' + (autoAddToInit ? 'rgba(74,222,128,0.15)' : 'rgba(0,0,0,0.3)') + ';' +
    'color:' + (autoAddToInit ? '#4ade80' : '#666') + ';';
  initToggleBtn.textContent = (autoAddToInit ? '⚔️ Auto-Init: ON' : '⚔️ Auto-Init: OFF');
  initToggleBtn.title = 'Toggle whether placing a token automatically adds it to the initiative tracker';
  initToggleBtn.onclick = function () {
    autoAddToInit = !autoAddToInit;
    renderTokenControls(mapUrl, mapKey);
  };
  container.appendChild(initToggleBtn);

  // Condition rings on player screen toggle
  var ringsToggleBtn = document.createElement('button');
  ringsToggleBtn.style.cssText = 'flex:none;font-size:0.75rem;padding:0.28rem 0.6rem;border-radius:4px;cursor:pointer;white-space:nowrap;' +
    'border:1px solid ' + (showPlayerRings ? '#818cf8' : '#555') + ';' +
    'background:' + (showPlayerRings ? 'rgba(129,140,248,0.15)' : 'rgba(0,0,0,0.3)') + ';' +
    'color:' + (showPlayerRings ? '#818cf8' : '#666') + ';';
  ringsToggleBtn.textContent = showPlayerRings ? '💫 Rings: ON' : '💫 Rings: OFF';
  ringsToggleBtn.title = 'Toggle condition rings on the player/projector screen';
  ringsToggleBtn.onclick = function () {
    showPlayerRings = !showPlayerRings;
    wsSend({ action: 'set-rings', showRings: showPlayerRings });
    if (activeTokenMapKey) sendTokenUpdate(activeTokenMapKey);
    renderTokenControls(mapUrl, mapKey);
  };
  container.appendChild(ringsToggleBtn);

  // Reveal all hidden tokens not under fog
  var tokens = (activeTokenMapKey && tokenState[activeTokenMapKey]) ? tokenState[activeTokenMapKey] : [];
  var hiddenVisible = tokens.filter(function(t) {
    if (!t.hidden) return false;
    if (!fogGrid || !fogGrid.length || !currentViewFogKey) return true;
    var fCols = (fogGrid[0] && fogGrid[0].length) ? fogGrid[0].length : 20;
    var fRows = fogGrid.length;
    var gridC = Math.min(fCols - 1, Math.max(0, Math.floor(t.x * fCols)));
    var gridR = Math.min(fRows - 1, Math.max(0, Math.floor(t.y * fRows)));
    return !!fogGrid[gridR][gridC];
  });
  if (hiddenVisible.length) {
    var revealAllBtn = document.createElement('button');
    revealAllBtn.style.cssText = 'flex:none;font-size:0.75rem;padding:0.28rem 0.6rem;border-radius:4px;cursor:pointer;white-space:nowrap;' +
      'border:1px solid #a78bfa;background:rgba(167,139,250,0.15);color:#a78bfa;';
    revealAllBtn.textContent = '👁 Reveal (' + hiddenVisible.length + ')';
    revealAllBtn.title = 'Unhide all hidden tokens not currently in fog of war';
    revealAllBtn.onclick = function () {
      hiddenVisible.forEach(function(tok) { tok.hidden = false; });
      sendTokenUpdate(activeTokenMapKey);
      renderTokenControls(mapUrl, mapKey);
    };
    container.appendChild(revealAllBtn);
  }

  // Item type picker (only when item color is active)
  if (selectedTokenColor === 'item') {
    var ITEM_TYPES_LIST = Object.keys(ITEM_ICONS);
    var itemRow = document.createElement('div');
    itemRow.style.cssText = 'display:flex;gap:0.4rem;align-items:center;flex-wrap:nowrap;';
    var itemLbl = document.createElement('span');
    itemLbl.textContent = 'Item Type:';
    itemLbl.style.cssText = 'font-size:0.75rem;color:#888;white-space:nowrap;';
    itemRow.appendChild(itemLbl);
    var itemSel = document.createElement('select');
    itemSel.style.cssText = 'background:#0d1117;border:1px solid #fbbf24;border-radius:4px;color:#fbbf24;' +
      'padding:0.22rem 0.4rem;font-size:0.77rem;flex:1;min-width:110px;';
    ITEM_TYPES_LIST.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t;
      o.textContent = ITEM_ICONS[t] + ' ' + t;
      if (t === selectedItemType) o.selected = true;
      itemSel.appendChild(o);
    });
    itemSel.onchange = function () { selectedItemType = itemSel.value; };
    itemRow.appendChild(itemSel);
    container.appendChild(itemRow);
  }

  // Enemy (red): mob type picker + optional named enemy field
  if (selectedTokenColor === 'red') {
    var MOB_TYPES = ['Bandit','Bugbear','Cultist','Dragon','Drow','Gelatinous Cube',
      'Ghoul','Giant','Gnoll','Goblin','Guard','Hobgoblin','Kobold','Mimic',
      'Ogre','Orc','Owlbear','Skeleton','Spy','Thug','Troll','Vampire',
      'Werewolf','Wolf','Zombie'];
    var CLASS_TYPES = Object.keys(MOB_ICONS_CLASS);
    var allMobTypes = MOB_TYPES.concat(CLASS_TYPES);
    var mobRow = document.createElement('div');
    mobRow.style.cssText = 'display:flex;gap:0.4rem;align-items:center;flex-wrap:nowrap;';
    var mobLbl = document.createElement('span');
    mobLbl.textContent = 'Mob Type:';
    mobLbl.style.cssText = 'font-size:0.75rem;color:#888;white-space:nowrap;';
    mobRow.appendChild(mobLbl);
    var mobSel = document.createElement('select');
    mobSel.style.cssText = 'background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#e6e6e6;' +
      'padding:0.22rem 0.4rem;font-size:0.77rem;flex:1;min-width:100px;';
    var blankOpt = document.createElement('option');
    blankOpt.value = '';
    blankOpt.textContent = '— Generic (E1, E2…)';
    mobSel.appendChild(blankOpt);
    // Monsters group
    var grpMonsters = document.createElement('optgroup');
    grpMonsters.label = '── Monsters ──';
    MOB_TYPES.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t;
      o.textContent = (MOB_ICONS[t] ? MOB_ICONS[t] + ' ' : '') + t;
      if (t === selectedMobType) o.selected = true;
      grpMonsters.appendChild(o);
    });
    mobSel.appendChild(grpMonsters);
    // Classes group
    var grpClasses = document.createElement('optgroup');
    grpClasses.label = '── Classes ──';
    CLASS_TYPES.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t;
      o.textContent = (MOB_ICONS_CLASS[t] ? MOB_ICONS_CLASS[t] + ' ' : '') + t;
      if (t === selectedMobType) o.selected = true;
      grpClasses.appendChild(o);
    });
    mobSel.appendChild(grpClasses);
    if (selectedMobType && !allMobTypes.includes(selectedMobType)) mobSel.value = '';
    mobSel.onchange = function () {
      selectedMobType = mobSel.value;
      customMobInput.value = '';
      if (selectedMobType) fetchMonsterByName(selectedMobType);
    };
    mobRow.appendChild(mobSel);
    var customMobInput = document.createElement('input');
    customMobInput.type = 'text';
    customMobInput.placeholder = 'Custom…';
    customMobInput.value = (selectedMobType && !allMobTypes.includes(selectedMobType)) ? selectedMobType : '';
    customMobInput.style.cssText = 'background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#e6e6e6;' +
      'padding:0.22rem 0.4rem;font-size:0.77rem;width:80px;';
    customMobInput.oninput = function () {
      selectedMobType = customMobInput.value.trim();
      if (selectedMobType) mobSel.value = '';
    };
    mobRow.appendChild(customMobInput);
    container.appendChild(mobRow);
    // Named enemy override (e.g. "Klarg") — optional
    var enemyNameRow = document.createElement('div');
    enemyNameRow.style.cssText = 'display:flex;gap:0.4rem;align-items:center;flex-wrap:nowrap;';
    var enemyNameLbl = document.createElement('span');
    enemyNameLbl.textContent = 'Name (optional):';
    enemyNameLbl.style.cssText = 'font-size:0.75rem;color:#888;white-space:nowrap;';
    enemyNameRow.appendChild(enemyNameLbl);
    var enemyNameInput = document.createElement('input');
    enemyNameInput.type = 'text';
    enemyNameInput.placeholder = 'e.g. Klarg';
    enemyNameInput.value = selectedEnemyName;
    enemyNameInput.style.cssText = 'background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#e6e6e6;' +
      'padding:0.22rem 0.4rem;font-size:0.77rem;flex:1;min-width:100px;';
    enemyNameInput.oninput = function () { selectedEnemyName = enemyNameInput.value.trim(); };
    enemyNameRow.appendChild(enemyNameInput);
    container.appendChild(enemyNameRow);
  }

  // Friend (blue) / Unknown (yellow): optional name field only — no mob type picker
  if (selectedTokenColor === 'blue' || selectedTokenColor === 'yellow') {
    var friendNameRow = document.createElement('div');
    friendNameRow.style.cssText = 'display:flex;gap:0.4rem;align-items:center;flex-wrap:nowrap;';
    var friendNameLbl = document.createElement('span');
    friendNameLbl.textContent = 'Name (optional):';
    friendNameLbl.style.cssText = 'font-size:0.75rem;color:#888;white-space:nowrap;';
    friendNameRow.appendChild(friendNameLbl);
    var friendNameInput = document.createElement('input');
    friendNameInput.type = 'text';
    friendNameInput.placeholder = selectedTokenColor === 'blue' ? 'e.g. Sildar' : 'e.g. Cloaked Figure';
    friendNameInput.value = selectedFriendName;
    friendNameInput.style.cssText = 'background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#e6e6e6;' +
      'padding:0.22rem 0.4rem;font-size:0.77rem;flex:1;min-width:120px;';
    friendNameInput.oninput = function () { selectedFriendName = friendNameInput.value.trim(); };
    friendNameRow.appendChild(friendNameInput);
    container.appendChild(friendNameRow);
  }

  // Player quick-place buttons (only shown when Player color is active)
  if (selectedTokenColor === 'green' && playerRoster.length) {
    var playerPickRow = document.createElement('div');
    playerPickRow.style.cssText = 'display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.5rem;' +
      'padding:0.5rem;background:#0d1117;border:1px solid #16a34a;border-radius:6px;';
    var pickLabel = document.createElement('div');
    pickLabel.textContent = 'Click a player then click the map:';
    pickLabel.style.cssText = 'width:100%;font-size:0.72rem;color:#888;margin-bottom:0.3rem;';
    playerPickRow.appendChild(pickLabel);

    // Add Party button
    var addPartyBtn = document.createElement('button');
    addPartyBtn.textContent = addPartyMode ? '👥 Add Party: ON' : '👥 Add Party';
    addPartyBtn.style.cssText = [
      'flex:none', 'white-space:nowrap', 'padding:0.3rem 0.9rem',
      'font-size:0.78rem', 'font-weight:bold', 'border-radius:4px', 'cursor:pointer', 'color:#fff',
      'border:2px solid ' + (addPartyMode ? '#facc15' : '#374151'),
      'background:' + (addPartyMode ? 'rgba(250,204,21,0.2)' : 'rgba(0,0,0,0.4)'),
      addPartyMode ? 'box-shadow:0 0 8px #facc15' : ''
    ].join(';') + ';';
    addPartyBtn.title = 'Click then click the map to drop all party members in a cluster';
    addPartyBtn.onclick = function () {
      addPartyMode = !addPartyMode;
      if (addPartyMode) selectedPlayerName = null;
      renderTokenControls(mapUrl, mapKey);
    };
    playerPickRow.appendChild(addPartyBtn);

    playerRoster.forEach(function (p) {
      var pb = document.createElement('button');
      pb.style.cssText = [
        'flex:none',
        'white-space:nowrap',
        'padding:0.3rem 0.7rem',
        'font-size:0.78rem',
        'font-weight:bold',
        'border-radius:4px',
        'border:2px solid ' + (selectedPlayerName === p.name ? '#16a34a' : '#374151'),
        'cursor:pointer',
        'color:#fff',
        'background:' + (selectedPlayerName === p.name ? '#16a34a' : 'rgba(0,0,0,0.4)'),
        selectedPlayerName === p.name ? 'box-shadow:0 0 8px #16a34a' : ''
      ].join(';') + ';';
      pb.textContent = p.name + (p.cls ? ' · ' + p.cls : '');
      pb.onclick = function () {
        addPartyMode = false;
        selectedPlayerName = (selectedPlayerName === p.name) ? null : p.name;
        renderTokenControls(mapUrl, mapKey);
      };
      playerPickRow.appendChild(pb);
    });
    if (addPartyMode) {
      var hint = document.createElement('div');
      hint.style.cssText = 'width:100%;font-size:0.72rem;color:#facc15;margin-top:0.3rem;';
      hint.textContent = '⬆ Click anywhere on the map to place all ' + playerRoster.length + ' party members in a cluster.';
      playerPickRow.appendChild(hint);
    }
    container.appendChild(playerPickRow);
  }

  // Map preview with token overlay — goes into the grid map container
  var mapTarget = (document.getElementById('token-map-container') || container);

  // Expand/collapse header row for the token map
  var mapHeaderRow = document.createElement('div');
  mapHeaderRow.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;';
  var mapLabel = document.createElement('div');
  mapLabel.textContent = '🪬 Token Placement';
  mapLabel.style.cssText = 'font-size:0.7rem;font-weight:bold;text-transform:uppercase;letter-spacing:0.08em;color:#555;flex:1;';
  mapHeaderRow.appendChild(mapLabel);

  var expandBtn = document.createElement('button');
  expandBtn.style.cssText = 'font-size:0.72rem;padding:0.18rem 0.5rem;border-radius:4px;cursor:pointer;border:1px solid #30363d;' +
    'background:#0d1117;color:#888;white-space:nowrap;';
  expandBtn.textContent = tokenMapExpanded ? '⊟ Shrink' : '⊞ Expand';
  expandBtn.title = 'Toggle map zoom level';
  expandBtn.onclick = function () {
    tokenMapExpanded = !tokenMapExpanded;
    mapImg.style.maxHeight = tokenMapExpanded ? 'none' : '340px';
    expandBtn.textContent  = tokenMapExpanded ? '⊟ Shrink' : '⊞ Expand';
    // Redraw canvas sizing
    if (mapImg.complete) { drawCanvas.width = mapWrap.offsetWidth; drawCanvas.height = mapWrap.offsetHeight; redrawAnnotations(); }
  };
  mapHeaderRow.appendChild(expandBtn);

  var lockAllBtn = document.createElement('button');
  lockAllBtn.textContent = allPlayersLockedDm ? '🔒 All Locked' : '🔓 Lock All';
  lockAllBtn.title = allPlayersLockedDm ? 'Unlock all player movement' : 'Lock all player movement';
  lockAllBtn.style.cssText = 'font-size:0.72rem;padding:0.18rem 0.5rem;border-radius:4px;cursor:pointer;white-space:nowrap;border:1px solid ' +
    (allPlayersLockedDm ? '#f87171' : '#30363d') + ';background:' +
    (allPlayersLockedDm ? 'rgba(248,113,113,0.2)' : '#0d1117') + ';color:' +
    (allPlayersLockedDm ? '#f87171' : '#888') + ';';
  lockAllBtn.onclick = function () {
    allPlayersLockedDm = !allPlayersLockedDm;
    wsSend({ action: allPlayersLockedDm ? 'lock-all' : 'unlock-all' });
    renderTokenControls(mapUrl, mapKey);
  };
  mapHeaderRow.appendChild(lockAllBtn);

  var movePartyBtn = document.createElement('button');
  movePartyBtn.dataset.movePartyBtn = '1';
  var selCount = selectedTokenIds.size;
  movePartyBtn.textContent = movePartyMode ? ('👥 Party Move' + (selCount ? ' (' + selCount + ')' : ' — drag to select')) : '👥 Move Party';
  movePartyBtn.title = movePartyMode ? 'Drag empty space to lasso-select tokens; drag a selected token to move the group. Click to disable.' : 'Enable group movement mode';
  movePartyBtn.style.cssText = 'font-size:0.72rem;padding:0.18rem 0.5rem;border-radius:4px;cursor:pointer;white-space:nowrap;border:1px solid ' +
    (movePartyMode ? '#facc15' : '#30363d') + ';background:' +
    (movePartyMode ? 'rgba(250,204,21,0.2)' : '#0d1117') + ';color:' +
    (movePartyMode ? '#facc15' : '#888') + ';';
  movePartyBtn.onclick = function () {
    movePartyMode = !movePartyMode;
    if (!movePartyMode) selectedTokenIds.clear();
    renderTokenControls(mapUrl, mapKey);
  };
  mapHeaderRow.appendChild(movePartyBtn);

  // Grid overlay toggle button
  var gridBtn = document.createElement('button');
  gridBtn.style.cssText = 'font-size:0.72rem;padding:0.18rem 0.5rem;border-radius:4px;cursor:pointer;white-space:nowrap;border:1px solid ' +
    (gridEnabled ? '#60a5fa' : '#30363d') + ';background:' +
    (gridEnabled ? 'rgba(96,165,250,0.15)' : '#0d1117') + ';color:' +
    (gridEnabled ? '#60a5fa' : '#888') + ';';
  gridBtn.textContent = gridEnabled ? '⊞ Grid: ON' : '⊞ Grid: OFF';
  gridBtn.title = 'Toggle grid overlay on all screens (helps track movement per cell)';
  gridBtn.onclick = function () { wsSend({ action: 'toggle-grid' }); };
  mapHeaderRow.appendChild(gridBtn);

  if (movePartyMode) {
    var selAllBtn = document.createElement('button');
    selAllBtn.textContent = '☑ All Players';
    selAllBtn.title = 'Select all player tokens';
    selAllBtn.style.cssText = 'font-size:0.72rem;padding:0.18rem 0.5rem;border-radius:4px;cursor:pointer;white-space:nowrap;' +
      'border:1px solid #30363d;background:#0d1117;color:#aaa;';
    selAllBtn.onclick = function () {
      (tokenState[mapKey] || []).forEach(function (t) { selectedTokenIds.add(t.id); });
      renderTokenControls(mapUrl, mapKey);
    };
    mapHeaderRow.appendChild(selAllBtn);

    var clearSelBtn = document.createElement('button');
    clearSelBtn.textContent = '✕ Clear';
    clearSelBtn.title = 'Clear selection';
    clearSelBtn.style.cssText = 'font-size:0.72rem;padding:0.18rem 0.5rem;border-radius:4px;cursor:pointer;white-space:nowrap;' +
      'border:1px solid #30363d;background:#0d1117;color:#aaa;';
    clearSelBtn.onclick = function () {
      selectedTokenIds.clear();
      renderTokenControls(mapUrl, mapKey);
    };
    mapHeaderRow.appendChild(clearSelBtn);
  }
  mapTarget.appendChild(mapHeaderRow);

  var mapWrap = document.createElement('div');
  mapWrap.style.cssText = 'position:relative;display:inline-block;max-width:100%;' +
    'margin-bottom:0.5rem;border:1px solid ' + (drawModeActive ? '#facc15' : '#444') + ';' +
    'cursor:' + (drawModeActive ? 'none' : 'crosshair') + ';';

  var mapImg = document.createElement('img');
  mapImg.src = mapUrl;
  mapImg.style.cssText = 'display:block;max-width:100%;max-height:' + (tokenMapExpanded ? 'none' : '340px') + ';object-fit:contain;user-select:none;pointer-events:none;';
  mapWrap.appendChild(mapImg);

  // Token dots on the DM preview — draggable
  var previewOverlay = document.createElement('div');
  previewOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;';

  // ── Draw canvas layer (on top of token overlay) ──────────────
  var drawCanvas = document.createElement('canvas');
  drawCanvas.style.cssText = 'position:absolute;inset:0;z-index:20;' +
    (drawModeActive ? 'cursor:crosshair;pointer-events:auto;' : 'pointer-events:none;display:none;');

  var drawCtx = drawCanvas.getContext('2d');
  if (!drawStrokes[mapKey]) drawStrokes[mapKey] = [];

  function getDrawRect() {
    var cW = mapWrap.offsetWidth, cH = mapWrap.offsetHeight;
    var iW = mapImg.naturalWidth, iH = mapImg.naturalHeight;
    if (!iW || !iH) return { offX: 0, offY: 0, rendW: cW, rendH: cH };
    var scale = Math.min(cW / iW, cH / iH);
    var rendW = iW * scale, rendH = iH * scale;
    return { offX: (cW - rendW) / 2, offY: (cH - rendH) / 2, rendW: rendW, rendH: rendH };
  }
  function canvasToNormDraw(px, py) {
    var r = getDrawRect();
    return { x: (px - r.offX) / r.rendW, y: (py - r.offY) / r.rendH };
  }
  function normToCanvasDraw(nx, ny) {
    var r = getDrawRect();
    return { x: r.offX + nx * r.rendW, y: r.offY + ny * r.rendH };
  }
  function redrawAnnotations() {
    if (!drawCanvas.width || !drawCanvas.height) return;
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    var strokes = drawStrokes[mapKey] || [];
    var r = getDrawRect();
    strokes.forEach(function (stroke) {
      if (!stroke.points || stroke.points.length < 2) return;
      drawCtx.save();
      drawCtx.strokeStyle = stroke.erase ? 'rgba(0,0,0,1)' : stroke.color;
      drawCtx.lineWidth   = Math.max(2, stroke.width * Math.min(r.rendW, r.rendH));
      drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';
      drawCtx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
      drawCtx.beginPath();
      var p0 = normToCanvasDraw(stroke.points[0].x, stroke.points[0].y);
      drawCtx.moveTo(p0.x, p0.y);
      for (var i = 1; i < stroke.points.length; i++) {
        var pt = normToCanvasDraw(stroke.points[i].x, stroke.points[i].y);
        drawCtx.lineTo(pt.x, pt.y);
      }
      drawCtx.stroke();
      drawCtx.restore();
    });
  }
  function sizeDrawCanvas() {
    drawCanvas.width  = mapWrap.offsetWidth;
    drawCanvas.height = mapWrap.offsetHeight;
    redrawAnnotations();
  }
  mapImg.addEventListener('load', sizeDrawCanvas);
  if (mapImg.complete && mapImg.naturalWidth) setTimeout(sizeDrawCanvas, 10);

  // Grid overlay on DM preview
  function renderDmGridNow() {
    var oldGrid = mapWrap.querySelector('.dm-grid-overlay');
    if (oldGrid) oldGrid.remove();
    if (!gridEnabled) return;
    var cols = (dmMapMeta && dmMapMeta.cols) || 20;
    var rows = (dmMapMeta && dmMapMeta.rows) || 20;
    var svgNS = 'http://www.w3.org/2000/svg';
    var g = document.createElementNS(svgNS, 'svg');
    g.setAttribute('class', 'dm-grid-overlay');
    g.setAttribute('viewBox', '0 0 100 100');
    g.setAttribute('preserveAspectRatio', 'none');
    g.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;width:100%;height:100%;';
    for (var ci = 0; ci <= cols; ci++) {
      var vl = document.createElementNS(svgNS, 'line');
      var vx = (ci / cols) * 100;
      vl.setAttribute('x1', vx); vl.setAttribute('y1', 0);
      vl.setAttribute('x2', vx); vl.setAttribute('y2', 100);
      vl.setAttribute('stroke', 'white'); vl.setAttribute('stroke-opacity', '0.22');
      vl.setAttribute('stroke-width', '0.25');
      g.appendChild(vl);
    }
    for (var ri = 0; ri <= rows; ri++) {
      var hl = document.createElementNS(svgNS, 'line');
      var hy = (ri / rows) * 100;
      hl.setAttribute('x1', 0); hl.setAttribute('y1', hy);
      hl.setAttribute('x2', 100); hl.setAttribute('y2', hy);
      hl.setAttribute('stroke', 'white'); hl.setAttribute('stroke-opacity', '0.22');
      hl.setAttribute('stroke-width', '0.25');
      g.appendChild(hl);
    }
    mapWrap.appendChild(g);
  }
  mapImg.addEventListener('load', renderDmGridNow);
  if (mapImg.complete && mapImg.naturalWidth) setTimeout(renderDmGridNow, 15);
  var drawingActive = false;
  var currentDrawStroke = null;
  function getDrawMousePos(e) {
    var rect = drawCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  drawCanvas.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    drawingActive = true;
    var pos = getDrawMousePos(e);
    currentDrawStroke = { color: drawTool.color, width: drawTool.width, erase: drawTool.erase, points: [canvasToNormDraw(pos.x, pos.y)] };
  });
  drawCanvas.addEventListener('mousemove', function (e) {
    if (!drawingActive || !currentDrawStroke) return;
    var pos = getDrawMousePos(e);
    currentDrawStroke.points.push(canvasToNormDraw(pos.x, pos.y));
    redrawAnnotations();
    var r = getDrawRect();
    drawCtx.save();
    drawCtx.strokeStyle = currentDrawStroke.erase ? 'rgba(0,0,0,1)' : currentDrawStroke.color;
    drawCtx.lineWidth   = Math.max(2, currentDrawStroke.width * Math.min(r.rendW, r.rendH));
    drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';
    drawCtx.globalCompositeOperation = currentDrawStroke.erase ? 'destination-out' : 'source-over';
    drawCtx.beginPath();
    var pts = currentDrawStroke.points;
    var p0 = normToCanvasDraw(pts[0].x, pts[0].y);
    drawCtx.moveTo(p0.x, p0.y);
    for (var i = 1; i < pts.length; i++) {
      var pt = normToCanvasDraw(pts[i].x, pts[i].y);
      drawCtx.lineTo(pt.x, pt.y);
    }
    drawCtx.stroke();
    drawCtx.restore();
  });
  function finishDrawStroke() {
    if (!drawingActive || !currentDrawStroke) return;
    drawingActive = false;
    if (currentDrawStroke.points.length > 1) {
      if (!drawStrokes[mapKey]) drawStrokes[mapKey] = [];
      drawStrokes[mapKey].push(currentDrawStroke);
      sendDrawUpdate(mapKey);
    }
    currentDrawStroke = null;
    redrawAnnotations();
  }
  drawCanvas.addEventListener('mouseup',    finishDrawStroke);
  drawCanvas.addEventListener('mouseleave', finishDrawStroke);

  var wasDragging = false; // prevent map click after a drag

  // ── Lasso selection rectangle (visible only in movePartyMode) ─
  var selRect = document.createElement('div');
  selRect.style.cssText = 'display:none;position:absolute;border:2px dashed #facc15;' +
    'background:rgba(250,204,21,0.08);pointer-events:none;z-index:15;box-sizing:border-box;';
  previewOverlay.appendChild(selRect);

  // Refresh dot borders/glows to reflect current selectedTokenIds
  function updateSelectionVisuals() {
    (tokenState[mapKey] || []).forEach(function (t) {
      var dotEl = previewOverlay.querySelector('[data-tok-id="' + t.id + '"]');
      if (!dotEl) return;
      var sel = selectedTokenIds.has(t.id);
      dotEl.style.border = sel ? '2px solid #facc15' :
        (t.mobType ? '2px solid rgba(255,255,255,0.6)' : '2px solid rgba(255,255,255,0.9)');
      dotEl.style.outline = sel ? '2px solid rgba(250,204,21,0.45)' : '';
      dotEl.style.zIndex  = sel ? '12' : '10';
    });
    // Update button label with count
    var btn = document.querySelector('[data-move-party-btn="1"]');
    if (btn) {
      var cnt = selectedTokenIds.size;
      btn.textContent = '👥 Party Move' + (cnt ? ' (' + cnt + ')' : ' — drag to select');
    }
  }

  // Lasso drag on empty map space when movePartyMode is on
  mapWrap.addEventListener('mousedown', function (e) {
    if (!movePartyMode) return;
    if (drawModeActive) return;
    // Only fire if the click target is the map itself (not a token dot)
    if (e.target !== mapWrap && e.target !== mapImg && !e.target.classList.contains('sel-target')) return;
    e.preventDefault();
    var wRect = mapWrap.getBoundingClientRect();
    var startNX = (e.clientX - wRect.left)  / wRect.width;
    var startNY = (e.clientY - wRect.top)   / wRect.height;
    var didLasso = false;

    selRect.style.left   = (startNX * 100) + '%';
    selRect.style.top    = (startNY * 100) + '%';
    selRect.style.width  = '0';
    selRect.style.height = '0';
    selRect.style.display = 'block';

    function onLassoMove(ev) {
      var curNX = (ev.clientX - wRect.left) / wRect.width;
      var curNY = (ev.clientY - wRect.top)  / wRect.height;
      var l = Math.min(startNX, curNX), r2 = Math.max(startNX, curNX);
      var t2 = Math.min(startNY, curNY), b = Math.max(startNY, curNY);
      selRect.style.left   = (l  * 100) + '%';
      selRect.style.top    = (t2 * 100) + '%';
      selRect.style.width  = ((r2 - l) * 100) + '%';
      selRect.style.height = ((b - t2) * 100) + '%';
      if (Math.abs(curNX - startNX) > 0.015 || Math.abs(curNY - startNY) > 0.015) didLasso = true;
    }

    function onLassoUp(ev) {
      document.removeEventListener('mousemove', onLassoMove);
      document.removeEventListener('mouseup',   onLassoUp);
      selRect.style.display = 'none';
      if (didLasso) {
        var curNX = (ev.clientX - wRect.left) / wRect.width;
        var curNY = (ev.clientY - wRect.top)  / wRect.height;
        var l = Math.min(startNX, curNX), r2 = Math.max(startNX, curNX);
        var t2 = Math.min(startNY, curNY), b = Math.max(startNY, curNY);
        // Select all tokens inside the rectangle
        (tokenState[mapKey] || []).forEach(function (t) {
          if (t.x >= l && t.x <= r2 && t.y >= t2 && t.y <= b) selectedTokenIds.add(t.id);
        });
        updateSelectionVisuals();
        wasDragging = true;
        setTimeout(function () { wasDragging = false; }, 80);
      } else {
        // Bare click on empty space — clear selection
        selectedTokenIds.clear();
        updateSelectionVisuals();
      }
    }

    document.addEventListener('mousemove', onLassoMove);
    document.addEventListener('mouseup',   onLassoUp);
  });

  function makeDot(tok) {
    // Look up initiative entry to get current conditions for ring display
    var initEntry = initiative.find(function (e) { return e.name === tok.label; });
    var dispConds = initEntry ? (initEntry.conditions || []) : [];
    var dispTok   = Object.assign({}, tok, { conditions: dispConds });

    var isSelected = selectedTokenIds.has(tok.id);
    var isItem = tok.type === 'item';
    var isHidden = !!tok.hidden;
    // Items cannot be combat targets
    var isTargeted  = !isItem && Object.values(dmTargets).indexOf(tok.label) !== -1;
    var targetingThis = isItem ? [] : Object.keys(dmTargets).filter(function(p){ return dmTargets[p] === tok.label; });
    var dot = document.createElement('div');
    dot.dataset.tokId = tok.id || '';
    dot.dataset.tokenLabel = tok.label || '';
    dot.style.cssText = 'position:absolute;width:20px;height:20px;' +
      'border-radius:' + (isItem ? '4px' : '50%') + ';' +
      'background:' + tokenBgColor(tok) + ';' +
      'border:2px solid ' + (isSelected ? '#facc15' : isItem ? '#fbbf24' : isHidden ? '#a78bfa' : (tok.mobType ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.9)')) + ';' +
      (isSelected ? 'outline:2px solid rgba(250,204,21,0.45);' : '') +
      (isTargeted  ? 'box-shadow:0 0 0 3px rgba(239,68,68,0.9),0 0 0 6px rgba(239,68,68,0.3),' + makeConditionShadow(dispTok) + ';' : 'box-shadow:' + makeConditionShadow(dispTok) + ';') +
      'display:flex;align-items:center;justify-content:center;' +
      'flex-direction:column;overflow:visible;' +
      'left:' + (tok.x * 100) + '%;top:' + (tok.y * 100) + '%;transform:translate(-50%,-50%);' +
      'opacity:' + (isHidden ? '0.45' : '1') + ';' +
      'cursor:move;pointer-events:auto;z-index:' + (isSelected ? '12' : '10') + ';user-select:none;';

    var titleParts = [tok.label || ''];
    if (isHidden) titleParts.push('👁️‍🗨️ Hidden from players');
    if (dispConds.length) titleParts.push(dispConds.map(function (c) { return c.icon + ' ' + c.name; }).join(', '));
    dot.title = titleParts.join(' | ');

    // Hidden indicator badge
    if (isHidden) {
      var hideBadge = document.createElement('span');
      hideBadge.textContent = '🙈';
      hideBadge.style.cssText = 'position:absolute;top:-8px;left:-8px;font-size:9px;pointer-events:none;z-index:5;';
      dot.appendChild(hideBadge);
    }
    if (isItem) {
      var itemIconEl = document.createElement('span');
      itemIconEl.textContent = ITEM_ICONS[tok.itemType] || '🎁';
      itemIconEl.style.cssText = 'font-size:11px;line-height:1;display:block;pointer-events:none;';
      dot.appendChild(itemIconEl);
      var itemNum = tok.label ? tok.label.replace(tok.itemType || '', '').trim() : '';
      if (itemNum) {
        var itemNumEl = document.createElement('span');
        itemNumEl.textContent = itemNum;
        itemNumEl.style.cssText = 'color:#fbbf24;font-weight:bold;font-size:7px;line-height:1;font-family:sans-serif;pointer-events:none;';
        dot.appendChild(itemNumEl);
      }
    } else if (tok.type === 'player' && tok.cls && MOB_ICONS_CLASS[tok.cls]) {
      var iconEl = document.createElement('span');
      iconEl.textContent = MOB_ICONS_CLASS[tok.cls];
      iconEl.style.cssText = 'font-size:11px;line-height:1;display:block;pointer-events:none;';
      dot.appendChild(iconEl);
      var nmEl = document.createElement('span');
      nmEl.textContent = tok.label;
      nmEl.style.cssText = 'color:#fff;font-weight:bold;font-size:6px;line-height:1;' +
        'font-family:sans-serif;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.9);' +
        'white-space:nowrap;overflow:hidden;max-width:18px;';
      dot.appendChild(nmEl);
    } else if (tok.mobType && (MOB_ICONS[tok.mobType] || MOB_ICONS_CLASS[tok.mobType])) {
      var iconEl = document.createElement('span');
      iconEl.textContent = MOB_ICONS[tok.mobType] || MOB_ICONS_CLASS[tok.mobType];
      iconEl.style.cssText = 'font-size:11px;line-height:1;display:block;pointer-events:none;';
      dot.appendChild(iconEl);
      var num = tok.label ? tok.label.replace(tok.mobType, '').trim() : '';
      if (num) {
        var numEl = document.createElement('span');
        numEl.textContent = num;
        numEl.style.cssText = 'color:#fff;font-weight:bold;font-size:7px;line-height:1;' +
          'font-family:sans-serif;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.9);';
        dot.appendChild(numEl);
      }
    } else if (tok.label) {
      var lbl = document.createElement('span');
      lbl.textContent = tok.label;
      lbl.style.cssText = 'color:#fff;font-weight:bold;font-size:8px;font-family:sans-serif;' +
        'line-height:1;user-select:none;pointer-events:none;';
      dot.appendChild(lbl);
    }
    // Targeting indicator: show crosshair + attacker names on targeted tokens
    if (isTargeted) {
      var xh = document.createElement('span');
      xh.textContent = '🎯';
      xh.style.cssText = 'position:absolute;top:-9px;right:-9px;font-size:10px;pointer-events:none;z-index:5;';
      dot.appendChild(xh);
      if (targetingThis.length) {
        var atkBadge = document.createElement('span');
        atkBadge.textContent = targetingThis.join(',');
        atkBadge.style.cssText = 'position:absolute;top:22px;left:50%;transform:translateX(-50%);' +
          'font-size:7px;color:#f87171;font-family:sans-serif;font-weight:bold;white-space:nowrap;' +
          'pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,1);';
        dot.appendChild(atkBadge);
      }
    }
    // Death overlay — red X on dead tokens
    if (tok.dead) {
      var deadX = document.createElement('div');
      deadX.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
        'pointer-events:none;z-index:6;font-size:13px;font-weight:bold;color:#ef4444;' +
        'text-shadow:0 1px 3px rgba(0,0,0,0.9);line-height:1;';
      deadX.textContent = '✕';
      dot.appendChild(deadX);
      dot.style.opacity = '0.5';
      dot.style.border = '2px solid #ef4444';
    }

    // Right-click context menu
    dot.addEventListener('contextmenu', (function (t) {
      return function (e) {
        e.preventDefault();
        e.stopPropagation();
        // Remove any existing context menu
        var old = document.getElementById('tok-ctx-menu');
        if (old) old.remove();
        var menu = document.createElement('div');
        menu.id = 'tok-ctx-menu';
        menu.style.cssText = 'position:fixed;z-index:9999;background:#1a1f2e;border:1px solid #30363d;' +
          'border-radius:6px;padding:0.3rem 0;min-width:160px;box-shadow:0 4px 16px rgba(0,0,0,0.7);' +
          'font-size:0.82rem;';
        menu.style.left = e.clientX + 'px';
        menu.style.top  = e.clientY + 'px';
        // Header
        var hdr = document.createElement('div');
        hdr.style.cssText = 'padding:0.3rem 0.75rem 0.25rem;font-size:0.72rem;color:#d4af37;font-weight:bold;' +
          'border-bottom:1px solid #30363d;margin-bottom:0.2rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;';
        hdr.textContent = t.label + ' (' + t.color + ')';
        menu.appendChild(hdr);
        function menuItem(label, action) {
          var item = document.createElement('div');
          item.style.cssText = 'padding:0.3rem 0.75rem;cursor:pointer;color:#e6e6e6;white-space:nowrap;';
          item.textContent = label;
          item.onmouseenter = function () { item.style.background = 'rgba(255,255,255,0.08)'; };
          item.onmouseleave = function () { item.style.background = ''; };
          item.onclick = function (ev) {
            ev.stopPropagation();
            menu.remove();
            action();
          };
          menu.appendChild(item);
        }
        // Visibility toggle
        menuItem(t.hidden ? '👁️ Reveal (show to players)' : '🙈 Hide (from players)', function () {
          t.hidden = !t.hidden;
          sendTokenUpdate(mapKey);
          renderTokenControls(mapUrl, mapKey);
        });
        // Lock/unlock (player tokens only)
        if (t.type === 'player' && t.label) {
          var isLk = allPlayersLockedDm || !!playerLockState[t.label];
          menuItem(isLk ? '🔓 Unlock Movement' : '🔒 Lock Movement', function () {
            if (allPlayersLockedDm) return;
            if (isLk) { playerLockState[t.label] = false; wsSend({ action: 'unlock-player', name: t.label }); }
            else { playerLockState[t.label] = true; wsSend({ action: 'lock-player', name: t.label }); }
            renderTokenControls(mapUrl, mapKey);
          });
        }
        // Death toggle
        menuItem(t.dead ? '💚 Revive' : '💀 Mark Dead', function () {
          t.dead = !t.dead;
          if (t.dead) {
            // Remove from initiative
            initiative = initiative.filter(function (en) { return en.name !== t.label; });
            if (fogDeferredInit[mapKey]) fogDeferredInit[mapKey] = fogDeferredInit[mapKey].filter(function (d) { return d.label !== t.label; });
            renderInitiative();
          }
          sendTokenUpdate(mapKey);
          renderTokenControls(mapUrl, mapKey);
        });
        // Separator
        var sep = document.createElement('div');
        sep.style.cssText = 'border-top:1px solid #30363d;margin:0.2rem 0;';
        menu.appendChild(sep);
        // Remove
        menuItem('✕ Remove Token', function () {
          initiative = initiative.filter(function (en) { return en.name !== t.label; });
          if (fogDeferredInit[mapKey]) fogDeferredInit[mapKey] = fogDeferredInit[mapKey].filter(function (d) { return d.label !== t.label; });
          renderInitiative();
          tokenState[mapKey] = tokenState[mapKey].filter(function (tk) { return tk.id !== t.id; });
          sendTokenUpdate(mapKey);
          renderTokenControls(mapUrl, mapKey);
        });
        document.body.appendChild(menu);
        // Clamp to viewport
        var mRect = menu.getBoundingClientRect();
        if (mRect.right  > window.innerWidth)  menu.style.left = (e.clientX - mRect.width  + 4) + 'px';
        if (mRect.bottom > window.innerHeight) menu.style.top  = (e.clientY - mRect.height + 4) + 'px';
        // Dismiss on outside click
        function dismissMenu(ev) {
          if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', dismissMenu); }
        }
        setTimeout(function () { document.addEventListener('mousedown', dismissMenu); }, 10);
      };
    })(tok));

    // Stop map click from firing when clicking a dot; toggle selection in party-move mode
    dot.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!movePartyMode || wasDragging) return;
      if (selectedTokenIds.has(tok.id)) { selectedTokenIds.delete(tok.id); }
      else { selectedTokenIds.add(tok.id); }
      updateSelectionVisuals();
    });

    // Drop target: drag a condition row onto this token dot
    dot.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      dot.style.outline = '3px dashed #d4af37';
    });
    dot.addEventListener('dragleave', function () { dot.style.outline = ''; });
    dot.addEventListener('drop', function (e) {
      e.preventDefault();
      dot.style.outline = '';
      var raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      var cond; try { cond = JSON.parse(raw); } catch(ex) { return; }
      var entry = initiative.find(function (en) { return en.name === tok.label; });
      if (entry) {
        showCondDropPopup(e.clientX, e.clientY, cond, function (rounds) {
          if (!entry.conditions) entry.conditions = [];
          entry.conditions.push({ name: cond.name, icon: cond.icon, type: cond.type, rounds: rounds });
          saveInitiative();
          renderInitiative();
          sendTokenUpdate(mapKey);
          renderTokenControls(mapUrl, mapKey);
        });
      } else {
        // Token not in initiative — show brief flash on dot
        dot.style.outline = '3px solid #ef4444';
        setTimeout(function () { dot.style.outline = ''; }, 800);
      }
    });

    dot.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var didMove = false;
      var lastClientX = e.clientX;
      var lastClientY = e.clientY;

      function onMove(ev) {
        var rect = mapWrap.getBoundingClientRect();
        if (movePartyMode && selectedTokenIds.has(tok.id) && selectedTokenIds.size > 1) {
          // Move all selected tokens by the same delta
          var dx = (ev.clientX - lastClientX) / rect.width;
          var dy = (ev.clientY - lastClientY) / rect.height;
          lastClientX = ev.clientX;
          lastClientY = ev.clientY;
          (tokenState[mapKey] || []).forEach(function (t) {
            if (!selectedTokenIds.has(t.id)) return;
            t.x = Math.max(0, Math.min(1, t.x + dx));
            t.y = Math.max(0, Math.min(1, t.y + dy));
            var dotEl = previewOverlay.querySelector('[data-tok-id="' + t.id + '"]');
            if (dotEl) { dotEl.style.left = (t.x * 100) + '%'; dotEl.style.top = (t.y * 100) + '%'; }
          });
        } else {
          tok.x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
          tok.y = Math.max(0, Math.min(1, (ev.clientY - rect.top)  / rect.height));
          dot.style.left = (tok.x * 100) + '%';
          dot.style.top  = (tok.y * 100) + '%';
        }
        didMove = true;
        wasDragging = true;
        dot.style.boxShadow = '0 0 10px rgba(255,255,255,0.6)';
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        dot.style.boxShadow = makeConditionShadow(dispTok);
        if (didMove) {
          // Snap whole group or single token to grid cell centre on release
          if (gridEnabled && dmMapMeta) {
            if (movePartyMode && selectedTokenIds.has(tok.id) && selectedTokenIds.size > 1) {
              (tokenState[mapKey] || []).forEach(function (t) {
                if (!selectedTokenIds.has(t.id)) return;
                var s = snapPosToGrid(t.x, t.y);
                t.x = s.x; t.y = s.y;
                var dotEl = previewOverlay.querySelector('[data-tok-id="' + t.id + '"]');
                if (dotEl) { dotEl.style.left = (t.x * 100) + '%'; dotEl.style.top = (t.y * 100) + '%'; }
              });
            } else {
              var sn = snapPosToGrid(tok.x, tok.y);
              tok.x = sn.x; tok.y = sn.y;
              dot.style.left = (tok.x * 100) + '%';
              dot.style.top  = (tok.y * 100) + '%';
            }
          }
          sendTokenUpdate(mapKey);
          updateFogTokenOverlay();
        }
        setTimeout(function () { wasDragging = false; }, 80);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    return dot;
  }

  (tokenState[mapKey] || []).forEach(function (tok) {
    previewOverlay.appendChild(makeDot(tok));
  });
  mapWrap.appendChild(previewOverlay);
  mapWrap.appendChild(drawCanvas);

  // Click on empty map area to place a new token (token mode only)
  mapWrap.addEventListener('click', function (e) {
    if (drawModeActive) return; // draw mode — canvas handles input
    if (wasDragging) return;
    if (movePartyMode) {
      // In party-move mode, bare click clears selection (handled by lasso-up, but fallback here)
      selectedTokenIds.clear();
      updateSelectionVisuals();
      return;
    }
    if (selectedTokenColor === null) return; // placement is off
    var rect = mapWrap.getBoundingClientRect();
    var x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    var y = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height));
    if (gridEnabled && dmMapMeta) { var sp = snapPosToGrid(x, y); x = sp.x; y = sp.y; }
    // ── Add Party mode: place all party members in a grid around click ──
    if (selectedTokenColor === 'green' && addPartyMode && playerRoster.length) {
      var n = playerRoster.length;
      var cols2 = Math.ceil(Math.sqrt(n));
      var rows2 = Math.ceil(n / cols2);
      var spacing = 0.05; // normalized spacing between tokens
      var totalW = (cols2 - 1) * spacing;
      var totalH = (rows2 - 1) * spacing;
      var startX = x - totalW / 2;
      var startY = y - totalH / 2;
      playerRoster.forEach(function (p, i) {
        var col2 = i % cols2;
        var row2 = Math.floor(i / cols2);
        var tx = Math.max(0.01, Math.min(0.99, startX + col2 * spacing));
        var ty = Math.max(0.01, Math.min(0.99, startY + row2 * spacing));
        var existing2 = tokenState[mapKey].find(function (t) { return t.color === 'green' && t.label === p.name; });
        if (existing2) {
          existing2.x = tx; existing2.y = ty;
        } else {
          var tid = 'tok-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
          var nt = { id: tid, x: tx, y: ty, color: 'green', label: p.name, type: 'player', cls: p.cls || '' };
          tokenState[mapKey].push(nt);
          if (autoAddToInit) {
            var alreadyIn = initiative.some(function (e) { return e.name === p.name; });
            if (!alreadyIn) addToInitiative(p.name, Math.floor(Math.random() * 20) + 1, false, '');
          }
        }
      });
      sendTokenUpdate(mapKey);
      addPartyMode = false;
      renderTokenControls(mapUrl, mapKey);
      return;
    }

    var label;
    if (selectedTokenColor === 'green') {
      if (!selectedPlayerName) return; // must pick a player first
      // Only one token per player — move if already exists
      var existing = tokenState[mapKey].find(function (t) { return t.color === 'green' && t.label === selectedPlayerName; });
      if (existing) {
        existing.x = x; existing.y = y;
        sendTokenUpdate(mapKey);
        renderTokenControls(mapUrl, mapKey);
        return;
      }
      label = selectedPlayerName;
    } else if (selectedTokenColor === 'item') {
      var itemCount = tokenState[mapKey].filter(function (t) {
        return t.itemType === selectedItemType;
      }).length + 1;
      label = selectedItemType + ' ' + itemCount;
    } else if (selectedTokenColor === 'red') {
      if (selectedEnemyName) {
        var baseName = selectedEnemyName;
        var sameNameCount = tokenState[mapKey].filter(function (t) {
          return t.label === baseName || t.label.startsWith(baseName + ' ');
        }).length;
        label = sameNameCount === 0 ? baseName : baseName + ' ' + (sameNameCount + 1);
      } else if (selectedMobType) {
        var typeCount = tokenState[mapKey].filter(function (t) {
          return t.label.startsWith(selectedMobType + ' ');
        }).length + 1;
        label = selectedMobType + ' ' + typeCount;
      } else {
        var count = tokenState[mapKey].filter(function (t) { return t.color === 'red'; }).length + 1;
        label = 'E' + count;
      }
    } else {
      // blue / yellow
      if (selectedFriendName) {
        var baseName = selectedFriendName;
        var sameNameCount = tokenState[mapKey].filter(function (t) {
          return t.label === baseName || t.label.startsWith(baseName + ' ');
        }).length;
        label = sameNameCount === 0 ? baseName : baseName + ' ' + (sameNameCount + 1);
      } else {
        var prefix = { blue: 'F', yellow: 'U' }[selectedTokenColor] || '?';
        var count  = tokenState[mapKey].filter(function (t) { return t.color === selectedTokenColor; }).length + 1;
        label = prefix + count;
      }
    }
    var id = 'tok-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    var newTok = { id: id, x: x, y: y, color: selectedTokenColor, label: label };
    if (selectedTokenColor === 'green') {
      var rp = playerRoster.find(function (p) { return p.name === selectedPlayerName; });
      if (rp) { newTok.type = 'player'; newTok.cls = rp.cls; }
    } else if (selectedTokenColor === 'item') {
      newTok.type = 'item';
      newTok.itemType = selectedItemType;
    } else if (selectedTokenColor === 'red' && selectedMobType) {
      newTok.mobType = selectedMobType;
    }
    tokenState[mapKey].push(newTok);
    sendTokenUpdate(mapKey);
    renderTokenControls(mapUrl, mapKey);
    // Auto-add to initiative if toggle is on and not already present (items are never added)
    if (autoAddToInit && selectedTokenColor !== 'green' && selectedTokenColor !== 'item') {
      var alreadyInInit = initiative.some(function (e) { return e.name === label; });
      if (!alreadyInInit) {
        // Check if the token's map cell is still fogged
        var fogKey2 = activeFogKey;
        var isFogged = false;
        if (fogKey2 && window.fogStates && window.fogStates[fogKey2]) {
          var fr = Math.min(fogRows - 1, Math.floor(y * fogRows));
          var fc = Math.min(fogCols - 1, Math.floor(x * fogCols));
          isFogged = !window.fogStates[fogKey2][fr][fc];
        }
        if (isFogged) {
          // Defer — add when that cell is revealed
          if (!fogDeferredInit[mapKey]) fogDeferredInit[mapKey] = [];
          fogDeferredInit[mapKey].push({ label: label, roll: Math.floor(Math.random() * 20) + 1, fr: fr, fc: fc });
        } else {
          addToInitiative(label, Math.floor(Math.random() * 20) + 1, false, '');
        }
      }
    }
  });

  mapTarget.appendChild(mapWrap);

  // Feature cell overlay on token map — mirrors fog map overlay for non-fog maps
  var tokFeatOverlay = document.createElement('div');
  tokFeatOverlay.className = 'dm-feat-overlay';
  tokFeatOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;';
  mapWrap.appendChild(tokFeatOverlay);

  // Object layer on token map
  var tokObjLayer = document.createElement('div');
  tokObjLayer.className = 'dm-obj-layer';
  tokObjLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;';
  mapWrap.appendChild(tokObjLayer);

  updateDmFeatureOverlay();
  renderDmObjectLayer();
  var tokens = tokenState[mapKey] || [];
  if (tokens.length) {
    // ── Collapsible token list header ──────────────────────────────────
    var listToggleBtn = document.createElement('button');
    var listCollapsed = true; // collapsed by default
    listToggleBtn.textContent = '▶ Token List (' + tokens.length + ')';
    listToggleBtn.style.cssText = 'display:block;width:100%;text-align:left;margin-top:0.25rem;' +
      'padding:0.28rem 0.6rem;font-size:0.75rem;border-radius:4px;cursor:pointer;' +
      'border:1px solid #30363d;background:#0d1117;color:#999;';
    listToggleBtn.onclick = function () {
      listCollapsed = !listCollapsed;
      listToggleBtn.textContent = (listCollapsed ? '▶' : '▼') + ' Token List (' + tokens.length + ')';
      listDiv.style.display = listCollapsed ? 'none' : 'block';
    };
    mapTarget.appendChild(listToggleBtn);
    var listDiv = document.createElement('div');
    listDiv.style.cssText = 'margin-top:0.25rem;display:none;'; // collapsed by default
    tokens.forEach(function (tok, idx) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:0.4rem;margin-bottom:0.25rem;';
      var dot = document.createElement('span');
      dot.style.cssText = 'width:14px;height:14px;border-radius:50%;flex-shrink:0;' +
        'background:' + tokenBgColor(tok) + ';border:2px solid rgba(255,255,255,0.4);' +
        'display:inline-flex;align-items:center;justify-content:center;font-size:8px;';
      if (tok.type === 'player' && tok.cls && MOB_ICONS_CLASS[tok.cls]) dot.textContent = MOB_ICONS_CLASS[tok.cls];
      else if (tok.mobType && MOB_ICONS[tok.mobType]) dot.textContent = MOB_ICONS[tok.mobType];
      row.appendChild(dot);
      var lbl = document.createElement('span');
      lbl.style.cssText = 'flex:1;font-size:0.75rem;color:#ccc;';
      lbl.textContent = tok.label + ' (' + tok.color + ')';
      row.appendChild(lbl);
      // Show conditions from initiative tracker
      var initEntry = initiative.find(function (e) { return e.name === tok.label; });
      if (initEntry && initEntry.conditions && initEntry.conditions.length) {
        var condWrap = document.createElement('span');
        condWrap.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;align-items:center;max-width:160px;';
        initEntry.conditions.forEach(function (c) {
          var badge = document.createElement('span');
          badge.title = c.type;
          var roundLabel = c.rounds === null ? '∞' : c.rounds + 'r';
          badge.textContent = (c.icon || '') + ' ' + c.name + ' ' + roundLabel;
          badge.style.cssText = 'font-size:0.65rem;line-height:1.3;padding:1px 4px;border-radius:3px;white-space:nowrap;' +
            'background:' + (c.type === 'buff' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)') + ';' +
            'border:1px solid ' + (c.type === 'buff' ? '#22c55e' : '#ef4444') + ';' +
            'color:' + (c.type === 'buff' ? '#4ade80' : '#f87171') + ';';
          condWrap.appendChild(badge);
        });
        row.appendChild(condWrap);
      }
      // Lock toggle for player tokens
      if (tok.type === 'player' && tok.label) {
        var isLocked = allPlayersLockedDm || !!playerLockState[tok.label];
        var lockBtn = document.createElement('button');
        lockBtn.textContent = isLocked ? '�' : '🔓';
        lockBtn.title = isLocked ? 'Unlock movement' : 'Lock movement';
        lockBtn.style.cssText = 'font-size:0.75rem;padding:0.05rem 0.3rem;min-width:0;flex:none;border-radius:3px;cursor:pointer;' +
          'border:1px solid ' + (isLocked ? '#f87171' : '#444') + ';' +
          'background:' + (isLocked ? 'rgba(248,113,113,0.15)' : 'rgba(0,0,0,0.3)') + ';' +
          'color:' + (isLocked ? '#f87171' : '#666') + ';' +
          (allPlayersLockedDm ? 'opacity:0.5;cursor:default;' : '');
        lockBtn.onclick = (function (name, locked) {
          return function () {
            if (allPlayersLockedDm) return;
            if (locked) {
              playerLockState[name] = false;
              wsSend({ action: 'unlock-player', name: name });
            } else {
              playerLockState[name] = true;
              wsSend({ action: 'lock-player', name: name });
            }
            renderTokenControls(mapUrl, mapKey);
          };
        }(tok.label, isLocked));
        row.appendChild(lockBtn);
      }

      // Visibility toggle
      var eyeBtn2 = document.createElement('button');
        eyeBtn2.textContent = tok.hidden ? '🙈' : '👁️';
        eyeBtn2.title = tok.hidden ? 'Hidden from players — click to reveal' : 'Visible to players — click to hide';
        eyeBtn2.style.cssText = 'font-size:0.75rem;padding:0.05rem 0.3rem;min-width:0;flex:none;border-radius:3px;cursor:pointer;' +
          'border:1px solid ' + (tok.hidden ? '#7c3aed' : '#374151') + ';' +
          'background:' + (tok.hidden ? 'rgba(124,58,237,0.25)' : 'rgba(0,0,0,0.3)') + ';' +
          'color:' + (tok.hidden ? '#c4b5fd' : '#6b7280') + ';';
        eyeBtn2.onclick = (function (t, mk) {
          return function () {
            t.hidden = !t.hidden;
            sendTokenUpdate(mk);
            renderTokenControls(mapUrl, mk);
          };
        })(tok, mapKey);
        row.appendChild(eyeBtn2);

      // Death toggle button
      var deathBtn = document.createElement('button');
      deathBtn.textContent = tok.dead ? '💚' : '💀';
      deathBtn.title = tok.dead ? 'Revive — remove death marker' : 'Mark Dead — adds X over token, removes from initiative';
      deathBtn.style.cssText = 'font-size:0.75rem;padding:0.05rem 0.3rem;min-width:0;flex:none;border-radius:3px;cursor:pointer;' +
        'border:1px solid ' + (tok.dead ? '#16a34a' : '#7f1d1d') + ';' +
        'background:' + (tok.dead ? 'rgba(22,163,74,0.15)' : 'rgba(127,29,29,0.25)') + ';' +
        'color:' + (tok.dead ? '#4ade80' : '#f87171') + ';';
      deathBtn.onclick = (function (t, mk) {
        return function () {
          t.dead = !t.dead;
          if (t.dead) {
            initiative = initiative.filter(function (e) { return e.name !== t.label; });
            if (fogDeferredInit[mk]) fogDeferredInit[mk] = fogDeferredInit[mk].filter(function (d) { return d.label !== t.label; });
            renderInitiative();
          }
          sendTokenUpdate(mk);
          renderTokenControls(mapUrl, mk);
        };
      })(tok, mapKey);
      row.appendChild(deathBtn);

      var rmBtn = document.createElement('button');
      rmBtn.textContent = '✕';
      rmBtn.className = 'btn btn-danger btn-small';
      rmBtn.style.cssText = 'padding:0.1rem 0.4rem;min-width:0;flex:none;';
      rmBtn.onclick = (function (i, tok) {
        return function () {
          // Remove from initiative tracker if present
          initiative = initiative.filter(function (e) { return e.name !== tok.label; });
          // Remove from fog deferred queue too
          if (fogDeferredInit[mapKey]) {
            fogDeferredInit[mapKey] = fogDeferredInit[mapKey].filter(function (d) { return d.label !== tok.label; });
          }
          renderInitiative();
          tokenState[mapKey].splice(i, 1);
          sendTokenUpdate(mapKey);
          renderTokenControls(mapUrl, mapKey);
        };
      })(idx, tok);
      row.appendChild(rmBtn);
      listDiv.appendChild(row);
    });

    var clearAllBtn = document.createElement('button');
    clearAllBtn.textContent = '🗑 Clear All Tokens';
    clearAllBtn.className = 'btn btn-warning btn-small';
    clearAllBtn.style.marginTop = '0.3rem';
    clearAllBtn.onclick = function () {
      // Remove all non-player tokens from initiative
      var removedLabels = (tokenState[mapKey] || []).filter(function (t) { return t.color !== 'green'; }).map(function (t) { return t.label; });
      initiative = initiative.filter(function (e) { return !removedLabels.includes(e.name); });
      fogDeferredInit[mapKey] = [];
      renderInitiative();
      tokenState[mapKey] = [];
      sendTokenUpdate(mapKey);
      renderTokenControls(mapUrl, mapKey);
    };
    listDiv.appendChild(clearAllBtn);
    mapTarget.appendChild(listDiv);
  }

  // Keep fog map token overlay in sync whenever tokens change
  updateFogTokenOverlay();
}


// ============================================================
// Scene Builder
// ============================================================
function initSceneBuilder() {
  sbViews = [];
  var newSceneBtn = document.getElementById('sb-new-scene-btn');
  if (newSceneBtn) newSceneBtn.onclick = startNewScene;
  renderSceneBuilderList();
}

function startNewScene() {
  var tab   = document.getElementById('sb-tab').value.trim();
  var label = document.getElementById('sb-scene-label').value.trim();
  if (!tab || !label) {
    alert('Please enter an Area name and a Scene label first.');
    return;
  }
  sbViews = [];
  renderSceneBuilderList();
  // Immediately add first empty view row
  addViewRow();
}

function renderSceneBuilderList() {
  var container = document.getElementById('sb-scene-list');
  container.innerHTML = '';

  if (!sbViews.length) {
    container.innerHTML = '<p style="color:#888;font-size:0.85rem;margin:0.5rem 0;">Enter an Area and Scene name above, then click <strong>+ New Scene</strong> to start adding maps.</p>';
    return;
  }

  // Breadcrumb showing current area › scene
  var tab   = document.getElementById('sb-tab').value.trim();
  var label = document.getElementById('sb-scene-label').value.trim();
  if (tab || label) {
    var crumb = document.createElement('div');
    crumb.style.cssText = 'font-size:0.78rem;color:#888;margin-bottom:0.5rem;';
    crumb.innerHTML = '<span style="color:#d4af37">' + (tab || '…') + '</span> › <span style="color:#d4af37">' + (label || '…') + '</span> › Maps';
    container.appendChild(crumb);
  }

  sbViews.forEach(function (view, idx) {
    var row = document.createElement('div');
    row.className = 'sb-view-row';

    // ── Row header: Map N + remove ──────────────────────────
    var rowHdr = document.createElement('div');
    rowHdr.className = 'sb-row-hdr';
    var rowNum = document.createElement('span');
    rowNum.textContent = 'Map ' + (idx + 1);
    rowNum.style.cssText = 'font-size:0.75rem;color:#d4af37;font-weight:bold;';
    rowHdr.appendChild(rowNum);
    var removeBtn = document.createElement('button');
    removeBtn.textContent = '✕ Remove';
    removeBtn.className = 'btn btn-danger btn-small';
    removeBtn.onclick = (function (i) {
      return function () { sbViews.splice(i, 1); renderSceneBuilderList(); };
    })(idx);
    rowHdr.appendChild(removeBtn);
    row.appendChild(rowHdr);

    // ── Line 1: label + image URL ───────────────────────────
    var line1 = document.createElement('div');
    line1.className = 'sb-row-line';

    var labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = view.label || '';
    labelInput.placeholder = 'Map label (e.g. Ground Floor)';
    labelInput.className = 'sb-input';
    labelInput.oninput = function () { sbViews[idx].label = labelInput.value; };
    line1.appendChild(labelInput);

    var imgInput = document.createElement('input');
    imgInput.type = 'text';
    imgInput.value = view.image || '';
    imgInput.placeholder = 'Image URL (auto-filled below)';
    imgInput.className = 'sb-input';
    imgInput.oninput = function () { sbViews[idx].image = imgInput.value; };
    line1.appendChild(imgInput);
    row.appendChild(line1);

    // ── Line 2: file picker + thumb + audio + fog ──────────
    var line2 = document.createElement('div');
    line2.className = 'sb-row-line';

    var filePicker = document.createElement('input');
    filePicker.type = 'file';
    filePicker.accept = '.jpg,.jpeg,.png,.webp,.gif';
    filePicker.className = 'sb-file-pick';
    filePicker.onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var url = '/assets/maps/' + file.name;
      imgInput.value     = url;
      sbViews[idx].image = url;
      thumb.src = URL.createObjectURL(file);
    };
    line2.appendChild(filePicker);

    var thumb = document.createElement('img');
    thumb.className = 'sb-thumb';
    thumb.src = view.image || '';
    line2.appendChild(thumb);

    var audioSel = document.createElement('select');
    audioSel.className = 'sb-select';
    var noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— No ambience —';
    audioSel.appendChild(noneOpt);
    sbAudioList.forEach(function (aUrl) {
      var opt = document.createElement('option');
      opt.value = aUrl;
      opt.textContent = aUrl.split('/').pop();
      if (aUrl === view.audio) opt.selected = true;
      audioSel.appendChild(opt);
    });
    audioSel.onchange = function () { sbViews[idx].audio = audioSel.value || null; };
    line2.appendChild(audioSel);

    var fogLabel = document.createElement('label');
    fogLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:0.78rem;color:#999;white-space:nowrap;cursor:pointer;margin:0;';
    var fogCheck = document.createElement('input');
    fogCheck.type = 'checkbox';
    fogCheck.checked = view.fog === true;
    fogCheck.onchange = function () { sbViews[idx].fog = fogCheck.checked; };
    fogLabel.appendChild(fogCheck);
    fogLabel.appendChild(document.createTextNode('🌫 Fog'));
    line2.appendChild(fogLabel);

    row.appendChild(line2);
    container.appendChild(row);
  });

  // Add View + Save buttons
  var actionRow = document.createElement('div');
  actionRow.className = 'sb-action-row';

  var addViewBtn = document.createElement('button');
  addViewBtn.textContent = '➕ Add Map';
  addViewBtn.className = 'btn btn-secondary btn-small';
  addViewBtn.onclick = addViewRow;
  actionRow.appendChild(addViewBtn);

  var saveBtn = document.createElement('button');
  saveBtn.textContent = sbEditingId ? '💾 Update Scene' : '💾 Save Scene';
  saveBtn.className = 'btn btn-primary btn-small';
  saveBtn.onclick = saveScene;
  actionRow.appendChild(saveBtn);

  if (sbEditingId) {
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = '✕ Cancel Edit';
    cancelBtn.className = 'btn btn-warning btn-small';
    cancelBtn.onclick = function () {
      sbEditingId = null;
      sbViews = [];
      document.getElementById('sb-scene-label').value = '';
      renderSceneBuilderList();
    };
    actionRow.appendChild(cancelBtn);
  }

  container.appendChild(actionRow);
}

function addViewRow() {
  sbViews.push({ label: '', image: '', audio: null, fog: false });
  renderSceneBuilderList();
}

function editScene(sceneIdx) {
  var scene = sceneData[sceneIdx];
  sbEditingId = scene.id;
  document.getElementById('sb-tab').value   = scene.tab || scene.label || '';
  document.getElementById('sb-scene-label').value = scene.label || '';
  // Deep-copy views so edits don't affect original until saved
  sbViews = scene.views.map(function (v) {
    return { label: v.label, image: v.image, audio: v.audio || null, fog: v.fog === true };
  });
  renderSceneBuilderList();
  // Expand Scene Builder section and scroll it into view
  var sbSection = document.getElementById('section-scene-builder');
  if (sbSection) {
    var details = sbSection.querySelector('details');
    if (details) details.open = true;
  }
  var sb = document.getElementById('sb-scene-list');
  if (sb) sb.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function saveScene() {
  var tab   = document.getElementById('sb-tab').value.trim();
  var label = document.getElementById('sb-scene-label').value.trim();

  if (!tab || !label) {
    alert('Area name and Scene label are required.'); return;
  }
  var validViews = sbViews.filter(function (v) { return v.label && v.image; });
  if (!validViews.length) {
    alert('Add at least one view with a label and an image URL.'); return;
  }

  // Build scene object
  var sceneId = sbEditingId || (tab.toLowerCase().replace(/\s+/g, '-') + '-' +
    label.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now());
  var newScene = {
    id: sceneId, tab: tab, label: label,
    views: validViews.map(function (v, i) {
      return {
        id: sceneId + '-view-' + i,
        label: v.label,
        image: v.image,
        audio: v.audio || null,
        fog: v.fog === true
      };
    })
  };

  var updatedScenes;
  if (sbEditingId) {
    // Replace existing scene in-place
    updatedScenes = sceneData.map(function (s) { return s.id === sbEditingId ? newScene : s; });
  } else {
    updatedScenes = sceneData.concat([newScene]);
  }

  fetch('/api/scenes')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var currentScenes = data.scenes || [];
      var updatedScenes;
      if (sbEditingId) {
        updatedScenes = currentScenes.map(function (s) { return s.id === sbEditingId ? newScene : s; });
      } else {
        updatedScenes = currentScenes.concat([newScene]);
      }
      return fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes: updatedScenes })
      });
    })
    .then(function (r) { return r.json(); })
    .then(function (resp) {
      if (!resp.ok) { alert('Error saving: ' + (resp.error || 'unknown')); return; }
      alert('✅ Scene "' + label + '" ' + (sbEditingId ? 'updated!' : 'saved!'));
      sbEditingId = null;
      // Reset builder — keep Area name so DM can add another scene to same area
      document.getElementById('sb-scene-label').value = '';
      sbViews = [];
      renderSceneBuilderList();
      // Switch to the new tab and refresh
      currentTab = tab;
      renderScenesPanel();
    })
    .catch(function (e) { alert('Network error: ' + e.message); });
}

// ── Section Drag & Drop — DOM reorder ──────────────────────────────────
(function () {
  var ORDER_KEY = 'dm-panel-order';
  var grid = document.querySelector('.panel-grid');
  var dragSrc = null;
  var dragSection = null;
  var dropTarget = null;

  // Clear any broken explicit positions from the old ghost system
  localStorage.removeItem('dm-panel-positions');
  grid.querySelectorAll(':scope > section.panel').forEach(function (s) {
    s.style.gridColumn = '';
    s.style.gridRow = '';
  });

  function restoreOrder() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(ORDER_KEY)); } catch (e) { saved = null; }
    if (!Array.isArray(saved) || !saved.length) return;
    saved.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentElement === grid) grid.appendChild(el);
    });
  }

  function saveOrder() {
    var ids = Array.from(grid.querySelectorAll(':scope > section')).map(function (s) { return s.id; }).filter(Boolean);
    localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
  }

  document.addEventListener('mousedown', function (e) {
    var handle = e.target.closest && e.target.closest('.drag-handle');
    if (handle) {
      var section = handle.closest('section');
      if (section) { section.setAttribute('draggable', 'true'); dragSection = section; }
    }
  });

  document.addEventListener('mouseup', function () {
    if (dragSection && !dragSrc) {
      dragSection.setAttribute('draggable', 'false');
      dragSection = null;
    }
  });

  grid.addEventListener('dragstart', function (e) {
    var el = e.target;
    while (el && el.tagName !== 'SECTION') el = el.parentElement;
    if (!el || !grid.contains(el) || el.getAttribute('draggable') !== 'true') { e.preventDefault(); return; }
    dragSrc = el;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', el.id);
  });

  grid.addEventListener('dragend', function () {
    grid.querySelectorAll('section').forEach(function (s) {
      s.classList.remove('dragging');
      s.classList.remove('drag-over');
      s.setAttribute('draggable', 'false');
    });
    if (dragSrc) saveOrder();
    dragSrc = null;
    dropTarget = null;
    dragSection = null;
  });

  grid.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragSrc) return;
    var el = e.target;
    while (el && el !== grid) {
      if (el.tagName === 'SECTION' && el !== dragSrc) break;
      el = el.parentElement;
    }
    if (!el || el === grid || el === dragSrc) return;
    if (el === dropTarget) return;
    dropTarget = el;
    grid.querySelectorAll('section').forEach(function (s) { s.classList.remove('drag-over'); });
    el.classList.add('drag-over');
  });

  grid.addEventListener('dragleave', function (e) {
    if (!grid.contains(e.relatedTarget)) {
      grid.querySelectorAll('section').forEach(function (s) { s.classList.remove('drag-over'); });
      dropTarget = null;
    }
  });

  grid.addEventListener('drop', function (e) {
    e.preventDefault();
    if (!dragSrc || !dropTarget) return;
    var rect = dropTarget.getBoundingClientRect();
    if (e.clientX < rect.left + rect.width / 2) {
      grid.insertBefore(dragSrc, dropTarget);
    } else {
      grid.insertBefore(dragSrc, dropTarget.nextSibling);
    }
    dropTarget = null;
  });

  restoreOrder();
}());

// ── Panel Width Controls ──────────────────────────────────────
(function () {
  var COL_CLASSES = ['col-1','col-2','col-3','col-4','col-5','col-6'];
  var WIDTH_KEY = 'dm-panel-widths';

  function currentColNum(el) {
    for (var i = 0; i < COL_CLASSES.length; i++) {
      if (el.classList.contains(COL_CLASSES[i])) return i + 1;
    }
    return 2;
  }

  function saveWidths() {
    var map = {};
    document.querySelectorAll('.panel-grid section.panel[id]').forEach(function (s) {
      map[s.id] = currentColNum(s);
    });
    localStorage.setItem(WIDTH_KEY, JSON.stringify(map));
  }

  function restoreWidths() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(WIDTH_KEY)); } catch (e) { saved = null; }
    if (!saved) return;
    Object.keys(saved).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      COL_CLASSES.forEach(function (c) { el.classList.remove(c); });
      el.classList.add('col-' + saved[id]);
    });
  }

  function adjustWidth(section, delta) {
    var cur = currentColNum(section);
    var next = Math.max(1, Math.min(6, cur + delta));
    if (next === cur) return;
    COL_CLASSES.forEach(function (c) { section.classList.remove(c); });
    section.classList.add('col-' + next);
    var lbl = section.querySelector('.pw-label');
    if (lbl) lbl.textContent = next;
    saveWidths();
  }

  function injectControls() {
    document.querySelectorAll('.panel-grid section.panel[id]').forEach(function (section) {
      if (section.querySelector('.panel-width-ctrl')) return;
      var handle = section.querySelector('.drag-handle');
      if (!handle) return;
      var cur = currentColNum(section);
      var ctrl = document.createElement('span');
      ctrl.className = 'panel-width-ctrl';
      ctrl.innerHTML =
        '<button class="pw-btn pw-minus" title="Narrower">&#9664;</button>' +
        '<span class="pw-label">' + cur + '</span>' +
        '<button class="pw-btn pw-plus" title="Wider">&#9654;</button>';
      ctrl.querySelector('.pw-minus').addEventListener('click', function (e) {
        e.stopPropagation(); adjustWidth(section, -1);
      });
      ctrl.querySelector('.pw-plus').addEventListener('click', function (e) {
        e.stopPropagation(); adjustWidth(section, +1);
      });
      handle.parentNode.insertBefore(ctrl, handle.nextSibling);
    });
  }

  restoreWidths();
  injectControls();
}());

// ============================================================
// Dice Roller
// ============================================================
document.querySelectorAll('.btn-dice').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var die  = parseInt(btn.getAttribute('data-die'));
    var roll = Math.floor(Math.random() * die) + 1;
    diceResult.textContent = 'D' + die + ': ' + roll;
    if (document.getElementById('dice-broadcast').checked) {
      fetch('/api/dice-roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ die: die, result: roll })
      });
    }
  });
});

// ============================================================
// Initiative Tracker
// ============================================================

// ── Persistent player roster ──────────────────────────────────
var playerRoster = [];   // [{ name }]

function loadPlayerRoster() {
  fetch('/api/players')
    .then(function (r) { return r.json(); })
    .then(function (d) { playerRoster = d.players || []; renderPlayerRoster(); })
    .catch(function () {});
}

function savePlayerRoster() {
  fetch('/api/players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ players: playerRoster })
  }).catch(function () {});
}

function renderPlayerRoster() {
  var list = document.getElementById('init-player-list');
  if (!list) return;
  list.innerHTML = '';
  playerRoster.forEach(function (p, idx) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:0.4rem;margin-bottom:0.25rem;flex-wrap:wrap;';

    // Name + class label
    var lbl = document.createElement('span');
    lbl.style.cssText = 'flex:1;font-size:0.85rem;color:#e6e6e6;min-width:80px;';
    lbl.textContent = p.name;
    if (p.cls) {
      var clsTag = document.createElement('span');
      clsTag.textContent = p.cls;
      clsTag.style.cssText = 'margin-left:0.4rem;font-size:0.7rem;color:#d4af37;border:1px solid #d4af37;border-radius:3px;padding:0 4px;vertical-align:middle;';
      lbl.appendChild(clsTag);
    }
    row.appendChild(lbl);

    // Roll input (per-player, cleared each round)
    var rollInput = document.createElement('input');
    rollInput.type = 'number';
    rollInput.placeholder = 'Roll';
    rollInput.min = 1; rollInput.max = 30;
    rollInput.style.cssText = 'width:54px;padding:0.2rem 0.35rem;font-size:0.8rem;background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#e6e6e6;';
    rollInput.dataset.playerIdx = idx;
    row.appendChild(rollInput);

    // Add this single player to round
    var addBtn = document.createElement('button');
    addBtn.textContent = '→';
    addBtn.title = 'Add to round';
    addBtn.className = 'btn btn-small btn-secondary';
    addBtn.style.padding = '0.18rem 0.5rem';
    addBtn.onclick = (function (player, input) {
      return function () {
        var roll = parseInt(input.value);
        if (isNaN(roll)) { input.focus(); return; }
        addToInitiative(player.name, roll, true, player.cls);
        input.value = '';
      };
    })(p, rollInput);
    row.appendChild(addBtn);

    // Remove from roster
    var delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.title = 'Remove from roster';
    delBtn.className = 'btn btn-small btn-warning';
    delBtn.style.padding = '0.18rem 0.4rem';
    delBtn.onclick = (function (i) {
      return function () {
        playerRoster.splice(i, 1);
        savePlayerRoster();
        renderPlayerRoster();
        // Refresh token controls if a map is currently showing
        if (activeTokenMapKey && activeTokenMapUrl) {
          renderTokenControls(activeTokenMapUrl, activeTokenMapKey);
        }
      };
    })(idx);
    row.appendChild(delBtn);

    list.appendChild(row);
  });
}

document.getElementById('init-player-add-btn').addEventListener('click', function () {
  var name = document.getElementById('init-player-name').value.trim();
  var cls  = document.getElementById('init-player-class').value.trim();
  if (!name) return;
  playerRoster.push({ name: name, cls: cls });
  savePlayerRoster();
  renderPlayerRoster();
  // Refresh token controls if a map is active
  if (activeTokenMapKey && activeTokenMapUrl) {
    renderTokenControls(activeTokenMapUrl, activeTokenMapKey);
  }
  document.getElementById('init-player-name').value = '';
  document.getElementById('init-player-class').value = '';
});

document.getElementById('init-add-all-btn').addEventListener('click', function () {
  // For each player that has a roll filled in, add them to the round
  var inputs = document.querySelectorAll('#init-player-list input[type=number]');
  var added = 0;
  inputs.forEach(function (input, idx) {
    var roll = parseInt(input.value);
    if (isNaN(roll)) return;
    addToInitiative(playerRoster[idx].name, roll, true, playerRoster[idx].cls);
    input.value = '';
    added++;
  });
  if (!added) alert('Enter roll values for the players you want to add.');
});

document.getElementById('init-roll-all-btn').addEventListener('click', function () {
  if (!playerRoster.length) { alert('No players in roster.'); return; }
  playerRoster.forEach(function (p) {
    var roll = Math.floor(Math.random() * 20) + 1;
    addToInitiative(p.name, roll, true, p.cls);
  });
});

// ── Round management ──────────────────────────────────────────
var INIT_STORAGE_KEY = 'dm-initiative';

function saveInitiative() {
  try {
    localStorage.setItem(INIT_STORAGE_KEY, JSON.stringify({ initiative: initiative, currentTurn: currentTurn }));
  } catch (e) {}
}

function loadInitiative() {
  try {
    var saved = JSON.parse(localStorage.getItem(INIT_STORAGE_KEY));
    if (saved && Array.isArray(saved.initiative)) {
      initiative   = saved.initiative;
      currentTurn  = saved.currentTurn || 0;
    }
  } catch (e) {}
}

function addToInitiative(name, roll, isPlayer, cls) {
  initiative.push({ name: name, roll: roll, isPlayer: !!isPlayer, cls: cls || '', conditions: [] });
  initiative.sort(function (a, b) { return b.roll - a.roll; });
  currentTurn = 0;
  saveInitiative();
  renderInitiative();
}

document.getElementById('init-add-btn').addEventListener('click', function () {
  var name = document.getElementById('init-name').value.trim();
  var roll = parseInt(document.getElementById('init-roll').value);
  if (!name || isNaN(roll)) return;
  addToInitiative(name, roll);
  document.getElementById('init-name').value = '';
  document.getElementById('init-roll').value = '';
});

function refreshMapMobsSection() {
  var list = document.getElementById('init-map-mobs-list');
  var summary = document.getElementById('init-map-mobs-summary');
  if (!list) return;
  var tokens = (activeTokenMapKey && tokenState[activeTokenMapKey]) ? tokenState[activeTokenMapKey] : [];
  var mobs = tokens.filter(function(t) { return t.type !== 'item' && t.label; });
  list.innerHTML = '';
  if (!mobs.length) {
    list.innerHTML = '<span style="color:#555;font-size:0.78rem;">No tokens on current map</span>';
    if (summary) summary.textContent = '📍 Tokens on Map';
    return;
  }
  if (summary) summary.textContent = '📍 Tokens on Map (' + mobs.length + ')';
  mobs.forEach(function(tok) {
    var alreadyIn = initiative.some(function(e) { return e.name === tok.label; });
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:0.3rem;align-items:center;';

    // Visibility toggle button
    var eyeBtn = document.createElement('button');
    eyeBtn.textContent = tok.hidden ? '🙈' : '👁️';
    eyeBtn.title = tok.hidden ? 'Invisible — click to reveal to players' : 'Visible — click to hide from players';
    eyeBtn.style.cssText = 'flex:none;font-size:0.82rem;padding:0.1rem 0.35rem;border-radius:4px;cursor:pointer;' +
      'border:1px solid ' + (tok.hidden ? '#7c3aed' : '#374151') + ';' +
      'background:' + (tok.hidden ? 'rgba(124,58,237,0.25)' : 'rgba(0,0,0,0.3)') + ';' +
      'color:' + (tok.hidden ? '#c4b5fd' : '#6b7280') + ';';
    eyeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      tok.hidden = !tok.hidden;
      sendTokenUpdate(activeTokenMapKey);
      refreshMapMobsSection();
    });
    row.appendChild(eyeBtn);

    // Token chip (initiative button for non-player tokens)
    var chip = document.createElement('button');
    if (tok.type === 'player') {
      chip.className = 'btn btn-small btn-secondary';
      chip.style.cssText = 'font-size:0.75rem;padding:0.2rem 0.5rem;flex:1;text-align:left;' +
        (tok.hidden ? 'opacity:0.5;text-decoration:line-through;' : '');
      var pIcon = MOB_ICONS_CLASS[tok.cls] || '⚔️';
      chip.textContent = pIcon + ' ' + tok.label + ' (player)';
      chip.title = 'Player token';
      chip.addEventListener('click', function() {});
    } else {
      chip.className = 'btn btn-small' + (alreadyIn ? ' btn-secondary' : ' btn-primary');
      chip.style.cssText = 'font-size:0.75rem;padding:0.2rem 0.5rem;flex:1;text-align:left;opacity:' +
        (tok.hidden ? '0.5' : (alreadyIn ? '0.45' : '1')) + ';' +
        (tok.hidden ? 'text-decoration:line-through;' : '');
      var mobIcon = (MOB_ICONS && MOB_ICONS[tok.mobType]) ? MOB_ICONS[tok.mobType] + ' ' :
                    (MOB_ICONS_CLASS && MOB_ICONS_CLASS[tok.mobType]) ? MOB_ICONS_CLASS[tok.mobType] + ' ' : '';
      chip.textContent = mobIcon + tok.label;
      chip.title = alreadyIn ? 'Already in initiative' : 'Click to fill • Shift+click to add instantly';
      chip.addEventListener('click', function(e) {
        if (e.shiftKey) {
          if (!alreadyIn) {
            addToInitiative(tok.label, Math.floor(Math.random() * 20) + 1, false, '');
            refreshMapMobsSection();
          }
        } else {
          document.getElementById('init-name').value = tok.label;
          document.getElementById('init-roll').focus();
        }
      });
    }
    row.appendChild(chip);
    list.appendChild(row);
  });
}

document.getElementById('init-clear-btn').addEventListener('click', function () {
  // Remove only mobs — keep players in the round
  initiative = initiative.filter(function (e) { return e.isPlayer; });
  currentTurn = 0;
  saveInitiative();
  renderInitiative();
});

document.getElementById('init-reset-btn').addEventListener('click', function () {
  if (!confirm('Hard reset — remove ALL entries including players?')) return;
  initiative = []; currentTurn = 0;
  saveInitiative();
  renderInitiative();
});

document.getElementById('attack-log-clear-btn').addEventListener('click', function () {
  var log = document.getElementById('attack-log');
  if (log) log.innerHTML = '';
});

function logAttack(attacker, targets) {
  var log = document.getElementById('attack-log');
  if (!log) return;
  var isSpell = false;
  var atkTok = (tokenState[activeTokenMapKey] || []).find(function(t){ return t.label === attacker; });
  if (atkTok && atkTok.cls && ['Sorcerer','Wizard','Druid','Cleric','Priest','Bard'].includes(atkTok.cls)) isSpell = true;
  var attackerEntry = initiative.find(function(e){ return e.name === attacker; });
  if (!attackerEntry && !atkTok) return; // no animation if no targets at all
  var icon = isSpell ? '✨' : '⚔️';
  var now = new Date();
  var time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0') + ':' + now.getSeconds().toString().padStart(2,'0');
  var entry = document.createElement('div');
  entry.style.cssText = 'font-size:0.76rem;padding:0.18rem 0.4rem;border-radius:3px;' +
    'background:rgba(255,255,255,0.03);border-left:3px solid #d4af37;' +
    'color:#c9d1d9;font-family:sans-serif;display:flex;gap:0.4rem;align-items:baseline;';
  var timeEl = document.createElement('span');
  timeEl.textContent = time;
  timeEl.style.cssText = 'color:#444;font-size:0.65rem;flex-shrink:0;';
  var msgEl = document.createElement('span');
  msgEl.innerHTML = icon + ' <b style="color:#e2c97e">' + escHtml(attacker) + '</b> attacks <b style="color:#f87171">' + escHtml(targets.join(', ')) + '</b>';
  entry.appendChild(timeEl);
  entry.appendChild(msgEl);
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function playDmAttackAnimation(attacker, targets) {
  var mapOverlayWrap = document.getElementById('token-map-container');
  if (!mapOverlayWrap) return;
  var isSpell = false;
  var atkTok = (tokenState[activeTokenMapKey] || []).find(function(t){ return t.label === attacker; });
  if (atkTok && atkTok.cls && ['Sorcerer','Wizard','Druid','Cleric','Priest','Bard'].includes(atkTok.cls)) isSpell = true;
  targets.forEach(function(label) {
    var tdot = mapOverlayWrap.querySelector('[data-token-label="' + label + '"]');
    if (!tdot) return;
    var icon = document.createElement('span');
    icon.textContent = isSpell ? '✨' : '⚔️';
    icon.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'font-size:1.6em;pointer-events:none;z-index:200;animation:' +
      (isSpell ? 'dm-spell-flash' : 'dm-sword-swipe') + ' 0.75s ease forwards;';
    tdot.appendChild(icon);
    icon.addEventListener('animationend', function(){ icon.remove(); }, { once: true });
  });
}

function nextInitiativeTurn() {
  if (!initiative.length) return;
  // Tick down conditions for the combatant whose turn is ending
  var expiredForIdx = -1;
  var entry = initiative[currentTurn];
  if (entry && entry.conditions && entry.conditions.length) {
    var had = entry.conditions.length;
    entry.conditions = entry.conditions.filter(function (c) {
      if (c.rounds === null) return true; // permanent
      c.rounds--;
      return c.rounds > 0;
    });
    if (entry.conditions.length < had) expiredForIdx = currentTurn;
  }

  // ── Determine attack targets for animation ─────────────────
  var atkAttacker = null, atkTargets = [];
  if (entry) {
    if (entry.isPlayer) {
      var playerTarget = dmTargets[entry.name];
      if (playerTarget) { atkAttacker = entry.name; atkTargets = [playerTarget]; }
    } else {
      // Players who set this mob as their target
      var attackedPlayers = Object.keys(dmTargets).filter(function (p) {
        return initiative.some(function(e){ return e.isPlayer && e.name === p; }) && dmTargets[p] === entry.name;
      });
      // DM-assigned direct attack target for this mob
      if (dmTargets[entry.name] && attackedPlayers.indexOf(dmTargets[entry.name]) === -1) {
        attackedPlayers.push(dmTargets[entry.name]);
      }
      if (attackedPlayers.length) { atkAttacker = entry.name; atkTargets = attackedPlayers; }
    }
  }

  currentTurn = (currentTurn + 1) % initiative.length;
  saveInitiative();
  renderInitiative();
  sendInitiative();
  if (activeTokenMapKey) {
    // Rebuild map first so dots are fresh, then animate immediately (no WS roundtrip needed)
    renderTokenControls(activeTokenMapUrl, activeTokenMapKey);
  }
  if (atkAttacker) {
    logAttack(atkAttacker, atkTargets);
    playDmAttackAnimation(atkAttacker, atkTargets);
    wsSend({ action: 'trigger-attack', attacker: atkAttacker, targets: atkTargets });
  }
  // Flash entry whose conditions just expired (after re-render so node is fresh)
  if (expiredForIdx >= 0) {
    var el = document.querySelector('#init-list .init-entry:nth-child(' + (expiredForIdx + 1) + ')');
    if (el) {
      el.style.outline = '2px solid #f97316';
      setTimeout(function () { el.style.outline = ''; }, 1400);
    }
  }
}

document.getElementById('init-next-btn').addEventListener('click', nextInitiativeTurn);
document.getElementById('init-send-btn').addEventListener('click', sendInitiative);
document.getElementById('qa-init-next-btn') && document.getElementById('qa-init-next-btn').addEventListener('click', nextInitiativeTurn);
document.getElementById('qa-init-send-btn') && document.getElementById('qa-init-send-btn').addEventListener('click', sendInitiative);

// ── Conditions preset list ────────────────────────────────────
var CONDITIONS = [
  { name: 'Advantage',       type: 'buff',   icon: '🎯', plus: 'Roll 2d20, keep the higher',                minus: '' },
  { name: 'Disadvantage',    type: 'debuff', icon: '🎲', plus: '',                                            minus: 'Roll 2d20, keep the lower' },
  { name: 'Blessed',         type: 'buff',   icon: '✨', plus: '+d4 to attacks & saving throws',              minus: 'Concentration' },
  { name: 'Haste',           type: 'buff',   icon: '💨', plus: '+2 AC, double speed, extra action',           minus: 'Lethargy 1 turn on end' },
  { name: 'Inspired',        type: 'buff',   icon: '🎵', plus: '+Inspiration die to any roll',                minus: '' },
  { name: 'Raging',          type: 'buff',   icon: '😡', plus: '+Rage dmg, resist physical damage',          minus: 'No spellcasting' },
  { name: 'Invisible',       type: 'buff',   icon: '👻', plus: 'Adv attacks; enemies disadv vs you',         minus: 'Ends on attack or spell cast' },
  { name: 'Flying',          type: 'buff',   icon: '🦅', plus: 'Gain fly speed',                             minus: 'Fall if incapacitated' },
  { name: 'Shield of Faith', type: 'buff',   icon: '🛡️', plus: '+2 AC',                                      minus: 'Concentration' },
  { name: 'Concentrating',   type: 'buff',   icon: '🧠', plus: 'Maintaining a concentration spell',          minus: 'Con save DC10+ on taking damage' },
  { name: 'Poisoned',        type: 'debuff', icon: '☠️', plus: '',                                            minus: 'Disadv on attacks & ability checks' },
  { name: 'Frightened',      type: 'debuff', icon: '😨', plus: '',                                            minus: "Disadv attacks if source visible; can't move closer" },
  { name: 'Prone',           type: 'debuff', icon: '⬇️', plus: '',                                            minus: 'Disadv attacks; melee vs you = adv, ranged = disadv; half speed to stand' },
  { name: 'Restrained',      type: 'debuff', icon: '🔗', plus: '',                                            minus: 'Speed 0; disadv attacks; adv attacks vs you' },
  { name: 'Stunned',         type: 'debuff', icon: '💫', plus: '',                                            minus: 'Incapacitated; auto-fail Str/Dex saves; adv attacks vs you' },
  { name: 'Blinded',         type: 'debuff', icon: '🙈', plus: '',                                            minus: 'Disadv attacks; adv attacks vs you' },
  { name: 'Deafened',        type: 'debuff', icon: '🔇', plus: '',                                            minus: "Can't hear; auto-fail sound-based checks" },
  { name: 'Paralyzed',       type: 'debuff', icon: '🧊', plus: '',                                            minus: 'Incapacitated; auto-fail Str/Dex saves; adv attacks vs you (crit if within 5ft)' },
  { name: 'Incapacitated',   type: 'debuff', icon: '💀', plus: '',                                            minus: 'No actions or reactions' },
  { name: 'Charmed',         type: 'debuff', icon: '💜', plus: '',                                            minus: "Can't attack charmer; charmer has adv on social checks vs you" },
  { name: 'Grappled',        type: 'debuff', icon: '✊', plus: '',                                            minus: 'Speed 0' },
  { name: 'Burning',         type: 'debuff', icon: '🔥', plus: '',                                            minus: '1d6 fire dmg/turn; action to douse' },
  { name: 'Exhaustion',      type: 'debuff', icon: '😴', plus: '',                                            minus: 'Levels 1-6: disadv checks → slow → no actions → unconscious → death' }
];

// ── Custom reference entries (DM-editable, persisted) ────────
var conditionRefs = JSON.parse(localStorage.getItem('dnd-cond-refs') || '[]');
function saveConditionRefs() { localStorage.setItem('dnd-cond-refs', JSON.stringify(conditionRefs)); }

var openCondPanel  = null; // index of entry with open cond panel
var openTargetPanel = null; // index of entry with open target picker

function renderInitiative() {
  refreshMapMobsSection();
  var list = document.getElementById('init-list');
  list.innerHTML = '';
  for (var i = 0; i < initiative.length; i++) {
    var entry  = initiative[i];
    var active = i === currentTurn;

    var div = document.createElement('div');
    div.className = 'init-entry' + (active ? ' active-turn' : '');
    div.dataset.initIdx = i;

    // Drop target: drag a condition row onto this entry
    // Use e.currentTarget (not the closed-over `div`) to avoid the closure-in-loop bug
    div.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      e.currentTarget.classList.add('cond-drop-hover');
    });
    div.addEventListener('dragleave', function (e) { e.currentTarget.classList.remove('cond-drop-hover'); });
    div.addEventListener('drop', function (e) {
      e.preventDefault();
      var self = e.currentTarget;
      self.classList.remove('cond-drop-hover');
      var raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      var cond; try { cond = JSON.parse(raw); } catch(ex) { return; }
      var idx = parseInt(self.dataset.initIdx);
      if (!initiative[idx]) return;
      showCondDropPopup(e.clientX, e.clientY, cond, function (rounds) {
        if (!initiative[idx].conditions) initiative[idx].conditions = [];
        initiative[idx].conditions.push({ name: cond.name, icon: cond.icon, type: cond.type, rounds: rounds });
        saveInitiative();
        renderInitiative();
        if (activeTokenMapKey) { sendTokenUpdate(activeTokenMapKey); renderTokenControls(activeTokenMapUrl, activeTokenMapKey); }
      });
    });

    // ── Top row: roll | name | tags | cond-btn | remove ──
    var top = document.createElement('div');
    top.className = 'init-entry-top';

    var order = document.createElement('span');
    order.className = 'init-order';
    order.textContent = entry.roll;
    top.appendChild(order);

    var nameSpan = document.createElement('span');
    nameSpan.className = 'init-entry-name';
    nameSpan.textContent = entry.name;
    // Compact: only name (+ optional PC badge). Targets live on the 🎯 button.
    if (entry.isPlayer) {
      nameSpan.innerHTML += ' <span class="init-extra-tag" style="font-size:0.65rem;color:#4ade80;border:1px solid #4ade80;border-radius:2px;padding:0 3px;vertical-align:middle;">PC</span>';
    }
    top.appendChild(nameSpan);

    // Target assignment button (DM sets who this combatant attacks)
    var tgtBtn = document.createElement('button');
    tgtBtn.className = 'init-cond-btn';
    var myDmTarget = dmTargets[entry.name];
    tgtBtn.title = 'Assign attack target';
    tgtBtn.textContent = myDmTarget ? ('🎯 ' + myDmTarget) : '🎯 Target';
    tgtBtn.style.cssText = myDmTarget
      ? 'color:#f87171;border-color:#f87171;font-size:0.68rem;'
      : 'font-size:0.68rem;';
    tgtBtn.onclick = (function (idx) {
      return function (e) {
        e.stopPropagation();
        openTargetPanel = (openTargetPanel === idx) ? null : idx;
        openCondPanel = null;
        renderInitiative();
      };
    })(i);
    top.appendChild(tgtBtn);

    // Conditions button
    var condBtn = document.createElement('button');
    condBtn.className = 'init-cond-btn';
    condBtn.title = 'Add/manage conditions';
    condBtn.textContent = '+ cond';
    condBtn.onclick = (function (idx) {
      return function (e) {
        e.stopPropagation();
        openCondPanel = (openCondPanel === idx) ? null : idx;
        openTargetPanel = null;
        renderInitiative();
      };
    })(i);
    top.appendChild(condBtn);

    // Remove button
    var rmBtn = document.createElement('button');
    rmBtn.className = 'init-remove';
    rmBtn.innerHTML = '&#x2715;';
    rmBtn.onclick = (function (idx) { return function () { removeInit(idx); }; })(i);
    top.appendChild(rmBtn);

    div.appendChild(top);

    // ── Condition badges ──
    if (entry.conditions && entry.conditions.length) {
      var badges = document.createElement('div');
      badges.className = 'init-conditions';
      entry.conditions.forEach(function (c, ci) {
        var badge = document.createElement('span');
        badge.className = 'cond-badge ' + c.type;
        var roundLabel = c.rounds === null ? '∞' : c.rounds + 'r';
        badge.innerHTML = escHtml(c.icon) + ' ' + escHtml(c.name) + ' <span class="init-round-badge">' + escHtml(roundLabel) + '</span>';
        var rm = document.createElement('button');
        rm.className = 'cond-remove';
        rm.innerHTML = '✕';
        rm.title = 'Remove condition';
        rm.onclick = (function (entryIdx, condIdx) {
          return function (e) {
            e.stopPropagation();
            initiative[entryIdx].conditions.splice(condIdx, 1);
            saveInitiative();
            renderInitiative();
            if (activeTokenMapKey) { sendTokenUpdate(activeTokenMapKey); renderTokenControls(activeTokenMapUrl, activeTokenMapKey); }
          };
        })(i, ci);
        badge.appendChild(rm);
        badges.appendChild(badge);
      });
      div.appendChild(badges);
    }

    // ── Target picker panel ──
    if (openTargetPanel === i) {
      var tgtPanel = document.createElement('div');
      tgtPanel.className = 'init-cond-panel';
      tgtPanel.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.3rem;padding:0.4rem 0.5rem;';

      // Determine valid target options: players see mob entries, mobs/all see player entries + all others
      var curEntry = initiative[i];
      var targetOptions = initiative.filter(function(e, ei) {
        return ei !== i && e.name !== curEntry.name;
      });

      // Clear button first
      var clearTgt = document.createElement('button');
      clearTgt.className = 'btn btn-small btn-danger';
      clearTgt.style.cssText = 'font-size:0.72rem;padding:0.15rem 0.45rem;';
      clearTgt.textContent = '✕ None';
      clearTgt.onclick = (function(eName) {
        return function() {
          delete dmTargets[eName];
          wsSend({ action: 'dm-set-target', player: eName, target: '' });
          openTargetPanel = null;
          renderInitiative();
          if (activeTokenMapKey && activeTokenMapUrl) renderTokenControls(activeTokenMapUrl, activeTokenMapKey);
        };
      })(curEntry.name);
      tgtPanel.appendChild(clearTgt);

      targetOptions.forEach(function(opt) {
        var chip = document.createElement('button');
        var isActive = dmTargets[curEntry.name] === opt.name;
        chip.className = 'btn btn-small ' + (isActive ? 'btn-primary' : 'btn-secondary');
        chip.style.cssText = 'font-size:0.72rem;padding:0.15rem 0.45rem;' + (isActive ? 'outline:1px solid #f87171;' : '');
        var pcBadge = opt.isPlayer ? ' [PC]' : '';
        chip.textContent = opt.name + pcBadge;
        chip.onclick = (function(attackerName, targetName) {
          return function() {
            dmTargets[attackerName] = targetName;
            wsSend({ action: 'dm-set-target', player: attackerName, target: targetName });
            openTargetPanel = null;
            renderInitiative();
            if (activeTokenMapKey && activeTokenMapUrl) renderTokenControls(activeTokenMapUrl, activeTokenMapKey);
          };
        })(curEntry.name, opt.name);
        tgtPanel.appendChild(chip);
      });

      div.appendChild(tgtPanel);
    }

    // ── Condition panel (inline, shown when open) ──
    if (openCondPanel === i) {
      var panel = document.createElement('div');
      panel.className = 'init-cond-panel';

      // Preset select
      var sel = document.createElement('select');
      var defOpt = document.createElement('option');
      defOpt.value = '';
      defOpt.textContent = 'Pick condition…';
      sel.appendChild(defOpt);
      CONDITIONS.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.icon + ' ' + c.name + ' (' + c.type + ')';
        opt.dataset.type = c.type;
        opt.dataset.icon = c.icon;
        sel.appendChild(opt);
      });
      if (conditionRefs.length) {
        var sepOpt = document.createElement('option');
        sepOpt.disabled = true;
        sepOpt.textContent = '── Custom ──';
        sel.appendChild(sepOpt);
        conditionRefs.forEach(function (c) {
          var opt = document.createElement('option');
          opt.value = c.name;
          opt.textContent = c.icon + ' ' + c.name + ' (' + c.type + ')';
          opt.dataset.type = c.type;
          opt.dataset.icon = c.icon;
          sel.appendChild(opt);
        });
      }
      panel.appendChild(sel);

      // Custom name input
      var customInput = document.createElement('input');
      customInput.type = 'text';
      customInput.placeholder = 'Custom name…';
      customInput.style.marginLeft = '0.3rem';
      customInput.style.width = '100px';
      panel.appendChild(customInput);

      // Rounds input
      var roundsInput = document.createElement('input');
      roundsInput.type = 'number';
      roundsInput.min = 1;
      roundsInput.max = 99;
      roundsInput.placeholder = 'Rounds';
      roundsInput.style.marginLeft = '0.3rem';
      roundsInput.style.width = '60px';
      panel.appendChild(roundsInput);

      // Type toggle for custom
      var typeToggle = document.createElement('select');
      typeToggle.style.marginLeft = '0.3rem';
      ['buff', 'debuff'].forEach(function (t) {
        var o = document.createElement('option');
        o.value = t;
        o.textContent = t;
        typeToggle.appendChild(o);
      });
      typeToggle.value = 'debuff';
      panel.appendChild(typeToggle);

      // Permanent checkbox
      var permLabel = document.createElement('label');
      permLabel.style.cssText = 'margin-left:0.4rem;font-size:0.72rem;color:#888;white-space:nowrap;';
      var permCheck = document.createElement('input');
      permCheck.type = 'checkbox';
      permCheck.style.marginRight = '3px';
      permLabel.appendChild(permCheck);
      permLabel.appendChild(document.createTextNode('∞ Perm'));
      panel.appendChild(permLabel);

      // Add button
      var addCondBtn = document.createElement('button');
      addCondBtn.textContent = '+ Add';
      addCondBtn.className = 'btn btn-small btn-primary';
      addCondBtn.style.marginLeft = '0.3rem';
      addCondBtn.onclick = (function (entryIdx, selEl, custEl, rndEl, typeEl, permEl) {
        return function () {
          var preset = CONDITIONS.concat(conditionRefs).find(function (c) { return c.name === selEl.value; });
          var name  = custEl.value.trim() || (preset ? preset.name : '');
          var icon  = preset ? preset.icon : '⚡';
          var type  = preset ? preset.type : typeEl.value;
          var rounds = permEl.checked ? null : (parseInt(rndEl.value) || 1);
          if (!name) return;
          if (!initiative[entryIdx].conditions) initiative[entryIdx].conditions = [];
          initiative[entryIdx].conditions.push({ name: name, type: type, icon: icon, rounds: rounds });
          openCondPanel = null;
          saveInitiative();
          renderInitiative();
          if (activeTokenMapKey) { sendTokenUpdate(activeTokenMapKey); renderTokenControls(activeTokenMapUrl, activeTokenMapKey); }
        };
      })(i, sel, customInput, roundsInput, typeToggle, permCheck);
      panel.appendChild(addCondBtn);

      // Auto-fill type when preset selected
      sel.onchange = function () {
        var preset = CONDITIONS.concat(conditionRefs).find(function (c) { return c.name === sel.value; });
        if (preset) typeToggle.value = preset.type;
      };

      div.appendChild(panel);
    }

    list.appendChild(div);
  }
  renderReference();
}

window.removeInit = function (i) {
  initiative.splice(i, 1);
  if (currentTurn >= initiative.length) currentTurn = 0;
  if (openCondPanel  === i) openCondPanel  = null;
  if (openTargetPanel === i) openTargetPanel = null;
  saveInitiative();
  renderInitiative();
};

function sendInitiative() {
  if (!initiative.length) return;
  var html = '';
  for (var i = 0; i < initiative.length; i++) {
    var active = i === currentTurn;
    var entry  = initiative[i];
    var nameHtml = entry.name;
    if (entry.cls) nameHtml += ' <span style="font-size:0.75rem;opacity:0.75;">(' + entry.cls + ')</span>';

    // Condition badges
    var condHtml = '';
    if (entry.conditions && entry.conditions.length) {
      condHtml = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;">';
      entry.conditions.forEach(function (c) {
        var rounds = c.rounds === null ? '∞' : c.rounds + 'r';
        var color  = c.type === 'buff' ? '#4ade80' : '#ef4444';
        var bg     = c.type === 'buff' ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)';
        condHtml += '<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.65rem;' +
          'padding:1px 5px;border-radius:3px;border:1px solid ' + color + ';background:' + bg + ';color:' + color + ';">' +
          c.icon + ' ' + c.name + ' <span style="opacity:0.7;">' + rounds + '</span></span>';
      });
      condHtml += '</div>';
    }

    html += '<div style="display:flex;align-items:flex-start;gap:0.6rem;padding:0.45rem 0.7rem;margin-bottom:0.3rem;' +
      'background:' + (active ? 'rgba(212,175,55,0.18)' : 'rgba(0,0,0,0.18)') + ';border:1px solid ' +
      (active ? 'rgba(212,175,55,0.7)' : 'rgba(90,50,10,0.35)') + ';border-radius:3px;font-size:1rem;">' +
      '<span style="font-weight:bold;min-width:26px;font-size:0.95rem;padding-top:2px;">' + entry.roll + '</span>' +
      '<div style="flex:1;' + (active ? 'font-weight:bold;' : '') + '">' +
      nameHtml + (active ? '  ◀' : '') + condHtml + '</div></div>';
  }
  fetch('/api/overlay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Initiative Order', data: html, duration: 12000, subtype: 'initiative' })
  });
}

// ── Reference Panel ──────────────────────────────────────────

// ── Condition-drop rounds popup ───────────────────────────────
// Shows a small floating dialog at (x,y) asking for rounds, calls onConfirm(rounds)
// rounds === null means permanent (∞)
function showCondDropPopup(x, y, cond, onConfirm) {
  // Remove any existing popup
  var old = document.getElementById('cond-drop-popup');
  if (old) old.remove();

  var popup = document.createElement('div');
  popup.id = 'cond-drop-popup';
  popup.style.cssText = 'position:fixed;z-index:9999;background:#1c2128;border:1px solid #d4af37;' +
    'border-radius:6px;padding:0.6rem 0.75rem;box-shadow:0 4px 18px rgba(0,0,0,0.7);' +
    'display:flex;flex-direction:column;gap:0.4rem;min-width:180px;font-size:0.82rem;' +
    'left:' + Math.min(x, window.innerWidth - 210) + 'px;' +
    'top:'  + Math.min(y, window.innerHeight - 160) + 'px;';

  var title = document.createElement('div');
  title.style.cssText = 'color:#d4af37;font-weight:bold;font-size:0.85rem;';
  title.textContent   = cond.icon + ' ' + cond.name;
  popup.appendChild(title);

  var row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:0.5rem;';

  var rndLabel = document.createElement('label');
  rndLabel.textContent = 'Rounds:';
  rndLabel.style.cssText = 'color:#aaa;white-space:nowrap;';
  row.appendChild(rndLabel);

  var rndInput = document.createElement('input');
  rndInput.type  = 'number';
  rndInput.min   = 1;
  rndInput.max   = 99;
  rndInput.value = 1;
  rndInput.style.cssText = 'width:52px;';
  row.appendChild(rndInput);

  var permLabel = document.createElement('label');
  permLabel.style.cssText = 'display:flex;align-items:center;gap:3px;color:#aaa;cursor:pointer;white-space:nowrap;';
  var permCheck = document.createElement('input');
  permCheck.type = 'checkbox';
  permCheck.onchange = function () {
    rndInput.disabled = permCheck.checked;
    rndInput.style.opacity = permCheck.checked ? '0.35' : '1';
  };
  permLabel.appendChild(permCheck);
  permLabel.appendChild(document.createTextNode('∞ Perm'));
  row.appendChild(permLabel);
  popup.appendChild(row);

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:0.4rem;justify-content:flex-end;';

  var cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className   = 'btn btn-small btn-secondary';
  cancelBtn.onclick     = function () { popup.remove(); };
  btnRow.appendChild(cancelBtn);

  var applyBtn = document.createElement('button');
  applyBtn.textContent = 'Apply';
  applyBtn.className   = 'btn btn-small btn-primary';
  applyBtn.onclick     = function () {
    var rounds = permCheck.checked ? null : (parseInt(rndInput.value) || 1);
    popup.remove();
    onConfirm(rounds);
  };
  btnRow.appendChild(applyBtn);
  popup.appendChild(btnRow);

  document.body.appendChild(popup);
  rndInput.focus();
  rndInput.select();

  // Enter key confirms, Escape cancels
  popup.addEventListener('keydown', function (e) {
    if (e.key === 'Enter')  { e.preventDefault(); applyBtn.click(); }
    if (e.key === 'Escape') { e.preventDefault(); popup.remove(); }
  });

  // Click outside cancels
  setTimeout(function () {
    document.addEventListener('mousedown', function outsideClick(ev) {
      if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('mousedown', outsideClick); }
    });
  }, 50);
}

// ============================================================
// Send Text — floating popup
// ============================================================
function showSendTextPopup(anchorBtn) {
  var old = document.getElementById('send-text-popup');
  if (old) { old.remove(); return; } // toggle off on second click

  var rect  = anchorBtn.getBoundingClientRect();
  var popup = document.createElement('div');
  popup.id  = 'send-text-popup';
  popup.style.cssText =
    'position:fixed;z-index:9999;background:#1c2128;border:1px solid #d4af37;' +
    'border-radius:6px;padding:0.75rem;box-shadow:0 4px 18px rgba(0,0,0,0.7);' +
    'display:flex;flex-direction:column;gap:0.5rem;width:300px;font-size:0.82rem;' +
    'left:' + Math.min(rect.left, window.innerWidth - 320) + 'px;' +
    'top:'  + Math.min(rect.bottom + 4, window.innerHeight - 240) + 'px;';

  var hdr = document.createElement('div');
  hdr.textContent = '📜 Send Text Overlay';
  hdr.style.cssText = 'color:#d4af37;font-weight:bold;';
  popup.appendChild(hdr);

  var labelIn = document.createElement('input');
  labelIn.type = 'text';
  labelIn.placeholder = 'Label (e.g. Room Description)';
  popup.appendChild(labelIn);

  var textArea = document.createElement('textarea');
  textArea.rows = 5;
  textArea.placeholder = 'Type content here…';
  textArea.style.resize = 'vertical';
  popup.appendChild(textArea);

  var sendBtn = document.createElement('button');
  sendBtn.textContent = '📜 Send';
  sendBtn.className = 'btn btn-primary';
  sendBtn.onclick = function () {
    var raw = textArea.value.trim();
    if (!raw) return;
    fetch('/api/overlay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: labelIn.value.trim(), data: raw.replace(/\n/g, '<br>'), duration: 15000 })
    });
    popup.remove();
  };
  popup.appendChild(sendBtn);
  document.body.appendChild(popup);
  labelIn.focus();

  popup.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); popup.remove(); }
  });
  setTimeout(function () {
    document.addEventListener('mousedown', function outsideClick(ev) {
      if (!popup.contains(ev.target) && ev.target !== anchorBtn) {
        popup.remove();
        document.removeEventListener('mousedown', outsideClick);
      }
    });
  }, 50);
}

// ============================================================
// Send Image — floating popup
// ============================================================
function showSendImagePopup(anchorBtn) {
  var old = document.getElementById('send-image-popup');
  if (old) { old.remove(); return; } // toggle off on second click

  var rect  = anchorBtn.getBoundingClientRect();
  var popup = document.createElement('div');
  popup.id  = 'send-image-popup';
  popup.style.cssText =
    'position:fixed;z-index:9999;background:#1c2128;border:1px solid #d4af37;' +
    'border-radius:6px;padding:0.75rem;box-shadow:0 4px 18px rgba(0,0,0,0.7);' +
    'display:flex;flex-direction:column;gap:0.45rem;width:300px;font-size:0.82rem;' +
    'left:' + Math.min(rect.left, window.innerWidth - 320) + 'px;' +
    'top:'  + Math.min(rect.bottom + 4, window.innerHeight - 360) + 'px;';

  var hdr = document.createElement('div');
  hdr.textContent = '🖼 Send Image';
  hdr.style.cssText = 'color:#d4af37;font-weight:bold;';
  popup.appendChild(hdr);

  var labelIn = document.createElement('input');
  labelIn.type = 'text';
  labelIn.placeholder = 'Label (e.g. Battle Map)';
  popup.appendChild(labelIn);

  var urlIn = document.createElement('input');
  urlIn.type = 'text';
  urlIn.placeholder = 'Image URL';
  popup.appendChild(urlIn);

  var div1 = document.createElement('div');
  div1.textContent = '— or choose from library —';
  div1.style.cssText = 'color:#888;text-align:center;font-size:0.75rem;';
  popup.appendChild(div1);

  var mapSel = document.createElement('select');
  var defOpt = document.createElement('option');
  defOpt.value = '';
  defOpt.textContent = '— loading… —';
  mapSel.appendChild(defOpt);
  fetch('/api/maps')
    .then(function (r) { return r.json(); })
    .catch(function () { return { maps: [] }; })
    .then(function (data) {
      defOpt.textContent = '— Select a map —';
      (data.maps || []).forEach(function (url) {
        var lbl = url.split('/').pop().replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        var opt = document.createElement('option');
        opt.value = url; opt.textContent = lbl;
        mapSel.appendChild(opt);
      });
    });
  mapSel.onchange = function () {
    if (!this.value) return;
    urlIn.value = this.value;
    fileIn.value = '';
    preview.innerHTML = '<img src="' + this.value + '" style="max-width:100%;max-height:110px;border-radius:4px;margin-top:2px;" />';
  };
  popup.appendChild(mapSel);

  var div2 = document.createElement('div');
  div2.textContent = '— or pick a file —';
  div2.style.cssText = 'color:#888;text-align:center;font-size:0.75rem;';
  popup.appendChild(div2);

  var fileIn = document.createElement('input');
  fileIn.type = 'file';
  fileIn.accept = 'image/*';
  fileIn.onchange = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    mapSel.value = '';
    urlIn.value = '/assets/maps/' + file.name;
    preview.innerHTML = '<img src="' + URL.createObjectURL(file) + '" style="max-width:100%;max-height:110px;border-radius:4px;margin-top:2px;" />';
  };
  popup.appendChild(fileIn);

  var preview = document.createElement('div');
  popup.appendChild(preview);

  var sendBtn = document.createElement('button');
  sendBtn.textContent = '🖼 Send Image';
  sendBtn.className = 'btn btn-primary';
  sendBtn.onclick = function () {
    var url   = urlIn.value.trim();
    var label = labelIn.value.trim() || 'Image';
    if (url) {
      sendImage(label, url);
      popup.remove();
    } else if (fileIn.files[0]) {
      var reader = new FileReader();
      reader.onload = function (ev) { sendImage(label, ev.target.result); };
      reader.readAsDataURL(fileIn.files[0]);
      popup.remove();
    }
  };
  popup.appendChild(sendBtn);
  document.body.appendChild(popup);
  labelIn.focus();

  popup.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); popup.remove(); }
  });
  setTimeout(function () {
    document.addEventListener('mousedown', function outsideClick(ev) {
      if (!popup.contains(ev.target) && ev.target !== anchorBtn) {
        popup.remove();
        document.removeEventListener('mousedown', outsideClick);
      }
    });
  }, 50);
}

document.querySelectorAll('.ref-tab').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.ref-tab').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.ref-pane').forEach(function (p) { p.style.display = 'none'; });
    btn.classList.add('active');
    var pane = document.getElementById('ref-pane-' + btn.dataset.tab);
    if (pane) pane.style.display = '';
  });
});

// ── Rules tab: add send buttons to each static section ────────
(function () {
  var rulesPane = document.getElementById('ref-pane-rules');
  if (!rulesPane) return;
  rulesPane.querySelectorAll('.ref-section-hdr').forEach(function (hdr) {
    var sendBtn = document.createElement('button');
    sendBtn.className = 'ref-card-send';
    sendBtn.title = 'Send to player screen';
    sendBtn.textContent = '\uD83D\uDCDC Send';
    sendBtn.style.cssText = 'margin-left:0.5rem;vertical-align:middle;';
    hdr.appendChild(sendBtn);
    sendBtn.addEventListener('click', function () {
      // Collect all table rows in this section (up to next h3)
      var rows = [];
      var el = hdr.nextElementSibling;
      while (el && el.tagName !== 'H3') {
        if (el.tagName === 'TABLE') {
          el.querySelectorAll('tbody tr').forEach(function (tr) {
            var cells = Array.from(tr.querySelectorAll('td')).map(function (td) { return td.textContent.trim(); });
            rows.push(cells.join(' — '));
          });
        }
        el = el.nextElementSibling;
      }
      var dataHtml = rows.length
        ? '<ul style="margin:0;padding-left:1.2em;line-height:1.7;">' +
          rows.map(function (r) { return '<li>' + escHtml(r) + '</li>'; }).join('') +
          '</ul>'
        : '<em style="color:#666;">No data.</em>';
      fetch('/api/overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: hdr.textContent.replace('\uD83D\uDCDC Send','').trim(), data: dataHtml, duration: 20000 })
      });
    });
  });
})();

// ── Condition filter ─────────────────────────────────────────
document.getElementById('ref-cond-filter').addEventListener('input', function () {
  renderReference(this.value.trim().toLowerCase());
});

function renderReference(filterText) {
  var chartEl = document.getElementById('ref-active-chart');
  var dictEl  = document.getElementById('ref-dict-list');
  if (!chartEl || !dictEl) return;

  // Active Conditions Chart
  var active = initiative.filter(function (e) { return e.conditions && e.conditions.length; });
  if (!active.length) {
    chartEl.innerHTML = '<p class="ref-empty">No active conditions in initiative.</p>';
  } else {
    var chartRows = active.map(function (e) {
      var badges = e.conditions.map(function (c) {
        var rounds = c.rounds === null ? '∞' : c.rounds + 'r';
        return '<span class="cond-badge ' + c.type + '">' + c.icon + ' ' + c.name +
          ' <span class="init-round-badge">' + rounds + '</span></span>';
      }).join(' ');
      return '<tr><td class="ref-chart-name">' + e.name + '</td><td>' + badges + '</td></tr>';
    }).join('');
    chartEl.innerHTML = '<table class="ref-chart-table"><thead><tr><th>Combatant</th>' +
      '<th>Active Conditions</th></tr></thead><tbody>' + chartRows + '</tbody></table>';
  }

  // Condition Dictionary (built-in CONDITIONS + custom conditionRefs), with optional filter
  var filter = (filterText || '').toLowerCase();
  var allRefs = CONDITIONS.map(function (c) {
    return { name: c.name, type: c.type, icon: c.icon, plus: c.plus || '', minus: c.minus || '', builtin: true };
  }).concat(conditionRefs.map(function (r) {
    return { name: r.name, type: r.type, icon: r.icon, plus: r.plus || '', minus: r.minus || '', builtin: false };
  }));

  if (filter) {
    allRefs = allRefs.filter(function (r) {
      return r.name.toLowerCase().indexOf(filter) !== -1 ||
             r.plus.toLowerCase().indexOf(filter) !== -1 ||
             r.minus.toLowerCase().indexOf(filter) !== -1;
    });
  }

  var drows = allRefs.map(function (r, ri) {
    var realIdx = r.builtin ? -1 : conditionRefs.indexOf(conditionRefs.filter(function(x){return !r.builtin;})[ri - CONDITIONS.length]);
    var delBtn = r.builtin ? '' :
      '<button class="ref-del-btn" data-name="' + r.name.replace(/"/g, '&quot;') + '" title="Remove">✕</button>';
    var plusCell  = r.plus  ? r.plus  : '<span style="color:#444">—</span>';
    var minusCell = r.minus ? r.minus : '<span style="color:#444">—</span>';
    var sendBtn = '<button class="ref-row-send" ' +
      'data-name="' + r.name.replace(/"/g, '&quot;') + '" ' +
      'data-icon="' + r.icon.replace(/"/g, '&quot;') + '" ' +
      'data-plus="' + r.plus.replace(/"/g, '&quot;') + '" ' +
      'data-minus="' + r.minus.replace(/"/g, '&quot;') + '" ' +
      'title="Send to player screen">📜</button>';
    return '<tr class="ref-row ' + r.type + ' ref-row-draggable" draggable="true" ' +
      'data-cond-name="' + r.name.replace(/"/g, '&quot;') + '" ' +
      'data-cond-icon="' + r.icon.replace(/"/g, '&quot;') + '" ' +
      'data-cond-type="' + r.type + '" ' +
      'title="Drag onto a token or initiative entry to apply">' +
      '<td class="ref-icon-cell">' + r.icon + '</td>' +
      '<td><span class="cond-badge ' + r.type + '">' + r.name + '</span></td>' +
      '<td class="ref-plus-cell">'  + plusCell  + '</td>' +
      '<td class="ref-minus-cell">' + minusCell + '</td>' +
      '<td style="white-space:nowrap;">' + sendBtn + delBtn + '</td></tr>';
  }).join('');

  dictEl.innerHTML = allRefs.length
    ? '<table class="ref-dict-table"><thead><tr><th></th><th>Condition</th>' +
      '<th class="ref-plus-hdr">+ Benefit</th>' +
      '<th class="ref-minus-hdr">– Penalty</th><th></th></tr></thead>' +
      '<tbody>' + drows + '</tbody></table>'
    : '<p class="ref-empty">No matching conditions.</p>';

  dictEl.querySelectorAll('.ref-del-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var name = btn.dataset.name;
      var idx  = conditionRefs.findIndex(function (r) { return r.name === name; });
      if (idx !== -1) { conditionRefs.splice(idx, 1); saveConditionRefs(); renderReference(); }
    });
  });

  dictEl.querySelectorAll('.ref-row-send').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var plus  = (btn.dataset.plus  || '').trim();
      var minus = (btn.dataset.minus || '').trim();
      var dataHtml =
        (plus  ? '<div style="margin-bottom:0.3rem;"><b style="color:#4ade80;">Benefit:</b> ' + escHtml(plus)  + '</div>' : '') +
        (minus ? '<div><b style="color:#ef4444;">Penalty:</b> ' + escHtml(minus) + '</div>' : '') ||
        '<em style="color:#666;">No description.</em>';
      fetch('/api/overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: btn.dataset.icon + ' ' + btn.dataset.name, data: dataHtml, duration: 15000 })
      });
    });
  });

  // Drag start: encode condition into dataTransfer
  dictEl.querySelectorAll('.ref-row-draggable').forEach(function (row) {
    row.addEventListener('dragstart', function (e) {
      e.stopPropagation(); // prevent grid section-reorder handler from cancelling this drag
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        name: row.dataset.condName,
        icon: row.dataset.condIcon,
        type: row.dataset.condType
      }));
      // Create a visible ghost image so the user sees what they're dragging
      var ghost = document.createElement('div');
      ghost.textContent = row.dataset.condIcon + ' ' + row.dataset.condName;
      ghost.style.cssText = 'position:fixed;top:-999px;left:-999px;background:#1c2128;color:#d4af37;' +
        'border:1px solid #d4af37;border-radius:4px;padding:4px 10px;font-size:0.82rem;pointer-events:none;white-space:nowrap;';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      setTimeout(function () { ghost.remove(); }, 0);
    });
  });
}

document.getElementById('ref-add-btn').addEventListener('click', function () {
  var icon  = document.getElementById('ref-add-icon').value.trim() || '⚡';
  var name  = document.getElementById('ref-add-name').value.trim();
  var type  = document.getElementById('ref-add-type').value;
  var plus  = document.getElementById('ref-add-plus').value.trim();
  var minus = document.getElementById('ref-add-minus').value.trim();
  if (!name) return;
  conditionRefs.push({ name: name, type: type, icon: icon, plus: plus, minus: minus });
  saveConditionRefs();
  ['ref-add-name', 'ref-add-icon', 'ref-add-plus', 'ref-add-minus'].forEach(function (id) {
    document.getElementById(id).value = '';
  });
  renderReference();
});

// ── Reference API helpers ─────────────────────────────────────
var _refCache = {};
var _open5eBase = 'https://api.open5e.com/v1/';
var _dnd5eBase  = 'https://www.dnd5eapi.co/api/';

function refFetch(url, cb) {
  if (_refCache[url]) { cb(null, _refCache[url]); return; }
  fetch(url)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) { _refCache[url] = data; cb(null, data); })  // only cache successes
    .catch(function (e) { cb(e, null); });  // do NOT cache failures
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function makeCard(title, metaItems, desc) {
  var metaHtml = metaItems.filter(Boolean).map(function (m) {
    return '<span>' + escHtml(m) + '</span>';
  }).join('');
  var id = 'rc-' + Math.random().toString(36).slice(2);
  var shortDesc = escHtml(desc || '').slice(0, 400);
  var full      = escHtml(desc || '');
  var needsMore = full.length > shortDesc.length;
  return '<div class="ref-card">' +
    '<div class="ref-card-header"><div class="ref-card-title">' + escHtml(title) + '</div>' +
    '<button class="ref-card-send" title="Send to player screen">📜 Send</button></div>' +
    (metaHtml ? '<div class="ref-card-meta">' + metaHtml + '</div>' : '') +
    '<div class="ref-card-desc" id="' + id + '">' + shortDesc + (needsMore ? '…' : '') + '</div>' +
    (needsMore ? '<button class="ref-card-toggle" data-id="' + id + '" data-full="' + full.replace(/"/g,'&quot;') + '">▼ Show more</button>' : '') +
    '</div>';
}

function bindCardToggles(el) {
  el.querySelectorAll('.ref-card-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var d = document.getElementById(btn.dataset.id);
      if (d.classList.contains('expanded')) {
        d.classList.remove('expanded');
        d.textContent = btn.dataset.full.slice(0, 400) + '…';
        btn.textContent = '▼ Show more';
      } else {
        d.classList.add('expanded');
        d.textContent = btn.dataset.full;
        btn.textContent = '▲ Show less';
      }
    });
  });
  el.querySelectorAll('.ref-card-send').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card    = btn.closest('.ref-card');
      var title   = card.querySelector('.ref-card-title').textContent;
      var metaEl  = card.querySelector('.ref-card-meta');
      var toggleEl = card.querySelector('.ref-card-toggle');
      var descEl  = card.querySelector('.ref-card-desc');
      // data-full holds the HTML-escaped full description
      var fullDesc = toggleEl ? toggleEl.dataset.full : escHtml(descEl.textContent);
      var dataHtml =
        (metaEl ? '<div style="color:#aaa;font-size:0.82em;margin-bottom:0.5rem;">' + escHtml(metaEl.textContent) + '</div>' : '') +
        '<div style="line-height:1.5;">' + fullDesc.replace(/\n/g, '<br>') + '</div>';
      fetch('/api/overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title, data: dataHtml, duration: 20000 })
      });
    });
  });
}

// ── Spells ────────────────────────────────────────────────────
function searchSpells() {
  var q     = document.getElementById('ref-spell-q').value.trim();
  var level = document.getElementById('ref-spell-level').value;
  var el    = document.getElementById('ref-spell-results');
  if (!q && level === '') { el.innerHTML = '<p class="ref-empty">Enter a spell name or pick a level.</p>'; return; }
  el.innerHTML = '<p class="ref-loading">Searching Open5e…</p>';
  var url = _open5eBase + 'spells/?limit=50';
  if (q) url += '&name__icontains=' + encodeURIComponent(q);
  if (level !== '') url += '&spell_level=' + level;
  refFetch(url, function (err, data) {
    if (err || !data || !data.results) { el.innerHTML = '<p class="ref-error">Failed to load spells. Check internet connection.</p>'; return; }
    if (!data.results.length) { el.innerHTML = '<p class="ref-empty">No spells found.</p>'; return; }
    var html = data.results.map(function (s) {
      var levelStr = s.spell_level === 0 ? 'Cantrip' : s.spell_level + (s.spell_level===1?'st':s.spell_level===2?'nd':s.spell_level===3?'rd':'th') + ' level';
      var source = s.document__title ? '📖 ' + s.document__title : '';
      return makeCard(s.name,
        [levelStr, s.school, s.casting_time, 'Range: ' + s.range, 'Duration: ' + s.duration, s.concentration ? 'Concentration' : '', s.ritual ? 'Ritual' : '', source],
        s.desc);
    }).join('');
    el.innerHTML = html;
    bindCardToggles(el);
  });
}
document.getElementById('ref-spell-btn').addEventListener('click', searchSpells);
document.getElementById('ref-spell-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') searchSpells(); });

// ── Items ─────────────────────────────────────────────────────
function searchItems() {
  var q    = document.getElementById('ref-item-q').value.trim();
  var type = document.getElementById('ref-item-type').value;
  var el   = document.getElementById('ref-item-results');
  if (!q) { el.innerHTML = '<p class="ref-empty">Enter an item name.</p>'; return; }
  el.innerHTML = '<p class="ref-loading">Searching Open5e…</p>';

  if (type === 'magic') {
    var url = _open5eBase + 'magicitems/?limit=30&name__icontains=' + encodeURIComponent(q);
    refFetch(url, function (err, data) {
      if (err || !data || !data.results) { el.innerHTML = '<p class="ref-error">Failed: ' + (err ? err.message : 'unexpected response') + '</p>'; return; }
      if (!data.results.length) { el.innerHTML = '<p class="ref-empty">No magic items found.</p>'; return; }
      var html = data.results.map(function (it) {
        var src = it.document__title ? '📖 ' + it.document__title : '';
        return makeCard(it.name, [it.type, it.rarity, it.requires_attunement ? 'Requires attunement' : '', src], it.desc);
      }).join('');
      el.innerHTML = html;
      bindCardToggles(el);
    });
    return;
  }

  // Equipment: search weapons + armor in parallel, merge results
  var enc = encodeURIComponent(q);
  var weaponUrl = _open5eBase + 'weapons/?limit=20&name__icontains=' + enc;
  var armorUrl  = _open5eBase + 'armor/?limit=10&name__icontains=' + enc;
  var results = {};
  var done = 0;

  function onBoth() {
    done++;
    if (done < 2) return;
    var weapons = (results.weapons && results.weapons.results) ? results.weapons.results : [];
    var armor   = (results.armor   && results.armor.results)   ? results.armor.results   : [];
    var all = weapons.concat(armor);
    if (!all.length) { el.innerHTML = '<p class="ref-empty">No equipment found for "' + escHtml(q) + '".</p>'; return; }
    var html = all.map(function (it) {
      if (it.damage_dice) {
        // Weapon
        var props = (it.properties || []).join(', ');
        var src   = it.document__title ? '📖 ' + it.document__title : '';
        return makeCard(it.name,
          [it.category, 'Cost: ' + (it.cost || '—'), 'Dmg: ' + it.damage_dice + ' ' + (it.damage_type || ''), 'Wt: ' + (it.weight || '—'), src],
          props ? 'Properties: ' + props : '');
      } else {
        // Armor
        var src2 = it.document__title ? '📖 ' + it.document__title : '';
        return makeCard(it.name,
          [it.category, 'Cost: ' + (it.cost || '—'), it.ac_string || '', 'Wt: ' + (it.weight || '—'),
           it.stealth_disadvantage ? '⚠️ Stealth disadv.' : '', src2],
          it.strength_requirement ? 'Requires STR ' + it.strength_requirement : '');
      }
    }).join('');
    el.innerHTML = html;
    bindCardToggles(el);
  }

  refFetch(weaponUrl, function (err, data) {
    results.weapons = (err || !data) ? { results: [] } : data;
    if (err) console.warn('Weapons fetch error:', err.message);
    onBoth();
  });
  refFetch(armorUrl, function (err, data) {
    results.armor = (err || !data) ? { results: [] } : data;
    if (err) console.warn('Armor fetch error:', err.message);
    onBoth();
  });
}
document.getElementById('ref-item-btn').addEventListener('click', searchItems);
document.getElementById('ref-item-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') searchItems(); });

// ── Feats ─────────────────────────────────────────────────────
function searchFeats() {
  var q  = document.getElementById('ref-feat-q').value.trim();
  var el = document.getElementById('ref-feat-results');
  if (!q) { el.innerHTML = '<p class="ref-empty">Enter a feat name.</p>'; return; }
  el.innerHTML = '<p class="ref-loading">Searching Open5e…</p>';
  var url = _open5eBase + 'feats/?limit=30&name__icontains=' + encodeURIComponent(q);
  refFetch(url, function (err, data) {
    if (err || !data || !data.results) {
      // Fallback: D&D 5e SRD API
      refFetch(_dnd5eBase + 'feats?name=' + encodeURIComponent(q), function (err2, data2) {
        if (err2 || !data2 || !data2.results) { el.innerHTML = '<p class="ref-error">Failed to load feats. Check internet connection.</p>'; return; }
        if (!data2.results.length) { el.innerHTML = '<p class="ref-empty">No feats found.</p>'; return; }
        // Fetch full detail for each
        var cards = []; var done = 0;
        data2.results.slice(0, 15).forEach(function (r, i) {
          refFetch(_dnd5eBase + r.url.replace('/api/', ''), function (err3, feat) {
            cards[i] = feat ? makeCard(feat.name, [feat.prerequisite ? 'Prerequisite: ' + feat.prerequisite : ''],
              (feat.desc || []).join('\n')) : '';
            if (++done === Math.min(data2.results.length, 15)) {
              el.innerHTML = cards.filter(Boolean).join('') || '<p class="ref-empty">No feats found.</p>';
              bindCardToggles(el);
            }
          });
        });
      });
      return;
    }
    if (!data.results.length) { el.innerHTML = '<p class="ref-empty">No feats found.</p>'; return; }
    var html = data.results.map(function (f) {
      return makeCard(f.name,
        [f.prerequisite ? 'Prerequisite: ' + f.prerequisite : ''],
        f.desc);
    }).join('');
    el.innerHTML = html;
    bindCardToggles(el);
  });
}
document.getElementById('ref-feat-btn').addEventListener('click', searchFeats);
document.getElementById('ref-feat-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') searchFeats(); });

// ── Global search bar ─────────────────────────────────────────
document.getElementById('ref-global-search-btn').addEventListener('click', function () {
  var q   = document.getElementById('ref-global-search').value.trim();
  var cat = document.getElementById('ref-global-cat').value;
  if (!q) return;
  var el = document.getElementById('ref-global-results');
  el.style.marginBottom = '0.5rem';

  // Switch to the matching tab and pre-fill its search, then trigger it
  var tabBtn = document.querySelector('.ref-tab[data-tab="' + cat + '"]');
  if (tabBtn) {
    document.querySelectorAll('.ref-tab').forEach(function(b){b.classList.remove('active');});
    document.querySelectorAll('.ref-pane').forEach(function(p){p.style.display='none';});
    tabBtn.classList.add('active');
    var pane = document.getElementById('ref-pane-' + cat);
    if (pane) pane.style.display = '';
  }
  el.innerHTML = '';

  if (cat === 'spells') {
    document.getElementById('ref-spell-q').value = q;
    searchSpells();
  } else if (cat === 'items') {
    document.getElementById('ref-item-q').value = q;
    searchItems();
  } else if (cat === 'feats') {
    document.getElementById('ref-feat-q').value = q;
    searchFeats();
  } else if (cat === 'conditions') {
    document.getElementById('ref-cond-filter').value = q;
    renderReference(q.toLowerCase());
  }
});
document.getElementById('ref-global-search').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') document.getElementById('ref-global-search-btn').click();
});

// ============================================================
// Search — Maps & Audio
// ============================================================
document.getElementById('map-search').addEventListener('input', function () {
  sceneSearchTerm = this.value.trim();
  renderScenesPanel();
});

document.getElementById('audio-search').addEventListener('input', function () {
  audioSearchTerm = this.value.trim();
  applyAudioDisplay();
});

// ============================================================
// Monster Lookup  (5etools + Open5e)
// ============================================================
var _monsterCache     = {};          // key: source:slug → normalised monster obj
var _monsterSource    = 'open5e';    // 'open5e' | '5etools' (5etools mirrors are currently unavailable)
var _5etoolsFileMap   = null;        // { "MM": "bestiary-mm.json", ... }
var _5etoolsFileMapLoading = false;
var _5etoolsFileMapCbs = [];
var _5etoolsLoadedSources = {};      // src → monster[] (cache per source file)
var _5etoolsSearchId  = 0;           // cancel stale searches

// Priority order: main monster books loaded first for fast results
var _5ET_PRIORITY = ['MM','XMM','VGM','MTF','MPMM','FTD','BGG','VRGR','IDRotF','ERLW','SCC','MOT','EGW','XGE','TCE'];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function modStr(score) {
  var m = Math.floor((score - 10) / 2);
  return (m >= 0 ? '+' : '') + m;
}

// ── 5etools helpers ───────────────────────────────────────────
// GitHub raw mirror fetched via server-side proxy — avoids all browser CORS issues
var _5ET_BASE = '/api/bestiary/';

function load5etoolsFileMap(cb) {
  if (_5etoolsFileMap) { cb(_5etoolsFileMap); return; }
  _5etoolsFileMapCbs.push(cb);
  if (_5etoolsFileMapLoading) return;
  _5etoolsFileMapLoading = true;
  fetch(_5ET_BASE + 'index.json')
    .then(function (r) { return r.json(); })
    .then(function (idx) {
      _5etoolsFileMap = idx;
      _5etoolsFileMapLoading = false;
      _5etoolsFileMapCbs.forEach(function (f) { f(idx); });
      _5etoolsFileMapCbs = [];
    })
    .catch(function () {
      _5etoolsFileMap = {};
      _5etoolsFileMapLoading = false;
      _5etoolsFileMapCbs.forEach(function (f) { f({}); });
      _5etoolsFileMapCbs = [];
    });
}

// Fetch and normalise a single monster from 5etools JSON
function fetch5etoolsMonster(entry, cb) {
  var cacheKey = '5etools:' + entry.source + ':' + slugify(entry.name);
  if (_monsterCache[cacheKey]) { cb(_monsterCache[cacheKey]); return; }
  // Use already-loaded source data if available
  if (_5etoolsLoadedSources[entry.source]) {
    var raw = _5etoolsLoadedSources[entry.source].find(function (m) { return m.name === entry.name; });
    if (raw) {
      var norm = normalise5etools(raw);
      _monsterCache[cacheKey] = norm;
      cb(norm);
    } else { cb(null); }
    return;
  }
  load5etoolsFileMap(function (idx) {
    var filename = idx[entry.source];
    if (!filename) { cb(null); return; }
    fetch(_5ET_BASE + filename)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var monsters = data.monster || [];
        _5etoolsLoadedSources[entry.source] = monsters;
        var raw2 = monsters.find(function (m) { return m.name === entry.name; });
        if (raw2) {
          var norm2 = normalise5etools(raw2);
          _monsterCache[cacheKey] = norm2;
          cb(norm2);
        } else { cb(null); }
      })
      .catch(function () { cb(null); });
  });
}

function crToNum(cr) {
  if (!cr) return '—';
  if (typeof cr === 'object') cr = cr.cr || '—';
  return String(cr);
}

function speedStr5e(speed) {
  if (!speed) return '';
  var parts = [];
  if (speed.walk) parts.push(speed.walk + ' ft.');
  if (speed.fly)  parts.push('fly ' + speed.fly + ' ft.' + (speed.canHover ? ' (hover)' : ''));
  if (speed.swim) parts.push('swim ' + speed.swim + ' ft.');
  if (speed.climb) parts.push('climb ' + speed.climb + ' ft.');
  if (speed.burrow) parts.push('burrow ' + speed.burrow + ' ft.');
  return parts.join(', ');
}

function entryToText(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  if (entry.type === 'entries' || entry.type === 'section') {
    var sub = (entry.entries || []).map(entryToText).join(' ');
    return (entry.name ? entry.name + '. ' : '') + sub;
  }
  if (entry.type === 'list') return (entry.items || []).map(entryToText).join('; ');
  if (entry.type === 'table') return '[table]';
  if (entry.type === 'inlineBlock' || entry.type === 'inline') {
    return (entry.entries || []).map(entryToText).join('');
  }
  return entry.entries ? (entry.entries || []).map(entryToText).join(' ') : '';
}

// Strip 5etools markup tags: {@condition Stunned}, {@dice 2d6}, {@atk mw}, etc.
function clean5e(str) {
  if (!str) return '';
  return str
    .replace(/\{@(?:condition|status|skill|sense|action|creature|item|spell|feat|class|subclass|background|race|table|filter|quickref|variantrule|optfeature|legroup|classFeature|subclassFeature|note|comic|scaledice|scaledamage|chance|d20|hit|damage|atk|dc|recharge|dice|coinflip|homebrew|5etools|link|loader|area|book|deity)([^|}]*)\|?([^}]*)}/gi, function (_, p1, p2) { return p2 || p1.trim(); })
    .replace(/\{@b ([^}]+)\}/gi, '$1')
    .replace(/\{@i ([^}]+)\}/gi, '$1')
    .replace(/\{@([^}]+)\}/g, '$1');
}

function normalise5etools(raw) {
  // Ability scores
  var abilityKeys = ['str','dex','con','int','wis','cha'];
  var fullKeys = ['strength','dexterity','constitution','intelligence','wisdom','charisma'];

  // Saving throws
  var saves = {};
  if (raw.save) {
    Object.entries(raw.save).forEach(function (e) {
      saves[e[0] + '_save'] = parseInt(e[1]);
    });
  }

  // Skills
  var skills = {};
  if (raw.skill) {
    Object.entries(raw.skill).forEach(function (e) {
      skills[e[0]] = parseInt(e[1]) || e[1];
    });
  }

  // AC
  var acVal = raw.ac && raw.ac[0];
  var acNum = typeof acVal === 'object' ? acVal.ac : acVal;
  var acDesc = typeof acVal === 'object' ? (Array.isArray(acVal.from) ? acVal.from.join(', ') : '') : '';

  // HP
  var hpVal  = raw.hp || {};
  var hpNum  = hpVal.average || '—';
  var hpDice = hpVal.formula || '';

  // CR
  var cr = crToNum(raw.cr);
  var xpMap = {'0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700,'4':1100,'5':1800,
    '6':2300,'7':2900,'8':3900,'9':5000,'10':5900,'11':7200,'12':8400,'13':10000,'14':11500,
    '15':13000,'16':15000,'17':18000,'18':20000,'19':22000,'20':25000,'21':33000,'22':41000,
    '23':50000,'24':62000,'25':75000,'26':90000,'27':105000,'28':120000,'29':135000,'30':155000};
  var xp = xpMap[cr];

  // Senses
  var senses = [];
  if (raw.senses) (Array.isArray(raw.senses) ? raw.senses : [raw.senses]).forEach(function(s){ senses.push(clean5e(s)); });
  if (raw.passive !== undefined) senses.push('passive Perception ' + raw.passive);

  // Resistances / immunities
  function dmgList(arr) {
    if (!arr) return '';
    return arr.map(function (e) {
      if (typeof e === 'string') return e;
      if (e.special) return e.special;
      var base = (e.immune || e.resist || e.vulnerable || []).join(', ');
      var note = e.note ? ' (' + e.note + ')' : '';
      return base + note;
    }).join('; ');
  }

  // Actions / reactions / bonus actions / legendary actions / special traits
  function parseActions(arr) {
    if (!arr) return [];
    return arr.map(function (a) {
      var text = '';
      if (Array.isArray(a.entries)) {
        text = a.entries.map(entryToText).join(' ');
      } else if (a.entry) { text = entryToText(a.entry); }
      return { name: a.name || '', desc: clean5e(text) };
    });
  }

  var result = { _source: '5etools', name: raw.name };
  abilityKeys.forEach(function (k, i) { result[fullKeys[i]] = raw[k]; });
  Object.assign(result, saves);
  result.skills = Object.keys(skills).length ? skills : null;
  result.armor_class = acNum;
  result.armor_desc  = acDesc;
  result.hit_points  = hpNum;
  result.hit_dice    = hpDice;
  result.speed       = raw.speed;  // pass raw for speedStr5e
  result.challenge_rating = cr;
  result.xp          = xp;
  result.size        = Array.isArray(raw.size) ? raw.size.map(function(s){
    return {T:'Tiny',S:'Small',M:'Medium',L:'Large',H:'Huge',G:'Gargantuan'}[s]||s;
  }).join('/') : ({T:'Tiny',S:'Small',M:'Medium',L:'Large',H:'Huge',G:'Gargantuan'}[raw.size]||raw.size||'');
  result.type = typeof raw.type === 'object' ? (raw.type.type || '') + (raw.type.tags ? ' (' + raw.type.tags.join(', ') + ')' : '') : (raw.type || '');
  result.subtype     = null;  // folded into type above
  result.alignment   = Array.isArray(raw.alignment)
    ? raw.alignment.map(function(a){ return ({L:'lawful',N:'neutral',C:'chaotic',G:'good',E:'evil',U:'unaligned',A:'any'}[a]||a); }).join(' ')
    : (raw.alignment || '');
  result.senses      = senses.join(', ');
  result.languages   = Array.isArray(raw.languages) ? raw.languages.join(', ') : (raw.languages || '');
  result.damage_immunities     = dmgList(raw.immune);
  result.damage_resistances    = dmgList(raw.resist);
  result.damage_vulnerabilities= dmgList(raw.vulnerable);
  result.condition_immunities  = raw.conditionImmune ? (Array.isArray(raw.conditionImmune) ? raw.conditionImmune.map(function(c){ return typeof c === 'string' ? c : (c.conditionImmune||[]).join(', '); }).join(', ') : raw.conditionImmune) : '';
  result.special_abilities = parseActions(raw.trait);
  result.actions           = parseActions(raw.action);
  result.bonus_actions     = parseActions(raw.bonus);
  result.reactions         = parseActions(raw.reaction);
  result.legendary_actions = parseActions(raw.legendary);
  return result;
}

// ── Main fetch dispatcher ─────────────────────────────────────
function fetchMonsterByName(name) {
  var statEl  = document.getElementById('monster-stat-block');
  var listEl  = document.getElementById('monster-results-list');
  statEl.className = 'msb-loading';
  statEl.textContent = 'Searching for "' + name + '"…';
  listEl.innerHTML = '';

  if (_monsterSource === 'open5e') {
    fetchMonsterOpen5e(name);
  } else {
    fetchMonster5etools(name);
  }
}

function fetchMonster5etools(name) {
  var statEl = document.getElementById('monster-stat-block');
  var listEl = document.getElementById('monster-results-list');
  var q      = name.toLowerCase();
  var sid    = ++_5etoolsSearchId;
  var allMatches = [];

  statEl.className = 'msb-loading';
  statEl.textContent = 'Loading bestiary index…';
  listEl.innerHTML = '';

  load5etoolsFileMap(function (idx) {
    if (sid !== _5etoolsSearchId) return;
    var sources = Object.keys(idx);
    if (!sources.length) {
      statEl.textContent = 'Could not connect to 5etools data. Check your network or switch to Open5e.';
      return;
    }

    // Load priority sources first so common monsters appear quickly
    sources.sort(function (a, b) {
      var ai = _5ET_PRIORITY.indexOf(a), bi = _5ET_PRIORITY.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });

    var total = sources.length;
    var completed = 0;

    function updateUI() {
      if (sid !== _5etoolsSearchId) return;
      var done = completed >= total;
      if (!allMatches.length) {
        statEl.className = 'msb-loading';
        statEl.textContent = done
          ? 'No results for "' + name + '" in 5etools.'
          : 'Searching 5etools (' + completed + '/' + total + ' sources)…';
        return;
      }
      // Auto-select single result only when all sources are done
      if (allMatches.length === 1 && done) {
        statEl.className = 'msb-loading';
        statEl.textContent = 'Loading ' + allMatches[0].name + '…';
        listEl.innerHTML = '';
        fetch5etoolsMonster(allMatches[0], function (m) {
          if (sid !== _5etoolsSearchId) return;
          if (m) renderMonsterStatBlock(m);
          else { statEl.className = 'msb-loading'; statEl.textContent = 'Failed to load monster data.'; }
        });
        return;
      }
      // Show list (rebuild on every update so new results appear)
      statEl.className = 'hidden';
      statEl.textContent = '';
      listEl.innerHTML = '';
      allMatches.forEach(function (entry) {
        var btn = document.createElement('button');
        btn.className = 'monster-result-btn';
        btn.textContent = entry.name + ' [' + entry.source + ']';
        btn.onclick = function () {
          listEl.querySelectorAll('.monster-result-btn').forEach(function (b) { b.classList.toggle('monster-result-active', b === btn); });
          statEl.className = 'msb-loading';
          statEl.textContent = 'Loading ' + entry.name + '…';
          fetch5etoolsMonster(entry, function (m) {
            if (m) renderMonsterStatBlock(m);
            else { statEl.className = 'msb-loading'; statEl.textContent = 'Failed to load monster data.'; }
          });
        };
        listEl.appendChild(btn);
      });
    }

    statEl.textContent = 'Searching 5etools (0/' + total + ' sources)…';

    sources.forEach(function (src) {
      function processSource(monsters) {
        if (sid !== _5etoolsSearchId) return;
        monsters.forEach(function (m) {
          if (m.name && m.name.toLowerCase().includes(q)) {
            allMatches.push({ name: m.name, source: src, file: idx[src] });
          }
        });
        completed++;
        updateUI();
      }

      if (_5etoolsLoadedSources[src]) {
        // Already cached — process asynchronously to avoid blocking the UI
        setTimeout(function () { processSource(_5etoolsLoadedSources[src]); }, 0);
      } else {
        fetch(_5ET_BASE + idx[src])
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var monsters = data.monster || [];
            _5etoolsLoadedSources[src] = monsters;
            processSource(monsters);
          })
          .catch(function () {
            if (sid !== _5etoolsSearchId) return;
            completed++;
            updateUI();
          });
      }
    });
  });
}

function fetchMonsterOpen5e(name) {
  var slug   = 'open5e:' + slugify(name);
  var statEl = document.getElementById('monster-stat-block');
  var listEl = document.getElementById('monster-results-list');
  if (_monsterCache[slug]) { renderMonsterStatBlock(_monsterCache[slug]); return; }
  statEl.className = 'msb-loading';
  statEl.textContent = 'Loading ' + name + '…';
  fetch('https://api.open5e.com/v1/monsters/?name__icontains=' + encodeURIComponent(name) + '&limit=20')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.results || !data.results.length) {
        statEl.className = 'msb-loading';
        statEl.textContent = 'No results for "' + name + '".';
        return;
      }
      if (data.results.length === 1) {
        _monsterCache['open5e:' + slugify(data.results[0].name)] = data.results[0];
        renderMonsterStatBlock(data.results[0]);
      } else {
        statEl.className = 'hidden';
        statEl.textContent = '';
        data.results.forEach(function (m) {
          var btn = document.createElement('button');
          btn.className = 'monster-result-btn';
          btn.textContent = m.name;
          btn.onclick = function () {
            _monsterCache['open5e:' + slugify(m.name)] = m;
            renderMonsterStatBlock(m);
            listEl.querySelectorAll('.monster-result-btn').forEach(function (b) {
              b.classList.toggle('monster-result-active', b === btn);
            });
          };
          listEl.appendChild(btn);
        });
      }
    })
    .catch(function () {
      statEl.className = 'msb-loading';
      statEl.textContent = 'Error fetching monster data. Check your network.';
    });
}

function renderMonsterStatBlock(m) {
  var el = document.getElementById('monster-stat-block');
  el.className = '';

  function prop(label, val) {
    if (!val && val !== 0) return '';
    return '<div class="msb-prop-line"><strong>' + label + '</strong> ' + val + '</div>';
  }

  var scores = [['STR',m.strength],['DEX',m.dexterity],['CON',m.constitution],
                ['INT',m.intelligence],['WIS',m.wisdom],['CHA',m.charisma]];
  var scoresHtml = scores.map(function (s) {
    return '<div class="msb-score-box"><div class="msb-score-label">' + s[0] + '</div>' +
      '<div class="msb-score-val">' + (s[1] || '—') + '</div>' +
      '<div class="msb-score-mod">' + (s[1] ? modStr(s[1]) : '') + '</div></div>';
  }).join('');

  function renderActionGroup(label, arr) {
    if (!arr || !arr.length) return '';
    var rows = arr.map(function (a) {
      return '<div class="msb-action"><span class="msb-action-name">' + escHtml(a.name) + '.</span> ' +
        escHtml(a.desc || '') + '</div>';
    }).join('');
    return '<div class="msb-actions-hdr">' + label + '</div>' + rows;
  }
  var actionsHtml = renderActionGroup('Actions', m.actions)
    + renderActionGroup('Bonus Actions', m.bonus_actions)
    + renderActionGroup('Reactions', m.reactions)
    + renderActionGroup('Legendary Actions', m.legendary_actions);

  var saves = [];
  ['strength_save','dexterity_save','constitution_save','intelligence_save','wisdom_save','charisma_save']
    .forEach(function (k) {
      if (m[k] !== null && m[k] !== undefined) {
        saves.push(k.replace('_save','').slice(0,3).toUpperCase() + ' +' + m[k]);
      }
    });

  var speedDisplay = m._source === '5etools'
    ? speedStr5e(m.speed)
    : (m.speed ? Object.entries(m.speed).filter(function(e){return e[1];}).map(function(e){return e[0]+' '+e[1];}).join(', ') : '');

  var srcBadge = m._source === '5etools'
    ? '<span style="font-size:0.65rem;color:#888;margin-left:0.5rem;">5etools</span>'
    : '<span style="font-size:0.65rem;color:#888;margin-left:0.5rem;">Open5e</span>';

  var artSlug = slugify(m.name);
  var artHtml = '<img class="msb-art" src="https://www.dnd5eapi.co/api/images/monsters/' + artSlug + '.png" alt="" onerror="this.style.display=\'none\'" loading="lazy">';

  el.innerHTML =
    artHtml +
    '<div class="msb-name">' + escHtml(m.name) + srcBadge + '</div>' +
    '<div class="msb-meta">' + escHtml((m.size||'') + ' ' + (m.type||'') + (m.subtype ? ' (' + m.subtype + ')' : '') + ', ' + (m.alignment||'')) + '</div>' +
    '<hr class="msb-divider">' +
    prop('Armor Class', escHtml(String(m.armor_class||'—')) + (m.armor_desc ? ' (' + escHtml(m.armor_desc) + ')' : '')) +
    prop('Hit Points', escHtml(String(m.hit_points||'—')) + (m.hit_dice ? ' (' + escHtml(m.hit_dice) + ')' : '')) +
    prop('Speed', escHtml(speedDisplay)) +
    prop('Challenge', escHtml(String(m.challenge_rating||'—')) + (m.xp ? ' (' + m.xp.toLocaleString() + ' XP)' : '')) +
    '<hr class="msb-divider">' +
    '<div class="msb-scores">' + scoresHtml + '</div>' +
    '<hr class="msb-divider">' +
    (saves.length ? prop('Saving Throws', saves.join(', ')) : '') +
    prop('Skills', m.skills ? Object.entries(m.skills).map(function(e){return e[0]+' +'+e[1];}).join(', ') : '') +
    prop('Damage Immunities', escHtml(m.damage_immunities||'')) +
    prop('Damage Resistances', escHtml(m.damage_resistances||'')) +
    prop('Damage Vulnerabilities', escHtml(m.damage_vulnerabilities||'')) +
    prop('Condition Immunities', escHtml(m.condition_immunities||'')) +
    prop('Senses', escHtml(m.senses||'')) +
    prop('Languages', escHtml(m.languages||'')) +
    (m.special_abilities && m.special_abilities.length ?
      '<hr class="msb-divider"><div class="msb-actions-hdr">Special Traits</div>' +
      m.special_abilities.map(function(a){
        return '<div class="msb-action"><span class="msb-action-name">' + escHtml(a.name) + '.</span> ' + escHtml(a.desc||'') + '</div>';
      }).join('') : '') +
    actionsHtml +
    '<button id="monster-send-btn" class="btn btn-secondary" style="margin-top:0.75rem;font-size:0.72rem;width:100%;">📜 Send to Players</button>';

  document.getElementById('monster-send-btn').addEventListener('click', function () {
    var scoreRow = scores.map(function(s){
      return '<span style="margin-right:0.6rem;"><b>' + s[0] + '</b> ' + (s[1]||'—') + (s[1] ? ' (' + modStr(s[1]) + ')' : '') + '</span>';
    }).join('');
    var dataHtml =
      '<div style="color:#aaa;font-style:italic;margin-bottom:0.4rem;">' +
        escHtml((m.size||'') + ' ' + (m.type||'') + (m.subtype?' ('+m.subtype+')':'') + ', ' + (m.alignment||'')) +
      '</div>' +
      '<div style="margin-bottom:0.3rem;"><b>AC</b> ' + escHtml(String(m.armor_class||'—')) + (m.armor_desc?' ('+escHtml(m.armor_desc)+')':'') +
        ' &nbsp;|&nbsp; <b>HP</b> ' + escHtml(String(m.hit_points||'—')) + (m.hit_dice?' ('+escHtml(m.hit_dice)+')':'') +
        ' &nbsp;|&nbsp; <b>Speed</b> ' + escHtml(speedDisplay) + '</div>' +
      '<div style="margin-bottom:0.4rem;"><b>CR</b> ' + escHtml(String(m.challenge_rating||'—')) +
        (m.xp ? ' (' + m.xp.toLocaleString() + ' XP)' : '') + '</div>' +
      '<div style="margin-bottom:0.4rem;">' + scoreRow + '</div>';
    fetch('/api/overlay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: m.name, data: dataHtml, duration: 20000 })
    });
  });
}

document.getElementById('monster-search-btn').addEventListener('click', function () {
  var q = document.getElementById('monster-search-input').value.trim();
  if (q) fetchMonsterByName(q);
});
document.getElementById('monster-search-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { var q = this.value.trim(); if (q) fetchMonsterByName(q); }
});
document.getElementById('monster-clear-btn').addEventListener('click', function () {
  document.getElementById('monster-search-input').value = '';
  document.getElementById('monster-results-list').innerHTML = '';
  var sb = document.getElementById('monster-stat-block');
  sb.innerHTML = ''; sb.className = 'hidden';
});

// Source toggle buttons removed — 5etools mirrors are unavailable; Open5e is the active source

// ============================================================
// Boot
// ============================================================
connectWebSocket();
renderScenesPanel();
renderAudioPanel();
initSceneBuilder();
loadPlayerRoster();
loadInitiative();
renderInitiative();

// ── Sidebar toggle + resize ───────────────────────────────────
(function () {
  var sidebar = document.getElementById('sidebar');
  var btn     = document.getElementById('sidebar-toggle');
  var handle  = document.getElementById('sidebar-resize');
  var inner   = sidebar ? sidebar.querySelector('.sidebar-inner') : null;
  if (!sidebar || !btn) return;

  var MIN_WIDTH = 180;
  var MAX_WIDTH = 600;
  var lastWidth = 300;

  function setWidth(w) {
    w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w));
    sidebar.style.width    = w + 'px';
    sidebar.style.minWidth = w + 'px';
    if (inner) inner.style.width = w + 'px';
    lastWidth = w;
  }

  // Toggle collapse/expand
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    sidebar.classList.add('animating');
    setTimeout(function () { sidebar.classList.remove('animating'); }, 220);
    if (sidebar.classList.contains('collapsed')) {
      sidebar.classList.remove('collapsed');
      sidebar.style.width    = lastWidth + 'px';
      sidebar.style.minWidth = lastWidth + 'px';
      if (inner) inner.style.width = lastWidth + 'px';
      btn.textContent = '‹';
    } else {
      lastWidth = sidebar.offsetWidth || lastWidth;
      sidebar.classList.add('collapsed');
      sidebar.style.width    = '32px';
      sidebar.style.minWidth = '32px';
      if (inner) inner.style.width = '32px';
      btn.textContent = '›';
    }
  });

  // Section collapse/expand
  document.querySelectorAll('.sb-section-hdr').forEach(function (hdr) {
    hdr.addEventListener('click', function (e) {
      if (e.target.closest('.btn')) return;
      hdr.closest('.sb-section').classList.toggle('collapsed');
    });
  });

  // Drag-to-resize
  if (!handle) return;
  var resizing = false;
  var startX   = 0;
  var startW   = 0;

  handle.addEventListener('mousedown', function (e) {
    if (sidebar.classList.contains('collapsed')) return;
    e.preventDefault();
    resizing = true;
    startX   = e.clientX;
    startW   = sidebar.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', function (e) {
    if (!resizing) return;
    setWidth(startW + (e.clientX - startX));
  });

  document.addEventListener('mouseup', function () {
    if (!resizing) return;
    resizing = false;
    handle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  });
}());

// ── Right Sidebar collapse + drag-to-resize ─────────────────────
(function () {
  var sidebar = document.getElementById('sidebar-right');
  var btn     = document.getElementById('sidebar-right-toggle');
  var handle  = document.getElementById('sidebar-right-resize');
  if (!sidebar) return;

  // Wrap existing children in .sidebar-right-inner so collapse can hide them
  var inner = document.createElement('div');
  inner.className = 'sidebar-right-inner';
  while (sidebar.firstChild) inner.appendChild(sidebar.firstChild);
  sidebar.appendChild(inner);
  // Re-append the collapse button and resize handle outside inner
  if (btn)    sidebar.insertBefore(btn, inner);
  if (handle) sidebar.insertBefore(handle, inner);

  var MIN_WIDTH = 200;
  var MAX_WIDTH = 700;
  var lastWidth = 340;

  // Toggle collapse/expand
  if (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      sidebar.classList.add('animating');
      setTimeout(function () { sidebar.classList.remove('animating'); }, 220);
      if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
        sidebar.style.width    = lastWidth + 'px';
        sidebar.style.minWidth = lastWidth + 'px';
        btn.textContent = '›';
      } else {
        lastWidth = sidebar.offsetWidth || lastWidth;
        sidebar.classList.add('collapsed');
        sidebar.style.width    = '32px';
        sidebar.style.minWidth = '32px';
        btn.textContent = '‹';
      }
    });
  }

  // Drag-to-resize
  if (!handle) return;
  var resizing = false;
  var startX   = 0;
  var startW   = 0;

  handle.addEventListener('mousedown', function (e) {
    if (sidebar.classList.contains('collapsed')) return;
    e.preventDefault();
    resizing = true;
    startX   = e.clientX;
    startW   = sidebar.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', function (e) {
    if (!resizing) return;
    var newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW - (e.clientX - startX)));
    sidebar.style.width    = newW + 'px';
    sidebar.style.minWidth = newW + 'px';
    lastWidth = newW;
  });

  document.addEventListener('mouseup', function () {
    if (!resizing) return;
    resizing = false;
    handle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  });
}());


// ============================================================
// Party Manager
// ============================================================
var partyPlayers = [];   // [{ name, cls, hp, maxHp, xp, ac, stats, online, ... }]

function upsertPartyPlayer(player) {
  if (!player || !player.name) return;
  var idx = partyPlayers.findIndex(function (p) { return p.name === player.name; });
  var merged = Object.assign(
    { hp: 10, maxHp: 10, xp: 0, ac: 10, stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, online: true },
    idx >= 0 ? partyPlayers[idx] : {},
    player,
    { online: true }
  );
  // Normalise nested stats
  merged.stats = Object.assign(
    { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    (idx >= 0 && partyPlayers[idx].stats) || {},
    player.stats || {}
  );
  if (idx >= 0) partyPlayers[idx] = merged;
  else partyPlayers.push(merged);
  // Keep alphabetical for stable UI
  partyPlayers.sort(function (a, b) {
    return (a.name || '').localeCompare(b.name || '');
  });
}

function updatePlayerStat(playerName, field, amount) {
  if (!ws || ws.readyState !== 1) return;
  var p = partyPlayers.find(function (x) { return x.name === playerName; });
  if (!p) return;

  var newValue;
  if (field === 'hp') {
    newValue = Math.max(0, Math.min((p.maxHp != null ? p.maxHp : 999), (p.hp || 0) + amount));
  } else if (field === 'maxHp') {
    newValue = Math.max(1, (p.maxHp || 10) + amount);
    // Also clamp current HP if it now exceeds max
    if ((p.hp || 0) > newValue) {
      wsSend({ action: 'update-player-data', playerName: playerName, patch: { maxHp: newValue, hp: newValue } });
      return;
    }
  } else if (field === 'xp') {
    newValue = Math.max(0, (p.xp || 0) + amount);
  } else if (field === 'ac') {
    newValue = Math.max(0, (p.ac || 10) + amount);
  } else {
    return;
  }

  var patch = {};
  patch[field] = newValue;
  // Optimistic local update so UI feels instant
  p[field] = newValue;
  renderParty();

  wsSend({
    action: 'update-player-data',
    playerName: playerName,
    patch: patch
  });
}

function setPlayerField(playerName, field, value) {
  if (!ws || ws.readyState !== 1) return;
  var p = partyPlayers.find(function (x) { return x.name === playerName; });
  if (!p) return;
  var num = parseInt(value, 10);
  if (isNaN(num)) return;
  if (field === 'hp') num = Math.max(0, Math.min(p.maxHp != null ? p.maxHp : 999, num));
  if (field === 'maxHp') num = Math.max(1, num);
  if (field === 'xp' || field === 'ac') num = Math.max(0, num);

  p[field] = num;
  renderParty();
  var patch = {};
  patch[field] = num;
  wsSend({ action: 'update-player-data', playerName: playerName, patch: patch });
}

function renderParty() {
  // Character system owns party-list-container — do not overwrite sheets
  if (typeof renderCharacterSheets === 'function' && typeof characterRoster !== 'undefined' && characterRoster.length) {
    renderCharacterSheets();
    return;
  }
  var container = document.getElementById('party-list-container');
  var countLabel = document.getElementById('party-count-label');
  if (!container) return;

  var online = partyPlayers.filter(function (p) { return p.online !== false; });
  if (countLabel) {
    countLabel.textContent = partyPlayers.length
      ? online.length + ' online / ' + partyPlayers.length + ' total'
      : 'Waiting for players…';
  }

  if (!partyPlayers.length) {
    container.innerHTML = '<p style="color:#666;font-size:0.8rem;margin:0;">Players will appear here when they log in.</p>';
    return;
  }

  container.innerHTML = partyPlayers.map(function (p) {
    var hp     = p.hp != null ? p.hp : 10;
    var maxHp  = p.maxHp != null ? p.maxHp : 10;
    var xp     = p.xp != null ? p.xp : 0;
    var ac     = p.ac != null ? p.ac : 10;
    var stats  = p.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    var online = p.online !== false;
    var hpPct  = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0;
    var hpColor = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#facc15' : '#ef4444';
    var nameEsc = escHtml(p.name);

    return (
      '<div class="party-card" data-player="' + nameEsc + '" style="' +
        'background:#1a1f2e;border:1px solid ' + (online ? '#30363d' : '#3f3f46') + ';' +
        'border-radius:8px;padding:0.7rem 0.85rem;opacity:' + (online ? '1' : '0.55') + ';">' +

        // Header
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.45rem;gap:0.5rem;">' +
          '<div style="display:flex;align-items:center;gap:0.4rem;min-width:0;">' +
            '<span style="width:8px;height:8px;border-radius:50%;background:' + (online ? '#22c55e' : '#6b7280') + ';flex-shrink:0;"></span>' +
            '<strong style="color:#d4af37;font-size:0.98rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + nameEsc + '</strong>' +
          '</div>' +
          '<span style="color:#888;font-size:0.78rem;flex-shrink:0;">' +
            escHtml(p.cls || '—') + ' · AC <b style="color:#e6e6e6;">' + ac + '</b>' +
          '</span>' +
        '</div>' +

        // HP bar + controls
        '<div style="margin-bottom:0.4rem;">' +
          '<div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.25rem;">' +
            '<span style="font-size:0.78rem;color:#aaa;width:28px;">HP</span>' +
            '<span style="color:' + hpColor + ';font-weight:bold;font-size:1.05rem;min-width:58px;text-align:center;">' +
              hp + ' / ' + maxHp +
            '</span>' +
            '<div style="display:flex;gap:0.2rem;margin-left:auto;">' +
              '<button class="btn btn-danger btn-small party-hp-btn" data-delta="-5" style="padding:0.12rem 0.38rem;font-size:0.72rem;">−5</button>' +
              '<button class="btn btn-danger btn-small party-hp-btn" data-delta="-1" style="padding:0.12rem 0.38rem;font-size:0.72rem;">−1</button>' +
              '<button class="btn btn-primary btn-small party-hp-btn" data-delta="1" style="padding:0.12rem 0.38rem;font-size:0.72rem;">+1</button>' +
              '<button class="btn btn-primary btn-small party-hp-btn" data-delta="5" style="padding:0.12rem 0.38rem;font-size:0.72rem;">+5</button>' +
            '</div>' +
          '</div>' +
          '<div style="height:5px;background:#21262d;border-radius:3px;overflow:hidden;">' +
            '<div style="height:100%;width:' + hpPct + '%;background:' + hpColor + ';transition:width 0.25s;"></div>' +
          '</div>' +
        '</div>' +

        // XP + quick buttons
        '<div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.35rem;">' +
          '<span style="font-size:0.78rem;color:#aaa;width:28px;">XP</span>' +
          '<span style="color:#60a5fa;font-weight:bold;font-size:1rem;min-width:58px;text-align:center;">' + xp + '</span>' +
          '<div style="display:flex;gap:0.2rem;margin-left:auto;">' +
            '<button class="btn btn-secondary btn-small party-xp-btn" data-delta="50" style="padding:0.12rem 0.38rem;font-size:0.72rem;">+50</button>' +
            '<button class="btn btn-secondary btn-small party-xp-btn" data-delta="100" style="padding:0.12rem 0.38rem;font-size:0.72rem;">+100</button>' +
            '<button class="btn btn-secondary btn-small party-xp-btn" data-delta="250" style="padding:0.12rem 0.38rem;font-size:0.72rem;">+250</button>' +
          '</div>' +
        '</div>' +

        // Ability scores
        '<div style="display:flex;flex-wrap:wrap;gap:0.45rem 0.7rem;font-size:0.72rem;color:#9ca3af;' +
          'border-top:1px solid #21262d;padding-top:0.4rem;margin-top:0.15rem;">' +
          '<span>STR <b style="color:#e5e7eb;">' + (stats.str || 10) + '</b></span>' +
          '<span>DEX <b style="color:#e5e7eb;">' + (stats.dex || 10) + '</b></span>' +
          '<span>CON <b style="color:#e5e7eb;">' + (stats.con || 10) + '</b></span>' +
          '<span>INT <b style="color:#e5e7eb;">' + (stats.int || 10) + '</b></span>' +
          '<span>WIS <b style="color:#e5e7eb;">' + (stats.wis || 10) + '</b></span>' +
          '<span>CHA <b style="color:#e5e7eb;">' + (stats.cha || 10) + '</b></span>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  // Event delegation for the buttons (avoids inline onclick + escaping issues)
  container.querySelectorAll('.party-hp-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.closest('.party-card');
      if (!card) return;
      var name = card.getAttribute('data-player');
      var delta = parseInt(btn.getAttribute('data-delta'), 10);
      if (name && !isNaN(delta)) updatePlayerStat(name, 'hp', delta);
    });
  });
  container.querySelectorAll('.party-xp-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.closest('.party-card');
      if (!card) return;
      var name = card.getAttribute('data-player');
      var delta = parseInt(btn.getAttribute('data-delta'), 10);
      if (name && !isNaN(delta)) updatePlayerStat(name, 'xp', delta);
    });
  });
}

// Refresh button
document.addEventListener('DOMContentLoaded', function () {
  var refreshBtn = document.getElementById('party-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      // Ask server for current party snapshot if it supports it; otherwise just re-render local state
      if (ws && ws.readyState === 1) {
        wsSend({ action: 'request-party-state' });
      }
      renderParty();
    });
  }
});

// Initial empty render (in case panel is open before anyone logs in)
if (document.getElementById('party-list-container')) {
  renderParty();
}
// ============================================================
// DM — Character Templates + Character Sheets
// Append to dm/app.js (or include as separate script after app.js)
// ============================================================

var characterRoster = []; // full templates from server

function abilityMod(score) {
  return Math.floor(((Number(score) || 10) - 10) / 2);
}
function fmtMod(n) {
  return (n >= 0 ? '+' : '') + n;
}
function effectiveStat(ch, key) {
  var base = (ch.stats && ch.stats[key]) != null ? ch.stats[key] : 10;
  var bonus = (ch.modifiers && ch.modifiers[key]) != null ? ch.modifiers[key] : 0;
  return { base: base, bonus: bonus, total: base + bonus };
}

// ── Load / save roster ───────────────────────────────────────
function loadCharacterRoster(cb) {
  fetch('/api/characters')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      characterRoster = data.characters || [];
      renderCharacterRoster();
      renderCharacterSheets();
      if (cb) cb();
    })
    .catch(function () {
      characterRoster = [];
      renderCharacterRoster();
    });
}

function createCharacter() {
  var name = (document.getElementById('cc-name') || {}).value;
  if (!name || !String(name).trim()) return;
  var hasCaster = !!(document.getElementById('cc-caster') || {}).checked;
  var body = {
    name: String(name).trim(),
    race: (document.getElementById('cc-race') || {}).value || '',
    cls: (document.getElementById('cc-cls') || {}).value || '',
    stats: {
      str: parseInt((document.getElementById('cc-str') || {}).value, 10) || 10,
      dex: parseInt((document.getElementById('cc-dex') || {}).value, 10) || 10,
      con: parseInt((document.getElementById('cc-con') || {}).value, 10) || 10,
      int: parseInt((document.getElementById('cc-int') || {}).value, 10) || 10,
      wis: parseInt((document.getElementById('cc-wis') || {}).value, 10) || 10,
      cha: parseInt((document.getElementById('cc-cha') || {}).value, 10) || 10
    },
    maxHp: parseInt((document.getElementById('cc-maxhp') || {}).value, 10) || 10,
    ac: parseInt((document.getElementById('cc-ac') || {}).value, 10) || 10,
    hasSpellcasting: hasCaster,
    spellSlots1: hasCaster ? (parseInt((document.getElementById('cc-slots1') || {}).value, 10) || 0) : 0
  };
  if (hasCaster) {
    body.spellSlots = {
      '1': { max: body.spellSlots1, used: 0 },
      '2': { max: 0, used: 0 },
      '3': { max: 0, used: 0 }
    };
  }
  fetch('/api/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
    .then(function (r) { return r.json(); })
    .then(function () {
      ['cc-name', 'cc-race', 'cc-cls'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
      loadCharacterRoster();
    });
}

function deleteCharacter(id) {
  if (!confirm('Удалить персонажа?')) return;
  fetch('/api/characters/' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function () { loadCharacterRoster(); });
}

function patchCharacter(id, patch) {
  // optimistic
  var ch = characterRoster.find(function (c) { return c.id === id; });
  if (ch) {
    Object.keys(patch).forEach(function (k) {
      if (k === 'modifiers' || k === 'stats' || k === 'spellSlots') {
        ch[k] = Object.assign({}, ch[k] || {}, patch[k]);
      } else {
        ch[k] = patch[k];
      }
    });
    renderCharacterSheets();
    renderCharacterRoster();
  }
  if (typeof wsSend === 'function') {
    wsSend({ action: 'update-character', characterId: id, patch: patch });
  } else {
    fetch('/api/characters/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }).then(function () { loadCharacterRoster(); });
  }
}

function adjustModifier(id, stat, delta) {
  var ch = characterRoster.find(function (c) { return c.id === id; });
  if (!ch) return;
  var mods = Object.assign({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, ch.modifiers || {});
  mods[stat] = (mods[stat] || 0) + delta;
  patchCharacter(id, { modifiers: mods });
}

function adjustHp(id, delta) {
  var ch = characterRoster.find(function (c) { return c.id === id; });
  if (!ch) return;
  var maxHp = ch.maxHp != null ? ch.maxHp : 10;
  var hp = Math.max(0, Math.min(maxHp, (ch.hp != null ? ch.hp : maxHp) + delta));
  patchCharacter(id, { hp: hp });
}

function toggleSpellSlot(id, level, slotIndex) {
  var ch = characterRoster.find(function (c) { return c.id === id; });
  if (!ch || !ch.spellSlots || !ch.spellSlots[level]) return;
  var slot = Object.assign({}, ch.spellSlots[level]);
  // toggle used count by index: if clicking a filled slot, set used to index; if empty, set used to index+1
  if (slotIndex < slot.used) {
    slot.used = slotIndex; // restore this and above
  } else {
    slot.used = slotIndex + 1;
  }
  slot.used = Math.max(0, Math.min(slot.max, slot.used));
  var all = Object.assign({}, ch.spellSlots);
  all[level] = slot;
  patchCharacter(id, { spellSlots: all });
}

// ── Roster list (templates) ──────────────────────────────────
function renderCharacterRoster() {
  var list = document.getElementById('char-roster-list');
  if (!list) return;
  if (!characterRoster.length) {
    list.innerHTML = '<p class="ref-empty">Пока нет персонажей — создайте первого.</p>';
    return;
  }
  list.innerHTML = characterRoster.map(function (ch) {
    var claimed = ch.claimedBy
      ? '<span class="cr-meta">🟢 ' + escHtml(ch.claimedBy) + '</span>'
      : '<span class="cr-meta">свободный</span>';
    return (
      '<div class="char-roster-item' + (ch.claimedBy ? ' claimed' : '') + '">' +
        '<span class="cr-name">' + escHtml(ch.name) + '</span>' +
        '<span class="cr-meta">' + escHtml(ch.cls || '') + (ch.race ? ' · ' + escHtml(ch.race) : '') + '</span>' +
        claimed +
        '<button type="button" class="btn btn-danger btn-small" data-del-char="' + escHtml(ch.id) + '">✕</button>' +
      '</div>'
    );
  }).join('');

  list.querySelectorAll('[data-del-char]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      deleteCharacter(btn.getAttribute('data-del-char'));
    });
  });
}

// ── Live character sheets ────────────────────────────────────
function renderCharacterSheets() {
  var container = document.getElementById('party-list-container');
  var countLabel = document.getElementById('party-count-label');
  if (!container) return;

  var active = characterRoster.filter(function (c) { return !!c.claimedBy; });
  // Also show unclaimed templates so DM can prep HP — optional: show all
  var show = characterRoster.length ? characterRoster : [];

  if (countLabel) {
    countLabel.textContent = active.length
      ? active.length + ' в игре / ' + characterRoster.length + ' всего'
      : (characterRoster.length ? characterRoster.length + ' шаблонов' : 'Нет персонажей');
  }

  if (!show.length) {
    container.innerHTML = '<p class="ref-empty">Создайте персонажей во вкладке «Создание персонажей».</p>';
    return;
  }

  var STATS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  var LABELS = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

  container.innerHTML = show.map(function (ch) {
    var hp = ch.hp != null ? ch.hp : (ch.maxHp || 10);
    var maxHp = ch.maxHp != null ? ch.maxHp : 10;
    var pct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0;
    var barClass = pct > 60 ? 'char-bar-high' : pct > 30 ? 'char-bar-mid' : 'char-bar-low';
    var offline = !ch.claimedBy;

    var statsHtml = STATS.map(function (k) {
      var e = effectiveStat(ch, k);
      var mod = abilityMod(e.total);
      var bonusStr = e.bonus
        ? ' <span class="char-stat-bonus">(' + (e.bonus > 0 ? '+' : '') + e.bonus + ')</span>'
        : '';
      return (
        '<div class="char-stat">' +
          '<div class="char-stat-label">' + LABELS[k] + '</div>' +
          '<div class="char-stat-score">' + e.total + bonusStr + '</div>' +
          '<div class="char-stat-mod">' + fmtMod(mod) + '</div>' +
          '<div class="char-stat-btns">' +
            '<button type="button" data-mod="' + ch.id + ':' + k + ':-1">−</button>' +
            '<button type="button" data-mod="' + ch.id + ':' + k + ':1">+</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    var spellsHtml = '';
    if (ch.hasSpellcasting && ch.spellSlots) {
      var groups = Object.keys(ch.spellSlots).sort().map(function (lvl) {
        var s = ch.spellSlots[lvl];
        if (!s || !s.max) return '';
        var dots = '';
        for (var i = 0; i < s.max; i++) {
          dots += '<button type="button" class="spell-slot' + (i < s.used ? ' used' : '') +
            '" data-slot="' + ch.id + ':' + lvl + ':' + i + '" title="Ур.' + lvl + '"></button>';
        }
        return (
          '<div class="spell-level-group">' +
            '<span class="spell-level-tag">' + lvl + '</span>' + dots +
          '</div>'
        );
      }).join('');
      if (groups) {
        spellsHtml =
          '<div class="char-spells">' +
            '<span class="char-spells-label">🔮 Ячейки</span>' + groups +
          '</div>';
      }
    }

    return (
      '<div class="char-sheet' + (offline ? ' offline' : '') + '" data-char-id="' + escHtml(ch.id) + '">' +
        '<div class="char-sheet-header">' +
          '<span class="char-sheet-name">' + escHtml(ch.name) + '</span>' +
          '<span class="char-sheet-sub">' +
            escHtml(ch.cls || '') +
            (ch.race ? ' · ' + escHtml(ch.race) : '') +
            ' · AC ' + (ch.ac != null ? ch.ac : 10) +
            (ch.claimedBy ? ' · 🟢' : '') +
          '</span>' +
        '</div>' +
        '<div class="char-sheet-stats">' + statsHtml + '</div>' +
        '<div class="char-hp-row">' +
          '<span class="char-hp-label">HP</span>' +
          '<span class="char-hp-value">' + hp + ' / ' + maxHp + '</span>' +
          '<div class="char-hp-btns">' +
            '<button type="button" class="btn btn-danger btn-small" data-hp="' + ch.id + ':-5">−5</button>' +
            '<button type="button" class="btn btn-danger btn-small" data-hp="' + ch.id + ':-1">−1</button>' +
            '<button type="button" class="btn btn-primary btn-small" data-hp="' + ch.id + ':1">+1</button>' +
            '<button type="button" class="btn btn-primary btn-small" data-hp="' + ch.id + ':5">+5</button>' +
          '</div>' +
        '</div>' +
        '<div class="char-bar"><div class="char-bar-fill ' + barClass + '" style="width:' + pct + '%"></div></div>' +
        spellsHtml +
        '<button type="button" class="btn btn-secondary" onclick="editPocketCharacter(this)">Карточка игрока · изменить</button>' +
      '</div>'
    );
  }).join('');

  // Events
  container.querySelectorAll('[data-mod]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var p = btn.getAttribute('data-mod').split(':');
      adjustModifier(p[0], p[1], parseInt(p[2], 10));
    });
  });
  container.querySelectorAll('[data-hp]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var p = btn.getAttribute('data-hp').split(':');
      adjustHp(p[0], parseInt(p[1], 10));
    });
  });
  container.querySelectorAll('[data-slot]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var p = btn.getAttribute('data-slot').split(':');
      toggleSpellSlot(p[0], p[1], parseInt(p[2], 10));
    });
  });
}

// ── Compact initiative render (override / replace renderInitiative name parts) ──
// Call this idea: in your existing renderInitiative, only show:
//   roll | name | conditions | target btn | remove
// Do NOT inject HP, stats, class badges into the name line.
//
// Example name line:
//   nameSpan.textContent = entry.name;
//   // no innerHTML with PC badges / HP

// ── Wire up form ─────────────────────────────────────────────
(function initCharacterSystem() {
  function wire() {
    var createBtn = document.getElementById('cc-create-btn');
    if (createBtn) createBtn.addEventListener('click', createCharacter);

    var caster = document.getElementById('cc-caster');
    var slotsWrap = document.getElementById('cc-slots-wrap');
    if (caster && slotsWrap) {
      caster.addEventListener('change', function () {
        slotsWrap.style.display = caster.checked ? '' : 'none';
      });
    }

    var refresh = document.getElementById('party-refresh-btn');
    if (refresh) refresh.addEventListener('click', function () { loadCharacterRoster(); });

    loadCharacterRoster();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();

// ── WS hooks — add inside your ws.onmessage ──────────────────
// if (msg.type === 'CHARACTERS_UPDATE') {
//   characterRoster = msg.characters || [];
//   renderCharacterRoster();
//   renderCharacterSheets();
//   return;
// }
// if (msg.type === 'PLAYER_DATA_UPDATE' && msg.player) {
//   var idx = characterRoster.findIndex(function (c) { return c.id === msg.player.id || c.name === msg.player.name; });
//   if (idx >= 0) characterRoster[idx] = Object.assign({}, characterRoster[idx], msg.player);
//   else if (msg.player.id) characterRoster.push(msg.player);
//   renderCharacterSheets();
//   renderCharacterRoster();
//   return;
// }
