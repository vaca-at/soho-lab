// 배경음악 5곡 · 배경음 5가지. 파일 없이 브라우저(Web Audio)에서 그때그때 만들어요 → 저작권 걱정 없음
// 음악과 배경음은 따로 골라 겹쳐 들을 수 있어요. 소리는 사용자가 한 번 누른 뒤에만 시작돼요(브라우저 규칙)
export const MUSIC = [
  { id: 'lofi', name: '로파이', cap: '느린 비트 · 전자 피아노' },
  { id: 'piano', name: '피아노', cap: '잔잔한 아르페지오' },
  { id: 'space', name: '우주', cap: '천천히 번지는 화음' },
  { id: 'drive', name: '밤 드라이브', cap: '신스웨이브' },
  { id: 'chip', name: '8비트', cap: '오락실 사무실' },
];
export const AMBIENT = [
  { id: 'rain', name: '빗소리', cap: '창밖에 비' },
  { id: 'fire', name: '모닥불', cap: '타닥타닥' },
  { id: 'keys', name: '키보드', cap: '옆자리 타자 소리' },
  { id: 'night', name: '풀벌레', cap: '여름밤 귀뚜라미' },
  { id: 'waves', name: '파도', cap: '밀려왔다 가는 바다' },
];

// 곡마다 크기가 비슷하게 들리도록 맞춘 값 (재어 보고 맞췄어요)
const LEVEL = { lofi: 1, piano: 1.4, space: 1.6, drive: 0.85, chip: 2.8, rain: 0.75, fire: 0.85, keys: 3.2, night: 2.6, waves: 0.55 };
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

export class Sound {
  constructor() {
    this.ctx = null;
    this.music = null; this.amb = null;
    this.musicVol = 0.5; this.ambVol = 0.6;
    this.timer = 0;
  }
  // 첫 클릭 때 오디오를 깨워요
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const c = (this.ctx = new AC());
    this.out = c.createDynamicsCompressor();
    this.out.threshold.value = -14; this.out.ratio.value = 3;
    this.out.connect(c.destination);
    this.mBus = c.createGain(); this.mBus.gain.value = this.musicVol * 1.4; this.mBus.connect(this.out);
    this.aBus = c.createGain(); this.aBus.gain.value = this.ambVol * 0.8; this.aBus.connect(this.out);
    // 잔향 (음악 전용)
    this.verb = c.createConvolver();
    this.verb.buffer = this.impulse(3.2, 2.6);
    this.verbIn = c.createGain(); this.verbIn.gain.value = 0.5;
    this.verbIn.connect(this.verb).connect(this.mBus);
    // 소음 재료
    this.white = this.noiseBuf('white', 4);
    this.brown = this.noiseBuf('brown', 6);
    this.pink = this.noiseBuf('pink', 6);
    this.timer = setInterval(() => this.tick(), 200);
    return true;
  }
  get live() { return !!this.ctx && this.ctx.state === 'running'; }
  // 정각 종: 맑은 벨 두 번 (띵 — 동)
  chime() {
    if (!this.live) return;
    const c = this.ctx, t0 = c.currentTime + 0.05;
    [[1318.5, 0], [987.8, 0.55]].forEach(([f, dt]) => {
      for (const [m, v] of [[1, 0.16], [2.76, 0.05], [5.4, 0.02]]) {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = f * m; g.gain.setValueAtTime(0, t0 + dt);
        g.gain.linearRampToValueAtTime(v, t0 + dt + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 2.6 / m);
        o.connect(g); g.connect(this.out); this.verbIn && g.connect(this.verbIn);
        o.start(t0 + dt); o.stop(t0 + dt + 2.8);
      }
    });
  }
  // 폭죽: 슝 — 펑 (지글지글)
  pop(delay = 0.8) {
    if (!this.live) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(500, t); o.frequency.exponentialRampToValueAtTime(1800, t + delay);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.04, t + 0.05); g.gain.linearRampToValueAtTime(0, t + delay);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + delay + 0.05);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), n = c.createGain();
    s.buffer = this.brown; f.type = 'lowpass'; f.frequency.value = 900;
    n.gain.setValueAtTime(0, t + delay); n.gain.linearRampToValueAtTime(0.9, t + delay + 0.01); n.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.9);
    s.connect(f).connect(n).connect(this.out); s.start(t + delay); s.stop(t + delay + 1);
    const cr = c.createBufferSource(), hf = c.createBiquadFilter(), cg = c.createGain();
    cr.buffer = this.white; hf.type = 'highpass'; hf.frequency.value = 5000;
    cg.gain.setValueAtTime(0, t + delay + 0.1); cg.gain.linearRampToValueAtTime(0.06, t + delay + 0.2); cg.gain.exponentialRampToValueAtTime(0.001, t + delay + 1.8);
    cr.connect(hf).connect(cg).connect(this.out); cr.start(t + delay + 0.1); cr.stop(t + delay + 1.9);
  }
  impulse(sec, decay) {
    const c = this.ctx, n = (c.sampleRate * sec) | 0, b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay; }
    return b;
  }
  noiseBuf(kind, sec) {
    const c = this.ctx, n = (c.sampleRate * sec) | 0, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else { b0 = 0.997 * b0 + 0.029 * w; b1 = 0.985 * b1 + 0.032 * w; b2 = 0.95 * b2 + 0.048 * w; d[i] = (b0 + b1 + b2 + w * 0.05) * 0.9; }
    }
    return b;
  }

  // ───── 고르기 ─────
  setMusic(id) {
    if (!this.ensure()) return;
    this.stopLayer(this.music);
    this.music = id ? this.startMusic(id) : null;
  }
  setAmbient(id) {
    if (!this.ensure()) return;
    this.stopLayer(this.amb);
    this.amb = id ? this.startAmbient(id) : null;
  }
  setVolume(kind, v) {
    if (kind === 'music') { this.musicVol = v; this.mBus && this.mBus.gain.setTargetAtTime(v * 1.4, this.ctx.currentTime, 0.05); }
    else { this.ambVol = v; this.aBus && this.aBus.gain.setTargetAtTime(v * 0.8, this.ctx.currentTime, 0.05); }
  }
  stopLayer(L) {
    if (!L) return;
    L.dead = true;
    const t = this.ctx.currentTime;
    L.gain.gain.cancelScheduledValues(t);
    L.gain.gain.setValueAtTime(L.gain.gain.value, t);
    L.gain.gain.linearRampToValueAtTime(0, t + 1.2);
    setTimeout(() => { L.stop?.(); L.gain.disconnect(); }, 1400);
  }
  layer(bus, fadeIn = 1.5, level = 1) {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(level, this.ctx.currentTime + fadeIn);
    g.connect(bus);
    return { gain: g, dead: false, next: this.ctx.currentTime + 0.1, step: 0, nodes: [] };
  }
  // 반복해서 다음 소리를 미리 깔아 둬요 (탭이 뒤에 있어도 끊기지 않게 1.5초 앞까지)
  tick() {
    const ahead = this.ctx.currentTime + 1.5;
    for (const L of [this.music, this.amb]) {
      if (!L || L.dead) continue;
      let guard = 0;
      while (L.next < ahead && guard++ < 200) L.sched(L.next);
    }
  }

  // ───── 소리 재료 ─────
  env(g, t, a, peak, d, sustain = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
  }
  voice(L, { t, f, type = 'sine', a = 0.01, d = 0.5, vol = 0.2, cut = 0, q = 0.7, wet = 0.2, detune = 0, len }) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    let node = o;
    if (cut) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cut; fl.Q.value = q; o.connect(fl); node = fl; }
    node.connect(g);
    this.env(g, t, a, vol, d);
    g.connect(L.gain);
    if (wet) { const s = c.createGain(); s.gain.value = wet; g.connect(s); s.connect(this.verbIn); }
    o.start(t); o.stop(t + (len || a + d) + 0.05);
  }
  noise(L, { t, buf = this.white, type = 'highpass', f = 6000, q = 0.7, a = 0.002, d = 0.05, vol = 0.1, wet = 0, rate = 1 }) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; s.playbackRate.value = rate;
    fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    s.connect(fl).connect(g);
    this.env(g, t, a, vol, d);
    g.connect(L.gain);
    if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.verbIn); }
    s.start(t, Math.random() * (buf.duration - a - d - 0.1)); s.stop(t + a + d + 0.05);
  }
  kick(L, t, vol = 0.5) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    o.connect(g); this.env(g, t, 0.003, vol, 0.35); g.connect(L.gain);
    o.start(t); o.stop(t + 0.45);
  }
  // 계속 나는 소음 (빗줄기 · 파도 바탕)
  bed(L, buf, { type = 'lowpass', f = 1000, q = 0.5, vol = 0.3, f2 }) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; s.loop = true;
    fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    let n = s.connect(fl);
    if (f2) { const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = f2; n = n.connect(h); }
    n.connect(g); g.gain.value = vol; g.connect(L.gain);
    s.start(this.ctx.currentTime, Math.random() * buf.duration);
    L.nodes.push(s);
    return { src: s, filter: fl, gain: g };
  }

  // ───── 배경음악 5곡 ─────
  startMusic(id) {
    const L = this.layer(this.mBus, 2.5, LEVEL[id] ?? 1);
    L.stop = () => L.nodes.forEach((n) => { try { n.stop(); } catch {} });
    const S = this;
    if (id === 'lofi') {
      // 72bpm, 16분음표 · 살짝 늘어지는 스윙. Fmaj9 → Em7 → Dm9 → Cmaj7
      const sp = 60 / 72 / 4;
      const CH = [[53, 57, 60, 64, 67], [52, 55, 59, 62], [50, 53, 57, 60, 64], [48, 52, 55, 59, 62]];
      const MEL = [72, 74, 76, 79, 81, 84];
      S.bed(L, S.white, { type: 'bandpass', f: 3500, q: 0.4, vol: 0.006 }); // 레코드 지글
      L.sched = (t) => {
        const st = L.step % 16, bar = ((L.step / 16) | 0) % 4, ch = CH[bar];
        const sw = st % 2 ? sp * 0.18 : 0, tt = t + sw;
        if (st === 0 || st === 10) ch.forEach((m, k) => S.voice(L, { t: tt + k * 0.012, f: mtof(m), type: 'triangle', a: 0.02, d: st ? 1.4 : 2.4, vol: 0.05, cut: 1600, wet: 0.35, detune: rnd(-6, 6) }));
        if (st === 0 || st === 7 || st === 10) S.voice(L, { t: tt, f: mtof(ch[0] - 12), type: 'sine', a: 0.01, d: 0.6, vol: 0.22, wet: 0 });
        if (st === 0 || st === 9) S.kick(L, tt, 0.42);
        if (st === 4 || st === 12) S.noise(L, { t: tt, type: 'bandpass', f: 1800, q: 0.8, d: 0.16, vol: 0.12, wet: 0.25 });
        if (st % 2 === 0) S.noise(L, { t: tt, f: 7500, d: 0.035, vol: rnd(0.02, 0.045) });
        if (Math.random() < 0.13 && st % 2 === 0) S.voice(L, { t: tt, f: mtof(pick(MEL)), type: 'sine', a: 0.01, d: 1.2, vol: 0.06, wet: 0.5 });
        L.step++; L.next += sp;
      };
    } else if (id === 'piano') {
      // 66bpm 8분음표 아르페지오. C → G/B → Am → F
      const sp = 60 / 66 / 2;
      const CH = [[48, 55, 60, 64, 67], [47, 55, 59, 62, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60]];
      const ORD = [0, 2, 3, 4, 3, 2, 1, 2];
      L.sched = (t) => {
        const st = L.step % 8, bar = ((L.step / 8) | 0) % 4, ch = CH[bar];
        const piano = (m, vol, d) => { S.voice(L, { t, f: mtof(m), type: 'triangle', a: 0.005, d, vol, cut: 2600, wet: 0.45 }); S.voice(L, { t, f: mtof(m + 12), type: 'sine', a: 0.005, d: d * 0.5, vol: vol * 0.25, wet: 0.45 }); };
        if (st === 0) piano(ch[0] - 12, 0.1, 3.2);
        piano(ch[ORD[st]], st === 0 ? 0.09 : rnd(0.05, 0.075), 2.2);
        if ((st === 0 || st === 5) && Math.random() < 0.6) piano(pick(ch.slice(2)) + 12, 0.06, 2.6);
        L.step++; L.next += sp * (st % 2 ? 0.94 : 1.06);
      };
    } else if (id === 'space') {
      // 한 화음이 8초. 넓게 퍼진 패드 + 가끔 멀리서 종소리
      const CH = [[50, 57, 62, 66, 69, 76], [47, 54, 59, 62, 66, 73], [43, 50, 55, 59, 62, 69], [45, 52, 57, 61, 64, 71]];
      L.sched = (t) => {
        const ch = CH[L.step % 4];
        ch.forEach((m, k) => {
          for (const dt of [-9, 9]) S.voice(L, { t: t + k * 0.15, f: mtof(m), type: 'sawtooth', a: 3, d: 7, vol: 0.012, cut: 700 + k * 80, wet: 0.7, detune: dt, len: 10 });
        });
        S.voice(L, { t, f: mtof(ch[0] - 12), type: 'sine', a: 2.5, d: 7, vol: 0.12, wet: 0.2, len: 10 });
        for (let i = 0; i < 3; i++) if (Math.random() < 0.7) S.voice(L, { t: t + rnd(1, 7), f: mtof(pick(ch) + 24), type: 'sine', a: 0.01, d: 4, vol: 0.03, wet: 0.9 });
        L.step++; L.next += 8;
      };
    } else if (id === 'drive') {
      // 92bpm 신스웨이브: 8분 베이스 · 16분 아르페지오 · 4박 킥 · 2·4박 스네어. Am → F → C → G
      const sp = 60 / 92 / 4;
      const CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
      L.sched = (t) => {
        const st = L.step % 16, bar = ((L.step / 16) | 0) % 4, ch = CH[bar];
        if (st === 0) ch.forEach((m) => { for (const dt of [-12, 12]) S.voice(L, { t, f: mtof(m), type: 'sawtooth', a: 0.4, d: 2.2, vol: 0.016, cut: 1400, wet: 0.5, detune: dt, len: 2.6 }); });
        if (st % 2 === 0) S.voice(L, { t, f: mtof(ch[0] - 24 + (st % 4 === 2 ? 12 : 0)), type: 'sawtooth', a: 0.005, d: 0.22, vol: 0.09, cut: 520, q: 4 });
        S.voice(L, { t, f: mtof([...ch, ch[0] + 12][st % 4] + 12), type: 'square', a: 0.003, d: 0.14, vol: 0.022, cut: 2400, wet: 0.35 });
        if (st % 4 === 0) S.kick(L, t, 0.38);
        if (st === 4 || st === 12) S.noise(L, { t, type: 'bandpass', f: 2200, q: 0.6, d: 0.28, vol: 0.13, wet: 0.6 });
        if (st % 4 === 2) S.noise(L, { t, f: 8000, d: 0.05, vol: 0.03 });
        L.step++; L.next += sp;
      };
    } else if (id === 'chip') {
      // 108bpm 8비트: 네모파 멜로디(2마디 짜리 가락을 만들어 반복) · 세모파 베이스 · 잡음 드럼
      const sp = 60 / 108 / 4;
      const CH = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
      const SCALE = [60, 62, 64, 67, 69, 72, 74, 76];
      let motif = null;
      const newMotif = () => Array.from({ length: 32 }, (_, i) => (i % 2 === 0 && Math.random() < 0.72 ? pick(SCALE) : i % 4 === 0 ? pick(SCALE) : null));
      L.sched = (t) => {
        const st = L.step % 16, bar = ((L.step / 16) | 0) % 4, ch = CH[bar];
        if (L.step % 128 === 0) motif = newMotif();
        const m = motif[L.step % 32];
        if (m) S.voice(L, { t, f: mtof(m + (bar === 1 ? -3 : bar === 2 ? -7 : bar === 3 ? -5 : 0) + 12), type: 'square', a: 0.002, d: 0.16, vol: 0.028, wet: 0.08 });
        if (st % 2 === 0) S.voice(L, { t, f: mtof(ch[(st / 2) % 3] - 12), type: 'triangle', a: 0.002, d: 0.16, vol: 0.12 });
        if (st === 0 || st === 8) S.noise(L, { t, type: 'lowpass', f: 400, d: 0.08, vol: 0.18 });
        if (st === 4 || st === 12) S.noise(L, { t, type: 'bandpass', f: 3000, d: 0.07, vol: 0.07 });
        L.step++; L.next += sp;
      };
    }
    return L;
  }

  // ───── 배경음 5가지 ─────
  startAmbient(id) {
    const L = this.layer(this.aBus, 2, LEVEL[id] ?? 1);
    L.stop = () => L.nodes.forEach((n) => { try { n.stop(); } catch {} });
    const S = this;
    if (id === 'rain') {
      S.bed(L, S.pink, { type: 'lowpass', f: 2600, f2: 250, vol: 0.55 });
      S.bed(L, S.white, { type: 'bandpass', f: 5200, q: 0.5, vol: 0.035 });
      L.sched = (t) => { // 창틀에 떨어지는 굵은 빗방울
        S.noise(L, { t, type: 'bandpass', f: rnd(1800, 4200), q: 3, d: rnd(0.02, 0.05), vol: rnd(0.02, 0.07) });
        L.next += rnd(0.04, 0.35);
      };
    } else if (id === 'fire') {
      S.bed(L, S.brown, { type: 'lowpass', f: 380, vol: 0.5 });
      S.bed(L, S.pink, { type: 'bandpass', f: 900, q: 0.4, vol: 0.05 });
      L.sched = (t) => {
        const n = Math.random() < 0.25 ? (2 + Math.random() * 5) | 0 : 1; // 가끔 우르르
        for (let i = 0; i < n; i++) S.noise(L, { t: t + i * rnd(0.01, 0.05), type: 'highpass', f: rnd(1200, 3500), d: rnd(0.004, 0.03), vol: rnd(0.08, 0.3) });
        if (Math.random() < 0.08) S.noise(L, { t, type: 'lowpass', f: 300, d: 0.25, vol: 0.25 }); // 장작 툭
        L.next += rnd(0.05, 0.6);
      };
    } else if (id === 'keys') {
      // 단어 단위로 타닥타닥, 스페이스는 묵직하게, 가끔 멈춰서 생각
      S.bed(L, S.brown, { type: 'lowpass', f: 200, vol: 0.08 }); // 방 울림
      let left = 0;
      L.sched = (t) => {
        if (left <= 0) { left = (3 + Math.random() * 7) | 0; L.next += Math.random() < 0.15 ? rnd(1.2, 4) : rnd(0.12, 0.3); S.keyClick(L, t, true); return; }
        S.keyClick(L, t, false);
        left--; L.next += rnd(0.07, 0.17);
      };
    } else if (id === 'night') {
      S.bed(L, S.brown, { type: 'lowpass', f: 500, vol: 0.12 }); // 밤바람
      const crickets = [{ f: 4300, pan: -0.6, gap: 0.9 }, { f: 4700, pan: 0.5, gap: 1.15 }, { f: 3900, pan: 0.1, gap: 1.6 }];
      L.sched = (t) => {
        for (const cr of crickets) if (Math.random() < 0.55) S.chirp(L, t + rnd(0, cr.gap * 0.5), cr);
        L.next += 0.95;
      };
    } else if (id === 'waves') {
      const w = S.bed(L, S.pink, { type: 'lowpass', f: 500, vol: 0.05 });
      S.bed(L, S.brown, { type: 'lowpass', f: 180, vol: 0.2 });
      L.sched = (t) => { // 파도 하나: 6~10초에 걸쳐 밀려왔다 빠져요
        const len = rnd(6, 10), g = w.gain.gain, f = w.filter.frequency;
        g.setValueAtTime(0.05, t); g.linearRampToValueAtTime(rnd(0.5, 0.8), t + len * 0.4); g.linearRampToValueAtTime(0.06, t + len);
        f.setValueAtTime(400, t); f.linearRampToValueAtTime(rnd(1800, 2800), t + len * 0.42); f.linearRampToValueAtTime(450, t + len);
        L.next += len;
      };
    }
    return L;
  }
  keyClick(L, t, space) {
    this.noise(L, { t, type: 'bandpass', f: space ? 1400 : rnd(2600, 4200), q: 1.2, d: space ? 0.05 : rnd(0.018, 0.03), vol: space ? 0.22 : rnd(0.12, 0.22) });
    this.voice(L, { t, f: space ? 110 : rnd(170, 230), type: 'sine', a: 0.001, d: 0.05, vol: space ? 0.18 : 0.08, wet: 0 });
  }
  chirp(L, t, { f, pan }) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : null;
    o.type = 'sine'; o.frequency.value = f + rnd(-40, 40);
    o.connect(g);
    if (p) { p.pan.value = pan; g.connect(p); p.connect(L.gain); } else g.connect(L.gain);
    g.gain.setValueAtTime(0, t);
    const pulses = 3 + ((Math.random() * 2) | 0);
    for (let i = 0; i < pulses; i++) { const s = t + i * 0.032; g.gain.linearRampToValueAtTime(0.035, s + 0.006); g.gain.linearRampToValueAtTime(0, s + 0.024); }
    o.start(t); o.stop(t + pulses * 0.032 + 0.05);
  }
}
