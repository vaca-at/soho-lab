// 폭죽: 쏜 사람 책상 위 천장 아래에서 펑. 같은 층 모두에게 보여요 (서버가 전해 줘요)
import * as THREE from 'three';

const COLORS = ['#ff6a4a', '#ffd34a', '#7ad0ff', '#c88aff', '#7dffb0', '#ff8ad0'];
const bursts = [];
let sparkTex = null;
function spark() {
  if (sparkTex) return sparkTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(255,255,255,.8)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return (sparkTex = new THREE.CanvasTexture(c));
}
// from: 쏜 사람 위치, ceil: 천장 높이. 0.8초 올라가서 터지고 2초 동안 흩어져요
// ry: 쏜 사람이 보는 쪽. 책상 앞 2m, 칸막이 위 높이에서 터져서 어깨 너머 카메라에도 보여요
export function launchFirework(scene, from, ceil, seed = Math.random(), ry = 0) {
  const top = new THREE.Vector3(from.x + Math.sin(ry) * 2.1 + (seed - 0.5) * 0.6, Math.min(ceil - 0.5, 1.8), from.z + Math.cos(ry) * 2.1 + (seed - 0.5) * 0.6);
  for (let shell = 0; shell < 2; shell++) {
    const n = 110, pos = new Float32Array(n * 3), vel = [];
    const color = new THREE.Color(COLORS[Math.floor((seed * 7 + shell * 2) * COLORS.length) % COLORS.length]);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      vel.push(new THREE.Vector3(r * Math.cos(a), u * 0.8, r * Math.sin(a)).multiplyScalar((shell ? 0.8 : 1.3) + Math.random() * 0.5));
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color, size: 0.16, map: spark(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const pts = new THREE.Points(geo, m); pts.visible = false; scene.add(pts);
    const trail = new THREE.Sprite(new THREE.SpriteMaterial({ map: spark(), color: '#fff3c0', blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    trail.scale.setScalar(0.3); trail.position.set(from.x, 1.2, from.z); trail.visible = !shell; scene.add(trail);
    bursts.push({ pts, trail, vel, from: trail.position.clone(), top, t: -shell * 0.25 });
  }
}
export function stepFireworks(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.t += dt;
    if (b.t < 0.8) { if (b.t > 0) b.trail.position.lerpVectors(b.from, b.top, b.t / 0.8); continue; }
    if (b.trail.parent) { b.trail.removeFromParent(); b.trail.material.dispose(); b.pts.visible = true; }
    const k = b.t - 0.8, p = b.pts.geometry.attributes.position;
    for (let j = 0; j < b.vel.length; j++) {
      const v = b.vel[j];
      p.setXYZ(j, b.top.x + v.x * k, b.top.y + v.y * k - 0.9 * k * k, b.top.z + v.z * k);
    }
    p.needsUpdate = true;
    b.pts.material.opacity = Math.max(0, 1 - k / 2);
    if (k > 2.1) { b.pts.removeFromParent(); b.pts.geometry.dispose(); b.pts.material.dispose(); bursts.splice(i, 1); }
  }
}
