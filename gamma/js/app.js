/* Gamma Spectroscopy AR — application: UI, modes, rendering hosts (3D, WebXR, marker). */
(function () {
'use strict';
const GP = window.GP;
const COL = { gamma: '#ffd34d', scatter: '#ff9f43', annih: '#ff5fd2', xray: '#fff1a8', electron: '#4f9dff', hole: '#ff5b5b',
  light: '#b49bff', analog: '#3ddc97', digital: '#22e3f0', shaped: '#e9eef0', hpge: '#8ab4f8', nai: '#f0a875', photo: '#ffffff', amber: '#f2b33d',
  grid: '#1f2a2e', axis: '#8fa09b', text: '#c9d3d0' };
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const fmt = (v, d) => (v == null || !isFinite(v)) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
const DET_NAME = { hpge: 'HPGe', nai: 'NaI(Tl)' };

// ================================================================ state
const DEF = { hpge: GP.cloneDet(GP.DETECTORS.hpge), nai: GP.cloneDet(GP.DETECTORS.nai) };
const dets = { hpge: GP.cloneDet(DEF.hpge), nai: GP.cloneDet(DEF.nai) };
const cfg = Object.assign({}, GP.CONFIG);
const st = {
  view: '3d', mode: 'follow', layout: 'hpge', tab: 'chain',
  sources: [
    { name: 'Cs-137', on: true, kBq: 37 }, { name: 'Co-60', on: false, kBq: 37 }, { name: 'Na-22', on: false, kBq: 37 },
    { name: 'Am-241', on: false, kBq: 37 }, { name: 'Ba-133', on: false, kBq: 37 }, { name: 'Two-line test', on: false, kBq: 37 }],
  two: { c: 662, d: 4 }, dist: 10, bkg: 0.3, acqTime: 300, speed: 10,
  running: false, scale: 'lin', lay: 'over', norm: false, marks: true, zoom: [0, 3000], peaks: null, sel: null,
  hl: null, resWhat: 'fwhm', resE: 662,
  f: { det: 'hpge', lineE: 661.655, scen: 'full', ev: null, q: null, wf: null, stage: -1, auto: false, counted: false, wz: 'all', stageT: 0 },
  userScale: 1
};
const acq = { hpge: new GP.Acquisition(dets.hpge), nai: new GP.Acquisition(dets.nai) };
const ref = { hpge: null, nai: null, dirty: true };   // reference spectra for "Follow one photon"
let S3 = null;                                       // scene API
let budget = 2500, animAcc = { hpge: 0, nai: 0 };

function srcOpts() { return { twoCentre: st.two.c, twoSep: st.two.d }; }
function activeSources() { return st.sources.filter(s => s.on); }
function activeDets() { return st.layout === 'both' ? ['hpge', 'nai'] : [st.layout]; }
function rateFor(k) { return GP.rates(dets[k], st.sources, st.dist, st.bkg, srcOpts()); }

// ================================================================ boot
const App = window.GammaApp = { boot };
function boot(view) {
  st.view = view || null;
  setupStatic();
  if (view === 'marker') { start('marker'); return; }
  if (view === '3d') { start('3d'); return; }
  if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-ar').then(ok => { if (ok) { $('#go-xr').hidden = false; $('#xr-note').hidden = true; } }).catch(() => {});
  }
  $('#go-xr').onclick = () => start('xr');
  $('#go-marker').onclick = () => { location.search = '?view=marker'; };
  $('#go-3d').onclick = () => start('3d');
}
function start(view) {
  st.view = view;
  $('#start').hidden = true; $('#app').hidden = false;
  S3 = GS.create({ THREE: window.THREE || (window.AFRAME && AFRAME.THREE), GP, COL });
  S3.build(dets);
  S3.setLayout(st.layout, st.dist);
  S3.setSource(activeSources().map(s => s.name).join(' + ') || 'No');
  if (view === 'xr') hostXR(); else if (view === 'marker') hostMarker(); else host3D();
  syncAll();
  emitPhoton();
}

// ================================================================ 3D / AR hosts
let renderer, camera, scene, controls, lastT = performance.now();
function frame(now) { const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; tick(dt); }
function host3D() {
  const T = THREE, gl = $('#gl');
  renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding;
  gl.appendChild(renderer.domElement);
  scene = new T.Scene(); scene.add(S3.root);
  camera = new T.PerspectiveCamera(42, 1, 0.5, 3000);
  controls = new T.OrbitControls(camera, $('#gest'));
  controls.enableDamping = true; controls.dampingFactor = 0.1; controls.minDistance = 8; controls.maxDistance = 600;
  const ro = new ResizeObserver(resize3D); ro.observe($('#stage'));
  resize3D(); fitCamera();
  $('#b-reset').onclick = () => { st.autoCam = true; st.closeUp = null; autoCamera(); if (!st.closeUp) fitCamera(); };
  controls.addEventListener('start', () => { camAnim = null; });
  $('#b-zm').onclick = () => dolly(0.75); $('#b-zo').onclick = () => dolly(1.33);
  $('#b-exit').onclick = () => { location.href = location.pathname; };
  st.autoCam = true;
  renderer.setAnimationLoop(now => { frame(now); stepCam(Math.min(0.1, (now - (camera._t || now)) / 1000)); camera._t = now; controls.update(); renderer.render(scene, camera); });
}
function resize3D() {
  const el = $('#stage'), w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
function overviewPose() {
  const e = S3.extent || { w: 80 }, w = Math.max(50, e.w);
  const d = w * 1.25 / Math.min(1.4, camera.aspect || 1);
  return { tgt: new THREE.Vector3(0, S3.AXIS_Y * 0.62, 0), pos: new THREE.Vector3(w * 0.12, S3.AXIS_Y * 0.62 + d * 0.38, d * 0.93) };
}
function closePose(k) {
  const c = S3.crystalCenter(k), sgn = (st.layout === 'both' && k === 'hpge') ? -1 : 1;
  const d = 30 / Math.min(1.2, Math.max(0.55, camera.aspect || 1));
  return { tgt: c.clone().add(new THREE.Vector3(-2.5 * sgn, 0.5, 0)), pos: c.clone().add(new THREE.Vector3(-7 * sgn, d * 0.4, d)) };
}
let camAnim = null;
function flyTo(pose, instant) { if (!camera || st.view !== '3d') return; if (instant) { camera.position.copy(pose.pos); controls.target.copy(pose.tgt); controls.update(); camAnim = null; return; } camAnim = { p0: camera.position.clone(), t0: controls.target.clone(), pose, u: 0 }; }
function stepCam(dt) { if (!camAnim) return; camAnim.u = Math.min(1, camAnim.u + dt / 1.1); const e = 0.5 - 0.5 * Math.cos(Math.PI * camAnim.u); camera.position.lerpVectors(camAnim.p0, camAnim.pose.pos, e); controls.target.lerpVectors(camAnim.t0, camAnim.pose.tgt, e); if (camAnim.u >= 1) camAnim = null; }
function fitCamera() { flyTo(overviewPose(), !camera._fitted); camera._fitted = true; st.closeUp = false; }
function autoCamera() { // follow mode: close-up on the crystal for interaction and signal steps
  if (st.view !== '3d' || !st.autoCam) return;
  const want = st.mode === 'follow' && st.f.stage >= 1 && st.f.stage <= 2;
  if (want !== !!st.closeUp) { st.closeUp = want; flyTo(want ? closePose(st.f.det) : overviewPose()); S3.setCloseUp(want); }
}
function dolly(f) { const t = controls.target; camera.position.sub(t).multiplyScalar(f).add(t); }

function hostXR() {
  const T = THREE; document.body.classList.add('ar', 'xr');
  renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding;
  renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local');
  $('#gl').appendChild(renderer.domElement);
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 50);
  const anchor = new T.Group(); anchor.visible = false; scene.add(anchor); anchor.add(S3.root);
  S3.root.scale.setScalar(0.01);
  const reticle = new T.Mesh(new T.RingGeometry(0.05, 0.065, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xf2b33d }));
  reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);
  $('#trk').hidden = false; $('#trkt').textContent = 'Looking for a surface'; $('#xr-hint').hidden = false;
  let hitSrc = null, placed = false;
  const app = $('#app');
  app.addEventListener('beforexrselect', e => e.preventDefault());
  navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local-floor'], domOverlay: { root: app } })
    .then(async session => {
      await renderer.xr.setSession(session);
      const viewer = await session.requestReferenceSpace('viewer');
      hitSrc = await session.requestHitTestSource({ space: viewer });
      session.addEventListener('end', () => { location.href = location.pathname; });
      $('#b-exit').onclick = () => session.end();
    })
    .catch(err => { alertBox('Surface AR could not start (' + (err && err.message || err) + '). Opening the 3D view instead.'); location.search = '?view=3d'; });
  $('#b-place').hidden = false;
  $('#b-place').onclick = () => {
    if (!reticle.visible) return;
    reticle.matrix.decompose(anchor.position, anchor.quaternion, anchor.scale);
    anchor.scale.setScalar(1);
    const cam = renderer.xr.getCamera(camera); const cp = new T.Vector3().setFromMatrixPosition(cam.matrixWorld);
    anchor.quaternion.identity(); anchor.rotation.y = Math.atan2(cp.x - anchor.position.x, cp.z - anchor.position.z);
    anchor.visible = true; placed = true; $('#xr-hint').hidden = true; $('#b-place').textContent = 'Move here';
  };
  $('#b-reset').onclick = () => { st.userScale = 1; applyARScale(); S3.root.rotation.y = 0; };
  $('#b-zm').onclick = () => { st.userScale *= 1.4; applyARScale(); };
  $('#b-zo').onclick = () => { st.userScale /= 1.4; applyARScale(); };
  window.applyARScale = () => S3.root.scale.setScalar(0.01 * st.userScale);
  gestures();
  renderer.setAnimationLoop((now, xrFrame) => {
    frame(now);
    if (xrFrame && hitSrc) {
      const res = xrFrame.getHitTestResults(hitSrc);
      if (res.length) {
        const pose = res[0].getPose(renderer.xr.getReferenceSpace());
        reticle.visible = !placed || true; reticle.matrix.fromArray(pose.transform.matrix);
        $('#trk').classList.add('ok'); $('#trkt').textContent = placed ? 'Placed' : 'Surface found';
      } else { reticle.visible = false; if (!placed) { $('#trk').classList.remove('ok'); $('#trkt').textContent = 'Looking for a surface'; } }
    }
    renderer.render(scene, camera);
  });
}
function applyARScale() { if (window.applyARScale) window.applyARScale(); }
function hostMarker() {
  document.body.classList.add('ar', 'marker');
  AFRAME.registerComponent('gamma-tick', { tick(t, dt) { tick(Math.min(0.1, (dt || 16) / 1000)); } });
  const wrap = document.createElement('div');
  wrap.innerHTML = `<a-scene embedded gamma-tick vr-mode-ui="enabled:false" renderer="logarithmicDepthBuffer:true;antialias:true;alpha:true;colorManagement:true"
      arjs="sourceType:webcam;debugUIEnabled:false;detectionMode:mono_and_matrix;matrixCodeType:3x3;">
    <a-marker preset="hiro" smooth="true" smoothCount="8" smoothTolerance="0.01" smoothThreshold="2" emitevents="true" id="mk"><a-entity id="anchor"></a-entity></a-marker>
    <a-entity camera></a-entity></a-scene>`;
  document.body.insertBefore(wrap.firstElementChild, document.body.firstChild);
  const mk = $('#mk'), an = $('#anchor');
  const attach = () => { an.object3D.add(S3.root); applyMarkerScale(); };
  if (an.hasLoaded) attach(); else an.addEventListener('loaded', attach);
  window.applyARScale = applyMarkerScale;
  function applyMarkerScale() { S3.root.scale.setScalar(st.userScale / 30); }
  $('#trk').hidden = false; $('#trkt').textContent = 'Point at the marker';
  mk.addEventListener('markerFound', () => { $('#trk').classList.add('ok'); $('#trkt').textContent = 'Marker locked'; });
  mk.addEventListener('markerLost', () => { $('#trk').classList.remove('ok'); $('#trkt').textContent = 'Point at the marker'; });
  $('#b-reset').onclick = () => { st.userScale = 1; applyMarkerScale(); S3.root.rotation.y = 0; };
  $('#b-zm').onclick = () => { st.userScale *= 1.4; applyMarkerScale(); };
  $('#b-zo').onclick = () => { st.userScale /= 1.4; applyMarkerScale(); };
  $('#b-exit').onclick = () => { location.href = location.pathname; };
  gestures();
}
function gestures() { // one finger: rotate the bench; two fingers: pinch to scale
  const el = $('#gest'); let p = null, d0 = 0, s0 = 1;
  el.addEventListener('touchstart', e => { if (e.touches.length === 1) p = e.touches[0].clientX; else if (e.touches.length === 2) { d0 = dist2(e.touches); s0 = st.userScale; } }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && p != null) { const x = e.touches[0].clientX; S3.root.rotation.y += (x - p) * 0.01; p = x; }
    else if (e.touches.length === 2 && d0) { st.userScale = Math.max(0.2, Math.min(12, s0 * dist2(e.touches) / d0)); applyARScale(); }
  }, { passive: true });
  el.addEventListener('touchend', () => { p = null; d0 = 0; });
  let mx = null; el.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') mx = e.clientX; });
  addEventListener('pointerup', () => { mx = null; });
  el.addEventListener('pointermove', e => { if (mx != null) { S3.root.rotation.y += (e.clientX - mx) * 0.01; mx = e.clientX; } });
  el.addEventListener('wheel', e => { e.preventDefault(); st.userScale = Math.max(0.2, Math.min(12, st.userScale * (e.deltaY < 0 ? 1.1 : 0.9))); applyARScale(); }, { passive: false });
}
const dist2 = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
function alertBox(msg) { const n = $('#st-text'); if (n) n.textContent = msg; }

// ================================================================ main loop
let tSpec = 0, tTables = 0, tHl = 0;
function tick(dt) {
  if (!S3) return;
  if (st.running) buildStep(dt);
  if (st.mode === 'follow' && st.f.auto && st.f.ev) {
    st.f.stageT += dt;
    const need = st.f.stage <= 2 ? 1.2 : 2.6;
    if (S3.followDone && st.f.stageT > need) { if (st.f.stage < maxStage()) setStage(st.f.stage + 1); else { st.f.auto = false; $('#f-auto').setAttribute('aria-pressed', 'false'); } }
  }
  if (st.mode === 'follow' && !st.f.auto && st.f.ev && st.f.stage <= 2) {
    st.f.stageT += dt;
    if (S3.followDone) { st.f.doneT = (st.f.doneT || 0) + dt; if (st.f.doneT > 2.2) { st.f.doneT = 0; S3.followEvent(st.f.det, st.f.ev, st.f.q, st.f.stage); } } else st.f.doneT = 0;
  }
  S3.update(dt);
  tSpec += dt; tTables += dt;
  if (st.hl) { st.hl.a -= dt * 0.9; if (st.hl.a <= 0) st.hl = null; }
  if (tSpec > 0.2) { tSpec = 0; if (st.tab === 'spec') drawSpec(); if (st.tab === 'chain' && st.f.stage >= 7) drawMini(); }
  if (tTables > 0.6) { tTables = 0; if (st.tab === 'spec') { renderRates(); renderEff(); } updateClock(); }
}
function buildStep(dt) {
  const ks = activeDets(), R = {};
  let inc = 0; for (const k of ks) { R[k] = rateFor(k); inc += R[k].incident; }
  const want = dt * st.speed, maxSim = inc > 0 ? budget / inc : want;
  let simdt = Math.min(want, maxSim);
  const lim = st.acqTime > 0 ? st.acqTime - Math.min(...ks.map(k => acq[k].live)) : Infinity;
  const t0 = performance.now();
  for (const k of ks) {
    animAcc[k] += dt * 3; const keep = Math.floor(animAcc[k]); animAcc[k] -= keep;
    const kept = acq[k].step(simdt, R[k], null, st.dist, cfg, srcOpts(), keep);
    for (const ev of kept) S3.spawnFlight(k, ev, 24);
    if (acq[k].lastRecorded && (tHl += dt) > 0.12) { st.hl = { det: k, ch: acq[k].lastRecorded.channel, a: 1 }; tHl = 0; }
  }
  const el = performance.now() - t0;
  if (el > 9) budget = Math.max(400, budget * 0.85); else if (el < 5 && simdt < want) budget = Math.min(60000, budget * 1.1);
  st.simRatio = simdt / dt;
  if (lim <= 0) { setRunning(false); }
}
function updateClock() {
  const k = activeDets()[0], a = acq[k];
  const dead = a.real > 0 ? a.dead / a.real * 100 : 0;
  $('#s-clock').textContent = `real ${fmt(a.real, 1)} s · live ${fmt(a.live, 1)} s · dead ${fmt(dead, 1)}%` + (st.running ? ` · ${st.simRatio >= 1 ? '×' + fmt(st.simRatio, st.simRatio < 10 ? 1 : 0) : fmt(st.simRatio, 2) + '×'} real time` : '');
}
function setRunning(v) {
  st.running = v; $('#s-run').textContent = v ? 'Pause' : (acq.hpge.real + acq.nai.real > 0 ? 'Resume' : 'Start acquisition');
  $('#s-run').classList.toggle('pri', !v);
  if (!v) updateClock();
}
function resetAcq(note) {
  for (const k of ['hpge', 'nai']) { acq[k].det = dets[k]; acq[k].reset(); }
  st.peaks = null; ref.dirty = true; setRunning(false); updateClock();
  if (note && st.tab === 'spec') flashNote(note);
}
function flashNote(t) { const h = $('#tab-spec .hint'); if (!h) return; const o = h.textContent; h.textContent = t; setTimeout(() => { h.textContent = o; }, 2600); }

// ================================================================ follow one photon
const STAGES = ['Emission', 'Interaction', 'Detector signal', 'Preamplifier', 'Digitization', 'Pulse processing', 'Energy estimate', 'Histogram'];
function maxStage() { const f = st.f; if (!f.ev) return -1; return f.wf ? 7 : 1; }
function lineOptions() {
  const out = [];
  const srcs = activeSources().length ? activeSources() : [{ name: 'Cs-137' }];
  for (const s of srcs) for (const L of GP.lineList(s.name, srcOpts())) out.push({ src: s.name, E: L.E, I: L.I, tag: L.tag });
  return out.sort((a, b) => a.E - b.E);
}
function fillLines() {
  const sel = $('#f-line'), opts = lineOptions(); sel.innerHTML = '';
  let best = opts.reduce((a, b) => (b.I > a.I ? b : a), opts[0]);
  for (const o of opts) {
    const op = document.createElement('option'); op.value = o.E;
    op.textContent = `${o.src} · ${o.E.toFixed(o.E < 100 ? 2 : 1)} keV${o.tag ? ' (' + o.tag + ')' : ''}`; sel.appendChild(op);
  }
  const keep = opts.find(o => Math.abs(o.E - st.f.lineE) < 1e-6);
  st.f.lineE = keep ? keep.E : best.E; sel.value = st.f.lineE;
  st.f.lineSrc = (opts.find(o => o.E === st.f.lineE) || {}).src || 'Cs-137';
}
function emitPhoton() {
  const f = st.f, det = dets[f.det], E = Number(f.lineE);
  if (f.scen === 'pair' && E <= 1022) {
    setStageText('Pair production needs E > 1022 keV', `This line is ${E.toFixed(1)} keV. Pair production is impossible below 2 × 511 keV. Pick a Co-60 or Na-22 1274.5 keV line.`);
    return;
  }
  const want = { any: () => true, full: e => e.cls === 'full', partial: e => e.cls === 'partial' && e.ints.some(i => i.type === 'compton') && e.escaped.length > 0,
    pair: e => e.pair, through: e => e.cls === 'through' }[f.scen];
  let ev = null, tries = 0;
  do { ev = GP.simulatePhoton(det, E, st.dist, { tag: f.lineSrc }); tries++; } while (!want(ev) && tries < 60000);
  if (!want(ev)) { setStageText('That event type is very rare here', 'No such event in 60,000 tries for this line and geometry. Try another line or event type.'); return; }
  f.ev = ev; f.tries = tries; f.counted = false;
  f.q = ev.Edep > 0 ? GP.quanta(det, ev.Edep, ev) : null;
  f.wf = (ev.Edep >= cfg.threshold) ? GP.processWaveform(det, ev, f.q, cfg) : null;
  ensureRef(f.det);
  renderLedger(); renderQuanta();
  setStage(0);
}
function reprocess() { // electronics changed: same event, new waveform
  const f = st.f; if (!f.ev || !f.q) return;
  f.wf = (f.ev.Edep >= cfg.threshold) ? GP.processWaveform(dets[f.det], f.ev, f.q, cfg) : null;
  f.counted = false;
  renderStageText(); drawWave(); renderDSP(); drawMini();
}
function setStage(s) {
  const f = st.f; if (!f.ev) return;
  s = Math.max(0, Math.min(maxStage(), s)); f.stage = s; f.stageT = 0;
  if (s === 7 && !f.counted && f.wf && f.wf.inRange) { ref[f.det].hist[f.wf.channel]++; f.counted = true; st.hl = { det: f.det, ch: f.wf.channel, a: 1.6, mini: true }; }
  $$('#steps li').forEach(li => { const i = +li.dataset.s; li.classList.toggle('cur', i === s); li.classList.toggle('done', i < s); li.style.opacity = i > maxStage() ? 0.4 : 1; });
  S3.followEvent(f.det, f.ev, f.q, Math.min(s, 3)); f.doneT = 0; autoCamera();
  renderStageText(); drawWave(); renderDSP(); drawMini();
}
function setStageText(t, p) { $('#st-title').textContent = t; $('#st-text').innerHTML = p; }
function renderStageText() {
  const f = st.f, ev = f.ev, q = f.q, wf = f.wf, det = dets[f.det], s = f.stage;
  if (!ev) return;
  const E = ev.E0.toFixed(ev.E0 < 100 ? 2 : 1), dn = DET_NAME[f.det];
  let t = '', p = '';
  if (s === 0) {
    const r = Math.hypot(ev.entry[0], ev.entry[1]);
    t = `1 · Emission: a ${E} keV photon`;
    p = `A ${E} keV γ photon leaves the ${f.lineSrc} source. Only photons heading toward the crystal face are followed; this one ${ev.cls === 'window' ? 'is absorbed in the ' + (ev.windowLabel || 'window') + ' before reaching the active crystal' : `enters ${r.toFixed(1)} cm from the detector axis`}. Real γ rays travel at the speed of light and are invisible; this is slowed about 10⁹ times.` +
      (f.scen !== 'any' ? ` <span class="muted">(Chosen event type; ${fmt(f.tries)} photon${f.tries > 1 ? 's were' : ' was'} simulated to find it.)</span>` : '');
  } else if (s === 1) {
    t = '2 · Interaction in the crystal';
    const n = ev.ints.length;
    p = n ? `The photon interacts ${n} time${n > 1 ? 's' : ''}. Total deposited: <b>${ev.Edep.toFixed(1)} keV</b> of ${E} keV; ${ev.Eesc.toFixed(1)} keV escaped. ${GP.CLASS_TEXT[ev.cls]}`
          : GP.CLASS_TEXT[ev.cls];
    if (!wf && ev.Edep > 0) p += ` The deposit is below the ${cfg.threshold} keV trigger threshold, so no pulse is recorded.`;
    if (!ev.Edep) p += ' The chain stops here: no energy deposited means no signal.';
  } else if (s === 2) {
    t = '3 · Detector signal';
    if (f.det === 'hpge') p = `The ${ev.Edep.toFixed(1)} keV deposit frees N = E/ε ≈ <b>${fmt(q.N)}</b> electron–hole pairs (ε = 2.96 eV at 77 K). The bias field sweeps electrons to the outer n⁺ contact and holes to the inner p⁺ core in about ${fmt(GP.riseTimeNs(det, ev))} ns. The pair count fluctuates by only √(F·N) = ${fmt(Math.sqrt(det.res.F * q.Nmean))} (Fano factor F = ${det.res.F}), which is why germanium peaks are so narrow. Cooling to 77 K keeps thermally generated leakage current from swamping this tiny charge.`;
    else p = `The deposit excites the crystal; Tl⁺ activator sites emit about <b>${fmt(q.Nph)}</b> blue (415 nm) photons (≈38 per keV) with a 230 ns decay. The reflector steers light to the photocathode, which releases <b>${fmt(q.Npe)}</b> photoelectrons (≈${(det.res.eta * 100).toFixed(0)}% of the light). Ten dynodes multiply them about 10⁶ times. Far fewer information carriers than in germanium (photoelectrons vs electron–hole pairs) is the main reason NaI(Tl) peaks are wider.`;
  } else if (s === 3) {
    t = '4 · Preamplifier';
    p = `A charge-sensitive preamplifier integrates the collected charge into a voltage step whose height is proportional to the charge, and so to the deposited energy. The step then decays with τ = ${det.dsp.tau} µs. Rise time here ≈ ${fmt(GP.riseTimeNs(det, ev))} ns (${f.det === 'hpge' ? 'set by carrier drift, so it depends on where the interaction happened' : 'set by the 230 ns scintillation decay'}). Green trace.`;
  } else if (s === 4) {
    t = '5 · Digitization';
    p = `The ADC samples the preamp waveform every ${wf.Ts.toFixed(1)} ns (${cfg.fs} MS/s) and stores each sample as a ${cfg.bits}-bit code. One code step (LSB) = ${wf.lsb.toFixed(3)} keV at this gain. Cyan dots. <b>Sampling records the waveform shape; it does not yet decide the energy or the spectrum bin.</b> Use "Rising edge" to see individual samples.`;
  } else if (s === 5) {
    const nf = GP.filteredNoise(det, cfg);
    t = '6 · Pulse processing (digital shaping)';
    p = `A trapezoidal filter (rise ${(wf.k * wf.Ts / 1000).toFixed(2)} µs, flat top ${(wf.m * wf.Ts / 1000).toFixed(2)} µs, pole-zero corrected for the ${det.dsp.tau} µs decay) combines hundreds of samples into one flat-topped pulse. Averaging cuts the noise from ${nf.perSample.toFixed(2)} keV per sample to <b>${nf.sigma.toFixed(2)} keV</b> RMS. White trace.`;
  } else if (s === 6) {
    t = '7 · Energy estimate';
    const d = wf.Eest - ev.Edep;
    p = `The flat-top height, read at the amber marker, is the energy estimate: <b>E<sub>est</sub> = ${wf.Eest.toFixed(2)} keV</b>. Deposited: ${ev.Edep.toFixed(2)} keV. The ${d >= 0 ? '+' : ''}${d.toFixed(2)} keV difference comes from ${f.det === 'hpge' ? 'charge-carrier statistics' : 'photoelectron statistics, light-yield variations'} and electronic noise. That random spread is what gives every peak its width.`;
  } else if (s === 7) {
    t = '8 · Histogram';
    p = wf.inRange ? `Calibration: E = ${wf.keVperCh.toFixed(4)} keV/channel × channel. E<sub>est</sub> = ${wf.Eest.toFixed(2)} keV → <b>channel ${wf.channel}</b> (covers ${wf.binLo.toFixed(2)}–${wf.binHi.toFixed(2)} keV). That bin goes up by one. Millions of events like this build the spectrum.`
      : 'The pulse is above the ADC full scale (overflow) and is not stored. Lower the gain to fit it.';
  }
  setStageText(t, p);
}
function renderLedger() {
  const ev = st.f.ev; if (!ev) return;
  const nm = { photo: 'Photoelectric', compton: 'Compton', pair: 'Pair production', absorb: 'Absorbed (<1 keV)' };
  let h = `<table><thead><tr><th>Step</th><th class="n">E in</th><th class="n">Deposited</th><th class="n">Carried on</th></tr></thead><tbody>`;
  h += `<tr><td style="color:var(--gamma)">Incident γ</td><td class="n">${ev.E0.toFixed(2)}</td><td class="n">—</td><td class="n">—</td></tr>`;
  if (ev.cls === 'window') h += `<tr><td>Absorbed in ${ev.windowLabel}</td><td class="n">${ev.E0.toFixed(2)}</td><td class="n">0 (inactive)</td><td class="n">0</td></tr>`;
  ev.ints.forEach((i, n) => {
    let extra = i.type === 'compton' ? ` (${i.angle.toFixed(0)}°)` : i.type === 'pair' ? ' → 2 × 511' : i.xray ? ' → K x-ray' : '';
    h += `<tr><td>${n + 1}. ${nm[i.type]}${extra}</td><td class="n">${i.Ein.toFixed(2)}</td><td class="n">${i.Edep.toFixed(2)}</td><td class="n">${i.Eout.toFixed(2)}</td></tr>`;
  });
  ev.escaped.forEach(e => { h += `<tr><td style="color:var(--scatter)">Escaped ${e.kind === 'annih' ? '511 keV annihilation γ' : e.kind === 'xray' ? 'K x-ray' : 'scattered γ'}</td><td class="n">${e.E.toFixed(2)}</td><td class="n">—</td><td class="n">—</td></tr>`; });
  const sum = ev.Edep + ev.Eesc + ev.Ewin, ok = Math.abs(sum - ev.E0) < 1e-6;
  h += `<tr class="sum"><td>Deposited + escaped${ev.Ewin ? ' + window' : ''}</td><td class="n" colspan="3">${ev.Edep.toFixed(2)} + ${ev.Eesc.toFixed(2)}${ev.Ewin ? ' + ' + ev.Ewin.toFixed(2) : ''} = ${sum.toFixed(2)} keV ${ok ? '✓' : '✗'}</td></tr></tbody></table>`;
  h += `<div class="cls ${ev.cls === 'full' ? '' : 'bad'}">${GP.CLASS_TEXT[ev.cls]}</div>`;
  $('#ledger').innerHTML = h;
}
function renderQuanta() {
  const f = st.f, q = f.q, det = dets[f.det];
  $('#q-title').textContent = f.det === 'hpge' ? 'Detector signal: charge carriers' : 'Detector signal: light → photoelectrons';
  if (!q) { $('#quanta').innerHTML = '<p class="muted">No energy deposited, so no signal.</p>'; return; }
  const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
  if (f.det === 'hpge') $('#quanta').innerHTML = kv('Deposited energy', f.ev.Edep.toFixed(2) + ' keV') + kv('Mean pairs E/ε (ε = 2.96 eV)', fmt(q.Nmean)) + kv('This event (Fano spread)', fmt(q.N)) + kv('σ = √(F·N)', fmt(Math.sqrt(q.F * q.Nmean)) + ' pairs') + kv('Collected charge', (q.N * 1.602e-19 * 1e15).toFixed(3) + ' fC') + kv('Signal (energy units)', q.Eq.toFixed(2) + ' keV');
  else $('#quanta').innerHTML = kv('Deposited energy', f.ev.Edep.toFixed(2) + ' keV') + kv('Scintillation photons (≈38/keV)', fmt(q.Nph)) + kv('Photoelectrons (' + (det.res.eta * 100).toFixed(0) + '%)', fmt(q.Npe)) + kv('Relative spread ≈ √(ENF/Npe)', (Math.sqrt(det.res.enf / Math.max(1, q.Npe)) * 100).toFixed(2) + ' %') + kv('PMT gain', (q.gain / 1e6).toFixed(1) + ' × 10⁶') + kv('Anode charge', (q.Q * 1.602e-19 * 1e12).toFixed(2) + ' pC') + kv('Signal (energy units)', q.Eq.toFixed(2) + ' keV');
}
function renderDSP() {
  const f = st.f, det = dets[f.det], nf = GP.filteredNoise(det, cfg), wf = f.wf, s = f.stage;
  const c = (k, v, hl) => `<div class="${hl ? 'hl' : ''}"><small>${k}</small><b>${v}</b></div>`;
  $('#dsp-ro').innerHTML = c('Sample period', (1000 / cfg.fs).toFixed(1) + ' ns') + c('LSB at this gain', nf.lsb.toFixed(3) + ' keV') +
    c('Noise per sample → filtered', nf.perSample.toFixed(2) + ' → ' + nf.sigma.toFixed(2) + ' keV') +
    c('Deposited', f.ev ? f.ev.Edep.toFixed(2) + ' keV' : '—') +
    c('Energy estimate', wf && s >= 6 ? wf.Eest.toFixed(2) + ' keV' : '—', s >= 6) +
    c('Calibration', `E = ${(cfg.gainFS / det.channels).toFixed(4)} × ch`) +
    c('Channel', wf && s >= 7 ? (wf.inRange ? String(wf.channel) : 'overflow') : '—', s >= 7);
  $('#c-noise-d').textContent = '(' + DET_NAME[f.det] + ')';
}
function ensureRef(k) {
  if (!ref.dirty && ref[k]) return;
  if (ref.dirty) { ref.hpge = null; ref.nai = null; ref.dirty = false; }
  if (ref[k]) return;
  const a = new GP.Acquisition(dets[k]), R = rateFor(k), c2 = Object.assign({}, cfg, { pileup: false });
  if (R.incident > 0) a.step(25000 / R.incident, R, null, st.dist, c2, srcOpts(), 0);
  ref[k] = a;
}

// ================================================================ drawing
const DPR = Math.min(2, devicePixelRatio || 1);
function ctx2d(cv) {
  const h = +(cv.dataset.h || cv.getAttribute('height')); cv.dataset.h = h; cv.style.height = h + 'px';
  const w = cv.clientWidth || 300; cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
  const x = cv.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); x.clearRect(0, 0, w, h); return { x, w, h };
}
function niceStep(range, n) { const r = range / n, p = Math.pow(10, Math.floor(Math.log10(r))), m = r / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
function ticks(a, b, n) { const s = niceStep(b - a, n), out = []; for (let v = Math.ceil(a / s) * s; v <= b + 1e-9; v += s) out.push(+v.toFixed(10)); return out; }
const tfmt = v => Math.abs(v) >= 1e6 ? (v / 1e6) + 'M' : Math.abs(v) >= 1e4 ? (v / 1e3) + 'k' : String(+v.toPrecision(6));

/** Spectrum plot. series: [{hist, b, color, name, key}] */
function plotSpectrum(cv, series, o) {
  const { x, w, h } = ctx2d(cv);
  const L = 50, Rm = 10, T = 8, B = 30, n = series.length || 1;
  const panels = o.stack && n > 1 ? series.map((s, i) => ({ s: [s], y0: T + i * (h - T - B) / n, y1: T + (i + 1) * (h - T - B) / n - (i < n - 1 ? 10 : 0) })) : [{ s: series, y0: T, y1: h - B }];
  const [e0, e1] = o.zoom, X = E => L + (E - e0) / (e1 - e0) * (w - L - Rm);
  cv._map = { x2E: px => e0 + (px - L) / (w - L - Rm) * (e1 - e0), L, R: w - Rm, T, B: h - B, E2x: X };
  x.font = '11px "IBM Plex Mono", monospace';
  for (const P of panels) {
    // y range
    let ymax = 0;
    const vis = P.s.map(s => { const c0 = Math.max(0, Math.floor(e0 / s.b)), c1 = Math.min(s.hist.length - 1, Math.ceil(e1 / s.b)); let m = 0; for (let i = c0; i <= c1; i++) if (s.hist[i] > m) m = s.hist[i]; return { c0, c1, m }; });
    ymax = o.norm ? 1.05 : Math.max(5, ...vis.map(v => v.m)) * 1.08;
    const ymin = o.log ? (o.norm ? 1e-4 : 0.5) : 0;
    const Y = v => { if (o.log) { const lv = Math.log10(Math.max(ymin, v)); return P.y1 - (lv - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin)) * (P.y1 - P.y0); } return P.y1 - v / ymax * (P.y1 - P.y0); };
    // grid & y ticks
    x.strokeStyle = COL.grid; x.fillStyle = COL.axis; x.lineWidth = 1; x.textAlign = 'right'; x.textBaseline = 'middle';
    const yt = o.log ? logTicks(ymin, ymax) : ticks(0, ymax, 4);
    for (const v of yt) { const yy = Y(v); if (yy < P.y0 - 1) continue; x.beginPath(); x.moveTo(L, yy); x.lineTo(w - Rm, yy); x.stroke(); x.fillText(o.norm ? (+v.toPrecision(2)).toString() : tfmt(v), L - 5, yy); }
    // markers
    if (o.markers) for (const mk of o.markers) { if (mk.E < e0 || mk.E > e1) continue; const xx = X(mk.E); x.strokeStyle = 'rgba(255,211,77,.28)'; x.setLineDash([3, 4]); x.beginPath(); x.moveTo(xx, P.y0); x.lineTo(xx, P.y1); x.stroke(); x.setLineDash([]); }
    // data
    P.s.forEach((s, si) => {
      const v = vis[series.indexOf(s) >= 0 ? P.s.indexOf(s) : si], scale = o.norm ? 1 / Math.max(1, v.m) : 1;
      x.strokeStyle = s.color; x.lineWidth = 1.3; x.beginPath();
      const chPerPx = (v.c1 - v.c0) / (w - L - Rm);
      if (chPerPx > 1) {
        for (let px = L; px <= w - Rm; px++) {
          const ea = e0 + (px - L) / (w - L - Rm) * (e1 - e0), eb = e0 + (px + 1 - L) / (w - L - Rm) * (e1 - e0);
          let m = 0; for (let i = Math.max(0, Math.floor(ea / s.b)); i < Math.min(s.hist.length, Math.ceil(eb / s.b)); i++) if (s.hist[i] > m) m = s.hist[i];
          const yy = Y(m * scale); px === L ? x.moveTo(px, yy) : x.lineTo(px, yy);
        }
      } else {
        for (let i = v.c0; i <= v.c1; i++) { const xa = X(i * s.b), xb = X((i + 1) * s.b), yy = Y(s.hist[i] * scale); i === v.c0 ? x.moveTo(Math.max(L, xa), yy) : x.lineTo(Math.max(L, xa), yy); x.lineTo(Math.min(w - Rm, xb), yy); }
      }
      x.stroke();
      // highlight bin
      if (o.hl && o.hl.det === s.key && o.hl.ch >= 0) {
        const xa = X(o.hl.ch * s.b), xb = X((o.hl.ch + 1) * s.b), cx = (xa + xb) / 2, a = Math.min(1, o.hl.a);
        if (cx >= L && cx <= w - Rm) {
          const bw = Math.max(3, xb - xa);
          x.fillStyle = `rgba(242,179,61,${0.85 * a})`; x.fillRect(cx - bw / 2, Y(s.hist[o.hl.ch] * scale), bw, P.y1 - Y(s.hist[o.hl.ch] * scale));
          x.strokeStyle = `rgba(242,179,61,${a})`; x.beginPath(); x.arc(cx, Y(s.hist[o.hl.ch] * scale), 7 + 6 * (1 - Math.min(1, o.hl.a)), 0, 2 * Math.PI); x.stroke();
          if (o.hl.mini) { x.fillStyle = COL.amber; x.textAlign = cx > w - 140 ? 'right' : 'left'; x.textBaseline = 'bottom'; x.fillText(`+1 in ch ${o.hl.ch}`, cx + (cx > w - 140 ? -8 : 8), Y(s.hist[o.hl.ch] * scale) - 6); }
        }
      }
      // peak measurement marks
      if (o.peaks) for (const pk of o.peaks) if (pk.key === s.key && pk.res) {
        const r = pk.res, yh = Y((r.bgAt + r.height / 2) * scale), xl = X(r.centroid - r.fwhm / 2), xr = X(r.centroid + r.fwhm / 2);
        x.strokeStyle = s.color; x.lineWidth = 2; x.beginPath(); x.moveTo(xl, yh); x.lineTo(xr, yh); x.stroke();
        x.beginPath(); x.moveTo(xl, yh - 5); x.lineTo(xl, yh + 5); x.moveTo(xr, yh - 5); x.lineTo(xr, yh + 5); x.stroke(); x.lineWidth = 1;
      }
    });
    if (P.s.length === 1 && n > 1) { x.fillStyle = P.s[0].color; x.textAlign = 'right'; x.textBaseline = 'top'; x.fillText(P.s[0].name, w - Rm - 4, P.y0 + 2); }
  }
  // x axis
  x.fillStyle = COL.axis; x.textAlign = 'center'; x.textBaseline = 'top'; x.strokeStyle = COL.grid;
  for (const v of ticks(e0, e1, Math.max(3, Math.floor((w - L) / 70)))) { const xx = X(v); x.beginPath(); x.moveTo(xx, h - B); x.lineTo(xx, h - B + 4); x.stroke(); x.textAlign = xx > w - Rm - 16 ? 'right' : 'center'; x.fillText(tfmt(v), xx, h - B + 6); }
  x.textAlign = 'right'; x.fillText('Energy (keV)', w - Rm, h - 13);
  x.save(); x.translate(11, (T + h - B) / 2); x.rotate(-Math.PI / 2); x.textAlign = 'center'; x.fillText(o.norm ? 'Normalized counts' : 'Counts per bin', 0, 0); x.restore();
  if (o.sel) { x.fillStyle = 'rgba(242,179,61,.12)'; x.fillRect(Math.min(o.sel[0], o.sel[1]), T, Math.abs(o.sel[1] - o.sel[0]), h - B - T); }
  if (o.empty) { x.fillStyle = COL.axis; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '13px "IBM Plex Sans", sans-serif'; x.fillText(o.empty, (L + w) / 2, (T + h - B) / 2); }
}
function logTicks(a, b) { const out = []; for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) { const v = Math.pow(10, e); if (v >= a && v <= b) out.push(v); } return out; }
function markersFor() { const m = []; for (const s of activeSources()) for (const L of GP.lineList(s.name, srcOpts())) m.push({ E: L.E }); return m; }
function drawSpec() {
  const ks = activeDets(), series = ks.map(k => ({ key: k, hist: acq[k].hist, b: cfg.gainFS / dets[k].channels, color: COL[k], name: DET_NAME[k] + ` (${(cfg.gainFS / dets[k].channels).toFixed(2)} keV/bin)` }));
  const any = ks.some(k => acq[k].recorded > 0);
  plotSpectrum($('#cv-spec'), series, { zoom: st.zoom, log: st.scale === 'log', norm: st.norm, stack: st.lay === 'stack', markers: st.marks ? markersFor() : null, hl: st.hl, peaks: st.peaks, sel: st.sel, empty: any ? '' : 'Press Start acquisition to build a spectrum' });
}
function drawMini() {
  const f = st.f; if (!f.ev) return;
  const r = ref[f.det]; if (!r) return;
  const b = cfg.gainFS / dets[f.det].channels;
  const top = Math.min(cfg.gainFS, Math.max(120, Math.max(...lineOptions().map(o => o.E)) * 1.15));
  plotSpectrum($('#cv-mini'), [{ key: f.det, hist: r.hist, b, color: COL[f.det], name: DET_NAME[f.det] }],
    { zoom: [0, top], log: true, markers: [{ E: f.ev.E0 }], hl: f.stage >= 7 && st.hl && st.hl.mini ? st.hl : (f.stage >= 7 && f.wf ? { det: f.det, ch: f.wf.channel, a: 0.6, mini: true } : null) });
  $('#mini-note').textContent = `${DET_NAME[f.det]} reference spectrum (${fmt(r.recorded)} events) + this event`;
}
function drawWave() {
  const cv = $('#cv-wave'), { x, w, h } = ctx2d(cv), f = st.f, wf = f.wf, s = f.stage;
  const L = 50, Rm = 46, T = 10, B = 28;
  x.font = '11px "IBM Plex Mono", monospace';
  if (!wf || s < 3) {
    x.fillStyle = COL.axis; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '13px "IBM Plex Sans", sans-serif';
    x.fillText(!f.ev ? 'Emit a photon first' : (!wf ? 'No pulse for this event' : 'The waveform appears at step 4 (Preamplifier)'), w / 2, h / 2); return;
  }
  const det = dets[f.det], us = i => (i - wf.pre) * wf.Ts / 1000;
  let i0 = wf.view0, i1 = wf.n - 1;
  if (f.wz === 'edge') { const span = f.det === 'hpge' ? 0.9 : 1.6; i0 = Math.max(0, wf.pre - Math.round(300 / wf.Ts)); i1 = Math.min(wf.n - 1, wf.pre + Math.round(span * 1000 / wf.Ts)); }
  let ymax = Math.max(10, f.q.Eq * 1.15), ymin = -Math.max(det.dsp.noise * 3.5, ymax * 0.06);
  if (s >= 5 && f.wz !== 'edge') ymax = Math.max(ymax, wf.Eest * 1.15);
  const X = i => L + (i - i0) / (i1 - i0) * (w - L - Rm), Y = v => h - B - (v - ymin) / (ymax - ymin) * (h - B - T);
  // grid
  x.strokeStyle = COL.grid; x.fillStyle = COL.axis; x.textAlign = 'right'; x.textBaseline = 'middle';
  for (const v of ticks(Math.max(0, ymin), ymax, 4)) { const yy = Y(v); x.beginPath(); x.moveTo(L, yy); x.lineTo(w - Rm, yy); x.stroke(); x.fillText(tfmt(v), L - 5, yy); x.textAlign = 'left'; x.fillText(tfmt(Math.round(v / wf.lsb)), w - Rm + 4, yy); x.textAlign = 'right'; }
  x.textAlign = 'center'; x.textBaseline = 'top';
  for (const v of ticks(us(i0), us(i1), 6)) { const ii = wf.pre + v * 1000 / wf.Ts, xx = X(ii); x.beginPath(); x.moveTo(xx, h - B); x.lineTo(xx, h - B + 4); x.stroke(); x.fillText(tfmt(+v.toFixed(3)), xx, h - B + 6); }
  x.textAlign = 'right'; x.fillText('time (µs)', w - Rm, h - 13);
  x.save(); x.translate(11, (T + h - B) / 2); x.rotate(-Math.PI / 2); x.textAlign = 'center'; x.fillText('keV-equivalent', 0, 0); x.restore();
  x.save(); x.translate(w - 8, (T + h - B) / 2); x.rotate(Math.PI / 2); x.textAlign = 'center'; x.fillText('ADC code − baseline', 0, 0); x.restore();
  // analog (with noise) — continuous trace
  x.strokeStyle = COL.analog; x.lineWidth = 1.4; x.beginPath();
  const stepPx = Math.max(1, Math.floor((i1 - i0) / (w - L - Rm)));
  for (let i = i0; i <= i1; i += stepPx) { const v = wf.noisy[i]; i === i0 ? x.moveTo(X(i), Y(v)) : x.lineTo(X(i), Y(v)); }
  x.stroke();
  if (s >= 4) { // samples
    const per = (w - L - Rm) / (i1 - i0);
    x.fillStyle = COL.digital;
    if (per >= 3) for (let i = i0; i <= i1; i++) { const v = (wf.codes[i] - wf.baseline) * wf.lsb; x.beginPath(); x.arc(X(i), Y(v), Math.min(3, per / 3), 0, 2 * Math.PI); x.fill(); }
    else { x.globalAlpha = 0.55; for (let i = i0; i <= i1; i += Math.max(1, Math.round(2 / per))) { const v = (wf.codes[i] - wf.baseline) * wf.lsb; x.fillRect(X(i) - 0.8, Y(v) - 0.8, 1.6, 1.6); } x.globalAlpha = 1; }
  }
  if (s >= 5) { x.strokeStyle = COL.shaped; x.lineWidth = 1.6; x.beginPath(); for (let i = i0; i <= i1; i += stepPx) { i === i0 ? x.moveTo(X(i), Y(wf.trap[i])) : x.lineTo(X(i), Y(wf.trap[i])); } x.stroke(); }
  if (s >= 6 && wf.tSample >= i0 && wf.tSample <= i1) {
    const xx = X(wf.tSample), yy = Y(wf.Eest);
    x.strokeStyle = COL.amber; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(xx, T); x.lineTo(xx, h - B); x.stroke(); x.setLineDash([]);
    x.fillStyle = COL.amber; x.beginPath(); x.arc(xx, yy, 4.5, 0, 2 * Math.PI); x.fill();
    x.textAlign = xx > w - 170 ? 'right' : 'left'; x.textBaseline = 'bottom'; x.font = '12px "IBM Plex Mono", monospace';
    x.fillText(`E_est = ${wf.Eest.toFixed(2)} keV`, xx + (xx > w - 170 ? -8 : 8), yy - 6);
  }
}
function drawRes() {
  const cv = $('#cv-res'), { x, w, h } = ctx2d(cv), L = 50, Rm = 12, T = 10, B = 28;
  const isR = st.resWhat === 'r', e0 = 20, e1 = 3000;
  const val = (k, E) => { const f = GP.modelFWHM(dets[k], E, cfg); return isR ? f / E * 100 : f; };
  const ymin = isR ? 0.03 : 0.2, ymax = isR ? 60 : 300;
  const X = E => L + Math.log(E / e0) / Math.log(e1 / e0) * (w - L - Rm), Y = v => h - B - Math.log(v / ymin) / Math.log(ymax / ymin) * (h - B - T);
  x.font = '11px "IBM Plex Mono", monospace'; x.strokeStyle = COL.grid; x.fillStyle = COL.axis; x.textAlign = 'right'; x.textBaseline = 'middle';
  for (const v of (isR ? [0.1, 0.3, 1, 3, 10, 30] : [0.3, 1, 3, 10, 30, 100, 300])) { const yy = Y(v); x.beginPath(); x.moveTo(L, yy); x.lineTo(w - Rm, yy); x.stroke(); x.fillText(String(v), L - 5, yy); }
  x.textAlign = 'center'; x.textBaseline = 'top';
  for (const v of [20, 50, 100, 200, 500, 1000, 2000]) { const xx = X(v); x.beginPath(); x.moveTo(xx, T); x.lineTo(xx, h - B); x.stroke(); x.fillText(String(v), xx, h - B + 6); }
  x.textAlign = 'right'; x.fillText('Energy (keV, log)', w - Rm, h - 13);
  x.save(); x.translate(11, (T + h - B) / 2); x.rotate(-Math.PI / 2); x.textAlign = 'center'; x.fillText(isR ? 'R = FWHM/E (%)' : 'FWHM (keV)', 0, 0); x.restore();
  for (const k of ['hpge', 'nai']) {
    x.strokeStyle = COL[k]; x.lineWidth = 2; x.beginPath();
    for (let i = 0; i <= 200; i++) { const E = e0 * Math.pow(e1 / e0, i / 200), yy = Y(Math.max(ymin, val(k, E))); i ? x.lineTo(X(E), yy) : x.moveTo(X(E), yy); }
    x.stroke();
    const yE = val(k, st.resE); x.fillStyle = COL[k]; x.beginPath(); x.arc(X(st.resE), Y(yE), 4, 0, 2 * Math.PI); x.fill();
    x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(`${DET_NAME[k]}: ${yE.toFixed(isR ? 2 : yE < 10 ? 2 : 1)}${isR ? '%' : ' keV'}`, Math.min(X(st.resE) + 8, w - 150), Y(yE) - 10);
  }
  x.strokeStyle = 'rgba(242,179,61,.6)'; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(X(st.resE), T); x.lineTo(X(st.resE), h - B); x.stroke(); x.setLineDash([]);
  // terms table
  const E = st.resE;
  let tb = `<table><thead><tr><th>Contribution at ${E} keV</th><th class="n">FWHM (keV)</th></tr></thead><tbody>`;
  for (const k of ['hpge', 'nai']) {
    tb += `<tr><td colspan="2" style="color:${COL[k]};font-weight:600">${DET_NAME[k]}</td></tr>`;
    for (const t of GP.fwhmTerms(dets[k], E, cfg)) tb += `<tr><td>${t.name}</td><td class="n">${t.fwhm.toFixed(2)}</td></tr>`;
    const tot = GP.modelFWHM(dets[k], E, cfg);
    tb += `<tr class="sum"><td>Total (added in quadrature) · R = ${(tot / E * 100).toFixed(2)}%</td><td class="n">${tot.toFixed(2)}</td></tr>`;
  }
  $('#r-terms').innerHTML = tb + '</tbody></table>';
}
function drawTwo() {
  const cv = $('#cv-two'), { x, w, h } = ctx2d(cv), L = 14, Rm = 12, T = 10, B = 28;
  const c = st.two.c, d = st.two.d, E1 = c - d / 2, E2 = c + d / 2;
  const fw = { hpge: GP.modelFWHM(dets.hpge, c, cfg), nai: GP.modelFWHM(dets.nai, c, cfg) };
  const half = Math.max(fw.nai * 1.6, d * 1.5, 3), e0 = c - half, e1 = c + half;
  const X = E => L + (E - e0) / (e1 - e0) * (w - L - Rm), Y = v => h - B - v * (h - B - T) * 0.92;
  x.font = '11px "IBM Plex Mono", monospace'; x.fillStyle = COL.axis; x.strokeStyle = COL.grid; x.textAlign = 'center'; x.textBaseline = 'top';
  for (const v of ticks(e0, e1, 5)) { const xx = X(v); x.beginPath(); x.moveTo(xx, T); x.lineTo(xx, h - B); x.stroke(); x.fillText(tfmt(+v.toFixed(2)), xx, h - B + 6); }
  x.textAlign = 'right'; x.fillText('Energy (keV)', w - Rm, h - 13);
  const verdict = {};
  for (const k of ['hpge', 'nai']) {
    const s = fw[k] / 2.355, g = E => Math.exp(-0.5 * Math.pow((E - E1) / s, 2)) + Math.exp(-0.5 * Math.pow((E - E2) / s, 2));
    let mx = 0; const pts = []; for (let i = 0; i <= 400; i++) { const E = e0 + (e1 - e0) * i / 400, v = g(E); pts.push([E, v]); if (v > mx) mx = v; }
    x.strokeStyle = COL[k]; x.lineWidth = 2; x.beginPath(); pts.forEach(([E, v], i) => i ? x.lineTo(X(E), Y(v / mx)) : x.moveTo(X(E), Y(v / mx))); x.stroke();
    const valley = g(c) / mx; let peaks = 0; for (let i = 1; i < pts.length - 1; i++) if (pts[i][1] > pts[i - 1][1] && pts[i][1] >= pts[i + 1][1]) peaks++;
    verdict[k] = { ratio: d / fw[k], valley, resolved: peaks >= 2 };
  }
  x.strokeStyle = 'rgba(255,211,77,.7)'; x.setLineDash([3, 3]); for (const E of [E1, E2]) { x.beginPath(); x.moveTo(X(E), T); x.lineTo(X(E), h - B); x.stroke(); } x.setLineDash([]);
  $('#tl-verdict').innerHTML = ['hpge', 'nai'].map(k => { const v = verdict[k]; return `<div style="border-color:${COL[k]}"><b style="color:${COL[k]}">${DET_NAME[k]}</b> FWHM ${fw[k].toFixed(2)} keV<br>ΔE/FWHM = ${v.ratio.toFixed(2)} → <b>${v.resolved ? (v.valley > 0.8 ? 'barely resolved' : 'resolved') : 'merged into one peak'}</b>${v.resolved ? ` (valley at ${(v.valley * 100).toFixed(0)}% of peak)` : ''}</div>`; }).join('');
}

// ================================================================ tables
function renderRates() {
  const ks = activeDets();
  const rows = [['Source activity', k => fmt(rateFor(k).activity / 1000, 1) + ' kBq'],
    ['γ + x-ray photons emitted', k => fmt(rateFor(k).emitted) + ' /s'],
    ['Solid angle Ω/4π (crystal face)', k => (rateFor(k).frac * 100).toFixed(2) + ' %'],
    ['Reaching crystal (incl. background)', k => fmt(rateFor(k).incident) + ' /s'],
    ['Depositing ≥ threshold', k => acq[k].real ? fmt(acq[k].interacted / acq[k].real) + ' /s' : '—'],
    ['Recorded in spectrum', k => acq[k].real ? fmt(acq[k].recorded / acq[k].real) + ' /s' : '—'],
    ['Dead time', k => acq[k].real ? (acq[k].dead / acq[k].real * 100).toFixed(1) + ' %' : '—'],
    ['Piled-up events', k => fmt(acq[k].piled)],
    ['Overflow (above full scale)', k => fmt(acq[k].overflow)]];
  let t = `<table><thead><tr><th>Per second of real time</th>${ks.map(k => `<th class="n" style="color:${COL[k]}">${DET_NAME[k]}</th>`).join('')}</tr></thead><tbody>`;
  for (const [n, f] of rows) t += `<tr><td>${n}</td>${ks.map(k => `<td class="n">${f(k)}</td>`).join('')}</tr>`;
  $('#rates').innerHTML = t + '</tbody></table>';
}
function renderEff() {
  const ks = activeDets(), lines = new Map();
  for (const k of ks) for (const [key, t] of acq[k].lineTally) { if (!lines.has(key)) lines.set(key, { E: t.E, src: t.src, I: t.I }); lines.get(key)[k] = t; }
  const arr = [...lines.values()].sort((a, b) => a.E - b.E);
  if (!arr.length) { $('#eff').innerHTML = '<p class="muted">Start an acquisition.</p>'; return; }
  let t = `<table><thead><tr><th>Line</th><th class="n">Iγ %</th>${ks.map(k => `<th class="n" style="color:${COL[k]}">${DET_NAME[k]} abs. FEP eff.</th>`).join('')}</tr></thead><tbody>`;
  for (const L of arr) t += `<tr><td>${L.src} ${L.E.toFixed(L.E < 100 ? 2 : 1)} keV</td><td class="n">${L.I}</td>${ks.map(k => { const a = L[k]; return `<td class="n">${a && a.incident >= 30 ? (a.full * a.frac / a.incident * 100).toPrecision(3) + ' %' : '—'}</td>`; }).join('')}</tr>`;
  $('#eff').innerHTML = t + '</tbody></table><p class="hint">Absolute full-energy-peak efficiency = photopeak counts ÷ photons emitted by the source (all directions).</p>';
}
function renderCalib() {
  $('#calib').innerHTML = ['hpge', 'nai'].map(k => `<div><span style="color:${COL[k]}">${DET_NAME[k]}</span>: ${dets[k].channels} channels · E(keV) = ${(cfg.gainFS / dets[k].channels).toFixed(4)} × channel + 0.000</div>`).join('') +
    `<div class="muted">ADC full scale = ${cfg.gainFS} keV (${cfg.bits}-bit, LSB ${(cfg.gainFS / Math.pow(2, cfg.bits)).toFixed(3)} keV). Changing the gain moves peaks to other channels; the calibration is updated with it, so peaks stay at their true energies on the keV axis.</div>`;
}
function renderNData() {
  let t = '<table><thead><tr><th>Nuclide</th><th>T½</th><th class="n">E (keV)</th><th class="n">I (per 100 decays)</th><th>Note</th></tr></thead><tbody>';
  for (const [n, s] of Object.entries(GP.SOURCES)) { if (s.synthetic) continue; s.lines.forEach((L, i) => { t += `<tr><td>${i ? '' : n}</td><td>${i ? '' : s.half}</td><td class="n">${L.E}</td><td class="n">${L.I}</td><td>${L.tag || 'γ'}</td></tr>`; }); }
  t += '</tbody></table>';
  t += '<p class="hint">' + Object.entries(GP.SOURCES).filter(([, s]) => !s.synthetic).map(([n, s]) => `<b>${n}:</b> ${s.note}`).join('<br>') + '</p>';
  $('#ndata').innerHTML = t;
}
function renderSources() {
  const box = $('#srcs'); box.innerHTML = '';
  st.sources.forEach((s, i) => {
    const d = GP.SOURCES[s.name], em = GP.lineList(s.name, srcOpts()).reduce((a, L) => a + L.I, 0) / 100;
    const el = document.createElement('div'); el.className = 'src';
    el.innerHTML = `<input type="checkbox" id="src-${i}" ${s.on ? 'checked' : ''}><label for="src-${i}"><span class="nm">${s.name}</span> <span class="meta">T½ ${d.half} · ${em.toFixed(2)} photons per decay</span></label>
      <div class="act"><input type="range" id="sa-${i}" min="-1" max="3.57" step="0.01" value="${Math.log10(s.kBq)}" aria-label="${s.name} activity"><em id="sv-${i}">${fmtAct(s.kBq)}</em></div>`;
    box.appendChild(el);
    el.querySelector('input[type=checkbox]').onchange = e => { s.on = e.target.checked; sourcesChanged(); };
    el.querySelector('input[type=range]').oninput = e => { s.kBq = Math.pow(10, +e.target.value); $('#sv-' + i).textContent = fmtAct(s.kBq); ref.dirty = true; renderRates(); };
  });
  $('#two-ctl').hidden = !st.sources.find(s => s.name === 'Two-line test').on;
}
function fmtAct(k) { const bq = k * 1000; return (k >= 1000 ? (k / 1000).toPrecision(3) + ' MBq' : k >= 1 ? k.toPrecision(3) + ' kBq' : (bq).toPrecision(3) + ' Bq') + ` (${(bq / 3.7e4).toPrecision(2)} µCi) · ${fmt(bq)} decays/s`; }
function sourcesChanged() {
  ref.dirty = true; renderSources(); fillLines();
  S3.setSource(activeSources().map(s => s.name).join(' + ') || 'No');
  renderRates();
}

// ================================================================ UI wiring
function seg(id, get, set) {
  const el = $(id), sync = () => el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(get()))));
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; set(b.dataset.v); sync(); });
  sync(); return sync;
}
const syncers = [];
function setTab(t) {
  st.tab = t;
  $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $$('.tab').forEach(d => { d.hidden = d.id !== 'tab-' + t; });
  if (t === 'spec') { drawSpec(); renderRates(); renderEff(); renderCalib(); }
  if (t === 'res') { drawRes(); drawTwo(); }
  if (t === 'chain') { drawWave(); drawMini(); }
}
function setMode(m) {
  st.mode = m;
  if (m === 'follow') { setRunning(false); S3 && S3.clearFlights(); setTab('chain'); if (st.f.ev) setStage(Math.max(0, st.f.stage)); }
  else { S3 && S3.clearFollow(); setTab('spec'); }
  if (S3) autoCamera();
  syncers.forEach(f => f());
}
function setLayout(l) {
  st.layout = l;
  if (l !== 'both' && st.f.det !== l) { st.f.det = l; $('#f-det').value = l; if (S3) emitPhoton(); }
  if (S3) { S3.setLayout(l, st.dist); if (st.mode === 'follow' && st.f.ev) S3.followEvent(st.f.det, st.f.ev, st.f.q, Math.min(st.f.stage, 3)); }
  st.peaks = null; if (st.tab === 'spec') { drawSpec(); renderRates(); renderEff(); }
  if (S3) { const show = l !== 'both'; S3.setLabels(show); $('#b-lab').setAttribute('aria-pressed', String(show)); }
  if (S3 && st.view === '3d') { st.closeUp = null; autoCamera(); if (!st.closeUp) fitCamera(); }
  syncers.forEach(f => f());
}
function bindRange(id, fmtv, onv) { const el = $(id), out = $(id + '-v'); const f = () => { const v = +el.value; if (out) out.textContent = fmtv(v); onv(v); }; el.addEventListener('input', f); return v => { el.value = v; if (out) out.textContent = fmtv(+v); }; }

function setupStatic() {
  // tabs, modes
  $$('.tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  syncers.push(seg('#mode', () => st.mode, setMode));
  syncers.push(seg('#det', () => st.layout, setLayout));
  $('#fold').onclick = () => { document.body.classList.toggle('folded'); $('#fold').textContent = document.body.classList.contains('folded') ? 'Show panel' : 'Hide panel'; };
  $('#b-cut').onclick = e => { const v = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', v); S3.setCutaway(v); };
  $('#b-lab').onclick = e => { const v = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', v); S3.setLabels(v); };
  // follow
  $('#f-det').onchange = e => { st.f.det = e.target.value; if (st.layout !== 'both') setLayout(st.f.det); emitPhoton(); syncNoise(); };
  $('#f-line').onchange = e => { st.f.lineE = +e.target.value; st.f.lineSrc = (lineOptions().find(o => o.E === st.f.lineE) || {}).src; emitPhoton(); };
  $('#f-scen').onchange = e => { st.f.scen = e.target.value; emitPhoton(); };
  $('#f-scen').value = st.f.scen;
  $('#f-emit').onclick = emitPhoton;
  $('#f-next').onclick = () => setStage(st.f.stage + 1);
  $('#f-prev').onclick = () => setStage(st.f.stage - 1);
  $('#f-replay').onclick = () => setStage(st.f.stage);
  $('#f-auto').onclick = e => { st.f.auto = !st.f.auto; e.currentTarget.setAttribute('aria-pressed', st.f.auto); if (st.f.auto && st.f.stage >= maxStage()) setStage(0); };
  $$('#steps li').forEach(li => li.onclick = () => setStage(+li.dataset.s));
  syncers.push(seg('#wz', () => st.f.wz, v => { st.f.wz = v; drawWave(); }));
  // electronics
  $('#c-fs').onchange = e => { cfg.fs = +e.target.value; electronicsChanged(); };
  $('#c-bits').onchange = e => { cfg.bits = +e.target.value; electronicsChanged(); };
  bindRange('#c-gain', v => v + ' keV', v => { cfg.gainFS = v; electronicsChanged(); });
  window._setNoiseUI = bindRange('#c-noise', v => v.toFixed(1) + ' keV/sample', v => { dets[st.f.det].dsp.noise = v; syncNoise(true); electronicsChanged(); });
  // spectrum
  $('#s-run').onclick = () => { if (st.mode !== 'build') setMode('build'); setRunning(!st.running); };
  $('#s-clear').onclick = () => resetAcq();
  $('#s-speed').onchange = e => { st.speed = +e.target.value; };
  syncers.push(seg('#s-scale', () => st.scale, v => { st.scale = v; drawSpec(); }));
  syncers.push(seg('#s-lay', () => st.lay, v => { st.lay = v; drawSpec(); }));
  $('#s-norm').onchange = e => { st.norm = e.target.checked; drawSpec(); };
  $('#s-marks').onchange = e => { st.marks = e.target.checked; drawSpec(); };
  $$('.zb').forEach(b => b.onclick = () => setZoom(...b.dataset.z.split(',').map(Number)));
  $('#z0').onchange = () => setZoom(+$('#z0').value, +$('#z1').value); $('#z1').onchange = () => setZoom(+$('#z0').value, +$('#z1').value);
  specPointer();
  // setup
  bindRange('#g-dist', v => v + ' cm', v => { st.dist = v; S3 && S3.setLayout(st.layout, v); ref.dirty = true; renderRates(); if (st.mode === 'follow') emitPhoton(); });
  bindRange('#g-bkg', v => v.toFixed(2) + ' γ/cm²/s', v => { st.bkg = v; ref.dirty = true; renderRates(); });
  $('#g-time').onchange = e => { st.acqTime = +e.target.value; };
  bindRange('#g-thr', v => v + ' keV', v => { cfg.threshold = v; });
  $('#g-pile').onchange = e => { cfg.pileup = e.target.checked; };
  $('#g-pur').onchange = e => { cfg.pur = e.target.checked; };
  const dimFmt = v => v.toFixed(2) + ' cm' + (Math.abs(v / 2.54 - Math.round(v / 2.54)) < 0.02 ? ` (${Math.round(v / 2.54)}″)` : '');
  bindRange('#d-hd', v => v.toFixed(1) + ' cm', v => { dets.hpge.crystal.R = v / 2; dims(); });
  bindRange('#d-hl', v => v.toFixed(1) + ' cm', v => { dets.hpge.crystal.L = v; dets.hpge.crystal.holeDepth = Math.max(0.5, v - 1.5); dims(); });
  bindRange('#d-nd', dimFmt, v => { dets.nai.crystal.R = v / 2; dims(); });
  bindRange('#d-nl', dimFmt, v => { dets.nai.crystal.L = v; dims(); });
  const twoSync = [bindRange('#t-c', v => v + ' keV', v => setTwo(v, null)), bindRange('#t-d', v => v.toFixed(1) + ' keV', v => setTwo(null, v))];
  const twoSync2 = [bindRange('#tl-c', v => v + ' keV', v => setTwo(v, null)), bindRange('#tl-d', v => v.toFixed(1) + ' keV', v => setTwo(null, v))];
  window._twoSync = () => { twoSync[0](st.two.c); twoSync[1](st.two.d); twoSync2[0](st.two.c); twoSync2[1](st.two.d); };
  // resolution
  syncers.push(seg('#r-what', () => st.resWhat, v => { st.resWhat = v; drawRes(); }));
  bindRange('#r-E', v => v + ' keV', v => { st.resE = v; drawRes(); });
  window._res = [
    bindRange('#p-F', v => v.toFixed(3), v => { dets.hpge.res.F = v; resChanged(); }),
    bindRange('#p-cc', v => (v * 1e4).toFixed(1) + '×10⁻⁴ E', v => { dets.hpge.res.cc = v; resChanged(); }),
    bindRange('#p-hn', v => v.toFixed(1) + ' keV/sample', v => { dets.hpge.dsp.noise = v; syncNoise(); resChanged(); }),
    bindRange('#p-pe', v => v.toFixed(1), v => { dets.nai.res.eta = v / dets.nai.res.LY; resChanged(); }),
    bindRange('#p-int', v => v.toFixed(1) + ' %', v => { dets.nai.res.intrinsic = v / 100; resChanged(); }),
    bindRange('#p-enf', v => v.toFixed(2), v => { dets.nai.res.enf = v; resChanged(); }),
    bindRange('#p-nn', v => v.toFixed(1) + ' keV/sample', v => { dets.nai.dsp.noise = v; syncNoise(); resChanged(); })];
  $('#p-reset').onclick = () => {
    for (const k of ['hpge', 'nai']) { dets[k].res = JSON.parse(JSON.stringify(DEF[k].res)); dets[k].dsp = JSON.parse(JSON.stringify(DEF[k].dsp)); }
    const r = window._res; r[0](0.1); r[1](0.00027); r[2](DEF.hpge.dsp.noise); r[3](DEF.nai.res.LY * DEF.nai.res.eta); r[4](DEF.nai.res.intrinsic * 100); r[5](DEF.nai.res.enf); r[6](DEF.nai.dsp.noise);
    syncNoise(); resChanged();
  };
  $('#tl-run').onclick = runTwoLine;
  renderSources(); renderNData(); buildGuides(); renderModel(); fillLines();
}
function syncAll() { syncers.forEach(f => f()); setTab(st.tab); syncNoise(); renderCalib(); window._twoSync(); }
function syncNoise(fromChain) {
  if (window._setNoiseUI) window._setNoiseUI(dets[st.f.det].dsp.noise);
  if (window._res) { window._res[2](dets.hpge.dsp.noise); window._res[6](dets.nai.dsp.noise); }
  $('#c-noise-d').textContent = '(' + DET_NAME[st.f.det] + ')';
}
function electronicsChanged() { resetAcq('Electronics changed: spectra cleared.'); reprocess(); renderCalib(); if (st.tab === 'res') { drawRes(); drawTwo(); } }
function resChanged() { resetAcq(); if (st.f.q && st.f.ev) { st.f.q = GP.quanta(dets[st.f.det], st.f.ev.Edep, st.f.ev); renderQuanta(); } reprocess(); drawRes(); drawTwo(); }
let dimT = null;
function dims() { clearTimeout(dimT); dimT = setTimeout(() => { S3.build(dets); S3.setLayout(st.layout, st.dist); S3.setSource(activeSources().map(s => s.name).join(' + ') || 'No'); resetAcq(); if (st.mode === 'follow') emitPhoton(); }, 150); }
function setTwo(c, d) {
  if (c != null) st.two.c = c; if (d != null) st.two.d = d; window._twoSync();
  drawTwo(); if (st.sources.find(s => s.name === 'Two-line test').on) { ref.dirty = true; fillLines(); }
}
function runTwoLine() {
  st.sources.forEach(s => { s.on = s.name === 'Two-line test'; });
  sourcesChanged(); resetAcq(); setLayout('both'); setMode('build');
  const half = Math.max(GP.modelFWHM(dets.nai, st.two.c, cfg) * 2, st.two.d * 2.5);
  setZoom(st.two.c - half, st.two.c + half); setRunning(true);
}
function setZoom(a, b) {
  if (!(b > a)) return; a = Math.max(0, a); b = Math.min(cfg.gainFS, b); if (b - a < 2) b = a + 2;
  st.zoom = [a, b]; $('#z0').value = Math.round(a * 10) / 10; $('#z1').value = Math.round(b * 10) / 10; drawSpec();
}
function specPointer() {
  const cv = $('#cv-spec'); let x0 = null;
  const px = e => { const r = cv.getBoundingClientRect(); return e.clientX - r.left; };
  cv.addEventListener('pointerdown', e => { x0 = px(e); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (x0 == null) return; const x = px(e); if (Math.abs(x - x0) > 6) { st.sel = [x0, x]; drawSpec(); } });
  cv.addEventListener('pointerup', e => {
    if (x0 == null) return; const x = px(e), m = cv._map; st.sel = null;
    if (m && Math.abs(x - x0) > 8) setZoom(m.x2E(Math.min(x, x0)), m.x2E(Math.max(x, x0)));
    else if (m) measureAt(m.x2E(x));
    x0 = null; drawSpec();
  });
}
function measureAt(E) {
  const res = [];
  for (const k of activeDets()) {
    const b = cfg.gainFS / dets[k].channels, fw = GP.modelFWHM(dets[k], E, cfg);
    const r = GP.measurePeak(acq[k].hist, b, E, Math.max(1.2 * fw, 4 * b));
    res.push({ key: k, res: r, model: r ? GP.modelFWHM(dets[k], r.centroid, cfg) : fw });
  }
  st.peaks = res;
  const overlapNote = '<p class="hint">The quick FWHM estimate assumes an isolated peak on a straight background. Where peaks overlap (for example Co-60 or Ba-133 in NaI(Tl)) it is biased.</p>';
  const known = markersFor().map(m => m.E);
  $('#peak').innerHTML = res.map(p => {
    if (!p.res) return `<div class="pk" style="border-color:${COL[p.key]}"><b style="color:${COL[p.key]}">${DET_NAME[p.key]}</b>: no clear peak here (need more counts).</div>`;
    const r = p.res, near = known.length ? known.reduce((a, b) => Math.abs(b - r.centroid) < Math.abs(a - r.centroid) ? b : a) : null;
    return `<div class="pk" style="border-color:${COL[p.key]}"><b style="color:${COL[p.key]}">${DET_NAME[p.key]}</b> centroid <b>${r.centroid.toFixed(2)} keV</b>${near && Math.abs(near - r.centroid) < 3 * r.fwhm ? ` (line at ${near.toFixed(2)})` : ''}<br>
      FWHM <b>${r.fwhm.toFixed(2)} keV</b> · R = FWHM/E = <b>${r.R.toFixed(2)} %</b><br><span class="muted">Model FWHM ${p.model.toFixed(2)} keV · net area ≈ ${fmt(r.net)} counts</span></div>`;
  }).join('') + overlapNote;
}

// ================================================================ guided demos
const GUIDES = [
  { title: 'Full-energy absorption', desc: 'Follow one Cs-137 photon that deposits all its energy, through every stage to its histogram bin.',
    steps: [
      { t: 'NaI(Tl), Cs-137, event type "Full-energy absorption". Watch the photon enter and interact. Press Next.', a: () => prep('follow', 'nai', ['Cs-137'], () => { st.f.scen = 'full'; $('#f-scen').value = 'full'; emitPhoton(); setStage(1); }) },
      { t: 'The energy ledger shows deposited = 661.66 keV: nothing escaped. Often it takes a Compton scatter first and then photoabsorption: still full energy.', a: () => setStage(1) },
      { t: 'Light and photoelectrons: the deposited energy becomes a few thousand photoelectrons. Their count fluctuates, so the measured energy will too.', a: () => setStage(2) },
      { t: 'Preamp step, ADC samples, then the digital trapezoid. The flat top is the energy estimate.', a: () => { st.f.auto = false; setStage(6); } },
      { t: 'The event lands in the photopeak bin. Now set Event type to "Random" and emit a few photons: most do NOT give a full-energy pulse.', a: () => setStage(7) }] },
  { title: 'Compton escape', desc: 'A photon scatters and leaves the crystal. Its partial energy builds the Compton continuum.',
    steps: [
      { t: 'HPGe, Cs-137, event type "Compton, photon escapes". The scattered photon (orange) leaves with part of the energy.', a: () => prep('follow', 'hpge', ['Cs-137'], () => { st.f.scen = 'partial'; $('#f-scen').value = 'partial'; emitPhoton(); setStage(1); }) },
      { t: 'Deposited energy depends on the scattering angle. The maximum (180° scatter) is the Compton edge: 477.3 keV for 661.7 keV photons.', a: () => setStage(1) },
      { t: 'Follow this partial deposit to the histogram: it lands below the photopeak, in the continuum.', a: () => setStage(7) },
      { t: 'Now a whole spectrum. Look for the continuum ending at the Compton edge near 477 keV and the backscatter region near 184 keV.', a: () => prep('build', 'hpge', ['Cs-137'], () => { setZoom(0, 750); st.scale = 'log'; syncers.forEach(f => f()); setRunning(true); }) }] },
  { title: 'Mixed-source identification', desc: 'Three sources at once. Identify them from their peak energies.',
    steps: [
      { t: 'Both detectors, a mixed source, acquiring. Line markers are hidden. Find the strongest peaks and read their energies (tap a peak).', a: () => prep('build', 'both', ['Cs-137', 'Co-60', 'Ba-133'], () => { st.marks = false; $('#s-marks').checked = false; st.scale = 'log'; syncers.forEach(f => f()); setZoom(0, 1450); st.speed = 100; $('#s-speed').value = '100'; setRunning(true); }) },
      { t: 'Hints: one isolated line near 662 keV; a pair near 1173 and 1332 keV; a cluster from 276 to 384 keV plus 81 keV. Which nuclides?', a: () => {} },
      { t: 'Answer: Cs-137 (661.7), Co-60 (1173.2 + 1332.5), Ba-133 (81.0, 276.4, 302.9, 356.0, 383.8). Markers are back on. Compare how cleanly each detector separates the Ba-133 cluster.', a: () => { st.marks = true; $('#s-marks').checked = true; setZoom(250, 420); } }] },
  { title: 'Resolution comparison', desc: 'The Ba-133 doublet at 79.6 and 81.0 keV, then a two-line test with adjustable separation.',
    steps: [
      { t: 'Ba-133 in both detectors, zoomed to 70–92 keV. HPGe shows two peaks (79.61 and 81.00 keV). NaI(Tl) shows one broad bump.', a: () => prep('build', 'both', ['Ba-133'], () => { st.speed = 100; $('#s-speed').value = '100'; setZoom(70, 92); st.scale = 'lin'; st.lay = 'stack'; syncers.forEach(f => f()); setRunning(true); }) },
      { t: 'Tap the 81 keV peak to measure FWHM and R. Then zoom to the 356 keV peak (300–400 keV) and measure again: R falls with energy for both detectors.', a: () => {} },
      { t: 'Resolution tab: move the separation slider. Peaks merge once ΔE drops below roughly one FWHM. Press "Acquire this as a spectrum" to test it.', a: () => setTab('res') }] },
  { title: 'High-rate pile-up', desc: 'A strong Co-60 source close to the detector: dead time and summed pulses.',
    steps: [
      { t: 'NaI(Tl), Co-60 at 3.7 MBq, 2 cm away, pile-up modelled, rejection off. Watch the dead time and counts above 1332 keV.', a: () => prep('build', 'nai', ['Co-60'], () => { const s = st.sources.find(x => x.name === 'Co-60'); s.kBq = 3700; renderSources(); setDist(2); cfg.pileup = true; cfg.pur = false; $('#g-pile').checked = true; $('#g-pur').checked = false; st.scale = 'log'; syncers.forEach(f => f()); setZoom(0, 3000); st.speed = 1; $('#s-speed').value = '1'; setRunning(true); }) },
      { t: 'Piled-up pulses add their energies: counts appear above 1332 keV (up to 2505 keV), and the peaks get distorted. Check the dead time in the Rates table.', a: () => {} },
      { t: 'Switch on pile-up rejection. The sum region clears, but more events are discarded: dead time rises further.', a: () => { cfg.pur = true; $('#g-pur').checked = true; resetAcq(); setRunning(true); } },
      { t: 'Move the source to 30 cm. The rate falls by ~100×, and pile-up mostly disappears. Intensity changes counts, never the line energies.', a: () => { setDist(30); resetAcq(); setRunning(true); } }] }
];
let G = null;
function prep(mode, layout, srcs, then) {
  setRunning(false);
  st.sources.forEach(s => { s.on = srcs.includes(s.name); s.kBq = 37; });
  sourcesChanged(); setDist(10); cfg.pur = false; $('#g-pur').checked = false;
  st.marks = true; $('#s-marks').checked = true; st.lay = 'over';
  resetAcq();
  if (layout !== 'both') { st.f.det = layout; $('#f-det').value = layout; }
  setLayout(layout); setMode(mode); syncers.forEach(f => f());
  then && then();
}
function setDist(v) { st.dist = v; $('#g-dist').value = v; $('#g-dist-v').textContent = v + ' cm'; S3.setLayout(st.layout, v); ref.dirty = true; }
function buildGuides() {
  $('#guides').innerHTML = GUIDES.map((g, i) => `<div class="gcard"><h3>${g.title}</h3><p>${g.desc}</p><button type="button" class="pri" data-g="${i}">Start demo</button></div>`).join('') +
    '<p class="hint">Each demo sets up the controls for you. Use Next and Back on the card over the 3D view.</p>';
  $$('#guides button').forEach(b => b.onclick = () => startGuide(+b.dataset.g));
  $('#g-close').onclick = () => { G = null; $('#guide').hidden = true; };
  $('#g-next').onclick = () => guideStep(G.i + 1);
  $('#g-prev').onclick = () => guideStep(G.i - 1);
}
function startGuide(i) { G = { g: GUIDES[i], i: -1 }; $('#guide').hidden = false; $('#g-title').textContent = G.g.title; guideStep(0); }
function guideStep(i) {
  if (!G) return; const n = G.g.steps.length;
  if (i >= n) { G = null; $('#guide').hidden = true; return; }
  i = Math.max(0, i); G.i = i;
  $('#g-step').textContent = `${i + 1} / ${n}`; $('#g-text').textContent = G.g.steps[i].t;
  $('#g-next').textContent = i === n - 1 ? 'Finish' : 'Next'; $('#g-prev').disabled = i === 0;
  try { G.g.steps[i].a(); } catch (e) { console.error(e); }
  if (st.mode === 'follow' && st.f.ev) { renderLedger(); renderQuanta(); }
}

// ================================================================ about the model
function renderModel() {
  $('#model-text').innerHTML = `
  <h3>What this is</h3>
  <p>An <b>educational approximation</b>, not a laboratory-grade simulation. Every animated event is one Monte Carlo photon history, and that same history produces the deposited energy, the pulse, the energy estimate and the histogram entry.</p>
  <h3>Simulated</h3>
  <ul>
    <li>Point source on the detector axis; photons sampled into the cone of the crystal front face (Ω/4π shown in the Rates table).</li>
    <li>Entrance window (Al) and, for HPGe, a 0.7 mm Ge dead layer. Photons absorbed there give no signal.</li>
    <li>Photon transport in a cylindrical crystal (HPGe with a core hole) using NIST total attenuation coefficients.
        Compton scattering by Klein–Nishina; pair production above 1022 keV with two back-to-back 511 keV annihilation photons; photoabsorption with K x-ray fluorescence (Ge, I) that can escape.</li>
    <li>HPGe signal: N = E/2.96 eV electron–hole pairs with Fano statistics, a charge-collection term, carrier drift times and Ramo weighting to shape the rising edge.</li>
    <li>NaI(Tl) signal: 38 photons/keV, intrinsic non-proportionality spread, binomial light collection × quantum efficiency, PMT gain with an excess-noise factor, 230 ns scintillation decay.</li>
    <li>Charge-sensitive preamp (τ = 50 µs), white electronic noise, ADC sampling and quantization, Jordanov trapezoidal filter with pole-zero correction, linear calibration, histogramming.</li>
    <li>Poisson arrival times, non-paralyzable dead time per processed pulse, pile-up (summing) or pile-up rejection.</li>
    <li>Background: an illustrative mix of natural lines (K-40, U and Th series) and a falling continuum on the front face.</li>
  </ul>
  <h3>Approximations and omissions</h3>
  <ul>
    <li>Photoelectric coefficient = total − Klein–Nishina − pair (coherent scattering counted as absorption; binding effects on Compton ignored). Pair coefficients are scaled estimates.</li>
    <li>Electrons and positrons deposit energy at the interaction point (no electron range, bremsstrahlung escape or positron annihilation in flight).</li>
    <li>No scattering in surrounding materials (no backscatter peak from shielding), no side entry, no true-coincidence summing for cascades (Co-60), no angular correlation of Na-22 511 keV photons.</li>
    <li>Fast "Build a spectrum" mode applies the filtered electronic noise statistically rather than digitizing every waveform; the "Follow one photon" mode digitizes the full waveform. Both use the same noise level (checked in validation).</li>
    <li>Ballistic deficit, trapping maps, PMT non-linearity, temperature drift and baseline restoration are not modelled.</li>
    <li>All resolution and electronics parameters are illustrative defaults and can be changed.</li>
  </ul>
  <h3>References</h3>
  <ul>
    <li>DDEP / LNHB Recommended Data, Table de Radionucléides: <a href="http://www.lnhb.fr/home/nuclear-physics-data/" target="_blank" rel="noopener">lnhb.fr</a> (γ energies and emission probabilities, K-40).</li>
    <li>J. H. Hubbell, S. M. Seltzer, X-Ray Mass Attenuation Coefficients, NIST Standard Reference Database 126: <a href="https://physics.nist.gov/PhysRefData/XrayMassCoef/" target="_blank" rel="noopener">physics.nist.gov</a> (Ge, Na, I, Al).</li>
    <li>G. F. Knoll, <i>Radiation Detection and Measurement</i>, 4th ed., Wiley (2010).</li>
    <li>G. Gilmore, <i>Practical Gamma-ray Spectrometry</i>, 2nd ed., Wiley (2008).</li>
    <li>V. T. Jordanov, G. F. Knoll, Digital synthesis of pulse shapes in real time for high resolution radiation spectroscopy, <i>Nucl. Instrum. Meth. A</i> 345 (1994) 337.</li>
    <li>O. Klein, Y. Nishina, <i>Z. Phys.</i> 52 (1929) 853; J. C. Butcher, H. Messel, <i>Nucl. Phys.</i> 20 (1960) 15 (sampling method).</li>
    <li>S. Ramo, Currents induced by electron motion, <i>Proc. IRE</i> 27 (1939) 584.</li>
    <li>Background line energies: ENSDF via <a href="https://www.nndc.bnl.gov/" target="_blank" rel="noopener">NNDC</a>.</li>
  </ul>
  <h3>Validation</h3>
  <p>A script in the project (<code>gamma/validate.js</code>) checks energy conservation, calibration, peak positions, intensity scaling and resolution behaviour. See the README for the checklist and the latest results.</p>`;
}
})();
