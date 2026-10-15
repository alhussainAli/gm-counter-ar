/* Radiation–Matter Interactions AR — application. */
(function () {
'use strict';
const RP = window.RP;
const COL = { gamma: '#ffd34d', xray: '#fff2a8', e: '#4fb3ff', pos: '#e879f9', p: '#ff4d6d', alpha: '#ff8c3a', n: '#3ddc97', ion: '#eaf4ff', exc: '#a78bfa', cher: '#38e1ff', photo: '#ffffff' };
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const fE = E => RP.fmtE(E), fmt = (v, d) => (v == null || !isFinite(v)) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 });
const fLen = cm => cm >= 100 ? (cm / 100).toPrecision(3) + ' m' : cm >= 1 ? cm.toPrecision(3) + ' cm' : cm >= 0.1 ? (cm * 10).toPrecision(3) + ' mm' : cm >= 1e-4 ? (cm * 1e4).toPrecision(3) + ' µm' : (cm * 1e7).toPrecision(3) + ' nm';
const sci = v => v >= 1e5 ? v.toExponential(2).replace('e+', ' × 10^') : fmt(v);

const RAD = [
  { k: 'e', label: 'e⁻', name: 'Electron beam', col: COL.e, E: 1, min: 0.01, max: 20, presets: [[0.1, '100 keV'], [1, '1 MeV'], [6, '6 MeV (linac)'], [20, '20 MeV']] },
  { k: 'beta', label: 'β⁻', name: 'Beta source', col: COL.e },
  { k: 'p', label: 'p', name: 'Proton beam', col: COL.p, E: 100, min: 1, max: 250, presets: [[5, '5 MeV'], [50, '50 MeV'], [100, '100 MeV'], [200, '200 MeV (therapy)']] },
  { k: 'alpha', label: 'α', name: 'Alpha source', col: COL.alpha, E: 5.486, min: 1, max: 10, presets: [[4.784, 'Ra-226 4.78 MeV'], [5.304, 'Po-210 5.30 MeV'], [5.486, 'Am-241 5.49 MeV']] },
  { k: 'n', label: 'n', name: 'Neutron beam', col: COL.n, E: 2, min: 2.53e-8, max: 20, presets: [[2.53e-8, 'thermal 0.025 eV'], [1e-6, '1 eV'], [2, '2 MeV (fission)'], [4.5, '4.5 MeV (AmBe)'], [14.1, '14.1 MeV (D-T)']] },
  { k: 'gamma', label: 'γ', name: 'Gamma rays', col: COL.gamma, E: 0.662, min: 0.01, max: 10, presets: [[0.0595, 'Am-241 59.5 keV'], [0.662, 'Cs-137 662 keV'], [1.25, 'Co-60 1.25 MeV'], [2.614, 'Tl-208 2.61 MeV'], [6, '6 MeV']] },
  { k: 'xray', label: 'X', name: 'X-ray tube', col: COL.xray }
];
const MATS = ['air', 'water', 'pe', 'al', 'concrete', 'pb'];
const PROC = {
  photoelectric: ['Photoelectric absorption', COL.gamma], compton: ['Compton scattering', COL.e], rayleigh: ['Rayleigh scattering', '#9fb0b6'], pair: ['Pair production', COL.pos],
  annihilation: ['Positron annihilation', COL.pos], brems: ['Bremsstrahlung', COL.xray], delta: ['Ionization (δ-ray)', COL.e], ionization: ['Ionization', COL.ion], excitation: ['Excitation', COL.exc],
  'n-elastic': ['Neutron elastic scatter', COL.n], 'n-inelastic': ['Neutron inelastic (n,n′γ)', COL.n], 'n-capture': ['Neutron capture (n,γ)', '#ffffff'], 'n-p': ['¹⁴N(n,p)¹⁴C', COL.p],
  nuclear: ['Nuclear reaction', '#ffffff'], stop: ['Particle stops', COL.alpha], thermalized: ['Neutron thermalized', COL.n]
};
const KEY = ['photoelectric', 'compton', 'rayleigh', 'pair', 'annihilation', 'brems', 'delta', 'n-elastic', 'n-inelastic', 'n-capture', 'n-p', 'nuclear', 'stop', 'thermalized'];

const st = { view: '3d', rad: 'gamma', mat: 'water', E: Object.fromEntries(RAD.map(r => [r.k, r.E])), nuc: 'Sr-90', kVp: 80, thick: 0, speed: 1, beam: false,
  ion: true, exc: true, sec: true, cher: true, tab: 'events', last: null, lastH: null, sel: -1, filter: 'key', userScale: 1,
  tally: null };
let S3 = null, A1 = null, A2 = null, beamT = 0;

function resetTally() { st.tally = { n: 0, depth: new Float64Array(60), counts: {}, ion: 0, exc: 0, dep: 0, D: null }; }
resetTally();
function radDef() { return RAD.find(r => r.k === st.rad); }
function curE() { return st.rad === 'beta' ? RP.BETA[st.nuc].E0 : st.rad === 'xray' ? st.kVp / 1000 : st.E[st.rad]; }
function thickness() { return RP.autoThickness(st.rad, curE(), st.mat, { nuc: st.nuc, kVp: st.kVp }) * Math.pow(10, st.thick); }
function beamText() {
  const r = radDef();
  if (st.rad === 'beta') return `β⁻ from ${st.nuc}  (E max ${fE(RP.BETA[st.nuc].E0)})`;
  if (st.rad === 'xray') return `X-ray tube ${st.kVp} kVp`;
  return `${r.name}  ${fE(st.E[st.rad])}`;
}

// ================================================================ boot
window.InteractApp = { boot };
function boot(view) {
  setupUI();
  if (view === 'marker') return start('marker');
  if (view === '3d') return start('3d');
  if (navigator.xr && navigator.xr.isSessionSupported) navigator.xr.isSessionSupported('immersive-ar').then(ok => { if (ok) { $('#go-xr').hidden = false; $('#xr-note').hidden = true; } }).catch(() => {});
  $('#go-xr').onclick = () => start('xr');
  $('#go-marker').onclick = () => { location.search = '?view=marker'; };
  $('#go-3d').onclick = () => start('3d');
}
function start(view) {
  st.view = view; $('#start').hidden = true; $('#app').hidden = false;
  S3 = IS.create({ THREE: window.THREE || (window.AFRAME && AFRAME.THREE), COL });
  A1 = IA.create($('#atom-pip'), COL, RP); A2 = IA.create($('#atom-big'), COL, RP);
  applySetup();
  if (view === 'xr') hostXR(); else if (view === 'marker') hostMarker(); else host3D();
  setTab('events');
  fire();
}

// ================================================================ hosts (shared pattern with the other labs)
let renderer, camera, scene, controls, lastT = performance.now();
function frame(now) { const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; tick(dt); }
function host3D() {
  const T = THREE;
  renderer = new T.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding;
  renderer.setClearColor(0x000000, 1); $('#gl').appendChild(renderer.domElement);
  scene = new T.Scene(); scene.background = new T.Color(0x000000); scene.add(S3.root);
  camera = new T.PerspectiveCamera(42, 1, 0.5, 4000);
  controls = new T.OrbitControls(camera, $('#gest')); controls.enableDamping = true; controls.minDistance = 10; controls.maxDistance = 600;
  new ResizeObserver(resize3D).observe($('#stage')); resize3D(); fit();
  $('#b-reset').onclick = fit; $('#b-zm').onclick = () => dolly(0.75); $('#b-zo').onclick = () => dolly(1.33);
  $('#b-exit').onclick = () => { location.href = location.pathname; };
  renderer.setAnimationLoop(now => { frame(now); controls.update(); renderer.render(scene, camera); });
}
function resize3D() { const el = $('#stage'), w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
function fit() { const a = Math.min(1.5, Math.max(0.5, camera.aspect || 1)), d = 100 / a; camera.position.set(14, S3.Y0 + d * 0.32, d); controls.target.set(0, S3.Y0 - 1, 0); controls.update(); }
function dolly(f) { const t = controls.target; camera.position.sub(t).multiplyScalar(f).add(t); }
function hostXR() {
  const T = THREE; document.body.classList.add('ar', 'xr'); document.documentElement.classList.add('ar');
  renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding;
  renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local'); $('#gl').appendChild(renderer.domElement);
  scene = new T.Scene(); camera = new T.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 50);
  const anchor = new T.Group(); anchor.visible = false; scene.add(anchor); anchor.add(S3.root); S3.root.scale.setScalar(0.01);
  const reticle = new T.Mesh(new T.RingGeometry(0.05, 0.065, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xf2b33d })); reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);
  $('#trk').hidden = false; $('#trkt').textContent = 'Looking for a surface'; $('#xr-hint').hidden = false;
  let hitSrc = null, placed = false; const app = $('#app'); app.addEventListener('beforexrselect', e => e.preventDefault());
  navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local-floor'], domOverlay: { root: app } })
    .then(async session => { await renderer.xr.setSession(session); const v = await session.requestReferenceSpace('viewer'); hitSrc = await session.requestHitTestSource({ space: v }); session.addEventListener('end', () => { location.href = location.pathname; }); $('#b-exit').onclick = () => session.end(); })
    .catch(() => { location.search = '?view=3d'; });
  $('#b-place').hidden = false;
  $('#b-place').onclick = () => { if (!reticle.visible) return; reticle.matrix.decompose(anchor.position, anchor.quaternion, anchor.scale); anchor.scale.setScalar(1); const cam = renderer.xr.getCamera(camera), cp = new T.Vector3().setFromMatrixPosition(cam.matrixWorld); anchor.quaternion.identity(); anchor.rotation.y = Math.atan2(cp.x - anchor.position.x, cp.z - anchor.position.z); anchor.visible = true; placed = true; $('#xr-hint').hidden = true; $('#b-place').textContent = 'Move here'; };
  window.applyARScale = () => S3.root.scale.setScalar(0.01 * st.userScale);
  scaleButtons(); gestures();
  renderer.setAnimationLoop((now, f) => { frame(now); if (f && hitSrc) { const r = f.getHitTestResults(hitSrc); if (r.length) { reticle.visible = true; reticle.matrix.fromArray(r[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix); $('#trk').classList.add('ok'); $('#trkt').textContent = placed ? 'Placed' : 'Surface found'; } else reticle.visible = false; } renderer.render(scene, camera); });
}
function hostMarker() {
  document.body.classList.add('ar', 'marker'); document.documentElement.classList.add('ar');
  AFRAME.registerComponent('rm-tick', { tick(t, dt) { tick(Math.min(0.1, (dt || 16) / 1000)); } });
  const w = document.createElement('div');
  w.innerHTML = `<a-scene embedded rm-tick vr-mode-ui="enabled:false" renderer="logarithmicDepthBuffer:true;antialias:true;alpha:true;colorManagement:true" arjs="sourceType:webcam;debugUIEnabled:false;detectionMode:mono_and_matrix;matrixCodeType:3x3;">
    <a-marker preset="hiro" smooth="true" smoothCount="8" smoothTolerance="0.01" smoothThreshold="2" emitevents="true" id="mk"><a-entity id="anchor"></a-entity></a-marker><a-entity camera></a-entity></a-scene>`;
  document.body.insertBefore(w.firstElementChild, document.body.firstChild);
  const mk = $('#mk'), an = $('#anchor'), attach = () => { an.object3D.add(S3.root); window.applyARScale(); };
  window.applyARScale = () => S3.root.scale.setScalar(st.userScale / 80);
  if (an.hasLoaded) attach(); else an.addEventListener('loaded', attach);
  $('#trk').hidden = false; $('#trkt').textContent = 'Point at the marker';
  mk.addEventListener('markerFound', () => { $('#trk').classList.add('ok'); $('#trkt').textContent = 'Marker locked'; });
  mk.addEventListener('markerLost', () => { $('#trk').classList.remove('ok'); $('#trkt').textContent = 'Point at the marker'; });
  $('#b-exit').onclick = () => { location.href = location.pathname; };
  scaleButtons(); gestures();
}
function scaleButtons() { $('#b-reset').onclick = () => { st.userScale = 1; window.applyARScale(); S3.root.rotation.y = 0; }; $('#b-zm').onclick = () => { st.userScale *= 1.4; window.applyARScale(); }; $('#b-zo').onclick = () => { st.userScale /= 1.4; window.applyARScale(); }; }
function gestures() {
  const el = $('#gest'); let p = null, d0 = 0, s0 = 1; const d2 = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  el.addEventListener('touchstart', e => { if (e.touches.length === 1) p = e.touches[0].clientX; else if (e.touches.length === 2) { d0 = d2(e.touches); s0 = st.userScale; } }, { passive: true });
  el.addEventListener('touchmove', e => { if (e.touches.length === 1 && p != null) { const x = e.touches[0].clientX; S3.root.rotation.y += (x - p) * 0.01; p = x; } else if (e.touches.length === 2 && d0) { st.userScale = Math.max(0.2, Math.min(15, s0 * d2(e.touches) / d0)); window.applyARScale(); } }, { passive: true });
  el.addEventListener('touchend', () => { p = null; d0 = 0; });
}

// ================================================================ loop & firing
function tick(dt) {
  if (!S3) return;
  if (st.beam) { beamT += dt; const period = 1.1 / st.speed; if (beamT > period) { beamT = 0; fire(true); } }
  S3.update(dt, camera);
}
function fire(fromBeam) {
  const D = thickness(), H = D * S3.SH / S3.SL;
  const h = RP.simulate({ type: st.rad, E: st.E[st.rad], nuc: st.nuc, kVp: st.kVp, mat: st.mat, D, H, dotsTarget: st.beam ? 600 : 1300 });
  const Hh = S3.addHistory(h, { ion: st.ion, exc: st.exc, cher: st.cher, secondaries: st.sec, speed: st.speed, keep: st.beam ? 7 : 3 });
  st.last = h; st.lastH = Hh;
  const T = st.tally; if (T.D !== D) { resetTally(); st.tally.D = D; }
  const t = st.tally; t.n++; for (let i = 0; i < 60; i++) t.depth[i] += h.depth[i]; for (const k in h.counts) t.counts[k] = (t.counts[k] || 0) + h.counts[k]; t.ion += h.nIon; t.exc += h.nExc; t.dep += h.ledger.dep;
  renderSummary(); renderEvents(); if (st.tab === 'dose') renderDose();
  const first = h.events.find(e => !e.rep && e.proc !== 'stop') || h.events[0];
  if (!first) { const how = h.tracks[0] && h.tracks[0].end; const m = how === 'transmitted' ? 'This particle crossed the slab\nwithout interacting. Fire again.' : 'No interaction in this history.\nFire again.'; A1.set(null, m); A2.set(null, m); st.sel = -1; return; }
  if (!fromBeam || !A1.event) selectEvent(first.id);
}

// ================================================================ UI
function setupUI() {
  const rad = $('#rad'); rad.innerHTML = RAD.map(r => `<button type="button" data-v="${r.k}" title="${r.name}"><i style="background:${r.col}"></i>${r.label} <span class="muted sm">${r.name.split(' ')[0]}</span></button>`).join('');
  rad.onclick = e => { const b = e.target.closest('button'); if (!b) return; st.rad = b.dataset.v; applySetup(true); };
  const mat = $('#mat'); mat.innerHTML = MATS.map(k => `<button type="button" data-v="${k}"><i class="sq" style="background:${RP.MAT[k].color}"></i>${RP.MAT[k].name}</button>`).join('');
  mat.onclick = e => { const b = e.target.closest('button'); if (!b) return; st.mat = b.dataset.v; applySetup(true); };
  $('#fire').onclick = () => fire();
  $('#beam').onclick = e => { st.beam = !st.beam; e.currentTarget.setAttribute('aria-pressed', st.beam); e.currentTarget.textContent = st.beam ? 'Stop beam' : 'Beam'; beamT = 99; };
  $('#clear').onclick = () => { S3.clear(); resetTally(); renderDose(); };
  $('#speed').oninput = e => { st.speed = +e.target.value; for (const H of S3.histories) H.speed = st.speed; };
  $('#thick').oninput = e => { st.thick = +e.target.value; applySetup(true); };
  for (const [id, k] of [['#t-ion', 'ion'], ['#t-exc', 'exc'], ['#t-sec', 'sec'], ['#t-cher', 'cher']]) $(id).onchange = e => { st[k] = e.target.checked; };
  $$('.tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  $('#fold').onclick = () => { document.body.classList.toggle('folded'); $('#fold').textContent = document.body.classList.contains('folded') ? 'Show panel' : 'Hide panel'; };
  $('#b-lab').onclick = e => { const v = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', v); S3.setLabelsVisible(v); };
  $('#b-pip').onclick = e => { const v = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', v); $('#pip').hidden = !v; if (v) A1.resize(); };
  $('#a-prev').onclick = () => stepEvent(-1); $('#a-next').onclick = () => stepEvent(1);
  $('#a-filter').onchange = e => { st.filter = e.target.value; renderEvents(); };
  $('#d-reset').onclick = () => { resetTally(); renderDose(); };
  $('#legend').innerHTML = [['γ ray', COL.gamma], ['x-ray', COL.xray], ['electron / β⁻', COL.e], ['positron', COL.pos], ['proton', COL.p], ['alpha', COL.alpha], ['neutron (dashed)', COL.n], ['ionization', COL.ion], ['excitation', COL.exc], ['Cherenkov light', COL.cher]].map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('');
  renderAbout();
}
function applySetup(fireNew) {
  $$('#rad button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === st.rad)));
  $$('#mat button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === st.mat)));
  renderEnergy();
  if (S3) { S3.clear(); S3.setMaterial(RP.MAT[st.mat], thickness(), beamText(), radDef().col); resetTally(); }
  renderData(); renderDose();
  if (fireNew && S3) fire();
}
function renderEnergy() {
  const r = radDef(), box = $('#energy-ctl');
  if (st.rad === 'beta') {
    box.innerHTML = `<div class="fld"><span>Beta emitter (continuous spectrum)</span></div><div class="presets">${Object.entries(RP.BETA).map(([n, b]) => `<button type="button" data-n="${n}" aria-pressed="${n === st.nuc}">${n} · E<sub>max</sub> ${fE(b.E0)}</button>`).join('')}</div>`;
    box.querySelectorAll('button').forEach(b => b.onclick = () => { st.nuc = b.dataset.n; applySetup(true); });
  } else if (st.rad === 'xray') {
    box.innerHTML = `<div class="fld"><span>Tube voltage (tungsten anode, 2.5 mm Al filter)</span></div><div class="erow"><input type="range" id="kvp" min="20" max="150" step="1" value="${st.kVp}"><em>${st.kVp} kVp</em></div>`;
    $('#kvp').oninput = e => { st.kVp = +e.target.value; box.querySelector('em').textContent = st.kVp + ' kVp'; };
    $('#kvp').onchange = () => applySetup(true);
  } else {
    const lo = Math.log10(r.min), hi = Math.log10(r.max), v = Math.log10(st.E[st.rad]);
    box.innerHTML = `<div class="fld"><span>Energy</span></div><div class="erow"><input type="range" id="en" min="${lo}" max="${hi}" step="0.01" value="${v}"><em id="en-v">${fE(st.E[st.rad])}</em></div><div class="presets">${r.presets.map(([E, n]) => `<button type="button" data-e="${E}">${n}</button>`).join('')}</div>`;
    $('#en').oninput = e => { st.E[st.rad] = Math.pow(10, +e.target.value); $('#en-v').textContent = fE(st.E[st.rad]); };
    $('#en').onchange = () => applySetup(true);
    box.querySelectorAll('.presets button').forEach(b => b.onclick = () => { st.E[st.rad] = +b.dataset.e; applySetup(true); });
  }
}
function setTab(t) {
  st.tab = t; $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t))); $$('.tab').forEach(d => { d.hidden = d.id !== 'tab-' + t; });
  if (t === 'atom') { A2.resize(); renderAtomText(); } if (t === 'dose') renderDose(); if (t === 'data') renderData();
}

// ---------------------------------------------------------------- events
function evLabel(e) {
  const p = PROC[e.proc] || [e.proc, '#fff'];
  let d = '';
  switch (e.proc) {
    case 'photoelectric': d = `${e.el} ${e.shell}-shell · γ ${fE(e.Ein)} → e⁻ ${fE(e.T)}`; break;
    case 'compton': d = `${e.el} · ${fE(e.Ein)} → ${fE(e.Eout)} at ${e.angle.toFixed(0)}°, e⁻ ${fE(e.T)}`; break;
    case 'rayleigh': d = `${e.el} · ${fE(e.Ein)}, ${e.angle.toFixed(0)}°, no energy lost`; break;
    case 'pair': d = `${e.el} nucleus · e⁻ ${fE(e.Te)} + e⁺ ${fE(e.Tp)}`; break;
    case 'annihilation': d = '2 × 511 keV'; break;
    case 'brems': d = `${e.el} nucleus · x-ray ${fE(e.k)}`; break;
    case 'delta': case 'ionization': d = `${e.el} ${e.shell}-shell · e⁻ ${fE(e.T)}${e.rep ? ' · sample' : ''}`; break;
    case 'excitation': d = `${e.el} outer electron · ${fE(e.dE)}${e.rep ? ' · sample' : ''}`; break;
    case 'n-elastic': d = `${e.el} · ${fE(e.Ein)} → ${fE(e.Eout)}, recoil ${fE(e.Er)}`; break;
    case 'n-inelastic': d = `${e.el} · γ ${fE(e.lev)}`; break;
    case 'n-capture': d = `${e.el} · γ ${e.gammas.map(g => g.toFixed(2)).join(' + ')} MeV`; break;
    default: d = e.el || '';
  }
  return { name: p[0], col: p[1], d };
}
function filtered() {
  const h = st.last; if (!h) return [];
  if (st.filter === 'key') { // key interactions first (in time order), then a few sampled ionizations and excitations
    const key = h.events.filter(e => KEY.includes(e.proc)).sort((a, b) => a.t - b.t);
    const ion = h.events.filter(e => e.proc === 'ionization').slice(0, 12), exc = h.events.filter(e => e.proc === 'excitation').slice(0, 8);
    return key.concat(ion, exc);
  }
  return h.events.filter(e => st.filter === 'all' ? true : st.filter === 'ion' ? (e.proc === 'ionization' || e.proc === 'delta') : e.proc === 'excitation').sort((a, b) => a.t - b.t);
}
function renderEvents() {
  const list = filtered(), box = $('#evlist');
  if (!list.length) { box.innerHTML = '<p class="muted">No interactions of this kind in this history.</p>'; return; }
  box.innerHTML = list.slice(0, 160).map(e => { const l = evLabel(e); return `<button type="button" data-id="${e.id}" aria-pressed="${e.id === st.sel}"><i style="background:${l.col}"></i><span><b>${l.name}</b> · ${l.d}</span><small>${(e.p[0] / st.last.D * 100).toFixed(0)}% deep</small></button>`; }).join('') + (list.length > 160 ? `<p class="muted sm">+ ${list.length - 160} more</p>` : '');
  box.querySelectorAll('button').forEach(b => b.onclick = () => selectEvent(+b.dataset.id));
}
function selectEvent(id) {
  st.sel = id; const h = st.last; const e = h && h.events.find(x => x.id === id);
  A1.set(e || null); A2.set(e || null); S3.markEvent(e ? st.lastH : null, e);
  $$('#evlist button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.id === id)));
  renderAtomText();
}
function stepEvent(dir) { const l = filtered(); if (!l.length) return; let i = l.findIndex(e => e.id === st.sel); i = (i + dir + l.length) % l.length; selectEvent(l[i].id); }
function renderAtomText() {
  const e = A2 && A2.event; if (!e) return;
  const l = evLabel(e), el = RP.EL[e.el] || {};
  $('#a-title').textContent = l.name; $('#a-desc').textContent = e.desc || '';
  const kv = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
  let h = kv('Atom', `${e.el} (Z = ${el.Z})`);
  if (e.shell) h += kv('Shell', e.shell); if (e.B != null) h += kv('Binding energy', fE(e.B));
  if (e.Ein != null) h += kv('Incoming energy', fE(e.Ein)); if (e.T != null) h += kv('Electron kinetic energy', fE(e.T)); if (e.Eout != null) h += kv('Outgoing energy', fE(e.Eout));
  if (e.angle != null) h += kv('Scattering angle', e.angle.toFixed(1) + '°'); if (e.k != null) h += kv('Photon emitted', fE(e.k));
  h += kv('Depth in slab', fLen(e.p[0]));
  $('#a-kv').innerHTML = h;
  let r = '';
  if (e.relax && e.relax.steps.length) r = e.relax.steps.map(s => s.kind === 'fluor' ? `The ${e.relax.shell} vacancy is filled by an outer electron, emitting a <b>${s.line} fluorescence x-ray of ${fE(s.E)}</b> (fluorescence yield ω<sub>K</sub> = ${el.wK}).` : `The ${e.relax.shell} vacancy is filled and the released energy ejects a second electron: a <b>${s.line} Auger electron of ${fE(s.E)}</b>. The atom is now doubly ionized.`).join('<br>');
  else if (['ionization', 'delta'].includes(e.proc) && e.shell && (e.shell === 'K' || (e.el === 'Pb' && e.shell.startsWith('L')))) r = `An inner-shell vacancy relaxes by x-ray fluorescence (probability ω<sub>K</sub> = ${el.wK}) or by Auger emission (${(100 * (1 - el.wK)).toFixed(1)}%). Light atoms almost always give Auger electrons; lead mostly gives x-rays.`;
  else if (['ionization', 'delta', 'compton'].includes(e.proc)) r = 'An outer-shell vacancy is filled with little energy released. The positive ion may recombine, or (in water) break up and form reactive radicals such as OH· that cause most biological damage.';
  else if (e.proc === 'excitation') r = 'The excited atom or molecule returns to its ground state within nanoseconds, emitting light (the basis of scintillators) or turning the energy into heat. Excited molecules can also break apart.';
  else if (e.proc === 'n-capture') r = 'The new nucleus is often radioactive: neutron activation (for example Al-28, Na-24).';
  else if (e.proc === 'pair') r = 'The positron slows down by ionization, then annihilates with an electron, producing two 511 keV photons.';
  else r = 'No change in electron shells.';
  $('#a-relax').innerHTML = r;
}
function renderSummary() {
  const h = st.last, kv = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
  const tr = h.tracks.filter(t => t.gen > 0);
  $('#hsum').innerHTML = kv('Primary', st.rad === 'beta' ? `β⁻ ${fE(h.E0)} (from ${st.nuc})` : st.rad === 'xray' ? `x-ray ${fE(h.E0)} (${st.kVp} kVp)` : `${radDef().name.split(' ')[0]} ${fE(h.E0)}`) +
    kv('Slab', `${RP.MAT[st.mat].name}, ${fLen(h.D)}`) + kv('Energy deposited', fE(h.ledger.dep)) + kv('Energy escaping', fE(h.ledger.esc)) +
    kv('Ionizations', '≈ ' + sci(Math.round(h.nIon))) + kv('Excitations', '≈ ' + sci(Math.round(h.nExc))) + kv('Secondary particles', fmt(tr.length)) +
    kv('Each white dot', `≈ ${sci(Math.round(h.rep))} ion pairs`) + kv('Energy check', Math.abs(h.ledger.balance) < 1e-6 ? 'balanced ✓' : fE(h.ledger.balance));
}
// ---------------------------------------------------------------- depth dose
function renderDose() {
  const t = st.tally, cv = $('#cv-dose');
  const hpx = +(cv.getAttribute('height')); cv.style.height = hpx + 'px'; const w = cv.clientWidth || 300, dpr = Math.min(2, devicePixelRatio || 1); cv.width = w * dpr; cv.height = hpx * dpr;
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, hpx);
  const L = 48, Rm = 10, T = 10, B = 28, D = t.D || thickness();
  $('#d-n').textContent = `${t.n} histor${t.n === 1 ? 'y' : 'ies'}`;
  x.font = '11px "IBM Plex Mono", monospace'; x.fillStyle = '#8fa09b';
  if (!t.n) { x.textAlign = 'center'; x.fillText('Fire particles to build the curve', w / 2, hpx / 2); }
  else {
    const per = Array.from(t.depth, v => v / t.n / (D / 60)), mx = Math.max(...per) * 1.1 || 1;
    const X = i => L + i / 60 * (w - L - Rm), Y = v => hpx - B - v / mx * (hpx - B - T);
    x.strokeStyle = '#1f2a2e'; for (let k = 0; k <= 4; k++) { const yy = T + k * (hpx - B - T) / 4; x.beginPath(); x.moveTo(L, yy); x.lineTo(w - Rm, yy); x.stroke(); x.textAlign = 'right'; x.fillText((mx * (1 - k / 4)).toPrecision(2), L - 4, yy + 4); }
    x.fillStyle = RP.MAT[st.mat].color + '55'; x.strokeStyle = radDef().col; x.lineWidth = 2; x.beginPath(); x.moveTo(X(0), Y(0));
    per.forEach((v, i) => { x.lineTo(X(i), Y(v)); x.lineTo(X(i + 1), Y(v)); }); x.lineTo(X(60), Y(0)); x.closePath(); x.fill(); x.stroke(); x.lineWidth = 1;
    x.fillStyle = '#8fa09b'; x.textAlign = 'center'; for (let k = 0; k <= 4; k++) x.fillText(fLen(D * k / 4), X(k * 15), hpx - B + 14);
    x.textAlign = 'right'; x.fillText('depth', w - Rm, hpx - 4);
    x.save(); x.translate(10, (T + hpx - B) / 2); x.rotate(-Math.PI / 2); x.textAlign = 'center'; x.fillText('MeV per cm per particle', 0, 0); x.restore();
  }
  const hint = { p: 'Protons lose energy slowly at first, then fastest just before they stop: the Bragg peak.', alpha: 'Alphas deposit everything in a very short, dense track ending in a Bragg peak.', e: 'Electrons scatter a lot, so dose builds up, then falls off well before the maximum range.', beta: 'Beta particles have a spread of energies, so the dose falls off gradually.', gamma: 'Photons are removed exponentially; the dose comes from the electrons they set in motion.', xray: 'Low-energy photons are absorbed near the surface (beam hardening).', n: 'Neutrons deposit energy through recoils (mostly protons in hydrogen-rich materials) and capture γ rays.' }[st.rad];
  $('#d-hint').textContent = hint;
  const kv = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`, m = RP.MAT[st.mat];
  $('#d-ion').innerHTML = t.n ? kv('Ionizations per particle', '≈ ' + sci(Math.round(t.ion / t.n))) + kv('Excitations per particle', '≈ ' + sci(Math.round(t.exc / t.n))) + kv('Mean energy per ion pair, W', m.W + ' eV' + (st.mat === 'air' ? ' (ICRU)' : ' (approx.)')) + kv('Excitations per ionization', m.ex.toFixed(2) + ' (approx.)') + kv('Energy deposited per particle', fE(t.dep / t.n)) : '<p class="muted">No data yet.</p>';
  $('#d-counts').innerHTML = Object.entries(t.counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div><span>${k}</span><b>${fmt(v)}</b></div>`).join('') || '<p class="muted">No data yet.</p>';
}
// ---------------------------------------------------------------- physics data
function renderData() {
  const E = st.rad === 'xray' ? st.kVp / 1000 * 0.45 : st.rad === 'beta' ? RP.BETA[st.nuc].E0 / 3 : st.E[st.rad];
  const o = RP.info(st.rad, E, st.mat, {}), m = RP.MAT[st.mat], kv = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
  $('#p-title').textContent = `${radDef().name} in ${m.name} at ${fE(E)}${st.rad === 'xray' ? ' (mean energy)' : st.rad === 'beta' ? ' (≈ mean β energy)' : ''}`;
  let h = kv('Density', m.rho + ' g/cm³');
  if (o.mu != null) h += kv('μ/ρ', o.muRho.toPrecision(4) + ' cm²/g') + kv('μ', o.mu.toPrecision(4) + ' /cm') + kv('Mean free path', fLen(o.mfp)) + kv('Half-value layer', fLen(o.hvl));
  else if (o.Sigma != null) h += kv('Σ total', o.Sigma.toPrecision(3) + ' /cm') + kv('Mean free path', fLen(o.mfp));
  else { h += kv('Collision stopping power', o.Scol.toPrecision(4) + ' MeV cm²/g') + kv('LET (unrestricted)', o.LET.toPrecision(3) + ' keV/µm') + kv('CSDA range', fLen(o.csda) + ` (${o.csdaG.toPrecision(3)} g/cm²)`); if (o.Srad) h += kv('Radiative stopping power', o.Srad.toPrecision(3) + ' MeV cm²/g'); if (o.cherThr != null) h += kv('Cherenkov threshold', fE(o.cherThr) + (o.cher ? ' · emitting' : '')); }
  h += kv('Ionizations per MeV deposited', '≈ ' + sci(Math.round(1e6 / m.W)));
  $('#p-kv').innerHTML = h;
  $('#p-bars').innerHTML = Object.entries(o.frac || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="bar"><span>${k}</span><span class="tr"><i style="width:${(v * 100).toFixed(1)}%"></i></span><em>${(v * 100).toFixed(1)}%</em></div>`).join('');
  $('#p-note').textContent = st.rad === 'gamma' || st.rad === 'xray' ? 'Shares of the total attenuation coefficient. NIST totals; Compton from Klein–Nishina; pair and Rayleigh approximate.' : st.rad === 'n' ? 'Shares of the total macroscopic cross section (approximate analytic fits, resonances omitted).' : 'Charged particles lose energy continuously through millions of ionizations and excitations.';
  drawSpec();
}
function drawSpec() {
  const cv = $('#cv-spec'), hpx = +(cv.getAttribute('height')); cv.style.height = hpx + 'px'; const w = cv.clientWidth || 300, dpr = Math.min(2, devicePixelRatio || 1); cv.width = w * dpr; cv.height = hpx * dpr;
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, hpx); x.font = '11px "IBM Plex Mono", monospace';
  const L = 14, Rm = 10, T = 10, B = 26;
  let f, E0;
  if (st.rad === 'beta') { E0 = RP.BETA[st.nuc].E0; f = RP.betaShape(st.nuc); $('#p-spec-t').textContent = `β⁻ spectrum of ${st.nuc} (allowed shape with Fermi function)`; }
  else if (st.rad === 'xray') { E0 = st.kVp / 1000; f = RP.xraySpectrum(st.kVp); $('#p-spec-t').textContent = `X-ray tube spectrum, ${st.kVp} kVp (Kramers + W K lines)`; }
  else { $('#p-spec-t').textContent = 'Source spectrum: monoenergetic'; E0 = st.E[st.rad] * 1.25; f = null; }
  const X = E => L + E / E0 * (w - L - Rm);
  x.strokeStyle = '#1f2a2e'; x.beginPath(); x.moveTo(L, hpx - B); x.lineTo(w - Rm, hpx - B); x.stroke();
  x.fillStyle = '#8fa09b'; x.textAlign = 'center'; for (let k = 0; k <= 4; k++) x.fillText(fE(E0 * k / 4), X(E0 * k / 4), hpx - B + 14);
  if (f) {
    const pts = []; let mx = 0; for (let i = 1; i < 200; i++) { const E = E0 * i / 200, v = f(E); pts.push([E, v]); mx = Math.max(mx, v); }
    x.strokeStyle = radDef().col; x.lineWidth = 2; x.beginPath(); pts.forEach(([E, v], i) => { const yy = hpx - B - v / mx * (hpx - B - T); i ? x.lineTo(X(E), yy) : x.moveTo(X(E), yy); }); x.stroke();
    if (st.rad === 'xray' && st.kVp > 69.5) [[0.0593, 0.8], [0.058, 0.5], [0.0672, 0.3]].forEach(([E, a]) => { x.strokeStyle = COL.xray; x.beginPath(); x.moveTo(X(E), hpx - B); x.lineTo(X(E), hpx - B - a * (hpx - B - T)); x.stroke(); });
    x.lineWidth = 1;
  } else { const E = st.E[st.rad]; x.strokeStyle = radDef().col; x.lineWidth = 3; x.beginPath(); x.moveTo(X(E), hpx - B); x.lineTo(X(E), T); x.stroke(); x.lineWidth = 1; }
}
function renderAbout() {
  $('#about').innerHTML = `
  <h3>What you are seeing</h3>
  <p>Each shot is one Monte Carlo history: the primary particle and every secondary it creates, followed through the slab. The same history drives the 3D tracks, the dots, the interaction list, the atomic close-ups and the tallies.</p>
  <ul>
    <li><b>White dots</b> mark ionizations; <b>violet dots</b> mark excitations. Each dot stands for many real events (the number is shown per history). Their count comes from the energy lost divided by W, the mean energy per ion pair.</li>
    <li><b>Atomic close-up</b>: shells are drawn Bohr-style, not to scale. Binding energies, x-ray lines and Auger energies are real values for that element.</li>
    <li>Time is slowed by roughly 10⁹ and speeds are only qualitative (heavier, slower particles move more slowly on screen).</li>
    <li>The slab thickness is set automatically so the interesting part fits the stage; the true thickness is shown under the slab and can be changed.</li>
  </ul>
  <h3>Physics included</h3>
  <ul>
    <li><b>Photons (γ, x-ray):</b> photoelectric absorption with shell selection, K/L fluorescence or Auger emission; Compton (Klein–Nishina); Rayleigh; pair production with positron annihilation. NIST total attenuation coefficients.</li>
    <li><b>Electrons and β⁻:</b> condensed-history transport with ICRU-37 collision stopping power and density effect, Highland multiple scattering, discrete δ-rays (above a visibility cut), bremsstrahlung photons, Cherenkov light above threshold (water, polyethylene, air at very high energy). Beta spectra use the allowed shape with a Fermi function.</li>
    <li><b>Protons and alphas:</b> Bethe–Bloch above 2.5 MeV; tabulated water values (after ICRU 49) scaled to each material below; alpha effective charge fitted so ranges match Geiger's rule in air and Bragg–Kleeman scaling in water. δ-rays, straggling, multiple scattering, proton nuclear reactions (simplified).</li>
    <li><b>Neutrons:</b> elastic scattering (n–p cross-section fit; recoil protons tracked), slowing down and thermalization, radiative capture with element-specific γ rays, ¹⁴N(n,p), inelastic scattering in Pb, Al, Si, C, O. Analytic cross-section fits, resonances omitted.</li>
  </ul>
  <h3>Approximations</h3>
  <ul>
    <li>W values and excitation-to-ionization ratios for condensed materials are illustrative; only air (33.97 eV) is a standard value.</li>
    <li>Rayleigh and pair coefficients are approximate; the photoelectric part is the remainder of the NIST total.</li>
    <li>Electron transport uses the continuous-slowing-down picture with visible δ-rays only above a cut that scales with the slab size.</li>
    <li>No molecular chemistry, no ion recombination, no channeling, no nuclear reactions for alphas, no photonuclear reactions.</li>
  </ul>
  <h3>Data sources</h3>
  <ul>
    <li>NIST X-ray mass attenuation coefficients, material compositions, densities and I-values: <a href="https://physics.nist.gov/PhysRefData/XrayMassCoef/" target="_blank" rel="noopener">physics.nist.gov</a></li>
    <li>Electron binding energies and x-ray lines: X-ray Data Booklet, LBNL, <a href="https://xdb.lbl.gov/" target="_blank" rel="noopener">xdb.lbl.gov</a>. Fluorescence yields: M. O. Krause, J. Phys. Chem. Ref. Data 8 (1979) 307.</li>
    <li>Stopping powers: ICRU Reports 37 and 49; NIST ESTAR/PSTAR/ASTAR. Radiation lengths and density-effect parameters: Particle Data Group.</li>
    <li>G. F. Knoll, Radiation Detection and Measurement (4th ed.); F. H. Attix, Introduction to Radiological Physics and Radiation Dosimetry.</li>
  </ul>`;
}
})();
