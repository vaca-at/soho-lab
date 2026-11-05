// 캐릭터: 블록 사람 + 이름표 + 머리 위 메모 말풍선 + 동작(코딩·커피·기지개 …).
// 관절(hips, head, 팔다리) 회전값으로 자세를 만든다. 캐릭터는 +z 방향을 바라본다.
import * as THREE from 'three';
import { outfitOf, hairColorOf, bodyOf } from './data.js';
import { buildBlock, buildPet, bakeBlock, applyBody, box } from './blocky.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...opts }));
  return matCache.get(key);
}

// 캔 옆면 무늬 (상표 없이 소호랩 캔)
const canLabels = new Map();
function canLabel(id, c, band) {
  if (canLabels.has(id)) return canLabels.get(id);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = c; g.fillRect(0, 0, 256, 128);
  g.fillStyle = band;
  if (id === 'can_cola') { g.beginPath(); g.moveTo(0, 70); g.bezierCurveTo(60, 40, 120, 100, 256, 60); g.lineTo(256, 80); g.bezierCurveTo(120, 120, 60, 60, 0, 90); g.fill(); }
  else if (id === 'can_cider') { g.fillStyle = '#f2e85a'; g.beginPath(); g.moveTo(0, 96); g.lineTo(256, 50); g.lineTo(256, 66); g.lineTo(0, 112); g.fill(); g.fillStyle = '#fff'; for (const [x, y, r] of [[40, 30, 7], [80, 20, 4], [120, 34, 9], [170, 22, 5], [210, 36, 6]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } }
  else { g.fillRect(0, 18, 256, 6); g.fillRect(0, 104, 256, 6); }
  g.fillStyle = '#fff'; g.font = '900 34px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(id === 'can_grape' ? 'GRAPE' : id === 'can_cola' ? 'COLA' : 'CIDER', 128, id === 'can_cola' ? 34 : 66);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: t, metalness: 0.35, roughness: 0.35 });
  canLabels.set(id, m);
  return m;
}

// 에너지 드링크 캔 옆면: 바탕색 + 큰 번개 + ENERGY
function energyLabel(id, c, bolt) {
  if (canLabels.has(id)) return canLabels.get(id);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = c; g.fillRect(0, 0, 256, 128);
  g.fillStyle = bolt; g.beginPath(); g.moveTo(140, 8); g.lineTo(104, 70); g.lineTo(128, 70); g.lineTo(110, 122); g.lineTo(158, 52); g.lineTo(132, 52); g.lineTo(150, 8); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.font = '900 26px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ENERGY', 128, 112);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: t, metalness: 0.4, roughness: 0.35 });
  canLabels.set(id, m);
  return m;
}

export const FONT = '"IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
}

// web: 0 결과물 없음 · 1 웹 결과물 있음(🌐) · 2 방금 올림(🌐 NEW, 민트 테두리)
function nameTag(text, mine, web = 0) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.font = `600 38px ${FONT}`;
  const chipW = web === 2 ? 118 : web ? 50 : 0;
  const lead = chipW ? 10 + chipW + 12 : 24;   // 이름 앞 여백 (칩이 있으면 칩 + 틈)
  const tw = Math.min(500 - lead - 24, g.measureText(text).width);
  const w = lead + tw + 24;
  const x = (512 - w) / 2;
  g.fillStyle = mine ? 'rgba(14, 18, 28, 0.82)' : 'rgba(14, 18, 28, 0.58)';
  roundRect(g, x, 14, w, 64, 32);
  g.fill();
  if (web === 2) { g.save(); g.shadowColor = '#5fd3a8'; g.shadowBlur = 14; g.strokeStyle = '#5fd3a8'; g.lineWidth = 5; g.stroke(); g.restore(); }
  else if (mine) { g.strokeStyle = '#ffb35c'; g.lineWidth = 4; g.stroke(); }
  if (chipW) {
    // 이름 앞 작은 칩: 🌐 (방금 올렸으면 🌐 NEW, 민트 바탕)
    const cx = x + 10;
    g.fillStyle = web === 2 ? '#5fd3a8' : 'rgba(95, 211, 168, 0.22)';
    roundRect(g, cx, 22, chipW, 48, 24); g.fill();
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#fff';
    g.font = `30px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    g.fillText('🌐', cx + 9, 48);
    if (web === 2) { g.fillStyle = '#0d2a20'; g.font = `800 24px ${FONT}`; g.fillText('NEW', cx + 50, 48); }
    g.font = `600 38px ${FONT}`;
  }
  g.fillStyle = '#f6f3ec';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, x + lead + tw / 2, 47, tw);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(1.1, 0.206, 1);
  s.renderOrder = 10;
  return s;
}

// 말풍선: 흰 둥근 상자 + 아래 꼬리. 두 줄까지
const BUBBLE_W = 640, BUBBLE_H = 200;
function drawBubble(g, text) {
  g.clearRect(0, 0, BUBBLE_W, BUBBLE_H);
  g.font = `600 40px ${FONT}`;
  // 글자 단위로 줄 나누기 (한국어는 띄어쓰기 없이도 넘침)
  const maxW = BUBBLE_W - 90;
  const lines = [];
  let cur = '';
  for (const ch of [...text]) {
    if (g.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch.trimStart(); if (lines.length === 2) break; }
    else cur += ch;
  }
  if (lines.length < 2 && cur) lines.push(cur);
  else if (cur && lines.length === 2) lines[1] = lines[1].slice(0, -1) + '…';
  const w = Math.min(BUBBLE_W - 20, Math.max(...lines.map((l) => g.measureText(l).width)) + 64);
  const h = lines.length * 50 + 34;
  const x = (BUBBLE_W - w) / 2, y = BUBBLE_H - h - 30;
  g.fillStyle = 'rgba(255, 253, 247, 0.96)';
  g.strokeStyle = 'rgba(20, 24, 34, 0.18)';
  g.lineWidth = 3;
  roundRect(g, x, y, w, h, 28);
  g.fill(); g.stroke();
  g.beginPath();
  g.moveTo(BUBBLE_W / 2 - 18, y + h - 1);
  g.lineTo(BUBBLE_W / 2, y + h + 24);
  g.lineTo(BUBBLE_W / 2 + 18, y + h - 1);
  g.closePath();
  g.fill();
  g.fillStyle = '#1b2030';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, BUBBLE_W / 2, y + 17 + 25 + i * 50));
}

// 자세: y(몸 낮추기), hip(상체 숙임), head, 팔·다리 [x회전, z회전]
const STAND = { y: 0, hip: 0, head: 0, aL: [0, 0.08], aR: [0, -0.08], lL: [0, 0], lR: [0, 0] };
// 의자에 앉기: 다리를 앞으로 (블록 다리는 무릎이 없어 책상 밑으로 쭉 뻗는다)
const SIT = { y: -0.38, hip: 0.02, head: 0.05, aL: [-0.35, 0.05], aR: [-0.35, -0.05], lL: [-1.45, 0.12], lR: [-1.45, -0.12] };
const KEYS = ['y', 'hip', 'head'];
const LIMBS = ['aL', 'aR', 'lL', 'lR'];

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const bump = (t, a, b, c, d) => ease((t - a) / (b - a)) * (1 - ease((t - c) / (d - c)));

function mix(base, over, k) {
  const out = { ...base };
  for (const key of KEYS) if (over[key] !== undefined) out[key] = lerp(base[key], over[key], k);
  for (const key of LIMBS) if (over[key]) out[key] = [lerp(base[key][0], over[key][0], k), lerp(base[key][1], over[key][1], k)];
  return out;
}

function actionPose(action, t, base) {
  switch (action) {
    case 'type': {
      // 두 손을 키보드 위에, 손이 번갈아 톡톡
      const a = Math.sin(t * 17) * 0.05, b = Math.sin(t * 15 + 1.3) * 0.05;
      return mix(base, { aL: [-1.22 + a, 0.32], aR: [-1.22 + b, -0.32], head: 0.12 + Math.sin(t * 0.7) * 0.03 }, ease(t / 0.4));
    }
    case 'stretch':
      return mix(base, { aL: [-2.9, 0.25], aR: [-2.9, -0.25], hip: -0.12, head: -0.25 }, bump(t, 0, 0.6, 2.3, 3));
    case 'coffee': {
      // 오른손으로 머그를 입으로
      const sip = bump(t, 0.5, 1.1, 2.6, 3.2);
      return mix(base, { aR: [-0.9 - sip * 1.0, -0.15 - sip * 0.25], head: -0.12 * sip }, bump(t, 0, 0.4, 3.2, 3.6));
    }
    case 'think':
      return mix(base, { aR: [-2.15, -0.42], aL: [-0.9, 0.5], head: 0.18, hip: 0.1 }, bump(t, 0, 0.5, 5.4, 6));
    case 'clap': {
      const c = Math.abs(Math.sin(t * 11)) * 0.32;
      return mix(base, { aL: [-1.4, -0.1 - c], aR: [-1.4, 0.1 + c], head: -0.1 }, bump(t, 0, 0.25, 2.2, 2.6));
    }
    case 'wave':
      return mix(base, { aR: [-0.3, -2.5 + Math.sin(t * 12) * 0.35] }, bump(t, 0, 0.3, 1.8, 2.2));
    case 'pour': // 커피 머신 앞에서 두 손으로 컵을 받쳐요
      return mix(base, { aL: [-1.1, 0.25], aR: [-1.1 + Math.sin(t * 2) * 0.08, -0.25], head: 0.2 }, bump(t, 0, 0.4, 3.6, 4));
    case 'print': // 프린터 위 버튼을 톡톡, 종이를 집어요
      return mix(base, { aR: [-0.9 - Math.abs(Math.sin(t * 6)) * 0.25, -0.1], aL: [-0.6, 0.2], head: 0.3, hip: 0.12 }, bump(t, 0, 0.4, 3.6, 4));
    case 'can_grape': case 'can_cola': case 'can_cider':
    case 'pet_water': case 'pet_barley': case 'pet_gtea':
    case 'bt_bacchus': case 'can_enblue': case 'can_enblack':
    case 'drink': {
      const sip = bump(t, 0.5, 1.1, 2.6, 3.2);
      return mix(base, { aR: [-0.9 - sip * 1.0, -0.15 - sip * 0.25], head: -0.12 * sip }, bump(t, 0, 0.4, 3.2, 3.6));
    }
    case 'board': // 오른팔을 들어 보드에 쓱쓱
      return mix(base, { aR: [-2.3 + Math.sin(t * 5) * 0.15, -0.2 + Math.cos(t * 5) * 0.12], aL: [-0.2, 0.1], head: -0.15 }, bump(t, 0, 0.4, 4.6, 5));
    case 'window': // 창밖을 보며 크게 기지개
      return mix(base, { aL: [-2.8, 0.3], aR: [-2.8, -0.3], head: -0.3, hip: -0.1 }, bump(t, 0.3, 1.2, 3.8, 5));
  }
  return base;
}

export class Avatar {
  constructor(look, name, { mine = false } = {}) {
    this.group = new THREE.Group();
    this.mine = mine;
    this.pose = { ...STAND, aL: [...STAND.aL], aR: [...STAND.aR], lL: [0, 0], lR: [0, 0] };
    this.walkPhase = 0;
    this.speed = 0;
    this.seated = false;
    this.action = null;
    this.actionT = 0;
    this.fresh = true;
    this.memos = [];
    this.memoOn = true;
    this.memoT = Math.random() * 6; // 사람마다 말풍선 뜨는 때를 조금씩 엇갈리게
    this.memoIdx = (Math.random() * 10) | 0;
    this.pinned = 0;
    this.mode = 'auto'; // auto 돌아가며 · one 하나만 계속 · off 안 띄움
    this.oneIdx = 0;
    this.tagY = 1.82;
    this.build(look);
    this.setName(name);
    this.makeBubble();
    // 누르기 쉬운 보이지 않는 기둥 (캐릭터를 눌러 책상 정보 보기)
    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.9, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 0.95;
    this.group.add(this.hit);
  }

  setName(name) {
    if (this.tag) { this.group.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose(); }
    this.name = name;
    this.tag = nameTag(name, this.mine, this.web || 0);
    this.tag.position.y = this.tagY;
    this.group.add(this.tag);
  }

  // 이름표의 웹 결과물 표시 (0 없음 · 1 있음 · 2 방금 올림)
  setWeb(web) {
    if ((this.web || 0) === web) return;
    this.web = web;
    if (this.tag) { const vis = this.tag.visible; this.setName(this.name); this.tag.visible = vis; }
  }

  makeBubble() {
    const c = document.createElement('canvas');
    c.width = BUBBLE_W; c.height = BUBBLE_H;
    this.bubbleCtx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, opacity: 0 }));
    this.bubble.scale.set(2.0, 0.625, 1);
    this.bubble.position.y = this.tagY + 0.38;
    this.bubble.renderOrder = 11;
    this.bubble.visible = false;
    this.group.add(this.bubble);
    this.bubbleText = '';
  }

  // list: 메모 5개, mode: auto | one | off, idx: one 일 때 띄울 메모 번호
  setMemos(list, mode = 'auto', idx = 0) {
    this.allMemos = (list || []).map((s) => String(s || ''));
    this.memos = this.allMemos.filter((s) => s.trim());
    this.mode = mode;
    this.oneIdx = idx;
    if (!this.memos.length || mode === 'off') this.hideBubble();
  }

  showText(text) {
    if (text !== this.bubbleText) {
      drawBubble(this.bubbleCtx, text);
      this.bubble.material.map.needsUpdate = true;
      this.bubbleText = text;
    }
    this.bubbleShown = true;
  }
  hideBubble() { this.bubbleShown = false; }
  // 아무 말이나 잠깐 띄운다 (출근 인사 등)
  say(text, sec = 4) { this.showText(text); this.pinned = sec; this.memoT = 0; }
  // 펫이 신나서 폴짝폴짝 + 하트
  petJoy() {
    if (!this.pet) return;
    this.joyT = 1.6;
    if (!this.heart) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); g.font = '48px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('💖', 32, 36);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      this.heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
      this.heart.scale.set(0.38, 0.38, 1);
      this.heart.renderOrder = 12;
    }
    this.pet.add(this.heart);
    this.heart.visible = true;
  }

  // 메모 하나를 지금 바로 8초 동안 띄운다 (메모 줄에서 누를 때)
  pin(i) {
    const t = this.allMemos?.[i] || this.memos[i];
    if (!t) return;
    this.showText(t);
    this.pinned = 8;
    this.memoT = 0;
  }

  // 메모는 7초 보이고 5초 쉬었다가 다음 메모
  tickMemo(dt) {
    if (this.pinned > 0) {
      this.pinned -= dt;
      if (this.pinned <= 0) { this.hideBubble(); this.memoT = 0; }
    } else if (this.memoOn && this.mode === 'one' && this.allMemos?.[this.oneIdx]?.trim()) {
      // 고른 메모 하나가 계속 떠 있어요
      this.showText(this.allMemos[this.oneIdx]);
    } else if (this.memoOn && this.mode === 'auto' && this.memos.length) {
      this.memoT += dt;
      if (!this.bubbleShown && this.memoT > 5) {
        this.memoIdx = (this.memoIdx + 1) % this.memos.length;
        this.showText(this.memos[this.memoIdx]);
        this.memoT = 0;
      } else if (this.bubbleShown && this.memoT > 7) {
        this.hideBubble();
        this.memoT = 0;
      }
    } else if (this.bubbleShown) this.hideBubble();
    const m = this.bubble.material;
    m.opacity = lerp(m.opacity, this.bubbleShown ? 1 : 0, Math.min(1, dt * 6));
    this.bubble.visible = m.opacity > 0.02;
    // 말풍선이 나타날 때 살짝 튀어 오른다
    const s = 0.9 + 0.1 * m.opacity;
    this.bubble.scale.set(2.0 * s, 0.625 * s, 1);
  }

  setLook(look) { this.build(look); }

  build(look) {
    if (this.body) this.group.remove(this.body);
    this.look = look;
    const outfit = outfitOf(look);
    const body = new THREE.Group();
    this.body = body;
    this.group.add(body);

    const petId = look.pet || 'none';
    if (petId !== this.petId) {
      if (this.pet) this.pet.removeFromParent();
      this.pet = buildPet(petId);
      this.petId = petId;
      // 펫 누르기용 보이지 않는 상자 (내 펫만 눌러요)
      if (this.pet) {
        this.petHit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
        this.petHit.position.y = 0.4;
        this.petHit.userData.pet = true;
        this.pet.add(this.petHit);
      } else this.petHit = null;
      this.petFresh = true;
    }

    buildBlock(this, body, { ...look, hairC: hairColorOf(look) }, outfit, look.skin);
    // 체형: 키·등신·체격. 이름표와 말풍선도 키에 맞춰요
    const B = bodyOf(look);
    applyBody(this, B);
    this.tagY = B.k * (0.46 * B.leg + 0.56 * B.th + 0.58 * B.head) + 0.22; // 머리카락 바로 위
    if (this.tag) this.tag.position.y = this.tagY;
    if (this.bubble) this.bubble.position.y = this.tagY + 0.38;
    bakeBlock(this);

    // 머그컵 (오른손)
    const mug = new THREE.Group();
    box(mug, '#f4f1ec', 0.13, 0.15, 0.13, 0, 0, 0);
    box(mug, '#6b4026', 0.11, 0.01, 0.11, 0, 0.07, 0);
    box(mug, '#f4f1ec', 0.03, 0.08, 0.03, 0.08, 0, 0);
    mug.position.set(0, this.handY - 0.3, 0.34);
    mug.scale.setScalar(5); // 커피잔은 잘 보이게 5배
    mug.visible = false;
    this.armR.add(mug);
    this.mug = mug;
    // 냉장고 음료 캔 (웰치스 포도 · 콜라 · 사이다)
    this.cans = {};
    for (const [id, c, band] of [['can_grape', '#6a2c8a', '#c9a8e0'], ['can_cola', '#c8302a', '#f4f4f2'], ['can_cider', '#3fa85a', '#e8f6ec']]) {
      const can = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 18), [canLabel(id, c, band), mat('#c9ccd2', { metalness: 0.7, roughness: 0.3 }), mat('#9aa0a8', { metalness: 0.7, roughness: 0.3 })]);
      body.castShadow = true;
      can.add(body);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.02, 18), mat('#dfe2e6', { metalness: 0.7, roughness: 0.25 })); lid.position.y = 0.11; can.add(lid);
      can.position.set(0, this.handY - 0.12, 0.08);
      can.scale.setScalar(1.6);
      can.visible = false;
      this.armR.add(can);
      this.cans[id] = can;
    }
    // 박카스: 작은 갈색 유리병 + 금색 뚜껑 + 노란 띠
    {
      const bt = new THREE.Group();
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.11, 16), mat('#5a2e12', { roughness: 0.2, metalness: 0.1 })); glass.castShadow = true; bt.add(glass);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0372, 0.0372, 0.05, 16), mat('#f2c230', { roughness: 0.5 })); bt.add(band);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.036, 0.03, 16), mat('#5a2e12', { roughness: 0.2 })); neck.position.y = 0.07; bt.add(neck);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 14), mat('#d8b24a', { metalness: 0.7, roughness: 0.3 })); cap.position.y = 0.093; bt.add(cap);
      bt.position.set(0, this.handY - 0.12, 0.08); bt.scale.setScalar(1.8); bt.visible = false;
      this.armR.add(bt); this.cans.bt_bacchus = bt;
    }
    // 에너지 드링크: 길쭉한 캔 (블루 · 블랙), 앞면에 번개
    for (const [id, c, bolt] of [['can_enblue', '#1f4fb8', '#d9e3f0'], ['can_enblack', '#1a1b1f', '#7ae04a']]) {
      const can = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.24, 18), [energyLabel(id, c, bolt), mat('#c9ccd2', { metalness: 0.7, roughness: 0.3 }), mat('#9aa0a8', { metalness: 0.7, roughness: 0.3 })]);
      body.castShadow = true; can.add(body);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.02, 18), mat('#dfe2e6', { metalness: 0.7, roughness: 0.25 })); lid.position.y = 0.13; can.add(lid);
      can.position.set(0, this.handY - 0.12, 0.08); can.scale.setScalar(1.6); can.visible = false;
      this.armR.add(can); this.cans[id] = can;
    }
    // 냉장고 페트병 (생수 · 보리차 · 녹차): 비치는 몸통 속 음료 색, 가운데 띠 상표, 병목 · 뚜껑
    for (const [id, drink, label, cap] of [['pet_water', '#d6eef9', '#2f7fd0', '#2f7fd0'], ['pet_barley', '#a8672a', '#efe2bf', '#7a4a1e'], ['pet_gtea', '#b9cf63', '#2f8a4a', '#2f8a4a']]) {
      const pet = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 18), mat(drink, { transparent: true, opacity: 0.78, roughness: 0.15 }));
      body.castShadow = true; pet.add(body);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0515, 0.0515, 0.08, 18), mat(label, { roughness: 0.5 })); band.position.y = -0.01; pet.add(band);
      const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.05, 0.05, 18), mat(drink, { transparent: true, opacity: 0.78, roughness: 0.15 })); shoulder.position.y = 0.125; pet.add(shoulder);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.035, 14), mat(cap, { roughness: 0.4 })); lid.position.y = 0.167; pet.add(lid);
      pet.position.set(0, this.handY - 0.12, 0.08);
      pet.scale.setScalar(1.6);
      pet.visible = false;
      this.armR.add(pet);
      this.cans[id] = pet;
    }

    body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  play(action) {
    if (this.action === action) { this.action = null; return false; }
    this.action = action;
    this.actionT = 0;
    return true;
  }
  stop() { this.action = null; }

  update(dt, actionDefs) {
    this.actionT += dt;
    const def = this.action && actionDefs.find((a) => a.id === this.action);
    if (def && def.dur && this.actionT > def.dur) this.action = null;
    // 앉아 있고 다른 동작이 없으면 코딩한다
    if (this.seated && !this.action && !this.idle) { this.action = 'type'; this.actionT = 0; }
    if (this.action === 'type' && (!this.seated || this.idle)) this.action = null;

    let target = this.seated ? SIT : STAND;
    if (this.action) {
      if (this.speed > 0.2) this.action = null;
      else target = actionPose(this.action, this.actionT, target);
    }
    if (!this.seated && this.speed > 0.05) {
      const run = Math.min(1, Math.max(0, (this.speed - 3.2) / 1.6));
      this.walkPhase += dt * (6 + Math.min(this.speed, 3.2) * 2.5 + run * 4);
      const s = Math.sin(this.walkPhase) * Math.min(1, this.speed / 2) * (0.6 + run * 0.35);
      target = { ...target, hip: target.hip + run * 0.22, head: target.head - run * 0.12,
        lL: [s, 0], lR: [-s, 0], aL: [-s * (0.8 + run * 0.5) - run * 0.5, 0.1], aR: [s * (0.8 + run * 0.5) - run * 0.5, -0.1] };
    }

    const k = this.fresh ? 1 : Math.min(1, dt * 9);
    this.fresh = false;
    const p = this.pose;
    for (const key of KEYS) p[key] = lerp(p[key], target[key], k);
    for (const key of LIMBS) { p[key][0] = lerp(p[key][0], target[key][0], k); p[key][1] = lerp(p[key][1], target[key][1], k); }

    const bob = !this.seated && this.speed > 0.05 ? Math.abs(Math.sin(this.walkPhase)) * 0.04 : 0;
    const breathe = Math.sin(performance.now() / 900) * 0.006;
    this.body.position.y = p.y * (this.sitK || 1) + bob; // 다리가 짧은 체형은 앉을 때 덜 내려가요
    this.hips.rotation.x = p.hip;
    this.hips.scale.y = (this.torsoY || 1) * (1 + breathe);
    this.head.rotation.x = p.head;
    this.armL.rotation.set(p.aL[0], 0, p.aL[1]);
    this.armR.rotation.set(p.aR[0], 0, p.aR[1]);
    this.legL.rotation.set(p.lL[0], 0, p.lL[1]);
    this.legR.rotation.set(p.lR[0], 0, p.lR[1]);
    this.mug.visible = this.action === 'coffee' || this.action === 'pour' || this.action === 'drink';
    for (const [id, can] of Object.entries(this.cans)) can.visible = this.action === id;
    const down = this.seated ? 0.38 * (this.sitK || 1) : 0;
    this.tag.position.y = this.tagY - down;
    this.bubble.position.y = this.tagY + 0.38 - down;
    this.updatePet(dt);
    this.tickMemo(dt);
  }

  // 친구는 주인의 왼쪽 뒤를 따라오고, 주인이 앉으면 의자 옆 바닥에 앉는다
  updatePet(dt) {
    const pet = this.pet;
    if (!pet) return;
    const parent = this.group.parent;
    if (!parent) return;
    if (pet.parent !== parent) parent.add(pet);
    pet.visible = this.group.visible;
    const g = this.group, ry = g.rotation.y;
    const lx = (this.seated ? 0.85 : 0.72) * (pet.userData.side || 1), lz = this.seated ? -0.2 : -0.45 * (pet.userData.back || 1);
    const tx = g.position.x + lx * Math.cos(ry) + lz * Math.sin(ry);
    const tz = g.position.z - lx * Math.sin(ry) + lz * Math.cos(ry);
    const bx = pet.position.x, bz = pet.position.z;
    const far = Math.hypot(tx - bx, tz - bz) > 5;
    const kk = this.petFresh || far ? 1 : Math.min(1, dt * 4);
    this.petFresh = false;
    pet.position.x += (tx - bx) * kk;
    pet.position.z += (tz - bz) * kk;
    const moved = Math.hypot(pet.position.x - bx, pet.position.z - bz) / Math.max(dt, 1e-4);
    const t = performance.now() / 1000;
    const hover = pet.userData.hover;
    pet.position.y = hover ? 0.95 + Math.sin(t * 2.4) * 0.06 : moved > 0.3 ? Math.abs(Math.sin(t * 11)) * 0.07 : 0;
    if (this.joyT > 0) {
      this.joyT -= dt;
      pet.position.y += Math.abs(Math.sin(this.joyT * 9)) * 0.28;
      if (this.heart) { this.heart.position.set(0, 1.0 + (1.6 - this.joyT) * 0.35, 0); this.heart.material.opacity = Math.min(1, this.joyT * 1.5); this.heart.visible = this.joyT > 0; }
    }
    const want = moved > 0.3 ? Math.atan2(pet.position.x - bx, pet.position.z - bz) : ry;
    const diff = Math.atan2(Math.sin(want - pet.rotation.y), Math.cos(want - pet.rotation.y));
    pet.rotation.y += diff * Math.min(1, dt * 6);
    for (const f of pet.userData.anim) f(t);
    pet.userData.legs?.forEach((l, i) => { l.rotation.x = moved > 0.3 ? Math.sin(t * 14 + i * 1.6) * 0.5 : 0; });
  }

  dispose() {
    this.pet?.removeFromParent();
    this.group.removeFromParent();
    this.body?.traverse((o) => { if (o.isMesh && o.material?.vertexColors) o.geometry.dispose(); });
    for (const s of [this.tag, this.bubble]) { s?.material.map.dispose(); s?.material.dispose(); }
    this.hit.geometry.dispose();
  }
}
