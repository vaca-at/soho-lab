// 우리 캐릭터: 네모난 블록 사람과 '내 옆 친구'(따라다니는 작은 친구).
// 블록 사람은 Avatar 와 같은 관절(hips, head, 팔다리)을 써서 모든 동작이 그대로 된다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat } from './avatar.js';

// 관절(다리·몸통·팔·머리)마다 붙은 불투명 상자들을 정점 색이 있는 메시 하나로 합친다
const BAKED = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
export function bakeBlock(av) {
  for (const node of [av.legL, av.legR, av.hips, av.armL, av.armR, av.head]) {
    const parts = node.children.filter((o) => o.isMesh && !o.material.transparent && o.material.color && o !== av.skirt);
    if (parts.length < 2) continue;
    const geos = parts.map((m) => {
      m.updateMatrix();
      const g = m.geometry.clone().applyMatrix4(m.matrix);
      const c = m.material.color;
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    });
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    parts.forEach((m) => node.remove(m));
    const one = new THREE.Mesh(merged, BAKED);
    one.castShadow = true;
    node.add(one);
  }
  av.baked = true;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
export function box(parent, color, w, h, d, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(BOX, typeof color === 'string' ? mat(color, opts) : color);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// 블록 사람 프리셋. hair: 머리색, top/inner/bottom: 겉옷·안쪽·바지, extra: 고유 소품
export const PRESETS = {
  moral: { hair: '#2b2220', top: '#2f3e66', inner: '#f3f0e8', bottom: '#3a3f4a', extra: 'collar' },
  appteacher: { hair: '#1f1b1a', top: '#3f9a5a', inner: '#3f9a5a', bottom: '#33363d', extra: 'glasses' },
  tycoon: { hair: '#2a2420', top: '#2b2d33', inner: '#f2f2f2', bottom: '#2b2d33', extra: 'tie', tie: '#c23b3b' },
  trainee: { hair: '#4a3426', top: '#f4f4f2', inner: '#f4f4f2', bottom: '#3b4150', extra: 'lanyard', cap: '#3d8fc4' },
  planner: { hair: '#6b3f2a', top: '#e9b8c4', inner: '#e9b8c4', bottom: '#5a6b8a', extra: 'beret' },
  knitdev: { hair: '#2a2220', top: '#4e8a4a', inner: '#4e8a4a', bottom: '#2f3a4a', extra: 'knit' },
  hoodie: { hair: '#3a2a20', top: '#3c9a6a', inner: '#3c9a6a', bottom: '#2c2f36', extra: 'hood' },
  beige: { hair: '#6b4128', top: '#d9c3a0', inner: '#1d1d1f', bottom: '#2a2a2c', extra: 'jacket' },
};

export function buildBlock(av, body, look, outfit, skinColor) {
  const P = PRESETS[look.type] || PRESETS.beige;
  const own = outfit.style === 'own';
  const top = own ? P.top : outfit.top;
  const inner = own ? P.inner : outfit.top;
  const bottom = own ? P.bottom : outfit.bottom;
  const female = look.gender !== 'm';
  const legY = 0.46;

  const mkLeg = (side) => {
    const g = new THREE.Group();
    g.position.set(0.12 * side, legY, 0);
    box(g, bottom, 0.2, 0.42, 0.22, 0, -0.21, 0);
    box(g, own ? '#2a2420' : '#f2eee6', 0.21, 0.08, 0.27, 0, -0.42, 0.03);
    body.add(g);
    return g;
  };
  av.legL = mkLeg(1);
  av.legR = mkLeg(-1);

  const hips = new THREE.Group();
  hips.position.y = legY;
  body.add(hips);
  av.hips = hips;

  // 몸통: 겉옷 + 가운데 안쪽 옷
  box(hips, top, 0.5, 0.56, 0.28, 0, 0.28, 0);
  if (inner !== top) box(hips, inner, 0.16, 0.5, 0.02, 0, 0.3, 0.145);
  av.skirt = null;
  if (!own && ['robe', 'kasaya', 'coat'].includes(outfit.style)) {
    const sk = box(hips, outfit.style === 'robe' ? bottom : top, 0.54, 0.34, 0.32, 0, -0.12, 0);
    sk.userData = { sx: 0.54, sz: 0.32, h: 0.34, y: -0.12, box: true };
    av.skirt = sk;
  }
  // 체크 셔츠: 가로·세로 진한 줄 / 잠옷: 단추와 작은 무늬
  if (!own && outfit.style === 'check') {
    for (let i = 0; i < 4; i++) box(hips, '#7a2a26', 0.51, 0.03, 0.29, 0, 0.08 + i * 0.13, 0);
    for (const x of [-0.15, 0, 0.15]) box(hips, '#7a2a26', 0.03, 0.56, 0.29, x, 0.28, 0);
  }
  if (!own && outfit.style === 'pajama') {
    for (let i = 0; i < 3; i++) box(hips, '#ffffff', 0.04, 0.04, 0.02, 0, 0.14 + i * 0.13, 0.15);
    for (const [x, y] of [[0.16, 0.42], [-0.14, 0.2], [0.12, 0.1], [-0.17, 0.46]]) box(hips, '#e58fa6', 0.05, 0.05, 0.02, x, y, 0.145);
  }
  if (own) {
    if (P.extra === 'tie') box(hips, P.tie, 0.07, 0.34, 0.02, 0, 0.36, 0.16);
    if (P.extra === 'collar') { box(hips, P.inner, 0.24, 0.06, 0.02, 0, 0.53, 0.15); }
    if (P.extra === 'lanyard') { box(hips, '#3d8fc4', 0.03, 0.26, 0.02, 0, 0.42, 0.15); box(hips, '#f2f2f2', 0.1, 0.12, 0.02, 0, 0.26, 0.16, { emissive: '#222' }); }
    if (P.extra === 'knit') for (let i = 0; i < 4; i++) box(hips, '#3f7a3c', 0.5, 0.02, 0.29, 0, 0.08 + i * 0.12, 0);
    if (P.extra === 'hood') { box(hips, P.top, 0.44, 0.16, 0.12, 0, 0.5, -0.18); box(hips, '#f2f2f2', 0.02, 0.18, 0.02, 0.06, 0.4, 0.15); box(hips, '#f2f2f2', 0.02, 0.18, 0.02, -0.06, 0.4, 0.15); }
    if (P.extra === 'jacket') { box(hips, P.top, 0.17, 0.56, 0.02, 0.165, 0.28, 0.145); box(hips, P.top, 0.17, 0.56, 0.02, -0.165, 0.28, 0.145); }
  }

  // 팔
  const mkArm = (side) => {
    const g = new THREE.Group();
    g.position.set(0.33 * side, 0.52, 0);
    box(g, top, 0.15, 0.42, 0.18, 0, -0.18, 0);
    const hand = box(g, skinColor, 0.13, 0.11, 0.15, 0, -0.43, 0);
    hips.add(g);
    return { g, hand };
  };
  const L = mkArm(1), R = mkArm(-1);
  av.armL = L.g; av.armR = R.g; av.handL = L.hand; av.handR = R.hand;
  av.handY = -0.44;

  // 머리: 큰 네모 얼굴
  const head = new THREE.Group();
  head.position.y = 0.56;
  hips.add(head);
  av.head = head;
  const S = 0.52;
  box(head, skinColor, S, S, S, 0, S / 2 + 0.02, 0);
  const fz = S / 2 + 0.005;
  const eyeY = S / 2 + 0.03;
  box(head, '#1d1a18', 0.07, 0.09, 0.02, 0.11, eyeY, fz);
  box(head, '#1d1a18', 0.07, 0.09, 0.02, -0.11, eyeY, fz);
  box(head, '#b5584c', 0.1, 0.025, 0.02, 0, eyeY - 0.13, fz);
  box(head, '#f0a090', 0.06, 0.03, 0.015, 0.19, eyeY - 0.08, fz, { transparent: true, opacity: 0.6 });
  box(head, '#f0a090', 0.06, 0.03, 0.015, -0.19, eyeY - 0.08, fz, { transparent: true, opacity: 0.6 });

  // 머리카락: 여자는 긴 머리, 남자는 짧은 머리
  const H = P.hair;
  const hy = S + 0.02;
  box(head, H, S + 0.06, 0.12, S + 0.06, 0, hy, 0);
  box(head, H, S + 0.06, female ? 0.7 : 0.36, 0.1, 0, female ? hy - 0.32 : hy - 0.16, -S / 2 - 0.03);
  box(head, H, 0.08, female ? 0.6 : 0.2, S + 0.06, S / 2 + 0.03, female ? hy - 0.28 : hy - 0.1, -0.02);
  box(head, H, 0.08, female ? 0.6 : 0.2, S + 0.06, -S / 2 - 0.03, female ? hy - 0.28 : hy - 0.1, -0.02);
  box(head, H, S + 0.06, 0.1, 0.08, 0, hy - 0.08, fz + 0.02);
  if (female) {
    // 웨이브 느낌으로 옆머리 끝을 조금씩 엇갈리게
    box(head, H, 0.12, 0.14, 0.14, S / 2 + 0.06, hy - 0.58, 0.04);
    box(head, H, 0.12, 0.14, 0.14, -S / 2 - 0.06, hy - 0.58, 0.04);
    box(head, H, 0.14, 0.12, 0.12, 0.17, hy + 0.02, fz + 0.03);
  }
  if (own && P.extra === 'glasses') {
    const gm = '#1d1a18';
    box(head, gm, 0.16, 0.13, 0.015, 0.11, eyeY, fz + 0.02, { transparent: true, opacity: 0.9 });
    box(head, gm, 0.16, 0.13, 0.015, -0.11, eyeY, fz + 0.02, { transparent: true, opacity: 0.9 });
    box(head, '#cfe6f0', 0.12, 0.09, 0.016, 0.11, eyeY, fz + 0.025, { transparent: true, opacity: 0.35 });
    box(head, '#cfe6f0', 0.12, 0.09, 0.016, -0.11, eyeY, fz + 0.025, { transparent: true, opacity: 0.35 });
  }
  if (own && P.cap && look.acc === 'none') {
    box(head, P.cap, S + 0.08, 0.14, S + 0.08, 0, hy + 0.06, 0);
    box(head, P.cap, S + 0.08, 0.04, 0.24, 0, hy + 0.0, fz + 0.12);
  }
  if (own && P.extra === 'beret' && look.acc === 'none') {
    const b = box(head, '#b23a4a', S + 0.1, 0.1, S + 0.06, 0.04, hy + 0.08, 0); b.rotation.z = -0.12;
  }

  // 장신구
  const acc = look.acc;
  if (acc === 'headphones') {
    // 머리 위를 지나는 띠 + 양쪽 귀 덮개
    box(head, '#2a2c33', S + 0.16, 0.06, 0.1, 0, hy + 0.1, 0);
    for (const s of [1, -1]) {
      box(head, '#2a2c33', 0.06, 0.26, 0.1, (S / 2 + 0.08) * s, hy - 0.05, 0);
      box(head, '#e2603d', 0.1, 0.2, 0.2, (S / 2 + 0.09) * s, eyeY - 0.02, 0);
    }
  }
  if (acc === 'glasses') {
    for (const s of [1, -1]) {
      box(head, '#3a2418', 0.17, 0.03, 0.02, 0.11 * s, eyeY + 0.07, fz + 0.025);
      box(head, '#3a2418', 0.17, 0.03, 0.02, 0.11 * s, eyeY - 0.07, fz + 0.025);
      box(head, '#3a2418', 0.03, 0.15, 0.02, 0.185 * s, eyeY, fz + 0.025);
      box(head, '#3a2418', 0.03, 0.15, 0.02, 0.035 * s, eyeY, fz + 0.025);
    }
  }
  if (acc === 'beanie') { box(head, '#b23a3a', S + 0.1, 0.2, S + 0.1, 0, hy + 0.06, 0); box(head, '#f4efe6', 0.12, 0.1, 0.12, 0, hy + 0.22, 0); }
  if (acc === 'backpack') { box(hips, '#3d4452', 0.38, 0.42, 0.18, 0, 0.3, -0.23); box(hips, '#2c323d', 0.3, 0.12, 0.04, 0, 0.18, -0.33); }
}

// ───────── 내 옆 친구 ─────────
// 고르는 목록 순서 그대로. hidden 은 목록에서 뺐지만 예전에 고른 사람을 위해 그리는 법만 남긴 친구
export const PETS = [
  { id: 'dog', name: '강아지', cap: '꼬리를 흔들어요' },
  { id: 'cat', name: '고양이', cap: '꼬리를 살랑살랑' },
  { id: 'hamster', name: '햄스터', cap: '볼 빵빵' },
  { id: 'bunny', name: '토끼', cap: '귀가 쫑긋' },
  { id: 'coffee', name: '커피잔', cap: '김이 모락모락' },
  { id: 'icecoffee', name: '아이스커피', cap: '얼음 가득, 초록 빨대' },
  { id: 'book', name: '책 친구', cap: '책장을 펄럭' },
  { id: 'ai', name: 'AI 짝꿍', cap: '화면 얼굴 로봇', hover: true },
  { id: 'claude', name: '클로드', cap: '주황 네모, 다리 넷' },
  { id: 'drone', name: '드론', cap: '프로펠러가 쌩쌩', hover: true },
  { id: 'none', name: '없음', cap: '혼자 다니기' },
  { id: 'plant', name: '화분 친구', hidden: true },
  { id: 'ghost', name: '꼬마 유령', hover: true, hidden: true },
  { id: 'rocket', name: '꼬마 로켓', hover: true, hidden: true },
];

const eyes = (g, y, z, sep = 0.07, s = 0.05, c = '#1d1a18') => {
  box(g, c, s, s * 1.3, 0.02, sep, y, z);
  box(g, c, s, s * 1.3, 0.02, -sep, y, z);
};

export function buildPet(id) {
  const g = new THREE.Group();
  const anim = []; // (t) => void
  switch (id) {
    case 'ai': {
      box(g, '#eef0f2', 0.36, 0.3, 0.3, 0, 0.15, 0);
      box(g, '#1f2a33', 0.28, 0.2, 0.02, 0, 0.16, 0.155);
      box(g, '#5ff0e0', 0.05, 0.07, 0.02, 0.06, 0.17, 0.168, { emissive: '#5ff0e0', emissiveIntensity: 0.8 });
      box(g, '#5ff0e0', 0.05, 0.07, 0.02, -0.06, 0.17, 0.168, { emissive: '#5ff0e0', emissiveIntensity: 0.8 });
      box(g, '#8a9096', 0.03, 0.14, 0.03, 0, 0.37, 0);
      const tip = box(g, '#e2603d', 0.07, 0.07, 0.07, 0, 0.46, 0, { emissive: '#e2603d', emissiveIntensity: 0.5 });
      anim.push((t) => { tip.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 3)) * 0.7; });
      break;
    }
    case 'dog': {
      const c = '#e8d7b8';
      box(g, c, 0.24, 0.2, 0.36, 0, 0.2, 0);
      box(g, c, 0.24, 0.22, 0.22, 0, 0.36, 0.2);
      box(g, '#f2e6d0', 0.12, 0.08, 0.06, 0, 0.31, 0.32);
      box(g, '#2a2220', 0.05, 0.04, 0.03, 0, 0.34, 0.35);
      eyes(g, 0.4, 0.315, 0.06, 0.04);
      box(g, '#a87a50', 0.06, 0.14, 0.06, 0.12, 0.42, 0.18);
      box(g, '#a87a50', 0.06, 0.14, 0.06, -0.12, 0.42, 0.18);
      box(g, '#d24a3a', 0.26, 0.04, 0.05, 0, 0.27, 0.1);
      for (const [x, z] of [[0.08, 0.12], [-0.08, 0.12], [0.08, -0.12], [-0.08, -0.12]]) box(g, c, 0.07, 0.12, 0.07, x, 0.06, z);
      const tail = box(g, c, 0.05, 0.05, 0.16, 0, 0.3, -0.24);
      anim.push((t) => { tail.rotation.y = Math.sin(t * 12) * 0.6; });
      break;
    }
    case 'cat': {
      // 치즈 고양이: 등에 줄무늬, 세모 귀, 위로 말린 꼬리
      const c = '#e9a25a', stripe = '#c9773a';
      box(g, c, 0.22, 0.18, 0.36, 0, 0.19, 0);
      for (const z of [-0.1, 0, 0.1]) box(g, stripe, 0.23, 0.02, 0.04, 0, 0.285, z);
      box(g, c, 0.24, 0.2, 0.2, 0, 0.36, 0.19);
      box(g, '#f6e6cf', 0.12, 0.07, 0.04, 0, 0.31, 0.29);
      box(g, '#f2a0a8', 0.035, 0.025, 0.02, 0, 0.34, 0.305);
      eyes(g, 0.39, 0.292, 0.06, 0.04, '#2f3a1e');
      for (const s of [1, -1]) {
        const ear = box(g, c, 0.07, 0.08, 0.04, 0.08 * s, 0.49, 0.19);
        ear.rotation.z = -0.5 * s;
        box(g, '#f2a0a8', 0.035, 0.045, 0.01, 0.08 * s, 0.485, 0.212);
        for (const dy of [0.01, -0.02]) box(g, '#f7efe0', 0.1, 0.008, 0.008, 0.15 * s, 0.32 + dy, 0.28);
      }
      for (const [x, z] of [[0.07, 0.12], [-0.07, 0.12], [0.07, -0.12], [-0.07, -0.12]]) box(g, '#f6e6cf', 0.06, 0.11, 0.06, x, 0.055, z);
      const tail = new THREE.Group();
      tail.position.set(0, 0.24, -0.18);
      box(tail, c, 0.05, 0.05, 0.14, 0, 0, -0.06);
      box(tail, stripe, 0.05, 0.16, 0.05, 0, 0.08, -0.13);
      g.add(tail);
      anim.push((t) => { tail.rotation.z = Math.sin(t * 2.2) * 0.35; });
      break;
    }
    case 'hamster': {
      box(g, '#d99a55', 0.3, 0.24, 0.3, 0, 0.12, 0);
      box(g, '#f6e6cf', 0.2, 0.14, 0.02, 0, 0.1, 0.155);
      eyes(g, 0.18, 0.155, 0.07, 0.04);
      box(g, '#f2b0a0', 0.06, 0.05, 0.02, 0.11, 0.13, 0.156);
      box(g, '#f2b0a0', 0.06, 0.05, 0.02, -0.11, 0.13, 0.156);
      box(g, '#c0844a', 0.07, 0.07, 0.04, 0.1, 0.27, 0.05);
      box(g, '#c0844a', 0.07, 0.07, 0.04, -0.1, 0.27, 0.05);
      break;
    }
    case 'plant': {
      box(g, '#c8643a', 0.3, 0.24, 0.3, 0, 0.12, 0);
      box(g, '#a84e2c', 0.34, 0.05, 0.34, 0, 0.25, 0);
      eyes(g, 0.15, 0.155, 0.07, 0.045);
      box(g, '#3f8a3a', 0.04, 0.3, 0.04, 0, 0.42, 0);
      const leaf = box(g, '#4fa24a', 0.14, 0.04, 0.08, 0.08, 0.4, 0);
      const flower = new THREE.Group(); flower.position.y = 0.58; g.add(flower);
      for (let i = 0; i < 4; i++) box(flower, '#e2463a', 0.08, 0.08, 0.04, Math.cos(i * 1.57) * 0.06, Math.sin(i * 1.57) * 0.06, 0);
      box(flower, '#f3d16a', 0.05, 0.05, 0.05);
      anim.push((t) => { flower.rotation.z = Math.sin(t * 2) * 0.25; leaf.rotation.z = Math.sin(t * 2 + 1) * 0.2; });
      break;
    }
    case 'drone': {
      box(g, '#f2f2f2', 0.26, 0.08, 0.2, 0, 0.1, 0);
      box(g, '#2a2a2c', 0.08, 0.06, 0.04, 0, 0.08, 0.11);
      const props = [];
      for (const [x, z] of [[0.2, 0.15], [-0.2, 0.15], [0.2, -0.15], [-0.2, -0.15]]) {
        box(g, '#bfc4c8', 0.18, 0.025, 0.025, x / 2, 0.11, z / 2).rotation.y = Math.atan2(z, x);
        const p = box(g, '#4fa2d8', 0.2, 0.01, 0.03, x, 0.14, z);
        props.push(p);
      }
      anim.push((t) => props.forEach((p, i) => (p.rotation.y = t * 30 + i)));
      break;
    }
    case 'bunny': {
      const c = '#f4f1ec';
      box(g, c, 0.24, 0.24, 0.24, 0, 0.12, 0);
      box(g, c, 0.22, 0.2, 0.2, 0, 0.32, 0.03);
      eyes(g, 0.34, 0.135, 0.05, 0.035);
      box(g, '#f2b6bd', 0.04, 0.03, 0.02, 0, 0.3, 0.136);
      for (const s of [1, -1]) { box(g, c, 0.06, 0.24, 0.05, 0.06 * s, 0.53, 0.02); box(g, '#f2b6bd', 0.03, 0.18, 0.02, 0.06 * s, 0.53, 0.05); }
      break;
    }
    case 'coffee': {
      box(g, '#f4f1ec', 0.24, 0.24, 0.24, 0, 0.12, 0);
      box(g, '#6b4026', 0.2, 0.02, 0.2, 0, 0.245, 0);
      box(g, '#f4f1ec', 0.06, 0.12, 0.04, 0.15, 0.13, 0);
      eyes(g, 0.15, 0.125, 0.05, 0.035);
      const steam = box(g, '#ffffff', 0.04, 0.12, 0.04, 0, 0.36, 0, { transparent: true, opacity: 0.6 });
      anim.push((t) => { steam.position.y = 0.32 + ((t * 0.3) % 0.15); steam.material.opacity = 0.6 - ((t * 0.3) % 0.15) * 3; });
      break;
    }
    case 'book': {
      const l = box(g, '#c8443a', 0.2, 0.28, 0.03, -0.1, 0.16, 0); l.rotation.y = 0.35;
      const r = box(g, '#c8443a', 0.2, 0.28, 0.03, 0.1, 0.16, 0); r.rotation.y = -0.35;
      const pl = box(g, '#f7f2e6', 0.18, 0.25, 0.02, -0.09, 0.16, 0.025); pl.rotation.y = 0.35;
      const pr = box(g, '#f7f2e6', 0.18, 0.25, 0.02, 0.09, 0.16, 0.025); pr.rotation.y = -0.35;
      eyes(g, 0.2, 0.06, 0.09, 0.035);
      anim.push((t) => { const a = 0.35 + Math.sin(t * 3) * 0.12; l.rotation.y = pl.rotation.y = a; r.rotation.y = pr.rotation.y = -a; });
      break;
    }
    case 'ghost': {
      const m = mat('#ffffff', { transparent: true, opacity: 0.72 });
      box(g, m, 0.3, 0.32, 0.26, 0, 0.2, 0);
      for (let i = 0; i < 3; i++) box(g, m, 0.08, 0.07, 0.24, -0.1 + i * 0.1, 0.01 + (i % 2) * 0.02, 0);
      eyes(g, 0.25, 0.135, 0.06, 0.045);
      box(g, '#f2a0b0', 0.05, 0.03, 0.02, 0.1, 0.19, 0.135);
      break;
    }
    case 'rocket': {
      box(g, '#f4f1ec', 0.18, 0.32, 0.18, 0, 0.2, 0);
      box(g, '#e2463a', 0.12, 0.1, 0.12, 0, 0.41, 0);
      box(g, '#e2463a', 0.05, 0.05, 0.05, 0, 0.48, 0);
      box(g, '#5ab0e0', 0.08, 0.08, 0.02, 0, 0.26, 0.095);
      for (const s of [1, -1]) box(g, '#e2463a', 0.05, 0.12, 0.12, 0.11 * s, 0.08, 0);
      const flame = box(g, '#ffb040', 0.08, 0.12, 0.08, 0, -0.03, 0, { emissive: '#ff8a20', emissiveIntensity: 1 });
      anim.push((t) => { flame.scale.y = 0.1 + Math.abs(Math.sin(t * 20)) * 0.06; });
      break;
    }
    case 'claude': {
      const c = '#d9774f';
      box(g, c, 0.4, 0.26, 0.24, 0, 0.22, 0);
      box(g, c, 0.08, 0.08, 0.1, 0.24, 0.24, 0);
      box(g, c, 0.08, 0.08, 0.1, -0.24, 0.24, 0);
      box(g, '#1d1a18', 0.04, 0.09, 0.02, 0.08, 0.25, 0.125);
      box(g, '#1d1a18', 0.04, 0.09, 0.02, -0.08, 0.25, 0.125);
      const legs = [];
      for (const x of [0.15, 0.05, -0.05, -0.15]) legs.push(box(g, c, 0.06, 0.1, 0.12, x, 0.05, 0));
      g.userData.legs = legs;
      break;
    }
    case 'icecoffee': {
      box(g, '#dff0f6', 0.22, 0.3, 0.22, 0, 0.15, 0, { transparent: true, opacity: 0.5 });
      box(g, '#7a4a2c', 0.18, 0.2, 0.18, 0, 0.11, 0);
      box(g, '#ffffff', 0.08, 0.07, 0.08, 0.03, 0.24, 0.02, { transparent: true, opacity: 0.8 });
      box(g, '#3fa25a', 0.03, 0.26, 0.03, 0.05, 0.38, 0);
      eyes(g, 0.17, 0.112, 0.05, 0.035, '#f7efe0');
      break;
    }
    default:
      return null;
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // 사람 무릎~허리 높이가 되도록 키운다
  const wrap = new THREE.Group();
  g.scale.setScalar(1.5);
  wrap.add(g);
  wrap.userData.anim = anim;
  wrap.userData.legs = g.userData.legs;
  wrap.userData.hover = !!PETS.find((p) => p.id === id)?.hover;
  return wrap;
}
