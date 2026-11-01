// 소호랩: 3D 사무실, 내 캐릭터, 같은 층 사람들, 책상 정보 카드, 메모 말풍선, 집중 경험치 · 책상 꾸미기.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  RELAY_URL, SITE, FLOORS, SEATS, MAX_MEMOS, MAX_LINKS, MAX_ITEMS, LIMITS, SKIN_TONES, BODIES, CHAR_TYPES, hairName, GENDERS, OUTFITS, ACCESSORIES, ACTIONS,
  PET_IDS, NEW_PETS, DESK_COLORS, CHAIR_COLORS, MONITORS, KEYBOARDS, CHAIRS, DESK_ITEMS, TIERS, SHOP, shopKey, FREE_OWNED, levelOf, xpForLevel,
  MEMO_MODES, FLOOR_THEMES, randomName, defaultLook, fixLook, fixProfile, defaultDesk, safeUrl, hostOf,
} from './data.js';
import { PETS } from './blocky.js';
import { Avatar, FONT } from './avatar.js';
import { buildOffice, collide, paintScreen, paintSecond, dressDesk, itemModel, SPAWN, ROOM, THEMES } from './world.js';
import { Net } from './net.js';
import { findBad } from './badwords.js';

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
const S = {
  look: fixLook(store.get('look', null)),
  name: store.get('name', '') || randomName(),
  profile: fixProfile(store.get('profile', null)),
  floor: clampFloor(+Q.get('f')) || 0,
  seat: -1,
  sitting: false,
  entered: false,
  peers: new Map(), // id → { av, pf, st, seat, tx, tz, try }
  memoMode: store.get('memoMode', store.get('memoAuto', true) === false ? 'off' : 'auto'),
  memoIdx: store.get('memoIdx', 0),
  othersMemo: store.get('othersMemo', true),
  walkTo: null,
  xp: store.get('xp', 0), // 쌓이기만 하는 경험치 (분)
  pts: store.get('pts', 0), // 아이템 살 때 쓰는 포인트
  owned: new Set([...FREE_OWNED, ...store.get('owned', [])]),
};
if (!store.get('name', '')) store.set('name', S.name);
// 저장된 책상 꾸미기에서 가지지 않은 것은 빼요
S.profile.desk = cleanDesk(S.profile.desk);
function cleanDesk(d) {
  const ok = (k, id) => S.owned.has(shopKey(k, id));
  const def = defaultDesk();
  return {
    c: DESK_COLORS.some((x) => x.id === d.c) ? d.c : def.c,
    ch: CHAIR_COLORS.some((x) => x.id === d.ch) ? d.ch : def.ch,
    mon: ok('mon', d.mon) ? d.mon : 'm',
    kb: ok('kb', d.kb) ? d.kb : 'basic',
    chair: ok('chair', d.chair) ? d.chair : 'basic',
    it: [...new Set(d.it || [])].filter((id) => ok('it', id)),
  };
}
const lv = () => levelOf(S.xp);

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
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 16, bottom: -16, near: 1, far: 50 });
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

// ───────── 층 테마 ─────────
const themeFor = (floor) => Q.get('theme') || FLOOR_THEMES[(Math.max(1, floor) - 1) % FLOOR_THEMES.length];
function setOffice(floor) {
  const id = themeFor(floor);
  if (office?.theme.id === id) return;
  if (office) { scene.remove(office.group); office.dispose(); }
  office = buildOffice(id);
  scene.add(office.group);
  scene.background = new THREE.Color(office.theme.bg);
  applyTime();
  refreshAllScreens();
  office.paintFloor(floor || 1);
  office.paintBoard(floor || 1, S.peers.size + (S.entered ? 1 : 0));
}

// ───────── 낮·밤 ─────────
// 층마다 시간 · 빛이 정해져 있어요 (테마의 hour · light)
function applyTime() {
  if (!office) return;
  const T = office.theme, L = T.light || {};
  const h = Q.has('hour') ? +Q.get('hour') : T.hour ?? new Date().getHours();
  office.paintSky(h);
  hemi.color.set(L.sky || '#cdd6ff');
  hemi.groundColor.set(L.ground || '#4a3a2e');
  hemi.intensity = L.hemi ?? 1;
  sun.intensity = L.sun ?? 1.2;
  sun.color.set(L.sunC || '#ffe6c8');
  renderer.toneMappingExposure = L.exp ?? 1.05;
  scene.fog = L.fog ? new THREE.Fog(L.fog[0], L.fog[1], L.fog[2]) : null;
}

// ───────── 카메라 ─────────
const cam = { yaw: Math.PI, pitch: 0.42, dist: 5.2, target: new THREE.Vector3(0, 1.2, 0), wantYaw: null, wantDist: null };
function placeCamera(dt) {
  if (!S.entered || !me) {
    // 로딩 중: 사무실 남쪽 벽 앞에서 천천히 좌우로 둘러본다
    // 로딩 중: 사무실 남쪽에서 천천히 좌우로 훑으며 둘러봐요
    const t = performance.now() / 1000;
    const a = Math.sin(t * 0.22 - 1.2);
    camera.position.set(a * 15, 2.2 + Math.sin(t * 0.3) * 0.15, ROOM.maxZ - 1.2);
    camera.lookAt(-a * 6, 1.2, -6);
    return;
  }
  const p = me.group.position;
  const k = Math.min(1, dt * 6);
  // 앉아 있으면 내 모니터 쪽을 본다 (머리 너머로 화면이 보이게)
  const ry = me.group.rotation.y, ahead = S.sitting ? 1.0 : 0;
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
function camBehind(ry, dist, pitch = 0.7) { cam.wantYaw = ry + Math.PI + 0.35; cam.wantDist = dist * far(); cam.pitch = pitch; }

// ───────── 입력 ─────────
const keys = new Set();
const typing = () => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName);
addEventListener('keydown', (e) => {
  if (typing() || !S.entered) return;
  if (!$('#show-modal').hidden && /^Arrow/.test(e.code)) return;
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
  if (ptr.down && ptr.moved <= 6 && e.type === 'pointerup') {
    if (!$('#desk-modal').hidden) closeModal('desk-modal'); // 꾸미기 창 바깥을 누르면 닫기
    else pick(e.clientX, e.clientY);
  }
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
  const targets = [...office.allClickables(), me.hit, ...[...S.peers.values()].map((p) => p.av.hit)];
  // 앉아 있으면 카메라가 내 어깨 너머라 내 몸이 먼저 맞기 쉽다 → 내 몸은 다른 게 없을 때만
  const hits = ray.intersectObjects(targets, false);
  const hit = hits.find((h) => !h.object.userData.me) || hits[0];
  if (!hit) { closeCard(); walkToPoint(); return; }
  const u = hit.object.userData;
  if (u.peer) { const p = S.peers.get(u.peer); if (p) openCard(p.seat, u.peer); return; }
  if (u.me) { openCard(S.seat, 'me'); return; }
  if (u.seat !== undefined) { openCard(u.seat); return; }
  if (u.kind === 'elevator') openFloors();
  else if (u.kind === 'coffee') goCoffee();
  else if (u.kind === 'fridge') openFridge();
  else if (u.kind === 'printer') doTrip(ACTIONS.find((a) => a.id === 't_print'));
  else if (u.kind === 'water') doTrip(ACTIONS.find((a) => a.id === 't_water'));
  else if (u.kind === 'board') openModal('guide-modal');
}

// 바닥을 누르면 그곳까지 걸어가요 (누른 곳에 동그란 표시)
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 32), new THREE.MeshBasicMaterial({ color: '#ffb35c', transparent: true, opacity: 0.9, depthWrite: false }));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);
function hideMarker() { marker.visible = false; }
function walkToPoint() {
  if (!me) return;
  const p = ray.ray.intersectPlane(floorPlane, new THREE.Vector3());
  if (!p) return;
  p.x = Math.max(ROOM.minX + 0.4, Math.min(ROOM.maxX - 0.4, p.x));
  p.z = Math.max(ROOM.minZ + 0.4, Math.min(ROOM.maxZ - 0.4, p.z));
  stopTour();
  tripToken++;
  if (S.sitting) standUp();
  marker.position.set(p.x, 0.02, p.z);
  marker.visible = true;
  S.walkTo = { x: p.x, z: p.z, t: 0, best: Infinity, stuck: 0, soft: true, then: hideMarker };
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
  camBehind(seat.ry, 3.4);
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

function goCoffee() { doTrip(ACTIONS.find((a) => a.id === 't_coffee')); }

// 걸어갔다 오는 동작: 그 자리까지 걸어가서 자세를 하고, 끝나면 내 자리로 돌아와 앉아요
let tripToken = 0;
function doTrip(def) {
  const sp = office?.spots?.[def?.trip];
  if (!sp || !me) return;
  stopTour();
  if (S.sitting) standUp();
  const tok = ++tripToken;
  feed(S.name, def.feed);
  net.sendAct({ a: def.id });
  S.walkTo = { x: sp.x, z: sp.z, t: 0, best: Infinity, stuck: 0, then: () => {
    if (tok !== tripToken) return;
    me.group.rotation.y = sp.ry;
    me.play(def.pose);
    net.sendAct({ a: def.pose });
    sendState(true);
    const dur = (ACTIONS.find((x) => x.id === def.pose)?.dur || 4) * 1000;
    setTimeout(() => { if (tok === tripToken && !S.walkTo && !S.sitting) goSit(); }, dur + 300);
  } };
}

// 같은 층 알림: "○○님이 박수를 쳤습니다."
// 같은 층 알림은 왼쪽 위 기록에 계속 남아요 (최근 5줄, 새 줄이 아래)
function feedLine(text) {
  const el = $("#feed");
  const d = document.createElement("div");
  d.className = "feed-line";
  d.textContent = text;
  el.append(d);
  while (el.children.length > 5) el.firstChild.remove();
}
function feed(name, text) { if (text && S.entered) feedLine(`${name}님이 ${text}`); }
const saidText = (m) => `'${m}'라고 말했습니다.`;

// 냉장고: 무알콜 맥주 · 콜라 · 사이다 무제한 무료
function openFridge() {
  const el = $('#fridge-list');
  el.innerHTML = '';
  for (const id of ['t_beer', 't_cola', 't_cider']) {
    const def = ACTIONS.find((a) => a.id === id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `drink ${id}`;
    b.innerHTML = `<i></i><b>${def.name}</b><small>무제한 무료</small>`;
    b.onclick = () => { closeModal('fridge-modal'); doTrip(def); };
    el.append(b);
  }
  openModal('fridge-modal');
}

// 자리 이동: 독서실처럼 1~20번 자리를 잔디 칸으로 보여 주고, 빈 칸을 누르면 옮겨요
function openSeats() { renderSeats(); openModal('seat-modal'); }
function renderSeats() {
  const g = $('#seat-grid');
  g.innerHTML = '';
  const seats = office.seats;
  // 배치도 크기: 책상 · 의자가 놓인 범위
  const xs = seats.map((s) => s.desk.x), zs = seats.flatMap((s) => [s.z, s.desk.z]);
  const pad = 3.4, minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minZ = Math.min(...zs) - 0.9, maxZ = Math.max(...zs) + 0.9;
  const L = (x) => ((x - minX) / (maxX - minX)) * 100, T = (z) => ((z - minZ) / (maxZ - minZ)) * 100;
  g.style.aspectRatio = `${(maxX - minX) / (maxZ - minZ)}`;
  // 섬(책상 네 개 묶음) 바탕
  const islands = new Map();
  for (const s of seats) { const b = islands.get(s.island) || { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }; b.x0 = Math.min(b.x0, s.desk.x - 3); b.x1 = Math.max(b.x1, s.desk.x + 3); b.z0 = Math.min(b.z0, s.desk.z - 0.7); b.z1 = Math.max(b.z1, s.desk.z + 0.7); islands.set(s.island, b); }
  for (const b of islands.values()) {
    const d = document.createElement('i');
    d.className = 'seat-island';
    Object.assign(d.style, { left: L(b.x0) + '%', width: L(b.x1) - L(b.x0) + '%', top: T(b.z0) + '%', height: T(b.z1) - T(b.z0) + '%' });
    g.append(d);
  }
  for (const s of seats) {
    const i = s.i;
    const o = ownerOf(i);
    const b = document.createElement('button');
    b.type = 'button';
    let cls = 'empty', label = '빈 자리';
    if (o === 'me') { cls = 'mine'; label = '내 자리'; }
    else if (o) { const p = S.peers.get(o); cls = p.st?.sit ? 'taken' : 'away'; label = p.pf.n; }
    b.className = `seat-cell ${cls}`;
    Object.assign(b.style, { left: L(s.desk.x) + '%', top: T((s.z + s.desk.z) / 2) + '%' });
    b.innerHTML = `<b>${i + 1}</b><span>${esc(label)}</span>`;
    b.title = o === 'me' ? '지금 내 자리' : o ? `${label} 님 자리 · 눌러서 구경하기` : `${i + 1}번으로 옮기기`;
    b.onclick = () => {
      if (o === 'me') { toast('지금 앉아 있는 자리예요'); return; }
      closeModal('seat-modal');
      if (o) openCard(i, o); else moveToSeat(i);
    };
    g.append(b);
  }
  const used = S.peers.size + (S.seat >= 0 ? 1 : 0);
  $('#seat-note').textContent = `${SEATS - used}자리 비어 있어요`;
}

// 사무실 한 바퀴 (자동으로 걷기). 다 돌면 내 자리로 돌아와 앉아요
let touring = false;
function startTour() {
  if (!office?.tour || !me) return;
  tripToken++;
  if (S.sitting) standUp();
  const pts = office.tour, p = me.group.position;
  let k = 0, best = Infinity;
  pts.forEach(([x, z], i) => { const d = Math.hypot(x - p.x, z - p.z); if (d < best) { best = d; k = i; } });
  const seq = [...pts.slice(k), ...pts.slice(0, k), pts[k]];
  touring = true;
  const step = (i) => {
    if (!touring) return;
    if (i >= seq.length) { touring = false; goSit(); renderActions(); return; }
    S.walkTo = { x: seq[i][0], z: seq[i][1], t: 0, best: Infinity, stuck: 0, then: () => step(i + 1) };
  };
  step(0);
  renderActions();
  toast('사무실을 한 바퀴 돌아요. 다시 누르면 내 자리로 돌아가요');
}
function stopTour() { if (touring) { touring = false; renderActions(); } }

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

// ───────── 모니터 화면 · 책상 모습 ─────────
// 지금 하는 일: '하나' 모드면 고른 메모, 아니면 첫 번째 메모
const nowOf = (pf) => (pf.mm === 'one' ? pf.memos?.[pf.mi] : pf.memos?.[0]) || '';
function screenInfo(i) {
  const o = ownerOf(i);
  if (!o) return { state: 'empty' };
  const pf = o === 'me' ? myPf() : S.peers.get(o).pf;
  const sit = o === 'me' ? S.sitting : !!S.peers.get(o).st?.sit;
  const l0 = pf.links?.[0];
  return { state: sit ? 'busy' : 'away', name: pf.n, now: nowOf(pf), title: l0?.t || '', host: l0 ? hostOf(l0.u) : '', mine: o === 'me' };
}
function refreshScreen(i) {
  const seat = office?.seats[i];
  if (!seat) return;
  const o = ownerOf(i);
  const deck = o === 'me' ? S.profile.desk : o ? S.peers.get(o).pf.desk : null;
  seat.screen.info = screenInfo(i);
  dressDesk(seat, deck || null);
  paintScreen(seat);
  paintSecond(seat);
}
function refreshAllScreens() { office?.seats.forEach((s) => refreshScreen(s.i)); }
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
  return { n: S.name, look: S.look, memos: p.memos.slice(0, MAX_MEMOS), links: p.links.slice(0, MAX_LINKS), desk: p.desk, mm: S.memoMode, mi: S.memoIdx, lv: lv() };
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
function applyMyMemos() { me?.setMemos(S.profile.memos, S.memoMode, S.memoIdx); }
function pushProfile() { net.sendProfile(myPf()); if (S.seat >= 0) refreshScreen(S.seat); }

// ───────── 같은 층 사람들 ─────────
function addOrUpdatePeer(id, pf, seat) {
  let p = S.peers.get(id);
  if (!p) {
    const av = new Avatar(fixLook(pf.look), pf.n);
    av.hit.userData.peer = id;
    scene.add(av.group);
    p = { av, pf, st: null, seat: seat ?? -1, tx: SPAWN.x, tz: SPAWN.z, try: SPAWN.ry, shown: false };
    av.group.visible = false; // 위치(st)를 받으면 보인다
    S.peers.set(id, p);
    if (S.entered && S.ready) feedLine(`${pf.n}님이 출근했어요.`);
  } else {
    if (JSON.stringify(p.pf.look) !== JSON.stringify(pf.look)) p.av.setLook(fixLook(pf.look));
    if (p.pf.n !== pf.n) p.av.setName(pf.n);
    // '하나' 모드로 메모를 고르면 알림
    if (pf.mm === 'one' && (p.pf.mm !== 'one' || p.pf.mi !== pf.mi) && pf.memos?.[pf.mi]?.trim()) feed(pf.n, saidText(pf.memos[pf.mi]));
    p.pf = pf;
    if (seat !== undefined) p.seat = seat;
  }
  p.av.setMemos(S.othersMemo ? pf.memos : [], pf.mm || 'auto', pf.mi | 0);
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
  if (!$('#seat-modal').hidden) renderSeats();
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
    if (!$('#seat-modal').hidden) renderSeats();
  },
  onSeatNo() { toast('그 자리는 방금 다른 분이 앉았어요'); },
  onAct(id, d) {
    const p = S.peers.get(id);
    if (!p) return;
    if (d.m !== undefined) {
      if (S.othersMemo) p.av.pin(d.m);
      const m = p.pf.memos?.[d.m];
      if (m?.trim()) feed(p.pf.n, saidText(m));
    } else if (d.a) {
      p.av.play(d.a);
      feed(p.pf.n, ACTIONS.find((x) => x.id === d.a)?.feed);
    }
  },
  onLeave(id) {
    const p = removePeer(id);
    if (p && S.entered) feedLine(`${p.pf.n}님이 퇴근했어요.`);
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
  // 이전 층에 자리가 있으면 그대로, 아니면 사람이 가장 많은(자리 남은) 층
  if (saved && counts[saved - 1] < SEATS) return saved;
  let best = 1, bestN = -1;
  counts.forEach((n, i) => { if (n < SEATS && n > bestN) { best = i + 1; bestN = n; } });
  return best;
}

function fade(on) { $('#fade').classList.toggle('on', on); return new Promise((r) => setTimeout(r, on ? 360 : 0)); }

async function enter(floor) {
  await fade(true);
  closeAll();
  clearPeers();
  const old = S.seat;
  S.seat = -1;
  refreshScreen(old);
  S.floor = floor;
  store.set('floor', floor);
  history.replaceState(null, '', `?f=${floor}${Q.has('relay') ? '&relay=' + Q.get('relay') : ''}${Q.has('solo') ? '&solo' : ''}${Q.has('theme') ? '&theme=' + Q.get('theme') : ''}`);
  setOffice(floor);
  S.sitting = false;
  if (!me) {
    me = new Avatar(S.look, S.name, { mine: true });
    me.hit.userData.me = true;
    scene.add(me.group);
  }
  me.seated = false;
  applyMyMemos();
  me.group.position.set(SPAWN.x, 0, SPAWN.z);
  me.group.rotation.y = SPAWN.ry;
  cam.yaw = 0; cam.pitch = 0.42; cam.dist = 5.2 * far();
  cam.target.set(SPAWN.x, 1.2, SPAWN.z);
  S.entered = true;
  $('#hud').hidden = false;
  $('#hud-floor').textContent = `${floor}F`;
  $('#hud-theme').textContent = office.theme.name;
  office.paintFloor(floor);
  updatePeople();
  renderMemoBar();
  renderActions();
  renderXp();
  net.sendProfile(myPf());
  if (Q.has('demo')) { demo(+Q.get('demo') || 12); }
  // 자리는 입구에서 가까운 1번부터 채워요 (서버가 빈 자리 중 가장 작은 번호를 줘요)
  else net.join(floor, -1);
  if (!RELAY_URL && !Q.has('demo')) { S.seat = 0; goSit(); refreshAllScreens(); }
  await fade(false);
  $("#feed").innerHTML = "";
  feedLine(`${S.name}님이 출근했어요.`);
  if (!store.get('seenGuide2', false)) { store.set('seenGuide2', true); setTimeout(() => toast('책상·모니터·캐릭터를 누르면 그 분의 작업을 볼 수 있어요', 6000), 1200); setTimeout(() => toast('앉아 있는 1분마다 1 XP · 1 P가 쌓여요. 내 책상에서 아이템을 사 보세요', 6000), 4000); }
}


// ───────── 동작 · 메모 ─────────
function doAct(id) {
  if (!me) return;
  const on = me.play(id);
  net.sendAct({ a: id });
  if (on) feed(S.name, ACTIONS.find((x) => x.id === id)?.feed);
}

function renderActions() {
  const el = $('#actions');
  el.innerHTML = '';
  // 자리 릴: [내 자리로 · 일어서기 · 사무실 한 바퀴] 를 굴려 멈춘 것을 해요 (지금 상태가 보이는 칸)
  const now = S.sitting ? 0 : touring ? 2 : 1;
  // 가운데 칸: 앉아 있을 땐 [일어서기], 돌아다닐 땐 [멈추기]
  const sitReel = makeReel(['내 자리로', S.sitting ? '일어서기' : '멈추기', '사무실 한 바퀴'], now, (i) => {
    if (i === 0) { stopTour(); if (!S.sitting) goSit(); }
    else if (i === 1) { stopTour(); tripToken++; if (S.sitting) standUp(); else { S.walkTo = null; hideMarker(); } }
    else if (!touring) startTour();
  }, 'sit');
  sitReel.title = S.sitting ? '내 자리로 · 일어서기 · 사무실 한 바퀴' : '내 자리로 · 멈추기 · 사무실 한 바퀴';
  el.append(sitReel);
  const mv = document.createElement('button');
  mv.className = 'act';
  mv.innerHTML = '<span>자리 이동</span><small class="cap">1~20번 고르기</small>';
  mv.onclick = openSeats;
  el.append(mv);
  // 아래 막대: 제자리 동작 · 왼쪽 세로 메뉴: 걸어갔다 오는 동작 (냉장고는 음료 고르기)
  const left = $('#left-acts');
  left.innerHTML = '';
  for (const a of ACTIONS.filter((x) => !x.auto && x.pose !== true && !x.hidden)) {
    const moving = a.trip || a.fridge;
    const b = document.createElement('button');
    b.className = moving ? 'side-btn' : 'act';
    b.innerHTML = `<span>${a.name}</span><small class="cap">${a.cap}</small>`;
    b.onclick = () => (a.fridge ? openFridge() : a.trip ? doTrip(a) : doAct(a.id));
    (moving ? left : el).append(b);
  }
}

// 메모 줄: [자동 | 하나 | 없음] + 메모 5개. '하나'일 때 누른 메모가 계속 떠 있어요
function setMemoMode(mode, idx = S.memoIdx) {
  S.memoMode = mode;
  S.memoIdx = Math.max(0, Math.min(MAX_MEMOS - 1, idx));
  store.set('memoMode', S.memoMode);
  store.set('memoIdx', S.memoIdx);
  applyMyMemos();
  pushProfile();
  renderMemoBar();
}
// 메모 줄: 슬롯머신처럼 굴리는 두 개의 릴 [자동 · 하나 · 없음] [메모 5개] + 🎰 레버(아무 메모나 뽑기)
// 릴을 누르거나 · 휠을 굴리거나 · 위아래로 끌면 한 칸씩 돌아가요. 멈춘 칸이 골라져요
const REEL_H = 34;
function makeReel(labels, start, onSettle, cls = '') {
  const n = labels.length, COPIES = 5, MID = 2 * n;
  const el = document.createElement('div');
  el.className = 'reel ' + cls;
  el.tabIndex = 0;
  el.setAttribute('role', 'spinbutton');
  el.innerHTML = '<button type="button" class="rv up" aria-label="이전 칸">▴</button><div class="win"><div class="strip"></div></div><button type="button" class="rv dn" aria-label="다음 칸">▾</button>';
  const strip = el.querySelector('.strip');
  for (let c = 0; c < COPIES; c++) for (const t of labels) { const d = document.createElement('div'); d.className = 'cell'; d.textContent = t; strip.append(d); }
  let pos = MID + start, spinning = false;
  const place = (dur) => { strip.style.transition = dur ? `transform ${dur}s cubic-bezier(.15,.85,.25,1.12)` : 'none'; strip.style.transform = `translateY(${-pos * REEL_H}px)`; };
  const norm = () => { pos = MID + (((pos - MID) % n) + n) % n; place(0); void strip.offsetHeight; };
  place(0);
  el.setAttribute('aria-valuetext', labels[start]);
  const spin = (k, dur = 0.32) => {
    if (!n) return;
    norm();
    pos += k;
    spinning = true;
    el.classList.add('spinning');
    place(dur);
    clearTimeout(el._t);
    el._t = setTimeout(settle, dur * 1000 + 120); // 전환 끝 알림이 안 와도 멈추게
  };
  const settle = () => {
    if (!spinning) return;
    clearTimeout(el._t);
    spinning = false;
    el.classList.remove('spinning');
    norm();
    const i = pos - MID;
    el.setAttribute('aria-valuetext', labels[i]);
    el.classList.add('landed'); setTimeout(() => el.classList.remove('landed'), 260);
    onSettle(i);
  };
  strip.addEventListener('transitionend', settle);
  el.querySelector('.up').onclick = (e) => { e.stopPropagation(); spin(-1); };
  el.querySelector('.dn').onclick = (e) => { e.stopPropagation(); spin(1); };
  el.querySelector('.win').onclick = () => spin(1);
  let wheelT = 0;
  el.addEventListener('wheel', (e) => { e.preventDefault(); const now = performance.now(); if (now - wheelT < 140) return; wheelT = now; spin(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  el.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { spin(1); e.preventDefault(); } if (e.key === 'ArrowUp') { spin(-1); e.preventDefault(); } });
  let dragY = null;
  el.addEventListener('pointerdown', (e) => { if (e.target.closest('.rv')) return; dragY = e.clientY; });
  el.addEventListener('pointermove', (e) => { if (dragY == null) return; const dy = e.clientY - dragY; if (Math.abs(dy) > 18) { spin(dy < 0 ? 1 : -1); dragY = e.clientY; } });
  addEventListener('pointerup', () => { dragY = null; });
  el.spin = spin;
  el.size = n;
  el.cur = () => pos - MID;
  return el;
}
function renderMemoBar() {
  const el = $('#memo-bar');
  el.innerHTML = '';
  el.classList.add('slot');
  let leverBusy = false; // 레버를 당긴 동안에는 말풍선 릴이 멈춰도 바로 바꾸지 않아요
  const modeIdx = Math.max(0, MEMO_MODES.findIndex((m) => m.id === S.memoMode));
  const modeReel = makeReel(MEMO_MODES.map((m) => m.name), modeIdx, (i) => {
    const id = MEMO_MODES[i].id;
    if (leverBusy || id === S.memoMode) return;
    setMemoMode(id);
    toast(id === 'auto' ? '메모가 머리 위에 돌아가며 떠요' : id === 'one' ? `"${S.profile.memos[S.memoIdx] || ''}" 메모만 계속 떠요` : '말풍선을 껐어요');
  }, 'mode');
  modeReel.title = '말풍선: 자동 · 하나 · 없음';
  // 메모 릴: 비어 있지 않은 메모만
  const idxs = S.profile.memos.map((m, i) => [m, i]).filter(([m]) => m.trim());
  const start = Math.max(0, idxs.findIndex(([, i]) => i === S.memoIdx));
  const memoReel = makeReel(idxs.map(([m]) => m), start, (j) => {
    const [m, i] = idxs[j] || [];
    if (m == null) return;
    if (leverBusy) { leverBusy = false; setMemoMode('one', i); feed(S.name, saidText(m)); toast(`🎰 "${m}" 당첨! 이 메모가 계속 떠요`); return; }
    if (S.memoMode === 'one') { if (i !== S.memoIdx) { setMemoMode('one', i); feed(S.name, saidText(m)); } }
    else if (S.memoMode === 'auto') { S.memoIdx = i; store.set('memoIdx', i); me?.pin(i); net.sendAct({ m: i }); feed(S.name, saidText(m)); }
  }, 'memos' + (S.memoMode === 'off' ? ' off' : ''));
  memoReel.title = S.memoMode === 'one' ? '이 메모가 계속 떠요' : S.memoMode === 'auto' ? '굴려서 멈춘 메모를 한 번 띄워요' : '말풍선이 꺼져 있어요';
  // 🎰 레버: 메모 릴을 크게 돌려 아무 메모나 '하나'로
  const lever = document.createElement('button');
  lever.className = 'lever';
  lever.type = 'button';
  lever.title = '아무 메모나 뽑기';
  lever.setAttribute('aria-label', '아무 메모나 뽑기');
  lever.innerHTML = '<i></i>';
  lever.onclick = () => {
    if (!idxs.length) return;
    lever.classList.remove('pull'); void lever.offsetWidth; lever.classList.add('pull');
    leverBusy = true;
    if (S.memoMode !== 'one') { modeReel.spin((1 - modeReel.cur() + 3) % 3, 0.6); memoReel.classList.remove('off'); }
    const k = idxs.length + 1 + Math.floor(Math.random() * idxs.length);
    memoReel.spin(k, 1.3 + Math.random() * 0.4);
  };
  const ed = document.createElement('button');
  ed.className = 'slot-edit';
  ed.type = 'button';
  ed.title = '메모 고치기';
  ed.setAttribute('aria-label', '메모 고치기');
  ed.textContent = '✎';
  ed.onclick = () => openDesk('memo');
  el.append(modeReel, memoReel, lever, ed);
}

// ───────── 책상 정보 카드 ─────────
let cardFor = null;
const TILE_COLORS = ['#e2603d', '#2f8a6a', '#3d6fc4', '#8a5ac4', '#c49a2f', '#c43d6f'];
function openCard(i, who) {
  if (i < 0 || i == null) { if (who === 'me') { openDesk(); } return; }
  const o = who && who !== 'me' ? who : ownerOf(i);
  const opf = o === 'me' ? myPf() : o ? S.peers.get(o)?.pf : null;
  if (opf?.links?.length) { openShowcase(o); return; }
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
    const links = (pf.links || []).slice(0, MAX_LINKS).map((l, k) => {
      const host = hostOf(l.u);
      const init = (l.t || host || '?').trim()[0] || '?';
      return `<div class="c-link"><span class="c-tile" style="background:${TILE_COLORS[(host.length + k) % TILE_COLORS.length]}">${esc(init)}</span>
        <div><b>${esc(l.t || host)}</b><span class="host">${esc(host)}</span>${l.d ? `<p>${esc(l.d)}</p>` : ''}</div>
        <div class="acts"><button class="ghost small-btn" data-peek="${k}">미리보기</button><a class="primary small-btn" href="${esc(l.u)}" target="_blank" rel="noopener noreferrer">접속하기 ↗</a></div></div>`;
    }).join('');
    const now = nowOf(pf);
    const memos = (pf.memos || []).filter((m) => m.trim() && m !== now).map((m) => `<span>${esc(m)}</span>`).join('');
    body.innerHTML = `<div class="c-head"><span class="c-seat">DESK ${String(i + 1).padStart(2, '0')}${mine ? ' · 내 책상' : ''}</span>
        <span class="c-name">${esc(pf.n)} <small class="c-lv">Lv ${pf.lv || 1}</small></span>
        <span class="c-status ${sit ? '' : 'away'}"><i></i>${sit ? '책상에서 코딩 중' : '잠깐 자리 비움'}</span></div>
      ${now ? `<div class="c-now"><small>지금</small>${esc(now)}</div>` : ''}
      <p class="c-label">자랑하는 결과물 ${pf.links?.length ? `· ${Math.min(MAX_LINKS, pf.links.length)}개` : ''}</p>
      ${links ? `<div class="c-links">${links}</div>` : `<p class="c-empty">${mine ? '아직 올린 결과물이 없어요. 내 책상에서 3개까지 자랑할 수 있어요.' : '아직 올린 결과물이 없어요.'}</p>`}
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
  if (id === 'show-modal') $('#show-stage').innerHTML = '';
  if (id === 'creator') stopPreview();
  if (id === 'desk-modal') {
    $('#desk-modal').classList.remove('look-desk');
    if (me) { me.tag.visible = true; me.memoOn = true; }
    if (S.sitting) camBehind(office.seats[S.seat].ry, 3.4);
  }
}
function closeAll() { ['desk-modal', 'peek-modal', 'floor-modal', 'guide-modal', 'seat-modal', 'fridge-modal', 'show-modal', 'shop-modal'].forEach(closeModal); if (!$('#creator').hidden) closeModal('creator'); closeCard(); $('#menu').hidden = true; }
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-close]');
  if (c) { const id = c.dataset.close; if (id === 'card') closeCard(); else closeModal(id); }
  if (e.target.classList?.contains('modal') || e.target.id === 'creator') closeModal(e.target.id); // 팝업 바깥을 누르면 닫기
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
      const th = THEMES.find((t) => t.id === themeFor(f));
      const b = document.createElement('button');
      b.className = 'floor-btn';
      if (f === S.floor && S.entered) b.setAttribute('aria-current', 'true');
      b.disabled = n != null && n >= SEATS && f !== S.floor;
      b.innerHTML = `<b>${f}F</b><span>${esc(th?.name || '')} · ${n == null ? '인원 확인 중' : n >= SEATS ? '자리 없음' : `${n}명`}</span><span class="bar"><i style="width:${((n || 0) / SEATS) * 100}%"></i></span>`;
      b.onclick = () => {
        closeModal('floor-modal');
        if (!S.entered) { S.floor = f; enter(f); return; }
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

// ───────── 내 책상 (메모 · 결과물 · 꾸미기 · 상점) ─────────
let deskTab = 'memo';
function openDesk(tab = deskTab) {
  closeCard();
  const p = S.profile;
  const mg = $('#pf-memos');
  mg.innerHTML = '';
  for (let i = 0; i < MAX_MEMOS; i++) {
    const l = document.createElement('label');
    l.innerHTML = `<input maxlength="${LIMITS.memo}" placeholder="메모 ${i + 1}${i === 0 ? ' (지금 하는 일처럼 모니터에도 떠요)' : ''}" aria-label="메모 ${i + 1}">`;
    l.querySelector('input').value = p.memos[i] || '';
    mg.append(l);
  }
  const lr = $('#pf-links');
  lr.innerHTML = '';
  p.links.forEach(addLinkRow);
  $('#pf-add').hidden = p.links.length >= MAX_LINKS;
  $('#pf-error').hidden = true;
  setDeskTab(tab);
  openModal('desk-modal');
}
function setDeskTab(tab) {
  deskTab = tab;
  for (const b of $$('#desk-tabs [data-tab]')) b.setAttribute('aria-selected', b.dataset.tab === tab);
  for (const s of $$('#desk-form [data-pane]')) s.hidden = s.dataset.pane !== tab;
  $('#desk-save').hidden = tab === 'deco';
  // 꾸미기: 창을 오른쪽으로 비켜 두고 카메라가 내 책상을 내려다봐요
  $('#desk-modal').classList.toggle('look-desk', tab === 'deco');
  if (tab === 'deco') {
    renderDeco();
    const seat = office?.seats[S.seat];
    if (seat && S.entered) { if (!S.sitting) goSit(); camBehind(seat.ry, 4.2, 1.1); }
  }
  // 꾸미는 동안에는 내 이름표 · 말풍선이 책상을 가리지 않게
  if (me) { me.tag.visible = tab !== 'deco'; me.memoOn = tab !== 'deco'; }
}
$('#desk-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setDeskTab(b.dataset.tab); });
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
function showFormError(msg) { const e = $('#pf-error'); e.textContent = msg; e.hidden = false; }
$('#desk-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const memos = $$('#pf-memos input').map((i) => i.value.trim().slice(0, LIMITS.memo));
  const links = [];
  let bad = 0;
  for (const row of $$('#pf-links .link-row')) {
    const raw = row.querySelector('.u').value.trim();
    if (!raw) continue;
    const u = safeUrl(raw);
    if (!u) { bad++; continue; }
    links.push({ t: row.querySelector('.t').value.trim().slice(0, LIMITS.title), u, d: row.querySelector('.desc').value.trim().slice(0, LIMITS.desc) });
  }
  // 비속어 · 나쁜 말은 저장하지 않아요
  for (const [k, m] of memos.entries()) { const w = findBad(m); if (w) { setDeskTab('memo'); showFormError(`메모 ${k + 1}에 쓸 수 없는 말이 있어요. 비속어 · 나쁜 말은 같은 층 모두에게 보이니 고쳐 주세요.`); $$('#pf-memos input')[k].focus(); return; } }
  for (const l of links) if (findBad(l.t + ' ' + l.d)) { setDeskTab('links'); showFormError('결과물 이름이나 설명에 쓸 수 없는 말이 있어요.'); return; }
  S.profile = { ...S.profile, memos, links: links.slice(0, MAX_LINKS) };
  store.set('profile', S.profile);
  if (S.memoMode === 'one' && !memos[S.memoIdx]?.trim()) S.memoIdx = Math.max(0, memos.findIndex((m) => m.trim()));
  applyMyMemos();
  pushProfile();
  renderMemoBar();
  closeModal('desk-modal');
  toast(bad ? `저장했어요. 주소가 이상한 결과물 ${bad}개는 뺐어요` : '내 책상을 저장했어요');
});

// 꾸미기 · 상점
function saveDesk() {
  store.set('profile', S.profile);
  pushProfile();
}
function buy(kind, it) {
  const key = shopKey(kind, it.id);
  if (S.owned.has(key)) return true;
  if (lv() < it.lv) { toast(`Lv ${it.lv}부터 살 수 있어요 (지금 Lv ${lv()})`); return false; }
  if (S.pts < it.price) { toast(`포인트가 ${it.price - S.pts}P 모자라요. 책상에 앉아 집중하면 1분에 1P씩 쌓여요`); return false; }
  S.pts -= it.price;
  S.owned.add(key);
  store.set('pts', S.pts);
  store.set('owned', [...S.owned].filter((k) => !FREE_OWNED.includes(k)));
  toast(`${it.name}을(를) 샀어요 (−${it.price}P)`);
  renderXp();
  return true;
}
// 아이템 미리보기 그림: 작은 화면 하나로 차례차례 그려서 그림 주소로 저장해 둬요
const thumbs = new Map();
let thumbR = null, thumbQ = [], thumbBusy = false;
function thumbOf(kind, id, img) {
  const key = kind + ':' + id;
  if (thumbs.has(key)) { img.src = thumbs.get(key); return; }
  thumbQ.push([key, kind, id, img]);
  if (!thumbBusy) { thumbBusy = true; requestAnimationFrame(drainThumbs); }
}
function drainThumbs() {
  if (!thumbR) {
    const c = document.createElement('canvas');
    thumbR = { r: new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true }), sc: new THREE.Scene(), cm: new THREE.PerspectiveCamera(30, 4 / 3, 0.01, 50) };
    thumbR.r.setSize(240, 180, false);
    thumbR.r.toneMapping = THREE.ACESFilmicToneMapping;
    thumbR.sc.environment = scene.environment;
    thumbR.sc.environmentIntensity = 0.6;
    thumbR.sc.add(new THREE.HemisphereLight('#f0f2ff', '#4a3a2e', 1.6));
    const d = new THREE.DirectionalLight('#fff4e6', 1.8); d.position.set(2, 4, 3); thumbR.sc.add(d);
  }
  const t0 = performance.now();
  while (thumbQ.length && performance.now() - t0 < 24) {
    const [key, kind, id, img] = thumbQ.shift();
    if (!thumbs.has(key)) {
      const m = itemModel(kind, id);
      thumbR.sc.add(m);
      const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
      const r = Math.max(sz.x, sz.y * 1.25, sz.z) || 0.3;
      thumbR.cm.position.set(c.x + r * 1.1, c.y + r * 0.85, c.z + r * 1.9);
      thumbR.cm.lookAt(c);
      thumbR.r.render(thumbR.sc, thumbR.cm);
      thumbs.set(key, thumbR.r.domElement.toDataURL('image/png'));
      thumbR.sc.remove(m);
      m.traverse((o) => { if (o.isMesh && o.geometry.type !== 'BoxGeometry') o.geometry.dispose(); });
    }
    img.src = thumbs.get(key);
  }
  if (thumbQ.length) requestAnimationFrame(drainThumbs); else thumbBusy = false;
}

function shopCard(kind, it, selected, onPick) {
  const owned = S.owned.has(shopKey(kind, it.id));
  const locked = !owned && lv() < it.lv;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `shop-card tier${it.tier}${owned ? ' owned' : ''}${locked ? ' locked' : ''}`;
  b.setAttribute('aria-pressed', !!selected);
  b.innerHTML = `<img class="thumb" alt="" width="240" height="180"><span class="nm">${esc(it.name)}</span><span class="pr">${owned ? (selected ? '놓는 중' : '가지고 있음') : locked ? `🔒 Lv ${it.lv}` : `${it.price.toLocaleString()} P`}</span>`;
  thumbOf(kind, it.id, b.querySelector('.thumb'));
  b.onclick = () => { if (!owned && !buy(kind, it)) return; onPick(); };
  return b;
}
function renderDeco() {
  const d = S.profile.desk;
  const apply = () => { S.profile.desk = cleanDesk(d); saveDesk(); renderDeco(); };
  const sw = (el, list, key) => {
    el.innerHTML = '';
    for (const c of list) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch'; b.style.background = c.c; b.title = c.name;
      b.setAttribute('aria-label', c.name); b.setAttribute('aria-pressed', d[key] === c.id);
      b.onclick = () => { d[key] = c.id; apply(); };
      el.append(b);
    }
  };
  sw($('#deco-color'), DESK_COLORS, 'c');
  sw($('#deco-chaircolor'), CHAIR_COLORS, 'ch');
  for (const [kind, key, el] of [['mon', 'mon', '#deco-mon'], ['kb', 'kb', '#deco-kb'], ['chair', 'chair', '#deco-chair']]) {
    const box = $(el);
    box.innerHTML = '';
    for (const it of SHOP[kind].filter((x) => S.owned.has(shopKey(kind, x.id)))) box.append(shopCard(kind, it, d[key] === it.id, () => { d[key] = it.id; apply(); }));
  }
  const slotCount = d.it.filter((id) => !DESK_ITEMS.find((x) => x.id === id)?.spot).length;
  $('#deco-count').textContent = `책상 위 ${slotCount}/${MAX_ITEMS}`;
  const items = $('#deco-items');
  items.innerHTML = '';
  for (const tier of [0, 1, 2, 3]) {
    const mine = DESK_ITEMS.filter((x) => x.tier === tier && S.owned.has(shopKey('it', x.id)));
    if (!mine.length) continue;
    const h = document.createElement('p');
    h.className = 'tier-h';
    h.textContent = TIERS[tier];
    items.append(h);
    const row = document.createElement('div');
    row.className = 'shop-grid';
    for (const it of mine) {
      const on = d.it.includes(it.id);
      row.append(shopCard('it', it, on, () => {
        if (on) d.it = d.it.filter((x) => x !== it.id);
        else {
          if (!it.spot && slotCount >= MAX_ITEMS) { toast(`책상 위에는 ${MAX_ITEMS}개까지 놓을 수 있어요. 하나를 먼저 치워 주세요`); return; }
          d.it = [...d.it, it.id];
        }
        apply();
      }));
    }
    items.append(row);
  }
  renderXp();
}

// 상점: 살 수 있는 것만. 사면 바로 내 책상에 놓여요 (빼거나 바꾸는 건 책상 꾸미기에서)
function openShop() { renderShop(); openModal('shop-modal'); }
function renderShop() {
  const d = S.profile.desk;
  const equip = (kind, it) => {
    if (kind === 'it') {
      const slots = d.it.filter((id) => !DESK_ITEMS.find((x) => x.id === id)?.spot).length;
      if (it.spot || slots < MAX_ITEMS) d.it = [...d.it, it.id];
      else toast(`책상 위가 꽉 찼어요. 책상 꾸미기에서 하나를 치우면 놓을 수 있어요`);
    } else d[kind] = it.id;
    S.profile.desk = cleanDesk(d);
    saveDesk();
  };
  for (const kind of ['mon', 'kb', 'chair']) {
    const el = $('#shop-' + kind);
    el.innerHTML = '';
    for (const it of SHOP[kind].filter((x) => x.price > 0)) {
      const owned = S.owned.has(shopKey(kind, it.id));
      el.append(shopCard(kind, it, false, () => { if (owned) { toast('이미 가지고 있어요. 책상 꾸미기에서 바꿔 놓을 수 있어요'); return; } equip(kind, it); renderShop(); }));
    }
  }
  const items = $('#shop-items');
  items.innerHTML = '';
  for (const tier of [1, 2, 3]) {
    const h = document.createElement('p'); h.className = 'tier-h'; h.textContent = TIERS[tier]; items.append(h);
    const row = document.createElement('div'); row.className = 'shop-grid';
    for (const it of DESK_ITEMS.filter((x) => x.tier === tier)) {
      const owned = S.owned.has(shopKey('it', it.id));
      row.append(shopCard('it', it, false, () => { if (owned) { toast('이미 가지고 있어요. 책상 꾸미기에서 놓거나 뺄 수 있어요'); return; } equip('it', it); renderShop(); }));
    }
    items.append(row);
  }
  renderXp();
}

// ───────── 집중 → 경험치 · 포인트 ─────────
function renderXp() {
  const L = lv(), a = xpForLevel(L), b = xpForLevel(L + 1);
  const pct = Math.round(((S.xp - a) / (b - a)) * 100);
  $('#xp-chip').innerHTML = `<b>Lv ${L}</b><span class="xp-bar"><i style="width:${pct}%"></i></span><span>${S.pts.toLocaleString()} P</span>`;
  $('#xp-chip').title = `경험치 ${S.xp} · 다음 레벨까지 ${b - S.xp}분 집중`;
  const sw = $('#shop-wallet');
  if (sw) sw.innerHTML = `<b>Lv ${L}</b> · 다음 레벨까지 ${b - S.xp}분 · <b class="pts">${S.pts.toLocaleString()} P</b>`;
  const w = $('#deco-wallet');
  if (w) w.innerHTML = `<b>Lv ${L}</b> · 다음 레벨까지 ${b - S.xp}분 · <b class="pts">${S.pts.toLocaleString()} P</b>`;
}
const today = () => new Date().toLocaleDateString('sv');
let focusLast = Date.now(), focusCarry = store.get('focusCarry', 0);
function tickFocus() {
  const now = Date.now();
  const dt = Math.min(90, (now - focusLast) / 1000);
  focusLast = now;
  if (!S.entered) { $('#focus-chip').hidden = true; return; }
  const key = 'focus.' + today();
  let s = store.get(key, 0);
  if (S.sitting) {
    s += dt; store.set(key, Math.round(s));
    // 앉아 있던 60초마다 1 XP · 1 P
    focusCarry += dt;
    if (focusCarry >= 60) {
      const n = Math.floor(focusCarry / 60);
      focusCarry -= n * 60;
      const before = lv();
      S.xp += n; S.pts += n;
      store.set('xp', S.xp); store.set('pts', S.pts);
      renderXp();
      if (lv() > before) { toast(`레벨 업! Lv ${lv()} · 새 아이템을 살 수 있어요`, 5000); me?.play('clap'); pushProfile(); }
    }
    store.set('focusCarry', Math.round(focusCarry));
  }
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const el = $('#focus-chip');
  el.hidden = false;
  el.textContent = `오늘 ${h ? h + '시간 ' : ''}${m}분 집중`;
}
setInterval(tickFocus, 1000);

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
  const av = new Avatar(S.draft, '', {});
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
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
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

function bodySvg(B) {
  const u = 26, base = 58, leg = 0.46 * B.leg * B.k * u, th = 0.56 * B.th * B.k * u, hd = 0.52 * B.head * B.k * u, tw = 0.5 * B.tw * B.k * u;
  const lw = 0.2 * B.limb * B.k * u, aw = 0.15 * B.limb * B.k * u, cx = 24;
  const ty = base - leg - th, hy = ty - hd - 0.5;
  return `<svg viewBox="0 0 48 60" aria-hidden="true">
    <rect x="${cx - tw * 0.24 - lw / 2}" y="${base - leg}" width="${lw}" height="${leg}" rx="1"/><rect x="${cx + tw * 0.24 - lw / 2}" y="${base - leg}" width="${lw}" height="${leg}" rx="1"/>
    <rect x="${cx - tw / 2}" y="${ty}" width="${tw}" height="${th}" rx="1.5"/>
    <rect x="${cx - tw / 2 - aw - 0.4}" y="${ty + 0.5}" width="${aw}" height="${th * 0.82}" rx="1"/><rect x="${cx + tw / 2 + 0.4}" y="${ty + 0.5}" width="${aw}" height="${th * 0.82}" rx="1"/>
    <rect x="${cx - hd / 2}" y="${hy}" width="${hd}" height="${hd}" rx="2"/></svg>`;
}
function chips(el, list, key, label = (x) => x.name, cap) {
  el.innerHTML = '';
  for (const it of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.innerHTML = `<span>${esc(label(it))}</span>${cap?.(it) ? `<small class="cap">${esc(cap(it))}</small>` : ''}`;
    b.setAttribute('aria-pressed', S.draft[key] === it.id);
    b.onclick = () => { S.draft[key] = it.id; renderCreator(); };
    el.append(b);
  }
}
function renderCreator() {
  const bd = $('#opt-body');
  bd.innerHTML = '';
  for (const B of BODIES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'body-pick'; b.title = B.label;
    b.setAttribute('aria-label', B.label); b.setAttribute('aria-pressed', S.draft.body === B.id);
    b.innerHTML = bodySvg(B);
    b.onclick = () => { S.draft.body = B.id; renderCreator(); };
    bd.append(b);
  }
  $('#body-name').textContent = BODIES.find((B) => B.id === S.draft.body)?.label || '';
  chips($('#opt-gender'), GENDERS, 'gender', (g) => g.name);
  chips($('#opt-type'), CHAR_TYPES, 'type', (t) => hairName(t, S.draft.gender), (t) => t.color);
  chips($('#opt-outfit'), OUTFITS.filter((o) => !o.hidden), 'outfit', (o) => o.name, (o) => o.cap);
  chips($('#opt-acc'), ACCESSORIES, 'acc');
  chips($('#opt-pet'), PET_IDS.map((id) => PETS.find((p) => p.id === id)).filter(Boolean), 'pet', (p) => p.name + (NEW_PETS.has(p.id) ? ' NEW' : ''), (p) => p.cap);
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
  $('#nick-error').hidden = true;
  $('#creator').hidden = false;
  startPreview();
  renderCreator();
}
$('#nick-dice').onclick = () => { $('#nick').value = randomName(); };
$('#creator-done').onclick = () => {
  const nick = $('#nick').value.trim().slice(0, LIMITS.name) || randomName();
  if (findBad(nick)) { const e = $('#nick-error'); e.textContent = '닉네임에 쓸 수 없는 말이 있어요. 다른 이름으로 바꿔 주세요.'; e.hidden = false; $('#nick').focus(); return; }
  S.look = fixLook(S.draft);
  S.name = nick;
  store.set('look', S.look);
  store.set('name', S.name);
  if (me) { me.setLook(S.look); me.setName(S.name); }
  pushProfile();
  closeModal('creator');
};

// ───────── 오른쪽 메뉴: 내 웹 올리기 · 웹 둘러보기 · 상점 ─────────
// 내 웹 자랑: 올린 결과물이 있으면 내 쇼케이스(◀ ▶ 로 다른 분도), 없으면 올리는 칸
$('#btn-web').onclick = () => (myPf().links?.length ? openShowcase('me') : openDesk('links'));

// ───────── 결과물 쇼케이스 (B): 미리보기는 그 사이트의 OG 이미지, 양옆 ◀ ▶ 로 다른 사람 ─────────
const show = { list: [], i: 0, k: 0, live: false };
const ogCache = new Map();
// 결과물을 올린 사람만, 자리 번호 순
function showPeople() {
  const all = [['me', myPf(), S.seat], ...[...S.peers.entries()].map(([id, p]) => [id, p.pf, p.seat])];
  return all.filter(([, pf]) => pf.links?.length).sort((a, b) => (a[2] < 0 ? 99 : a[2]) - (b[2] < 0 ? 99 : b[2]));
}
function openShowcase(who, k = 0) {
  const list = showPeople();
  if (!list.length) { toast('아직 이 층에 올라온 결과물이 없어요. 내 웹 올리기로 첫 번째가 되어 보세요'); return; }
  closeCard();
  Object.assign(show, { list, i: Math.max(0, list.findIndex((x) => x[0] === who)), k, live: false });
  renderShow();
  openModal('show-modal');
}
function stepShow(d) {
  show.list = showPeople();
  if (!show.list.length) { closeModal('show-modal'); return; }
  show.i = (show.i + d + show.list.length) % show.list.length;
  show.k = 0; show.live = false;
  renderShow();
}
function fetchOg(u) {
  if (ogCache.has(u)) return ogCache.get(u);
  const p = RELAY_URL ? fetch(`${RELAY_URL}/og?u=${encodeURIComponent(u)}`, { signal: AbortSignal.timeout(7000) }).then((r) => r.json()).catch(() => ({ ok: false })) : Promise.resolve({ ok: false });
  ogCache.set(u, p);
  return p;
}
function renderShow() {
  const [who, pf, seat] = show.list[show.i] || [];
  if (!pf) return;
  const mine = who === 'me';
  const sit = mine ? S.sitting : !!S.peers.get(who)?.st?.sit;
  $('#show-seat').textContent = seat >= 0 ? `DESK ${String(seat + 1).padStart(2, '0')}${mine ? ' · 내 책상' : ''}` : '';
  $('#show-name').textContent = pf.n;
  $('#show-lv').textContent = `Lv ${pf.lv || 1}`;
  $('#show-status').className = 'c-status' + (sit ? '' : ' away');
  $('#show-status span').textContent = sit ? '책상에서 코딩 중' : '잠깐 자리 비움';
  const now = nowOf(pf);
  $('#show-now').textContent = now ? `지금 · ${now}` : '';
  $('#show-edit').hidden = !mine;
  const many = show.list.length > 1;
  $('#show-prev').hidden = $('#show-next').hidden = !many;
  $('#show-count').textContent = many ? `${show.i + 1} / ${show.list.length}명 · ◀ ▶ 또는 키보드 ← → 로 다른 분 결과물` : '이 층에서 결과물을 올린 분은 지금 이분뿐이에요';
  const links = pf.links.slice(0, MAX_LINKS);
  show.k = Math.min(show.k, links.length - 1);
  const ol = $('#show-list');
  ol.innerHTML = '';
  links.forEach((l, k) => {
    const host = hostOf(l.u);
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" aria-pressed="${k === show.k}"><span class="c-tile" style="background:${TILE_COLORS[(host.length + k) % TILE_COLORS.length]}">${esc((l.t || host || '?').trim()[0] || '?')}</span><span class="t"><b>${esc(l.t || host)}</b><small>${esc(host)}</small></span></button>`;
    li.querySelector('button').onclick = () => { show.k = k; show.live = false; renderShow(); };
    ol.append(li);
  });
  const l = links[show.k];
  const u = safeUrl(l.u), host = hostOf(u);
  $('#show-url').textContent = u.replace(/^https?:\/\//, '');
  $('#show-open').href = u;
  $('#show-desc').textContent = l.d || '';
  $('#show-live').textContent = show.live ? 'OG 이미지로 보기' : '실제 화면으로 보기';
  const stage = $('#show-stage');
  const tile = `<div class="show-fallback"><span class="c-tile big" style="background:${TILE_COLORS[(host.length + show.k) % TILE_COLORS.length]}">${esc((l.t || host || '?').trim()[0] || '?')}</span><b>${esc(l.t || host)}</b><small>${esc(host)}</small></div>`;
  if (show.live) {
    // 실제 화면: 막아 둔 사이트는 비어 보여요. 이 사이트 자신은 넣지 않아요
    stage.innerHTML = `<p class="show-note">불러오는 중… 화면이 비어 보이면 그 사이트가 미리보기를 막아 둔 거예요. <b>접속하기</b>로 열어 주세요.</p><iframe title="${esc(l.t || host)} 실제 화면" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerpolicy="no-referrer"></iframe>`;
    stage.querySelector('iframe').src = new URL(u).origin === location.origin ? 'about:blank' : u;
    return;
  }
  stage.innerHTML = tile;
  const want = u;
  fetchOg(u).then((og) => {
    if (!og?.ok || $('#show-modal').hidden || show.live || safeUrl(show.list[show.i]?.[1].links?.[show.k]?.u) !== want) return;
    if (!l.d && og.desc) $('#show-desc').textContent = og.desc;
    if (!og.image) return;
    const img = new Image();
    img.alt = `${l.t || host} 미리보기 이미지`;
    img.referrerPolicy = 'no-referrer';
    img.onload = () => { if (safeUrl(show.list[show.i]?.[1].links?.[show.k]?.u) === want && !show.live) { stage.innerHTML = ''; stage.append(img); } };
    img.src = og.image;
  });
}
$('#show-prev').onclick = () => stepShow(-1);
$('#show-next').onclick = () => stepShow(1);
$('#show-live').onclick = () => { show.live = !show.live; renderShow(); };
$('#show-edit').onclick = () => { closeModal('show-modal'); openDesk('links'); };
addEventListener('keydown', (e) => { if ($('#show-modal').hidden || typing()) return; if (e.key === 'ArrowLeft') { stepShow(-1); e.preventDefault(); } if (e.key === 'ArrowRight') { stepShow(1); e.preventDefault(); } }, true);

// ───────── 화면 위 단추 ─────────
$('#floor-chip').onclick = openFloors;
$('#btn-shop').onclick = () => openDesk('deco');
$('#xp-chip').onclick = openShop;
$('#btn-store').onclick = openShop;
$('#deco-to-shop').onclick = () => { closeModal('desk-modal'); openShop(); };
$('#btn-char').onclick = openCreator;
$('#btn-menu').onclick = () => { $('#menu').hidden = !$('#menu').hidden; $('#menu-others').textContent = S.othersMemo ? '다른 분 메모 숨기기' : '다른 분 메모 보기'; };
$('#menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-menu]');
  if (!b) return;
  $('#menu').hidden = true;
  const m = b.dataset.menu;
  if (m === 'guide') openModal('guide-modal');
  if (m === 'browse') openShowcase(null);
  if (m === 'memo') openDesk('memo');
  if (m === 'floor') openFloors();
  if (m === 'others') {
    S.othersMemo = !S.othersMemo;
    store.set('othersMemo', S.othersMemo);
    for (const p of S.peers.values()) p.av.setMemos(S.othersMemo ? p.pf.memos : [], p.pf.mm || 'auto', p.pf.mi | 0);
    toast(S.othersMemo ? '다른 분 메모를 다시 보여요' : '다른 분 메모를 숨겼어요');
  }
});

// ───────── 연습용 가짜 동료 (?demo=12) ─────────
function demo(n) {
  const memoSets = [['캠핑장 모닥불 고치는 중', '다들 화이팅!', '집중 모드 🎧'], ['가계부 앱 차트 다듬기', '어서오세요'], ['디스코드 봇 배포', '배포 성공 🎉', '다들 뭐하세요?'], ['포트폴리오 리뉴얼', '오늘은 여기까지'], ['게임 잼 출품작', '버그 잡는 중…']];
  const links = [[{ t: '캠핑장 메타버스', u: 'https://campingjang.site', d: '모닥불 앞에 같이 앉아 있는 3D 캠핑장' }], [{ t: '큰법당 템플스테이', u: 'https://templestay.site', d: '산·강·바다가 보이는 3D 법당' }, { t: '깃허브', u: 'https://github.com' }], []];
  const decks = [
    { c: 'white', ch: 'cream', mon: 'studio', kb: 'hhkb', chair: 'mesh', it: ['macmini', 'espresso', 'monstera', 'lightbar', 'humidifier'] },
    { c: 'walnut', ch: 'terra', mon: 'd', kb: 'mech', chair: 'gaming', it: ['figure', 'cans', 'gamepad', 'neon', 'retro'] },
    { c: 'mint', ch: 'teal', mon: 'v', kb: 'split', chair: 'basic', it: ['plant', 'catdoll', 'postit', 'fan', 'blanket'] },
    { c: 'black', ch: 'navy', mon: 'w', kb: 'mech', chair: 'basic', it: ['speaker', 'headset', 'mic', 'webcam', 'aquarium'] },
    { c: 'oak', ch: 'charcoal', mon: 'm', kb: 'basic', chair: 'basic', it: ['books', 'mug', 'lamp', 'duck', 'cushion'] },
    { c: 'pink', ch: 'wine', mon: 'l', kb: 'basic', chair: 'basic', it: ['cactus', 'frame', 'clock', 'drip', 'lego', 'globe'] },
  ];
  S.seat = 7;
  const outfits = OUTFITS.filter((o) => !o.hidden);
  for (let i = 0; i < n; i++) {
    const id = 'demo' + i;
    const look = { body: BODIES[i % BODIES.length].id, type: CHAR_TYPES[i % CHAR_TYPES.length].id, gender: i % 3 ? 'm' : 'f', skin: SKIN_TONES[i % 5], outfit: outfits[(i * 7) % outfits.length].id, acc: ACCESSORIES[(i * 3) % ACCESSORIES.length].id, pet: PET_IDS[(i * 5) % PET_IDS.length] };
    const pf = { n: randomName(), look, memos: memoSets[i % memoSets.length], links: links[i % 3], desk: decks[i % decks.length], mm: i % 4 === 1 ? 'one' : 'auto', mi: 0, lv: 1 + ((i * 3) % 9) };
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
    office.tickDesks(now / 1000);
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
    stopTour();
    tripToken++; // 걸어가던 동작은 멈춰요
    hideMarker();
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
      // 막혀서 0.8초 동안 가까워지지 않으면: 자리 · 동작이면 그 자리로 바로 가고, 바닥을 눌러 걷던 거면 그 앞에서 멈춰요
      if (d < w.best - 0.05) { w.best = d; w.stuck = 0; } else if ((w.stuck += dt) > 0.8) { if (w.soft) { S.walkTo = null; hideMarker(); } else { pos.x = w.x; pos.z = w.z; } }
    }
  }
  me.speed = speed;
  me.update(dt, ACTIONS);
  sendT += dt;
  if (sendT > 0.15) { sendT = 0; sendState(false); }
}

// ───────── 시작: 로딩 화면 → 바로 출근 ─────────
async function boot() {
  const t0 = performance.now();
  // 캔버스 글씨(이름표·말풍선·모니터)가 기본 글꼴로 그려지지 않게 글꼴을 먼저 받는다
  await Promise.race([
    Promise.all([document.fonts.load(`600 38px ${FONT}`), document.fonts.load('700 40px "JetBrains Mono"'), document.fonts.load(`400 24px ${FONT}`)]),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => {});
  const floorP = S.floor ? Promise.resolve(S.floor) : (Q.has('demo') ? Promise.resolve(1) : pickDefaultFloor());
  S.floor = await floorP;
  // 주소는 처음부터 ?f=층 으로 (soho-lab.site 로 들어와도 대문 없이 그 층으로)
  history.replaceState(null, '', `?f=${S.floor}${Q.has('relay') ? '&relay=' + Q.get('relay') : ''}${Q.has('solo') ? '&solo' : ''}${Q.has('theme') ? '&theme=' + Q.get('theme') : ''}${Q.has('debug') ? '&debug' : ''}`);
  setOffice(S.floor);
  setInterval(applyTime, 10 * 60 * 1000);
  frame();
  // 사무실이 다 지어지면 로딩 화면 뒤로 사무실이 보여요
  requestAnimationFrame(() => $('#loading').classList.add('scene'));
  if (RELAY_URL && !Q.has('relay') && !Q.has('demo')) fetch(`${RELAY_URL}/visit`, { method: 'POST' }).catch(() => {});
  // 로딩 화면의 글을 읽을 수 있게 조금은 보여 줘요
  const wait = Q.has('fast') ? 0 : 3200;
  await new Promise((r) => setTimeout(r, wait));
  await enter(S.floor);
  $('#loading').classList.add('out');
  setTimeout(() => $('#loading').remove(), 600);
}
boot();

// 시험용
if (Q.has('debug')) window.__S = { S, cam, net, scene, camera, openCard, openDesk, openFloors, openCreator, peek, enter, moveToSeat, doAct, setMemoMode, refreshAllScreens, get office() { return office; }, get me() { return me; } };
