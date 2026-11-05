// 소호랩: 3D 사무실, 내 캐릭터, 같은 층 사람들, 책상 정보 카드, 메모 말풍선, 집중 경험치 · 책상 꾸미기.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  RELAY_URL, SITE, FLOORS, SEATS, MAX_MEMOS, MAX_LINKS, MAX_ITEMS, LIMITS, SKIN_TONES, BODIES, CHAR_TYPES, hairName, HAIR_COLORS, GENDERS, OUTFITS, OUTFIT_COLORS, ACCESSORIES, ACTIONS,
  PET_IDS, NEW_PETS, DESK_COLORS, CHAIR_COLORS, MONITORS, KEYBOARDS, CHAIRS, DESK_ITEMS, TIERS, SHOP, shopKey, FREE_OWNED, levelOf, xpForLevel,
  MEMO_MODES, FLOOR_THEMES, START_FLOOR, randomName, defaultLook, fixLook, fixProfile, defaultDesk, safeUrl, hostOf,
} from './data.js';
import { PETS } from './blocky.js';
import { Avatar, FONT } from './avatar.js';
import { buildOffice, collide, paintScreen, paintSecond, dressDesk, itemModel, SPAWN, ROOM, THEMES } from './world.js';
import { Net } from './net.js';
import { findBad } from './badwords.js';
import { initTodo } from './todo.js';
import { Sound, MUSIC, AMBIENT } from './sound.js';
import { addPhoto, listPhotos, removePhoto } from './album.js';
import { launchFirework, stepFireworks } from './fx.js';
import { BADGES, earned } from './badges.js';

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
  nav = null;
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
  // 창밖 하늘은 실제 한국 시간대로 (낮 · 노을 · 밤). 우주 · 네온 창밖은 늘 그대로
  const h = Q.has('hour') ? +Q.get('hour') : new Date(Date.now() + 9 * 3600e3).getUTCHours();
  office.paintSky(h);
  // 낮으로 꾸민 층도 밤이 되면 햇빛을 줄이고, 노을 무렵엔 붉게
  const phase = (x) => (x < 5 || x >= 19 ? 'night' : x < 7 || x >= 17 ? 'dusk' : 'day');
  const tp = phase(T.hour ?? 12), np = phase(h);
  const k = tp === 'day' && np === 'night' ? 0.5 : tp === 'day' && np === 'dusk' ? 0.8 : 1;
  hemi.color.set(L.sky || '#cdd6ff');
  hemi.groundColor.set(L.ground || '#4a3a2e');
  hemi.intensity = (L.hemi ?? 1) * (0.55 + 0.45 * k) * (tp === 'night' && np === 'day' ? 1.15 : 1);
  sun.intensity = (L.sun ?? 1.2) * k;
  sun.color.set(tp === 'day' && np === 'dusk' ? '#ffb47a' : tp === 'day' && np === 'night' ? '#c8d0ff' : L.sunC || '#ffe6c8');
  renderer.toneMappingExposure = (L.exp ?? 1.05) * (0.9 + 0.1 * k);
  scene.fog = L.fog ? new THREE.Fog(L.fog[0], L.fog[1], L.fog[2]) : null;
}

// ───────── 카메라 ─────────
const cam = { yaw: Math.PI, pitch: 0.42, dist: 5.2, target: new THREE.Vector3(0, 1.2, 0), wantYaw: null, wantDist: null };
function placeCamera(dt) {
  if (S.calm && office) { calmCamera(dt); return; }
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
// 공유 창 · 다른 앱으로 넘어가면 손가락 뗌(pointerup)이 안 올 때가 있어요. 남은 손가락이 있다고 믿으면
// 다음 누름이 모두 '두 손가락'으로 잡혀 화면이 안 움직이니, 새 누름의 첫 손가락에서 · 창을 떠날 때 비워요
const clearTouches = () => { touches.clear(); ptr.down = false; };
addEventListener('blur', clearTouches);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearTouches(); });
canvas.addEventListener('pointerdown', (e) => {
  if (e.isPrimary) touches.clear();
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
    if (S.photo) { /* 사진 찍는 중에는 구도만 잡아요 */ }
    else if (!$('#desk-modal').hidden) closeModal('desk-modal'); // 꾸미기 창 바깥을 누르면 닫기
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
  else if (u.kind === 'sofa') goSofa(hit.point);
}

// ───────── 길찾기: 0.4 m 칸 지도에서 책상 · 의자 · 화분 둘레에 여유를 두고 A* ─────────
let nav = null;
const NAV_CELL = 0.4, NAV_GAP = 0.7; // 장애물에서 띄울 거리
function buildNav() {
  const W = Math.ceil((ROOM.maxX - ROOM.minX) / NAV_CELL) + 1, H = Math.ceil((ROOM.maxZ - ROOM.minZ) / NAV_CELL) + 1;
  const block = new Uint8Array(W * H);
  const mark = (x0, x1, z0, z1) => {
    for (let j = Math.max(0, Math.floor((z0 - ROOM.minZ) / NAV_CELL)); j <= Math.min(H - 1, Math.ceil((z1 - ROOM.minZ) / NAV_CELL)); j++)
      for (let i = Math.max(0, Math.floor((x0 - ROOM.minX) / NAV_CELL)); i <= Math.min(W - 1, Math.ceil((x1 - ROOM.minX) / NAV_CELL)); i++) {
        const x = ROOM.minX + i * NAV_CELL, z = ROOM.minZ + j * NAV_CELL;
        if (x >= x0 && x <= x1 && z >= z0 && z <= z1) block[j * W + i] = 1;
      }
  };
  for (const c of office.colliders) mark(c.minX - NAV_GAP, c.maxX + NAV_GAP, c.minZ - NAV_GAP, c.maxZ + NAV_GAP);
  for (const s of office.seats) mark(s.x - 0.5, s.x + 0.5, s.z - 0.45, s.z + 0.45); // 의자
  mark(ROOM.minX - 1, ROOM.maxX + 1, ROOM.minZ - 1, ROOM.minZ + 0.5); mark(ROOM.minX - 1, ROOM.maxX + 1, ROOM.maxZ - 0.5, ROOM.maxZ + 1);
  mark(ROOM.minX - 1, ROOM.minX + 0.5, ROOM.minZ - 1, ROOM.maxZ + 1); mark(ROOM.maxX - 0.5, ROOM.maxX + 1, ROOM.minZ - 1, ROOM.maxZ + 1);
  nav = { W, H, block };
}
function findPath(from, to) {
  if (!nav) buildNav();
  const { W, H, block } = nav;
  const cell = (x, z) => [Math.max(0, Math.min(W - 1, Math.round((x - ROOM.minX) / NAV_CELL))), Math.max(0, Math.min(H - 1, Math.round((z - ROOM.minZ) / NAV_CELL)))];
  const free = (i, j) => i >= 0 && j >= 0 && i < W && j < H && !block[j * W + i];
  // 막힌 칸에서 출발 · 도착하면 가장 가까운 빈 칸으로
  const nearestFree = ([i, j]) => {
    if (free(i, j)) return [i, j];
    for (let r = 1; r < 12; r++) { let best = null, bd = Infinity; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !free(i + di, j + dj)) continue; const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i + di, j + dj]; } } if (best) return best; }
    return [i, j];
  };
  const s = nearestFree(cell(from.x, from.z)), g = nearestFree(cell(to.x, to.z));
  const key = (i, j) => j * W + i, gk = key(...g);
  const open = new Map([[key(...s), { i: s[0], j: s[1], g: 0, f: 0, p: null }]]), closed = new Map();
  const h = (i, j) => { const dx = Math.abs(i - g[0]), dz = Math.abs(j - g[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  let found = null, guard = 0;
  while (open.size && guard++ < 6000) {
    let cur = null;
    for (const n of open.values()) if (!cur || n.f < cur.f) cur = n;
    const ck = key(cur.i, cur.j);
    open.delete(ck); closed.set(ck, cur);
    if (ck === gk) { found = cur; break; }
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = cur.i + di, nj = cur.j + dj, nk = key(ni, nj);
      if (!free(ni, nj) || closed.has(nk)) continue;
      if (di && dj && (!free(cur.i + di, cur.j) || !free(cur.i, cur.j + dj))) continue; // 모서리 비켜 가기
      const ng = cur.g + (di && dj ? 1.414 : 1);
      const old = open.get(nk);
      if (!old || ng < old.g) open.set(nk, { i: ni, j: nj, g: ng, f: ng + h(ni, nj), p: cur });
    }
  }
  if (!found) return [];
  const pts = [];
  for (let n = found; n; n = n.p) pts.unshift([ROOM.minX + n.i * NAV_CELL, ROOM.minZ + n.j * NAV_CELL]);
  // 곧게 펴기: 보이는 가장 먼 점까지 바로 가요
  const clear = (a, b) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (NAV_CELL / 2)); for (let k = 1; k < n; k++) { const [i, j] = cell(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n); if (!free(i, j)) return false; } return true; };
  const out = [];
  let a = [from.x, from.z], k = 0;
  while (k < pts.length) { let far = k; for (let m = pts.length - 1; m > k; m--) if (clear(a, pts[m])) { far = m; break; } out.push(pts[far]); a = pts[far]; k = far + 1; }
  return out;
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
  if (S.sitting) standUp(); leaveSofa();
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
  if (S.sofa >= 0) { S.sofa = -1; me.idle = false; }
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
  leaveSofa();
  const p = standPoint(seat);
  S.walkTo = { x: p.x, z: p.z, then: sitDown, t: 0, best: Infinity, stuck: 0 };
}

function goCoffee() { doTrip(ACTIONS.find((a) => a.id === 't_coffee')); }

// 🛋️ 소파: 라운지 소파 다섯 자리. 걸어가서 앉아 쉬어요 (코딩 대신 가만히). 움직이면 일어나요
const SOFA_Y = 0.58;
S.sofa = -1;
function sofaTaken() {
  const list = office?.sofas || [];
  return new Set([...S.peers.values()].filter((p) => p.st?.idle).map((p) => list.findIndex((s) => Math.hypot(s.x - p.st.x, s.z - p.st.z) < 0.4)));
}
function goSofa(near) {
  const list = office?.sofas;
  if (!list?.length || !me) return;
  if (S.sofa >= 0) return;
  const taken = sofaTaken();
  const free = list.map((s, i) => i).filter((i) => !taken.has(i));
  if (!free.length) { toast('소파 자리가 다 찼어요'); return; }
  const from = near || me.group.position;
  const i = free.sort((a, b) => Math.hypot(list[a].x - from.x, list[a].z - from.z) - Math.hypot(list[b].x - from.x, list[b].z - from.z))[0];
  const s = list[i];
  stopTour();
  const tok = ++tripToken;
  if (S.sitting) standUp(); leaveSofa();
  S.walkTo = { x: s.fx, z: s.fz, t: 0, best: Infinity, stuck: 0, then: () => {
    if (tok !== tripToken) return;
    S.sofa = i;
    me.seated = true; me.idle = true; me.speed = 0;
    me.group.position.set(s.x, SOFA_Y, s.z);
    me.group.rotation.y = s.ry;
    camBehind(s.ry, 4.2, 0.5);
    feed(S.name, '소파에 앉아 쉬어요. 🛋️');
    sendState(true);
    renderActions();
  } };
}
function leaveSofa() {
  if (S.sofa < 0) return;
  const s = office?.sofas?.[S.sofa];
  S.sofa = -1;
  me.seated = false; me.idle = false; me.stop?.();
  if (s) me.group.position.set(s.fx, 0, s.fz); else me.group.position.y = 0;
  sendState(true);
  renderActions();
}

// 걸어갔다 오는 동작: 그 자리까지 걸어가서 자세를 하고, 끝나면 내 자리로 돌아와 앉아요
let tripToken = 0;
function doTrip(def) {
  const sp = office?.spots?.[def?.trip];
  if (!sp || !me) return;
  stopTour();
  if (S.sitting) standUp(); leaveSofa();
  const tok = ++tripToken;
  feed(S.name, def.feed);
  net.sendAct({ a: def.id });
  const cn = { t_coffee: 'coffee', t_grape: 'grape', t_cola: 'cola', t_cider: 'cider', t_pwater: 'pwater', t_barley: 'barley', t_gtea: 'gtea', t_bacchus: 'bacchus', t_enblue: 'enblue', t_enblack: 'enblack' }[def.id];
  if (cn) bump(cn);
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
// 같은 층 알림은 왼쪽 위 기록에 계속 남아요 (최근 100줄, 새 줄이 아래). 위아래로 굴려 지난 기록을 봐요
const FEED_MAX = 100;
const feedAtEnd = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 24;
function feedNewBtn(el) {
  let b = el.querySelector('.feed-new');
  if (!b) {
    b = document.createElement('button');
    b.type = 'button'; b.className = 'feed-new'; b.hidden = true; b.textContent = '새 알림 ↓';
    b.onclick = () => { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); b.hidden = true; };
    el.append(b);
  }
  if (!el._feedBound) { el._feedBound = true; el.addEventListener('scroll', () => { const nb = el.querySelector('.feed-new'); if (nb && feedAtEnd(el)) nb.hidden = true; }, { passive: true }); }
  return b;
}
function feedLine(text) {
  const el = $("#feed");
  const btn = feedNewBtn(el);
  const stick = feedAtEnd(el);   // 맨 아래를 보고 있었을 때만 따라 내려가요
  const d = document.createElement("div");
  d.className = "feed-line";
  d.textContent = text;
  d.title = new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  el.insertBefore(d, btn);
  while (el.querySelectorAll('.feed-line').length > FEED_MAX) el.querySelector('.feed-line').remove();
  if (stick) el.scrollTop = el.scrollHeight; else btn.hidden = false;
}
function feed(name, text) { if (text && S.entered) feedLine(`${name}님이 ${text}`); }
const saidText = (m) => `'${m}'라고 말했습니다.`;

// 캔 그림: 은색 뚜껑 · 테두리, 둥근 몸통 명암, 앞면 무늬 (상표 없이 소호랩 캔)
function canSvg(id) {
  const k = { t_grape: { body: '#6a2c8a', dark: '#3e1452', ink: '#ffffff', t1: 'GRAPE', t2: 'SPARKLING', mark: 'grape' }, t_cola: { body: '#c8302a', dark: '#7a1612', ink: '#ffffff', t1: 'COLA', t2: '355ml', mark: 'wave' }, t_cider: { body: '#2f9a52', dark: '#16592c', ink: '#ffffff', t1: 'CIDER', t2: 'LEMON·LIME', mark: 'bubbles' } }[id];
  const g = 'g' + id;
  const mark = k.mark === 'wave'
    ? `<path d="M6 58 C 20 46, 34 70, 54 52 L54 62 C 36 78, 20 56, 6 68 Z" fill="#fff" opacity=".95"/>`
    : k.mark === 'grape'
      ? `<g transform="translate(30 40)"><path d="M2 -14 q6 -6 12 -2 q-6 4 -12 2z" fill="#5fae3a"/><path d="M0 -16 v6" stroke="#7a5a2a" stroke-width="1.6"/><g fill="#b58ad8" stroke="#4a1a66" stroke-width=".6"><circle cx="-6" cy="-7" r="4"/><circle cx="2" cy="-7" r="4"/><circle cx="10" cy="-7" r="4"/><circle cx="-2" cy="0" r="4"/><circle cx="6" cy="0" r="4"/><circle cx="2" cy="7" r="4"/></g></g>`
      : k.mark === 'hop'
      ? `<g transform="translate(30 36)"><ellipse rx="7" ry="9" fill="#5c8a2c"/><path d="M-7 0 h14 M-6 -4 h12 M-6 4 h12" stroke="#3f6a1a" stroke-width="1.2"/><path d="M0 -9 v-5" stroke="#5c8a2c" stroke-width="2"/></g>`
      : `<g fill="#fff" opacity=".85"><circle cx="16" cy="34" r="3"/><circle cx="26" cy="26" r="2"/><circle cx="40" cy="32" r="4"/><circle cx="46" cy="22" r="2"/><circle cx="20" cy="22" r="1.6"/></g><path d="M6 70 L54 50 L54 58 L6 78 Z" fill="#f2e85a" opacity=".9"/>`;
  return `<svg class="can" viewBox="0 0 60 104" aria-hidden="true">
    <defs><linearGradient id="${g}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".22" stop-color="#fff" stop-opacity=".35"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".78" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>
    <linearGradient id="${g}m" x1="0" x2="1"><stop offset="0" stop-color="#8a9098"/><stop offset=".3" stop-color="#eef0f2"/><stop offset=".7" stop-color="#b9bec6"/><stop offset="1" stop-color="#7a8088"/></linearGradient></defs>
    <path d="M8 12 L52 12 L54 20 L54 90 L52 96 L8 96 L6 90 L6 20 Z" fill="${k.body}"/>
    ${mark}
    <text x="30" y="84" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="11" fill="${k.ink}" letter-spacing=".5">${k.t1}</text>
    <text x="30" y="92" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="5.5" fill="${k.ink}" opacity=".85">${k.t2}</text>
    <path d="M6 20 L6 90 L8 96 L52 96 L54 90 L54 20 L52 12 L8 12 Z" fill="url(#${g})"/>
    <path d="M8 12 L52 12 L54 20 L6 20 Z" fill="url(#${g}m)"/>
    <ellipse cx="30" cy="12" rx="22" ry="4.5" fill="url(#${g}m)" stroke="#6a7078" stroke-width=".8"/>
    <ellipse cx="30" cy="12" rx="17" ry="3.2" fill="#c9ced6"/>
    <path d="M27 10.5 h8 a2 2 0 0 1 0 3 h-8 a2 2 0 0 1 0-3z" fill="#9aa0a8"/>
    <path d="M8 96 L52 96 L50 100 L10 100 Z" fill="url(#${g}m)"/>
  </svg>`;
}

// 페트병 그림: 뚜껑 · 병목 · 비치는 몸통 속 음료, 가운데 띠 상표 (상표 없이 소호랩 병)
function petSvg(id) {
  const k = { t_pwater: { drink: '#cfeaf8', cap: '#2f7fd0', label: '#2f7fd0', ink: '#fff', t1: 'WATER', t2: '생수 500ml' }, t_barley: { drink: '#a8672a', cap: '#7a4a1e', label: '#efe2bf', ink: '#6a3a14', t1: 'BARLEY', t2: '보리차 500ml' }, t_gtea: { drink: '#b9cf63', cap: '#2f8a4a', label: '#2f8a4a', ink: '#fff', t1: 'GREEN TEA', t2: '녹차 500ml' } }[id];
  const g = 'g' + id;
  return `<svg class="can" viewBox="0 0 60 104" aria-hidden="true">
    <defs><linearGradient id="${g}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".22" stop-color="#fff" stop-opacity=".55"/><stop offset=".36" stop-color="#fff" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient></defs>
    <rect x="23" y="2" width="14" height="9" rx="2" fill="${k.cap}"/>
    <path d="M23 9 h14" stroke="#000" stroke-opacity=".25" stroke-width="1"/>
    <path d="M25 11 h10 v5 C 35 22, 50 24, 50 34 L50 92 Q50 98 44 98 L16 98 Q10 98 10 92 L10 34 C 10 24, 25 22, 25 16 Z" fill="${k.drink}" fill-opacity=".85" stroke="#fff" stroke-opacity=".5" stroke-width=".8"/>
    <rect x="10" y="50" width="40" height="28" fill="${k.label}"/>
    <text x="30" y="64" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${k.t1.length > 6 ? 6.5 : 8.5}" fill="${k.ink}">${k.t1}</text>
    <text x="30" y="73" text-anchor="middle" font-family="${FONT.replace(/"/g, "'")}" font-weight="700" font-size="5.5" fill="${k.ink}" opacity=".9">${k.t2}</text>
    <path d="M10 40 h40 M10 86 h40" stroke="#fff" stroke-opacity=".45" stroke-width="1"/>
    <path d="M25 11 h10 v5 C 35 22, 50 24, 50 34 L50 92 Q50 98 44 98 L16 98 Q10 98 10 92 L10 34 C 10 24, 25 22, 25 16 Z" fill="url(#${g})"/>
  </svg>`;
}

// 박카스 그림: 작은 갈색 유리병, 금색 뚜껑, 노란 띠
function bacchusSvg() {
  return `<svg class="can" viewBox="0 0 60 104" aria-hidden="true">
    <defs><linearGradient id="gbac" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".25" stop-color="#fff" stop-opacity=".45"/><stop offset=".38" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></linearGradient>
    <linearGradient id="gbacm" x1="0" x2="1"><stop offset="0" stop-color="#8a6a2a"/><stop offset=".35" stop-color="#f6dc8a"/><stop offset="1" stop-color="#8a6a2a"/></linearGradient></defs>
    <rect x="22" y="24" width="16" height="10" rx="2" fill="url(#gbacm)"/>
    <path d="M23 34 h14 v4 C 37 42, 44 44, 44 50 L44 94 Q44 99 39 99 L21 99 Q16 99 16 94 L16 50 C 16 44, 23 42, 23 38 Z" fill="#5a2e12"/>
    <rect x="16" y="60" width="28" height="22" fill="#f2c230"/>
    <text x="30" y="70" text-anchor="middle" font-family="${FONT.replace(/"/g, "'")}" font-weight="800" font-size="7" fill="#7a1a12">박카스</text>
    <text x="30" y="78" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="4.5" fill="#7a1a12">120ml</text>
    <path d="M23 34 h14 v4 C 37 42, 44 44, 44 50 L44 94 Q44 99 39 99 L21 99 Q16 99 16 94 L16 50 C 16 44, 23 42, 23 38 Z" fill="url(#gbac)"/>
  </svg>`;
}
// 에너지 드링크 그림: 길쭉한 캔, 큰 번개
function energySvg(id) {
  const k = { t_enblue: { body: '#1f4fb8', bolt: '#d9e3f0', t2: 'BLUE' }, t_enblack: { body: '#1a1b1f', bolt: '#7ae04a', t2: 'BLACK' } }[id];
  const g = 'g' + id;
  return `<svg class="can" viewBox="0 0 60 104" aria-hidden="true">
    <defs><linearGradient id="${g}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".22" stop-color="#fff" stop-opacity=".35"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>
    <linearGradient id="${g}m" x1="0" x2="1"><stop offset="0" stop-color="#8a9098"/><stop offset=".3" stop-color="#eef0f2"/><stop offset=".7" stop-color="#b9bec6"/><stop offset="1" stop-color="#7a8088"/></linearGradient></defs>
    <path d="M14 8 L46 8 L48 14 L48 94 L46 100 L14 100 L12 94 L12 14 Z" fill="${k.body}"/>
    <path d="M33 20 L22 50 L29 50 L24 74 L39 42 L32 42 L37 20 Z" fill="${k.bolt}"/>
    <text x="30" y="86" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="8" fill="#fff">ENERGY</text>
    <text x="30" y="93" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="5" fill="${k.bolt}">${k.t2}</text>
    <path d="M12 14 L12 94 L14 100 L46 100 L48 94 L48 14 L46 8 L14 8 Z" fill="url(#${g})"/>
    <ellipse cx="30" cy="8" rx="16" ry="3.4" fill="url(#${g}m)" stroke="#6a7078" stroke-width=".8"/>
  </svg>`;
}

// 냉장고 9칸: 캔(웰치스 포도 · 콜라 · 사이다) · 페트병(생수 · 보리차 · 녹차) · 박카스 · 에너지 드링크(블루 · 블랙) 무제한 무료
function openFridge() {
  const el = $('#fridge-list');
  el.innerHTML = '';
  for (const id of ['t_grape', 't_cola', 't_cider', 't_pwater', 't_barley', 't_gtea', 't_bacchus', 't_enblue', 't_enblack']) {
    const def = ACTIONS.find((a) => a.id === id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `drink ${id}`;
    const pic = id === 't_bacchus' ? bacchusSvg() : id.startsWith('t_en') ? energySvg(id) : ['t_pwater', 't_barley', 't_gtea'].includes(id) ? petSvg(id) : canSvg(id);
    b.innerHTML = `${pic}<b>${def.name}</b><small>무제한 무료</small>`;
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
  // 자리 칸은 의자 자리에 놓고, 세로를 1.6배 늘려 위아래 칸이 겹치지 않게
  const xs = seats.map((s) => s.desk.x), zs = seats.map((s) => s.z);
  const pad = 3.4, minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minZ = Math.min(...zs) - 1.3, maxZ = Math.max(...zs) + 1.3;
  const L = (x) => ((x - minX) / (maxX - minX)) * 100, T = (z) => ((z - minZ) / (maxZ - minZ)) * 100;
  g.style.aspectRatio = `${(maxX - minX) / ((maxZ - minZ) * 1.6)}`;
  // 섬(책상 네 개 묶음) 바탕
  const islands = new Map();
  for (const s of seats) { const b = islands.get(s.island) || { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }; b.x0 = Math.min(b.x0, s.desk.x - 3); b.x1 = Math.max(b.x1, s.desk.x + 3); b.z0 = Math.min(b.z0, s.z - 1); b.z1 = Math.max(b.z1, s.z + 1); islands.set(s.island, b); }
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
    Object.assign(b.style, { left: L(s.desk.x) + '%', top: T(s.z) + '%' });
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
  if (S.sitting) standUp(); leaveSofa();
  const pts = office.tour, p = me.group.position;
  let k = 0, best = Infinity;
  pts.forEach(([x, z], i) => { const d = Math.hypot(x - p.x, z - p.z); if (d < best) { best = d; k = i; } });
  const seq = [...pts.slice(k), ...pts.slice(0, k), pts[k]];
  touring = true;
  const step = (i) => {
    if (!touring) return;
    if (i >= seq.length) { touring = false; bump('tour'); goSit(); renderActions(); return; }
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
  // idle: 소파에 앉아 쉬는 중 (책상 자리 대신 그 자리에 앉은 모습)
  const st = { x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +me.group.rotation.y.toFixed(2), sit: S.sitting, idle: S.sofa >= 0 };
  if (!force && lastSent && Math.abs(st.x - lastSent.x) < 0.03 && Math.abs(st.z - lastSent.z) < 0.03 && Math.abs(st.ry - lastSent.ry) < 0.05 && st.sit === lastSent.sit && st.idle === lastSent.idle) return;
  lastSent = st;
  net.sendState(st);
}
function applyMyMemos() { me?.setMemos(S.profile.memos, S.memoMode, S.memoIdx); }
function pushProfile() { net.sendProfile(myPf()); if (S.seat >= 0) refreshScreen(S.seat); }

// ───────── 같은 층 사람들 ─────────
// 🌐 웹 결과물 알림: 같은 층 누가 새 주소를 올리면 알림 카드 + 이름표에 🌐 NEW (10분)
const WEB_NEW_MS = 10 * 60 * 1000;
const webState = (pf, until = 0) => (pf?.links?.length ? (until > Date.now() ? 2 : 1) : 0);
// 예전에 없던 주소만 '새 결과물' (제목 · 설명만 고친 건 알리지 않아요)
function newLinks(before, after) {
  const had = new Set((before?.links || []).map((l) => l.u));
  return (after?.links || []).map((l, k) => [l, k]).filter(([l]) => l.u && !had.has(l.u));
}
function markWebNew(av, getPf, setUntil) {
  const until = Date.now() + WEB_NEW_MS;
  setUntil(until);
  av.setWeb(2);
  setTimeout(() => { const pf = getPf(); if (pf) av.setWeb(webState(pf, until)); }, WEB_NEW_MS + 500);
}
function webNotice(who, name, link, k) {
  const t = document.createElement('div');
  t.className = 'toast web-toast';
  t.innerHTML = '<span class="wt-icon">🌐</span><span class="wt-text"><span><b></b>님이 새 웹 결과물을 올렸어요</span><small></small></span><button type="button">보러 가기</button>';
  t.querySelector('b').textContent = name;
  t.querySelector('small').textContent = link.t || link.u.replace(/^https?:\/\//, '');
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 400); };
  t.querySelector('button').onclick = () => { close(); if (S.peers.has(who)) openShowcase(who, k); else toast('그분이 층을 떠났어요'); };
  $('#toasts').append(t);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  setTimeout(close, 9000);
  if (store.get('chime', true)) sound.ding();
}

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
    const added = newLinks(p.pf, pf);
    if (added.length && S.entered) {
      const [l, k] = added[0];
      feed(pf.n, `새 웹 결과물 '${l.t || '이름 없음'}'을 올렸습니다. 🌐`);
      webNotice(id, pf.n, l, k);
      markWebNew(p.av, () => S.peers.get(id)?.pf, (u) => { p.webNew = u; });
    }
    p.pf = pf;
    if (seat !== undefined) p.seat = seat;
  }
  p.av.setMemos(S.othersMemo ? pf.memos : [], pf.mm || 'auto', pf.mi | 0);
  p.av.setWeb(webState(pf, p.webNew));
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
    const sit = !!p.st?.sit, sofa = !sit && !!p.st?.idle;
    const seat = office.seats[p.seat];
    let tx = p.tx, tz = p.tz, ty = sofa ? SOFA_Y : 0, tr = p.try;
    if (sit && seat) { tx = seat.x; tz = seat.z; ty = 0.42; tr = seat.ry; }
    p.av.idle = sofa;
    const dx = tx - g.position.x, dz = tz - g.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 4) { g.position.set(tx, ty, tz); p.av.speed = 0; }
    else {
      const k = Math.min(1, dt * 8);
      g.position.x += dx * k; g.position.z += dz * k;
      g.position.y = ty;
      p.av.speed = sit || sofa ? 0 : Math.min(5, (d * k) / Math.max(dt, 1e-3));
    }
    g.rotation.y = lerpAngle(g.rotation.y, tr, Math.min(1, dt * 10));
    p.av.seated = sit || sofa;
    p.av.update(dt, ACTIONS);
  }
}

function updatePeople() {
  const n = S.peers.size + (S.entered ? 1 : 0);
  $('#hud-people').textContent = n;
  office?.paintBoard(S.floor || 1, n);
  if (!$('#seat-modal').hidden) renderSeats();
  if (!$('#people-pop').hidden) renderPeople();
}

// 같은 층 사람 목록: 위 ● 9/20 을 누르면 닉네임 · 자리 · 지금 하는 일. 누르면 그 분 책상 보기
function renderPeople() {
  const rows = [];
  if (S.entered) rows.push({ id: 'me', seat: S.seat, name: S.name, sit: S.sitting, now: nowOf(myPf()) });
  for (const [id, p] of S.peers) rows.push({ id, seat: p.seat, name: p.pf.n, sit: !!p.st?.sit, now: nowOf(p.pf) });
  rows.sort((a, b) => (a.seat < 0) - (b.seat < 0) || a.seat - b.seat);
  $('#pp-title').innerHTML = `${S.floor || 1}F · ${rows.length}명<small>${esc(office?.theme?.name || '')}</small>`;
  const ul = $('#pp-list');
  ul.innerHTML = '';
  for (const r of rows) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="pp-seat">${r.seat >= 0 ? r.seat + 1 : '–'}</span><span class="pp-name">${esc(r.name)}${r.id === 'me' ? '<em>나</em>' : ''}</span><span class="pp-st ${r.sit ? '' : 'away'}">${r.sit ? '● 코딩 중' : '○ 잠깐 비움'}</span>${r.now ? `<span class="pp-now">${esc(r.now)}</span>` : ''}`;
    b.title = r.seat >= 0 ? `${r.seat + 1}번 책상 보기` : '';
    b.onclick = () => { setPeopleOpen(false); if (r.seat >= 0) openCard(r.seat, r.id); };
    li.append(b);
    ul.append(li);
  }
}
function setPeopleOpen(v) {
  $('#people-pop').hidden = !v;
  $('#people-chip').setAttribute('aria-expanded', v);
  if (v) renderPeople();
}
$('#people-chip').onclick = (e) => { e.stopPropagation(); setPeopleOpen($('#people-pop').hidden); };
$('#pp-close').onclick = () => setPeopleOpen(false);
$('#pp-floors').onclick = () => { setPeopleOpen(false); openFloors(); };
document.addEventListener('pointerdown', (e) => { if (!$('#people-pop').hidden && !e.target.closest('#people-pop, #people-chip')) setPeopleOpen(false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#people-pop').hidden) setPeopleOpen(false); });

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
    if (d.fw) {
      launchFirework(scene, p.av.group.position, ROOM.H, d.fw, p.av.group.rotation.y);
      p.av.play('clap');
      sound.pop();
      feed(p.pf.n, '폭죽을 터뜨렸습니다. 🎆');
    } else if (d.m !== undefined) {
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
  const counts = await net.counts();
  if (!counts) return START_FLOOR;
  // 처음 들어오면 모두 3층(START_FLOOR)으로. 3층이 다 찼으면 사람이 가장 많은(자리 남은) 층
  if (counts[START_FLOOR - 1] < SEATS) return START_FLOOR;
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
    me.web = webState(S.profile);   // 이름표를 처음 그리기 전에
    me.setName(S.name);
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
  $("#feed").innerHTML = "";   // 층을 옮기면 기록도 새로 (새 알림 단추는 다음 줄에서 다시 만들어요)
  feedLine(`${S.name}님이 출근했어요.`);
  if (!store.get('seenGuide2', false)) { store.set('seenGuide2', true); setTimeout(() => toast('책상·모니터·캐릭터를 누르면 그 분의 작업을 볼 수 있어요', 6000), 1200); setTimeout(() => toast('앉아 있는 1분마다 1 XP · 1 P가 쌓여요. 내 책상에서 아이템을 사 보세요', 6000), 4000); }
}


// ───────── 동작 · 메모 ─────────
function doAct(id) {
  if (!me) return;
  if (id === 'fw') { shootFirework(); return; }
  const on = me.play(id);
  net.sendAct({ a: id });
  if (on) feed(S.name, ACTIONS.find((x) => x.id === id)?.feed);
}

function renderActions() {
  const el = $('#actions');
  el.innerHTML = '';
  // 자리 단추 셋: [내 자리로] [일어서기 · 멈추기] [사무실 한 바퀴]. 지금 상태인 단추에 노란 테두리
  const now = S.sitting ? 0 : touring ? 2 : 1;
  const seatActs = [
    ['내 자리로', () => { stopTour(); if (!S.sitting) goSit(); }],
    // 앉아 있을 땐 [일어서기], 돌아다닐 땐 [멈추기]
    [S.sitting || S.sofa >= 0 ? '일어서기' : '멈추기', () => { stopTour(); tripToken++; if (S.sitting) standUp(); else if (S.sofa >= 0) leaveSofa(); else { S.walkTo = null; hideMarker(); } renderActions(); }],
    // 도는 중에 다시 누르면 내 자리로 돌아가요
    ['사무실 한 바퀴', () => { if (touring) { stopTour(); goSit(); } else startTour(); }],
  ];
  const seatBox = document.createElement('div');
  seatBox.className = 'seat-btns';
  seatActs.forEach(([label, fn], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seat-btn' + (i === now ? ' on' : '');
    b.setAttribute('aria-pressed', String(i === now));
    b.textContent = label;
    b.onclick = fn;
    seatBox.append(b);
  });
  el.append(seatBox);
  // 아래 막대: 제자리 동작 · 오른쪽 세로 메뉴: [자리 이동] 따로 + 걸어갔다 오는 동작 (냉장고는 음료 고르기)
  $('#btn-seat').onclick = openSeats;
  $('#btn-browse').onclick = () => openShowcase(null);
  const left = $('#walk-acts');
  left.innerHTML = '';
  // 오른쪽 걸어갔다 오는 동작은 글자 수 짧은 것부터
  const len = (a) => (a.trip || a.fridge || a.sofa ? a.name.replace(/\s/g, '').length : 0);
  for (const a of ACTIONS.filter((x) => !x.auto && x.pose !== true && !x.hidden).sort((p, q) => len(p) - len(q))) {
    const moving = a.trip || a.fridge || a.sofa;
    const b = document.createElement('button');
    b.className = moving ? 'side-btn' : 'act';
    b.innerHTML = `<span>${a.name}</span><small class="cap">${a.cap}</small>`;
    b.onclick = () => (a.sofa ? goSofa() : a.fridge ? openFridge() : a.trip ? doTrip(a) : doAct(a.id));
    (moving ? left : el).append(b);
  }
}

// 말풍선 방식 바꾸기: 자동 · 하나 · 없음
function setMemoMode(mode, idx = S.memoIdx) {
  S.memoMode = mode;
  S.memoIdx = Math.max(0, Math.min(MAX_MEMOS - 1, idx));
  store.set('memoMode', S.memoMode);
  store.set('memoIdx', S.memoIdx);
  applyMyMemos();
  pushProfile();
  renderMemoBar();
}
// 말풍선 줄: 동작 단추처럼 다 펼쳐 둬요 → [자동 · 하나 · 없음] | 말풍선 5개 | ✎
// 누른 말풍선 하나만 떠요. 지나가며 다른 말풍선이 뜨는 일이 없어요
function renderMemoBar() {
  const el = $('#memo-bar');
  el.innerHTML = '';
  el.className = 'glass memo-bar bubbles';
  const seg = document.createElement('div');
  seg.className = 'bb-mode';
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', '말풍선 띄우는 방식');
  for (const m of MEMO_MODES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', S.memoMode === m.id);
    b.title = m.cap;
    b.textContent = m.name;
    b.onclick = () => {
      if (m.id === S.memoMode) return;
      setMemoMode(m.id);
      toast(m.id === 'auto' ? '말풍선 5개가 머리 위에 돌아가며 떠요' : m.id === 'one' ? `"${S.profile.memos[S.memoIdx] || ''}" 말풍선만 계속 떠요` : '말풍선을 껐어요');
    };
    seg.append(b);
  }
  const sep = document.createElement('span');
  sep.className = 'act-sep';
  const list = document.createElement('div');
  list.className = 'bb-list';
  S.profile.memos.forEach((m, i) => {
    if (!m.trim()) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bb';
    b.textContent = m;
    b.title = m;
    if (S.memoMode === 'one') b.setAttribute('aria-pressed', i === S.memoIdx);
    b.onclick = () => {
      // 하나 · 없음: 이 말풍선을 계속 띄워요 / 자동: 지금 한 번 띄워요
      if (S.memoMode !== 'auto') { if (S.memoMode === 'one' && i === S.memoIdx) return; setMemoMode('one', i); }
      else { S.memoIdx = i; store.set('memoIdx', i); me?.pin(i); net.sendAct({ m: i }); }
      feed(S.name, saidText(m));
    };
    list.append(b);
  });
  const ed = document.createElement('button');
  ed.type = 'button';
  ed.className = 'bb edit';
  ed.title = '말풍선 고치기';
  ed.setAttribute('aria-label', '말풍선 고치기');
  ed.textContent = '✎';
  ed.onclick = () => openDesk('memo');
  list.append(ed);
  el.append(seg, sep, list);
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
      ${links ? `<div class="c-links">${links}</div>` : `<p class="c-empty">${mine ? '아직 올린 결과물이 없어요. 위 🌐 내 웹 자랑에서 3개까지 올릴 수 있어요.' : '아직 올린 결과물이 없어요.'}</p>`}
      ${memos ? `<p class="c-label">말풍선</p><div class="c-memos">${memos}</div>` : ''}
      ${mine ? `<div class="c-acts"><button class="ghost small-btn" id="c-edit">내 책상 꾸미기</button>${S.sitting ? '' : '<button class="primary small-btn" id="c-sit">앉기</button>'}</div>` : ''}`;
    body.querySelectorAll('[data-peek]').forEach((b) => (b.onclick = () => peek(pf.links[+b.dataset.peek])));
    if (mine) {
      $('#c-edit').onclick = () => openDesk('deco');
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
function closeAll() { ['desk-modal', 'peek-modal', 'floor-modal', 'guide-modal', 'seat-modal', 'fridge-modal', 'show-modal', 'shop-modal', 'stats-modal', 'prefs-modal', 'report-modal', 'photo-modal'].forEach(closeModal); if (!$('#creator').hidden) closeModal('creator'); closeCard(); $('#menu').hidden = true; }
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
const DESK_TITLES = { deco: '내 책상 꾸미기', memo: '머리 위 말풍선', links: '내 웹 자랑' };
function openDesk(tab = 'deco') {
  closeCard();
  const p = S.profile;
  const mg = $('#pf-memos');
  mg.innerHTML = '';
  for (let i = 0; i < MAX_MEMOS; i++) {
    const l = document.createElement('label');
    l.innerHTML = `<input maxlength="${LIMITS.memo}" placeholder="말풍선 ${i + 1}${i === 0 ? ' (지금 하는 일처럼 모니터에도 떠요)' : ''}" aria-label="말풍선 ${i + 1}">`;
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
  $('#desk-title').textContent = DESK_TITLES[tab] || '내 책상';
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
  for (const [k, m] of memos.entries()) { const w = findBad(m); if (w) { setDeskTab('memo'); showFormError(`말풍선 ${k + 1}에 쓸 수 없는 말이 있어요. 비속어 · 나쁜 말은 같은 층 모두에게 보이니 고쳐 주세요.`); $$('#pf-memos input')[k].focus(); return; } }
  for (const l of links) if (findBad(l.t + ' ' + l.d)) { setDeskTab('links'); showFormError('결과물 이름이나 설명에 쓸 수 없는 말이 있어요.'); return; }
  const fresh = newLinks(S.profile, { links: links.slice(0, MAX_LINKS) });
  S.profile = { ...S.profile, memos, links: links.slice(0, MAX_LINKS) };
  store.set('profile', S.profile);
  if (S.memoMode === 'one' && !memos[S.memoIdx]?.trim()) S.memoIdx = Math.max(0, memos.findIndex((m) => m.trim()));
  applyMyMemos();
  pushProfile();
  renderMemoBar();
  closeModal('desk-modal');
  if (me) { if (fresh.length) markWebNew(me, () => S.profile, (u) => { S.webNew = u; }); else me.setWeb(webState(S.profile, S.webNew)); }
  if (fresh.length) feed(S.name, `새 웹 결과물 '${fresh[0][0].t || '이름 없음'}'을 올렸습니다. 🌐`);
  toast(bad ? `저장했어요. 주소가 이상한 결과물 ${bad}개는 뺐어요` : fresh.length ? '올렸어요 · 같은 층 모두에게 알림이 갔어요' : '저장했어요');
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
let focusLast = Date.now(), focusCarry = store.get('focusCarry', 0), chimeHour = -1;
function tickFocus() {
  const now = Date.now();
  const dt = Math.min(90, (now - focusLast) / 1000);
  focusLast = now;
  if (!S.entered) { $('#focus-chip').hidden = true; return; }
  const key = 'focus.' + today();
  let s = store.get(key, 0);
  // 정각 종소리 (소리를 켠 분만)
  const hr = new Date().getHours();
  if (chimeHour !== hr) { if (chimeHour >= 0 && store.get('chime', true)) sound.chime(); chimeHour = hr; }
  if (S.sitting) {
    s += dt; store.set(key, Math.round(s));
    // 새벽 · 아침 배지
    const c = store.get('cnt', {});
    if (hr >= 1 && hr < 5 && !c.night) bump('night');
    if (hr >= 5 && hr < 8 && !c.early) bump('early');
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
  chips($('#opt-type'), CHAR_TYPES, 'type', (t) => hairName(t, S.draft.gender));
  // 머리색: 첫 칸 '기본'은 머리 스타일마다 정해진 색
  const hcEl = $('#opt-hc');
  hcEl.innerHTML = '';
  for (const h of HAIR_COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (h.c ? '' : ' base');
    if (h.c) b.style.background = h.c; else b.textContent = '기본';
    b.title = h.name;
    b.setAttribute('aria-label', `머리색 ${h.name}`);
    b.setAttribute('aria-pressed', (S.draft.hc || 'base') === h.id);
    b.onclick = () => { S.draft.hc = h.id; renderCreator(); };
    hcEl.append(b);
  }
  $('#hc-name').textContent = HAIR_COLORS.find((h) => h.id === (S.draft.hc || 'base'))?.name || '';
  chips($('#opt-outfit'), OUTFITS, 'outfit', (o) => o.name);
  // 옷 색: 고른 스타일에 입힐 색
  const oc = $('#opt-oc');
  oc.innerHTML = '';
  for (const c of OUTFIT_COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = c.c;
    b.title = c.name;
    b.setAttribute('aria-label', `옷 색 ${c.name}`);
    b.setAttribute('aria-pressed', S.draft.oc === c.id);
    b.onclick = () => { S.draft.oc = c.id; renderCreator(); };
    oc.append(b);
  }
  $('#oc-name').textContent = OUTFIT_COLORS.find((c) => c.id === S.draft.oc)?.name || '';
  chips($('#opt-acc'), ACCESSORIES, 'acc');
  chips($('#opt-pet'), PET_IDS.map((id) => PETS.find((p) => p.id === id)).filter(Boolean), 'pet', (p) => p.name);
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
// 할 일 · 메모: 위 ✅ 단추로 열고 닫아요. 단추에 오늘 끝낸 수/전체
const todo = initTodo({
  store,
  onCount: (done, all) => {
    const c = $('#todo-count');
    c.hidden = !all;
    c.textContent = `${done}/${all}`;
    c.classList.toggle('all', all > 0 && done === all);
  },
});
const setTodoOpen = (v) => { todo.open(v); $('#btn-todo').setAttribute('aria-expanded', v); $('#btn-todo').classList.toggle('on', v); };
$('#btn-todo').onclick = () => setTodoOpen(!todo.isOpen);
$('#td-close').onclick = () => setTodoOpen(false);
if (store.get('todoOpen', false)) setTodoOpen(true);

// 🎵 소리: 배경음악 5곡 · 배경음 5가지 (고른 건 기억했다가 다음에 처음 누를 때 다시 켜요)
const sound = new Sound();
// 처음 오신 분은 로파이 + 키보드 소리로 시작 (끄기를 고르면 그대로 꺼진 채 기억해요)
const snd = { music: store.get('music', 'lofi'), amb: store.get('ambient', 'keys') };
sound.musicVol = store.get('musicVol', 0.5);
sound.ambVol = store.get('ambVol', 0.6);
function renderSound() {
  const row = (el, list, cur, set) => {
    el.innerHTML = '';
    for (const it of [{ id: null, name: '끄기', cap: '' }, ...list]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'snd' + (it.id ? '' : ' off');
      b.setAttribute('aria-pressed', cur === it.id);
      b.innerHTML = `<b>${esc(it.name)}</b>${it.cap ? `<small>${esc(it.cap)}</small>` : ''}`;
      b.onclick = () => set(it.id);
      el.append(b);
    }
  };
  row($('#snd-music'), MUSIC, snd.music, (id) => { snd.music = id; store.set('music', id); sound.setMusic(id); renderSound(); });
  row($('#snd-amb'), AMBIENT, snd.amb, (id) => { snd.amb = id; store.set('ambient', id); sound.setAmbient(id); renderSound(); });
  $('#btn-sound').classList.toggle('on', !!(snd.music || snd.amb));
}
$('#snd-mvol').value = sound.musicVol;
$('#snd-avol').value = sound.ambVol;
$('#snd-mvol').oninput = (e) => { sound.setVolume('music', +e.target.value); store.set('musicVol', +e.target.value); };
$('#snd-avol').oninput = (e) => { sound.setVolume('amb', +e.target.value); store.set('ambVol', +e.target.value); };
const setSoundOpen = (v) => { $('#sound-pop').hidden = !v; $('#btn-sound').setAttribute('aria-expanded', v); if (v) renderSound(); };
$('#btn-sound').onclick = (e) => { e.stopPropagation(); setSoundOpen($('#sound-pop').hidden); };
$('#snd-close').onclick = () => setSoundOpen(false);
document.addEventListener('pointerdown', (e) => { if (!$('#sound-pop').hidden && !e.target.closest('#sound-pop, #btn-sound')) setSoundOpen(false); });
renderSound();
// 들어오면 소리 켜기: 처음엔 로파이 + 키보드, 그다음부턴 설정에서 고른 소리.
// 브라우저 규칙상 처음 누르거나 키를 칠 때 켜져요. 아이폰은 손가락을 뗄 때(click · touchend)만 소리를 허락해서
// 여러 순간에 깨워 보고, 실제로 소리가 나기 시작하면 그만 들어요
if ((snd.music || snd.amb) && !Q.has('mute') && store.get('autoSound', true)) {
  const EVS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  let started = false;
  const wake = () => {
    if (!started) {
      started = true;
      if (snd.music) sound.setMusic(snd.music);
      if (snd.amb) sound.setAmbient(snd.amb);
    } else sound.ensure();
    if (sound.live) EVS.forEach((t) => removeEventListener(t, wake, true));
  };
  EVS.forEach((t) => addEventListener(t, wake, true));
}
$('#btn-menu').onclick = () => { $('#menu').hidden = !$('#menu').hidden; };
$('#menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-menu]');
  if (!b) return;
  $('#menu').hidden = true;
  const m = b.dataset.menu;
  if (m === 'guide') openModal('guide-modal');
  if (m === 'stats') openStats();
  if (m === 'prefs') openPrefs();
  if (m === 'report') openReport();
  if (m.startsWith('btn-')) $('#' + m).click(); // 휴대폰: 위 단추줄에서 메뉴로 옮긴 것
});

// 📊 내 기록: 레벨 · 포인트 · 총 집중 · 연속 출근 · 최근 7일 막대 · 오늘 한 일
const dayKey = (d) => d.toLocaleDateString('sv');
const fmtMin = (sec) => { const t = Math.round(sec / 60), h = Math.floor(t / 60); return h ? `${h}시간 ${t % 60}분` : `${t}분`; };
const shortMin = (sec) => { const t = Math.round(sec / 60), h = Math.floor(t / 60), m = t % 60; return h ? (m ? `${h}h${m}m` : `${h}h`) : `${m}m`; };
// 이 브라우저에 쌓인 기록 모으기 (내 기록 · 배지가 함께 써요)
let photoCount = 0;
listPhotos().then((l) => { photoCount = l.length; });
function totals() {
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (store.get('focus.' + dayKey(d), 0) >= 60) streak++;
    else if (i > 0) break; // 오늘은 아직 안 앉았어도 어제까지 이어진 건 세요
  }
  const days = [];
  let done = 0, best = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('soho.focus.')) { const s = +localStorage.getItem(k); if (s >= 60) days.push({ d: k.slice(11), s }); best = Math.max(best, s); }
      if (k.startsWith('soho.day.')) done += (JSON.parse(localStorage.getItem(k))?.todos || []).filter((t) => t.d).length;
    }
  } catch {}
  return { days, streak, best, done, lv: lv(), cnt: store.get('cnt', {}), photos: photoCount, links: S.profile.links?.filter((l) => l.u).length || 0 };
}
function bump(k) {
  const c = store.get('cnt', {});
  c[k] = (c[k] || 0) + 1;
  store.set('cnt', c);
  checkBadges();
}
// 새 배지를 받으면 한 번 알려 줘요 (처음 켰을 때 이미 받은 것들은 조용히)
function checkBadges() {
  const got = earned(totals()).map((b) => b.id);
  const seen = store.get('badges', null);
  store.set('badges', got);
  if (!seen || !S.entered) return;
  for (const id of got) if (!seen.includes(id)) {
    const b = BADGES.find((x) => x.id === id);
    toast(`🏅 새 배지: ${b.icon} ${b.name}`, 5000);
  }
}
setInterval(checkBadges, 60 * 1000);
checkBadges();

function openStats() {
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const week = days.map((d) => ({ d, s: store.get('focus.' + dayKey(d), 0) }));
  const T = totals();
  const streak = T.streak, doneAll = T.done, workDays = T.days.length;
  const got = new Set(earned(T).map((b) => b.id));
  $('#st-badge-n').textContent = `${got.size} / ${BADGES.length}`;
  $('#st-badges').innerHTML = BADGES.map((b) => `<div class="st-badge${got.has(b.id) ? ' got' : ''}" title="${esc(b.cap)}"><i>${b.icon}</i><b>${esc(b.name)}</b><small>${esc(b.cap)}</small></div>`).join('');
  renderPhotos();
  const td = store.get('day.' + dayKey(new Date()), { todos: [] });
  const tDone = (td.todos || []).filter((t) => t.d).length, tAll = (td.todos || []).length;
  const card = (k, v, s = '') => `<div class="st-card"><small>${k}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
  $('#st-cards').innerHTML =
    card('레벨', `Lv ${lv()}`, `경험치 ${S.xp.toLocaleString()}`) +
    card('포인트', `${S.pts.toLocaleString()} P`) +
    card('총 집중', fmtMin(S.xp * 60)) +
    card('오늘 집중', fmtMin(week[6].s)) +
    card('연속 출근', `${streak}일`, `모두 ${workDays}일`) +
    card('끝낸 할 일', `${doneAll}개`, tAll ? `오늘 ${tDone}/${tAll}` : '');
  const max = Math.max(3600, ...week.map((w) => w.s));
  const WD = '일월화수목금토';
  $('#st-week').innerHTML = week.map((w, i) => `<div class="st-bar${i === 6 ? ' today' : ''}" title="${dayKey(w.d)} · ${fmtMin(w.s)}"><em>${w.s >= 60 ? shortMin(w.s) : ''}</em><i style="height:${Math.round((w.s / max) * 100)}%"></i><small>${i === 6 ? '오늘' : WD[w.d.getDay()]}</small></div>`).join('');
  openModal('stats-modal');
}

// ⚙️ 개인 및 환경 설정
function applyLite(on) { renderer.setPixelRatio(on ? 1 : Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = !on; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
if (store.get('lite', false)) applyLite(true);
function setOthersMemo(v) {
  S.othersMemo = v;
  store.set('othersMemo', v);
  for (const p of S.peers.values()) p.av.setMemos(v ? p.pf.memos : [], p.pf.mm || 'auto', p.pf.mi | 0);
}
function openPrefs() {
  $('#pf-name').textContent = `${S.name || '이름 없음'} ›`;
  $('#pf-others').checked = S.othersMemo;
  $('#pf-sound').checked = store.get('autoSound', true);
  $('#pf-lite').checked = store.get('lite', false);
  $('#pf-chime').checked = store.get('chime', true);
  $('#pf-calm').checked = store.get('calmIdle', true);
  openModal('prefs-modal');
}
$('#pf-chime').onchange = (e) => store.set('chime', e.target.checked);
$('#pf-calm').onchange = (e) => store.set('calmIdle', e.target.checked);

// 🖼️ 내 사진 (내 기록 창 아래)
let phUrls = [], phOpen = null;
async function renderPhotos() {
  phUrls.forEach((u) => URL.revokeObjectURL(u));
  phUrls = [];
  const list = await listPhotos();
  photoCount = list.length;
  $('#st-photo-n').textContent = list.length ? `${list.length}장` : '';
  const el = $('#st-photos');
  el.innerHTML = list.length ? '' : '<p class="st-empty">오른쪽 위 📷 사진으로 찍으면 여기에 모여요.</p>';
  for (const p of list) {
    const u = URL.createObjectURL(p.blob);
    phUrls.push(u);
    const b = document.createElement('button');
    b.type = 'button';
    b.title = `${new Date(p.at).toLocaleString('ko-KR')} · ${p.place || ''}`;
    b.innerHTML = `<img src="${u}" alt="" loading="lazy">`;
    b.onclick = () => { phOpen = { ...p, u }; $('#ph-img').src = u; $('#ph-title').textContent = `${new Date(p.at).toLocaleDateString('ko-KR')} · ${p.place || '내 사진'}`; openModal('photo-modal'); };
    el.append(b);
  }
}
const isPhone = () => matchMedia('(pointer: coarse)').matches;
// 휴대폰은 공유 창(사진에 저장)으로. 앱 안 브라우저(카톡 등)에서 파일 받기 링크를 누르면 사진만 뜬 화면으로 넘어가 멈춘 듯 보여요
async function sharePhoto(blob, name) {
  const file = new File([blob], name, { type: 'image/png' });
  if (!navigator.canShare?.({ files: [file] })) return 'none';
  try { await navigator.share({ files: [file] }); return 'ok'; } catch (e) { return e.name === 'AbortError' ? 'ok' : 'none'; }
}
function downloadPhoto(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); }
$('#ph-save').onclick = async () => {
  if (!phOpen) return;
  const name = `soho-lab-${phOpen.id}.png`;
  if (!isPhone()) return downloadPhoto(phOpen.u, name);
  if (await sharePhoto(phOpen.blob, name) === 'none') toast('사진을 길게 눌러 저장해 주세요');
};
$('#ph-del').onclick = async () => { if (!phOpen || !confirm('이 사진을 지울까요?')) return; await removePhoto(phOpen.id); phOpen = null; closeModal('photo-modal'); renderPhotos(); };

// 📷 사진 찍기: 단추를 모두 숨기고, 화면을 끌어 구도를 잡은 뒤 셔터. 휴대폰은 공유 창, 컴퓨터는 파일로 받기
function startPhoto() {
  if (!S.entered) return;
  stopCalm();
  closeAll();
  S.photo = true;
  document.body.classList.add('photo');
  $('#photo-bar').hidden = false;
}
function stopPhoto() {
  S.photo = false;
  document.body.classList.remove('photo');
  $('#photo-bar').hidden = true;
}
function snapCanvas(maxSide = 0) {
  renderer.render(scene, camera); // 바로 그린 직후에 읽어야 빈 화면이 아니다
  const k = maxSide ? Math.min(1, maxSide / Math.max(canvas.width, canvas.height)) : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}
let shooting = false;   // 셔터 연타 막기: 한 장을 다 만들고 나서 다음 장
async function takePhoto() {
  if (shooting) return;
  shooting = true;
  try { await shootOnce(); } catch { toast('사진을 찍지 못했어요'); } finally { shooting = false; }
}
async function shootOnce() {
  const c = snapCanvas();
  const g = c.getContext('2d'), fs = Math.round(Math.max(c.width, c.height) / 52);
  g.font = `600 ${fs}px ${FONT}`;
  g.textAlign = 'right';
  g.fillStyle = 'rgba(255, 255, 255, .9)';
  g.shadowColor = 'rgba(0, 0, 0, .5)'; g.shadowBlur = fs / 2;
  g.fillText(`소호랩 ${S.floor}F · soho-lab.site`, c.width - fs, c.height - fs);
  const flash = $('#photo-flash');
  flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  if (!blob) { toast('사진을 찍지 못했어요'); return; }
  const id = `${Date.now()}`;
  // 내 기록에 모으기는 기다리지 않아요. 공유 창은 누른 직후에 열어야 해서 저장소 쓰기를 앞에 두면 막혀요
  addPhoto(blob, `${S.floor}F ${office?.theme.name || ''}`, id).then((ok) => { if (ok) { photoCount++; checkBadges(); } });
  const name = `soho-lab-${dayKey(new Date())}-${Date.now().toString(36)}.png`;
  if (isPhone()) {
    if (await sharePhoto(blob, name) === 'ok') return;
    // 공유 창이 없는 브라우저: 페이지를 떠나지 않고 크게 띄워서 길게 눌러 저장
    const u = URL.createObjectURL(blob);
    phUrls.push(u);
    phOpen = { id, blob, u };
    $('#ph-img').src = u;
    $('#ph-title').textContent = '방금 찍은 사진';
    openModal('photo-modal');
    toast('사진을 길게 눌러 저장해 주세요 · 메뉴 › 내 기록에도 모여요');
    return;
  }
  const u = URL.createObjectURL(blob);
  downloadPhoto(u, name);
  setTimeout(() => URL.revokeObjectURL(u), 5000);
  toast('사진을 저장했어요 · 메뉴 › 내 기록에도 모여요');
}
$('#btn-photo').onclick = startPhoto;
$('#photo-shoot').onclick = takePhoto;
$('#photo-close').onclick = stopPhoto;
addEventListener('keydown', (e) => { if (S.photo && e.code === 'Escape') stopPhoto(); });

// 🎆 폭죽: 내 책상 위 천장에서 펑, 같은 층 모두에게 보여요 (20초에 한 번)
let fwAt = 0;
function shootFirework() {
  const left = 20000 - (Date.now() - fwAt);
  if (left > 0) { toast(`폭죽은 ${Math.ceil(left / 1000)}초 뒤에 또 터뜨릴 수 있어요`); return; }
  fwAt = Date.now();
  const seed = Math.max(0.001, Math.round(Math.random() * 1000) / 1000);
  launchFirework(scene, me.group.position, ROOM.H, seed, me.group.rotation.y);
  me.play('clap');
  net.sendAct({ fw: seed });
  sound.pop();
  feed(S.name, '폭죽을 터뜨렸습니다. 🎆');
  bump('fw');
}

// ⛶ 바탕화면: 단추를 모두 숨기고 카메라가 사무실을 천천히 둘러봐요. 일하는 분 책상에 잠깐씩 머물러요.
// 화면을 누르거나 아무 키나 누르면 돌아와요 (그 첫 누름은 돌아오기만 해요). 5분 동안 손대지 않아도 저절로 켜져요.
const CALM_IDLE = 5 * 60 * 1000;
let lastInput = Date.now(), calmClock = 0;
const calm = { t: 0, shot: -1, pos: new THREE.Vector3(), look: new THREE.Vector3(), fresh: true };
function startCalm(full = false) {
  if (S.calm || !S.entered || S.photo) return;
  S.calm = true;
  closeAll();
  setSoundOpen(false); setPeopleOpen(false);
  document.body.classList.add('calm');
  Object.assign(calm, { t: 0, shot: -1, fresh: true });
  if (full) document.documentElement.requestFullscreen?.().catch(() => {});
  tickCalmClock();
  calmClock = setInterval(tickCalmClock, 1000);
}
function stopCalm() {
  if (!S.calm) return;
  S.calm = false;
  document.body.classList.remove('calm');
  clearInterval(calmClock);
  lastInput = Date.now();
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
function tickCalmClock() {
  const d = new Date();
  $('#cc-time').textContent = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const s = store.get('focus.' + dayKey(d), 0);
  $('#cc-sub').textContent = `${S.floor}F ${office?.theme.name || ''} · ${S.peers.size + 1}명 · 오늘 ${fmtMin(s)} 집중`;
}
// 장면 차례: 사무실 전체 → 사람 있는 책상 하나 → 전체 → 다른 책상 … (14초씩)
function calmCamera(dt) {
  calm.t += dt;
  const SHOT = 14, n = Math.floor(calm.t / SHOT);
  if (n !== calm.shot) {
    calm.shot = n;
    const seats = [S.seat, ...[...S.peers.values()].map((p) => p.seat)].filter((i) => i >= 0 && office.seats[i]);
    calm.seat = n % 2 && seats.length ? office.seats[seats[((n - 1) / 2) % seats.length]] : null;
    calm.a0 = Math.random() * Math.PI * 2;
  }
  const k = calm.t - n * SHOT;
  const want = new THREE.Vector3(), look = new THREE.Vector3();
  const cx = (ROOM.minX + ROOM.maxX) / 2, cz = (ROOM.minZ + ROOM.maxZ) / 2;
  if (calm.seat) {
    const s = calm.seat, a = calm.a0 + k * 0.05;
    want.set(s.x + Math.sin(a) * 3.2, 2.1, s.z + Math.cos(a) * 3.2);
    look.set(s.x, 1.0, s.z);
  } else {
    const a = calm.a0 + k * 0.03, rx = (ROOM.maxX - ROOM.minX) * 0.36, rz = (ROOM.maxZ - ROOM.minZ) * 0.36;
    want.set(cx + Math.sin(a) * rx, Math.min(ROOM.H - 0.5, 4.2), cz + Math.cos(a) * rz);
    look.set(cx - Math.sin(a) * 2, 0.6, cz - Math.cos(a) * 2);
  }
  want.x = Math.max(ROOM.minX + 0.4, Math.min(ROOM.maxX - 0.4, want.x));
  want.z = Math.max(ROOM.minZ + 0.4, Math.min(ROOM.maxZ - 0.4, want.z));
  if (calm.fresh) { calm.pos.copy(camera.position); calm.look.copy(cam.target); calm.fresh = false; }
  const e = 1 - Math.exp(-dt * 0.9);
  calm.pos.lerp(want, e);
  calm.look.lerp(look, e);
  camera.position.copy(calm.pos);
  camera.lookAt(calm.look);
}
const wakeCalm = (e) => {
  lastInput = Date.now();
  if (!S.calm) return;
  e.stopPropagation(); e.preventDefault();
  stopCalm();
};
addEventListener('pointerdown', wakeCalm, { capture: true });
addEventListener('keydown', wakeCalm, { capture: true });
addEventListener('pointermove', () => { lastInput = Date.now(); }, { passive: true });
addEventListener('wheel', () => { lastInput = Date.now(); }, { passive: true });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) stopCalm(); });
setInterval(() => {
  const busy = S.photo || !$('#creator').hidden || document.querySelector('.modal:not([hidden])') || typing();
  if (!S.calm && S.entered && !busy && store.get('calmIdle', true) && Date.now() - lastInput > CALM_IDLE) startCalm();
}, 10000);
$('#btn-calm').onclick = () => startCalm(true);

// 🚨 신고하기: 글 + 사진 한 장(지금 화면을 찍거나 고르기) + 지금 상황(층 · 같은 층 닉네임)
let rpImg = null, rpCtx = {};
function setRpImg(u) { rpImg = u; $('#report-preview').hidden = !u; if (u) $('#report-preview img').src = u; }
function openReport() {
  const people = [...S.peers.values()].sort((a, b) => a.seat - b.seat).map((p) => `${p.seat + 1}번 ${p.pf.n}`);
  rpCtx = { floor: S.floor, seat: S.seat + 1, reporter: S.name, people };
  $('#report-ctx').textContent = `함께 보내는 정보: ${S.floor}층 · ${new Date().toLocaleString('ko-KR')}${people.length ? ` · 같은 층: ${people.slice(0, 8).join(', ')}${people.length > 8 ? ' 외' : ''}` : ''}`;
  $('#report-err').textContent = '';
  setRpImg(null);
  openModal('report-modal');
  setTimeout(() => $('#report-text').focus(), 50);
}
function shrinkFile(f) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => { const k = Math.min(1, 1280 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(im.src); res(c.toDataURL('image/jpeg', 0.75)); };
    im.onerror = rej;
    im.src = URL.createObjectURL(f);
  });
}
$('#report-shot').onclick = () => {
  $('#report-modal').hidden = true;
  requestAnimationFrame(() => {
    try { setRpImg(snapCanvas(1280).toDataURL('image/jpeg', 0.75)); } catch { toast('화면을 담지 못했어요. 사진 고르기를 써 주세요'); }
    $('#report-modal').hidden = false;
  });
};
$('#report-file').onchange = async (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try { setRpImg(await shrinkFile(f)); } catch { $('#report-err').textContent = '사진을 읽지 못했어요. 다른 사진을 골라 주세요'; }
};
$('#report-clear').onclick = () => setRpImg(null);
$('#report-form').onsubmit = async (e) => {
  e.preventDefault();
  const text = $('#report-text').value.trim();
  if (!text && !rpImg) { $('#report-err').textContent = '내용을 쓰거나 사진을 담아 주세요'; return; }
  if (!RELAY_URL) { $('#report-err').textContent = '지금은 서버에 연결되지 않아 보낼 수 없어요'; return; }
  $('#report-err').textContent = '';
  const btn = $('#report-form button[type="submit"]');
  btn.disabled = true;
  try {
    const r = await fetch(`${RELAY_URL}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, img: rpImg, ctx: rpCtx }) });
    if (r.status === 429) throw new Error('잠시 뒤에 다시 보내 주세요 (한 시간에 5번까지)');
    if (!r.ok) throw new Error('보내지 못했어요. 잠시 뒤 다시 해 주세요');
    closeModal('report-modal');
    $('#report-text').value = '';
    setRpImg(null);
    toast('신고를 보냈어요. 관리자가 확인할게요');
  } catch (err) {
    $('#report-err').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
};
$('#pf-name').onclick = () => { closeModal('prefs-modal'); openCreator(); };
$('#pf-snd').onclick = (e) => { e.stopPropagation(); closeModal('prefs-modal'); setSoundOpen(true); };
$('#pf-others').onchange = (e) => { setOthersMemo(e.target.checked); toast(e.target.checked ? '다른 분 말풍선을 다시 보여요' : '다른 분 말풍선을 숨겼어요'); };
$('#pf-sound').onchange = (e) => store.set('autoSound', e.target.checked);
$('#pf-lite').onchange = (e) => { store.set('lite', e.target.checked); applyLite(e.target.checked); };

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
  const outfits = OUTFITS;
  for (let i = 0; i < n; i++) {
    const id = 'demo' + i;
    const look = { body: BODIES[i % BODIES.length].id, type: CHAR_TYPES[i % CHAR_TYPES.length].id, gender: i % 3 ? 'm' : 'f', skin: SKIN_TONES[i % 5], outfit: outfits[(i * 3) % outfits.length].id, oc: OUTFIT_COLORS[(i * 5) % OUTFIT_COLORS.length].id, acc: ACCESSORIES[(i * 3) % ACCESSORIES.length].id, pet: PET_IDS[(i * 5) % PET_IDS.length] };
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
  stepFireworks(dt);
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
    if (S.sitting) standUp(); leaveSofa();
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
    if (!w.path) w.path = findPath(pos, w);
    // 다음 꺾이는 곳에 닿으면 그다음으로
    while (w.path.length && Math.hypot(w.path[0][0] - pos.x, w.path[0][1] - pos.z) < 0.35) { w.path.shift(); w.best = Infinity; w.stuck = 0; }
    const tx = w.path.length ? w.path[0][0] : w.x, tz = w.path.length ? w.path[0][1] : w.z;
    const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
    w.t += dt;
    if (!w.path.length && d < 0.15) { const then = w.then; S.walkTo = null; then?.(); }
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
  // 방문: 기기마다 하루 한 번 숫자만 세요 (누가 왔는지는 남기지 않아요)
  if (RELAY_URL && !Q.has('relay') && !Q.has('demo') && store.get('visited', '') !== dayKey(new Date())) fetch(`${RELAY_URL}/visit`, { method: 'POST' }).then(() => store.set('visited', dayKey(new Date()))).catch(() => {});
  // 로딩 화면의 글을 읽을 수 있게 조금은 보여 줘요
  const wait = Q.has('fast') ? 0 : 3200;
  await new Promise((r) => setTimeout(r, wait));
  await enter(S.floor);
  $('#loading').classList.add('out');
  setTimeout(() => $('#loading').remove(), 600);
}
boot();

// 시험용
if (Q.has('debug')) window.__S = { S, cam, net, scene, camera, goSofa, openCard, openDesk, openFloors, openCreator, peek, enter, moveToSeat, doAct, setMemoMode, refreshAllScreens, get office() { return office; }, get me() { return me; } };
