// 실시간 접속: 층(서버)마다 방 중계 서버(Cloudflare Durable Object) 하나에 웹소켓으로 붙는다.
// 서버가 자리(책상 번호)를 나눠 주고, 위치·프로필·동작을 같은 층 사람들에게 전한다.
// 서버에 닿지 않으면 혼자 모드(내 화면만)로 돈다.
import { RELAY_URL, FLOORS } from './data.js';

export class Net {
  constructor(h) {
    this.h = h; // onHello, onState, onProfile, onSeat, onSeatNo, onAct, onLeave, onFull, onReset, onStatus
    this.ws = null;
    this.online = false;
    this.selfId = null;
    this.floor = 0;
    this.lastSt = null;
    this.lastPf = null;
  }

  async counts() {
    if (!RELAY_URL) return null;
    try {
      const r = await fetch(`${RELAY_URL}/counts?n=${FLOORS}`, { signal: AbortSignal.timeout(5000) });
      const j = await r.json();
      return j.counts;
    } catch { return null; }
  }

  join(floor, seat) {
    this.leave();
    this.floor = floor;
    this.wantSeat = seat;
    if (!RELAY_URL) { this.online = false; this.h.onStatus?.('solo'); return; }
    this.open(0);
  }

  open(attempt) {
    const floor = this.floor;
    const url = `${RELAY_URL.replace(/^http/, 'ws')}/ws?room=floor-${floor}&seat=${this.wantSeat ?? -1}`;
    let ws;
    try { ws = new WebSocket(url); } catch { this.h.onStatus?.('solo'); return; }
    this.ws = ws;
    const send = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
    this._send = send;
    let opened = false;
    ws.onopen = () => { opened = true; };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      switch (m.t) {
        case 'hello':
          this.online = true;
          this.selfId = m.id;
          this.wantSeat = m.seat;
          this.h.onStatus?.('online');
          this.h.onHello?.(m);
          if (this.lastPf) send({ t: 'pf', d: this.lastPf });
          if (this.lastSt) send({ t: 'st', d: this.lastSt });
          break;
        case 'st': this.h.onState?.(m.id, m.d); break;
        case 'pf': this.h.onProfile?.(m.id, m.d, m.seat); break;
        case 'seat': if (m.id === this.selfId) this.wantSeat = m.d; this.h.onSeat?.(m.id, m.d); break;
        case 'seat-no': this.h.onSeatNo?.(m.d); break;
        case 'act': this.h.onAct?.(m.id, m.d); break;
        case 'leave': this.h.onLeave?.(m.id); break;
        case 'full': ws.onclose = null; ws.close(); this.ws = null; this.h.onFull?.(floor); break;
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.online = false;
      this.h.onReset?.();
      // 처음부터 못 붙으면 혼자 모드로 알리고, 그래도 뒤에서 계속 다시 붙어 본다
      this.h.onStatus?.(opened ? 'reconnecting' : 'solo');
      setTimeout(() => { if (this.ws === ws) this.open(attempt + 1); }, Math.min(15000, 2000 * 2 ** attempt));
    };
    clearInterval(this.pinger);
    this.pinger = setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 25000);
  }

  sendState(d) { this.lastSt = d; this._send?.({ t: 'st', d }); }
  sendProfile(d) { this.lastPf = d; this._send?.({ t: 'pf', d }); }
  sendAct(d) { this._send?.({ t: 'act', d }); }
  askSeat(n) { this._send?.({ t: 'seat', d: n }); }

  leave() {
    if (this.ws) { const ws = this.ws; this.ws = null; ws.onclose = null; try { ws.close(); } catch {} }
    clearInterval(this.pinger);
    this._send = null;
    this.online = false;
    this.h.onReset?.();
  }
}
