// 사무실 한 층: 책상 섬 5개(섬마다 4자리, 모두 20자리), 큰 창, 라운지, 엘리베이터. 층마다 테마(THEMES)가 달라요.
// 모니터 화면은 캔버스로 그려서 그 자리 개발자의 지금 하는 일과 결과물 이름을 보여 준다.
import * as THREE from 'three';
import { mat, FONT } from './avatar.js';
import { SEATS, DESK_COLORS, CHAIR_COLORS, CHAIRS, DESK_ITEMS } from './data.js';

const MONO = '"JetBrains Mono", Consolas, monospace';
// 책상이 6 m 라서 사무실도 넓어요 (가로 44 m)
export const ROOM = { minX: -22, maxX: 22, minZ: -13, maxZ: 9.5, H: 4.4 };
// 엘리베이터 앞에서 시작
export const SPAWN = { x: 0, z: ROOM.maxZ - 1.8, ry: Math.PI };

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
// 책상 한 개 6.0 × 1.4 m (길게 펼친 개인 책상). 섬마다 2 × 2 자리
export const DESK = { W: 6.0, D: 1.4, H: 0.765 };
const SIT = DESK.D / 2 + 0.32; // 책상 가운데에서 의자까지
const ISLANDS = [[-14.4, -8.3], [0, -8.3], [14.4, -8.3], [-7.2, -1.2], [7.2, -1.2]];
export function seatLayout() {
  const out = [];
  ISLANDS.forEach(([cx, cz], i) => {
    for (const row of [0, 1]) {
      for (const col of [0, 1]) {
        const north = row === 0;
        const dx = cx + (col === 0 ? -1 : 1) * (DESK.W / 2 + 0.03);
        const dz = cz + (north ? -1 : 1) * (DESK.D / 2 + 0.02);
        // 책상 그룹 회전: 앉는 사람이 책상 지역 +z 쪽에 있게
        const gry = north ? Math.PI : 0;
        out.push({
          i: out.length, island: i,
          desk: { x: dx, z: dz, ry: gry },
          x: dx + Math.sin(gry) * SIT, z: dz + Math.cos(gry) * SIT,
          ry: gry + Math.PI, // 책상을 바라본다
        });
      }
    }
  });
  // 1번 자리는 입구(엘리베이터)에서 가장 가까운 자리. 서버는 빈 자리 중 번호가 작은 것부터 줘요
  out.sort((a, b) => Math.hypot(a.x - SPAWN.x, a.z - SPAWN.z) - Math.hypot(b.x - SPAWN.x, b.z - SPAWN.z) || a.x - b.x);
  out.forEach((s, k) => { s.i = k; });
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

// 책상 위 소품 하나. g 의 바닥(y=0)이 책상 윗면, +z 가 앉은 사람 쪽
const ITEM = {
  plant(g) {
    box(g, '#e8e2d6', 0.2, 0.18, 0.2, 0, 0.09, 0); box(g, '#3b2a20', 0.17, 0.02, 0.17, 0, 0.18, 0);
    for (const [x, z, h, ry] of [[0, 0, 0.32, 0], [0.05, 0.03, 0.26, 0.8], [-0.05, -0.02, 0.28, 2.1], [0.02, -0.05, 0.22, 1.4]]) { const l = box(g, '#4fa25a', 0.1, h, 0.03, x, 0.18 + h / 2, z); l.rotation.set(0.25, ry, 0.2); }
  },
  cactus(g) {
    box(g, '#c8643a', 0.14, 0.12, 0.14, 0, 0.06, 0);
    box(g, '#5a9a4a', 0.08, 0.24, 0.08, 0, 0.24, 0); box(g, '#5a9a4a', 0.05, 0.1, 0.05, 0.07, 0.25, 0); box(g, '#5a9a4a', 0.05, 0.08, 0.05, 0.08, 0.32, 0);
    box(g, '#f59bb5', 0.05, 0.04, 0.05, 0, 0.38, 0);
  },
  mug(g) { box(g, '#f4f1ec', 0.12, 0.14, 0.12, 0, 0.07, 0); box(g, '#5a3524', 0.1, 0.01, 0.1, 0, 0.135, 0); box(g, '#f4f1ec', 0.03, 0.08, 0.03, 0.075, 0.07, 0); box(g, '#e2603d', 0.121, 0.03, 0.121, 0, 0.06, 0); },
  duck(g) { box(g, '#f5cf3a', 0.16, 0.12, 0.2, 0, 0.06, 0); box(g, '#f5cf3a', 0.11, 0.11, 0.11, 0, 0.17, 0.05); box(g, '#f08a2a', 0.06, 0.03, 0.06, 0, 0.16, 0.12); box(g, '#1d1a18', 0.02, 0.02, 0.01, 0.03, 0.19, 0.106); box(g, '#1d1a18', 0.02, 0.02, 0.01, -0.03, 0.19, 0.106); },
  books(g) { box(g, '#2f5d8a', 0.3, 0.05, 0.22, 0, 0.025, 0); const b = box(g, '#c8443a', 0.28, 0.05, 0.2, 0, 0.075, 0); b.rotation.y = 0.15; box(g, '#e0af68', 0.26, 0.05, 0.19, 0, 0.125, 0); },
  lamp(g, side) {
    box(g, '#2a2c33', 0.16, 0.02, 0.16, 0, 0.01, 0);
    const arm = box(g, '#2a2c33', 0.025, 0.46, 0.025, 0, 0.24, 0); arm.rotation.x = 0.28; arm.rotation.z = 0.25 * side;
    box(g, '#2a2c33', 0.18, 0.06, 0.14, -0.08 * side, 0.46, 0.08);
    box(g, '#ffd59a', 0.15, 0.01, 0.11, -0.08 * side, 0.425, 0.08, { emissive: '#ffcf8a', emissiveIntensity: 1.6 });
  },
  cans(g) { box(g, '#2a8a6a', 0.07, 0.14, 0.07, 0.04, 0.07, 0.03); box(g, '#2a8a6a', 0.07, 0.14, 0.07, -0.05, 0.07, -0.04); box(g, '#c9ccd2', 0.07, 0.14, 0.07, -0.02, 0.07, 0.09).rotation.z = 1.57; },
  figure(g) {
    box(g, '#c9ccd2', 0.12, 0.12, 0.08, 0, 0.13, 0); box(g, '#c9ccd2', 0.1, 0.09, 0.09, 0, 0.24, 0);
    box(g, '#5ff0e0', 0.025, 0.025, 0.01, 0.025, 0.25, 0.046, { emissive: '#5ff0e0', emissiveIntensity: 0.8 }); box(g, '#5ff0e0', 0.025, 0.025, 0.01, -0.025, 0.25, 0.046, { emissive: '#5ff0e0', emissiveIntensity: 0.8 });
    for (const s of [1, -1]) { box(g, '#8a9096', 0.04, 0.07, 0.04, 0.035 * s, 0.035, 0); box(g, '#8a9096', 0.035, 0.09, 0.035, 0.08 * s, 0.13, 0); }
    box(g, '#e2603d', 0.02, 0.05, 0.02, 0, 0.31, 0);
  },
  catdoll(g) {
    box(g, '#e9a25a', 0.16, 0.14, 0.13, 0, 0.07, 0); box(g, '#e9a25a', 0.17, 0.14, 0.13, 0, 0.2, 0.01);
    for (const s of [1, -1]) { const e = box(g, '#e9a25a', 0.05, 0.06, 0.03, 0.055 * s, 0.29, 0.01); e.rotation.z = -0.4 * s; box(g, '#1d1a18', 0.025, 0.03, 0.01, 0.04 * s, 0.21, 0.076); }
    box(g, '#f6e6cf', 0.06, 0.03, 0.01, 0, 0.175, 0.076); box(g, '#e9a25a', 0.03, 0.03, 0.14, 0.06, 0.03, -0.1);
  },
  clock(g) {
    box(g, '#2a2c33', 0.18, 0.18, 0.08, 0, 0.09, 0); box(g, '#f6f3ec', 0.15, 0.15, 0.01, 0, 0.095, 0.041);
    box(g, '#1d1a18', 0.012, 0.055, 0.01, 0, 0.115, 0.047); const h = box(g, '#e2603d', 0.012, 0.045, 0.01, 0.015, 0.09, 0.048); h.rotation.z = -1.1;
  },
  frame(g) {
    const f = new THREE.Group(); f.rotation.x = -0.18; g.add(f);
    box(f, '#5a4636', 0.24, 0.3, 0.025, 0, 0.15, 0); box(f, '#bfe0f0', 0.19, 0.24, 0.01, 0, 0.155, 0.015);
    box(f, '#f6c27a', 0.08, 0.08, 0.005, 0.03, 0.2, 0.021); box(f, '#4fa25a', 0.19, 0.08, 0.006, 0, 0.075, 0.02);
  },
  speaker(g) { box(g, '#1f2126', 0.15, 0.24, 0.15, 0, 0.12, 0); box(g, '#3a3d45', 0.1, 0.1, 0.01, 0, 0.09, 0.076); box(g, '#3a3d45', 0.05, 0.05, 0.01, 0, 0.19, 0.076); },
  gamepad(g) { const p = box(g, '#3a3d45', 0.22, 0.04, 0.12, 0, 0.02, 0); p.rotation.y = 0.3; box(g, '#e2463a', 0.03, 0.02, 0.03, 0.05, 0.05, 0.02); box(g, '#4fa2d8', 0.03, 0.02, 0.03, -0.06, 0.05, -0.01); },
  hourglass(g) { box(g, '#5a4636', 0.14, 0.02, 0.14, 0, 0.01, 0); box(g, '#5a4636', 0.14, 0.02, 0.14, 0, 0.27, 0); box(g, '#dff0f6', 0.1, 0.24, 0.1, 0, 0.14, 0, { transparent: true, opacity: 0.45 }); box(g, '#e0af68', 0.07, 0.06, 0.07, 0, 0.05, 0); },
  globe(g) {
    box(g, '#5a4636', 0.14, 0.02, 0.14, 0, 0.01, 0); box(g, '#c9a24a', 0.02, 0.1, 0.02, 0, 0.06, 0);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), mat('#3d7fc4')); s.position.y = 0.21; s.castShadow = true; g.add(s);
    box(g, '#4fa25a', 0.08, 0.06, 0.03, 0.03, 0.24, 0.08); box(g, '#4fa25a', 0.06, 0.05, 0.03, -0.06, 0.18, 0.07);
  },
  macbook(g) {
    box(g, '#c9ccd2', 0.34, 0.015, 0.24, 0, 0.008, 0.02);
    const lid = box(g, '#c9ccd2', 0.34, 0.22, 0.012, 0, 0.11, -0.1); lid.rotation.x = -0.2;
    box(g, '#2a6f97', 0.3, 0.18, 0.004, 0, 0.11, -0.092, { emissive: '#2a6f97', emissiveIntensity: 0.6 }).rotation.x = -0.2;
  },
  tumbler(g) { box(g, '#a9d8e8', 0.1, 0.2, 0.1, 0, 0.1, 0); box(g, '#2a2c33', 0.105, 0.03, 0.105, 0, 0.2, 0); box(g, '#f4f1ec', 0.015, 0.1, 0.015, 0.02, 0.26, 0); },
  headset(g) {
    box(g, '#2a2c33', 0.14, 0.02, 0.14, 0, 0.01, 0); box(g, '#2a2c33', 0.025, 0.3, 0.025, 0, 0.16, 0); box(g, '#2a2c33', 0.1, 0.02, 0.04, 0, 0.31, 0);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 16, Math.PI), mat('#e8e6e0')); band.position.y = 0.24; band.castShadow = true; g.add(band);
    for (const s of [1, -1]) box(g, '#e8e6e0', 0.05, 0.1, 0.08, 0.09 * s, 0.22, 0);
  },
  drip(g) { box(g, '#dff0f6', 0.12, 0.12, 0.12, 0, 0.06, 0, { transparent: true, opacity: 0.5 }); box(g, '#6b4026', 0.1, 0.05, 0.1, 0, 0.03, 0); box(g, '#f4f1ec', 0.14, 0.08, 0.14, 0, 0.16, 0); box(g, '#c9ccd2', 0.04, 0.12, 0.04, 0.13, 0.06, 0); box(g, '#c9ccd2', 0.12, 0.015, 0.015, 0.1, 0.12, 0).rotation.z = -0.5; },
  ipad(g) { const t = box(g, '#2a2c33', 0.24, 0.012, 0.32, 0, 0.006, 0.02); t.rotation.y = 0.2; box(g, '#3a5f8a', 0.21, 0.004, 0.29, 0, 0.014, 0.02, { emissive: '#3a5f8a', emissiveIntensity: 0.5 }).rotation.y = 0.2; box(g, '#f4f1ec', 0.012, 0.012, 0.18, 0.15, 0.008, 0.02); },
  mic(g) {
    box(g, '#2a2c33', 0.1, 0.03, 0.1, 0, 0.015, 0); const a1 = box(g, '#2a2c33', 0.02, 0.4, 0.02, 0, 0.2, 0); a1.rotation.x = -0.2;
    const a2 = box(g, '#2a2c33', 0.02, 0.02, 0.36, 0, 0.39, 0.2); a2.rotation.x = 0.25;
    box(g, '#1d1a18', 0.08, 0.16, 0.08, 0, 0.3, 0.38); box(g, '#5a5d66', 0.085, 0.1, 0.085, 0, 0.34, 0.38);
  },
  monstera(g) {
    box(g, '#f4f1ec', 0.22, 0.22, 0.22, 0, 0.11, 0); box(g, '#3b2a20', 0.19, 0.02, 0.19, 0, 0.22, 0);
    for (let i = 0; i < 6; i++) { const a = i * 1.05; const st = box(g, '#3f7a3c', 0.015, 0.4, 0.015, Math.sin(a) * 0.05, 0.4, Math.cos(a) * 0.05); st.rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4); const lf = box(g, i % 2 ? '#2f7040' : '#3f8a4a', 0.22, 0.02, 0.18, Math.sin(a) * 0.18, 0.58 + (i % 3) * 0.05, Math.cos(a) * 0.18); lf.rotation.set(Math.cos(a) * 0.5, a, -Math.sin(a) * 0.5); }
  },
  retro(g) { box(g, '#c8443a', 0.2, 0.34, 0.18, 0, 0.17, 0); box(g, '#1a1e2b', 0.15, 0.11, 0.01, 0, 0.25, 0.091, { emissive: '#3a6fc4', emissiveIntensity: 0.7 }); box(g, '#2a2c33', 0.18, 0.04, 0.06, 0, 0.14, 0.1).rotation.x = 0.4; box(g, '#f2c94c', 0.025, 0.04, 0.025, -0.04, 0.17, 0.11); box(g, '#4fa2d8', 0.025, 0.02, 0.025, 0.04, 0.165, 0.12); },
  lego(g) { box(g, '#c9ccd2', 0.36, 0.05, 0.12, 0, 0.12, 0); box(g, '#c9ccd2', 0.08, 0.06, 0.26, 0, 0.13, 0); box(g, '#3d6fc4', 0.06, 0.04, 0.06, 0, 0.17, 0.04); for (const s of [1, -1]) box(g, '#e2463a', 0.06, 0.03, 0.08, 0.17 * s, 0.13, -0.02); box(g, '#2a2c33', 0.02, 0.1, 0.02, 0, 0.05, 0); box(g, '#2a2c33', 0.12, 0.01, 0.1, 0, 0.005, 0); },
  aquarium(g, side, anim) {
    box(g, '#2a2c33', 0.34, 0.03, 0.2, 0, 0.015, 0); box(g, '#bfe6f2', 0.32, 0.22, 0.18, 0, 0.14, 0, { transparent: true, opacity: 0.35 });
    box(g, '#e0cfa0', 0.3, 0.03, 0.16, 0, 0.045, 0); box(g, '#3f8a4a', 0.02, 0.14, 0.02, -0.1, 0.12, 0); box(g, '#3f8a4a', 0.02, 0.1, 0.02, 0.11, 0.1, -0.03);
    const f = box(g, '#f08a3a', 0.05, 0.03, 0.02, 0, 0.15, 0.02); anim.push((t) => { f.position.x = Math.sin(t * 0.8) * 0.1; f.rotation.y = Math.cos(t * 0.8) > 0 ? 0 : Math.PI; f.position.y = 0.14 + Math.sin(t * 1.7) * 0.03; });
  },
  macmini(g) { box(g, '#d9dce1', 0.24, 0.06, 0.24, 0, 0.03, 0, { metalness: 0.5, roughness: 0.35 }); box(g, '#b9bcc2', 0.12, 0.002, 0.12, 0, 0.061, 0); box(g, '#f4f4f4', 0.008, 0.008, 0.004, 0.09, 0.025, 0.121, { emissive: '#ffffff', emissiveIntensity: 1 }); },
  espresso(g) {
    box(g, '#c9ccd2', 0.26, 0.34, 0.26, 0, 0.17, -0.02, { metalness: 0.6, roughness: 0.3 }); box(g, '#2a2c33', 0.26, 0.04, 0.24, 0, 0.36, -0.02);
    box(g, '#2a2c33', 0.2, 0.02, 0.1, 0, 0.03, 0.14); box(g, '#2a2c33', 0.06, 0.04, 0.12, 0, 0.2, 0.14); box(g, '#1a1e2b', 0.12, 0.05, 0.01, 0, 0.29, 0.111, { emissive: '#5ff0e0', emissiveIntensity: 0.5 });
    box(g, '#f4f1ec', 0.06, 0.06, 0.06, 0, 0.07, 0.15); box(g, '#c9ccd2', 0.02, 0.1, 0.02, 0.15, 0.22, 0.06);
  },
  fan(g, side, anim) {
    box(g, '#f4f1ec', 0.14, 0.03, 0.12, 0, 0.015, 0); box(g, '#f4f1ec', 0.03, 0.16, 0.03, 0, 0.1, 0);
    const head = new THREE.Group(); head.position.set(0, 0.22, 0.02); g.add(head);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 20), mat('#f4f1ec')); head.add(ring);
    const blades = new THREE.Group(); head.add(blades);
    for (let i = 0; i < 3; i++) { const b = box(blades, '#a9d8e8', 0.03, 0.09, 0.005, 0, 0.045, 0); b.position.set(Math.sin(i * 2.09) * 0.045, Math.cos(i * 2.09) * 0.045, 0); b.rotation.z = -i * 2.09; }
    box(head, '#f4f1ec', 0.03, 0.03, 0.03, 0, 0, 0.005);
    anim.push((t) => { blades.rotation.z = -t * 14; head.rotation.y = Math.sin(t * 0.5) * 0.6; });
  },
  humidifier(g, side, anim) {
    box(g, '#f4f1ec', 0.14, 0.2, 0.14, 0, 0.1, 0); box(g, '#a9d8e8', 0.141, 0.08, 0.141, 0, 0.08, 0, { transparent: true, opacity: 0.6 }); box(g, '#d9dce1', 0.06, 0.02, 0.06, 0, 0.21, 0);
    const puffs = [0, 1, 2].map((i) => box(g, '#ffffff', 0.05, 0.05, 0.05, 0, 0.25, 0, { transparent: true, opacity: 0.5 }));
    anim.push((t) => puffs.forEach((p, i) => { const k = (t * 0.5 + i / 3) % 1; p.position.y = 0.24 + k * 0.3; p.position.x = Math.sin(k * 5 + i) * 0.02; p.scale.setScalar(0.04 + k * 0.08); p.material.opacity = 0.5 * (1 - k); }));
  },
  keycap(g) { for (const [x, z, c, h] of [[0, 0, '#e2603d', 0.06], [0.07, 0.01, '#f2c94c', 0.06], [-0.07, 0.02, '#4fa2d8', 0.06], [0.01, -0.07, '#9ece6a', 0.06], [0.02, 0.0, '#f6f3ec', 0.06]]) box(g, c, 0.06, h, 0.06, x, h / 2 + (c === '#f6f3ec' ? 0.06 : 0), z); },
};
// 소품 자리 (책상 지역 좌표). 앞쪽 가운데는 키보드 · 마우스 자리
const SLOTS = [[-1.45, -0.42], [1.45, -0.42], [-2.55, -0.4], [2.55, -0.4], [-1.6, 0.42], [1.75, 0.42], [-2.6, 0.36], [2.62, 0.36]];

// ───────── 책상 ─────────
// 지금 짓는 층의 테마 (빈 책상 색 · 다리 색 · 네온 줄 · 초록 스탠드)
let CUR = null;
// 늘 같은 뼈대(다리 · 가림판)는 buildDesk, 사람마다 다른 모습(상판 색 · 모니터 · 키보드 · 의자 · 소품)은 dressDesk
function buildDesk(seat) {
  const g = new THREE.Group();
  g.position.set(seat.desk.x, 0, seat.desk.z);
  g.rotation.y = seat.desk.ry;
  const { W, D, H } = DESK;
  const leg = CUR?.desk?.leg || '#2b2f38';
  box(g, leg, 0.05, H - 0.03, D - 0.08, W / 2 - 0.06, (H - 0.03) / 2, 0);
  box(g, leg, 0.05, H - 0.03, D - 0.08, -W / 2 + 0.06, (H - 0.03) / 2, 0);
  box(g, leg, W - 0.16, 0.36, 0.02, 0, 0.52, -D / 2 + 0.04);
  const c = document.createElement('canvas');
  c.width = SCR_W; c.height = SCR_H;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  seat.group = g;
  seat.anims = [];
  seat.screen = { canvas: c, ctx: c.getContext('2d'), tex, mesh: null, info: { state: 'empty' }, code: makeCode(seat.i) };
  seat.dressKey = null;
  dressDesk(seat, null);
  return g;
}

// 모니터 한 대: 받침 + 목 + 테두리 + 화면. w·h 는 화면 크기. silver: 맥 모니터(은색 받침, 얇은 테두리)
function monitor(parent, map, w, h, x, ry = 0, silver = false) {
  const m = new THREE.Group();
  m.position.set(x, DESK.H, -0.36);
  m.rotation.y = ry;
  parent.add(m);
  const cy = 0.22 + h / 2;
  let bezel;
  if (silver) {
    const al = { metalness: 0.6, roughness: 0.3 };
    box(m, '#d4d7dc', 0.3, 0.012, 0.24, 0, 0.006, 0.02, al);
    const leg = box(m, '#d4d7dc', 0.16, cy + 0.02, 0.02, 0, cy / 2, -0.07, al); leg.rotation.x = 0.18;
    box(m, '#d4d7dc', w + 0.04, h + 0.04, 0.03, 0, cy, -0.005, al);
    bezel = box(m, '#0a0a0c', w + 0.025, h + 0.025, 0.012, 0, cy, 0.016);
  } else {
    box(m, '#2a2c33', 0.34, 0.02, 0.22, 0, 0.01, 0.02);
    box(m, '#2a2c33', 0.07, cy - 0.05, 0.05, 0, (cy - 0.05) / 2, -0.02);
    bezel = box(m, '#16181e', w + 0.06, h + 0.06, 0.04, 0, cy, 0.02);
  }
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, toneMapped: false }));
  screen.position.set(0, cy, 0.042);
  m.add(screen);
  return { bezel, screen, top: cy + h / 2 + 0.03, cy, w, group: m };
}

// 둘째 화면(듀얼 · 세로 · 와이드 옆 칸): 터미널. 결과물 주소가 있으면 배포 줄에 보여요
function secondCanvas(seat, w, h) {
  const sc = seat.screen;
  if (!sc.c2 || sc.c2.width !== w || sc.c2.height !== h) {
    sc.c2 = document.createElement('canvas');
    sc.c2.width = w; sc.c2.height = h;
    sc.tex2?.dispose();
    sc.tex2 = new THREE.CanvasTexture(sc.c2);
    sc.tex2.colorSpace = THREE.SRGBColorSpace;
  }
  paintSecond(seat);
  return sc.tex2;
}
export function paintSecond(seat) {
  const sc = seat.screen;
  if (!sc.c2) return;
  const g = sc.c2.getContext('2d'), w = sc.c2.width, h = sc.c2.height, info = sc.info;
  g.fillStyle = '#0f1218'; g.fillRect(0, 0, w, h);
  if (info.state !== 'empty') {
    g.font = `500 ${w < 200 ? 13 : 17}px ${MONO}`; g.textAlign = 'left'; g.textBaseline = 'top';
    const lines = w < 200
      ? [['#7aa2f7', '▾ src'], ['#c0caf5', '  main.js'], ['#c0caf5', '  world.js'], ['#e0af68', '  data.js'], ['#7aa2f7', '▸ server'], ['#7aa2f7', '▸ public'], ['#5d6a86', '  README.md'], ['#5d6a86', '  package.json']]
      : [['#9ece6a', '$ npm run dev'], ['#7aa2f7', '▲ ready in 412ms'], ['#c0caf5', `  ➜ ${info.host || 'localhost:3000'}`], ['#5d6a86', ''], ['#9ece6a', '$ git push'], ['#e0af68', '✓ main → origin'], ['#9ece6a', '$ npm run deploy'], ['#7dcfff', `✓ ${info.title || 'deployed'}`], ['#5d6a86', ''], ['#9ece6a', '$ _']];
    const lh = w < 200 ? 22 : 26;
    lines.forEach(([c, t], i) => { if (14 + (i + 1) * lh < h) { g.fillStyle = c; g.fillText(fitText(g, t, w - 20), 10, 14 + i * lh); } });
  }
  sc.tex2.needsUpdate = true;
}

// 빈 책상: 자리마다 조금씩 다른 기본 모습
function emptyDeck(i) {
  const r = rng(i * 7 + 3);
  const pool = ['plant', 'mug', 'books', 'lamp', 'duck', 'postit'];
  const it = [];
  while (it.length < 2) { const p = pool[(r() * pool.length) | 0]; if (!it.includes(p)) it.push(p); }
  const dk = CUR?.desk || {};
  const pick = (v, k) => (Array.isArray(v) ? v[k % v.length] : v);
  const island = Math.floor(i / 4);
  return { c: pick(dk.top, island) || 'oak', ch: pick(dk.chairs, i) || ['charcoal', 'wine', 'teal', 'navy', 'charcoal'][i % 5], mon: 'm', kb: 'basic', chair: dk.chair || 'basic', it: dk.items || it };
}

function keyboard(g, kind) {
  const H = DESK.H, z = 0.36;
  box(g, '#23252c', 1.0, 0.006, 0.42, 0.1, H + 0.028, z); // 장패드
  if (kind === 'mech') {
    box(g, '#2a2c33', 0.6, 0.04, 0.2, 0, H + 0.05, z);
    const r = rng(5);
    for (let row = 0; row < 4; row++) for (let k = 0; k < 12; k++) box(g, ['#f6f3ec', '#f6f3ec', '#e2603d', '#4fa2d8', '#f2c94c'][(r() * 5) | 0], 0.036, 0.022, 0.034, -0.25 + k * 0.045, H + 0.078, z - 0.065 + row * 0.044);
  } else if (kind === 'split') {
    for (const s of [1, -1]) { const h = box(g, '#3a3d45', 0.26, 0.03, 0.17, 0.17 * s, H + 0.045, z); h.rotation.y = 0.18 * s; const t = box(g, '#c9ccd2', 0.22, 0.012, 0.13, 0.17 * s, H + 0.065, z); t.rotation.y = 0.18 * s; }
  } else if (kind === 'hhkb') {
    box(g, '#e8e6e0', 0.46, 0.04, 0.16, 0, H + 0.05, z);
    box(g, '#c9c6be', 0.42, 0.014, 0.12, 0, H + 0.075, z); box(g, '#8a8d94', 0.09, 0.016, 0.03, -0.14, H + 0.078, z - 0.04);
  } else {
    box(g, '#2a2c33', 0.56, 0.025, 0.18, 0, H + 0.04, z);
    box(g, '#4a4e58', 0.52, 0.008, 0.14, 0, H + 0.055, z);
  }
  box(g, '#2a2c33', 0.07, 0.03, 0.11, 0.45, H + 0.045, z);
}

function chairOf(kind, cc) {
  const chair = new THREE.Group();
  box(chair, '#2a2c33', 0.06, 0.36, 0.06, 0, 0.24, 0);
  box(chair, '#2a2c33', 0.66, 0.04, 0.06, 0, 0.06, 0);
  box(chair, '#2a2c33', 0.06, 0.04, 0.66, 0, 0.06, 0);
  if (kind === 'gaming') {
    box(chair, cc, 0.58, 0.1, 0.54, 0, 0.45, 0);
    box(chair, cc, 0.58, 1.0, 0.1, 0, 1.0, 0.3);
    box(chair, '#1d1f24', 0.2, 1.0, 0.105, 0, 1.0, 0.3);
    box(chair, cc, 0.3, 0.12, 0.12, 0, 1.38, 0.24);
    for (const s of [1, -1]) { box(chair, '#1d1f24', 0.08, 0.12, 0.4, 0.31 * s, 0.6, 0.02); box(chair, cc, 0.07, 0.6, 0.11, 0.25 * s, 0.82, 0.29); }
  } else if (kind === 'mesh') {
    // 그물 등받이: 짙은 테두리 + 비치는 그물
    box(chair, '#1d1f24', 0.56, 0.08, 0.52, 0, 0.44, 0);
    box(chair, '#1d1f24', 0.04, 0.72, 0.05, 0.27, 0.86, 0.3); box(chair, '#1d1f24', 0.04, 0.72, 0.05, -0.27, 0.86, 0.3);
    box(chair, '#1d1f24', 0.58, 0.05, 0.06, 0, 1.22, 0.32); box(chair, '#1d1f24', 0.5, 0.05, 0.06, 0, 0.52, 0.28);
    box(chair, cc, 0.5, 0.66, 0.02, 0, 0.87, 0.3, { transparent: true, opacity: 0.55 });
    for (const s of [1, -1]) { box(chair, '#1d1f24', 0.05, 0.05, 0.36, 0.3 * s, 0.66, 0.02); box(chair, '#1d1f24', 0.04, 0.2, 0.04, 0.3 * s, 0.56, 0.12); }
    box(chair, '#8a8d94', 0.5, 0.03, 0.03, 0, 0.7, 0.33); // 허리 받침
  } else {
    box(chair, cc, 0.56, 0.08, 0.52, 0, 0.44, 0);
    box(chair, cc, 0.54, 0.66, 0.07, 0, 0.84, 0.28);
    for (const s of [1, -1]) box(chair, '#2a2c33', 0.05, 0.05, 0.36, 0.3 * s, 0.62, 0.02);
  }
  return chair;
}

// 의자에 두는 것: 방석 · 무릎담요
function chairItem(chair, id, kind) {
  const backZ = kind === 'gaming' ? 0.24 : 0.23;
  if (id === 'cushion') {
    box(chair, '#c8443a', 0.46, 0.05, 0.42, 0, 0.505, -0.02);
    box(chair, '#ff6a4a', 0.04, 0.012, 0.04, 0.18, 0.535, -0.18, { emissive: '#ff4a2a', emissiveIntensity: 1.5 });
  } else if (id === 'blanket') {
    // 등받이에 걸친 체크 담요
    box(chair, '#d9b45a', 0.48, 0.5, 0.03, 0, 0.82, backZ - 0.03);
    box(chair, '#d9b45a', 0.48, 0.03, 0.14, 0, 1.08, backZ + 0.03);
    box(chair, '#d9b45a', 0.48, 0.3, 0.03, 0, 0.94, backZ + 0.1);
    for (const y of [0.66, 0.8, 0.94]) box(chair, '#8a5a3a', 0.485, 0.025, 0.035, 0, y, backZ - 0.03);
    for (const x of [-0.12, 0.08]) box(chair, '#8a5a3a', 0.025, 0.5, 0.035, x, 0.82, backZ - 0.03);
  }
}

const findC = (list, id, def) => (typeof id === 'string' && id[0] === '#' ? id : (list.find((x) => x.id === id) || list.find((x) => x.id === def)).c);

// deck: { c 상판 색, ch 의자 색, mon 모니터, kb 키보드, chair 의자 종류, it 소품 목록 } · 없으면 빈 책상 모습
export function dressDesk(seat, deck) {
  const d = deck || emptyDeck(seat.i);
  const key = JSON.stringify(d);
  if (key === seat.dressKey) return false;
  seat.dressKey = key;
  if (seat.dress) { seat.dress.removeFromParent(); seat.dress.traverse((o) => { if (o.isMesh && o.geometry !== BOXG) o.geometry.dispose(); }); }
  seat.anims = [];
  const g = new THREE.Group();
  seat.dress = g;
  seat.group.add(g);
  const { W, D, H } = DESK;
  const top = box(g, findC(DESK_COLORS, d.c, 'oak'), W, 0.05, D, 0, H, 0);
  // 모니터
  const map = seat.screen.tex;
  const mons = [];
  let usesSecond = false;
  if (d.mon === 'l') mons.push(monitor(g, map, 1.2, 0.7, 0));
  else if (d.mon === 'studio') mons.push(monitor(g, map, 1.05, 0.6, 0, 0, true));
  else if (d.mon === 'w') {
    const m = monitor(g, map, 0.98, 0.575, 0.18);
    // 와이드: 왼쪽에 파일 트리 칸이 붙은 한 화면
    const wing = box(m.group, '#16181e', 0.42, 0.635, 0.04, -0.67, m.cy, 0.02);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.575), new THREE.MeshBasicMaterial({ map: secondCanvas(seat, 160, 256), toneMapped: false }));
    side.position.set(-0.67, m.cy, 0.042);
    m.group.add(side);
    usesSecond = true;
    mons.push(m, { bezel: wing, screen: side });
  } else if (d.mon === 'd') {
    mons.push(monitor(g, map, 0.88, 0.515, -0.5, 0.18));
    mons.push(monitor(g, secondCanvas(seat, SCR_W, SCR_H), 0.88, 0.515, 0.5, -0.18));
    usesSecond = true;
  } else if (d.mon === 'v') {
    mons.push(monitor(g, map, 0.88, 0.515, -0.3, 0.08));
    mons.push(monitor(g, secondCanvas(seat, SCR_H, SCR_W), 0.46, 0.79, 0.55, -0.2));
    usesSecond = true;
  } else mons.push(monitor(g, map, 0.88, 0.515, 0));
  if (!usesSecond) seat.screen.c2 = null;
  seat.screen.mesh = mons[0].screen;
  keyboard(g, d.kb);
  // 의자
  const kind = CHAIRS.some((c) => c.id === d.chair) ? d.chair : 'basic';
  const chair = chairOf(kind, findC(CHAIR_COLORS, d.ch, 'charcoal'));
  chair.position.set(0, 0, SIT);
  g.add(chair);
  seat.chair = chair;
  // 소품: 고른 순서대로 빈자리에. 모니터 · 의자 · 칸막이에 붙는 것은 따로
  let slot = 0;
  const m0 = mons[0];
  for (const id of d.it || []) {
    const def = DESK_ITEMS.find((x) => x.id === id);
    if (!def) continue;
    if (def.spot === 'chair') { chairItem(chair, id, kind); continue; }
    if (id === 'postit') {
      for (const [k, c] of ['#ffe57a', '#ff9fb2', '#9fe0c0'].entries()) {
        const p = box(m0.group, c, 0.09, 0.09, 0.004, m0.w / 2 - 0.06 - k * 0.1, m0.top - 0.1 - (k % 2) * 0.03, 0.045);
        p.rotation.z = (k - 1) * 0.12;
      }
      continue;
    }
    if (id === 'lightbar') {
      box(m0.group, '#2a2c33', 0.5, 0.03, 0.05, 0, m0.top + 0.02, 0.05);
      box(m0.group, '#fff4dc', 0.46, 0.006, 0.03, 0, m0.top + 0.004, 0.05, { emissive: '#ffe8b8', emissiveIntensity: 2 });
      continue;
    }
    if (id === 'webcam') {
      box(m0.group, '#1d1f24', 0.12, 0.04, 0.05, (m0.w > 0.9 ? -0.2 : -0.15), m0.top + 0.025, 0.03);
      box(m0.group, '#3a5f8a', 0.025, 0.025, 0.01, (m0.w > 0.9 ? -0.2 : -0.15), m0.top + 0.025, 0.056, { emissive: '#2a4f7a', emissiveIntensity: 0.6 });
      continue;
    }
    if (id === 'neon') {
      // 칸막이 위, 모니터 뒤에서 빛나는 네온
      const n = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: neonTex(), transparent: true, toneMapped: false, depthWrite: false }));
      n.position.set(0, 1.62, -D / 2 - 0.0);
      g.add(n);
      continue;
    }
    if (slot >= SLOTS.length || !ITEM[id]) continue;
    const [sx, sz] = SLOTS[slot++];
    const ig = new THREE.Group();
    ig.position.set(sx, H + 0.025, sz);
    ig.rotation.y = (sx > 0 ? -1 : 1) * 0.35;
    ig.scale.setScalar(1.6); // 넓어진 책상에서도 눈에 띄게
    ITEM[id](ig, sx > 0 ? 1 : -1, seat.anims);
    g.add(ig);
  }
  // 테마 장식: 네온 층은 책상 앞 모서리에 빛 줄, 도서관 층은 초록 갓 스탠드
  if (CUR?.desk?.strip) box(g, CUR.desk.strip, W - 0.04, 0.025, 0.02, 0, H - 0.01, D / 2 + 0.005, { emissive: CUR.desk.strip, emissiveIntensity: 2.4 });
  if (CUR?.desk?.banker) {
    const lg = new THREE.Group(); lg.position.set(-0.95, H + 0.025, -0.4); g.add(lg);
    box(lg, '#c9a24a', 0.2, 0.03, 0.14, 0, 0.015, 0); box(lg, '#c9a24a', 0.025, 0.3, 0.025, 0, 0.17, 0);
    box(lg, '#1f6a3a', 0.36, 0.1, 0.16, 0, 0.34, 0.04); box(lg, '#fff0c0', 0.32, 0.01, 0.12, 0, 0.285, 0.04, { emissive: '#ffe6a0', emissiveIntensity: 2 });
  }
  const clickables = [top, ...mons.flatMap((m) => [m.bezel, m.screen]), ...chair.children];
  for (const m of clickables) m.userData.seat = seat.i;
  seat.clickables = clickables;
  g.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; } });
  return true;
}

let _neon;
function neonTex() {
  if (_neon) return _neon;
  _neon = canvasTex(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = `700 64px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ff4fd8'; g.shadowBlur = 24; g.fillStyle = '#ff7ae0';
    g.fillText('Hello, World', w / 2, h / 2);
    g.shadowBlur = 0; g.fillStyle = '#ffe6fa'; g.fillText('Hello, World', w / 2, h / 2);
  });
  return _neon;
}

// ───────── 사무실 테마 (층마다 하나) ─────────
// 한눈에 다르게: 바닥 · 벽 · 천장, 책상 색, 조명 색과 시간, 큰 장식(sig)이 모두 달라요
// light: hemi 하늘·땅 색과 세기, sun 햇빛, exp 노출, fog 안개 · hour 창밖 시간 · desk 빈 책상 모습
export const THEMES = [
  { id: 'loft', name: '브루클린 로프트', cap: '사방 벽돌, 검은 철골, 에디슨 전구', hour: 21,
    floor: ['wood', '#8a5a36'], wall: 'brick', ceil: '#2a2522', view: 'city', lamp: '#ffb870', part: '#3a2a20', sofa: '#8a4a2a', rug: ['#6a3a24', '#7a4a2e'], bg: '#120d0a', sign: '#ff9a4a',
    light: { sky: '#ffd2a0', ground: '#5a3a24', hemi: 1.05, sun: 1.1, sunC: '#ffc890', exp: 1.1 },
    desk: { top: 'walnut', leg: '#151515', chairs: ['#5a3a24', '#3a2a20', '#7a4a2a'] }, sig: ['steel', 'edison', 'duct'] },
  { id: 'white', name: '화이트 미니멀', cap: '온통 하얀 바닥 · 책상 · 의자, 대낮 햇살', hour: 13,
    floor: ['tile', '#f4f4f2', '#ebebe8'], wall: '#fbfbfa', ceil: '#ffffff', view: 'city', lamp: '#ffffff', part: '#ffffff', sofa: '#e6e3dc', rug: ['#dedbd4', '#ecebe6'], bg: '#f2f2f0', sign: '#9aa0a8',
    light: { sky: '#ffffff', ground: '#d8d6d0', hemi: 1.7, sun: 2.0, sunC: '#ffffff', exp: 1.18 },
    desk: { top: 'white', leg: '#e8e8e6', chairs: ['#f2f2f0', '#e0ded8'] }, sig: ['skylight', 'bigplants'] },
  { id: 'neon', name: '사이버 네온', cap: '검은 바닥에 빛나는 격자, 분홍 · 하늘 네온, 비 오는 도시', hour: 23,
    floor: ['grid', '#0b0b12'], wall: '#0e0e16', ceil: '#08080d', view: 'cyber', lamp: '#d04fff', part: '#141428', sofa: '#3a1a5a', rug: ['#1a1030', '#26184a'], bg: '#05040a', sign: '#ff4fd8',
    light: { sky: '#8a5aff', ground: '#200a30', hemi: 0.55, sun: 0.35, sunC: '#a080ff', exp: 1.1, fog: ['#1a0a2a', 14, 46] },
    desk: { top: 'black', leg: '#0a0a10', chairs: ['#1a1a2a'], strip: '#ff3fd0' }, sig: ['neontubes', 'holo'] },
  { id: 'forest', name: '숲속 온실', cap: '잔디 바닥, 유리 온실 지붕, 실내 나무', hour: 11,
    floor: ['grass', '#5f8f45'], wall: '#e6efe0', ceil: 'glass', view: 'forest', lamp: '#fff4d8', part: '#8a6a4a', sofa: '#4a6a3a', rug: ['#c9b48a', '#d8c69c'], bg: '#9fc8e8', sign: '#4fa25a',
    light: { sky: '#e8f6ff', ground: '#4a6a30', hemi: 1.5, sun: 2.2, sunC: '#fff2d0', exp: 1.08 },
    desk: { top: 'oak', leg: '#5a4030', chairs: ['#3f7a4a', '#6a8a3a', '#2f6a5a'] }, sig: ['trees', 'vines'] },
  { id: 'nordic', name: '북유럽 파스텔', cap: '섬마다 다른 파스텔 책상, 동그란 조명, 바다 창', hour: 15,
    floor: ['wood', '#efe2c8'], wall: '#f7ece6', ceil: '#fbf6f0', view: 'ocean', lamp: '#fff2dc', part: '#ffffff', sofa: '#9cc3d5', rug: ['#f2c4cc', '#f8dadf'], bg: '#e8f0f4', sign: '#e58fa6',
    light: { sky: '#fff6f0', ground: '#e0c8c0', hemi: 1.55, sun: 1.6, sunC: '#fff0e0', exp: 1.12 },
    desk: { top: ['pink', 'mint', 'sky', '#f6e3a0', 'pink'], leg: '#ffffff', chairs: ['#f2c4cc', '#a9d8c6', '#b8d0ea', '#f6e3a0'] }, sig: ['globes', 'roundrugs'] },
  { id: 'hanok', name: '한옥 대청마루', cap: '빨간 기둥, 서까래 지붕, 창살 벽, 청사초롱', hour: 21,
    floor: ['maru', '#a0703f'], wall: 'lattice', ceil: '#3a2616', view: 'mountain', lamp: '#ffc070', part: '#5a3a22', sofa: '#8a2a22', rug: ['#a8302a', '#c24a3a'], bg: '#0c0a10', sign: '#e9c46a',
    light: { sky: '#ffd8a0', ground: '#3a2210', hemi: 0.8, sun: 0.7, sunC: '#ffd090', exp: 1.02 },
    desk: { top: 'walnut', leg: '#3a2414', chairs: ['#8a2a22', '#2a4a8a'] }, sig: ['pillars', 'rafters', 'chorong'] },
  { id: 'space', name: '우주정거장', cap: '갈비뼈 같은 둥근 천장, 경고 줄무늬, 거대한 행성', hour: 0,
    floor: ['metal', '#5a606a'], wall: '#c8ccd2', ceil: '#2a2e36', view: 'space', lamp: '#9fe0ff', part: '#e8eaee', sofa: '#e8eaee', rug: ['#1f2a44', '#26345a'], bg: '#02030a', sign: '#5fd0ff',
    light: { sky: '#bfe6ff', ground: '#202838', hemi: 0.95, sun: 0.9, sunC: '#d0f0ff', exp: 1.05 },
    desk: { top: 'white', leg: '#9aa0aa', chairs: ['#f2f4f6'], strip: '#3fd0ff' }, sig: ['ribs', 'hazard'] },
  { id: 'cafe', name: '루프탑 카페', cap: '지붕 없는 옥상, 노을 하늘, 줄 전구, 파라솔', hour: 18,
    floor: ['deck', '#9a6a44'], wall: 'brick', ceil: 'none', view: 'dusk', lamp: '#ffc070', part: '#5a3a28', sofa: '#3f6a4a', rug: ['#c26a4a', '#d98a5a'], bg: '#4a3a6a', sign: '#ffb35c',
    light: { sky: '#ffb890', ground: '#4a2a3a', hemi: 1.0, sun: 1.2, sunC: '#ff9a6a', exp: 1.05 },
    desk: { top: 'oak', leg: '#2a2a2a', chairs: ['#3f6a4a', '#c26a4a', '#e2c070'] }, sig: ['festoon', 'parasols', 'rail'] },
  { id: 'library', name: '서재 도서관', cap: '사방 책장, 초록 갓 스탠드, 샹들리에, 빨간 카펫', hour: 22,
    floor: ['carpet', '#6a1f22'], wall: 'books', ceil: '#2a1a12', view: 'city', lamp: '#ffd59a', part: '#3a2416', sofa: '#5a2a18', rug: ['#2a4a32', '#3a5a42'], bg: '#0a0806', sign: '#e0af68',
    light: { sky: '#ffdcaa', ground: '#3a1810', hemi: 0.7, sun: 0.6, sunC: '#ffd8a0', exp: 1.0 },
    desk: { top: 'walnut', leg: '#2a1a10', chairs: ['#6a3a20', '#4a2a18'], banker: true }, sig: ['chandeliers', 'ladders'] },
  { id: 'beach', name: '바닷가 오피스', cap: '모래 바닥, 야자수, 서핑보드, 파라솔, 쨍한 바다', hour: 13,
    floor: ['sand', '#e8d5a8'], wall: '#ffffff', ceil: '#f4efe4', view: 'ocean', lamp: '#fff8e8', part: '#6fc0d8', sofa: '#ffffff', rug: ['#3fa8c8', '#7cc8dc'], bg: '#bfe6f6', sign: '#2a9ac8',
    light: { sky: '#ffffff', ground: '#e8d5a8', hemi: 1.6, sun: 2.2, sunC: '#fffaf0', exp: 1.12 },
    desk: { top: 'white', leg: '#6fc0d8', chairs: ['#3fa8c8', '#ffffff', '#f2c94c'] }, sig: ['palms', 'surf', 'parasols'] },
];
export const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

function floorTex(kind, c1, c2) {
  const base = new THREE.Color(c1);
  const rgb = (v, c = base) => `rgb(${Math.min(255, c.r * 255 * v) | 0}, ${Math.min(255, c.g * 255 * v) | 0}, ${Math.min(255, c.b * 255 * v) | 0})`;
  const r = rng(7);
  if (kind === 'wood' || kind === 'deck' || kind === 'maru') return canvasTex(1024, 1024, (g, w, h) => {
    const rows = kind === 'deck' ? 8 : kind === 'maru' ? 6 : 10, rh = h / rows;
    for (let y = 0; y < rows; y++) {
      let x = -r() * 300;
      while (x < w) {
        const len = kind === 'deck' ? 1024 : kind === 'maru' ? 340 : 260 + r() * 340;
        g.fillStyle = rgb(0.82 + r() * 0.26);
        g.fillRect(x, y * rh, len, rh);
        g.strokeStyle = 'rgba(60, 35, 20, 0.14)'; g.lineWidth = 2;
        for (let k = 0; k < 5; k++) { g.beginPath(); const yy = y * rh + 8 + r() * (rh - 16); g.moveTo(x, yy); g.bezierCurveTo(x + len * 0.3, yy + (r() - 0.5) * 12, x + len * 0.6, yy + (r() - 0.5) * 12, x + len, yy); g.stroke(); }
        g.fillStyle = 'rgba(30, 18, 10, 0.5)'; g.fillRect(x, y * rh, kind === 'maru' ? 8 : 3, rh);
        x += len;
      }
      g.fillStyle = 'rgba(30, 18, 10, 0.55)'; g.fillRect(0, y * rh, w, kind === 'deck' ? 10 : kind === 'maru' ? 8 : 3);
    }
  }, kind === 'maru' ? [8, 5] : [7, 5]);
  if (kind === 'tile' || kind === 'metal') return canvasTex(512, 512, (g, w, h) => {
    const b2 = new THREE.Color(c2 || c1), n = 4, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = rgb(0.95 + r() * 0.08, (x + y) % 2 ? b2 : base); g.fillRect(x * s, y * s, s, s); }
    g.strokeStyle = kind === 'metal' ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.08)'; g.lineWidth = kind === 'metal' ? 6 : 3;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
    if (kind === 'metal') { g.fillStyle = 'rgba(255,255,255,0.25)'; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (const [dx, dy] of [[10, 10], [s - 14, 10], [10, s - 14], [s - 14, s - 14]]) g.fillRect(x * s + dx, y * s + dy, 4, 4); }
  }, kind === 'metal' ? [11, 6] : [11, 6]);
  if (kind === 'grid') return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = c1; g.fillRect(0, 0, w, h);
    g.shadowBlur = 12; g.lineWidth = 4;
    g.shadowColor = '#3fd8ff'; g.strokeStyle = '#3fd8ff';
    g.beginPath(); g.moveTo(0, 2); g.lineTo(w, 2); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    g.shadowColor = '#ff3fd0'; g.strokeStyle = '#ff3fd0';
    g.beginPath(); g.moveTo(2, 0); g.lineTo(2, h); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  }, [11, 6]);
  if (kind === 'grass' || kind === 'sand') return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = rgb(1); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14000; i++) { g.fillStyle = rgb(kind === 'grass' ? 0.7 + r() * 0.6 : 0.88 + r() * 0.2); g.fillRect(r() * w, r() * h, kind === 'grass' ? 2 : 2, kind === 'grass' ? 5 : 2); }
    if (kind === 'sand') { g.strokeStyle = 'rgba(160, 130, 80, 0.18)'; g.lineWidth = 3; for (let i = 0; i < 9; i++) { g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 20, w * 0.6, y - 20, w, y); g.stroke(); } }
  }, [9, 5]);
  // carpet: 무늬 있는 카펫
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = rgb(1); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { g.fillStyle = rgb(0.85 + r() * 0.3); g.fillRect(r() * w, r() * h, 2, 2); }
    g.strokeStyle = 'rgba(220, 170, 90, 0.35)'; g.lineWidth = 6;
    g.strokeRect(30, 30, w - 60, h - 60);
    g.beginPath(); g.moveTo(w / 2, 60); g.lineTo(w - 60, h / 2); g.lineTo(w / 2, h - 60); g.lineTo(60, h / 2); g.closePath(); g.stroke();
  }, [9, 5]);
}

// 창밖 그림: city 도시 · dusk 노을 도시 · cyber 비 오는 네온 도시 · ocean 바다 · forest 숲 · mountain 산 · space 우주
export function paintView(g, w, h, hour, view) {
  if (view === 'city' || view === 'dusk') return paintSkyline(g, w, h, view === 'dusk' ? 18 : hour);
  const night = view === 'space' || view === 'cyber' || hour < 6 || hour >= 19;
  const r = rng(17);
  const sky = g.createLinearGradient(0, 0, 0, h);
  if (view === 'space') { sky.addColorStop(0, '#020308'); sky.addColorStop(1, '#0c1026'); }
  else if (view === 'cyber') { sky.addColorStop(0, '#0a0418'); sky.addColorStop(0.7, '#3a0f4a'); sky.addColorStop(1, '#6a1a5a'); }
  else if (night) { sky.addColorStop(0, '#070b1c'); sky.addColorStop(1, '#25305e'); }
  else { sky.addColorStop(0, '#5aa8ec'); sky.addColorStop(1, '#d6ecfa'); }
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  if (view === 'cyber') {
    let x = 0;
    while (x < w) {
      const bw = 60 + r() * 120, bh = h * (0.35 + r() * 0.55), top = h - bh;
      g.fillStyle = '#0a0612'; g.fillRect(x, top, bw - 4, bh);
      for (let k = 0; k < 3; k++) if (r() < 0.7) { const c = ['#ff3fd0', '#3fd8ff', '#ffe03f', '#7a5aff'][(r() * 4) | 0]; g.shadowColor = c; g.shadowBlur = 18; g.fillStyle = c; const vw = r() < 0.5; g.fillRect(x + 8 + r() * (bw - 30), top + 20 + r() * bh * 0.5, vw ? 10 : 40, vw ? 50 : 12); g.shadowBlur = 0; }
      for (let yy = top + 10; yy < h; yy += 14) for (let xx = x + 6; xx < x + bw - 10; xx += 11) if (r() < 0.25) { g.fillStyle = r() < 0.5 ? 'rgba(255, 80, 210, 0.7)' : 'rgba(80, 220, 255, 0.7)'; g.fillRect(xx, yy, 5, 6); }
      x += bw;
    }
    g.strokeStyle = 'rgba(180, 200, 255, 0.25)'; g.lineWidth = 1.5;
    for (let i = 0; i < 500; i++) { const x0 = r() * w, y0 = r() * h; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 - 6, y0 + 26); g.stroke(); }
    return;
  }
  if (night) for (let i = 0; i < (view === 'space' ? 700 : 160); i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; const s = r() < 0.05 ? 3 : 1.6; g.fillRect(r() * w, r() * h * (view === 'space' ? 1 : 0.5), s, s); }
  if (view === 'space') {
    const neb = g.createRadialGradient(w * 0.25, h * 0.4, 10, w * 0.25, h * 0.4, w * 0.3);
    neb.addColorStop(0, 'rgba(180, 90, 230, 0.45)'); neb.addColorStop(1, 'rgba(180, 90, 230, 0)');
    g.fillStyle = neb; g.fillRect(0, 0, w, h);
    const px = w * 0.62, py = h * 0.95, pr = h * 0.85;
    const pl = g.createRadialGradient(px - pr * 0.3, py - pr * 0.4, 20, px, py, pr);
    pl.addColorStop(0, '#a8e0ff'); pl.addColorStop(0.5, '#3a7ac8'); pl.addColorStop(1, '#0c1a3a');
    g.fillStyle = pl; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(230, 220, 255, 0.55)'; g.lineWidth = 10; g.beginPath(); g.ellipse(px, py - pr * 0.25, pr * 1.6, pr * 0.22, -0.08, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
    g.fillStyle = '#d8d8d0'; g.beginPath(); g.arc(w * 0.12, h * 0.22, 26, 0, Math.PI * 2); g.fill();
    return;
  }
  if (night) { g.fillStyle = '#fbf2d0'; g.beginPath(); g.arc(w * 0.78, h * 0.2, 34, 0, Math.PI * 2); g.fill(); }
  else { g.fillStyle = 'rgba(255, 255, 255, 0.9)'; for (let i = 0; i < 8; i++) { const cx = r() * w, cy = h * (0.1 + r() * 0.25); for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx + k * 26, cy + (k % 2) * 8, 22 + r() * 10, 0, Math.PI * 2); g.fill(); } } }
  if (view === 'ocean') {
    const hz = h * 0.55;
    const sea = g.createLinearGradient(0, hz, 0, h);
    sea.addColorStop(0, night ? '#13204a' : '#1f8fd0'); sea.addColorStop(1, night ? '#0a1230' : '#3fc8d8');
    g.fillStyle = sea; g.fillRect(0, hz, w, h - hz);
    g.strokeStyle = night ? 'rgba(200, 210, 255, 0.25)' : 'rgba(255,255,255,0.7)'; g.lineWidth = 3;
    for (let i = 0; i < 90; i++) { const y = hz + 8 + r() * (h - hz); const x = r() * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + r() * 50, y); g.stroke(); }
    g.fillStyle = night ? '#1a2238' : '#ffffff'; g.beginPath(); g.moveTo(w * 0.2, hz - 4); g.lineTo(w * 0.2 + 70, hz - 4); g.lineTo(w * 0.2 + 58, hz + 8); g.lineTo(w * 0.2 + 10, hz + 8); g.fill();
    g.fillRect(w * 0.2 + 32, hz - 60, 4, 56); g.beginPath(); g.moveTo(w * 0.2 + 36, hz - 60); g.lineTo(w * 0.2 + 70, hz - 12); g.lineTo(w * 0.2 + 36, hz - 12); g.fill();
    return;
  }
  const layers = view === 'mountain'
    ? [[0.42, night ? '#1f2a40' : '#8aa6c0', 'm'], [0.56, night ? '#18222f' : '#5f8a6a', 'm'], [0.72, night ? '#0f1820' : '#3f6a4a', 't']]
    : [[0.45, night ? '#13201a' : '#5f9a5a', 't'], [0.6, night ? '#0e1a14' : '#3f7a40', 't'], [0.76, night ? '#08120c' : '#2a5a2e', 't']];
  for (const [base, col, kind] of layers) {
    g.fillStyle = col;
    g.beginPath(); g.moveTo(0, h);
    if (kind === 'm') { let x = 0; while (x <= w) { g.lineTo(x, h * base - r() * h * 0.28); x += 120 + r() * 160; } g.lineTo(w, h * base); }
    else { for (let x = 0; x <= w; x += 22) g.lineTo(x, h * base - ((x / 22) % 2) * (22 + r() * 50)); }
    g.lineTo(w, h); g.fill();
  }
}

// ───────── 테마 큰 장식 ─────────
function tree(parent, x, z, s, seed) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); parent.add(g);
  box(g, '#6a4a30', 0.35, 2.2, 0.35, 0, 1.1, 0);
  const r = rng(seed);
  for (let i = 0; i < 7; i++) box(g, ['#3f8a3a', '#4fa24a', '#2f7a34'][i % 3], 1.1 + r() * 0.6, 0.9 + r() * 0.5, 1.1 + r() * 0.6, (r() - 0.5) * 1.1, 2.4 + r() * 0.9, (r() - 0.5) * 1.1);
}
function palm(parent, x, z, s, seed) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); parent.add(g);
  for (let i = 0; i < 7; i++) box(g, i % 2 ? '#a8845a' : '#8a6a44', 0.24 - i * 0.012, 0.42, 0.24 - i * 0.012, Math.sin(i * 0.45 + seed) * 0.05 * i, 0.21 + i * 0.42, 0);
  const top = new THREE.Group(); top.position.set(Math.sin(6 * 0.45 + seed) * 0.3, 3.0, 0); g.add(top);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const arm = new THREE.Group(); arm.rotation.y = a; top.add(arm); const l = box(arm, i % 2 ? '#2f8a3a' : '#4fa24a', 1.4, 0.05, 0.34, 0.7, -0.2, 0); l.rotation.z = -0.45; }
  for (let i = 0; i < 3; i++) box(top, '#6a4a2a', 0.16, 0.16, 0.16, Math.cos(i * 2.1) * 0.14, -0.15, Math.sin(i * 2.1) * 0.14);
}
function parasol(parent, x, z, c1, c2) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  box(g, '#e8e2d6', 0.06, 2.6, 0.06, 0, 1.3, 0);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const seg = new THREE.Group(); seg.rotation.y = a; seg.position.y = 2.55; g.add(seg); const p = box(seg, i % 2 ? c1 : c2, 0.95, 0.04, 0.72, 0.5, -0.18, 0); p.rotation.z = -0.35; }
  box(g, '#ffffff', 0.9, 0.04, 0.9, 0, 0.75, 0); box(g, '#e8e2d6', 0.06, 0.75, 0.06, 0, 0.37, 0);
}

// ───────── 층 전체 ─────────
export function buildOffice(themeId) {
  const T = themeOf(themeId);
  CUR = T;
  const sig = new Set(T.sig || []);
  const world = new THREE.Group();
  const colliders = [];
  const clickables = [];
  const W = ROOM.maxX - ROOM.minX + 0.8, D = ROOM.maxZ - ROOM.minZ + 0.8, H = ROOM.H;
  const cx0 = (ROOM.minX + ROOM.maxX) / 2, cz0 = (ROOM.minZ + ROOM.maxZ) / 2;
  const glow = (c, k = 2) => ({ emissive: c, emissiveIntensity: k });

  // 바닥
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex(...T.floor), roughness: T.floor[0] === 'carpet' || T.floor[0] === 'grass' || T.floor[0] === 'sand' ? 0.95 : T.floor[0] === 'tile' ? 0.3 : 0.6 });
  if (T.floor[0] === 'grid') { floorMat.emissiveMap = floorMat.map; floorMat.emissive = new THREE.Color('#ffffff'); floorMat.emissiveIntensity = 0.8; }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx0, 0, cz0); floor.receiveShadow = true;
  world.add(floor);

  // 천장: 보통 판 · glass 유리 온실 · none 하늘(루프탑)
  if (T.ceil === 'glass') {
    const sk = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ color: '#bfe2f6', side: THREE.DoubleSide }));
    sk.rotation.x = Math.PI / 2; sk.position.set(cx0, H + 0.6, cz0); world.add(sk);
    for (let x = ROOM.minX; x <= ROOM.maxX + 0.5; x += 2.2) box(world, '#f4f4f0', 0.1, 0.16, D, x, H + 0.5, cz0);
    for (let z = ROOM.minZ; z <= ROOM.maxZ + 0.5; z += 2.2) box(world, '#f4f4f0', W, 0.16, 0.1, cx0, H + 0.5, z);
  } else if (T.ceil !== 'none') {
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(T.ceil, { side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(cx0, H, cz0); world.add(ceil);
  }

  // 벽: 남 · 동 · 서. 'brick' · 'lattice' · 'books' 는 무늬 벽, 나머지는 색 벽 (루프탑은 낮은 난간 벽)
  const wallH = T.ceil === 'none' ? 1.3 : H;
  const walls = [
    { x: cx0, z: ROOM.maxZ + 0.5, w: W, ry: 0 }, // 남
    { x: ROOM.maxX + 0.5, z: cz0, w: D, ry: Math.PI / 2 }, // 동
    { x: ROOM.minX - 0.5, z: cz0, w: D, ry: Math.PI / 2 }, // 서
  ];
  const brickT = T.wall === 'brick' ? brickTex() : null;
  for (const wl of walls) {
    if (T.wall === 'brick') {
      const t = brickT.clone(); t.needsUpdate = true; t.repeat.set(Math.round(wl.w / 4), Math.round(wallH / 1.6));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wl.w, wallH), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide }));
      m.position.set(wl.x, wallH / 2, wl.z); m.rotation.y = wl.ry; world.add(m);
    } else box(world, T.wall === 'lattice' ? '#f4ead2' : T.wall === 'books' ? '#3a2416' : T.wall, wl.ry ? 0.2 : wl.w, wallH, wl.ry ? wl.w : 0.2, wl.x, wallH / 2, wl.z);
  }
  if (T.wall === 'lattice') {
    // 창호지 창살: 남 · 동 · 서 벽 모두
    const lc = '#5a3a20';
    for (let x = ROOM.minX; x <= ROOM.maxX; x += 0.5) box(world, lc, 0.05, H - 0.4, 0.06, x, H / 2, ROOM.maxZ + 0.38);
    for (let z = ROOM.minZ; z <= ROOM.maxZ; z += 0.5) { box(world, lc, 0.06, H - 0.4, 0.05, ROOM.maxX + 0.38, H / 2, z); box(world, lc, 0.06, H - 0.4, 0.05, ROOM.minX - 0.38, H / 2, z); }
    for (let y = 0.4; y < H; y += 0.5) { box(world, lc, W, 0.05, 0.06, cx0, y, ROOM.maxZ + 0.38); box(world, lc, 0.06, 0.05, D, ROOM.maxX + 0.38, y, cz0); box(world, lc, 0.06, 0.05, D, ROOM.minX - 0.38, y, cz0); }
  }
  if (T.wall === 'books') {
    // 남 · 동 · 서 벽 가득 책장
    const r = rng(31);
    const cols = ['#c8443a', '#2f5d8a', '#e0af68', '#3f8a4a', '#f4f1ec', '#6b4a8a', '#2a2c33', '#8a3a2a'];
    const shelfWall = (along, len, fixed, side) => {
      for (let row = 0; row < 7; row++) {
        const y = 0.12 + row * 0.6;
        if (along === 'x') box(world, '#4a2a16', len, 0.05, 0.42, cx0, y, fixed - side * 0.2); else box(world, '#4a2a16', 0.42, 0.05, len, fixed - side * 0.2, y, cz0);
        let p = -len / 2;
        while (p < len / 2 - 0.1) {
          const bw = 0.07 + r() * 0.08, bh = 0.32 + r() * 0.2, c = cols[(r() * cols.length) | 0];
          if (along === 'x') box(world, c, bw, bh, 0.3, cx0 + p + bw / 2, y + 0.03 + bh / 2, fixed - side * 0.22); else box(world, c, 0.3, bh, bw, fixed - side * 0.22, y + 0.03 + bh / 2, cz0 + p + bw / 2);
          p += bw + 0.012;
        }
      }
    };
    shelfWall('x', W - 1, ROOM.maxZ + 0.38, 1);
    shelfWall('z', D - 1, ROOM.maxX + 0.38, 1);
    shelfWall('z', D - 1, ROOM.minX - 0.38, -1);
  }

  // 북쪽: 창 (루프탑은 유리 난간)
  const skyC = document.createElement('canvas');
  skyC.width = 2048; skyC.height = 512;
  const skyTex = new THREE.CanvasTexture(skyC);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(W + 10, (T.ceil === 'none' ? H + 6 : H + 2)), new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false, fog: false }));
  sky.position.set(cx0, (T.ceil === 'none' ? H / 2 + 2.4 : H / 2 + 0.6), ROOM.minZ - 2.6);
  world.add(sky);
  if (sig.has('rail')) {
    box(world, '#2a2a2a', W, 0.06, 0.08, cx0, 1.1, ROOM.minZ - 0.45);
    for (let x = ROOM.minX; x <= ROOM.maxX; x += 1.6) box(world, '#2a2a2a', 0.06, 1.1, 0.06, x, 0.55, ROOM.minZ - 0.45);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.05), new THREE.MeshStandardMaterial({ color: '#cfe6f0', transparent: true, opacity: 0.18, depthWrite: false }));
    gl.position.set(cx0, 0.55, ROOM.minZ - 0.46); world.add(gl);
  } else {
    const frame = T.id === 'hanok' ? '#4a2a14' : ['white', 'nordic', 'beach', 'space'].includes(T.id) ? '#e8e8e6' : '#1a1a1e';
    box(world, frame, W, 0.5, 0.25, cx0, 0.25, ROOM.minZ - 0.45);
    box(world, frame, W, 0.3, 0.25, cx0, H - 0.15, ROOM.minZ - 0.45);
    for (let x = ROOM.minX - 0.4; x <= ROOM.maxX + 0.5; x += 3.2) box(world, frame, 0.12, H, 0.2, x, H / 2, ROOM.minZ - 0.45);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: '#9fc0d8', transparent: true, opacity: 0.06, roughness: 0.05, metalness: 0.2, depthWrite: false }));
    glass.position.set(cx0, H / 2, ROOM.minZ - 0.5);
    world.add(glass);
  }
  const paintSky = (hour) => { paintView(skyC.getContext('2d'), skyC.width, skyC.height, hour, T.view); skyTex.needsUpdate = true; };

  // 책상 섬
  const seats = seatLayout();
  for (const s of seats) world.add(buildDesk(s));
  const iw = DESK.W * 2 + 0.06, id = DESK.D * 2 + 0.04;
  ISLANDS.forEach(([cx, cz]) => {
    box(world, T.part, iw - 0.04, 0.5, 0.05, cx, DESK.H + 0.3, cz, T.id === 'neon' ? glow('#3fd8ff', 0.6) : undefined);
    box(world, T.desk.leg, iw, 0.04, 0.08, cx, DESK.H + 0.56, cz);
    if (sig.has('edison')) {
      for (let k = -5; k <= 5; k += 2) { box(world, '#111', 0.01, 1.4, 0.01, cx + k, H - 0.7, cz); box(world, '#ffcf80', 0.12, 0.16, 0.12, cx + k, H - 1.45, cz, glow('#ffb050', 3)); }
    } else if (sig.has('chorong')) {
      for (const k of [-4.5, -1.5, 1.5, 4.5]) { const lg = new THREE.Group(); lg.position.set(cx + k, H - 1.5, cz); world.add(lg); box(lg, '#111', 0.01, 0.8, 0.01, 0, 0.75, 0); box(lg, '#c8302a', 0.36, 0.22, 0.36, 0, 0.12, 0, glow('#ff6040', 0.9)); box(lg, '#2a4ab0', 0.36, 0.22, 0.36, 0, -0.1, 0, glow('#4060ff', 0.7)); box(lg, '#c9a24a', 0.42, 0.04, 0.42, 0, 0.25, 0); }
    } else if (sig.has('globes')) {
      for (const k of [-4, 0, 4]) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), mat(['#f8d4dc', '#d8f0e6', '#f8eab8'][(k / 4 + 1) | 0], glow('#fff0d8', 0.9))); s.position.set(cx + k, H - 1.3, cz); world.add(s); box(world, '#bbb', 0.01, 0.9, 0.01, cx + k, H - 0.4, cz); }
    } else if (sig.has('chandeliers')) {
      // 샹들리에는 아래에서 따로
    } else if (sig.has('neontubes')) {
      box(world, '#ff3fd0', iw - 1, 0.06, 0.06, cx, H - 0.9, cz - 0.3, glow('#ff3fd0', 3)); box(world, '#3fd8ff', iw - 1, 0.06, 0.06, cx, H - 0.9, cz + 0.3, glow('#3fd8ff', 3));
    } else if (T.ceil !== 'none') {
      box(world, '#2a2c33', 0.02, 0.9, 0.02, cx - 4, H - 0.45, cz); box(world, '#2a2c33', 0.02, 0.9, 0.02, cx + 4, H - 0.45, cz);
      box(world, '#2a2c33', iw - 1.4, 0.08, 0.3, cx, H - 0.92, cz);
      box(world, '#fff1d6', iw - 1.5, 0.02, 0.24, cx, H - 0.97, cz, glow(T.lamp, 2));
    }
    const pl = new THREE.PointLight(T.lamp, 14, 14, 1.6);
    pl.position.set(cx, H - 1.2, cz);
    world.add(pl);
    colliders.push({ minX: cx - iw / 2, maxX: cx + iw / 2, minZ: cz - id / 2, maxZ: cz + id / 2 });
  });

  // ── 라운지 (남동쪽 구석) ──
  const LX = ROOM.maxX - 5.4, LZ = ROOM.maxZ - 3.6;
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4.4), mat(T.rug[0]));
  rug.rotation.x = -Math.PI / 2; rug.position.set(LX, 0.01, LZ); rug.receiveShadow = true; world.add(rug);
  const rug2 = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 4.0), mat(T.rug[1]));
  rug2.rotation.x = -Math.PI / 2; rug2.position.set(LX, 0.012, LZ); world.add(rug2);
  const cush = new THREE.Color(T.sofa).offsetHSL(0, 0, 0.08).getStyle();
  box(world, T.sofa, 4.2, 0.45, 1.0, LX, 0.3, ROOM.maxZ - 1.1); box(world, T.sofa, 4.2, 0.8, 0.3, LX, 0.7, ROOM.maxZ - 0.65);
  box(world, T.sofa, 1.0, 0.45, 2.6, ROOM.maxX - 1.2, 0.3, LZ + 0.8); box(world, T.sofa, 0.3, 0.8, 2.6, ROOM.maxX - 0.75, 0.7, LZ + 0.8);
  for (const dx of [-1.4, 0, 1.4]) box(world, cush, 1.2, 0.14, 0.86, LX + dx, 0.6, ROOM.maxZ - 1.15);
  colliders.push({ minX: LX - 2.2, maxX: ROOM.maxX, minZ: ROOM.maxZ - 1.7, maxZ: ROOM.maxZ }, { minX: ROOM.maxX - 1.8, maxX: ROOM.maxX, minZ: LZ - 0.6, maxZ: ROOM.maxZ });
  box(world, '#d8c3a0', 2.0, 0.06, 1.0, LX + 0.2, 0.42, LZ + 0.2); box(world, '#2b2f38', 1.9, 0.38, 0.9, LX + 0.2, 0.2, LZ + 0.2);
  box(world, '#c9ccd2', 0.5, 0.02, 0.34, LX - 0.2, 0.46, LZ + 0.2);
  const lid = box(world, '#c9ccd2', 0.5, 0.32, 0.02, LX - 0.2, 0.6, LZ + 0.04); lid.rotation.x = -0.25;
  colliders.push({ minX: LX - 0.9, maxX: LX + 1.3, minZ: LZ - 0.4, maxZ: LZ + 0.8 });
  // 커피 바 (동쪽 벽)
  const BZ = ROOM.minZ + 13.4;
  const bar = new THREE.Group();
  box(bar, '#2b2f38', 0.9, 1.0, 3.6, 0, 0.5, 0);
  box(bar, '#d8c3a0', 1.0, 0.06, 3.7, 0, 1.03, 0);
  const machine = box(bar, '#c23b3b', 0.6, 0.62, 0.55, 0.05, 1.37, -0.9);
  box(bar, '#1e2128', 0.3, 0.2, 0.05, 0.05, 1.45, -0.6);
  box(bar, '#e8e6e0', 0.5, 0.36, 0.4, 0.05, 1.24, 0.5);
  for (let i = 0; i < 4; i++) box(bar, ['#f4f1ec', '#2f5d8a', '#e0af68', '#9ece6a'][i], 0.1, 0.12, 0.1, -0.2, 1.12, 1.0 + i * 0.16);
  const fridge = new THREE.Group(); fridge.position.set(0, 0, 2.5); bar.add(fridge);
  box(fridge, '#e8ebee', 0.85, 2.0, 1.0, 0.04, 1.0, 0);
  box(fridge, '#1a1c22', 0.02, 1.7, 0.84, -0.4, 1.05, 0);
  box(fridge, '#f6fbff', 0.01, 1.62, 0.78, -0.405, 1.05, 0, glow('#e8f6ff', 0.9));
  const fridgeHit = box(fridge, '#cfe8f6', 0.03, 1.72, 0.86, -0.43, 1.05, 0, { transparent: true, opacity: 0.25 });
  const drinkC = [['#d9a43a', '#f2d27a'], ['#c8302a', '#f4f4f2'], ['#3fa85a', '#e8f6ec']];
  for (let row = 0; row < 4; row++) {
    box(fridge, '#c9ccd2', 0.02, 0.02, 0.8, -0.38, 0.38 + row * 0.42, 0);
    const [c, band] = drinkC[row % 3];
    for (let k = 0; k < 6; k++) { box(fridge, c, 0.08, 0.16, 0.08, -0.34, 0.48 + row * 0.42, -0.32 + k * 0.13); box(fridge, band, 0.081, 0.04, 0.081, -0.34, 0.5 + row * 0.42, -0.32 + k * 0.13); }
  }
  box(fridge, '#9aa0a8', 0.04, 0.6, 0.04, -0.45, 1.1, 0.36);
  const fsign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(512, 200, (g, w, h) => {
    g.fillStyle = '#12151c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#5fd3a8'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#5fd3a8'; g.font = `700 54px ${FONT}`; g.fillText('무제한 무료', w / 2, 62);
    g.fillStyle = '#f1eee8'; g.font = `500 34px ${FONT}`; g.fillText('무알콜 맥주 · 콜라 · 사이다', w / 2, 140);
  }), toneMapped: false }));
  fsign.rotation.y = -Math.PI / 2; fsign.position.set(-0.47, 2.35, 0); fridge.add(fsign);
  fridgeHit.userData.kind = 'fridge';
  bar.position.set(ROOM.maxX - 0.5, 0, BZ);
  world.add(bar);
  machine.userData.kind = 'coffee';
  clickables.push(machine);
  colliders.push({ minX: ROOM.maxX - 1.1, maxX: ROOM.maxX, minZ: BZ - 1.9, maxZ: BZ + 2.9 });
  const coffeeSpot = { x: ROOM.maxX - 1.9, z: BZ - 0.9 };
  clickables.push(fridgeHit);
  // 프린터 · 정수기 (남쪽 벽, 엘리베이터 양옆)
  const PX = -6.5, WX = 6.5, SZ = ROOM.maxZ - 0.5;
  const printer = new THREE.Group(); printer.position.set(PX, 0, SZ); world.add(printer);
  box(printer, '#3a3d45', 0.9, 0.7, 0.6, 0, 0.35, 0); box(printer, '#e8e8e6', 1.0, 0.45, 0.7, 0, 0.92, 0); box(printer, '#2a2c33', 0.7, 0.05, 0.4, 0, 1.17, 0);
  box(printer, '#f6f6f2', 0.42, 0.02, 0.3, 0, 0.82, -0.36); box(printer, '#5fd3a8', 0.06, 0.03, 0.03, 0.35, 1.06, -0.36, glow('#5fd3a8', 1.5));
  const cooler = new THREE.Group(); cooler.position.set(WX, 0, SZ); world.add(cooler);
  box(cooler, '#e8e8e6', 0.5, 1.1, 0.5, 0, 0.55, 0); box(cooler, '#7fc8e8', 0.36, 0.5, 0.36, 0, 1.36, 0, { transparent: true, opacity: 0.6 }); box(cooler, '#3a8ac8', 0.1, 0.06, 0.04, 0, 0.9, -0.27);
  box(cooler, '#f4f1ec', 0.06, 0.08, 0.06, 0.14, 0.82, -0.28);
  colliders.push({ minX: PX - 0.55, maxX: PX + 0.55, minZ: SZ - 0.4, maxZ: ROOM.maxZ }, { minX: WX - 0.3, maxX: WX + 0.3, minZ: SZ - 0.3, maxZ: ROOM.maxZ });
  for (const m of [...printer.children]) { m.userData.kind = 'printer'; clickables.push(m); }
  for (const m of [...cooler.children]) { m.userData.kind = 'water'; clickables.push(m); }
  // 걸어갔다 오는 동작의 자리 (ry: 그곳에서 바라보는 쪽)
  const spots = {
    coffee: { ...coffeeSpot, ry: Math.PI / 2 },
    fridge: { x: ROOM.maxX - 1.9, z: BZ + 2.5, ry: Math.PI / 2 },
    printer: { x: PX, z: SZ - 1.1, ry: 0 },
    water: { x: WX, z: SZ - 0.95, ry: 0 },
    board: { x: ROOM.minX + 1.3, z: ROOM.maxZ - 4, ry: -Math.PI / 2 },
    window: { x: -7.2, z: ROOM.minZ + 0.9, ry: Math.PI },
  };
  // 간판 (동쪽 벽)
  if (T.ceil !== 'none') {
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshBasicMaterial({ map: signTex('SOHO LAB', `${T.name}`, T.sign), transparent: true, toneMapped: false }));
    neon.rotation.y = -Math.PI / 2;
    neon.position.set(ROOM.maxX + 0.3, 2.9, ROOM.minZ + 6);
    world.add(neon);
  }

  // ── 엘리베이터 (남쪽 벽 가운데, 입구) ──
  const elev = new THREE.Group();
  box(elev, '#2a2d33', 2.4, 2.9, 0.12, 0, 1.45, 0);
  const doorL = box(elev, '#9aa0a8', 0.98, 2.5, 0.06, -0.5, 1.25, -0.08, { metalness: 0.7, roughness: 0.3 });
  const doorR = box(elev, '#9aa0a8', 0.98, 2.5, 0.06, 0.5, 1.25, -0.08, { metalness: 0.7, roughness: 0.3 });
  const floorC = document.createElement('canvas');
  floorC.width = 256; floorC.height = 96;
  const floorTx = new THREE.CanvasTexture(floorC);
  floorTx.colorSpace = THREE.SRGBColorSpace;
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshBasicMaterial({ map: floorTx, toneMapped: false }));
  disp.position.set(0, 2.72, -0.07); disp.rotation.y = Math.PI; elev.add(disp);
  box(elev, '#1e2128', 0.16, 0.3, 0.04, 1.45, 1.2, -0.02);
  const callBtn = box(elev, '#ffb35c', 0.07, 0.07, 0.03, 1.45, 1.25, -0.05, glow('#ffb35c', 1));
  elev.position.set(0, 0, ROOM.maxZ + 0.36);
  world.add(elev);
  for (const m of [doorL, doorR, callBtn, disp]) { m.userData.kind = 'elevator'; clickables.push(m); }
  const paintFloor = (n) => {
    const g = floorC.getContext('2d');
    g.fillStyle = '#0c0f16'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#ffb35c'; g.font = `700 64px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`${n}F`, 128, 52);
    floorTx.needsUpdate = true;
  };

  // ── 서쪽: 화이트보드 · 창가 바 테이블 ──
  const boardC = document.createElement('canvas');
  boardC.width = 1024; boardC.height = 512;
  const boardTex = new THREE.CanvasTexture(boardC);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const bx = ROOM.minX - (T.wall === 'books' ? -0.05 : 0.3);
  box(world, '#c9ccd2', 0.08, 1.7, 3.6, bx, 1.75, ROOM.maxZ - 4);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.55), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.4 }));
  board.rotation.y = Math.PI / 2; board.position.set(bx + 0.05, 1.75, ROOM.maxZ - 4); world.add(board);
  board.userData.kind = 'board';
  clickables.push(board);
  const paintBoard = (n, people) => {
    const g = boardC.getContext('2d');
    g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, 1024, 512);
    g.font = `700 58px ${FONT}`; g.fillStyle = '#2f5d8a'; g.textBaseline = 'top';
    g.fillText(`${n}층 소호랩 · ${T.name}`, 50, 36);
    g.font = `600 40px ${FONT}`; g.fillStyle = '#c8443a';
    g.fillText('규칙', 50, 140);
    g.font = `400 33px ${FONT}`;
    ['· 채팅 없이 조용히 각자 일해요', '· 하고 싶은 말은 머리 위 메모로', '· 비속어 · 나쁜 말은 메모에 쓸 수 없어요', `· 지금 ${people}명이 함께 일하는 중`].forEach((t, i) => { g.fillStyle = i === 2 ? '#c8443a' : '#2a2c33'; g.fillText(t, 70, 200 + i * 66); });
    boardTex.needsUpdate = true;
  };
  const wb = ROOM.minX + (T.wall === 'books' ? 0.75 : 0.4);
  box(world, '#d8c3a0', 0.7, 0.06, 5.0, wb, 1.05, -3);
  box(world, '#2b2f38', 0.06, 1.0, 0.06, wb, 0.52, -5.3); box(world, '#2b2f38', 0.06, 1.0, 0.06, wb, 0.52, -0.7);
  colliders.push({ minX: ROOM.minX, maxX: wb + 0.4, minZ: -5.6, maxZ: -0.4 });

  // ── 테마 큰 장식 ──
  const AISLE = [[-7.2, -4.75], [7.2, -4.75], [0, 3.6], [-17.5, 3.2], [17.6, -4.75], [-17.6, -4.75], [-10, 4.6], [9.5, 4.2]];
  const block = (x, z, r) => colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
  if (sig.has('steel')) {
    for (let x = ROOM.minX + 2; x < ROOM.maxX; x += 4) { box(world, '#1a1a1a', 0.25, 0.4, D, x, H - 0.2, cz0); box(world, '#1a1a1a', 0.06, 0.4, D, x, H - 0.2, cz0); }
    for (const z of [ROOM.minZ + 3, cz0, ROOM.maxZ - 3]) box(world, '#1a1a1a', W, 0.3, 0.2, cx0, H - 0.5, z);
    for (const [x, z] of AISLE.slice(0, 4)) { box(world, '#1a1a1a', 0.3, H, 0.3, x, H / 2, z); block(x, z, 0.3); }
  }
  if (sig.has('duct')) for (const z of [ROOM.minZ + 4, ROOM.maxZ - 6]) { const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, W, 16), mat('#8f949c', { metalness: 0.6, roughness: 0.4 })); duct.rotation.z = Math.PI / 2; duct.position.set(cx0, H - 0.9, z); world.add(duct); }
  if (sig.has('skylight')) for (const [cx, cz] of ISLANDS) box(world, '#ffffff', iw - 1, 0.04, id + 1.5, cx, H - 0.03, cz, glow('#ffffff', 1.4));
  if (sig.has('bigplants')) for (const [x, z] of AISLE.slice(0, 5)) { plant(world, x, z, 2.0, x * 3 + z); block(x, z, 0.7); }
  if (sig.has('trees')) for (const [i, [x, z]] of AISLE.entries()) { tree(world, x, z, 1.05, i + 3); block(x, z, 0.4); }
  if (sig.has('vines')) {
    const rr = rng(41);
    for (let i = 0; i < 40; i++) {
      const x = ROOM.minX + 1 + rr() * (W - 3), z = ROOM.minZ + 1 + rr() * (D - 3), len = 0.8 + rr() * 1.4;
      for (let k = 0; k < 3; k++) box(world, ['#3f8a4a', '#4fa25a', '#2f7040'][k], 0.08, len, 0.08, x + (k - 1) * 0.1, H + 0.4 - len / 2, z + (k % 2) * 0.08);
    }
  }
  if (sig.has('roundrugs')) for (const [cx, cz] of ISLANDS) { const c = new THREE.Mesh(new THREE.CircleGeometry(4.6, 40), mat(['#f8dade', '#d6efe6', '#dbe8f6', '#f8eec8', '#f8dade'][ISLANDS.findIndex((p) => p[0] === cx && p[1] === cz)])); c.rotation.x = -Math.PI / 2; c.scale.set(1.55, 0.72, 1); c.position.set(cx, 0.008, cz); world.add(c); }
  if (sig.has('pillars')) {
    for (const [x, z] of AISLE.slice(0, 6)) { box(world, '#a8302a', 0.42, H, 0.42, x, H / 2, z); box(world, '#3a2414', 0.6, 0.2, 0.6, x, 0.1, z); box(world, '#2a6a5a', 0.5, 0.3, 0.5, x, H - 0.4, z); block(x, z, 0.35); }
    for (let x = ROOM.minX; x <= ROOM.maxX; x += 5.5) box(world, '#a8302a', 0.4, H, 0.4, x, H / 2, ROOM.minZ - 0.2);
  }
  if (sig.has('rafters')) {
    for (let x = ROOM.minX; x < ROOM.maxX; x += 0.9) { const rf = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, D, 8), mat('#6a4a2a')); rf.rotation.x = Math.PI / 2; rf.position.set(x, H - 0.12, cz0); world.add(rf); }
    for (const z of [ROOM.minZ + 2, cz0, ROOM.maxZ - 2]) box(world, '#4a2a14', W, 0.36, 0.36, cx0, H - 0.4, z);
  }
  if (sig.has('neontubes')) {
    for (const [c, z] of [['#ff3fd0', ROOM.maxZ + 0.3], ['#3fd8ff', ROOM.minZ - 0.3]]) { box(world, c, W, 0.06, 0.06, cx0, H - 0.1, z, glow(c, 3)); box(world, c, W, 0.05, 0.05, cx0, 0.05, z, glow(c, 3)); }
    for (const x of [ROOM.minX - 0.3, ROOM.maxX + 0.3]) { box(world, '#ff3fd0', 0.06, 0.06, D, x, H - 0.1, cz0, glow('#ff3fd0', 3)); box(world, '#3fd8ff', 0.05, 0.05, D, x, 0.05, cz0, glow('#3fd8ff', 3)); }
    for (let x = ROOM.minX + 3; x < ROOM.maxX; x += 6) box(world, x % 12 < 6 ? '#ff3fd0' : '#3fd8ff', 0.05, H - 0.4, 0.05, x, H / 2, ROOM.maxZ + 0.3, glow(x % 12 < 6 ? '#ff3fd0' : '#3fd8ff', 3));
  }
  if (sig.has('holo')) for (const [x, z] of AISLE.slice(0, 3)) {
    box(world, '#1a1a2a', 0.8, 0.12, 0.8, x, 0.06, z, glow('#3fd8ff', 0.6));
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.7, 2.2, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#3fd8ff', transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.set(x, 1.2, z); world.add(cone);
    const cube = box(world, '#ff3fd0', 0.4, 0.4, 0.4, x, 1.6, z, glow('#ff3fd0', 2)); cube.rotation.set(0.6, 0.6, 0);
    block(x, z, 0.45);
  }
  if (sig.has('ribs')) {
    for (let z = ROOM.minZ; z <= ROOM.maxZ; z += 2.4) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(W / 2, 0.16, 6, 40, Math.PI), mat('#d8dce2', { metalness: 0.5, roughness: 0.4 }));
      rib.scale.set(1, (H - 0.2) / (W / 2), 1); rib.position.set(cx0, 0, z); world.add(rib);
      box(world, '#3fd0ff', W - 4, 0.04, 0.04, cx0, H - 0.08, z + 1.2, glow('#3fd0ff', 2.2));
    }
  }
  if (sig.has('hazard')) {
    const hz = canvasTex(256, 32, (g, w, h) => { g.fillStyle = '#f2c94c'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a'; for (let x = -32; x < w; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, h); g.fill(); } }, [20, 1]);
    for (const [x, z, w, d] of [[cx0, ROOM.maxZ - 0.2, W - 1, 0.4], [cx0, ROOM.minZ + 0.2, W - 1, 0.4], [ROOM.minX + 0.2, cz0, 0.4, D - 1], [ROOM.maxX - 0.2, cz0, 0.4, D - 1]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w > d ? w : d, 0.4), new THREE.MeshStandardMaterial({ map: hz, roughness: 0.6 }));
      m.rotation.x = -Math.PI / 2; if (d > w) m.rotation.z = Math.PI / 2; m.position.set(x, 0.01, z); world.add(m);
    }
  }
  if (sig.has('festoon')) {
    // 지붕 대신 지그재그로 걸친 줄 전구
    for (let k = 0; k < 7; k++) {
      const z0 = ROOM.minZ + 1 + k * 3.2, z1 = z0 + 3.2;
      const n = 22;
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = ROOM.minX + t * (ROOM.maxX - ROOM.minX), z = k % 2 ? z1 - t * 3.2 : z0 + t * 3.2;
        const y = 3.6 - Math.sin(t * Math.PI * 4) ** 2 * 0.5;
        box(world, '#ffd890', 0.12, 0.16, 0.12, x, y, z, glow('#ffb850', 3));
      }
    }
    for (const [x, z] of [[ROOM.minX, ROOM.minZ + 1], [ROOM.maxX, ROOM.minZ + 1], [ROOM.minX, ROOM.maxZ - 1], [ROOM.maxX, ROOM.maxZ - 1]]) box(world, '#2a2a2a', 0.12, 3.8, 0.12, x, 1.9, z);
  }
  if (sig.has('parasols')) {
    const spots = T.id === 'beach' ? [[-7.2, -4.75], [7.2, -4.75], [0, 3.6], [-17.5, 3.2], [17.6, -4.75]] : [[0, 3.6], [-17.5, 3.2], [-10, 4.6]];
    spots.forEach(([x, z], i) => { parasol(world, x, z, T.id === 'beach' ? ['#3fa8c8', '#f2c94c', '#ff6a5a'][i % 3] : '#c8443a', '#ffffff'); block(x, z, 0.5); });
  }
  if (sig.has('palms')) for (const [i, [x, z]] of [[-17.6, -4.75], [9.5, 4.2], [-10, 4.6], [ROOM.minX + 1.2, ROOM.minZ + 1.2], [ROOM.maxX - 1.2, ROOM.minZ + 1.2], [ROOM.minX + 1.2, ROOM.maxZ - 1.2]].entries()) { palm(world, x, z, 1.25, i); block(x, z, 0.35); }
  if (sig.has('surf')) for (let i = 0; i < 5; i++) { const sb = box(world, ['#ff6a5a', '#3fa8c8', '#f2c94c', '#ffffff', '#5fd3a8'][i], 0.56, 2.3, 0.1, ROOM.maxX - 0.3, 1.2, ROOM.minZ + 2 + i * 0.75, undefined); sb.rotation.set(0, Math.PI / 2, 0.12); box(world, '#2a2a2a', 0.04, 2.0, 0.11, ROOM.maxX - 0.24, 1.2, ROOM.minZ + 2 + i * 0.75).rotation.z = 0.12; }
  if (sig.has('chandeliers')) for (const [cx, cz] of ISLANDS) for (const k of [-3, 3]) {
    const cg = new THREE.Group(); cg.position.set(cx + k, H - 1.1, cz); world.add(cg);
    box(cg, '#c9a24a', 0.02, 0.9, 0.02, 0, 0.6, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 24), mat('#c9a24a')); ring.rotation.x = Math.PI / 2; cg.add(ring);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; box(cg, '#fff0c0', 0.06, 0.14, 0.06, Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5, glow('#ffd890', 3)); }
  }
  if (sig.has('ladders')) for (const z of [ROOM.minZ + 4, ROOM.maxZ - 8]) { const lg = new THREE.Group(); lg.position.set(ROOM.minX + 0.6, 0, z); lg.rotation.z = -0.18; world.add(lg); for (const s of [-0.25, 0.25]) box(lg, '#6a4a2a', 0.06, H, 0.06, 0, H / 2, s); for (let y = 0.4; y < H; y += 0.4) box(lg, '#6a4a2a', 0.05, 0.05, 0.5, 0, y, 0); }

  // 화분 (남쪽 벽 · 구석)
  for (const [i, [x, z, s]] of [[ROOM.minX + 1, ROOM.maxZ - 1, 1.2], [ROOM.maxX - 1, ROOM.minZ + 1, 1.3], [ROOM.minX + 1, ROOM.minZ + 1, 1.1], [3.4, ROOM.maxZ - 0.9, 1.0], [-3.4, ROOM.maxZ - 0.9, 1.0]].entries()) {
    if (sig.has('palms') && i < 3) continue;
    plant(world, x, z, s, i + 2);
    block(x, z, 0.35 * s);
  }

  // 통로 조명 (지붕이 있을 때)
  if (T.ceil !== 'none') for (const [x, z] of [[LX, LZ], [0, ROOM.maxZ - 2], [-12, ROOM.maxZ - 2], [-17, -3]]) box(world, '#fff1d6', 0.5, 0.04, 0.5, x, H - 0.05, z, glow(T.lamp, 1.5));
  const loungeLight = new THREE.PointLight(T.lamp, 10, 12, 1.6);
  loungeLight.position.set(LX, H - 0.6, LZ);
  world.add(loungeLight);

  world.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  const fixed = clickables;
  const allClickables = () => [...fixed, ...seats.flatMap((s) => s.clickables)];
  const tickDesks = (t) => { for (const s of seats) for (const f of s.anims) f(t); };
  const dispose = () => world.traverse((o) => { if (o.isMesh) { if (o.geometry !== BOXG) o.geometry.dispose(); if (o.material.map && o.material.map !== _neon) o.material.map.dispose(); } });
  const tour = [[0, 2.2], [ROOM.minX + 1.2, 2.2], [ROOM.minX + 1.2, ROOM.minZ + 1.3], [ROOM.maxX - 1.4, ROOM.minZ + 1.3], [ROOM.maxX - 1.4, -3.4], [15, -3.4], [15, 2.2]];
  return { theme: T, group: world, seats, colliders, coffeeSpot, spots, tour, allClickables, paintSky, paintFloor, paintBoard, tickDesks, dispose };
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

// ───────── 상점 미리보기: 아이템 하나만 따로 만든 모델 ─────────
let _demoScreen;
function demoScreen() {
  if (_demoScreen) return _demoScreen;
  _demoScreen = canvasTex(256, 150, (g, w, h) => {
    g.fillStyle = '#1a1e2b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#12151f'; g.fillRect(0, 0, w, 18);
    const r = rng(3);
    for (let i = 0; i < 9; i++) { let x = 16 + (i % 3) * 10; for (let k = 0; k < 3; k++) { const len = 12 + r() * 40; g.fillStyle = CODE_COLORS[(r() * CODE_COLORS.length) | 0]; g.fillRect(x, 26 + i * 13, len, 6); x += len + 6; } }
  });
  return _demoScreen;
}
export function itemModel(kind, id) {
  const g = new THREE.Group();
  if (kind === 'mon') {
    const t = demoScreen();
    if (id === 'l') monitor(g, t, 1.2, 0.7, 0);
    else if (id === 'studio') monitor(g, t, 1.05, 0.6, 0, 0, true);
    else if (id === 'd') { monitor(g, t, 0.88, 0.515, -0.5, 0.18); monitor(g, t, 0.88, 0.515, 0.5, -0.18); }
    else if (id === 'v') { monitor(g, t, 0.88, 0.515, -0.3, 0.08); monitor(g, t, 0.46, 0.79, 0.55, -0.2); }
    else if (id === 'w') { const m = monitor(g, t, 0.98, 0.575, 0.18); box(m.group, '#16181e', 0.42, 0.635, 0.04, -0.67, m.cy, 0.02); }
    else monitor(g, t, 0.88, 0.515, 0);
  } else if (kind === 'kb') keyboard(g, id);
  else if (kind === 'chair') g.add(chairOf(id, '#3d4452'));
  else if (id === 'blanket' || id === 'cushion') { const c = chairOf('basic', '#3d4452'); chairItem(c, id, 'basic'); g.add(c); }
  else if (id === 'postit' || id === 'lightbar' || id === 'webcam') {
    const m = monitor(g, demoScreen(), 0.88, 0.515, 0);
    if (id === 'postit') for (const [k, c] of ['#ffe57a', '#ff9fb2', '#9fe0c0'].entries()) box(m.group, c, 0.09, 0.09, 0.004, m.w / 2 - 0.06 - k * 0.1, m.top - 0.1 - (k % 2) * 0.03, 0.045).rotation.z = (k - 1) * 0.12;
    if (id === 'lightbar') { box(m.group, '#2a2c33', 0.5, 0.03, 0.05, 0, m.top + 0.02, 0.05); box(m.group, '#fff4dc', 0.46, 0.006, 0.03, 0, m.top + 0.004, 0.05, { emissive: '#ffe8b8', emissiveIntensity: 2 }); }
    if (id === 'webcam') { box(m.group, '#1d1f24', 0.12, 0.04, 0.05, -0.15, m.top + 0.025, 0.03); box(m.group, '#3a5f8a', 0.025, 0.025, 0.01, -0.15, m.top + 0.025, 0.056); }
  } else if (id === 'neon') { const n = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: neonTex(), transparent: true, toneMapped: false })); g.add(n); box(g, '#2a2c33', 1.2, 0.36, 0.02, 0, 0, -0.02); }
  else if (ITEM[id]) ITEM[id](g, 1, []);
  return g;
}
