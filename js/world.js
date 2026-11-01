// 사무실 한 층: 책상 섬 5개(섬마다 4자리, 모두 20자리), 큰 창(밤 도시), 라운지, 엘리베이터.
// 모니터 화면은 캔버스로 그려서 그 자리 개발자의 지금 하는 일과 결과물 이름을 보여 준다.
import * as THREE from 'three';
import { mat, FONT } from './avatar.js';
import { SEATS } from './data.js';

const MONO = '"JetBrains Mono", Consolas, monospace';
export const ROOM = { minX: -15.6, maxX: 15.6, minZ: -11.4, maxZ: 11.4, H: 4.2 };
// 엘리베이터 앞에서 시작
export const SPAWN = { x: 0, z: 9.6, ry: Math.PI };

const BOXG = new THREE.BoxGeometry(1, 1, 1);
function box(parent, color, w, h, d, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(BOXG, typeof color === 'string' ? mat(color, opts) : color);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// 시드 있는 난수 (자리마다 같은 장식·코드 모양)
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ───────── 자리 배치 ─────────
const ISLANDS = [[-8.6, -6.2], [0, -6.2], [8.6, -6.2], [-4.3, 0.6], [4.3, 0.6]];
export function seatLayout() {
  const out = [];
  ISLANDS.forEach(([cx, cz], i) => {
    for (const row of [0, 1]) {
      for (const col of [0, 1]) {
        const north = row === 0;
        const dx = cx + (col === 0 ? -0.95 : 0.95);
        const dz = cz + (north ? -0.45 : 0.45);
        // 책상 그룹 회전: 앉는 사람이 책상 지역 +z 쪽에 있게
        const gry = north ? Math.PI : 0;
        const sit = 0.75;
        out.push({
          i: out.length, island: i,
          desk: { x: dx, z: dz, ry: gry },
          x: dx + Math.sin(gry) * sit, z: dz + Math.cos(gry) * sit,
          ry: gry + Math.PI, // 책상을 바라본다
        });
      }
    }
  });
  return out.slice(0, SEATS);
}

// ───────── 바닥·벽 질감 ─────────
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

const woodTex = () => canvasTex(1024, 1024, (g, w, h) => {
  const r = rng(7);
  const rows = 10, rh = h / rows;
  for (let y = 0; y < rows; y++) {
    let x = -r() * 300;
    while (x < w) {
      const len = 260 + r() * 340;
      const v = 0.85 + r() * 0.2;
      g.fillStyle = `rgb(${(176 * v) | 0}, ${(132 * v) | 0}, ${(92 * v) | 0})`;
      g.fillRect(x, y * rh, len, rh);
      // 나뭇결
      g.strokeStyle = 'rgba(80, 50, 30, 0.12)';
      g.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        const yy = y * rh + 10 + r() * (rh - 20);
        g.moveTo(x, yy);
        g.bezierCurveTo(x + len * 0.3, yy + (r() - 0.5) * 12, x + len * 0.6, yy + (r() - 0.5) * 12, x + len, yy);
        g.stroke();
      }
      g.fillStyle = 'rgba(40, 25, 15, 0.45)';
      g.fillRect(x, y * rh, 3, rh);
      x += len;
    }
    g.fillStyle = 'rgba(40, 25, 15, 0.5)';
    g.fillRect(0, y * rh, w, 3);
  }
}, [5, 4]);

const brickTex = () => canvasTex(512, 512, (g, w, h) => {
  const r = rng(3);
  g.fillStyle = '#cfc5b8';
  g.fillRect(0, 0, w, h);
  const bh = 32, bw = 96;
  for (let y = 0; y < h / bh; y++) {
    for (let x = -1; x < w / bw + 1; x++) {
      const v = 0.82 + r() * 0.3;
      g.fillStyle = `rgb(${(150 * v) | 0}, ${(82 * v) | 0}, ${(62 * v) | 0})`;
      g.fillRect(x * bw + (y % 2) * (bw / 2) + 3, y * bh + 3, bw - 6, bh - 6);
    }
  }
}, [6, 2]);

// 창밖: 시간에 따라 낮·노을·밤 도시
export function paintSkyline(g, w, h, hour) {
  const night = hour < 6 || hour >= 19;
  const dusk = !night && (hour >= 17 || hour < 7);
  const sky = g.createLinearGradient(0, 0, 0, h);
  if (night) { sky.addColorStop(0, '#070b1c'); sky.addColorStop(0.7, '#1b2350'); sky.addColorStop(1, '#3a3266'); }
  else if (dusk) { sky.addColorStop(0, '#3b3f7a'); sky.addColorStop(0.55, '#d9806a'); sky.addColorStop(1, '#f6c27a'); }
  else { sky.addColorStop(0, '#7fb6e8'); sky.addColorStop(1, '#d8e9f5'); }
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const r = rng(11);
  if (night) {
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`; g.fillRect(r() * w, r() * h * 0.5, 2, 2); }
    g.fillStyle = '#fbf2d0';
    g.beginPath(); g.arc(w * 0.78, h * 0.18, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = sky; g.beginPath(); g.arc(w * 0.78 + 14, h * 0.18 - 8, 30, 0, Math.PI * 2); g.fill();
  }
  // 먼 건물 두 겹
  for (const [layer, base, col] of [[0, 0.5, night ? '#161b38' : dusk ? '#7a5a78' : '#a9bccd'], [1, 0.62, night ? '#0d1128' : dusk ? '#4a3a58' : '#7f95aa']]) {
    let x = 0;
    while (x < w) {
      const bw = 50 + r() * 110, bh = h * (0.15 + r() * (layer ? 0.3 : 0.35));
      const top = h * base - bh + h * 0.38 * layer;
      g.fillStyle = col;
      g.fillRect(x, top, bw - 4, h - top);
      if (layer && r() < 0.25) g.fillRect(x + bw / 2 - 2, top - 30, 4, 30); // 안테나
      // 창문 불빛
      for (let yy = top + 10; yy < h - 8; yy += 16) {
        for (let xx = x + 8; xx < x + bw - 12; xx += 13) {
          const lit = night ? r() < 0.42 : dusk ? r() < 0.18 : r() < 0.02;
          if (lit) { g.fillStyle = r() < 0.8 ? 'rgba(255, 214, 140, 0.9)' : 'rgba(170, 220, 255, 0.85)'; g.fillRect(xx, yy, 6, 8); }
          else if (!night) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(xx, yy, 6, 8); }
        }
      }
      x += bw;
    }
  }
}

function signTex(text, sub, color) {
  return canvasTex(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 120px ${MONO}`;
    g.shadowColor = color; g.shadowBlur = 40;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 - (sub ? 22 : 0));
    g.shadowBlur = 0;
    g.fillStyle = '#fff6ea';
    g.fillText(text, w / 2, h / 2 - (sub ? 22 : 0));
    if (sub) { g.font = `500 40px ${FONT}`; g.fillStyle = color; g.fillText(sub, w / 2, h - 44); }
  });
}

// ───────── 모니터 화면 ─────────
const SCR_W = 512, SCR_H = 300;
const CODE_COLORS = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#f7768e', '#c0caf5'];

function fitText(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

// info: { state: 'empty'|'busy'|'away', name, now, title, mine }
export function paintScreen(seat) {
  const { ctx: g, info, code } = seat.screen;
  g.fillStyle = '#0c0f16';
  g.fillRect(0, 0, SCR_W, SCR_H);
  if (info.state === 'empty') {
    g.fillStyle = '#121725';
    g.fillRect(0, 0, SCR_W, SCR_H);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#5d6a86';
    g.font = `600 44px ${FONT}`;
    g.fillText('빈 자리', SCR_W / 2, SCR_H / 2 - 18);
    g.font = `400 24px ${FONT}`;
    g.fillStyle = '#46516a';
    g.fillText(`${seat.i + 1}번 책상 · 눌러서 앉기`, SCR_W / 2, SCR_H / 2 + 30);
    seat.screen.tex.needsUpdate = true;
    return;
  }
  if (info.state === 'away') {
    // 화면 보호기: 이름과 지금 하는 일
    const grd = g.createLinearGradient(0, 0, SCR_W, SCR_H);
    grd.addColorStop(0, '#1a2140'); grd.addColorStop(1, '#3a2346');
    g.fillStyle = grd;
    g.fillRect(0, 0, SCR_W, SCR_H);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f6f3ec';
    g.font = `700 40px ${FONT}`;
    g.fillText(fitText(g, info.name, SCR_W - 40), SCR_W / 2, SCR_H / 2 - 30);
    g.font = `400 24px ${FONT}`;
    g.fillStyle = '#ffb35c';
    g.fillText('잠깐 자리 비움', SCR_W / 2, SCR_H / 2 + 18);
    if (info.title) { g.fillStyle = '#aab3cc'; g.font = `400 22px ${FONT}`; g.fillText(fitText(g, '▸ ' + info.title, SCR_W - 60), SCR_W / 2, SCR_H / 2 + 60); }
    seat.screen.tex.needsUpdate = true;
    return;
  }
  // 코드 편집기
  g.fillStyle = '#1a1e2b';
  g.fillRect(0, 0, SCR_W, SCR_H);
  g.fillStyle = '#12151f';
  g.fillRect(0, 0, SCR_W, 34);
  for (const [i, c] of ['#f7768e', '#e0af68', '#9ece6a'].entries()) { g.fillStyle = c; g.beginPath(); g.arc(18 + i * 18, 17, 6, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#1a1e2b';
  g.fillRect(76, 6, 230, 28);
  g.font = `500 17px ${MONO}`;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillStyle = '#c0caf5';
  g.fillText(fitText(g, info.title || 'main.js', 210), 88, 20);
  // 줄 번호 + 코드 막대
  const shown = code.lines.slice(Math.max(0, code.n - 11), code.n);
  const top = Math.max(0, code.n - 11);
  shown.forEach((ln, k) => {
    const y = 52 + k * 19;
    g.fillStyle = '#3b4261';
    g.font = `400 13px ${MONO}`;
    g.fillText(String(top + k + 1).padStart(3, ' '), 6, y + 4);
    let x = 44 + ln.indent * 18;
    for (const [len, ci] of ln.parts) {
      g.fillStyle = CODE_COLORS[ci];
      g.fillRect(x, y - 1, len, 9);
      x += len + 8;
    }
  });
  // 깜빡이는 커서
  if (code.blink) {
    const k = Math.min(10, code.n - 1 - top);
    const ln = code.lines[code.n - 1];
    const x = 44 + (ln ? ln.indent * 18 + ln.parts.reduce((a, [l]) => a + l + 8, 0) : 0);
    g.fillStyle = '#ffb35c';
    g.fillRect(x, 52 + k * 19 - 4, 3, 16);
  }
  // 아래 상태 줄: 지금 하는 일
  g.fillStyle = info.mine ? '#b5652a' : '#2a6f97';
  g.fillRect(0, SCR_H - 34, SCR_W, 34);
  g.fillStyle = '#ffffff';
  g.font = `500 18px ${FONT}`;
  g.fillText(fitText(g, `● ${info.name}${info.now ? ' · ' + info.now : ''}`, SCR_W - 24), 12, SCR_H - 16);
  seat.screen.tex.needsUpdate = true;
}

function makeCode(seed) {
  const r = rng(seed + 1);
  const lines = [];
  let indent = 0;
  for (let i = 0; i < 400; i++) {
    const parts = [];
    const n = 1 + ((r() * 4) | 0);
    for (let k = 0; k < n; k++) parts.push([14 + ((r() * 70) | 0), (r() * CODE_COLORS.length) | 0]);
    lines.push({ indent, parts });
    if (r() < 0.3 && indent < 4) indent++;
    else if (r() < 0.3 && indent > 0) indent--;
  }
  return { lines, n: 4 + ((r() * 8) | 0), blink: true };
}

// ───────── 소품 ─────────
function plant(parent, x, z, s = 1, seed = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  box(g, '#c8643a', 0.5, 0.5, 0.5, 0, 0.25, 0);
  box(g, '#3b2a20', 0.44, 0.03, 0.44, 0, 0.5, 0);
  const r = rng(seed);
  for (let i = 0; i < 9; i++) {
    const leaf = box(g, ['#3f8a4a', '#4fa25a', '#2f7040'][i % 3], 0.16, 0.5 + r() * 0.5, 0.06, (r() - 0.5) * 0.3, 0.8 + r() * 0.3, (r() - 0.5) * 0.3);
    leaf.rotation.set((r() - 0.5) * 0.9, r() * Math.PI, (r() - 0.5) * 0.9);
  }
  parent.add(g);
  return g;
}

function deskDecor(g, seed) {
  const r = rng(seed * 3 + 5);
  const pick = (r() * 6) | 0;
  // 오른쪽 구석
  if (pick === 0) { // 머그
    box(g, '#f4f1ec', 0.1, 0.12, 0.1, 0.62, 0.84, 0.05); box(g, '#5a3524', 0.08, 0.01, 0.08, 0.62, 0.9, 0.05);
  } else if (pick === 1) { // 고무 오리 (러버덕 디버깅)
    box(g, '#f5cf3a', 0.14, 0.1, 0.16, 0.62, 0.83, 0.05); box(g, '#f5cf3a', 0.1, 0.09, 0.09, 0.62, 0.92, 0.1); box(g, '#f08a2a', 0.05, 0.025, 0.05, 0.62, 0.91, 0.16);
  } else if (pick === 2) { // 작은 화분
    box(g, '#e8e2d6', 0.12, 0.1, 0.12, 0.62, 0.83, 0.0); box(g, '#4fa25a', 0.16, 0.14, 0.16, 0.62, 0.95, 0.0);
  } else if (pick === 3) { // 책 더미
    box(g, '#2f5d8a', 0.26, 0.04, 0.18, 0.58, 0.8, 0.0); box(g, '#c8443a', 0.24, 0.04, 0.17, 0.58, 0.84, 0.0); box(g, '#e0af68', 0.22, 0.04, 0.16, 0.58, 0.88, 0.0);
  } else if (pick === 4) { // 에너지 음료 캔
    box(g, '#2a8a6a', 0.07, 0.14, 0.07, 0.64, 0.85, 0.08); box(g, '#2a8a6a', 0.07, 0.14, 0.07, 0.55, 0.85, -0.04);
  } else { // 노트와 펜
    box(g, '#f2eee4', 0.22, 0.015, 0.28, 0.58, 0.79, 0.12); box(g, '#2a2c33', 0.02, 0.02, 0.16, 0.66, 0.805, 0.12);
  }
  // 왼쪽: 스탠드 또는 포스트잇
  if (r() < 0.5) {
    box(g, '#2a2c33', 0.14, 0.02, 0.14, -0.68, 0.79, -0.1);
    const arm = box(g, '#2a2c33', 0.025, 0.42, 0.025, -0.68, 1.0, -0.1); arm.rotation.x = 0.25;
    box(g, '#ffd59a', 0.16, 0.05, 0.12, -0.68, 1.2, 0.0, { emissive: '#ffcf8a', emissiveIntensity: 1.2 });
  } else {
    box(g, '#ffe57a', 0.08, 0.08, 0.005, -0.4, 1.32, -0.215); box(g, '#ff9fb2', 0.08, 0.08, 0.005, -0.31, 1.3, -0.215);
  }
}

function buildDesk(seat) {
  const g = new THREE.Group();
  g.position.set(seat.desk.x, 0, seat.desk.z);
  g.rotation.y = seat.desk.ry;
  const top = box(g, '#d8c3a0', 1.84, 0.05, 0.9, 0, 0.765, 0);
  box(g, '#2b2f38', 0.04, 0.74, 0.84, 0.88, 0.37, 0);
  box(g, '#2b2f38', 0.04, 0.74, 0.84, -0.88, 0.37, 0);
  box(g, '#2b2f38', 1.72, 0.36, 0.02, 0, 0.52, -0.42);
  // 모니터
  box(g, '#2a2c33', 0.32, 0.02, 0.2, 0, 0.8, -0.26);
  box(g, '#2a2c33', 0.07, 0.3, 0.05, 0, 0.94, -0.28);
  const bezel = box(g, '#16181e', 0.94, 0.58, 0.04, 0, 1.15, -0.24);
  const c = document.createElement('canvas');
  c.width = SCR_W; c.height = SCR_H;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.515), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.set(0, 1.15, -0.218);
  g.add(screen);
  // 키보드 · 마우스
  box(g, '#2a2c33', 0.52, 0.025, 0.17, 0, 0.8, 0.28);
  box(g, '#4a4e58', 0.48, 0.008, 0.13, 0, 0.815, 0.28);
  box(g, '#2a2c33', 0.07, 0.03, 0.1, 0.4, 0.8, 0.28);
  deskDecor(g, seat.i);
  // 의자
  const chair = new THREE.Group();
  chair.position.set(0, 0, 0.75);
  const accent = ['#3d4452', '#5a3a4a', '#2f5a5a', '#4a4a2f', '#2f3f6a'][seat.island];
  box(chair, accent, 0.52, 0.08, 0.5, 0, 0.44, 0);
  box(chair, accent, 0.5, 0.62, 0.07, 0, 0.82, 0.27);
  box(chair, '#2a2c33', 0.06, 0.36, 0.06, 0, 0.24, 0);
  box(chair, '#2a2c33', 0.62, 0.04, 0.06, 0, 0.06, 0);
  box(chair, '#2a2c33', 0.06, 0.04, 0.62, 0, 0.06, 0);
  g.add(chair);
  for (const m of [top, bezel, screen, ...chair.children]) m.userData.seat = seat.i;
  seat.chair = chair;
  seat.screen = { canvas: c, ctx: c.getContext('2d'), tex, mesh: screen, info: { state: 'empty' }, code: makeCode(seat.i) };
  seat.clickables = [top, bezel, screen, ...chair.children];
  return g;
}

// ───────── 층 전체 ─────────
export function buildOffice() {
  const world = new THREE.Group();
  const colliders = [];
  const clickables = [];
  const W = ROOM.maxX - ROOM.minX + 0.8, D = ROOM.maxZ - ROOM.minZ + 0.8, H = ROOM.H;

  // 바닥
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.62 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  world.add(floor);
  // 천장 (노출 콘크리트 + 덕트)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat('#34373f', { side: THREE.DoubleSide }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  world.add(ceil);
  for (const z of [-6, 2]) {
    const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, W, 16), mat('#8f949c', { metalness: 0.6, roughness: 0.4 }));
    duct.rotation.z = Math.PI / 2;
    duct.position.set(0, H - 0.45, z);
    world.add(duct);
  }

  // 벽: 북쪽은 통유리, 서쪽은 벽돌, 나머지는 회벽
  const wallM = mat('#e7e1d6');
  box(world, wallM, W, H, 0.2, 0, H / 2, ROOM.maxZ + 0.5); // 남
  box(world, wallM, 0.2, H, D, ROOM.maxX + 0.5, H / 2, 0); // 동
  const brick = new THREE.Mesh(new THREE.PlaneGeometry(D, H), new THREE.MeshStandardMaterial({ map: brickTex(), roughness: 0.9 }));
  brick.rotation.y = Math.PI / 2;
  brick.position.set(ROOM.minX - 0.38, H / 2, 0);
  world.add(brick);
  // 창: 하늘 그림 + 창틀
  const skyC = document.createElement('canvas');
  skyC.width = 2048; skyC.height = 512;
  const skyTex = new THREE.CanvasTexture(skyC);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, H + 2), new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false }));
  sky.position.set(0, H / 2 + 0.6, ROOM.minZ - 2.2);
  world.add(sky);
  const frame = '#1e2128';
  box(world, frame, W, 0.5, 0.25, 0, 0.25, ROOM.minZ - 0.45);
  box(world, frame, W, 0.3, 0.25, 0, H - 0.15, ROOM.minZ - 0.45);
  for (let x = ROOM.minX - 0.4; x <= ROOM.maxX + 0.5; x += 3.2) box(world, frame, 0.12, H, 0.2, x, H / 2, ROOM.minZ - 0.45);
  box(world, frame, W, 0.06, 0.12, 0, 2.6, ROOM.minZ - 0.45);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: '#9fc0d8', transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.2, depthWrite: false }));
  glass.position.set(0, H / 2, ROOM.minZ - 0.5);
  world.add(glass);
  const paintSky = (hour) => { paintSkyline(skyC.getContext('2d'), skyC.width, skyC.height, hour); skyTex.needsUpdate = true; };

  // 책상 섬
  const seats = seatLayout();
  for (const s of seats) {
    world.add(buildDesk(s));
    clickables.push(...s.clickables);
  }
  ISLANDS.forEach(([cx, cz]) => {
    // 가운데 칸막이 (모니터 뒤)
    box(world, '#56657a', 3.76, 0.5, 0.05, cx, 1.06, cz);
    box(world, '#2b2f38', 3.8, 0.04, 0.08, cx, 1.32, cz);
    // 매달린 조명
    box(world, '#2a2c33', 0.02, 0.9, 0.02, cx, H - 0.45, cz);
    box(world, '#2a2c33', 2.6, 0.08, 0.3, cx, H - 0.92, cz);
    box(world, '#fff1d6', 2.5, 0.02, 0.24, cx, H - 0.97, cz, { emissive: '#ffe2b0', emissiveIntensity: 2 });
    const pl = new THREE.PointLight('#ffd9a8', 9, 9, 1.6);
    pl.position.set(cx, H - 1.2, cz);
    world.add(pl);
    colliders.push({ minX: cx - 1.9, maxX: cx + 1.9, minZ: cz - 0.92, maxZ: cz + 0.92 });
  });

  // ── 라운지 (남동쪽) ──
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4.4), mat('#3f5a6e'));
  rug.rotation.x = -Math.PI / 2; rug.position.set(10.6, 0.01, 7.6); rug.receiveShadow = true;
  world.add(rug);
  const rug2 = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 4.0), mat('#4c6b80'));
  rug2.rotation.x = -Math.PI / 2; rug2.position.set(10.6, 0.012, 7.6);
  world.add(rug2);
  // 소파 (ㄴ자)
  const sofaC = '#c26a4a';
  box(world, sofaC, 4.2, 0.45, 1.0, 10.6, 0.3, 10.3); box(world, sofaC, 4.2, 0.8, 0.3, 10.6, 0.7, 10.75);
  box(world, sofaC, 1.0, 0.45, 2.6, 14.4, 0.3, 8.4); box(world, sofaC, 0.3, 0.8, 2.6, 14.85, 0.7, 8.4);
  for (const x of [9.2, 10.6, 12.0]) box(world, '#d98a68', 1.2, 0.14, 0.86, x, 0.6, 10.25);
  colliders.push({ minX: 8.4, maxX: 15.6, minZ: 9.7, maxZ: 11.4 }, { minX: 13.8, maxX: 15.6, minZ: 7.0, maxZ: 11.4 });
  // 낮은 탁자 + 노트북
  box(world, '#d8c3a0', 2.0, 0.06, 1.0, 10.8, 0.42, 7.8); box(world, '#2b2f38', 1.9, 0.38, 0.9, 10.8, 0.2, 7.8);
  box(world, '#c9ccd2', 0.5, 0.02, 0.34, 10.4, 0.46, 7.8);
  const lid = box(world, '#c9ccd2', 0.5, 0.32, 0.02, 10.4, 0.6, 7.64); lid.rotation.x = -0.25;
  box(world, '#f4f1ec', 0.1, 0.12, 0.1, 11.3, 0.51, 7.9);
  colliders.push({ minX: 9.7, maxX: 11.9, minZ: 7.2, maxZ: 8.4 });
  // 커피 바 (동쪽 벽)
  const bar = new THREE.Group();
  box(bar, '#2b2f38', 0.9, 1.0, 3.6, 0, 0.5, 0);
  box(bar, '#d8c3a0', 1.0, 0.06, 3.7, 0, 1.03, 0);
  const machine = box(bar, '#c23b3b', 0.6, 0.62, 0.55, 0.05, 1.37, -0.9);
  box(bar, '#1e2128', 0.3, 0.2, 0.05, 0.05, 1.45, -0.6);
  box(bar, '#f4f1ec', 0.1, 0.12, 0.1, -0.1, 1.12, -0.55);
  box(bar, '#e8e6e0', 0.5, 0.36, 0.4, 0.05, 1.24, 0.5); // 전기 주전자 자리
  for (let i = 0; i < 4; i++) box(bar, ['#f4f1ec', '#2f5d8a', '#e0af68', '#9ece6a'][i], 0.1, 0.12, 0.1, -0.2, 1.12, 1.0 + i * 0.16);
  // 냉장고
  box(bar, '#dfe3e8', 0.8, 1.9, 0.9, 0, 0.95, 2.4);
  box(bar, '#9aa0a8', 0.04, 0.5, 0.04, -0.42, 1.25, 2.1);
  bar.position.set(15.1, 0, 3.0);
  world.add(bar);
  machine.userData.kind = 'coffee';
  clickables.push(machine);
  colliders.push({ minX: 14.5, maxX: 15.6, minZ: 1.1, maxZ: 5.9 });
  // 벽 시계 위 네온 간판
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshBasicMaterial({ map: signTex('SOHO LAB', '혼자지만 같이 일하는 곳', '#ff9a4a'), transparent: true, toneMapped: false }));
  neon.rotation.y = -Math.PI / 2;
  neon.position.set(ROOM.maxX + 0.38, 2.9, -3.4);
  world.add(neon);

  // ── 엘리베이터 (남쪽 벽 가운데) ──
  const elev = new THREE.Group();
  box(elev, '#2a2d33', 2.4, 2.9, 0.12, 0, 1.45, 0);
  const doorL = box(elev, '#9aa0a8', 0.98, 2.5, 0.06, -0.5, 1.25, -0.08, { metalness: 0.7, roughness: 0.3 });
  const doorR = box(elev, '#9aa0a8', 0.98, 2.5, 0.06, 0.5, 1.25, -0.08, { metalness: 0.7, roughness: 0.3 });
  const floorC = document.createElement('canvas');
  floorC.width = 256; floorC.height = 96;
  const floorTex = new THREE.CanvasTexture(floorC);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshBasicMaterial({ map: floorTex, toneMapped: false }));
  disp.position.set(0, 2.72, -0.07);
  disp.rotation.y = Math.PI;
  elev.add(disp);
  // 호출 단추
  box(elev, '#1e2128', 0.16, 0.3, 0.04, 1.45, 1.2, -0.02);
  const callBtn = box(elev, '#ffb35c', 0.07, 0.07, 0.03, 1.45, 1.25, -0.05, { emissive: '#ffb35c', emissiveIntensity: 1 });
  elev.position.set(0, 0, ROOM.maxZ + 0.38);
  world.add(elev);
  for (const m of [doorL, doorR, callBtn, disp]) { m.userData.kind = 'elevator'; clickables.push(m); }
  const paintFloor = (n) => {
    const g = floorC.getContext('2d');
    g.fillStyle = '#0c0f16'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#ffb35c'; g.font = `700 64px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`${n}F`, 128, 52);
    floorTex.needsUpdate = true;
  };

  // ── 서쪽: 화이트보드 + 책장 ──
  const boardC = document.createElement('canvas');
  boardC.width = 1024; boardC.height = 512;
  const boardTex = new THREE.CanvasTexture(boardC);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  box(world, '#c9ccd2', 0.08, 1.7, 3.6, ROOM.minX - 0.3, 1.75, 4.6);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.55), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.4 }));
  board.rotation.y = Math.PI / 2;
  board.position.set(ROOM.minX - 0.25, 1.75, 4.6);
  world.add(board);
  board.userData.kind = 'board';
  clickables.push(board);
  const paintBoard = (n, people) => {
    const g = boardC.getContext('2d');
    g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = '#2f5d8a'; g.lineWidth = 6;
    g.font = `700 64px ${FONT}`; g.fillStyle = '#2f5d8a'; g.textBaseline = 'top';
    g.fillText(`${n}층 소호랩`, 50, 40);
    g.font = `500 40px ${FONT}`; g.fillStyle = '#c8443a';
    g.fillText('규칙', 50, 150);
    g.fillStyle = '#2a2c33'; g.font = `400 34px ${FONT}`;
    ['· 채팅 없이 조용히 각자 일해요', '· 하고 싶은 말은 머리 위 메모로', '· 책상·모니터를 누르면 그 사람 작업 구경', `· 지금 ${people}명이 함께 일하는 중`].forEach((t, i) => g.fillText(t, 70, 210 + i * 62));
    boardTex.needsUpdate = true;
  };
  // 책장 (남쪽 벽 서편)
  const shelf = new THREE.Group();
  box(shelf, '#5a4636', 4.2, 2.4, 0.45, 0, 1.2, 0);
  const r = rng(21);
  for (let row = 0; row < 4; row++) {
    box(shelf, '#3f3126', 4.0, 0.04, 0.4, 0, 0.3 + row * 0.55, 0.03);
    let x = -1.9;
    while (x < 1.8) {
      const bw = 0.07 + r() * 0.08, bh = 0.3 + r() * 0.16;
      if (r() < 0.12) { x += 0.2; continue; }
      box(shelf, ['#c8443a', '#2f5d8a', '#e0af68', '#3f8a4a', '#f4f1ec', '#6b4a8a', '#2a2c33'][(r() * 7) | 0], bw, bh, 0.3, x + bw / 2, 0.32 + row * 0.55 + bh / 2, 0.05);
      x += bw + 0.01;
    }
  }
  shelf.rotation.y = Math.PI;
  shelf.position.set(-7, 0, ROOM.maxZ + 0.15);
  world.add(shelf);
  colliders.push({ minX: -9.2, maxX: -4.8, minZ: 10.8, maxZ: 11.4 });
  // 서쪽 긴 창가 바 테이블 (노트북 자리 느낌)
  box(world, '#d8c3a0', 0.7, 0.06, 6.0, ROOM.minX + 0.4, 1.05, -4.0);
  box(world, '#2b2f38', 0.06, 1.0, 0.06, ROOM.minX + 0.4, 0.52, -6.8); box(world, '#2b2f38', 0.06, 1.0, 0.06, ROOM.minX + 0.4, 0.52, -1.2);
  colliders.push({ minX: ROOM.minX, maxX: ROOM.minX + 0.8, minZ: -7.1, maxZ: -0.9 });

  // 화분
  [[-14.6, 10.6, 1.2], [14.6, -10.6, 1.3], [-14.6, -10.6, 1.1], [7.0, 10.6, 1.0], [-3.4, 10.6, 0.9], [14.6, -0.2, 1.0]].forEach(([x, z, s], i) => {
    plant(world, x, z, s, i + 2);
    colliders.push({ minX: x - 0.35 * s, maxX: x + 0.35 * s, minZ: z - 0.35 * s, maxZ: z + 0.35 * s });
  });

  // 천장 레일 조명 (라운지·통로)
  for (const [x, z] of [[10.6, 7.6], [0, 9], [-9, 8], [-12, 2]]) {
    box(world, '#fff1d6', 0.5, 0.04, 0.5, x, H - 0.05, z, { emissive: '#ffe2b0', emissiveIntensity: 1.5 });
  }
  const loungeLight = new THREE.PointLight('#ffcf9a', 8, 10, 1.6);
  loungeLight.position.set(10.6, H - 0.6, 7.6);
  world.add(loungeLight);

  world.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  return { group: world, seats, colliders, clickables, paintSky, paintFloor, paintBoard };
}

// 원(캐릭터)과 상자(책상 등)가 겹치면 밀어낸다
export function collide(pos, colliders, radius = 0.32) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = radius - d;
        pos.x += (dx / d) * push; pos.z += (dz / d) * push;
      } else {
        // 상자 안: 가장 가까운 변으로
        const opts = [[c.minX - radius - pos.x, 0], [c.maxX + radius - pos.x, 0], [0, c.minZ - radius - pos.z], [0, c.maxZ + radius - pos.z]];
        opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        pos.x += opts[0][0]; pos.z += opts[0][1];
      }
    }
  }
  pos.x = Math.max(ROOM.minX, Math.min(ROOM.maxX, pos.x));
  pos.z = Math.max(ROOM.minZ, Math.min(ROOM.maxZ, pos.z));
}
