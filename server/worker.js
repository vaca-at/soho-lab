// 소호랩 방 중계 서버.
// 층(floor-1 … floor-10) 하나가 Durable Object 하나. 층마다 20명, 책상 20개.
// 서버가 책상 번호를 나눠 주고(겹치지 않게), 위치·프로필·동작을 같은 층 사람들에게 그대로 전한다.
// 채팅은 없다: 글은 프로필(메모 5개, 결과물 링크 3개)로만 오간다. 비속어가 든 글은 지운다.
import { DurableObject } from 'cloudflare:workers';
import { findBad } from '../js/badwords.js';

const CAP = 20;
const FLOORS = 10;
const ROOM_RE = /^floor-([1-9]|10)$/;
const ORIGINS = ['https://soho-lab.site', 'https://www.soho-lab.site', 'https://vaca-at.github.io', 'http://127.0.0.1:8765', 'http://localhost:8765'];

function cors(req) {
  const o = req.headers.get('Origin');
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Vary': 'Origin' };
}
const json = (req, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(req) } });

// 결과물 미리보기용 OG 정보: 그 사이트의 og:image · 제목 · 설명 (하루 동안 캐시)
function metaOf(html, key) {
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, 'i'))?.[0];
  return (tag?.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
async function ogInfo(u) {
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SohoLabPreview/1.0; +https://soho-lab.site)', Accept: 'text/html' }, redirect: 'follow' });
  if (!(r.headers.get('content-type') || '').includes('html')) return { ok: false };
  const html = (await r.text()).slice(0, 400000);
  const abs = (v) => { try { return v ? safeUrl(new URL(v, r.url).href) : ''; } catch { return ''; } };
  return {
    ok: true,
    image: abs(metaOf(html, 'og:image') || metaOf(html, 'twitter:image')),
    title: str(metaOf(html, 'og:title') || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim(), 80),
    desc: str(metaOf(html, 'og:description') || metaOf(html, 'description'), 160),
  };
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/og') {
      const u = safeUrl(url.searchParams.get('u'));
      if (!u) return json(req, { ok: false }, 400);
      const key = new Request('https://og-cache.soho-lab/' + encodeURIComponent(u));
      const hit = await caches.default.match(key);
      let body;
      if (hit) body = await hit.json();
      else {
        try { body = await ogInfo(u); } catch { body = { ok: false }; }
        ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } })));
      }
      return json(req, body);
    }
    if (url.pathname === '/ws') {
      const origin = req.headers.get('Origin');
      if (origin && !ORIGINS.includes(origin)) return new Response('forbidden', { status: 403 });
      const room = url.searchParams.get('room') || '';
      if (!ROOM_RE.test(room)) return new Response('bad room', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(req);
    }
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: { ...cors(req), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' } });
    }
    if (url.pathname === '/counts') {
      const n = Math.min(FLOORS, Math.max(1, +url.searchParams.get('n') || FLOORS));
      const counts = await Promise.all(Array.from({ length: n }, (_, i) =>
        env.ROOMS.get(env.ROOMS.idFromName(`floor-${i + 1}`)).fetch('https://room/count').then((r) => r.json()).then((j) => j.n).catch(() => 0)));
      return json(req, { counts, cap: CAP });
    }
    // 방문: 하루 숫자만 센다 (누가 왔는지는 남기지 않음)
    if (url.pathname === '/visit' && req.method === 'POST') {
      await env.STATS.get(env.STATS.idFromName('stats')).fetch('https://stats/visit', { method: 'POST' });
      return json(req, { ok: true });
    }
    // 신고 보내기: 누구나. 글 1000자, 사진 1장(약 1.3MB까지). 같은 사람은 한 시간에 5건까지
    if (url.pathname === '/report' && req.method === 'POST') {
      const origin = req.headers.get('Origin');
      if (origin && !ORIGINS.includes(origin)) return json(req, { error: 'forbidden' }, 403);
      const body = await req.json().catch(() => null);
      if (!body) return json(req, { error: 'bad' }, 400);
      const text = str(body.text, 1000).trim();
      const img = typeof body.img === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(body.img) && body.img.length < 1_400_000 ? body.img : null;
      if (!text && !img) return json(req, { error: 'empty' }, 400);
      const c = body.ctx || {};
      const ctx = { floor: num(c.floor, 0, FLOORS), seat: num(c.seat, 0, CAP), reporter: str(c.reporter, 12), people: Array.isArray(c.people) ? c.people.slice(0, 30).map((n) => str(n, 12)) : [], ua: str(req.headers.get('User-Agent'), 160) };
      const who = (await sign(req.headers.get('CF-Connecting-IP') || '', env.ADMIN_PASSWORD || 'soho-salt')).slice(0, 16);
      const r = await env.STATS.get(env.STATS.idFromName('stats')).fetch('https://stats/report/add', { method: 'POST', body: JSON.stringify({ text, img, ctx, who }) });
      if (r.status === 429) return json(req, { error: 'too many' }, 429);
      return json(req, { ok: true });
    }
    // 관리자: 신고 목록 보기 · 지우기 (비밀번호는 npx wrangler secret put ADMIN_PASSWORD)
    if (url.pathname === '/admin/reports' || url.pathname === '/admin/report-delete') {
      const auth = (req.headers.get('Authorization') || '').replace(/^Bearer /, '').trim();
      if (!env.ADMIN_PASSWORD || !(await same(auth, env.ADMIN_PASSWORD.trim()))) return json(req, { error: 'unauthorized' }, 401);
      const stub = env.STATS.get(env.STATS.idFromName('stats'));
      if (url.pathname === '/admin/reports') return json(req, await stub.fetch('https://stats/report/list').then((r) => r.json()));
      const { id } = await req.json().catch(() => ({}));
      await stub.fetch('https://stats/report/delete', { method: 'POST', body: JSON.stringify({ id: String(id || '') }) });
      return json(req, { ok: true });
    }
    return json(req, { ok: true, name: 'soho-lab-rooms' });
  },
};

// 비밀번호 비교: 해시끼리 비교해서 글자 수나 앞부분으로 알아낼 수 없게
async function same(a, b) {
  const h = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
// 신고한 사람 구별용: 접속 주소를 알아볼 수 없게 바꾼 값
async function sign(msg, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ───────── 들어온 값 다듬기 ─────────
const str = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
const num = (v, lo, hi) => { const x = +v; return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
const ID = /^[a-z0-9_-]{1,16}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
function safeUrl(u) {
  try {
    const url = new URL(String(u || '').slice(0, 200));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href.slice(0, 200) : '';
  } catch { return ''; }
}
const clean = (s, n) => { const t = str(s, n); return findBad(t) ? '' : t; };
function cleanProfile(d) {
  if (!d || typeof d !== 'object') return null;
  const lk = d.look || {};
  const look = {
    body: ID.test(lk.body) ? lk.body : 'base',
    type: ID.test(lk.type) ? lk.type : 'hoodie',
    gender: lk.gender === 'f' ? 'f' : 'm',
    skin: COLOR.test(lk.skin) ? lk.skin : '#f4c9a6',
    outfit: ID.test(lk.outfit) ? lk.outfit : 'hoodie',
    oc: ID.test(lk.oc) ? lk.oc : '',
    hc: ID.test(lk.hc) ? lk.hc : '',
    acc: ID.test(lk.acc) ? lk.acc : 'none',
    pet: ID.test(lk.pet) ? lk.pet : 'none',
  };
  const name = clean(d.n, 12).trim() || '이름 없는 개발자';
  const dk = d.desk && typeof d.desk === 'object' ? d.desk : {};
  const id = (v, def) => (ID.test(v) ? v : def);
  return {
    n: name,
    look,
    memos: (Array.isArray(d.memos) ? d.memos : []).slice(0, 5).map((m) => clean(m, 30)),
    links: (Array.isArray(d.links) ? d.links : []).slice(0, 3).map((l) => ({ t: clean(l?.t, 24), u: safeUrl(l?.u), d: clean(l?.d, 60) })).filter((l) => l.u),
    desk: { c: id(dk.c, 'oak'), ch: id(dk.ch, 'charcoal'), mon: id(dk.mon, 'm'), kb: id(dk.kb, 'basic'), chair: id(dk.chair, 'basic'), it: (Array.isArray(dk.it) ? dk.it : []).slice(0, 16).filter((x) => ID.test(x)) },
    mm: ['auto', 'one', 'off'].includes(d.mm) ? d.mm : 'auto',
    mi: Math.max(0, Math.min(4, d.mi | 0)),
    lv: Math.max(1, Math.min(99, d.lv | 0)),
  };
}
function cleanState(d) {
  if (!d || typeof d !== 'object') return null;
  return { x: num(d.x, -20, 20), z: num(d.z, -20, 20), ry: num(d.ry, -10, 10), sit: !!d.sit, idle: !!d.idle, a: ID.test(d.a) ? d.a : '' };
}

// 방문 수 저장소 (하나뿐)
const kstDay = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
export class Stats extends DurableObject {
  async fetch(req) {
    const url = new URL(req.url);
    // 신고: 한 건씩 'r:<시각>' 열쇠로 저장, 최근 200건만
    if (url.pathname === '/report/add') {
      const r = await req.json();
      const rl = (await this.ctx.storage.get(`rl:${r.who}`)) || [];
      const recent = rl.filter((t) => Date.now() - t < 3600e3);
      if (recent.length >= 5) return Response.json({ error: 'too many' }, { status: 429 });
      await this.ctx.storage.put(`rl:${r.who}`, [...recent, Date.now()]);
      const id = `r:${String(Date.now()).padStart(15, '0')}`;
      await this.ctx.storage.put(id, { ...r, id, at: Date.now() });
      const all = await this.ctx.storage.list({ prefix: 'r:', reverse: true });
      const old = [...all.keys()].slice(200);
      if (old.length) await this.ctx.storage.delete(old);
      return Response.json({ ok: true });
    }
    if (url.pathname === '/report/list') {
      const all = await this.ctx.storage.list({ prefix: 'r:', reverse: true, limit: 100 });
      return Response.json({ reports: [...all.values()].map(({ who, ...x }) => x) });
    }
    if (url.pathname === '/report/delete') {
      const { id } = await req.json();
      if (/^r:\d{15}$/.test(id)) await this.ctx.storage.delete(id);
      return Response.json({ ok: true });
    }
    const s = (await this.ctx.storage.get('s')) || { total: 0, days: {} };
    if (url.pathname === '/visit') {
      const d = kstDay();
      s.total++;
      s.days[d] = (s.days[d] || 0) + 1;
      const keys = Object.keys(s.days).sort();
      for (const k of keys.slice(0, Math.max(0, keys.length - 90))) delete s.days[k];
      await this.ctx.storage.put('s', s);
      return Response.json({ ok: true });
    }
    return Response.json({ total: s.total, today: s.days[kstDay()] || 0, days: s.days });
  }
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  members() {
    return this.ctx.getWebSockets().map((ws) => ({ ws, a: ws.deserializeAttachment() })).filter((m) => m.a?.id);
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/count') return Response.json({ n: this.members().length });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const others = this.members().filter((m) => m.ws !== server);
    if (others.length >= CAP) {
      server.send(JSON.stringify({ t: 'full' }));
      server.close(4001, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }
    // 책상: 원하던 자리가 비었으면 그 자리, 아니면 앞에서부터 빈 자리
    const taken = new Set(others.map((m) => m.a.seat));
    const want = +url.searchParams.get('seat');
    let seat = Number.isInteger(want) && want >= 0 && want < CAP && !taken.has(want) ? want : -1;
    if (seat < 0) for (let i = 0; i < CAP; i++) if (!taken.has(i)) { seat = i; break; }
    const id = crypto.randomUUID().slice(0, 8);
    server.serializeAttachment({ id, seat, st: null, pf: null, n: 0, w: Date.now() });
    const peers = others.filter((m) => m.a.pf).map((m) => ({ id: m.a.id, seat: m.a.seat, st: m.a.st, pf: m.a.pf }));
    server.send(JSON.stringify({ t: 'hello', id, seat, peers }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > 4000) return;
    const a = ws.deserializeAttachment();
    if (!a) return;
    // 1초에 15개 넘게 보내면 버린다
    const now = Date.now();
    if (now - a.w > 1000) { a.w = now; a.n = 0; }
    if (++a.n > 15) { ws.serializeAttachment(a); return; }
    let m; try { m = JSON.parse(msg); } catch { return; }
    if (m.t === 'st') {
      const st = cleanState(m.d);
      if (!st) return;
      a.st = st;
      ws.serializeAttachment(a);
      if (a.pf) this.broadcast({ t: 'st', id: a.id, d: st }, ws);
    } else if (m.t === 'pf') {
      const pf = cleanProfile(m.d);
      if (!pf) return;
      a.pf = pf;
      ws.serializeAttachment(a);
      this.broadcast({ t: 'pf', id: a.id, d: pf, seat: a.seat }, ws);
      if (a.st) this.broadcast({ t: 'st', id: a.id, d: a.st }, ws);
    } else if (m.t === 'seat') {
      const want = m.d | 0;
      const busy = this.members().some((x) => x.ws !== ws && x.a.seat === want);
      if (want < 0 || want >= CAP || busy) { ws.serializeAttachment(a); ws.send(JSON.stringify({ t: 'seat-no', d: want })); return; }
      a.seat = want;
      ws.serializeAttachment(a);
      this.broadcast({ t: 'seat', id: a.id, d: want });
    } else if (m.t === 'act' && m.d && a.pf) {
      ws.serializeAttachment(a);
      // 폭죽: 같은 층 모두의 천장에 터져요 (한 사람이 20초에 한 번)
      if (m.d.fw) {
        if (now - (a.fw || 0) < 20000) { ws.serializeAttachment(a); return; }
        a.fw = now;
        ws.serializeAttachment(a);
        this.broadcast({ t: 'act', id: a.id, d: { fw: num(m.d.fw, 0.001, 1) } }, ws);
        return;
      }
      const d = m.d.m !== undefined ? { m: Math.max(0, Math.min(4, m.d.m | 0)) } : { a: ID.test(m.d.a) ? m.d.a : '' };
      this.broadcast({ t: 'act', id: a.id, d }, ws);
    } else ws.serializeAttachment(a);
  }

  webSocketClose(ws, code) {
    const a = ws.deserializeAttachment();
    ws.serializeAttachment(null);
    if (a?.pf) this.broadcast({ t: 'leave', id: a.id }, ws);
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch {}
  }

  webSocketError(ws) { this.webSocketClose(ws, 1011); }

  broadcast(obj, except) {
    const s = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) { try { ws.send(s); } catch {} }
  }
}
