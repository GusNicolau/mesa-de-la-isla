(() => {
const KEY = 'mesa-isla-v1';
const PLAYERS = [
  {id:'p-maria', name:'Maria',  cls:'Mediana barda',   color:'#c873d6'},
  {id:'p-mario', name:'Mario',  cls:'Enano paladín',   color:'#d9574a'},
  {id:'p-adrian',name:'Adrian', cls:'Hechicero',       color:'#e6913a'},
  {id:'p-sara',  name:'Sara',   cls:'Maga abjuradora', color:'#5a9be0'}
];
const DEF_AV = {
  'p-mario': 'assets/avatars/mario.jpg',
  'p-maria': 'assets/avatars/maria.jpg'
};
const TABERNA_SRC = 'assets/maps/taberna.jpg';
const SIZES = [[1,'Mediano'],[2,'Grande'],[3,'Enorme'],[4,'Gargantuesco']];
const ENEMY_COLOR = '#c4473e';
const BLANK = {w:1600, h:1100};

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid = () => Math.random().toString(36).slice(2, 9);

function fresh(){
  return { players: PLAYERS.map(p => ({...p, avatar:null, on:true})), enemies:[], map:null,
           grid:{cell:64, ox:0, oy:0, show:true}, pos:{}, down:{} };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { S = fresh(); }
S.players.forEach(p => { if(!p.avatar && DEF_AV[p.id]) p.avatar = DEF_AV[p.id]; });
let warned = false;
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch { if(!warned){ warned = true; toast('No se ha podido guardar en este dispositivo. Todo sigue funcionando mientras no cierres la página.'); } }
}
function toast(msg){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}

function readImg(file, max, square){
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      let w = im.naturalWidth, h = im.naturalHeight, sx = 0, sy = 0, sw = w, sh = h;
      if(square){ const m = Math.min(w,h); sx = (w-m)/2; sy = (h-m)/2; sw = sh = m; w = h = Math.min(max, m); }
      else { const k = Math.min(1, max/Math.max(w,h)); w = Math.round(w*k); h = Math.round(h*k); }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, w, h);
      URL.revokeObjectURL(u);
      res({src: cv.toDataURL('image/jpeg', square ? .85 : .82), w, h});
    };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('img')); };
    im.src = u;
  });
}
const avHTML = (t, cls='av') => `<div class="${cls}" style="--c:${t.color}">${t.avatar ? `<img src="${t.avatar}" alt="">` : esc(t.name.trim()[0]||'?').toUpperCase()}</div>`;

/* ---------- Preparación ---------- */
function renderPlayers(){
  const on = S.players.filter(p => p.on).length;
  $('#pcount').textContent = `${on} de ${S.players.length} en la partida · toca para elegir`;
  $('#players').innerHTML = S.players.map(p => `
    <div class="pcard" role="button" tabindex="0" aria-pressed="${p.on}" data-id="${p.id}" style="--c:${p.color}">
      <span class="check">${p.on ? '✓' : ''}</span>
      ${avHTML(p)}
      <div class="pname">${esc(p.name)}</div>
      <div class="pcls">${esc(p.cls)}</div>
      <label class="btn small" data-photo><input type="file" accept="image/*" id="ph-${p.id}">${p.avatar ? 'Cambiar foto' : 'Poner foto'}</label>
    </div>`).join('');
}
$('#players').addEventListener('click', e => {
  if(e.target.closest('[data-photo]')) return;
  const c = e.target.closest('.pcard'); if(!c) return;
  const p = S.players.find(x => x.id === c.dataset.id); p.on = !p.on; save(); renderPlayers();
});
$('#players').addEventListener('keydown', e => { if((e.key==='Enter'||e.key===' ') && e.target.classList.contains('pcard')){ e.preventDefault(); e.target.click(); } });
$('#players').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0]; if(!f) return;
  const p = S.players.find(x => x.id === e.target.closest('.pcard').dataset.id);
  try { p.avatar = (await readImg(f, 256, true)).src; save(); renderPlayers(); } catch { toast('No se ha podido leer esa imagen.'); }
});

/* ---------- Galería de mapas: las imágenes van a IndexedDB; cada mapa guarda su rejilla y sus fichas ---------- */
const DB = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('mesa-isla', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('maps');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = (mode, fn) => open().then(db => new Promise((res, rej) => {
    const t = db.transaction('maps', mode), q = fn(t.objectStore('maps'));
    t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
  }));
  return { get: k => tx('readonly', s => s.get(k)), put: (k, v) => tx('readwrite', s => s.put(v, k)), del: k => tx('readwrite', s => s.delete(k)) };
})();
const MAPSRC = {'m-taberna': TABERNA_SRC};
const BUILTIN = {id:'m-taberna', name:'Taberna', w:1024, h:765, builtin:true};
const newGrid = () => ({cell:64, ox:0, oy:0, show:true});
const curMap = () => S.maps && S.maps.find(m => m.id === S.mapId);

function selectMap(id){
  if(id === S.mapId) return;
  const cur = curMap(); if(cur){ cur.grid = {...S.grid}; cur.pos = S.pos; }
  const m = S.maps.find(x => x.id === id); if(!m) return;
  S.mapId = id; S.grid = m.grid ? {...m.grid} : newGrid(); S.pos = m.pos || {}; S.rot = 0; save();
}
async function addMaps(files){
  let stored = true;
  for(const f of files){
    try {
      const im = await readImg(f, 2048, false), id = 'm-' + uid();
      const name = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 40) || 'Mapa';
      MAPSRC[id] = im.src; S.maps.push({id, name, w:im.w, h:im.h});
      try { await DB.put(id, im.src); } catch { stored = false; }
      selectMap(id);
    } catch { toast('No se ha podido leer una de las imágenes.'); }
  }
  save();
  if(!stored) toast('El mapa se ve ahora, pero este navegador no deja guardarlo para la próxima vez.');
}
async function deleteMap(id){
  const i = S.maps.findIndex(m => m.id === id); if(i < 0) return;
  const wasCur = S.mapId === id;
  S.maps.splice(i, 1); delete MAPSRC[id];
  try { await DB.del(id); } catch {}
  if(wasCur){ S.mapId = null; if(S.maps[0]) selectMap(S.maps[0].id); }
  save();
}
function galleryHTML(){
  return S.maps.map(m => `
    <div class="mcard" role="button" tabindex="0" aria-pressed="${m.id === S.mapId}" data-id="${m.id}">
      ${m.id === S.mapId ? '<span class="badge">En uso</span>' : ''}
      <div class="thumb" style="background-image:url(${MAPSRC[m.id] || ''})"></div>
      <div class="meta"><input value="${esc(m.name)}" aria-label="Nombre del mapa" data-name>${m.builtin ? '' : '<button class="btn small danger" data-delmap>Borrar</button>'}</div>
    </div>`).join('')
    + `<label class="mcard add"><input type="file" accept="image/*" multiple data-addmap><b>+</b><span>Subir mapas</span><small>Puedes elegir varias fotos a la vez</small></label>`;
}
function mountGallery(el, onPick){
  const draw = () => { el.innerHTML = galleryHTML(); const c = $('#mapcount'); if(c) c.textContent = `${S.maps.length} ${S.maps.length === 1 ? 'mapa' : 'mapas'} · toca uno para usarlo`; };
  draw();
  el.onclick = e => {
    if(e.target.closest('[data-name]') || e.target.closest('.add')) return;
    const card = e.target.closest('.mcard'); if(!card) return;
    const del = e.target.closest('[data-delmap]');
    if(del){
      if(!del.dataset.arm){ del.dataset.arm = '1'; del.textContent = '¿Seguro?'; setTimeout(() => { if(del.isConnected){ del.dataset.arm = ''; del.textContent = 'Borrar'; } }, 3000); return; }
      deleteMap(card.dataset.id).then(draw); return;
    }
    selectMap(card.dataset.id); draw(); onPick && onPick();
  };
  el.onchange = async e => {
    if(e.target.matches('[data-addmap]')){ const fs = [...e.target.files]; if(!fs.length) return; await addMaps(fs); draw(); onPick && onPick(); }
    else if(e.target.matches('[data-name]')){ const m = S.maps.find(x => x.id === e.target.closest('.mcard').dataset.id); m.name = e.target.value.trim() || m.name; save(); }
  };
  el.onkeydown = e => { if((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('mcard')){ e.preventDefault(); e.target.click(); } };
  return draw;
}
async function initMaps(){
  if(!S.maps){
    S.maps = [{...BUILTIN}]; S.mapId = BUILTIN.id;
    if(S.map){ // mapa suelto de la versión anterior
      const id = 'm-' + uid(); MAPSRC[id] = S.map.src;
      S.maps.push({id, name:'Mi mapa', w:S.map.w, h:S.map.h, grid:{...S.grid}, pos:S.pos}); S.mapId = id;
      try { await DB.put(id, S.map.src); } catch {}
    }
    delete S.map; save();
  }
  await Promise.all(S.maps.filter(m => !m.builtin).map(async m => { try { const v = await DB.get(m.id); if(v) MAPSRC[m.id] = v; } catch {} }));
}
let redrawGallery = () => {};
function renderMap(){ redrawGallery = mountGallery($('#gallery')); }

function enemyForm(host, onDone){
  let photo = null;
  const k = uid();
  host.innerHTML = `
    <form class="eform">
      <div class="field f-name"><label for="en-${k}">Nombre</label><input id="en-${k}" required placeholder="Goblin, Esqueleto, Jefe…" autocomplete="off"></div>
      <div class="field"><label for="es-${k}">Tamaño</label><select id="es-${k}">${SIZES.map(([n,l]) => `<option value="${n}">${l} (${n}×${n})</option>`).join('')}</select></div>
      <div class="field"><label for="eq-${k}">Cantidad</label><input id="eq-${k}" type="number" min="1" max="20" value="1" inputmode="numeric"></div>
      <label class="btn"><input type="file" accept="image/*" id="ef-${k}"><span>Foto</span></label>
      <button class="btn primary" type="submit">Añadir</button>
    </form>`;
  const form = host.querySelector('form');
  host.querySelector('input[type=file]').addEventListener('change', async e => {
    const f = e.target.files[0]; if(!f) return;
    try { photo = (await readImg(f, 256, true)).src; e.target.nextElementSibling.textContent = 'Foto ✓'; } catch { toast('No se ha podido leer esa imagen.'); }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = form.querySelector(`#en-${k}`).value.trim(); if(!name) return;
    const size = +form.querySelector(`#es-${k}`).value;
    const qty = Math.max(1, Math.min(20, +form.querySelector(`#eq-${k}`).value || 1));
    const same = S.enemies.filter(x => x.base === name).length;
    for(let i = 0; i < qty; i++){
      const n = (qty > 1 || same) ? same + i + 1 : null;
      S.enemies.push({id:'e-'+uid(), base:name, name: n ? `${name} ${n}` : name, n, size, avatar:photo, color:ENEMY_COLOR});
    }
    save(); enemyForm(host, onDone); onDone && onDone(qty, name);
  });
}
function renderEnemies(){
  const L = $('#elist');
  L.innerHTML = S.enemies.length ? S.enemies.map(x => `
    <div class="erow">${avHTML(x)}<div class="info"><b>${esc(x.name)}</b><small>${SIZES.find(s=>s[0]===x.size)[1]}</small></div>
    <button class="btn small danger" data-del="${x.id}" aria-label="Quitar ${esc(x.name)}">Quitar</button></div>`).join('')
    : `<div class="empty">Ningún enemigo en este encuentro. Añádelos aquí o desde el mapa.</div>`;
  const c = $('#eclear'); c.hidden = !S.enemies.length; c.textContent = 'Quitar todos'; c.dataset.arm = '';
}
$('#elist').addEventListener('click', e => {
  const b = e.target.closest('[data-del]'); if(!b) return;
  removeEnemy(b.dataset.del); renderEnemies();
});
$('#eclear').addEventListener('click', e => {
  const b = e.currentTarget;
  if(!b.dataset.arm){ b.dataset.arm = '1'; b.textContent = '¿Seguro? Toca otra vez'; setTimeout(() => { if(b.dataset.arm){ b.dataset.arm=''; b.textContent='Quitar todos'; } }, 3000); return; }
  S.enemies.forEach(x => { delete S.pos[x.id]; delete S.down[x.id]; }); S.enemies = []; save(); renderEnemies();
});
function removeEnemy(id){
  S.enemies = S.enemies.filter(x => x.id !== id); delete S.pos[id]; delete S.down[id]; save();
}

/* ---------- Partida ---------- */
const vp = $('#vp'), board = $('#board'), grid = $('#grid');
const V = {x:0, y:0, s:1};
let selId = null;

const mapSrc = () => { const m = curMap(); return m && MAPSRC[m.id]; };
const dims = () => { const m = curMap(); return m && MAPSRC[m.id] ? {w:m.w, h:m.h} : BLANK; };
const tokens = () => [...S.players.filter(p => p.on).map(p => ({...p, size:1, kind:'p'})), ...S.enemies.map(x => ({...x, kind:'e'}))];
const getTok = id => tokens().find(t => t.id === id);
function bounds(){ const d = dims(), g = S.grid; return {cols: Math.max(1, Math.floor((d.w - g.ox)/g.cell)), rows: Math.max(1, Math.floor((d.h - g.oy)/g.cell))}; }
function clampPos(c, r, size){ const b = bounds(); return {c: Math.max(0, Math.min(b.cols - size, c)), r: Math.max(0, Math.min(b.rows - size, r))}; }

function occupied(exceptId){
  const set = new Set();
  tokens().forEach(t => { const p = S.pos[t.id]; if(!p || t.id === exceptId) return;
    for(let i=0;i<t.size;i++) for(let j=0;j<t.size;j++) set.add((p.c+i)+','+(p.r+j)); });
  return set;
}
function placeMissing(){
  const b = bounds();
  tokens().forEach(t => {
    if(S.pos[t.id]){ S.pos[t.id] = clampPos(S.pos[t.id].c, S.pos[t.id].r, t.size); return; }
    const occ = occupied(t.id), fromRight = t.kind === 'e';
    outer: for(let r = 0; r <= b.rows - t.size; r++){
      for(let k = 0; k <= b.cols - t.size; k++){
        const c = fromRight ? b.cols - t.size - k : k;
        let ok = true;
        for(let i=0;i<t.size && ok;i++) for(let j=0;j<t.size;j++) if(occ.has((c+i)+','+(r+j))){ ok=false; break; }
        if(ok){ S.pos[t.id] = {c, r}; break outer; }
      }
    }
    if(!S.pos[t.id]) S.pos[t.id] = {c:0, r:0};
  });
  save();
}

function drawBoard(){
  const d = dims(), g = S.grid;
  board.style.width = d.w + 'px'; board.style.height = d.h + 'px';
  const src = mapSrc();
  board.classList.toggle('blank', !src);
  board.style.backgroundImage = src ? `url(${src})` : '';
  let hint = board.querySelector('.hint');
  if(!src && !hint){ hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'Elige un mapa en "Mapas"'; board.prepend(hint); }
  if(src && hint) hint.remove();
  grid.hidden = !g.show;
  const line = 'rgb(0 0 0 / .45)', line2 = 'rgb(255 255 255 / .18)';
  grid.style.backgroundImage = `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px), linear-gradient(to right, ${line2} 1px, transparent 1px), linear-gradient(to bottom, ${line2} 1px, transparent 1px)`;
  grid.style.backgroundSize = `${g.cell}px ${g.cell}px`;
  grid.style.backgroundPosition = `${g.ox}px ${g.oy}px, ${g.ox}px ${g.oy}px, ${g.ox+1}px ${g.oy+1}px, ${g.ox+1}px ${g.oy+1}px`;
  $('#gridtog').setAttribute('aria-pressed', g.show);
  drawTokens();
}
function tokGeom(t){
  const g = S.grid, p = S.pos[t.id] || {c:0,r:0}, pad = g.cell * .07;
  return {left: g.ox + p.c*g.cell + pad, top: g.oy + p.r*g.cell + pad, size: t.size*g.cell - pad*2};
}
function drawTokens(){
  board.querySelectorAll('.tok').forEach(n => n.remove());
  const g = S.grid;
  tokens().forEach(t => {
    const el = document.createElement('div'), q = tokGeom(t);
    el.className = 'tok' + (t.id === selId ? ' sel' : '') + (S.down[t.id] ? ' down' : '');
    el.dataset.id = t.id;
    el.style.cssText = `--c:${t.color};left:${q.left}px;top:${q.top}px;width:${q.size}px;height:${q.size}px;border-width:${Math.max(2, g.cell*.07)}px;font-size:${q.size*.42}px`;
    el.innerHTML = (t.avatar ? `<img src="${t.avatar}" alt="" draggable="false">` : esc(t.name.trim()[0]||'?').toUpperCase())
      + `<span class="nm" style="font-size:${Math.max(10, g.cell*.2)}px">${esc(t.kind === 'e' && t.n ? t.base : t.name)}</span>`
      + (t.kind === 'e' && t.n ? `<span class="num" style="font-size:${Math.max(9, g.cell*.19)}px">${t.n}</span>` : '');
    board.appendChild(el);
  });
}
/* vista: pantalla = T + s·R·punto del tablero (R = giro de 0/90/180/270°) */
const rad = () => (S.rot || 0) * Math.PI / 180;
function fromLocal(lx, ly){
  const a = rad(), c = Math.cos(a), s = Math.sin(a), dx = (lx - V.x)/V.s, dy = (ly - V.y)/V.s;
  return {x: c*dx + s*dy, y: -s*dx + c*dy};
}
function anchor(b, lx, ly){
  const a = rad(), c = Math.cos(a), s = Math.sin(a);
  V.x = lx - V.s*(c*b.x - s*b.y); V.y = ly - V.s*(s*b.x + c*b.y);
}
function applyView(){ board.style.transform = `translate(${V.x}px,${V.y}px) rotate(${S.rot||0}deg) scale(${V.s})`; }
function fit(){
  const d = dims(), r = vp.getBoundingClientRect(), side = (S.rot||0) % 180 !== 0;
  V.s = Math.min(r.width / (side ? d.h : d.w), r.height / (side ? d.w : d.h)) * .96;
  anchor({x:d.w/2, y:d.h/2}, r.width/2, r.height/2); applyView();
}
function rotate(){ S.rot = ((S.rot||0) + 90) % 360; save(); fit(); }

function renderSel(){
  const bar = $('#selbar'), t = selId && getTok(selId);
  if(!t){ bar.hidden = true; selId = null; return; }
  bar.hidden = false;
  const down = !!S.down[t.id];
  bar.innerHTML = `${avHTML(t)}
    <div class="who"><b>${esc(t.name)}</b><small>${t.kind==='p' ? esc(t.cls) : SIZES.find(s=>s[0]===t.size)[1]}</small></div>
    ${t.kind==='e' ? `<div class="seg" role="group" aria-label="Tamaño">${SIZES.map(([n,l]) => `<button data-size="${n}" aria-pressed="${t.size===n}" title="${l}">${l[0]}${l==='Gargantuesco'?'g':''}</button>`).join('')}</div>` : ''}
    <button class="btn small" data-down aria-pressed="${down}">${down ? 'Levantar' : 'Derribado'}</button>
    ${t.kind==='e' ? `<button class="btn small danger" data-kill>Eliminar</button>` : ''}
    <button class="btn small" data-close aria-label="Cerrar">✕</button>`;
}
$('#selbar').addEventListener('click', e => {
  const t = getTok(selId); if(!t) return;
  if(e.target.closest('[data-close]')){ select(null); return; }
  if(e.target.closest('[data-down]')){ if(S.down[t.id]) delete S.down[t.id]; else S.down[t.id] = 1; save(); drawTokens(); renderSel(); return; }
  const sz = e.target.closest('[data-size]');
  if(sz){ const en = S.enemies.find(x => x.id === t.id); en.size = +sz.dataset.size; S.pos[t.id] = clampPos(S.pos[t.id].c, S.pos[t.id].r, en.size); save(); drawTokens(); renderSel(); return; }
  if(e.target.closest('[data-kill]')){ removeEnemy(t.id); select(null); drawTokens(); }
});
function select(id){ selId = id; board.querySelectorAll('.tok').forEach(n => n.classList.toggle('sel', n.dataset.id === id)); renderSel(); }

/* gestos: arrastrar ficha, mover mapa con un dedo, zoom con dos */
const pts = new Map(); let drag = null, pan = null, pinch = null, lockMap = false, mesa = false;
const toBoard = (cx, cy) => { const r = vp.getBoundingClientRect(); return fromLocal(cx - r.left, cy - r.top); };
function startPinch(){
  const [a, b] = [...pts.values()], r = vp.getBoundingClientRect();
  const mx = (a.x+b.x)/2 - r.left, my = (a.y+b.y)/2 - r.top;
  pinch = {d: Math.hypot(a.x-b.x, a.y-b.y) || 1, s:V.s, b: fromLocal(mx, my)};
}
vp.addEventListener('pointerdown', e => {
  pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
  try { vp.setPointerCapture(e.pointerId); } catch {}
  if(pts.size === 1){
    const tok = e.target.closest('.tok');
    if(tok) drag = {pid:e.pointerId, id:tok.dataset.id, el:tok, sx:e.clientX, sy:e.clientY, moved:false};
    else pan = {sx:e.clientX, sy:e.clientY, x:V.x, y:V.y, moved:false};
  } else if(pts.size === 2 && !lockMap){
    if(drag){ drag.el.classList.remove('lift'); drawTokens(); }
    drag = null; pan = null; startPinch();
  }
});
vp.addEventListener('pointermove', e => {
  if(!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(pinch && pts.size >= 2){
    const [a, b] = [...pts.values()], r = vp.getBoundingClientRect();
    V.s = Math.max(.1, Math.min(6, pinch.s * Math.hypot(a.x-b.x, a.y-b.y) / pinch.d));
    anchor(pinch.b, (a.x+b.x)/2 - r.left, (a.y+b.y)/2 - r.top); applyView(); return;
  }
  if(drag){
    if(e.pointerId !== drag.pid) return;
    if(!drag.moved && Math.hypot(e.clientX-drag.sx, e.clientY-drag.sy) < 6) return;
    if(!drag.moved){ drag.moved = true; drag.el.classList.add('lift'); vp.style.cursor = 'grabbing'; }
    const p = toBoard(e.clientX, e.clientY), w = drag.el.offsetWidth;
    drag.el.style.left = (p.x - w/2) + 'px'; drag.el.style.top = (p.y - w/2) + 'px'; return;
  }
  if(pan){
    const dx = e.clientX - pan.sx, dy = e.clientY - pan.sy;
    if(!pan.moved && Math.hypot(dx, dy) < 4) return;
    pan.moved = true; if(lockMap) return; V.x = pan.x + dx; V.y = pan.y + dy; applyView();
  }
});
function endPointer(e){
  if(!pts.has(e.pointerId)) return;
  pts.delete(e.pointerId);
  vp.style.cursor = '';
  if(pinch){
    if(pts.size < 2){ pinch = null; if(pts.size === 1){ const [p] = [...pts.values()]; pan = {sx:p.x, sy:p.y, x:V.x, y:V.y, moved:true}; } }
    return;
  }
  if(drag){
    if(e.pointerId !== drag.pid) return;
    const d = drag; drag = null;
    if(d.moved && e.type !== 'pointercancel'){
      const t = getTok(d.id), g = S.grid, p = toBoard(e.clientX, e.clientY);
      S.pos[d.id] = clampPos(Math.round((p.x - g.ox)/g.cell - t.size/2), Math.round((p.y - g.oy)/g.cell - t.size/2), t.size);
      save(); drawTokens(); select(d.id);
    } else if(!d.moved){ select(selId === d.id ? null : d.id); }
    else drawTokens();
    return;
  }
  if(pan){ if(!pan.moved) select(null); pan = null; }
}
vp.addEventListener('pointerup', endPointer);
vp.addEventListener('pointercancel', endPointer);
vp.addEventListener('wheel', e => {
  e.preventDefault(); if(lockMap) return;
  const r = vp.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, b = fromLocal(mx, my);
  V.s = Math.max(.1, Math.min(6, V.s * Math.exp(-e.deltaY * .0015)));
  anchor(b, mx, my); applyView();
}, {passive:false});

/* modo mesa: tablet plana en el centro, sin menús, mapa fijo para que las manos no lo muevan */
function setLock(v){ lockMap = v; const b = $('#mlock'); b.setAttribute('aria-pressed', v); b.textContent = v ? 'Mapa fijo' : 'Mapa libre'; }
function enterMesa(){
  mesa = true; select(null); document.body.classList.add('mesa'); $('#mesactl').hidden = false; setLock(true);
  try { const p = document.documentElement.requestFullscreen?.(); p && p.catch(() => {}); } catch {}
  requestAnimationFrame(fit); setTimeout(fit, 350);
}
function exitMesa(){
  mesa = false; document.body.classList.remove('mesa'); $('#mesactl').hidden = true; setLock(false);
  try { if(document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch {}
  requestAnimationFrame(fit); setTimeout(fit, 350);
}
$('#mesa').addEventListener('click', enterMesa);
$('#mexit').addEventListener('click', exitMesa);
$('#mlock').addEventListener('click', () => setLock(!lockMap));
$('#mrot').addEventListener('click', rotate);
$('#rot').addEventListener('click', rotate);
addEventListener('resize', () => { if(!$('#game').hidden) fit(); });

/* hojas: rejilla y añadir enemigo */
function sheet(html, setup){
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  bg.addEventListener('click', e => { if(e.target === bg) bg.remove(); });
  document.body.appendChild(bg); setup(bg.firstElementChild, () => bg.remove());
}
$('#gridcfg').addEventListener('click', () => {
  const g = S.grid;
  sheet(`<h2>Ajustar celdas</h2>
    <p style="margin:0;color:var(--muted)">Haz coincidir la rejilla con las casillas dibujadas en el mapa. En D&amp;D cada casilla son 1,5 m (5 pies).</p>
    <div class="range"><label for="gc">Tamaño</label><input type="range" id="gc" min="20" max="200" value="${g.cell}"><output id="gco">${g.cell}px</output></div>
    <div class="range"><label for="gx">Mover ↔</label><input type="range" id="gx" min="0" max="${g.cell-1}" value="${g.ox}"><output id="gxo">${g.ox}</output></div>
    <div class="range"><label for="gy">Mover ↕</label><input type="range" id="gy" min="0" max="${g.cell-1}" value="${g.oy}"><output id="gyo">${g.oy}</output></div>
    <div class="row"><button class="btn primary" id="gdone">Listo</button></div>`, (el, close) => {
    const upd = () => {
      g.cell = +el.querySelector('#gc').value;
      ['gx','gy'].forEach(id => { const i = el.querySelector('#'+id); i.max = g.cell - 1; });
      g.ox = Math.min(+el.querySelector('#gx').value, g.cell-1); g.oy = Math.min(+el.querySelector('#gy').value, g.cell-1);
      el.querySelector('#gco').textContent = g.cell + 'px'; el.querySelector('#gxo').textContent = g.ox; el.querySelector('#gyo').textContent = g.oy;
      g.show = true; drawBoard();
    };
    el.addEventListener('input', upd);
    el.querySelector('#gdone').addEventListener('click', () => { tokens().forEach(t => { if(S.pos[t.id]) S.pos[t.id] = clampPos(S.pos[t.id].c, S.pos[t.id].r, t.size); }); save(); drawTokens(); close(); });
  });
});
$('#gridtog').addEventListener('click', () => { S.grid.show = !S.grid.show; save(); drawBoard(); });
$('#addenemy').addEventListener('click', () => {
  sheet(`<h2>Añadir enemigo</h2><div id="sheetform"></div>`, (el, close) => {
    enemyForm(el.querySelector('#sheetform'), (q, name) => { placeMissing(); drawTokens(); close(); toast(q > 1 ? `${q} × ${name} en el mapa` : `${name} en el mapa`); });
    setTimeout(() => el.querySelector('input').focus(), 50);
  });
});
$('#fit').addEventListener('click', fit);
$('#maps').addEventListener('click', () => {
  select(null);
  sheet(`<h2>Cambiar de mapa</h2><div class="gallery" id="sheetgal"></div>`, (el, close) => {
    mountGallery(el.querySelector('#sheetgal'), () => { placeMissing(); drawBoard(); fit(); close(); });
  });
});

/* cambio de pantalla */
let wake = null;
async function keepAwake(){ try { wake = await navigator.wakeLock.request('screen'); } catch {} }
$('#start').addEventListener('click', () => {
  if(!S.players.some(p => p.on) && !S.enemies.length){ toast('Elige al menos un jugador.'); return; }
  $('#setup').hidden = true; $('#game').hidden = false;
  placeMissing(); drawBoard(); fit(); renderSel(); keepAwake();
});
$('#back').addEventListener('click', () => {
  if(mesa) exitMesa(); select(null); $('#game').hidden = true; $('#setup').hidden = false;
  renderPlayers(); renderEnemies(); renderMap(); scrollTo(0,0);
  try { wake && wake.release(); } catch {}
});

renderPlayers(); renderEnemies();
enemyForm($('#eformSetup'), () => renderEnemies());
initMaps().then(renderMap);
})();
