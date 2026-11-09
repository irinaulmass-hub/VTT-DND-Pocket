// ============================================================
//  D&D Player View — player.js
// ============================================================

var sceneEl     = document.getElementById('scene');
var statusEl    = document.getElementById('status');
var tapOverlay  = document.getElementById('tap-overlay');
var popupEl     = document.getElementById('popup-overlay');
var popupTimer  = null;
var isTableScreen = document.documentElement.hasAttribute('data-table-view');
var tableStatus = document.getElementById('table-status');
var scenePaint = 0;

var globalAudio    = null;
var pendingAudio   = null;   // queued until tap-overlay is dismissed
var audioUnlocked  = false;
var currentFogKey  = null;
var fogStates      = {};
var currentTokens  = [];
var showCondRings  = true;
var currentDrawing = [];
var currentMapKey  = null;
var currentImageUrl = null;
var currentFeatures    = [];   // feature defs for the current map
var currentMapMeta     = null; // { cols, rows } from builder state
var triggeredFeatures  = {};   // { featureId: true }
var currentObjects     = [];   // moveable object definitions
var currentObjectStates = {};  // objId -> { activated, currentCol, currentRow, currentRotation }
var _lbObjects = [];           // puzzle lightbox sub-map object defs
var _lbObjectStates = {};      // puzzle lightbox object states (client-computed, server-relayed)
var _lbCols = 20;              // sub-map grid columns
var _lbRows = 20;              // sub-map grid rows

var myPlayerName = null;  // set after successful login
var myPlayerCls  = null;
var myMovementLocked = false;  // set by DM lock controls
var myTarget     = null;       // label of my current combat target
var allTargets   = {};         // playerName -> targetLabel (all players' targets)
var gridEnabled  = false;      // DM-toggled grid overlay

// Login timeout — reset the login button if the server never responds
var _loginTimeout = null;
function resetLoginBtn() {
  var subBtn = document.getElementById('login-submit-btn');
  if (subBtn) { subBtn.textContent = 'Enter Session'; subBtn.disabled = false; }
  if (_loginTimeout) { clearTimeout(_loginTimeout); _loginTimeout = null; }
}

// Unlock audio on any click (but don't auto-dismiss overlay)
document.addEventListener('click', function () {
  if (!audioUnlocked) {
    audioUnlocked = true;
  }
  if (pendingAudio) {
    var p = pendingAudio;
    pendingAudio = null;
    playAudio(p.url, p.loop);
  }
});

function dismissTapOverlay() {
  if (tapOverlay) tapOverlay.classList.add('hidden');
}

// ── Tap overlay button handlers ───────────────────────────────
(function () {
  if (isTableScreen) return;
  var guestBtn    = document.getElementById('tap-guest-btn');
  var loginBtn    = document.getElementById('tap-login-btn');
  var backBtn     = document.getElementById('login-back-btn');
  var submitBtn   = document.getElementById('login-submit-btn');
  var landing     = document.getElementById('tap-landing');
  var loginForm   = document.getElementById('tap-login-form');
  var errEl       = document.getElementById('login-error');
  var partySelect = document.getElementById('login-party-select');
  var logoffBtn   = document.getElementById('logoff-btn');

  // Load party list from server into the dropdown (characters system)
  var playerCharacters = [];
  function loadParty() {
    if (!partySelect) return;
    fetch('/api/characters')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        playerCharacters = data.characters || [];
        partySelect.innerHTML = '<option value="">— выберите персонажа —</option>';
        playerCharacters.forEach(function (ch) {
          var opt = document.createElement('option');
          opt.value = ch.id;
          var taken = ch.claimedBy ? ' (занят: ' + ch.claimedBy + ')' : '';
          opt.textContent = ch.name + (ch.cls ? ' — ' + ch.cls : '') + taken;
          partySelect.appendChild(opt);
        });
      })
      .catch(function () {
        // fallback to old players API
        fetch('/api/players')
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var players = Array.isArray(data) ? data : (data.players || []);
            partySelect.innerHTML = '<option value="">Choose your character...</option>';
            players.forEach(function (p) {
              var opt = document.createElement('option');
              opt.value = JSON.stringify({ name: p.name, cls: p.cls });
              opt.textContent = p.name + ' — ' + p.cls;
              partySelect.appendChild(opt);
            });
          })
          .catch(function () {
            partySelect.innerHTML = '<option value="">Could not load party list</option>';
          });
      });
  }

  if (guestBtn) {
    guestBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      // Unlock audio — stopPropagation blocks the document-level click listener
      if (!audioUnlocked) {
        audioUnlocked = true;
        if (pendingAudio) { var pa = pendingAudio; pendingAudio = null; playAudio(pa.url, pa.loop); }
      }
      sessionStorage.setItem('dnd_guest_tapped', '1'); // remember so page-refresh skips overlay
      dismissTapOverlay();
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      loadParty();
      if (landing)   landing.style.display   = 'none';
      if (loginForm) loginForm.style.display = 'flex';
      // Pre-select from sessionStorage if available
      var savedName = sessionStorage.getItem('dnd_player_name');
      if (savedName && partySelect) {
        setTimeout(function () {
          for (var i = 0; i < partySelect.options.length; i++) {
            try {
              var data = JSON.parse(partySelect.options[i].value);
              if (data.name === savedName) { partySelect.selectedIndex = i; break; }
            } catch (e) {}
          }
        }, 300); // give fetch time to populate
      }
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (loginForm) loginForm.style.display = 'none';
      if (landing)   landing.style.display   = 'flex';
      if (errEl) errEl.textContent = '';
    });
  }

  function doLogin() {
    if (!partySelect || !errEl) return;
    var raw = partySelect.value;
    if (!raw) { errEl.textContent = 'Выберите персонажа из списка.'; return; }
    errEl.textContent = '';
    // New character system (id-based)
    var ch = playerCharacters.find(function (c) { return c.id === raw; });
    if (ch) {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          action: 'claim-character',
          characterId: ch.id,
          playerName: ch.name
        }));
        // also legacy for compatibility
        ws.send(JSON.stringify({ action: 'player-login', name: ch.name, cls: ch.cls || '' }));
        if (submitBtn) { submitBtn.textContent = 'Entering...'; submitBtn.disabled = true; }
        if (_loginTimeout) clearTimeout(_loginTimeout);
        _loginTimeout = setTimeout(function () {
          _loginTimeout = null;
          resetLoginBtn();
          errEl.textContent = 'No response — check connection and try again.';
        }, 6000);
      } else {
        errEl.textContent = 'Not connected — try again in a moment.';
      }
      return;
    }
    // Legacy JSON value from /api/players fallback
    var player;
    try { player = JSON.parse(raw); } catch (e) { errEl.textContent = 'Invalid selection.'; return; }
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ action: 'player-login', name: player.name, cls: player.cls }));
      if (submitBtn) { submitBtn.textContent = 'Entering...'; submitBtn.disabled = true; }
      if (_loginTimeout) clearTimeout(_loginTimeout);
      _loginTimeout = setTimeout(function () {
        _loginTimeout = null;
        resetLoginBtn();
        errEl.textContent = 'No response — check connection and try again.';
      }, 6000);
    } else {
      errEl.textContent = 'Not connected — try again in a moment.';
    }
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      // Unlock audio — stopPropagation blocks the document-level click listener
      if (!audioUnlocked) {
        audioUnlocked = true;
        if (pendingAudio) { var pa2 = pendingAudio; pendingAudio = null; playAudio(pa2.url, pa2.loop); }
      }
      doLogin();
    });
  }

  if (partySelect) {
    partySelect.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doLogin(); }
    });
  }

  // Logoff button
  if (logoffBtn) {
    logoffBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      myPlayerName = null;
      myPlayerCls  = null;
      sessionStorage.removeItem('dnd_player_name');
      sessionStorage.removeItem('dnd_player_cls');
      var playerHud = document.getElementById('player-hud');
      if (playerHud) playerHud.style.display = 'none';
      // Re-render tokens without drag handle
      if (currentTokens.length) renderTokenOverlay(currentTokens);
      // Show overlay again at landing
      if (loginForm) loginForm.style.display = 'none';
      if (landing)   landing.style.display   = 'flex';
      if (tapOverlay) tapOverlay.classList.remove('hidden');
      if (submitBtn) { submitBtn.textContent = 'Enter Session'; submitBtn.disabled = false; }
      if (errEl) errEl.textContent = '';
      sessionStorage.removeItem('dnd_guest_tapped'); // clear guest flag when logging off
    });
  }

  // Auto-dismiss tap overlay on page load if the projector already tapped this session.
  // Lets the central table screen survive a forced refresh without manual tap.
  if (sessionStorage.getItem('dnd_guest_tapped') && !sessionStorage.getItem('dnd_player_name')) {
    dismissTapOverlay();
  }

}());

function presentationAsset(value) {
  if (!value) return value;
  try {
    const url = new URL(value, location.href);
    if (url.origin !== location.origin || !/^\/assets\/(maps|audio)\//i.test(url.pathname)) return value;
    url.pathname = '/presentation' + url.pathname;
    url.searchParams.set('game', window.currentCampaignId || 'default');
    return url.href;
  } catch { return value; }
}

// ── Image display ────────────────────────────────────────────
function showImage(imageUrl, fogKey, fit) {
  var paint = ++scenePaint;
  if (isTableScreen) {
    document.documentElement.dataset.tableScene = '';
    fit = 'contain';
  }
  var existingImg = sceneEl.querySelector('img');
  // If the same image is already loaded, skip the fade/reload entirely.
  // This prevents a long blank screen on WiFi reconnect when state is replayed.
  // Overlays are cleared by the caller (SHOW_SCENE_VIEW) and will be re-applied
  // by the UPDATE_TOKENS / UPDATE_DRAWING messages that follow immediately.
  if (existingImg && existingImg.naturalWidth && currentImageUrl === imageUrl) {
    sceneEl.classList.remove('fading');
    currentFogKey = fogKey || null;
    existingImg.style.objectFit = fit || 'contain';
    if (fogKey && fogStates[fogKey]) {
      renderFogOverlay(fogStates[fogKey], existingImg);
    }
    return;
  }
  currentImageUrl = imageUrl;
  sceneEl.classList.add('fading');
  setTimeout(function () {
    if (paint !== scenePaint) return;
    sceneEl.innerHTML = '';
    var img = document.createElement('img');
    img.draggable = false;
    img.style.cssText = 'width:100%;height:100%;object-fit:' + (fit || 'contain') + ';display:block;';
    sceneEl.appendChild(img);
    sceneEl.classList.remove('fading');
    currentFogKey = fogKey || null;

    function afterLoad() {
      if (paint !== scenePaint || !img.isConnected) return;
      if (fogKey && fogStates[fogKey]) {
        renderFogOverlay(fogStates[fogKey], img);
      }
      if (gridEnabled) {
        renderGridOverlay(img);
      }
      if (currentTokens.length) {
        renderTokenOverlay(currentTokens);
      }
      if (currentDrawing.length) {
        renderDrawOverlay(currentDrawing, img);
      }
      if (currentFeatures.length) {
        redrawFeatureLayer(img);
      }
      renderObjectLayer(currentObjects, currentObjectStates, img);
    }

    if (img.complete && img.naturalWidth) {
      afterLoad();
    } else {
      img.onload = afterLoad;
    }
    img.src = presentationAsset(imageUrl);
  }, 150);
}

function clearScene() {
  var paint = ++scenePaint;
  currentImageUrl = null;
  sceneEl.classList.add('fading');
  setTimeout(function () {
    if (paint !== scenePaint) return;
    sceneEl.innerHTML = '';
    sceneEl.classList.remove('fading');
  }, 150);
}

// ── Object Layer ──────────────────────────────────────────────
function renderObjectLayer(objects, objStates, imgEl) {
  var layer = document.getElementById('object-layer');
  if (!layer) return;
  layer.innerHTML = '';
  if (!objects || !objects.length) return;
  var el = imgEl || sceneEl.querySelector('img');
  var cW = layer.offsetWidth || sceneEl.offsetWidth;
  var cH = layer.offsetHeight || sceneEl.offsetHeight;
  if (!cW || !cH) return;
  var offX = 0, offY = 0, rendW = cW, rendH = cH;
  if (el && el.naturalWidth && el.naturalHeight) {
    var scale = Math.min(cW / el.naturalWidth, cH / el.naturalHeight);
    rendW = el.naturalWidth  * scale;
    rendH = el.naturalHeight * scale;
    offX  = (cW - rendW) / 2;
    offY  = (cH - rendH) / 2;
  }
  var cols = (currentMapMeta && currentMapMeta.cols) || 20;
  var rows = (currentMapMeta && currentMapMeta.rows) || 20;
  var cellW = rendW / cols;
  var cellH = rendH / rows;
  var SPEED = { slow: '4s', normal: '2.5s', fast: '1.2s' };
  var fogGrid = (currentFogKey && fogStates[currentFogKey]) ? fogStates[currentFogKey] : null;
  var fogRows = fogGrid ? fogGrid.length : 0;
  var fogCols = fogGrid && fogGrid[0] ? fogGrid[0].length : 0;
  objects.forEach(function (obj) {
    var st = (objStates && objStates[obj.id]) || { activated: false, currentCol: obj.col, currentRow: obj.row, currentRotation: 0 };
    // Hide objects that fall in a fogged (unrevealed) cell
    if (fogGrid && fogRows && fogCols) {
      var fx = (st.currentCol + 0.5) / cols;
      var fy = (st.currentRow + 0.5) / rows;
      var gridC = Math.min(fogCols - 1, Math.max(0, Math.floor(fx * fogCols)));
      var gridR = Math.min(fogRows - 1, Math.max(0, Math.floor(fy * fogRows)));
      if (!fogGrid[gridR][gridC]) return;
    }
    var size = (parseFloat(obj.size) || 1.0);
    var w = cellW * size;
    var h = cellH * size;
    var cx = offX + (st.currentCol + 0.5) * cellW;
    var cy = offY + (st.currentRow + 0.5) * cellH;
    var div = document.createElement('div');
    div.className = 'obj-cell' + (obj.interactive ? ' interactive' : '') + (st.activated ? ' obj-activated' : '');
    div.style.cssText = 'position:absolute;display:flex;align-items:center;justify-content:center;box-sizing:border-box;' +
      'width:' + w + 'px;height:' + h + 'px;' +
      'left:' + (cx - w / 2) + 'px;top:' + (cy - h / 2) + 'px;' +
      'border-radius:4px;border:2px solid ' + (obj.color || '#fbbf24') + ';' +
      'background:rgba(0,0,0,0.15);' +
      'transition:left 0.5s ease,top 0.5s ease,transform 0.5s ease;' +
      'transform:rotate(' + (st.currentRotation || 0) + 'deg);';
    var iconEl = document.createElement('div');
    iconEl.className = 'obj-icon' + (obj.autoAnim && obj.autoAnim !== 'none' ? ' anim-' + obj.autoAnim : '');
    if (obj.autoAnim && obj.autoAnim !== 'none') {
      iconEl.style.setProperty('--obj-dur', SPEED[obj.animSpeed] || '2.5s');
    }
    if (obj.iconType === 'tile' && obj.tileId) {
      iconEl.style.cssText = 'width:90%;height:90%;background-size:cover;background-position:center;' +
        'background-image:url(/assets/Tiles/' + encodeURIComponent(obj.tileId) + ');';
    } else {
      iconEl.style.cssText = 'font-size:' + Math.min(w, h) * 0.62 + 'px;line-height:1;';
      iconEl.textContent = obj.emoji || '\uD83D\uDD27';
    }
    div.appendChild(iconEl);
    if (obj.interactive && !isTableScreen) {
      var iBy = obj.interactBy || 'both';
      var canInteract = (iBy === 'both') || (iBy === 'players' && myPlayerName) || (iBy === 'dm');
      if (canInteract) {
        div.style.pointerEvents = 'auto';
        div.style.cursor = 'pointer';
        (function (objId) {
          div.addEventListener('click', function () {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ action: 'interact-object', objId: objId }));
            }
          });
        }(obj.id));
      }
    }
    layer.appendChild(div);
  });
}

// ── Grid overlay ─────────────────────────────────────────────
function renderGridOverlay(imgEl) {
  var existing = sceneEl.querySelector('.grid-overlay');
  if (existing) existing.remove();
  if (!gridEnabled) return;
  var cols = (currentMapMeta && currentMapMeta.cols) || 20;
  var rows = (currentMapMeta && currentMapMeta.rows) || 20;
  var el = imgEl || sceneEl.querySelector('img');
  if (!el) return;
  var cW = sceneEl.offsetWidth, cH = sceneEl.offsetHeight;
  var offX = 0, offY = 0, rendW = cW, rendH = cH;
  if (el.naturalWidth && el.naturalHeight) {
    var fitMode = el.style.objectFit || 'contain';
    var scale = fitMode === 'cover'
      ? Math.max(cW / el.naturalWidth, cH / el.naturalHeight)
      : Math.min(cW / el.naturalWidth, cH / el.naturalHeight);
    rendW = el.naturalWidth  * scale;
    rendH = el.naturalHeight * scale;
    offX  = (cW - rendW) / 2;
    offY  = (cH - rendH) / 2;
  }
  var svgNS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'grid-overlay');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:15;';
  var cellW = rendW / cols;
  var cellH = rendH / rows;
  for (var ci = 0; ci <= cols; ci++) {
    var vl = document.createElementNS(svgNS, 'line');
    var vx = offX + ci * cellW;
    vl.setAttribute('x1', vx); vl.setAttribute('y1', offY);
    vl.setAttribute('x2', vx); vl.setAttribute('y2', offY + rendH);
    vl.setAttribute('stroke', 'white'); vl.setAttribute('stroke-opacity', '0.25');
    vl.setAttribute('stroke-width', '1');
    svg.appendChild(vl);
  }
  for (var ri = 0; ri <= rows; ri++) {
    var hl = document.createElementNS(svgNS, 'line');
    var hy = offY + ri * cellH;
    hl.setAttribute('x1', offX); hl.setAttribute('y1', hy);
    hl.setAttribute('x2', offX + rendW); hl.setAttribute('y2', hy);
    hl.setAttribute('stroke', 'white'); hl.setAttribute('stroke-opacity', '0.25');
    hl.setAttribute('stroke-width', '1');
    svg.appendChild(hl);
  }
  sceneEl.appendChild(svg);
}

// ── Fog overlay ──────────────────────────────────────────────
// imgEl is optional – when provided the overlay is sized/positioned to match
// the actual rendered image area (handles object-fit:contain letterboxing).
function renderFogOverlay(fogGrid, imgEl) {
  var existing = sceneEl.querySelector('.fog-overlay');
  if (existing) existing.remove();
  if (!fogGrid || !fogGrid.length) return;
  var rows = fogGrid.length;
  var cols = fogGrid[0].length;
  var overlay = document.createElement('div');
  overlay.className = 'fog-overlay';

  // Calculate the exact pixel rect of the rendered image inside sceneEl
  var posStyle;
  var el = imgEl || sceneEl.querySelector('img');
  if (el && el.naturalWidth && el.naturalHeight) {
    var cW = sceneEl.offsetWidth;
    var cH = sceneEl.offsetHeight;
    var fitMode = el.style.objectFit || 'contain';
    var scale = fitMode === 'cover'
      ? Math.max(cW / el.naturalWidth, cH / el.naturalHeight)
      : Math.min(cW / el.naturalWidth, cH / el.naturalHeight);
    var rendW = el.naturalWidth  * scale;
    var rendH = el.naturalHeight * scale;
    var offX  = (cW - rendW) / 2;
    var offY  = (cH - rendH) / 2;
    posStyle = 'position:absolute;' +
      'left:' + offX + 'px;top:' + offY + 'px;' +
      'width:' + rendW + 'px;height:' + rendH + 'px;';
  } else {
    posStyle = 'position:absolute;inset:0;';
  }

  overlay.style.cssText = posStyle + 'display:grid;' +
    'grid-template-columns:repeat(' + cols + ',1fr);' +
    'grid-template-rows:repeat(' + rows + ',1fr);pointer-events:none;overflow:hidden;z-index:20;';

  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var cell = document.createElement('div');
      cell.style.background = fogGrid[r][c] ? 'transparent' : 'black';
      cell.style.transition = 'background 0.3s ease';
      overlay.appendChild(cell);
    }
  }
  sceneEl.appendChild(overlay);
}

// ── Token overlay ─────────────────────────────────────────────
var TOKEN_COLORS = { red: '#dc2626', blue: '#2563eb', yellow: '#ca8a04', green: '#16a34a' };
var ITEM_ICONS = {
  'Trap': '⚠', 'Scenery': '⌂', 'Chest': '🎁', 'Gold': '🪙', 'Potion': '🧪', 'Scroll': '📜',
  'Weapon': '⚔️', 'Shield': '🛡️', 'Armor': '🥋', 'Key': '🗝️',
  'Gem': '💎', 'Staff': '🪄', 'Bow': '🏹', 'Ring': '💍',
  'Book': '📖', 'Lantern': '🪔', 'Barrel': '🛢️', 'Loot': '💰',
  'Trap': '⚙️', 'Door': '🚪', 'Amulet': '📿', 'Food': '🍖',
};
var CLASS_ICONS  = {
  Rogue: '🗡️', Priest: '✝️', Cleric: '✝️', Sorcerer: '🔮',
  Wizard: '🪄', Fighter: '🛡️', Paladin: '⚔️', Druid: '🌿',
  Ranger: '🏹', Bard: '🎵', Monk: '👊', Barbarian: '💢', FatChub: '🐷'
};
var CLASS_COLORS = {
  Rogue: '#7c3aed', Priest: '#0ea5e9', Cleric: '#0ea5e9', Sorcerer: '#6366f1',
  Wizard: '#4f46e5', Fighter: '#ea580c', Paladin: '#d4af37', Druid: '#16a34a',
  Ranger: '#22c55e', Bard: '#ec4899', Monk: '#f97316', Barbarian: '#dc2626', FatChub: '#ef4444'
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

// Buff = green ring, Debuff = red ring, stacked per condition
function makeConditionShadow(tok, ringGap) {
  var gap   = ringGap || 5;
  var conds = tok.conditions || [];
  if (!conds.length || !showCondRings) return '0 2px 10px rgba(0,0,0,0.9)';
  var shadows = [];
  conds.forEach(function (c, i) {
    var r = (i + 1) * gap;
    shadows.push('0 0 0 ' + r + 'px ' + (c.type === 'buff' ? '#22c55e' : '#ef4444'));
  });
  shadows.push('0 3px 12px rgba(0,0,0,0.9)');
  return shadows.join(',');
}

function renderTokenOverlay(tokens) {
  var existing = sceneEl.querySelector('.token-overlay');
  if (existing) existing.remove();
  if (!tokens || !tokens.length) return;

  var overlay = document.createElement('div');
  overlay.className = 'token-overlay';
  overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:25;';

  // Calc rendered image rect (same letterbox logic as fog)
  var imgEl = sceneEl.querySelector('img');
  var offX = 0, offY = 0, rendW, rendH;
  if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
    var cW = sceneEl.offsetWidth;
    var cH = sceneEl.offsetHeight;
    var fitMode = imgEl.style.objectFit || 'contain';
    var scale = fitMode === 'cover'
      ? Math.max(cW / imgEl.naturalWidth, cH / imgEl.naturalHeight)
      : Math.min(cW / imgEl.naturalWidth, cH / imgEl.naturalHeight);
    rendW = imgEl.naturalWidth  * scale;
    rendH = imgEl.naturalHeight * scale;
    offX  = (cW - rendW) / 2;
    offY  = (cH - rendH) / 2;
  } else {
    rendW = sceneEl.offsetWidth;
    rendH = sceneEl.offsetHeight;
  }

  var tokenSize = Math.round(Math.min(rendW, rendH) * 0.05);
  tokenSize = Math.max(20, Math.min(tokenSize, 60));
  var fontSize  = Math.max(9,  Math.round(tokenSize * 0.42));
  var iconSize  = Math.max(11, Math.round(tokenSize * 0.48));

  // Fog grid for hiding enemy tokens in unrevealed cells
  var fogGrid = (currentFogKey && fogStates[currentFogKey]) ? fogStates[currentFogKey] : null;
  var fogRows = fogGrid ? fogGrid.length : 0;
  var fogCols = fogGrid && fogGrid[0] ? fogGrid[0].length : 0;

  tokens.forEach(function (tok) {
    var left  = offX + tok.x * rendW;
    var top   = offY + tok.y * rendH;
    var isPlayer = tok.type === 'player' && tok.cls;
    var isMob    = tok.mobType && (MOB_ICONS[tok.mobType] || CLASS_ICONS[tok.mobType]);
    var isItem   = tok.type === 'item';

    // Hidden tokens are DM-only — never shown on player screens
    if (tok.hidden) return;

    // Hide tokens that fall in a fogged (unrevealed) cell
    if (fogGrid && fogRows && fogCols) {
      var gridC = Math.min(fogCols - 1, Math.max(0, Math.floor(tok.x * fogCols)));
      var gridR = Math.min(fogRows - 1, Math.max(0, Math.floor(tok.y * fogRows)));
      if (!fogGrid[gridR][gridC]) return; // cell is fogged — skip this token
    }

    var color, border;
    if (isItem) {
      color  = '#78350f';
      border = '2px solid #fbbf24';
    } else if (isPlayer) {
      color  = CLASS_COLORS[tok.cls] || '#3b82f6';
      border = '3px solid #d4af37';
    } else if (isMob) {
      color  = MOB_COLORS[tok.mobType] || CLASS_COLORS[tok.mobType] || TOKEN_COLORS[tok.color] || '#888';
      border = '2px solid rgba(255,255,255,0.7)';
    } else {
      color  = TOKEN_COLORS[tok.color] || tok.color || '#888';
      border = '3px solid rgba(255,255,255,0.85)';
    }

    var borderRadius = isItem ? '4px' : '50%';
    var dot = document.createElement('div');
    dot.className = 'token-dot';
    dot.dataset.tokenLabel = tok.label || '';
    dot.style.cssText = [
      'position:absolute',
      'width:'   + tokenSize + 'px',
      'height:'  + tokenSize + 'px',
      'border-radius:' + borderRadius,
      'background:' + color,
      'border:' + border,
      'box-shadow:' + makeConditionShadow(tok, Math.max(4, Math.round(tokenSize * 0.1))),
      'left:'    + left + 'px',
      'top:'     + top  + 'px',
      'transform:translate(-50%,-50%)',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'overflow:hidden'
    ].join(';') + ';';

    if (isItem) {
      var itemIcon = ITEM_ICONS[tok.itemType] || '🎁';
      var iconEl = document.createElement('span');
      iconEl.textContent = itemIcon;
      iconEl.style.cssText = 'font-size:' + iconSize + 'px;line-height:1;display:block;';
      dot.appendChild(iconEl);
    } else if (isPlayer) {
      var icon = CLASS_ICONS[tok.cls] || '⚔️';
      var iconEl = document.createElement('span');
      iconEl.textContent = icon;
      iconEl.style.cssText = 'font-size:' + iconSize + 'px;line-height:1;display:block;';
      dot.appendChild(iconEl);
      if (tok.label) {
        var lbl = document.createElement('span');
        lbl.textContent = tok.label;
        lbl.style.cssText = 'color:#fff;font-weight:bold;font-size:' +
          Math.max(7, Math.round(fontSize * 0.7)) + 'px;font-family:sans-serif;' +
          'user-select:none;line-height:1;text-shadow:0 1px 3px rgba(0,0,0,0.9);' +
          'white-space:nowrap;overflow:hidden;max-width:' + (tokenSize - 4) + 'px;';
        dot.appendChild(lbl);
      }
    } else if (isMob) {
      var icon = MOB_ICONS[tok.mobType] || CLASS_ICONS[tok.mobType];
      var iconEl = document.createElement('span');
      iconEl.textContent = icon;
      iconEl.style.cssText = 'font-size:' + iconSize + 'px;line-height:1;display:block;';
      dot.appendChild(iconEl);
      // Show number suffix
      var num = tok.label ? tok.label.replace(tok.mobType, '').trim() : '';
      if (num) {
        var numEl = document.createElement('span');
        numEl.textContent = num;
        numEl.style.cssText = 'color:#fff;font-weight:bold;font-size:' +
          Math.max(7, Math.round(fontSize * 0.65)) + 'px;font-family:sans-serif;' +
          'user-select:none;line-height:1;text-shadow:0 1px 3px rgba(0,0,0,0.9);';
        dot.appendChild(numEl);
      }
    } else if (tok.label) {
      var lbl = document.createElement('span');
      lbl.textContent = tok.label;
      lbl.style.cssText = 'color:rgba(255,255,255,0.97);font-weight:bold;font-size:' +
        fontSize + 'px;font-family:sans-serif;user-select:none;line-height:1;text-shadow:0 1px 3px rgba(0,0,0,0.8);';
      dot.appendChild(lbl);
    }

    if (isItem && !isTableScreen) {
      dot.style.pointerEvents = 'auto'; dot.style.cursor = 'pointer';
      (function(itemId){ dot.addEventListener('click', function(e){ e.stopPropagation(); window.openLoot({tokenId:itemId,mapKey:currentMapKey || ''}); }); })(tok.id);
    }

    // ── Targeting: visual indicators ──────────────────────────
    // Targeting highlight logic:
    // - Logged-in player: only pulse their own target
    // - Spectator (no login): pulse all targeted mobs
    if (!isItem && tok.type !== 'player') {
      var isMyTarget = (myTarget === tok.label);
      var targetedByAny = false;
      for (var tpn in allTargets) {
        if (allTargets[tpn] === tok.label) { targetedByAny = true; break; }
      }
      var shouldPulse = myPlayerName ? isMyTarget : targetedByAny;
      if (shouldPulse) {
        dot.classList.add('is-target');
        if (isMyTarget) {
          var xhair = document.createElement('span');
          xhair.className = 'target-crosshair';
          xhair.textContent = '🎯';
          dot.appendChild(xhair);
        }
      }
    }

    // ── Death overlay: red X over dead tokens ──────────────────
    if (tok.dead) {
      dot.style.opacity = '0.5';
      dot.style.border = '2px solid #ef4444';
      var deadX = document.createElement('div');
      deadX.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
        'pointer-events:none;z-index:6;font-size:' + Math.round(tokenSize * 0.6) + 'px;font-weight:bold;' +
        'color:#ef4444;text-shadow:0 1px 3px rgba(0,0,0,0.9);line-height:1;';
      deadX.textContent = '✕';
      dot.appendChild(deadX);
    }

    // ── Targeting: make non-player, non-item tokens clickable for logged-in players ──
    if (myPlayerName && tok.type !== 'player' && !isItem) {
      dot.style.pointerEvents = 'auto';
      dot.style.cursor = 'crosshair';
      (function (label) {
        function doTarget(e) {
          e.stopPropagation();
          var newTarget = (myTarget === label) ? null : label;
          myTarget = newTarget;
          wsSend({ action: 'set-target', target: newTarget || '' });
          renderTokenOverlay(currentTokens);
        }
        dot.addEventListener('click', doTarget);
        dot.addEventListener('touchend', function(e) { e.preventDefault(); doTarget(e); }, { passive: false });
      }(tok.label));
    }

    // Make own player token draggable (if movement is not locked)
    if (myPlayerName && tok.type === 'player' && tok.label === myPlayerName && !myMovementLocked) {
      dot.style.pointerEvents = 'auto';
      dot.style.cursor = 'grab';
      dot.style.touchAction = 'none';
      (function (tokenDot, capturedOffX, capturedOffY, capturedRendW, capturedRendH) {
        function getTokenPos(clientX, clientY) {
          var s = sceneEl.getBoundingClientRect();
          // Recompute letterbox in case screen resized
          var iEl = sceneEl.querySelector('img');
          var oX = capturedOffX, oY = capturedOffY, rW = capturedRendW, rH = capturedRendH;
          if (iEl && iEl.naturalWidth && iEl.naturalHeight) {
            var cWn = sceneEl.offsetWidth, cHn = sceneEl.offsetHeight;
            var fit = iEl.style.objectFit || 'contain';
            var sc = fit === 'cover'
              ? Math.max(cWn / iEl.naturalWidth, cHn / iEl.naturalHeight)
              : Math.min(cWn / iEl.naturalWidth, cHn / iEl.naturalHeight);
            rW = iEl.naturalWidth * sc; rH = iEl.naturalHeight * sc;
            oX = (cWn - rW) / 2;       oY = (cHn - rH) / 2;
          }
          return {
            x: Math.max(0, Math.min(1, (clientX - s.left - oX) / rW)),
            y: Math.max(0, Math.min(1, (clientY - s.top  - oY) / rH)),
            oX: oX, oY: oY, rW: rW, rH: rH
          };
        }

        function sendMove(x, y) {
          // Snap to grid cell centre if grid is enabled
          if (gridEnabled && currentMapMeta) {
            var gc = Math.max(0, Math.min(currentMapMeta.cols - 1, Math.floor(x * currentMapMeta.cols)));
            var gr = Math.max(0, Math.min(currentMapMeta.rows - 1, Math.floor(y * currentMapMeta.rows)));
            x = (gc + 0.5) / currentMapMeta.cols;
            y = (gr + 0.5) / currentMapMeta.rows;
          }
          wsSend({ action: 'move-player-token', name: myPlayerName, x: x, y: y });
        }

        tokenDot.addEventListener('mousedown', function (e) {
          e.stopPropagation();
          tokenDot.style.cursor = 'grabbing';
          function onMove(e) {
            var p = getTokenPos(e.clientX, e.clientY);
            tokenDot.style.left = (p.oX + p.x * p.rW) + 'px';
            tokenDot.style.top  = (p.oY + p.y * p.rH) + 'px';
          }
          function onUp(e) {
            tokenDot.style.cursor = 'grab';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            var p = getTokenPos(e.clientX, e.clientY);
            sendMove(p.x, p.y);
          }
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });

        tokenDot.addEventListener('touchstart', function (e) {
          e.stopPropagation();
          e.preventDefault();
          // Unlock audio if not yet done (no click event fires with preventDefault)
          if (!audioUnlocked) {
            audioUnlocked = true;
            if (pendingAudio) { var pa = pendingAudio; pendingAudio = null; playAudio(pa.url, pa.loop); }
          }
          if (!e.touches.length) return;
          function onMove(e) {
            if (!e.touches.length) return;
            var p = getTokenPos(e.touches[0].clientX, e.touches[0].clientY);
            tokenDot.style.left = (p.oX + p.x * p.rW) + 'px';
            tokenDot.style.top  = (p.oY + p.y * p.rH) + 'px';
          }
          function onEnd(e) {
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            if (!e.changedTouches.length) return;
            var p = getTokenPos(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            sendMove(p.x, p.y);
          }
          document.addEventListener('touchmove', onMove, { passive: false });
          document.addEventListener('touchend', onEnd);
        }, { passive: false });
      }(dot, offX, offY, rendW, rendH));
    }

    overlay.appendChild(dot);
  });

  sceneEl.appendChild(overlay);
}

// ── Draw overlay ──────────────────────────────────────────
function renderDrawOverlay(strokes, imgEl) {
  var existing = sceneEl.querySelector('.draw-overlay');
  if (existing) existing.remove();
  if (!strokes || !strokes.length) return;

  var cW = sceneEl.offsetWidth;
  var cH = sceneEl.offsetHeight;
  var drawCanvas = document.createElement('canvas');
  drawCanvas.className = 'draw-overlay';
  drawCanvas.width  = cW;
  drawCanvas.height = cH;
  drawCanvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:30;';

  // Letterbox rect (same math as fog/token)
  var offX = 0, offY = 0, rendW = cW, rendH = cH;
  var el = imgEl || sceneEl.querySelector('img');
  if (el && el.naturalWidth && el.naturalHeight) {
    var fitMode = el.style.objectFit || 'contain';
    var scale = fitMode === 'cover'
      ? Math.max(cW / el.naturalWidth, cH / el.naturalHeight)
      : Math.min(cW / el.naturalWidth, cH / el.naturalHeight);
    rendW = el.naturalWidth  * scale;
    rendH = el.naturalHeight * scale;
    offX  = (cW - rendW) / 2;
    offY  = (cH - rendH) / 2;
  }

  var ctx = drawCanvas.getContext('2d');
  strokes.forEach(function (stroke) {
    if (!stroke.points || stroke.points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = stroke.erase ? 'rgba(0,0,0,1)' : (stroke.color || '#ef4444');
    ctx.lineWidth   = Math.max(2, (stroke.width || 0.006) * Math.min(rendW, rendH));
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
    ctx.beginPath();
    var p0 = stroke.points[0];
    ctx.moveTo(offX + p0.x * rendW, offY + p0.y * rendH);
    for (var i = 1; i < stroke.points.length; i++) {
      var p = stroke.points[i];
      ctx.lineTo(offX + p.x * rendW, offY + p.y * rendH);
    }
    ctx.stroke();
    ctx.restore();
  });

  sceneEl.appendChild(drawCanvas);
}

// ── Feature overlay ───────────────────────────────────────────
function getLetterboxRect(imgEl) {
  var cW = sceneEl.offsetWidth;
  var cH = sceneEl.offsetHeight;
  var offX = 0, offY = 0, rendW = cW, rendH = cH;
  if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
    var fitMode = imgEl.style.objectFit || 'contain';
    var scale = fitMode === 'cover'
      ? Math.max(cW / imgEl.naturalWidth, cH / imgEl.naturalHeight)
      : Math.min(cW / imgEl.naturalWidth, cH / imgEl.naturalHeight);
    rendW = imgEl.naturalWidth  * scale;
    rendH = imgEl.naturalHeight * scale;
    offX  = (cW - rendW) / 2;
    offY  = (cH - rendH) / 2;
  }
  return { offX: offX, offY: offY, rendW: rendW, rendH: rendH };
}

function renderFeatureOverlay(feats, imgEl) {
  var existing = sceneEl.querySelector('.feature-overlay');
  if (existing) existing.remove();
  if (!feats || !feats.length || !currentMapMeta) return;

  var cols = currentMapMeta.cols;
  var rows = currentMapMeta.rows;
  if (!cols || !rows) return;

  var el = imgEl || sceneEl.querySelector('img');
  var rect = getLetterboxRect(el);
  var cellW = rect.rendW / cols;
  var cellH = rect.rendH / rows;

  var div = document.createElement('div');
  div.className = 'feature-overlay';
  div.style.cssText = 'position:absolute;' +
    'left:' + rect.offX + 'px;top:' + rect.offY + 'px;' +
    'width:' + rect.rendW + 'px;height:' + rect.rendH + 'px;' +
    'pointer-events:none;overflow:hidden;z-index:35;';

  feats.forEach(function (feat) {
    (feat.cells || []).forEach(function (cell) {
      var r = cell[0], c = cell[1];
      var cd = document.createElement('div');
      cd.className = 'feature-cell';
      cd.dataset.featId = feat.id;
      cd.style.cssText = 'position:absolute;' +
        'left:' + (c * cellW) + 'px;top:' + (r * cellH) + 'px;' +
        'width:' + Math.ceil(cellW) + 'px;height:' + Math.ceil(cellH) + 'px;' +
        'background:' + (feat.color || '#1a0a00') + ';' +
        'opacity:0;transition:opacity 0.4s ease;';
      div.appendChild(cd);
    });
  });
  sceneEl.appendChild(div);
}

function redrawFeatureLayer(imgEl, animateFeature) {
  renderFeatureOverlay(currentFeatures, imgEl);
  currentFeatures.forEach(function (feat) {
    if (triggeredFeatures[feat.id]) showTriggeredFeature(feat, feat.id === animateFeature);
  });
}

function showTriggeredFeature(feat, animate) {
  var cells = sceneEl.querySelectorAll('.feature-cell[data-feat-id="' + feat.id + '"]');
  if (!cells.length) return;

  if (animate === false) {
    if (feat.type === 'reveal' || (feat.type === 'effect' && feat.effectSubtype === 'explosion')) return;
    cells.forEach(function (c) { c.style.opacity = '1'; });
    if (feat.type === 'puzzle' && feat.linkedMap && !isTableScreen) {
      cells.forEach(function (c) {
        c.style.pointerEvents = 'auto';
        c.onclick = function () { openPuzzleLightbox(feat); };
      });
    }
    return;
  }

  var type    = feat.type || '';
  var subtype = feat.effectSubtype || 'fire';

  if (type === 'pit') {
    // Scene shake then dark cells spread in with stagger
    sceneEl.classList.add('feat-shake');
    sceneEl.addEventListener('animationend', function h() {
      sceneEl.classList.remove('feat-shake');
      sceneEl.removeEventListener('animationend', h);
    });
    cells.forEach(function (c, i) {
      c.style.background = feat.color || '#1a0a00';
      setTimeout(function () {
        c.classList.add('feat-pit-anim');
        c.addEventListener('animationend', function () { c.style.opacity = '1'; }, { once: true });
      }, i * 45);
    });

  } else if (type === 'trap') {
    sceneEl.classList.add('feat-shake');
    sceneEl.addEventListener('animationend', function h() {
      sceneEl.classList.remove('feat-shake');
      sceneEl.removeEventListener('animationend', h);
    });
    cells.forEach(function (c) {
      c.style.background = feat.color || '#7f1d1d';
      c.classList.add('feat-trap-anim');
      c.addEventListener('animationend', function () { c.style.opacity = '1'; }, { once: true });
    });

  } else if (type === 'puzzle') {
    cells.forEach(function (c) {
      c.style.background = feat.color || '#1e3a5f';
      c.style.opacity = '1';
      c.classList.add('feat-puzzle-anim');
      if (feat.linkedMap && !isTableScreen) {
        c.style.pointerEvents = 'auto';
        c.onclick = function () { openPuzzleLightbox(feat); };
      }
    });

  } else if (type === 'reveal') {
    // Show an overlay tile then sweep it away, revealing what's underneath
    cells.forEach(function (c) {
      c.style.background = feat.color || '#14532d';
      c.style.opacity = '1';
      c.classList.add('feat-reveal-anim');
      c.addEventListener('animationend', function () {
        c.style.opacity = '0';
        c.classList.remove('feat-reveal-anim');
      }, { once: true });
    });

  } else if (type === 'effect') {
    var ANIM_MAP = {
      fire:      'feat-fire-anim',
      sparks:    'feat-sparks-anim',
      explosion: 'feat-explosion-anim',
      aura:      'feat-aura-anim',
    };
    var BG_MAP = {
      fire:      feat.color || '#ef4444',
      sparks:    feat.color || '#facc15',
      explosion: feat.color || '#f97316',
      aura:      feat.color || '#7c3aed',
    };
    var cls = ANIM_MAP[subtype] || 'feat-fire-anim';
    var bg  = BG_MAP[subtype]  || (feat.color || '#ef4444');
    cells.forEach(function (c) {
      c.style.background = bg;
      c.style.opacity = '1';
      c.classList.add(cls);
      if (subtype === 'explosion') {
        c.addEventListener('animationend', function () {
          c.classList.remove(cls);
          c.style.opacity = '0';
        }, { once: true });
      }
    });

  } else {
    // Legacy fallback — honour original animation field
    var anim = feat.animation || 'fade-in';
    if (anim === 'shake-reveal') {
      sceneEl.classList.add('feat-shake');
      sceneEl.addEventListener('animationend', function h() {
        sceneEl.classList.remove('feat-shake');
        sceneEl.removeEventListener('animationend', h);
      });
      setTimeout(function () {
        cells.forEach(function (c) {
          c.style.transition = 'opacity 0.5s ease';
          c.style.opacity = '1';
        });
      }, 300);
    } else if (anim === 'flash-red') {
      cells.forEach(function (c) {
        c.style.background = '#ef4444';
        c.style.opacity = '1';
        c.classList.add('feat-flash-anim');
        c.addEventListener('animationend', function () {
          c.classList.remove('feat-flash-anim');
          c.style.background = feat.color || '#7f1d1d';
        }, { once: true });
      });
    } else if (anim === 'pulse-gold') {
      cells.forEach(function (c) {
        c.style.background = feat.color || '#d4af37';
        c.style.opacity = '0.85';
        c.classList.add('feat-pulse-anim');
      });
    } else if (anim === 'flash-white') {
      cells.forEach(function (c) {
        c.style.background = '#ffffff';
        c.style.opacity = '1';
        c.classList.add('feat-flash-anim');
        c.addEventListener('animationend', function () {
          c.classList.remove('feat-flash-anim');
          c.style.background = feat.color || '#cccccc';
        }, { once: true });
      });
    } else {
      cells.forEach(function (c) {
        c.style.transition = 'opacity 0.6s ease';
        c.style.opacity = '1';
      });
    }
  }
}

function hideFeatureCells(featureId) {
  var cells = sceneEl.querySelectorAll('.feature-cell[data-feat-id="' + featureId + '"]');
  cells.forEach(function (c) {
    c.classList.remove(
      'feat-flash-anim', 'feat-pulse-anim',
      'feat-pit-anim', 'feat-trap-anim', 'feat-puzzle-anim',
      'feat-reveal-anim', 'feat-fire-anim', 'feat-sparks-anim',
      'feat-explosion-anim', 'feat-aura-anim'
    );
    c.style.transition = 'opacity 0.4s ease';
    c.style.opacity = '0';
    c.onclick = null;
    c.style.cursor = '';
    c.style.pointerEvents = '';
  });
}

// ── Puzzle sub-map lightbox ───────────────────────────────────
function renderLightboxObjects(objects, mapCols, mapRows) {
  var layer = document.getElementById('puzzle-lightbox-obj-layer');
  var img   = document.getElementById('puzzle-lightbox-img');
  if (!layer || !img) return;
  layer.innerHTML = '';
  if (!objects || !objects.length) return;
  var cW = img.offsetWidth;
  var cH = img.offsetHeight;
  if (!cW || !cH) return;
  var cols = mapCols || 20;
  var rows = mapRows || 20;
  var cellW = cW / cols;
  var cellH = cH / rows;
  var SPEED = { slow: '4s', normal: '2.5s', fast: '1.2s' };
  objects.forEach(function (obj) {
    var st = _lbObjectStates[obj.id] || { activated: false, currentCol: obj.col, currentRow: obj.row, currentRotation: 0 };
    var size = parseFloat(obj.size) || 1.0;
    var w = cellW * size;
    var h = cellH * size;
    var cx = (st.currentCol + 0.5) * cellW;
    var cy = (st.currentRow + 0.5) * cellH;
    var div = document.createElement('div');
    div.style.cssText = 'position:absolute;display:flex;align-items:center;justify-content:center;box-sizing:border-box;' +
      'width:' + w + 'px;height:' + h + 'px;' +
      'left:' + (cx - w / 2) + 'px;top:' + (cy - h / 2) + 'px;' +
      'border-radius:4px;border:2px solid ' + (obj.color || '#fbbf24') + ';' +
      'background:rgba(0,0,0,0.15);' +
      'transform:rotate(' + (st.currentRotation || 0) + 'deg);';
    var iconEl = document.createElement('div');
    iconEl.className = 'obj-icon' + (obj.autoAnim && obj.autoAnim !== 'none' ? ' anim-' + obj.autoAnim : '');
    if (obj.autoAnim && obj.autoAnim !== 'none') {
      iconEl.style.setProperty('--obj-dur', SPEED[obj.animSpeed] || '2.5s');
    }
    if (obj.iconType === 'tile' && obj.tileId) {
      iconEl.style.cssText = 'width:90%;height:90%;background-size:cover;background-position:center;' +
        'background-image:url(/assets/Tiles/' + encodeURIComponent(obj.tileId) + ');';
    } else {
      iconEl.style.cssText = 'font-size:' + Math.min(w, h) * 0.62 + 'px;line-height:1;';
      iconEl.textContent = obj.emoji || '\uD83D\uDD27';
    }
    div.appendChild(iconEl);
    if (obj.interactive) {
      div.style.pointerEvents = 'auto';
      div.style.cursor = 'pointer';
      (function (def) {
        div.addEventListener('click', function () {
          var cur = _lbObjectStates[def.id] || { activated: false, currentCol: def.col, currentRow: def.row, currentRotation: 0 };
          var next = { activated: cur.activated, currentCol: cur.currentCol, currentRow: cur.currentRow, currentRotation: cur.currentRotation };
          if (def.clickAction === 'rotate') {
            var deg = Number(def.rotateDeg) || 90;
            if (!def.canReset && cur.activated) return;
            next.currentRotation = cur.activated ? 0 : (cur.currentRotation + deg) % 360;
            next.activated = def.canReset ? !cur.activated : true;
          } else {
            if (!def.canReset && cur.activated) return;
            if (cur.activated) {
              next.currentCol = def.col; next.currentRow = def.row;
            } else {
              next.currentCol = def.targetCol != null ? def.targetCol : def.col;
              next.currentRow = def.targetRow != null ? def.targetRow : def.row;
            }
            next.activated = def.canReset ? !cur.activated : true;
          }
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'interact-lightbox-object', objId: def.id, state: next }));
          }
        });
      }(obj));
    }
    layer.appendChild(div);
  });
}

function openPuzzleLightbox(feat) {
  var lb    = document.getElementById('puzzle-lightbox');
  var img   = document.getElementById('puzzle-lightbox-img');
  var title = document.getElementById('puzzle-lightbox-title');
  if (!lb) return;
  title.textContent = feat.name || '';
  lb.classList.add('open');
  var newSrc = feat.linkedMap || '';
  var jsonUrl = '/api/map-builder/puzzle?image=' + encodeURIComponent(newSrc);
  var imageSrc = new URL(presentationAsset(newSrc), location.href).href;
  // Reset lightbox state when opening a new sub-map
  if (img.src !== imageSrc) {
    _lbObjects = [];
    _lbObjectStates = {};
  }
  function loadAndRender() {
    fetch(jsonUrl)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (mapData) {
        _lbObjects      = (mapData && mapData.objects) || [];
        var cols        = (mapData && mapData.cols) || 20;
        var rows        = (mapData && mapData.rows) || 20;
        _lbCols = cols;
        _lbRows = rows;
        // Init state for any objects not yet tracked
        _lbObjects.forEach(function (o) {
          if (!_lbObjectStates[o.id]) {
            _lbObjectStates[o.id] = { activated: false, currentCol: o.col, currentRow: o.row, currentRotation: 0 };
          }
        });
        renderLightboxObjects(_lbObjects, cols, rows);
      })
      .catch(function () { /* .map.json not found — image-only lightbox */ });
  }
  if (img.src === imageSrc && img.naturalWidth) {
    loadAndRender();
  } else {
    img.onload = loadAndRender;
    img.src = imageSrc;
  }
}
(function () {
  var lb    = document.getElementById('puzzle-lightbox');
  var close = document.getElementById('puzzle-lightbox-close');
  if (lb)    lb.addEventListener('click', function (e) { if (e.target === lb) lb.classList.remove('open'); });
  if (close) close.addEventListener('click', function () { lb.classList.remove('open'); });
}());

// ── Dice roll animation (3D cube) ─────────────────────────────
var _diceHideTimer   = null;
var _diceNumInterval = null;

function showDiceRoll(die, result) {
  var overlay  = document.getElementById('dice-overlay');
  var cube     = document.getElementById('dice-3d');
  var wrapper  = document.getElementById('dice-wrapper');
  var allFaces = cube.querySelectorAll('.dice-face');
  var frontEl  = cube.querySelector('.dice-face.front');
  var labelEl  = document.getElementById('dice-result-label');

  // Cancel any in-progress roll
  if (_diceHideTimer)   { clearTimeout(_diceHideTimer);    _diceHideTimer   = null; }
  if (_diceNumInterval) { clearInterval(_diceNumInterval); _diceNumInterval = null; }
  cube.classList.remove('rolling');
  wrapper.classList.remove('settling');
  frontEl.classList.remove('settled');
  labelEl.className = '';
  cube.setAttribute('data-die', die);

  // Seed all faces with random numbers
  allFaces.forEach(function(f) { f.textContent = Math.floor(Math.random() * die) + 1; });

  // Force reflow so removed classes fully reset before re-adding
  void cube.offsetWidth;
  void wrapper.offsetWidth;

  overlay.className = 'visible';
  cube.classList.add('rolling');

  // Keep cycling numbers on all faces while tumbling
  _diceNumInterval = setInterval(function() {
    allFaces.forEach(function(f) { f.textContent = Math.floor(Math.random() * die) + 1; });
  }, 75);

  // When tumble CSS animation ends: land and reveal
  cube.addEventListener('animationend', function onTumbleEnd() {
    clearInterval(_diceNumInterval);
    _diceNumInterval = null;

    // Set result on the front face and glow it
    frontEl.textContent = result;
    frontEl.classList.add('settled');

    // Bounce the wrapper (separate element so it doesn't reset the rotation)
    void wrapper.offsetWidth;
    wrapper.classList.add('settling');

    // Label below the die
    if (die === 20 && result === 20) {
      labelEl.textContent = '\u2694\ufe0f  NATURAL 20!';
    } else if (die === 20 && result === 1) {
      labelEl.textContent = '\ud83d\udc80  CRITICAL FAIL';
    } else {
      labelEl.textContent = 'd' + die + '  \u00b7  ' + result;
    }
    labelEl.className = 'visible';

    // Auto-dismiss after 3.5 s
    _diceHideTimer = setTimeout(function() {
      overlay.className = 'hiding';
      labelEl.className = '';
      setTimeout(function() {
        overlay.className = '';
        cube.classList.remove('rolling');
        wrapper.classList.remove('settling');
        frontEl.classList.remove('settled');
      }, 500);
      _diceHideTimer = null;
    }, 3500);
  }, { once: true });
}

// ── Attack animation ──────────────────────────────────────────
function playAttackAnimation(targetLabels, animType) {
  var overlay = sceneEl.querySelector('.token-overlay');
  if (!overlay) return;
  targetLabels.forEach(function (label) {
    var dot = overlay.querySelector('[data-token-label="' + label + '"]');
    if (!dot) return;
    dot.style.overflow = 'visible'; // allow icon to scale outside dot bounds
    var icon = document.createElement('span');
    icon.className = 'attack-anim-icon ' + (animType || 'sword');
    icon.textContent = animType === 'spell' ? '✨' : '⚔️';
    dot.appendChild(icon);
    icon.addEventListener('animationend', function () {
      icon.remove();
      dot.style.overflow = 'hidden'; // restore
    }, { once: true });
  });
}

// ── Overlay popup (dice, initiative) ─────────────────────────
// ── Initiative bottom panel ─────────────────────────────────
var initPanelTimer = null;
function showInitBottomPanel(title, html, duration) {
  var panel = document.getElementById('init-bottom-panel');
  if (!panel) return;
  if (initPanelTimer) { clearTimeout(initPanelTimer); initPanelTimer = null; }
  panel.innerHTML =
    '<div class="init-panel-title">' + (title || 'Initiative') + '</div>' +
    '<div class="init-panel-body">' + html + '</div>';
  panel.classList.remove('hiding');
  panel.classList.add('visible');
  initPanelTimer = setTimeout(function () {
    panel.classList.remove('visible');
    panel.classList.add('hiding');
    setTimeout(function () { panel.classList.remove('hiding'); }, 400);
    initPanelTimer = null;
  }, duration || 12000);
}

function showOverlay(title, html, duration, subtype) {
  if (subtype === 'initiative') {
    showInitBottomPanel(title, html, duration);
    return;
  }
  if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
  var inner = '';
  if (title) inner += '<div style="font-family:Georgia,serif;font-size:1.5rem;font-weight:bold;color:#d4af37;text-align:center;margin-bottom:1rem;">' + title + '</div>';
  inner += '<div style="color:#f0e6c8;font-family:Georgia,serif;font-size:1.1rem;text-align:center;max-width:100%;">' + html + '</div>';
  popupEl.innerHTML = inner;
  popupEl.classList.add('visible');
  popupTimer = setTimeout(function () {
    popupEl.classList.remove('visible');
    popupTimer = null;
  }, duration || 10000);
}

// ── Audio ─────────────────────────────────────────────────────
function playAudio(url, loop) {
  if (!audioUnlocked) {
    pendingAudio = { url: url, loop: !!loop };
    return;
  }
  if (globalAudio) { globalAudio.pause(); globalAudio = null; }
  globalAudio = new Audio(presentationAsset(url));
  globalAudio.loop = !!loop;
  globalAudio.volume = 0.7;
  globalAudio.play().catch(function (err) {
    console.warn('Audio play blocked:', err);
    pendingAudio = { url: url, loop: !!loop };
  });
}

function stopAudio() {
  pendingAudio = null;
  if (globalAudio) { globalAudio.pause(); globalAudio.src = ''; globalAudio = null; }
}

// ── Text display ──────────────────────────────────────────────
function showText(title, html) {
  var paint = ++scenePaint;
  if (isTableScreen) document.documentElement.dataset.tableScene = '';
  sceneEl.classList.add('fading');
  setTimeout(function () {
    if (paint !== scenePaint) return;
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;padding:3rem 4rem;';
    if (title) {
      var h = document.createElement('div');
      h.className = 'text-title';
      h.textContent = title;
      wrapper.appendChild(h);
    }
    var body = document.createElement('div');
    body.className = 'text-content';
    body.style.padding = '0';
    body.innerHTML = html;
    wrapper.appendChild(body);
    sceneEl.innerHTML = '';
    sceneEl.appendChild(wrapper);
    sceneEl.classList.remove('fading');
  }, 150);
}

// ── Message handler ───────────────────────────────────────────
function handleMessage(msg) {
  if (msg.type === 'WORLD_UPDATE') {
    if (isTableScreen) window.dispatchEvent(new CustomEvent('world-update', { detail: msg }));
    return;
  }
  statusEl.textContent = msg.type;
  switch (msg.type) {
    case 'SHOW_SCENE_VIEW':
      document.getElementById('blackout-overlay').style.display = 'none';
      // Immediately clear fog if the fog key is changing or cleared
      if ((msg.fogKey || null) !== currentFogKey) {
        var oldFog = sceneEl.querySelector('.fog-overlay');
        if (oldFog) oldFog.remove();
        currentFogKey = msg.fogKey || null;
      }
      // Clear tokens when switching maps
      currentMapKey  = msg.mapKey || null;
      currentTokens  = [];
      currentDrawing = [];
      // Clear and reset feature state for the new map
      currentFeatures   = Array.isArray(msg.features) ? msg.features : [];
      currentMapMeta    = msg.mapMeta || null;
      triggeredFeatures = {};
      currentObjects      = [];
      currentObjectStates = {};
      var layer = document.getElementById('object-layer');
      if (layer) layer.innerHTML = '';
      var oldFeatOv = sceneEl.querySelector('.feature-overlay');
      if (oldFeatOv) oldFeatOv.remove();
      var oldTok = sceneEl.querySelector('.token-overlay');
      if (oldTok) oldTok.remove();
      var oldDraw = sceneEl.querySelector('.draw-overlay');
      if (oldDraw) oldDraw.remove();
      showImage(msg.image, msg.fogKey || null, msg.fit || 'contain');
      if (msg.audio) playAudio(msg.audio, msg.audioLoop !== false);
      break;
    case 'SET_RINGS':
      showCondRings = msg.showRings !== undefined ? msg.showRings : true;
      renderTokenOverlay(currentTokens);
      break;
    case 'UPDATE_TOKENS':
      if (msg.mapKey === currentMapKey || !currentMapKey) {
        currentTokens = msg.tokens || [];
        if (msg.showRings !== undefined) showCondRings = msg.showRings;
        var imgEl2 = sceneEl.querySelector('img');
        if (imgEl2 && imgEl2.naturalWidth) {
          renderTokenOverlay(currentTokens);
        } else if (imgEl2) {
          var prevOnload = imgEl2.onload;
          imgEl2.onload = function () {
            if (prevOnload) prevOnload.call(this);
            renderTokenOverlay(currentTokens);
          };
        }
      }
      break;
    case 'UPDATE_DRAWING':
      if (msg.mapKey === currentMapKey || !currentMapKey) {
        currentDrawing = msg.strokes || [];
        var imgElD = sceneEl.querySelector('img');
        if (imgElD && imgElD.naturalWidth) {
          renderDrawOverlay(currentDrawing, imgElD);
        } else if (imgElD) {
          var prevOnloadD = imgElD.onload;
          imgElD.onload = function () {
            if (prevOnloadD) prevOnloadD.call(this);
            renderDrawOverlay(currentDrawing, imgElD);
          };
        }
      }
      break;
    case 'UPDATE_FOG':
      if (msg.fogKey) {
        fogStates[msg.fogKey] = msg.fogGrid;
        if (msg.fogKey === currentFogKey) {
          renderFogOverlay(msg.fogGrid, sceneEl.querySelector('img'));
          renderTokenOverlay(currentTokens); // re-check which tokens are in fogged cells
          renderObjectLayer(currentObjects, currentObjectStates, sceneEl.querySelector('img'));
        }
      }
      break;
    case 'SET_FOG_KEY':
      currentFogKey = msg.fogKey || null;
      renderFogOverlay(currentFogKey ? (fogStates[currentFogKey] || null) : null, sceneEl.querySelector('img'));
      renderTokenOverlay(currentTokens);
      renderObjectLayer(currentObjects, currentObjectStates, sceneEl.querySelector('img'));
      break;
    case 'PLAY_AUDIO':
      if (msg.url) playAudio(msg.url, msg.loop === true);
      break;
    case 'STOP_AUDIO':
      stopAudio();
      break;
    case 'BLACKOUT':
      var wasBlack = document.getElementById('blackout-overlay').style.display === 'block';
      document.getElementById('blackout-overlay').style.display = msg.active ? 'block' : 'none';
      if (msg.active) stopAudio();
      if (isTableScreen && wasBlack && !msg.active) wsSend({action:'request-sync'});
      break;
    case 'CLEAR':
      document.getElementById('blackout-overlay').style.display = 'none';
      if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
      popupEl.classList.remove('visible');
      if (!isTableScreen) break;
      // The shared display returns to its waiting state when the scene is cleared.
    case 'CLEAR_SCENE':
      ++scenePaint;
      delete document.documentElement.dataset.tableScene;
      sceneEl.classList.remove('fading');
      sceneEl.innerHTML = '';
      document.getElementById('object-layer').innerHTML = '';
      currentMapKey = null;
      currentImageUrl = null;
      currentFogKey = null;
      currentTokens = [];
      currentDrawing = [];
      currentFeatures = [];
      currentObjects = [];
      currentObjectStates = {};
      triggeredFeatures = {};
      allTargets = {};
      myTarget = null;
      break;
    case 'OVERLAY':
      showOverlay(msg.title, msg.data, msg.duration, msg.subtype);
      break;
    case 'DICE_ROLL':
      showDiceRoll(msg.die, msg.result);
      break;
    case 'UPDATE_FEATURES':
      if (msg.mapKey === currentMapKey || !currentMapKey) {
        currentFeatures = Array.isArray(msg.features) ? msg.features : [];
        if (msg.mapMeta) currentMapMeta = msg.mapMeta;
        var imgElF = sceneEl.querySelector('img');
        if (imgElF && imgElF.naturalWidth) {
          redrawFeatureLayer(imgElF);
        }
      }
      break;
    case 'TRIGGER_FEATURE':
      if (msg.mapKey === currentMapKey || !currentMapKey) {
        var feat = msg.feature;
        if (feat) {
          triggeredFeatures[feat.id] = true;
          if (msg.mapMeta) currentMapMeta = msg.mapMeta;
          currentFeatures = currentFeatures.filter(function (item) { return item.id !== feat.id; });
          currentFeatures.push(feat);
          var featureImage = sceneEl.querySelector('img');
          if (featureImage && featureImage.naturalWidth) redrawFeatureLayer(featureImage, msg.replay ? null : feat.id);
        }
      }
      break;
    case 'RESET_FEATURE':
      if (msg.mapKey === currentMapKey || !currentMapKey) {
        delete triggeredFeatures[msg.featureId];
        hideFeatureCells(msg.featureId);
      }
      break;
    case 'update':
      if (msg.data) showText(msg.content || '', msg.data);
      break;
    case 'MOVEMENT_LOCK':
      if (msg.name === myPlayerName) {
        myMovementLocked = msg.locked;
        if (currentTokens.length) renderTokenOverlay(currentTokens);
      }
      break;
    case 'MOVEMENT_LOCK_ALL':
      myMovementLocked = msg.locked;
      if (currentTokens.length) renderTokenOverlay(currentTokens);
      break;
    case 'SET_TARGET':
      if (msg.player) {
        if (msg.target) {
          allTargets[msg.player] = msg.target;
        } else {
          delete allTargets[msg.player];
        }
        // Keep myTarget in sync if this is me
        if (msg.player === myPlayerName) myTarget = msg.target || null;
        if (currentTokens.length) renderTokenOverlay(currentTokens);
      }
      break;
    case 'ATTACK_ANIMATION': {
      var atkType = 'sword';
      // If the attacker is a spell-class player, use spell anim
      var atkTok = currentTokens.find(function(t){ return t.label === msg.attacker; });
      if (atkTok && atkTok.cls && ['Sorcerer','Wizard','Druid','Cleric','Priest','Bard'].includes(atkTok.cls)) {
        atkType = 'spell';
      }
      playAttackAnimation(msg.targets || [], atkType);
      break;
    }
    case 'GRID_TOGGLE':
      gridEnabled = !!msg.enabled;
      renderGridOverlay(sceneEl.querySelector('img'));
      break;
    case 'UPDATE_OBJECTS':
      currentObjects      = Array.isArray(msg.objects) ? msg.objects : [];
      currentObjectStates = (msg.objectStates && typeof msg.objectStates === 'object') ? msg.objectStates : {};
      renderObjectLayer(currentObjects, currentObjectStates, sceneEl.querySelector('img'));
      break;
    case 'OBJECT_STATE_CHANGE':
      if (msg.objId && msg.state) {
        currentObjectStates[msg.objId] = msg.state;
        renderObjectLayer(currentObjects, currentObjectStates, sceneEl.querySelector('img'));
      }
      break;
    case 'LIGHTBOX_OBJECT_STATE':
      if (msg.objId && msg.state) {
        _lbObjectStates[msg.objId] = msg.state;
        renderLightboxObjects(_lbObjects, _lbCols, _lbRows);
      }
      break;
    case 'ping':
      // Server heartbeat — no response needed; _lastMsgAt already updated above
      break;
    case 'PLAYER_LOGIN_OK':
      myPlayerName = msg.player.name;
      myPlayerCls  = msg.player.cls;
      sessionStorage.setItem('dnd_player_name', myPlayerName);
      sessionStorage.setItem('dnd_player_cls',  myPlayerCls);
      // Restore any target this player had (may have been received before login from sendFullState)
      if (allTargets[myPlayerName]) myTarget = allTargets[myPlayerName];
      resetLoginBtn(); // clear any pending timeout
      dismissTapOverlay();
      var hudEl = document.getElementById('player-hud');
      if (hudEl) hudEl.style.display = 'flex';
      if (currentTokens.length) renderTokenOverlay(currentTokens);
      break;

// ── Character sheet card on player HUD ───────────────────────
var claimedCharacter = null;

function abilityMod(score) {
  return Math.floor(((Number(score) || 10) - 10) / 2);
}

function showPlayerCharCard(ch) {
  claimedCharacter = ch;
  var card = document.getElementById('player-char-card');
  if (!card || !ch) return;
  var hp = ch.hp != null ? ch.hp : (ch.maxHp || 10);
  var maxHp = ch.maxHp || 10;
  var pct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0;
  var stats = ch.stats || {};
  var mods = ch.modifiers || {};
  function st(k, label) {
    var total = (stats[k] || 10) + (mods[k] || 0);
    var m = abilityMod(total);
    return '<span>' + label + ' ' + total + ' (' + (m >= 0 ? '+' : '') + m + ')</span>';
  }
  card.innerHTML =
    '<div class="pcc-name">' + (ch.name || '') + '</div>' +
    '<div class="pcc-sub">' + (ch.cls || '') + (ch.race ? ' · ' + ch.race : '') + ' · AC ' + (ch.ac || 10) + '</div>' +
    '<div class="pcc-hp">HP ' + hp + ' / ' + maxHp + '</div>' +
    '<div class="pcc-bar"><div class="pcc-bar-fill" style="width:' + pct + '%"></div></div>' +
    '<div class="pcc-stats">' +
      st('str','STR') + st('dex','DEX') + st('con','CON') +
      st('int','INT') + st('wis','WIS') + st('cha','CHA') +
    '</div>';
  card.style.display = 'block';
}

    case 'CHARACTER_CLAIMED':
      if (msg.character) {
        myPlayerName = msg.character.name;
        myPlayerCls  = msg.character.cls || '';
        sessionStorage.setItem('dnd_player_name', myPlayerName);
        sessionStorage.setItem('dnd_player_cls',  myPlayerCls);
        if (allTargets[myPlayerName]) myTarget = allTargets[myPlayerName];
        resetLoginBtn();
        dismissTapOverlay();
        var hudEl2 = document.getElementById('player-hud');
        if (hudEl2) hudEl2.style.display = 'flex';
        if (typeof showPlayerCharCard === 'function') showPlayerCharCard(msg.character);
        if (currentTokens.length) renderTokenOverlay(currentTokens);
      }
      break;
    case 'CHARACTERS_UPDATE':
      // refresh dropdown if still on login screen
      if (typeof playerCharacters !== 'undefined' && Array.isArray(msg.characters)) {
        playerCharacters = msg.characters;
        var sel = document.getElementById('login-party-select');
        if (sel && document.getElementById('tap-login-form') && document.getElementById('tap-login-form').style.display !== 'none') {
          var prev = sel.value;
          sel.innerHTML = '<option value="">— выберите персонажа —</option>';
          playerCharacters.forEach(function (ch) {
            var opt = document.createElement('option');
            opt.value = ch.id;
            var taken = ch.claimedBy ? ' (занят: ' + ch.claimedBy + ')' : '';
            opt.textContent = ch.name + (ch.cls ? ' — ' + ch.cls : '') + taken;
            sel.appendChild(opt);
          });
          if (prev) sel.value = prev;
        }
      }
      break;
    case 'LOOT_CHANGED': window.dispatchEvent(new Event('loot-changed')); break;
    case 'PLAYER_DATA_UPDATE':
      if (msg.player && claimedCharacter &&
          (msg.player.id === claimedCharacter.id || msg.player.name === claimedCharacter.name || msg.player.name === myPlayerName)) {
        claimedCharacter = Object.assign({}, claimedCharacter, msg.player);
        if (typeof showPlayerCharCard === 'function') showPlayerCharCard(claimedCharacter);
      }
      break;
    case 'PLAYER_LOGIN_ERR': {
      var errEl2 = document.getElementById('login-error');
      if (errEl2) errEl2.textContent = msg.error || 'Login failed.';
      var subBtn = document.getElementById('login-submit-btn');
      if (subBtn) { subBtn.textContent = 'Enter Session'; subBtn.disabled = false; }
      break;
    }
  }
}

// ── Fullscreen button ─────────────────────────────────────────
(function () {
  var btn = document.getElementById('fullscreen-btn');
  if (!btn) return;
  var hideTimer = null;
  var controls = document.getElementById('table-controls');
  function fullscreenActive() { return document.fullscreenElement || document.webkitFullscreenElement; }

  function showBtn() {
    clearTimeout(hideTimer);
    if (isTableScreen) {
      controls.classList.remove('idle');
      if (fullscreenActive()) hideTimer = setTimeout(function () { controls.classList.add('idle'); }, 3500);
    } else {
      btn.classList.remove('hidden');
      hideTimer = setTimeout(function () { btn.classList.add('hidden'); }, 4000);
    }
  }

  document.addEventListener('pointermove', showBtn);
  document.addEventListener('pointerdown', showBtn);
  btn.addEventListener('click', async function () {
    try {
      if (fullscreenActive()) {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
      } else {
        var root = document.documentElement;
        var enter = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!enter) throw Error('Fullscreen unavailable');
        await enter.call(root);
      }
    } catch (error) {
      if (isTableScreen) tableStatus.textContent = 'Чтобы развернуть окно, нажмите F11.';
    }
  });

  function updateFullscreen() {
    var label = fullscreenActive() ? 'Выйти из полного экрана' : 'На весь экран';
    btn.textContent = isTableScreen ? label : (fullscreenActive() ? '✕' : '⛶');
    btn.title = label;
    btn.setAttribute('aria-label', label);
    showBtn();
  }
  document.addEventListener('fullscreenchange', updateFullscreen);
  document.addEventListener('webkitfullscreenchange', updateFullscreen);
  document.getElementById('fit-map-btn').addEventListener('click', function () {
    var img = sceneEl.querySelector('img');
    if (img) img.style.objectFit = 'contain';
    redrawMapLayers();
  });
  updateFullscreen();
}());

// ── WebSocket ─────────────────────────────────────────────────
var ws = null;
var _retryDelay = 1000;
var _wsQueue = [];
var _lastMsgAt = Date.now();
var _reconnectTimer = null;
var _syncBtn = document.getElementById('sync-btn');

// scheduleReconnect — ensures only one pending reconnect at a time.
// Caps at 3s so the projector screen re-connects within seconds, not up to 10s.
function scheduleReconnect() {
  if (_reconnectTimer) return;
  _reconnectTimer = setTimeout(function () {
    _reconnectTimer = null;
    connect();
  }, _retryDelay);
  _retryDelay = Math.min(_retryDelay * 1.5, 3000);
}

// Watchdog: server pings every 30s. If silent for 35s the socket is zombie.
// Close it so onclose fires and scheduleReconnect re-establishes the link.
setInterval(function () {
  if (ws && ws.readyState === 1 && Date.now() - _lastMsgAt > 35000) {
    console.warn('[WS] silent for 35s — forcing reconnect');
    ws.close();
  }
}, 15000);

if (_syncBtn) {
  _syncBtn.addEventListener('click', function () {
    _syncBtn.classList.add('syncing');
    setTimeout(function () { _syncBtn.classList.remove('syncing'); }, 1200);
    if (ws && ws.readyState === 1) {
      // Connection live — just ask for a full state replay
      ws.send(JSON.stringify({ action: 'request-sync' }));
    } else {
      // Dead/closing — force a fresh reconnect (login restores from sessionStorage)
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      if (ws) { try { ws.close(); } catch(e) {} }
      _retryDelay = 1000;
      connect();
    }
  });
}

function wsSend(obj) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
  } else if (obj.action !== 'move-player-token') {
    _wsQueue.push(obj);
    if (_wsQueue.length > 10) _wsQueue.shift(); // cap queue
  }
}

function connect() {
  // Guard: never open a second socket while one is already live or mid-handshake
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(protocol + '//' + location.host + '/ws' + (isTableScreen ? '?view=table' : ''));
  if (isTableScreen) tableStatus.textContent = 'Подключение к столу мастера…';

  ws.onopen = function () {
    statusEl.textContent = 'connected';
    _lastMsgAt = Date.now(); // reset watchdog on fresh connection
    _retryDelay = 1000; // reset backoff on successful connect
    if (isTableScreen) {
      tableStatus.textContent = '';
      return; // the server sends the current scene automatically
    }
    // Server automatically pushes full state on connection.
    // Auto-restore login from sessionStorage (e.g. after page refresh)
    var savedName = sessionStorage.getItem('dnd_player_name');
    var savedCls  = sessionStorage.getItem('dnd_player_cls');
    if (savedName && savedCls) {
      ws.send(JSON.stringify({ action: 'player-login', name: savedName, cls: savedCls }));
    }
    // Flush messages queued while disconnected
    var q = _wsQueue.splice(0);
    q.forEach(function (m) { ws.send(JSON.stringify(m)); });
    // Explicitly request full state sync in case we missed updates while reconnecting
    ws.send(JSON.stringify({ action: 'request-sync' }));
  };

  ws.onmessage = function (e) {
    _lastMsgAt = Date.now(); // keep watchdog alive
    try { handleMessage(JSON.parse(e.data)); } catch(err) { console.error(err); }
  };

  ws.onclose = function () {
    statusEl.textContent = 'reconnecting...';
    if (isTableScreen) tableStatus.textContent = 'Связь прервалась. Восстанавливаем…';
    // If the login was in-flight when the socket dropped, re-enable the button
    resetLoginBtn();
    scheduleReconnect();
  };

  ws.onerror = function () { ws.close(); }; // onclose fires next and calls scheduleReconnect
}

connect();

// When the projector screen wakes up / tab regains focus: immediately sync.
// This is the key fix for the central table display drifting out of sync.
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState !== 'visible') return;
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ action: 'request-sync' }));
  } else {
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
    _retryDelay = 1000;
    connect();
  }
});

// When the device network comes back online: reconnect immediately, don't wait for backoff.
window.addEventListener('online', function () {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  _retryDelay = 1000;
  connect();
});

function redrawMapLayers() {
  var img = sceneEl.querySelector('img');
  if (!img || !img.naturalWidth) return;
  renderFogOverlay(currentFogKey ? fogStates[currentFogKey] : null, img);
  renderGridOverlay(img);
  renderTokenOverlay(currentTokens);
  renderDrawOverlay(currentDrawing, img);
  redrawFeatureLayer(img);
  renderObjectLayer(currentObjects, currentObjectStates, img);
}

var resizeFrame;
window.addEventListener('resize', function () {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(redrawMapLayers);
});

// ── Player Dice Bar ───────────────────────────────────────────
(function () {
  var resultEl = document.getElementById('player-dice-result');
  var resultTimer = null;
  document.querySelectorAll('.pdice-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!myPlayerName) return;
      var die    = parseInt(btn.getAttribute('data-die'));
      var result = Math.floor(Math.random() * die) + 1;

      // Show 3D dice animation on screen (same as DM broadcast)
      showDiceRoll(die, result);

      // Show compact result in the HUD bar too
      if (resultEl) {
        if (resultTimer) clearTimeout(resultTimer);
        var isCrit = (die === 20 && result === 20);
        var isFail = (die === 20 && result === 1);
        resultEl.textContent = 'd' + die + ': ' + result + (isCrit ? ' \uD83C\uDF1F' : isFail ? ' \uD83D\uDC80' : '');
        resultEl.style.color = isCrit ? '#4ade80' : isFail ? '#f87171' : '#d4af37';
        resultTimer = setTimeout(function () { resultEl.textContent = ''; }, 6000);
      }

      // Send to DM via WebSocket
      wsSend({ action: 'player-dice-roll', die: die, result: result });
    });
  });
}());
