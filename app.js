'use strict';
const CACHE_KEY = 'tcta-stops-v1';
const BBOX = '33.45,72.80,33.80,73.25';
/* Free public Overpass instances (no key needed). All are queried at once and the first answer wins. */
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.openstreetmap.fr/api/interpreter'];
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const STOP_Q = `[out:json][timeout:30];(node["highway"="bus_stop"](${BBOX});nwr["amenity"="bus_station"](${BBOX});nwr["railway"~"^(station|halt)$"](${BBOX});node["amenity"="taxi"](${BBOX}););out tags center;`;

/* Vehicle glyphs (24x24 line icons) */
const G = {
  bus:   '<path d="M8 6v6M16 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
  front: '<path d="M4 6 2 7M10 6h4M22 7l-2-1"/><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16M8 15h.01M16 15h.01M6 19v2M18 21v-2"/>',
  train: '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1M15 15l1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3M16 19l2 3"/>',
  car:   '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>'
};
const CATS = {
  metro:       { label: 'Metrobus station', color: '#dc2626', g: 'bus',   size: 32, sq: false },
  bus_station: { label: 'Bus terminal',     color: '#2563eb', g: 'front', size: 32, sq: true },
  bus_stop:    { label: 'Bus stop',         color: '#0f9d74', g: 'front', size: 26, sq: false },
  rail:        { label: 'Railway station',  color: '#d97706', g: 'train', size: 32, sq: false },
  taxi:        { label: 'Taxi stand',       color: '#475569', g: 'car',   size: 28, sq: false }
};
const CITIES = { isb: { label: 'Islamabad', color: '#0b1f3a' }, rwp: { label: 'Rawalpindi', color: '#f5b301' } };
const FIELDS = [['ref', 'Reference'], ['operator', 'Operator'], ['network', 'Network'], ['route_ref', 'Routes'], ['shelter', 'Shelter'], ['bench', 'Bench'], ['bin', 'Bin'], ['lit', 'Lighting'], ['wheelchair', 'Wheelchair access'], ['opening_hours', 'Hours']];
const BASES = {
  osm:  ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }],
  sat:  ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' }],
  topo: ['https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenStreetMap contributors, © OpenTopoMap (CC-BY-SA)' }]
};
const ROUTES = {
  metro: { ms: 60, msg: 'Loading Metrobus lines…', q: `relation["route"~"^(bus|trolleybus)$"][~"^(name|network|operator)$"~"Metro",i](${BBOX});out geom qt;` },
  all:   { ms: 90, msg: 'Loading all bus routes, this can take a minute…', q: `relation["route"="bus"](${BBOX});out geom qt;` }
};

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dist = (a, b) => { const r = Math.PI / 180, R = 6371e3, p = (b.lat - a.lat) * r, l = (b.lon - a.lon) * r, h = Math.sin(p / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(l / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const svg = (g, s) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${G[g]}</svg>`;
const badge = (k, s = CATS[k].size) => `<span class="bdg ${CATS[k].sq ? 'sq' : ''}" style="--c:${CATS[k].color};width:${s}px;height:${s}px">${svg(CATS[k].g, Math.round(s * .58))}</span>`;
const state = { all: [], cats: new Set(Object.keys(CATS)), cities: new Set(Object.keys(CITIES)) };
const markers = new Map(), icons = {};
let me = null, meMarker = null, pulse = null, routeLine = null;

$('#logo').innerHTML = svg('bus', 26).replace('#fff', '#0b1f3a');

/* ---------- Header clock (Pakistan time) ---------- */
function tick() {
  const n = new Date();
  $('#time').textContent = n.toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  $('#date').textContent = n.toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
tick(); setInterval(tick, 1000);

/* ---------- Map ---------- */
const map = L.map('map', { zoomControl: false, attributionControl: false }).fitBounds([[33.50, 72.90], [33.74, 73.20]]);
L.control.zoom({ position: 'bottomright' }).addTo(map);
new ResizeObserver(() => map.invalidateSize()).observe($('#map'));
let baseLayer;
function setBase(k) { if (baseLayer) map.removeLayer(baseLayer); baseLayer = L.tileLayer(...BASES[k]).addTo(map); baseLayer.bringToBack(); $('#credit-extra').textContent = { osm: '', sat: ' | Imagery © Esri', topo: ' | © OpenTopoMap (CC-BY-SA)' }[k]; }
setBase('osm');
const cluster = L.markerClusterGroup({
  chunkedLoading: true, maxClusterRadius: 45, showCoverageOnHover: false,
  iconCreateFunction: c => { const n = c.getChildCount(), s = n < 10 ? 36 : n < 50 ? 42 : 50; return L.divIcon({ className: '', html: `<div class="mc" style="width:${s}px;height:${s}px">${n}</div>`, iconSize: [s, s] }); }
}).addTo(map);
const rl = { metro: L.layerGroup(), all: L.layerGroup() }, rloaded = {};
$('#coords').textContent = 'Move the cursor over the map';
map.on('click', () => { if (innerWidth <= 760) { document.body.classList.add('closed'); $('#menu').setAttribute('aria-expanded', 'false'); } });
map.on('mousemove', e => { $('#coords').textContent = `Lat ${e.latlng.lat.toFixed(5)}   Lon ${e.latlng.lng.toFixed(5)}   Zoom ${map.getZoom()}`; });

/* ---------- Public APIs ---------- */
async function race(query, ms) {
  const ctls = [], errors = [];
  const attempts = ENDPOINTS.map(async url => {
    const ctl = new AbortController(); ctls.push(ctl);
    const timer = setTimeout(() => ctl.abort(), ms), host = new URL(url).hostname;
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!Array.isArray(json.elements)) throw new Error('unexpected response');
      return json;
    } catch (e) { errors.push(host + ' (' + (e.name === 'AbortError' ? 'no answer' : e.message) + ')'); throw e; }
    finally { clearTimeout(timer); }
  });
  try { const json = await Promise.any(attempts); ctls.forEach(c => c.abort()); return json; }
  catch { console.error('Overpass failures:', errors); throw new Error('the public servers are busy: ' + errors.join(', ')); }
}
async function overpass(query, ms = 40000, tries = 3, onTry) {
  let err;
  for (let i = 1; i <= tries; i++) {
    onTry && onTry(i, tries);
    try { return await race(query, ms); } catch (e) { err = e; if (i < tries) await sleep(2500); }
  }
  throw err;
}

function classify(t) {
  const metro = /metro/i.test((t.name || '') + (t.network || '') + (t.operator || ''));
  if (t.railway) return 'rail';
  if (t.amenity === 'taxi') return 'taxi';
  if (t.amenity === 'bus_station') return metro ? 'metro' : 'bus_station';
  return metro ? 'metro' : 'bus_stop';
}
function cityOf(t, lat, lon) {   // approximate: address tag first, then a dividing line between the cities
  const a = (t['addr:city'] || '').toLowerCase();
  if (a.includes('rawalpindi')) return 'rwp';
  if (a.includes('islamabad')) return 'isb';
  return lat < 33.652 - (lon - 73.0) * 0.371 ? 'rwp' : 'isb';
}
function ingest(data, t) {
  state.all = data.elements.map(e => {
    const tg = e.tags || {}, lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    return { id: e.type + '/' + e.id, lat, lon, tags: tg, name: tg.name || tg['name:en'] || '', cat: classify(tg), city: cityOf(tg, lat, lon) };
  }).filter(f => f.lat != null);
  $('#src').textContent = 'Loaded ' + new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + '.';
  render();
}
const readCache = () => { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY)); return c && c.d && c.d.elements ? c : null; } catch { return null; } };

async function loadStops() {
  hideToast();
  const c = readCache();
  if (c) { ingest(c.d, c.t); $('#loader').classList.add('done'); if (Date.now() - c.t < 864e5) return; }
  else $('#loader').classList.remove('done');
  try {
    const d = await overpass(STOP_Q, 40000, 3, (i, n) => { $('#loader-msg').textContent = `Contacting OpenStreetMap servers (attempt ${i} of ${n})…`; });
    if (!d.elements.length) throw new Error('the service returned no features for this area');
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d })); } catch {}
    ingest(d, Date.now());
  } catch (e) {
    c ? showToast('The live servers are busy, so you are viewing the copy saved on this device.', null, true) : showToast('Could not load transport data: ' + e.message + '.', loadStops);
  }
  $('#loader').classList.add('done');
}

async function toggleRoute(kind, input) {
  const g = rl[kind];
  if (!input.checked) return map.removeLayer(g);
  if (rloaded[kind]) return g.addTo(map);
  const cfg = ROUTES[kind];
  try {
    const data = await overpass(`[out:json][timeout:${cfg.ms}];` + cfg.q, cfg.ms * 1000, 2, (i, n) => pill(cfg.msg + (i > 1 ? ` (retry ${i - 1})` : '')));
    data.elements.forEach(rel => {
      const t = rel.tags || {}, label = [t.ref, t.name].filter(Boolean).join(' ') || 'Bus route', w = kind === 'metro' ? 5 : 3;
      const color = kind === 'metro' ? '#dc2626' : (t.colour || `hsl(${[...label].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) % 360} 65% 42%)`);
      (rel.members || []).filter(m => m.type === 'way' && m.geometry).forEach(m => {
        L.polyline(m.geometry.map(p => [p.lat, p.lon]), { color, weight: w, opacity: .75 }).bindTooltip(esc(label), { sticky: true })
          .on('mouseover', e => e.target.setStyle({ weight: 8, opacity: 1 })).on('mouseout', e => e.target.setStyle({ weight: w, opacity: .75 })).addTo(g);
      });
    });
    rloaded[kind] = true; g.addTo(map);
    if (!g.getLayers().length) showToast('No route lines are mapped for this option in the study area.', null, true);
  } catch (e) { input.checked = false; showToast('Could not load routes: ' + e.message + '.', () => { input.checked = true; toggleRoute(kind, input); }); }
  pill();
}

const routeCache = {};
async function getRoute(a, b) {
  const k = [a.lat, a.lon, b.lat, b.lon].join();
  if (routeCache[k]) return routeCache[k];
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(`${OSRM}${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`, { signal: ctl.signal });
    const j = await r.json(); if (j.code !== 'Ok') throw new Error(j.code);
    return routeCache[k] = { distance: j.routes[0].distance, duration: j.routes[0].duration, coords: j.routes[0].geometry.coordinates.map(c => [c[1], c[0]]) };
  } finally { clearTimeout(t); }
}

function locate() {
  return new Promise((ok, no) => {
    if (me) return ok(me);
    if (!navigator.geolocation) return no(new Error('Your browser does not support location.'));
    navigator.geolocation.getCurrentPosition(p => {
      me = { lat: p.coords.latitude, lon: p.coords.longitude };
      meMarker = L.circleMarker([me.lat, me.lon], { radius: 9, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).bindTooltip('You are here').addTo(map);
      ok(me);
    }, () => no(new Error('Location is blocked. Allow location access for this page and try again.')), { timeout: 12000 });
  });
}

/* ---------- Rendering ---------- */
const visible = () => state.all.filter(f => state.cats.has(f.cat) && state.cities.has(f.city));
const icon = c => icons[c] ||= L.divIcon({ className: '', html: `<span class="pin">${badge(c)}</span>`, iconSize: [CATS[c].size, CATS[c].size], iconAnchor: [CATS[c].size / 2, CATS[c].size / 2] });

function render() {
  const list = visible();
  cluster.clearLayers(); markers.clear();
  cluster.addLayers(list.map(f => {
    const m = L.marker([f.lat, f.lon], { icon: icon(f.cat), keyboard: false, riseOnHover: true })
      .bindTooltip(esc(f.name || CATS[f.cat].label), { direction: 'top', offset: [0, -14] }).on('click', () => select(f.id));
    markers.set(f.id, m); return m;
  }));
  const cnt = (key, other, set) => state.all.reduce((o, f) => (set.has(f[other]) && (o[f[key]] = (o[f[key]] || 0) + 1), o), {});
  const byCat = cnt('cat', 'city', state.cities), byCity = cnt('city', 'cat', state.cats);
  const row = (k, label, color, n, on, extra = '') => `<label class="opt"><input type="checkbox" data-k="${k}" ${on ? 'checked' : ''}><span class="box" style="--c:${color}"></span>${extra}<span class="lbl">${label}</span><em>${(n || 0).toLocaleString()}</em></label>`;
  $('#cities').innerHTML = Object.entries(CITIES).map(([k, c]) => row(k, c.label, '#0b1f3a', byCity[k], state.cities.has(k))).join('');
  $('#cats').innerHTML = Object.entries(CATS).map(([k, c]) => row(k, c.label, '#0b1f3a', byCat[k], state.cats.has(k), badge(k, 22))).join('');
  $('#legend').innerHTML = '<h3>Legend</h3>' + Object.entries(CATS).map(([k, c]) => `<div>${badge(k, 24)}${c.label}</div>`).join('') + '<div><span class="ln"></span>Metrobus line</div>';
  const tot = c => state.all.filter(f => f.city === c).length;
  $('#k-total').textContent = state.all.length.toLocaleString(); $('#k-isb').textContent = tot('isb').toLocaleString(); $('#k-rwp').textContent = tot('rwp').toLocaleString();
}
render();

function fitVisible() {
  const l = visible(); if (!l.length) return showToast('Nothing to show. Turn on at least one area and one stop type.', null, true);
  map.flyToBounds(L.latLngBounds(l.map(f => [f.lat, f.lon])).pad(.12), { duration: .8, maxZoom: 15 });
}

/* ---------- Selection and info panel ---------- */
function select(id) {
  const f = state.all.find(x => x.id === id); if (!f) return;
  if (!state.cats.has(f.cat) || !state.cities.has(f.city)) { state.cats.add(f.cat); state.cities.add(f.city); render(); }
  showInfo(f);
  if (pulse) map.removeLayer(pulse);
  pulse = L.marker([f.lat, f.lon], { icon: L.divIcon({ className: '', html: `<span class="pulse" style="--c:${CATS[f.cat].color}"></span>`, iconSize: [34, 34], iconAnchor: [17, 17] }), interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(map);
  map.flyTo([f.lat, f.lon], Math.max(map.getZoom(), 17), { duration: .8 });
  map.once('moveend', () => { const m = markers.get(id); m && cluster.zoomToShowLayer(m, () => {}); });
  if (innerWidth <= 760) document.body.classList.add('closed');
}

function showInfo(f) {
  const c = CATS[f.cat], el = $('#info');
  const rows = FIELDS.filter(([k]) => f.tags[k]).map(([k, l]) => `<dt>${l}</dt><dd>${esc(f.tags[k])}</dd>`).join('');
  const near = state.all.filter(x => x.id !== f.id).map(x => ({ x, d: dist(f, x) })).sort((a, b) => a.d - b.d).slice(0, 4);
  clearRoute();
  el.hidden = false; el.dataset.id = f.id; el.style.setProperty('--c', c.color);
  el.innerHTML = `<div class="hd"><button class="x" data-a="close" aria-label="Close details">×</button><p>${badge(f.cat, 24)}${c.label} in ${CITIES[f.city].label}</p><h2>${esc(f.name || 'Unnamed ' + c.label.toLowerCase())}</h2></div>
  <div class="bd"><div class="dist" id="dist"></div>
  <dl>${rows}<dt>Coordinates</dt><dd>${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}</dd></dl>
  ${rows ? '' : '<p class="hint">No extra details are mapped for this feature yet. Anyone can add them on OpenStreetMap.</p>'}
  <div class="acts"><button data-a="zoom">Zoom to stop</button><button data-a="copy">Copy coordinates</button>
  <a href="https://www.openstreetmap.org/directions?route=%3B${f.lat}%2C${f.lon}" target="_blank" rel="noopener">Get directions</a>
  <a href="https://www.openstreetmap.org/${f.id}" target="_blank" rel="noopener">View on OSM</a></div>
  <h3>Nearest stops</h3><ul class="near">${near.map(({ x, d }) => `<li><button data-id="${x.id}">${badge(x.cat, 24)}${esc(x.name || CATS[x.cat].label)}<small>${fmt(d)}</small></button></li>`).join('')}</ul></div>`;
  el.scrollTop = 0; fillDistance(f);
}

async function fillDistance(f) {
  const box = $('#dist'); if (!box) return;
  if (!me) { box.innerHTML = 'Distance from your current location is not known yet.<br><button data-a="locate">Show distance from me</button>'; return; }
  const d = dist(me, f);
  box.innerHTML = `<b>${fmt(d)} away</b><span>in a straight line from you. Checking the road distance…</span>`;
  try {
    const r = await getRoute(me, f); if ($('#info').dataset.id !== f.id) return;
    box.innerHTML = `<b>${fmt(r.distance)} by road</b><span>About ${Math.max(1, Math.round(r.duration / 60))} min by car, ${fmt(d)} in a straight line.</span><button data-a="route">Show route on map</button>`;
  } catch { if ($('#info').dataset.id === f.id) box.innerHTML = `<b>${fmt(d)} away</b><span>in a straight line from you. The road distance is unavailable right now.</span>`; }
}
function clearRoute() { if (routeLine) { map.removeLayer(routeLine); routeLine = null; } }
function closeInfo() { $('#info').hidden = true; clearRoute(); if (pulse) { map.removeLayer(pulse); pulse = null; } }

$('#info').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.id) return select(b.dataset.id);
  const f = state.all.find(x => x.id === $('#info').dataset.id), a = b.dataset.a;
  if (a === 'close') closeInfo();
  if (!f) return;
  if (a === 'zoom') map.flyTo([f.lat, f.lon], 18, { duration: .6 });
  if (a === 'copy') navigator.clipboard?.writeText(`${f.lat.toFixed(6)}, ${f.lon.toFixed(6)}`).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy coordinates', 1500); });
  if (a === 'locate') { b.textContent = 'Finding you…'; try { await locate(); fillDistance(f); } catch (err) { b.textContent = 'Show distance from me'; showToast(err.message); } }
  if (a === 'route') { try { const r = await getRoute(me, f); clearRoute(); routeLine = L.polyline(r.coords, { color: '#2563eb', weight: 6, opacity: .85 }).addTo(map); map.flyToBounds(routeLine.getBounds().pad(.2), { duration: .8 }); } catch { showToast('The route service is not answering right now.'); } }
});

/* ---------- Search with suggestions ---------- */
const q = $('#q'), sug = $('#sug'); let active = -1;
const hl = (n, t) => { const i = n.toLowerCase().indexOf(t); return i < 0 ? esc(n) : esc(n.slice(0, i)) + '<mark>' + esc(n.slice(i, i + t.length)) + '</mark>' + esc(n.slice(i + t.length)); };
function showSug(items, term, emptyMsg) {
  sug.innerHTML = items.length ? items.map(({ f, sub }) => `<li role="option" data-id="${f.id}">${badge(f.cat, 24)}<span class="n">${term ? hl(f.name, term) : esc(f.name || CATS[f.cat].label)}</span><small>${sub}</small></li>`).join('') : `<li class="none">${emptyMsg}</li>`;
  sug.hidden = false; q.setAttribute('aria-expanded', 'true'); active = -1;
}
function hideSug() { sug.hidden = true; q.setAttribute('aria-expanded', 'false'); }
function suggest() {
  const t = q.value.trim().toLowerCase(); if (!t) return hideSug();
  const hits = state.all.filter(f => f.name && f.name.toLowerCase().includes(t))
    .sort((a, b) => (b.name.toLowerCase().startsWith(t) - a.name.toLowerCase().startsWith(t)) || a.name.localeCompare(b.name)).slice(0, 8);
  showSug(hits.map(f => ({ f, sub: CITIES[f.city].label })), t, `No stop name contains “${esc(q.value.trim())}”. Many stops are unnamed in OpenStreetMap, so try a shorter word.`);
}
const pick = id => { hideSug(); const f = state.all.find(x => x.id === id); if (f) q.value = f.name || ''; select(id); };
q.addEventListener('input', suggest); q.addEventListener('focus', suggest);
q.addEventListener('keydown', e => {
  const li = [...sug.querySelectorAll('li[data-id]')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (sug.hidden) suggest(); if (!li.length) return; active = (active + (e.key === 'ArrowDown' ? 1 : -1) + li.length) % li.length; li.forEach((x, i) => x.classList.toggle('act', i === active)); li[active].scrollIntoView({ block: 'nearest' }); }
  else if (e.key === 'Enter' && li.length) pick(li[Math.max(active, 0)].dataset.id);
  else if (e.key === 'Escape') hideSug();
});
sug.addEventListener('mousedown', e => { const li = e.target.closest('li[data-id]'); if (li) { e.preventDefault(); pick(li.dataset.id); } });
document.addEventListener('mousedown', e => { if (!e.target.closest('.search')) hideSug(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sug.hidden) closeInfo(); });

$('#near').addEventListener('click', async () => {
  try {
    const p = await locate();
    map.flyTo([p.lat, p.lon], 15, { duration: .8 });
    const n = state.all.map(f => ({ f, d: dist(p, f) })).sort((a, b) => a.d - b.d).slice(0, 6);
    if (!n.length) return showToast('No stops are loaded yet.', null, true);
    q.value = ''; q.focus(); showSug(n.map(({ f, d }) => ({ f, sub: fmt(d) + ' away' })), '', '');
    if (n[0].d > 30000) showToast('You appear to be outside the twin cities, so the nearest stops are far away.', null, true);
    const cur = state.all.find(x => x.id === $('#info').dataset.id); if (cur && !$('#info').hidden) fillDistance(cur);
  } catch (e) { showToast(e.message); }
});

/* ---------- Panel and filters ---------- */
const togglePanel = () => { const c = document.body.classList.toggle('closed'); $('#menu').setAttribute('aria-expanded', !c); };
$('#menu').addEventListener('click', togglePanel); $('#edge').addEventListener('click', togglePanel);
$('.body').addEventListener('change', e => {
  const k = e.target.dataset.k; if (!k) return;
  const set = k in CITIES ? state.cities : state.cats;
  e.target.checked ? set.add(k) : set.delete(k);
  render(); if (k in CITIES) fitVisible();
});
$('#base').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; document.querySelectorAll('#base button').forEach(x => x.classList.toggle('on', x === b)); setBase(b.dataset.b); });
$('#r-metro').addEventListener('change', e => toggleRoute('metro', e.target));
$('#r-all').addEventListener('change', e => toggleRoute('all', e.target));
if (innerWidth <= 1100) document.body.classList.add('closed');
$('#legend').addEventListener('click', e => { if (e.target.closest('h3')) $('#legend').classList.toggle('min'); });

/* ---------- Feedback ---------- */
function pill(msg) { const p = $('#pill'); p.hidden = !msg; if (msg) p.querySelector('span').textContent = msg; }
function hideToast() { $('#toast').hidden = true; }
let toastTimer;
function showToast(msg, retry, info) {
  const t = $('#toast'); t.hidden = false; t.classList.toggle('ok', !!info);
  t.innerHTML = `<span>${esc(msg)}</span><button>${retry ? 'Try again' : 'Dismiss'}</button>`;
  t.querySelector('button').onclick = () => { hideToast(); retry && retry(); };
  clearTimeout(toastTimer); if (info) toastTimer = setTimeout(hideToast, 7000);
}

loadStops();