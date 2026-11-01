// 소호랩: 3D 사무실, 내 캐릭터, 같은 층 사람들, 책상 정보 카드, 메모 말풍선.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  RELAY_URL, SITE, FLOORS, SEATS, MAX_MEMOS, MAX_LINKS, LIMITS, SKIN_TONES, CHAR_TYPES, GENDERS, OUTFITS, ACCESSORIES, ACTIONS,
  randomName, defaultLook, defaultProfile, safeUrl, hostOf,
} from './data.js';
import { PETS } from './blocky.js';
import { Avatar, FONT } from './avatar.js';
import { buildOffice, collide, paintScreen, SPAWN, ROOM } from './world.js';
import { Net } from './net.js';

const Q = new URLSearchParams(location.search);
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
  get(k, d) { try { const v = localStorage.getItem('soho.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('soho.' + k, JSON.stringify(v)); } catch {} },
};
const clampFloor = (n) => (Number.isInteger(n) && n >= 1 && n <= FLOORS ? n : 0);
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

// ───────── 상태 ─────────
const firstVisit = !store.get('look', null);
const S = {
  look: { ...defaultLook(), ...store.get('look', {}) },
  name: store.get('name', '') || randomName(),
  profile: { ...defaultProfile(), ...store.get('profile', {}) },
  floor: clampFloor(+Q.get('f')) || 0,
  seat: -1,
  sitting: false,
  entered: false,
  peers: new Map(), // id → { av, pf, st, seat, tx, tz, try }
  memoAuto: store.get('memoAuto', true),
  othersMemo: store.get('othersMemo', true),
  walkTo: null,
};
if (!store.get('name', '')) store.set('name', S.name);

// ───────── 3D 기본 ─────────
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: Q.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#14161c');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
const hemi = new THREE.HemisphereLight('#cdd6ff', '#4a3a2e', 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0dc', 1.3);
sun.position.set(6, 16, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 13, bottom: -13, near: 1, far: 40 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  // 세로 휴대폰 화면은 좌우가 좁으니 더 넓게 보고, 조금 더 멀리서
  camera.fov = camera.aspect < 0.8 ? 62 : 50;
  camera.updateProjectionMatrix();
}
const far = () => (camera.aspect < 0.8 ? 1.45 : 1);
addEventListener('resize', resize);
resize();

let office;
let me;

// ───────── 낮·밤 ─────────
function applyTime() {
  const h = Q.has('hour') ? +Q.get('hour') : new Date().getHours();
  office.paintSky(h);
  const night = h < 6 || h >= 19, day = h >= 8 && h < 17;
  hemi.intensity = day ? 1.35 : night ? 0.8 : 1.0;
  sun.intensity = day ? 1.8 : 1.2;
  sun.color.set(day ? '#fff6ea' : '#ffe6c8');
}

// ───────── 카메라 ─────────
const cam = { yaw: Math.PI, pitch: 0.42, dist: 5.2, target: new THREE.Vector3(0, 1.2, 0), wantYaw: null, wantDist: null };
function placeCamera(dt) {
  if (!S.entered || !me) {
    // 첫 화면: 사무실 남쪽 벽 앞에서 천천히 좌우로 둘러본다
    const a = Math.sin(performance.now() / 1000 * 0.06 + 0.4);
    camera.position.set(a * 9, 3.1, 9.6);
    camera.lookAt(-a * 2.5, 0.9, -4.5);
    return;
  }
  const p = me.group.position;
  const k = Math.min(1, dt * 6);
  // 앉아 있으면 내 모니터 쪽을 본다 (머리 너머로 화면이 보이게)
  const ry = me.group.rotation.y, ahead = S.sitting ? 0.9 : 0;
  cam.target.x += (p.x + Math.sin(ry) * ahead - cam.target.x) * k;
  cam.target.z += (p.z + Math.cos(ry) * ahead - cam.target.z) * k;
  cam.target.y += ((S.sitting ? 1.1 : 1.25) - cam.target.y) * k;
  if (cam.wantYaw != null) { cam.yaw = lerpAngle(cam.yaw, cam.wantYaw, Math.min(1, dt * 4)); if (Math.abs(Math.atan2(Math.sin(cam.wantYaw - cam.yaw), Math.cos(cam.wantYaw - cam.yaw))) < 0.01) cam.wantYaw = null; }
  if (cam.wantDist != null) { cam.dist += (cam.wantDist - cam.dist) * Math.min(1, dt * 4); if (Math.abs(cam.wantDist - cam.dist) < 0.02) cam.wantDist = null; }
  const cp = Math.cos(cam.pitch);
  let x = cam.target.x + Math.sin(cam.yaw) * cp * cam.dist;
  let z = cam.target.z + Math.cos(cam.yaw) * cp * cam.dist;
  const y = Math.min(ROOM.H - 0.25, cam.target.y + Math.sin(cam.pitch) * cam.dist);
  x = Math.max(ROOM.minX - 0.2, Math.min(ROOM.maxX + 0.2, x));
  z = Math.max(ROOM.minZ - 0.2, Math.min(ROOM.maxZ + 0.2, z));
  camera.position.set(x, y, z);
  camera.lookAt(cam.target);
}
// 앉으면 어깨 너머로 내 모니터가 보이게
function camBehind(ry, dist) { cam.wantYaw = ry + Math.PI + 0.35; cam.wantDist = dist * far(); cam.pitch = 0.7; }

// ───────── 입력 ─────────
const keys = new Set();
const typing = () => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName);
addEventListener('keydown', (e) => {
  if (typing() || !S.entered) return;
  keys.add(e.code);
  if (e.code === 'Escape') closeAll();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// 끌어서 돌리기 / 누르기
const ptr = { down: false, x: 0, y: 0, moved: 0, id: null };
const touches = new Map();
canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size > 1) { ptr.moved = 99; return; }
  Object.assign(ptr, { down: true, x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId });
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const prev = touches.get(e.pointerId);
  if (touches.size === 2 && prev) {
    // 두 손가락: 멀리·가까이
    const [a, b] = [...touches.values()];
    const before = Math.hypot(a.x - b.x, a.y - b.y);
    prev.x = e.clientX; prev.y = e.clientY;
    const [c, d] = [...touches.values()];
    const after = Math.hypot(c.x - d.x, c.y - d.y);
    cam.dist = Math.max(1.8, Math.min(14, cam.dist * (before / Math.max(1, after))));
    cam.wantDist = null;
    return;
  }
  if (prev) { prev.x = e.clientX; prev.y = e.clientY; }
  if (!ptr.down || e.pointerId !== ptr.id) return;
  const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
  ptr.moved += Math.abs(dx) + Math.abs(dy);
  ptr.x = e.clientX; ptr.y = e.clientY;
  if (ptr.moved > 6 && S.entered) {
    cam.yaw -= dx * 0.006;
    cam.pitch = Math.max(0.05, Math.min(1.25, cam.pitch + dy * 0.004));
    cam.wantYaw = null;
  }
});
const endPtr = (e) => {
  touches.delete(e.pointerId);
  if (e.pointerId !== ptr.id) return;
  if (ptr.down && ptr.moved <= 6 && e.type === 'pointerup') pick(e.clientX, e.clientY);
  ptr.down = false;
};
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', (e) => {
  if (!S.entered) return;
  cam.dist = Math.max(1.8, Math.min(14, cam.dist * (1 + Math.sign(e.deltaY) * 0.1)));
  cam.wantDist = null;
  e.preventDefault();
}, { passive: false });

// 조이스틱 (휴대폰)
const joy = { x: 0, y: 0 };
{
  const el = $('#joystick'), knob = el.querySelector('.knob');
  let id = null;
  const set = (e) => {
    const r = el.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    joy.x = x; joy.y = y;
    knob.style.transform = `translate(${x * 32}px, ${y * 32}px)`;
  };
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; el.setPointerCapture(id); set(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
  const end = () => { id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// ───────── 누르기: 책상·모니터·캐릭터·엘리베이터·커피 ─────────
const ray = new THREE.Raycaster();
function pick(x, y) {
  if (!S.entered) return;
  const v = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(v, camera);
  const targets = [...office.clickables, me.hit, ...[...S.peers.values()].map((p) => p.av.hit)];
  // 앉아 있으면 카메라가 내 어깨 너머라 내 몸이 먼저 맞기 쉽다 → 내 몸은 다른 게 없을 때만
  const hits = ray.intersectObjects(targets, false);
  const hit = hits.find((h) => !h.object.userData.me) || hits[0];
  if (!hit) { closeCard(); return; }
  const u = hit.object.userData;
  if (u.peer) { const p = S.peers.get(u.peer); if (p) openCard(p.seat, u.peer); return; }
  if (u.me) { openCard(S.seat, 'me'); return; }
  if (u.seat !== undefined) { openCard(u.seat); return; }
  if (u.kind === 'elevator') openFloors();
  else if (u.kind === 'coffee') goCoffee();
  else if (u.kind === 'board') openModal('guide-modal');
}

// ───────── 자리 ─────────
function ownerOf(i) {
  if (i === S.seat) return 'me';
  for (const [id, p] of S.peers) if (p.seat === i && p.pf) return id;
  return null;
}

function standPoint(seat) {
  const ax = seat.x - seat.desk.x, az = seat.z - seat.desk.z, l = Math.hypot(ax, az);
  return { x: seat.x + (ax / l) * 0.6, z: seat.z + (az / l) * 0.6 };
}

function sitDown() {
  const seat = office.seats[S.seat];
  if (!seat) return;
  S.walkTo = null;
  S.sitting = true;
  me.seated = true;
  me.speed = 0;
  me.group.position.set(seat.x, 0.42, seat.z);
  me.group.rotation.y = seat.ry;
  camBehind(seat.ry, 3.2);
  sendState(true);
  refreshScreen(S.seat);
  renderActions();
}

function standUp() {
  const seat = office.seats[S.seat];
  S.sitting = false;
  me.seated = false;
  me.stop();
  if (seat) { const p = standPoint(seat); me.group.position.set(p.x, 0, p.z); }
  else me.group.position.y = 0;
  sendState(true);
  refreshScreen(S.seat);
  renderActions();
}

// 내 자리까지 걸어간 뒤 앉기 (막히면 바로 앉기)
function goSit() {
  const seat = office.seats[S.seat];
  if (!seat) return;
  if (S.sitting) return;
  const p = standPoint(seat);
  S.walkTo = { x: p.x, z: p.z, then: sitDown, t: 0, best: Infinity, stuck: 0 };
}

function goCoffee() {
  if (S.sitting) standUp();
  S.walkTo = { x: 13.7, z: 2.1, t: 0, best: Infinity, stuck: 0, then: () => { me.group.rotation.y = Math.PI / 2; doAct('coffee'); } };
}

function moveToSeat(n) {
  if (!net.online) { setMySeat(n); return; }
  net.askSeat(n);
}
function setMySeat(n) {
  const old = S.seat;
  const wasSitting = S.sitting;
  if (wasSitting) standUp();
  S.seat = n;
  store.set('seat' + S.floor, n);
  refreshScreen(old);
  refreshScreen(n);
  goSit();
  closeCard();
  toast(`${n + 1}번 책상으로 옮겨요`);
}

// ───────── 모니터 화면 ─────────
function screenInfo(i) {
  const o = ownerOf(i);
  if (!o) return { state: 'empty' };
  const pf = o === 'me' ? myPf() : S.peers.get(o).pf;
  const sit = o === 'me' ? S.sitting : !!S.peers.get(o).st?.sit;
  return { state: sit ? 'busy' : 'away', name: pf.n, now: pf.now, title: pf.links?.[0]?.t || '', mine: o === 'me' };
}
function refreshScreen(i) {
  const seat = office?.seats[i];
  if (!seat) return;
  seat.screen.info = screenInfo(i);
  paintScreen(seat);
}
function refreshAllScreens() { office.seats.forEach((s) => refreshScreen(s.i)); }
// 앉아서 일하는 화면은 코드가 한 줄씩 늘어난다 (가까운 화면만 다시 그림)
let screenT = 0;
function tickScreens(dt) {
  screenT += dt;
  if (screenT < 0.6) return;
  screenT = 0;
  for (const seat of office.seats) {
    if (seat.screen.info.state !== 'busy') continue;
    const d = camera.position.distanceTo(seat.screen.mesh.getWorldPosition(_v));
    if (d > 13) continue;
    const c = seat.screen.code;
    c.blink = !c.blink;
    if (Math.random() < 0.55) c.n = c.n >= c.lines.length ? 4 : c.n + 1;
    paintScreen(seat);
  }
}
const _v = new THREE.Vector3();

// ───────── 내 정보 ─────────
function myPf() {
  const p = S.profile;
  return { n: S.name, look: S.look, intro: p.intro, now: p.now, memos: p.memos.slice(0, MAX_MEMOS), links: p.links.slice(0, MAX_LINKS), auto: S.memoAuto };
}
let lastSent = null, sendT = 0;
function sendState(force) {
  if (!me) return;
  const p = me.group.position;
  const st = { x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +me.group.rotation.y.toFixed(2), sit: S.sitting };
  if (!force && lastSent && Math.abs(st.x - lastSent.x) < 0.03 && Math.abs(st.z - lastSent.z) < 0.03 && Math.abs(st.ry - lastSent.ry) < 0.05 && st.sit === lastSent.sit) return;
  lastSent = st;
  net.sendState(st);
}
function memosOf(pf) { return pf.auto === false ? [] : pf.memos; }

// ───────── 같은 층 사람들 ─────────
function addOrUpdatePeer(id, pf, seat) {
  let p = S.peers.get(id);
  if (!p) {
    const av = new Avatar(pf.look, pf.n);
    av.hit.userData.peer = id;
    scene.add(av.group);
    p = { av, pf, st: null, seat: seat ?? -1, tx: SPAWN.x, tz: SPAWN.z, try: SPAWN.ry, shown: false };
    av.group.visible = false; // 위치(st)를 받으면 보인다
    S.peers.set(id, p);
    if (S.entered && S.ready) toast(`${pf.n} 님이 출근했어요`);
  } else {
    if (JSON.stringify(p.pf.look) !== JSON.stringify(pf.look)) p.av.setLook(pf.look);
    if (p.pf.n !== pf.n) p.av.setName(pf.n);
    p.pf = pf;
    if (seat !== undefined) p.seat = seat;
  }
  p.av.allMemos = pf.memos;
  p.av.setMemos(S.othersMemo ? memosOf(pf) : []);
  if (p.seat >= 0) refreshScreen(p.seat);
  updatePeople();
}

function peerState(id, st) {
  const p = S.peers.get(id);
  if (!p) return;
  const wasSit = p.st?.sit;
  p.st = st;
  p.tx = st.x; p.tz = st.z; p.try = st.ry;
  if (!p.shown) { p.shown = true; p.av.group.visible = true; p.av.group.position.set(st.x, 0, st.z); p.av.group.rotation.y = st.ry; }
  if (wasSit !== st.sit && p.seat >= 0) refreshScreen(p.seat);
}

function removePeer(id) {
  const p = S.peers.get(id);
  if (!p) return;
  p.av.dispose();
  S.peers.delete(id);
  if (p.seat >= 0) refreshScreen(p.seat);
  if (cardFor?.peer === id) closeCard();
  updatePeople();
  return p;
}

function clearPeers() {
  for (const id of [...S.peers.keys()]) removePeer(id);
}

function updatePeers(dt) {
  for (const p of S.peers.values()) {
    const g = p.av.group;
    if (!p.shown) continue;
    const sit = !!p.st?.sit;
    const seat = office.seats[p.seat];
    let tx = p.tx, tz = p.tz, ty = 0, tr = p.try;
    if (sit && seat) { tx = seat.x; tz = seat.z; ty = 0.42; tr = seat.ry; }
    const dx = tx - g.position.x, dz = tz - g.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 4) { g.position.set(tx, ty, tz); p.av.speed = 0; }
    else {
      const k = Math.min(1, dt * 8);
      g.position.x += dx * k; g.position.z += dz * k;
      g.position.y = ty;
      p.av.speed = sit ? 0 : Math.min(5, (d * k) / Math.max(dt, 1e-3));
    }
    g.rotation.y = lerpAngle(g.rotation.y, tr, Math.min(1, dt * 10));
    p.av.seated = sit;
    p.av.update(dt, ACTIONS);
  }
}

function updatePeople() {
  const n = S.peers.size + (S.entered ? 1 : 0);
  $('#hud-people').textContent = n;
  office?.paintBoard(S.floor || 1, n);
}

// ───────── 네트워크 ─────────
const net = new Net({
  onHello(m) {
    clearPeers();
    S.ready = false;
    for (const p of m.peers) {
      addOrUpdatePeer(p.id, p.pf, p.seat);
      if (p.st) peerState(p.id, p.st);
    }
    S.ready = true;
    const first = S.seat < 0;
    if (S.seat !== m.seat) {
      const old = S.seat;
      S.seat = m.seat;
      store.set('seat' + S.floor, m.seat);
      refreshScreen(old);
    }
    // 처음 들어오면 엘리베이터에서 내 책상까지 걸어가 앉는다
    if (first) goSit(); else if (S.sitting) sitDown();
    refreshAllScreens();
    sendState(true);
  },
  onState: peerState,
  onProfile: (id, pf, seat) => { addOrUpdatePeer(id, pf, seat); },
  onSeat(id, n) {
    if (id === net.selfId) { setMySeat(n); return; }
    const p = S.peers.get(id);
    if (!p) return;
    const old = p.seat;
    p.seat = n;
    refreshScreen(old);
    refreshScreen(n);
  },
  onSeatNo() { toast('그 자리는 방금 다른 분이 앉았어요'); },
  onAct(id, d) {
    const p = S.peers.get(id);
    if (!p) return;
    if (d.m !== undefined) { if (S.othersMemo) p.av.pin(d.m); }
    else if (d.a) p.av.play(d.a);
  },
  onLeave(id) {
    const p = removePeer(id);
    if (p && S.entered) toast(`${p.pf.n} 님이 퇴근했어요`);
  },
  onFull(floor) {
    toast(`${floor}층은 20자리가 다 찼어요. 다른 층을 골라 주세요`);
    openFloors();
  },
  onReset() { clearPeers(); },
  onStatus(s) {
    const chip = $('#net-chip');
    chip.hidden = s === 'online';
    chip.textContent = s === 'solo' ? '혼자 보기 (서버 연결 안 됨)' : '다시 연결하는 중…';
    if (s === 'solo' && S.entered && S.seat < 0) {
      S.seat = Math.max(0, store.get('seat' + S.floor, 0));
      goSit();
      refreshAllScreens();
    }
  },
});

// ───────── 출근 · 층 바꾸기 ─────────
async function pickDefaultFloor() {
  const saved = clampFloor(store.get('floor', 0));
  const counts = await net.counts();
  if (!counts) return saved || 1;
  // 이전 층이 비어 있지 않고 자리가 있으면 그대로, 아니면 사람이 가장 많은(자리 남은) 층
  if (saved && counts[saved - 1] < SEATS) return saved;
  let best = 1, bestN = -1;
  counts.forEach((n, i) => { if (n < SEATS && n > bestN) { best = i + 1; bestN = n; } });
  return best;
}

function fade(on) { $('#fade').classList.toggle('on', on); return new Promise((r) => setTimeout(r, on ? 360 : 0)); }

async function enter(floor) {
  await fade(true);
  closeAll();
  S.floor = floor;
  store.set('floor', floor);
  history.replaceState(null, '', `?f=${floor}${Q.has('relay') ? '&relay=' + Q.get('relay') : ''}${Q.has('solo') ? '&solo' : ''}`);
  clearPeers();
  const old = S.seat;
  S.seat = -1;
  refreshScreen(old);
  S.sitting = false;
  if (!me) {
    me = new Avatar(S.look, S.name, { mine: true });
    me.hit.userData.me = true;
    scene.add(me.group);
  }
  me.seated = false;
  me.setMemos(S.memoAuto ? S.profile.memos : []);
  me.allMemos = S.profile.memos;
  me.group.position.set(SPAWN.x, 0, SPAWN.z);
  me.group.rotation.y = SPAWN.ry;
  cam.yaw = 0; cam.pitch = 0.42; cam.dist = 5.2 * far();
  cam.target.set(SPAWN.x, 1.2, SPAWN.z);
  S.entered = true;
  $('#intro').hidden = true;
  $('#hud').hidden = false;
  $('#hud-floor').textContent = `${floor}F`;
  office.paintFloor(floor);
  updatePeople();
  renderMemoBar();
  renderActions();
  net.sendProfile(myPf());
  if (Q.has('demo')) { demo(+Q.get('demo') || 12); }
  else net.join(floor, store.get('seat' + floor, -1));
  if (!RELAY_URL && !Q.has('demo')) { S.seat = Math.max(0, store.get('seat' + floor, 0)); goSit(); refreshAllScreens(); }
  await fade(false);
  if (!store.get('seenGuide', false)) { store.set('seenGuide', true); setTimeout(() => toast('책상·모니터·캐릭터를 누르면 그 분의 작업을 볼 수 있어요', 6000), 1200); }
}

function leave() {
  net.leave();
  clearPeers();
  const old = S.seat;
  S.seat = -1;
  S.sitting = false;
  S.entered = false;
  refreshScreen(old);
  if (me) { me.dispose(); me = null; }
  $('#hud').hidden = true;
  closeAll();
  showIntro();
}

// ───────── 동작 · 메모 ─────────
function doAct(id) {
  if (!me) return;
  me.play(id);
  net.sendAct({ a: id });
}

function renderActions() {
  const el = $('#actions');
  el.innerHTML = '';
  const sitBtn = document.createElement('button');
  sitBtn.className = 'act sit';
  sitBtn.innerHTML = S.sitting ? '<span>일어나기</span><small class="cap">자리에서 걷기</small>' : '<span>내 자리로</span><small class="cap">앉아서 코딩</small>';
  sitBtn.onclick = () => (S.sitting ? standUp() : goSit());
  el.append(sitBtn);
  for (const a of ACTIONS.filter((x) => !x.auto)) {
    const b = document.createElement('button');
    b.className = 'act';
    b.innerHTML = `<span>${a.name}</span><small class="cap">${a.cap}</small>`;
    b.onclick = () => doAct(a.id);
    el.append(b);
  }
}

function renderMemoBar() {
  const el = $('#memo-bar');
  el.innerHTML = '';
  const auto = document.createElement('button');
  auto.className = 'memo auto';
  auto.setAttribute('aria-pressed', S.memoAuto);
  auto.textContent = S.memoAuto ? 'AUTO' : 'OFF';
  auto.title = S.memoAuto ? '메모가 저절로 돌아가며 떠요 (누르면 끄기)' : '메모가 저절로 뜨지 않아요 (누르면 켜기)';
  auto.onclick = () => {
    S.memoAuto = !S.memoAuto;
    store.set('memoAuto', S.memoAuto);
    me?.setMemos(S.memoAuto ? S.profile.memos : []);
    net.sendProfile(myPf());
    renderMemoBar();
    toast(S.memoAuto ? '메모가 머리 위에 돌아가며 떠요' : '메모 자동 띄우기를 껐어요. 메모를 누르면 하나씩 띄워요');
  };
  el.append(auto);
  S.profile.memos.forEach((m, i) => {
    if (!m.trim()) return;
    const b = document.createElement('button');
    b.className = 'memo';
    b.textContent = m;
    b.title = '지금 머리 위에 띄우기';
    b.onclick = () => { me?.pin(i); net.sendAct({ m: i }); };
    el.append(b);
  });
  const ed = document.createElement('button');
  ed.className = 'memo edit';
  ed.textContent = '✎ 메모 고치기';
  ed.onclick = () => openDesk();
  el.append(ed);
}

// ───────── 책상 정보 카드 ─────────
let cardFor = null;
const TILE_COLORS = ['#e2603d', '#2f8a6a', '#3d6fc4', '#8a5ac4', '#c49a2f', '#c43d6f'];
function openCard(i, who) {
  if (i < 0 || i == null) { if (who === 'me') { openDesk(); } return; }
  const o = who && who !== 'me' ? who : ownerOf(i);
  cardFor = { seat: i, peer: o && o !== 'me' ? o : null };
  const body = $('#card-body');
  if (!o) {
    body.innerHTML = `<div class="c-head"><span class="c-seat">DESK ${String(i + 1).padStart(2, '0')}</span><span class="c-name">빈 자리</span></div>
      <p class="c-empty">아직 아무도 앉지 않은 책상이에요. 여기로 자리를 옮길까요?</p>
      <div class="c-acts"><button class="primary small-btn" id="c-move">이 자리로 옮기기</button></div>`;
    $('#c-move').onclick = () => moveToSeat(i);
  } else {
    const mine = o === 'me';
    const pf = mine ? myPf() : S.peers.get(o).pf;
    const sit = mine ? S.sitting : !!S.peers.get(o).st?.sit;
    const links = (pf.links || []).map((l, k) => {
      const host = hostOf(l.u);
      const init = (l.t || host || '?').trim()[0] || '?';
      return `<div class="c-link"><span class="c-tile" style="background:${TILE_COLORS[(host.length + k) % TILE_COLORS.length]}">${esc(init)}</span>
        <div><b>${esc(l.t || host)}</b><span class="host">${esc(host)}</span>${l.d ? `<p>${esc(l.d)}</p>` : ''}</div>
        <div class="acts"><button class="ghost small-btn" data-peek="${k}">미리보기</button><a class="primary small-btn" href="${esc(l.u)}" target="_blank" rel="noopener noreferrer">접속하기 ↗</a></div></div>`;
    }).join('');
    const memos = (pf.memos || []).filter((m) => m.trim()).map((m) => `<span>${esc(m)}</span>`).join('');
    body.innerHTML = `<div class="c-head"><span class="c-seat">DESK ${String(i + 1).padStart(2, '0')}${mine ? ' · 내 책상' : ''}</span>
        <span class="c-name">${esc(pf.n)}</span>
        ${pf.intro ? `<span class="c-intro">${esc(pf.intro)}</span>` : ''}
        <span class="c-status ${sit ? '' : 'away'}"><i></i>${sit ? '책상에서 코딩 중' : '잠깐 자리 비움'}</span></div>
      ${pf.now ? `<div class="c-now"><small>지금 하는 일</small>${esc(pf.now)}</div>` : ''}
      <p class="c-label">만든 것 ${pf.links?.length ? `· ${pf.links.length}개` : ''}</p>
      ${links ? `<div class="c-links">${links}</div>` : `<p class="c-empty">${mine ? '아직 올린 결과물이 없어요. 내 책상 꾸미기에서 링크를 넣어 보세요.' : '아직 올린 결과물이 없어요.'}</p>`}
      ${memos ? `<p class="c-label">메모</p><div class="c-memos">${memos}</div>` : ''}
      ${mine ? `<div class="c-acts"><button class="ghost small-btn" id="c-edit">내 책상 꾸미기</button>${S.sitting ? '' : '<button class="primary small-btn" id="c-sit">앉기</button>'}</div>` : ''}`;
    body.querySelectorAll('[data-peek]').forEach((b) => (b.onclick = () => peek(pf.links[+b.dataset.peek])));
    if (mine) {
      $('#c-edit').onclick = () => openDesk();
      if ($('#c-sit')) $('#c-sit').onclick = () => { closeCard(); goSit(); };
    }
  }
  $('#card').hidden = false;
}
function closeCard() { $('#card').hidden = true; cardFor = null; }

function peek(l) {
  if (!l) return;
  const u = safeUrl(l.u);
  if (!u) return;
  $('#peek-title').textContent = l.t || hostOf(u);
  $('#peek-host').textContent = u;
  $('#peek-open').href = u;
  const f = $('#peek-iframe');
  // 이 사이트 자신은 미리보기 창에 넣지 않는다 (같은 출처 + 스크립트 = 상자 밖으로 나올 수 있음)
  f.src = new URL(u).origin === location.origin ? 'about:blank' : u;
  openModal('peek-modal');
}

// ───────── 모달 공통 ─────────
function openModal(id) { $('#' + id).hidden = false; }
function closeModal(id) {
  $('#' + id).hidden = true;
  if (id === 'peek-modal') $('#peek-iframe').src = 'about:blank';
  if (id === 'creator') stopPreview();
}
function closeAll() { ['desk-modal', 'peek-modal', 'floor-modal', 'guide-modal'].forEach(closeModal); if (!$('#creator').hidden) closeModal('creator'); closeCard(); $('#menu').hidden = true; }
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-close]');
  if (c) { const id = c.dataset.close; if (id === 'card') closeCard(); else closeModal(id); }
  if (e.target.classList?.contains('modal')) closeModal(e.target.id);
});

// ───────── 토스트 ─────────
function toast(text, ms = 3200) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  $('#toasts').append(t);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
}

// ───────── 층 고르기 ─────────
async function openFloors() {
  openModal('floor-modal');
  const grid = $('#floor-grid');
  const draw = (counts) => {
    grid.innerHTML = '';
    for (let f = 1; f <= FLOORS; f++) {
      const n = counts ? counts[f - 1] : null;
      const b = document.createElement('button');
      b.className = 'floor-btn';
      if (f === S.floor && S.entered) b.setAttribute('aria-current', 'true');
      b.disabled = n != null && n >= SEATS && f !== S.floor;
      b.innerHTML = `<b>${f}F</b><span>${n == null ? '인원 확인 중' : n >= SEATS ? '자리 없음' : `${n}명 일하는 중`}</span><span class="bar"><i style="width:${((n || 0) / SEATS) * 100}%"></i></span>`;
      b.onclick = () => {
        closeModal('floor-modal');
        if (!S.entered) { S.floor = f; updateIntro(); return; }
        if (f !== S.floor) enter(f);
      };
      grid.append(b);
    }
  };
  draw(null);
  const counts = await net.counts();
  $('#floor-note').textContent = counts ? '' : RELAY_URL ? '서버에 닿지 않아 인원을 못 셌어요.' : '혼자 보기 모드예요.';
  draw(counts || Array(FLOORS).fill(0));
}

// ───────── 내 책상 꾸미기 ─────────
function openDesk() {
  closeCard();
  const p = S.profile;
  $('#pf-intro').value = p.intro;
  $('#pf-now').value = p.now;
  const mg = $('#pf-memos');
  mg.innerHTML = '';
  for (let i = 0; i < MAX_MEMOS; i++) {
    const l = document.createElement('label');
    l.innerHTML = `<input maxlength="${LIMITS.memo}" placeholder="메모 ${i + 1}" aria-label="메모 ${i + 1}">`;
    l.querySelector('input').value = p.memos[i] || '';
    mg.append(l);
  }
  const lr = $('#pf-links');
  lr.innerHTML = '';
  p.links.forEach(addLinkRow);
  $('#pf-add').hidden = p.links.length >= MAX_LINKS;
  openModal('desk-modal');
}
function addLinkRow(l = { t: '', u: '', d: '' }) {
  const lr = $('#pf-links');
  if (lr.children.length >= MAX_LINKS) return;
  const row = document.createElement('div');
  row.className = 'link-row';
  row.innerHTML = `<input class="t" maxlength="${LIMITS.title}" placeholder="이름 (예: 캠핑장 메타버스)">
    <input class="u" maxlength="${LIMITS.url}" placeholder="주소 (예: campingjang.site)" inputmode="url">
    <button type="button" class="rm" aria-label="빼기">빼기</button>
    <input class="desc" maxlength="${LIMITS.desc}" placeholder="한 줄 설명 (선택)">`;
  row.querySelector('.t').value = l.t || '';
  row.querySelector('.u').value = l.u || '';
  row.querySelector('.desc').value = l.d || '';
  row.querySelector('.rm').onclick = () => { row.remove(); $('#pf-add').hidden = false; };
  lr.append(row);
  $('#pf-add').hidden = lr.children.length >= MAX_LINKS;
}
$('#pf-add').onclick = () => addLinkRow();
$('#desk-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const links = [];
  let bad = 0;
  for (const row of $$('#pf-links .link-row')) {
    const raw = row.querySelector('.u').value.trim();
    if (!raw) continue;
    const u = safeUrl(raw);
    if (!u) { bad++; continue; }
    links.push({ t: row.querySelector('.t').value.trim().slice(0, LIMITS.title), u, d: row.querySelector('.desc').value.trim().slice(0, LIMITS.desc) });
  }
  S.profile = {
    intro: $('#pf-intro').value.trim().slice(0, LIMITS.intro),
    now: $('#pf-now').value.trim().slice(0, LIMITS.now),
    memos: $$('#pf-memos input').map((i) => i.value.trim().slice(0, LIMITS.memo)),
    links,
  };
  store.set('profile', S.profile);
  if (me) { me.setMemos(S.memoAuto ? S.profile.memos : []); me.allMemos = S.profile.memos; }
  net.sendProfile(myPf());
  if (S.seat >= 0) refreshScreen(S.seat);
  renderMemoBar();
  updateIntro();
  closeModal('desk-modal');
  toast(bad ? `저장했어요. 주소가 이상한 결과물 ${bad}개는 뺐어요` : '내 책상을 저장했어요');
  if (S.enterAfterDesk && !S.entered) { S.enterAfterDesk = false; enter(S.floor || 1); }
});

// ───────── 캐릭터 꾸미기 ─────────
let pv = null;
function startPreview() {
  const c = $('#preview');
  const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const sc = new THREE.Scene();
  sc.environment = scene.environment;
  sc.environmentIntensity = 0.5;
  sc.add(new THREE.HemisphereLight('#e8ecff', '#4a3a2e', 1.4));
  const d = new THREE.DirectionalLight('#fff0dc', 1.6); d.position.set(2, 4, 3); sc.add(d);
  const cm = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  cm.position.set(0, 1.3, 4.6);
  cm.lookAt(0, 0.85, 0);
  const av = new Avatar(S.look, '', {});
  av.tag.visible = false;
  av.memoOn = false;
  sc.add(av.group);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 40), new THREE.MeshStandardMaterial({ color: '#2a3042' }));
  floor.rotation.x = -Math.PI / 2;
  sc.add(floor);
  let rot = 0.5, drag = null, raf;
  c.onpointerdown = (e) => { drag = e.clientX; c.setPointerCapture(e.pointerId); };
  c.onpointermove = (e) => { if (drag != null) { rot += (e.clientX - drag) * 0.01; drag = e.clientX; } };
  c.onpointerup = () => (drag = null);
  let last = performance.now();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.floor(w * r.getPixelRatio())) { r.setSize(w, h, false); cm.aspect = w / h; cm.updateProjectionMatrix(); }
    if (drag == null) rot += dt * 0.25;
    av.group.rotation.y = rot;
    av.update(dt, ACTIONS);
    r.render(sc, cm);
  };
  loop();
  pv = { r, av, sc, stop: () => { cancelAnimationFrame(raf); av.dispose(); r.dispose(); } };
}
function stopPreview() { pv?.stop(); pv = null; }

function chips(el, list, key, label = (x) => x.name) {
  el.innerHTML = '';
  for (const it of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = label(it);
    b.setAttribute('aria-pressed', S.draft[key] === it.id);
    b.onclick = () => { S.draft[key] = it.id; renderCreator(); };
    el.append(b);
  }
}
function renderCreator() {
  chips($('#opt-gender'), GENDERS, 'gender', (g) => g.cap);
  chips($('#opt-type'), CHAR_TYPES, 'type');
  chips($('#opt-outfit'), OUTFITS, 'outfit');
  chips($('#opt-acc'), ACCESSORIES, 'acc');
  chips($('#opt-pet'), PETS.filter((p) => !p.hidden), 'pet');
  const sk = $('#opt-skin');
  sk.innerHTML = '';
  for (const c of SKIN_TONES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = c;
    b.setAttribute('aria-label', '피부색');
    b.setAttribute('aria-pressed', S.draft.skin === c);
    b.onclick = () => { S.draft.skin = c; renderCreator(); };
    sk.append(b);
  }
  pv?.av.setLook(S.draft);
}
function openCreator() {
  S.draft = { ...S.look };
  $('#nick').value = S.name;
  $('#creator').hidden = false;
  startPreview();
  renderCreator();
}
$('#nick-dice').onclick = () => { $('#nick').value = randomName(); };
$('#creator-done').onclick = () => {
  S.look = { ...S.draft };
  S.name = $('#nick').value.trim().slice(0, LIMITS.name) || randomName();
  store.set('look', S.look);
  store.set('name', S.name);
  if (me) { me.setLook(S.look); me.setName(S.name); }
  net.sendProfile(myPf());
  if (S.seat >= 0) refreshScreen(S.seat);
  closeModal('creator');
  updateIntro();
  // 처음 온 분: 캐릭터 → 내 책상 꾸미기 → 저장하면 바로 출근
  if (S.firstRun) { S.firstRun = false; S.enterAfterDesk = true; openDesk(); }
};

// ───────── 첫 화면 ─────────
function updateIntro() {
  $('#intro-name').textContent = S.name;
  $('#intro-now').textContent = S.profile.now || '지금 하는 일을 적어 보세요 (내 책상)';
  $('#enter-label').textContent = S.floor ? `${S.floor}층으로 출근하기` : '출근하기';
}
async function showIntro() {
  $('#intro').hidden = false;
  if (!S.floor) S.floor = await pickDefaultFloor();
  updateIntro();
}
$('#btn-enter').onclick = () => { if (S.firstRun) { openCreator(); return; } enter(S.floor || 1); };
$('#intro-char').onclick = openCreator;
$('#intro-desk').onclick = openDesk;
$('#intro-floor').onclick = openFloors;

// ───────── 화면 위 단추 ─────────
$('#floor-chip').onclick = openFloors;
$('#btn-desk').onclick = openDesk;
$('#btn-char').onclick = openCreator;
$('#btn-copy').onclick = async () => {
  const url = `${SITE}/?f=${S.floor}`;
  try { await navigator.clipboard.writeText(url); toast('이 층 링크를 복사했어요'); } catch { prompt('이 링크를 복사하세요', url); }
};
$('#btn-menu').onclick = () => { $('#menu').hidden = !$('#menu').hidden; $('#menu-others').textContent = S.othersMemo ? '다른 분 메모 숨기기' : '다른 분 메모 보기'; };
$('#menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-menu]');
  if (!b) return;
  $('#menu').hidden = true;
  const m = b.dataset.menu;
  if (m === 'guide') openModal('guide-modal');
  if (m === 'floor') openFloors();
  if (m === 'leave') leave();
  if (m === 'others') {
    S.othersMemo = !S.othersMemo;
    store.set('othersMemo', S.othersMemo);
    for (const p of S.peers.values()) p.av.setMemos(S.othersMemo ? memosOf(p.pf) : []);
    toast(S.othersMemo ? '다른 분 메모를 다시 보여요' : '다른 분 메모를 숨겼어요');
  }
});

// ───────── 오늘 집중 시간 (앉아 있던 시간, 이 기기) ─────────
const today = () => new Date().toLocaleDateString('sv');
let focusLast = Date.now();
function tickFocus() {
  const now = Date.now();
  const dt = Math.min(90, (now - focusLast) / 1000);
  focusLast = now;
  if (!S.entered) { $('#focus-chip').hidden = true; return; }
  const key = 'focus.' + today();
  let s = store.get(key, 0);
  if (S.sitting) { s += dt; store.set(key, Math.round(s)); }
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const el = $('#focus-chip');
  el.hidden = false;
  el.textContent = `오늘 ${h ? h + '시간 ' : ''}${m}분 집중`;
}
setInterval(tickFocus, 1000);

// ───────── 연습용 가짜 동료 (?demo=12) ─────────
function demo(n) {
  const nows = ['캠핑장 메타버스 모닥불 고치는 중', '가계부 앱 차트 다듬기', '블로그 다크 모드', '디스코드 봇 배포', '템플스테이 연등 효과', '1인 SaaS 결제 붙이는 중', '포트폴리오 리뉴얼', '게임 잼 출품작', '', '영어 단어장 앱'];
  const links = [[{ t: '캠핑장 메타버스', u: 'https://campingjang.site', d: '모닥불 앞에 같이 앉아 있는 3D 캠핑장' }], [{ t: '큰법당 템플스테이', u: 'https://templestay.site', d: '산·강·바다가 보이는 3D 법당' }, { t: '깃허브', u: 'https://github.com' }], []];
  S.seat = 7;
  for (let i = 0; i < n; i++) {
    const id = 'demo' + i;
    const look = { type: CHAR_TYPES[i % CHAR_TYPES.length].id, gender: i % 3 ? 'm' : 'f', skin: SKIN_TONES[i % 5], outfit: OUTFITS[(i * 7) % OUTFITS.length].id, acc: ACCESSORIES[(i * 3) % ACCESSORIES.length].id, pet: PETS[(i * 5) % 10].id };
    const pf = { n: randomName(), look, intro: '', now: nows[i % nows.length], memos: [...defaultProfile().memos].sort(() => Math.random() - 0.5), links: links[i % 3], auto: true };
    const seat = i >= 7 ? i + 1 : i;
    addOrUpdatePeer(id, pf, seat);
    const s = office.seats[seat];
    const walking = i % 5 === 4;
    peerState(id, walking ? { x: -2 + i * 0.7, z: 5 + (i % 3), ry: 1, sit: false } : { x: s.x, z: s.z, ry: s.ry, sit: true });
  }
  sitDown();
  refreshAllScreens();
}

// ───────── 매 프레임 ─────────
let last = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  // 느린 기기(10fps 언저리)에서도 걷는 속도가 실제 시간과 맞게 0.1초까지 받고, 내 이동은 0.05초씩 나눠 벽을 뚫지 않게 한다
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (S.entered && me) { const n = Math.ceil(dt / 0.05); for (let i = 0; i < n; i++) updateMe(dt / n); }
  if (office) {
    updatePeers(dt);
    tickScreens(dt);
  }
  placeCamera(dt);
  renderer.render(scene, camera);
}

function updateMe(dt) {
  let ix = 0, iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  ix += joy.x; iz += joy.y;
  const len = Math.hypot(ix, iz);
  const pos = me.group.position;
  let speed = 0;
  if (len > 0.15) {
    S.walkTo = null;
    if (S.sitting) standUp();
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let dx = rx * ix + fx * -iz, dz = rz * ix + fz * -iz;
    const l = Math.hypot(dx, dz);
    dx /= l; dz /= l;
    speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5.2 : 3.2) * Math.min(1, len);
    pos.x += dx * speed * dt; pos.z += dz * speed * dt;
    collide(pos, office.colliders);
    me.group.rotation.y = lerpAngle(me.group.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 12));
  } else if (S.walkTo) {
    const w = S.walkTo;
    const dx = w.x - pos.x, dz = w.z - pos.z, d = Math.hypot(dx, dz);
    w.t += dt;
    if (d < 0.15) { const then = w.then; S.walkTo = null; then?.(); }
    else {
      speed = 3.4;
      const step = Math.min(d, speed * dt);
      pos.x += (dx / d) * step; pos.z += (dz / d) * step;
      collide(pos, office.colliders);
      me.group.rotation.y = lerpAngle(me.group.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 10));
      // 막혀서 0.8초 동안 가까워지지 않으면 그 자리로 바로 간다
      if (d < w.best - 0.05) { w.best = d; w.stuck = 0; } else if ((w.stuck += dt) > 0.8) { pos.x = w.x; pos.z = w.z; }
    }
  }
  me.speed = speed;
  me.update(dt, ACTIONS);
  sendT += dt;
  if (sendT > 0.15) { sendT = 0; sendState(false); }
}

// ───────── 시작 ─────────
async function boot() {
  // 캔버스 글씨(이름표·말풍선·모니터)가 기본 글꼴로 그려지지 않게 글꼴을 먼저 받는다
  await Promise.race([
    Promise.all([document.fonts.load(`600 38px ${FONT}`), document.fonts.load('700 40px "JetBrains Mono"'), document.fonts.load(`400 24px ${FONT}`)]),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => {});
  office = buildOffice();
  scene.add(office.group);
  applyTime();
  setInterval(applyTime, 10 * 60 * 1000);
  refreshAllScreens();
  office.paintFloor(S.floor || 1);
  office.paintBoard(S.floor || 1, 0);
  frame();
  $('#loading').classList.add('out');
  setTimeout(() => $('#loading').remove(), 600);
  S.firstRun = firstVisit;
  if (Q.has('demo')) { S.floor = S.floor || 1; enter(S.floor); return; }
  if (RELAY_URL && !Q.has('relay')) fetch(`${RELAY_URL}/visit`, { method: 'POST' }).catch(() => {});
  await showIntro();
  if (Q.has('f') && !firstVisit) enter(S.floor);
}
boot();

// 시험용
if (Q.has('debug')) window.__S = { S, cam, net, scene, camera, openCard, openDesk, openFloors, peek, enter, moveToSeat, doAct, get office() { return office; }, get me() { return me; } };
