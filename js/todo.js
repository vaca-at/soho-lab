// 할 일 · 메모: 날마다 따로, 이 기기에만 저장 (다른 사람에게는 안 보여요)
// - 할 일: 적고 Enter · 체크 · × 지우기 · ⠿ 끌어서 순서 바꾸기 (⠿ 에서 ↑ ↓ 키도 돼요)
// - 메모: 그날 자유롭게 적는 칸. 적으면 바로 저장돼요
// - ‹ › 로 다른 날짜, 자정이 지나면 '오늘'이 새 날짜로
const MAX_TODOS = 50, MAX_TODO_LEN = 80, MAX_MEMO_LEN = 3000;
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dkey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shiftKey = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dkey(new Date(y, m - 1, d + n)); };

export function initTodo({ store, onCount = () => {} }) {
  const panel = $('#todo-panel');
  const list = $('#td-list', panel), form = $('#td-add', panel), input = $('#td-in', panel);
  const memo = $('#td-memo', panel), memoBox = $('#td-memo-box', panel), saved = $('#td-saved', panel), day = $('#td-day', panel);
  let todayKey = dkey(new Date()), dayKey = todayKey, data = { todos: [], memo: '' }, saveT = 0;

  const load = (k) => {
    const v = store.get('day.' + k, null);
    return { todos: Array.isArray(v?.todos) ? v.todos.filter((t) => t && typeof t.t === 'string').slice(0, MAX_TODOS) : [], memo: typeof v?.memo === 'string' ? v.memo : '' };
  };
  const save = () => {
    clearTimeout(saveT);
    saved.textContent = '';
    saveT = setTimeout(() => {
      const empty = !data.todos.length && !data.memo.trim();
      if (empty) { try { localStorage.removeItem('soho.day.' + dayKey); } catch {} }
      else store.set('day.' + dayKey, { todos: data.todos.slice(0, MAX_TODOS), memo: data.memo.slice(0, MAX_MEMO_LEN) });
      saved.textContent = '저장했어요 ✓';
    }, 300);
    count();
  };
  // 위 단추에 오늘 할 일 '끝낸 수/전체'
  const count = () => {
    const t = dayKey === todayKey ? data.todos : load(todayKey).todos;
    onCount(t.filter((x) => x.d).length, t.length);
  };

  function renderDay() {
    const diff = Math.round((new Date(dayKey + 'T00:00') - new Date(todayKey + 'T00:00')) / 864e5);
    const [, m, d] = dayKey.split('-').map(Number);
    const dw = DAYS[new Date(dayKey + 'T00:00').getDay()];
    day.textContent = diff === 0 ? '오늘' : diff === -1 ? '어제' : diff === 1 ? '내일' : `${m}/${d} (${dw})`;
    day.title = `${m}월 ${d}일 ${dw}요일`;
  }
  function render() {
    const n = data.todos.length;
    list.innerHTML = n
      ? data.todos.map((t, i) => `<li class="${t.d ? 'done' : ''}">${n > 1 ? `<button type="button" class="grip" data-grip="${i}" aria-label="${esc(t.t)} 순서 바꾸기 (끌거나 ↑ ↓ 키)" title="끌어서 순서 바꾸기">⠿</button>` : ''}<label><input type="checkbox" data-i="${i}" ${t.d ? 'checked' : ''}><span>${esc(t.t)}</span></label><button type="button" class="x" data-del="${i}" aria-label="${esc(t.t)} 지우기">×</button></li>`).join('')
      : '<li class="none">아직 할 일이 없어요</li>';
    if (document.activeElement !== memo) memo.value = data.memo;
    if (data.memo && !memoBox.open) memoBox.open = true;
    const done = data.todos.filter((t) => t.d).length;
    $('#td-prog', panel).textContent = n ? `${done}/${n}` : '';
    $('#td-bar', panel).style.width = n ? `${(done / n) * 100}%` : '0%';
  }
  function go(k) {
    dayKey = k; data = load(k); saved.textContent = '';
    renderDay(); render(); count();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = input.value.trim().slice(0, MAX_TODO_LEN);
    if (!t) return;
    if (data.todos.length >= MAX_TODOS) { saved.textContent = `하루에 ${MAX_TODOS}개까지 적을 수 있어요`; return; }
    data.todos.push({ t, d: false });
    input.value = '';
    render(); save();
  });
  list.addEventListener('change', (e) => {
    const c = e.target.closest('input[data-i]'); if (!c) return;
    data.todos[+c.dataset.i].d = c.checked; render(); save();
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    data.todos.splice(+b.dataset.del, 1); render(); save();
  });
  // ⠿ 를 잡고 위아래로 끌면 순서가 바뀌어요 (손가락도 돼요)
  const reorder = (ord) => {
    if (ord.length !== data.todos.length || ord.every((v, k) => v === k)) { render(); return; }
    data.todos = ord.map((i) => data.todos[i]); render(); save();
  };
  let drag = null;
  list.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-grip]'); if (!h) return;
    e.preventDefault(); h.setPointerCapture(e.pointerId);
    drag = { li: h.closest('li'), id: e.pointerId }; drag.li.classList.add('drag');
  });
  list.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const over = [...list.children].find((x) => { const r = x.getBoundingClientRect(); return x !== drag.li && e.clientY >= r.top && e.clientY <= r.bottom; });
    if (!over) return;
    const r = over.getBoundingClientRect();
    list.insertBefore(drag.li, e.clientY < r.top + r.height / 2 ? over : over.nextSibling);
  });
  const drop = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null; reorder([...list.querySelectorAll('[data-grip]')].map((x) => +x.dataset.grip));
  };
  list.addEventListener('pointerup', drop);
  list.addEventListener('pointercancel', drop);
  list.addEventListener('keydown', (e) => {
    const h = e.target.closest('[data-grip]'); if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const i = +h.dataset.grip, j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= data.todos.length) return;
    const ord = data.todos.map((_, k) => k); [ord[i], ord[j]] = [ord[j], ord[i]];
    reorder(ord); list.querySelector(`[data-grip="${j}"]`)?.focus();
  });
  memo.addEventListener('input', () => { data.memo = memo.value.slice(0, MAX_MEMO_LEN); save(); });
  $('#td-prev', panel).onclick = () => go(shiftKey(dayKey, -1));
  $('#td-next', panel).onclick = () => go(shiftKey(dayKey, 1));
  day.onclick = () => { if (dayKey !== todayKey) go(todayKey); };
  // 자정이 지나면 '오늘'을 새 날짜로
  setInterval(() => {
    const k = dkey(new Date()); if (k === todayKey) return;
    const was = dayKey === todayKey; todayKey = k;
    if (was) go(k); else { renderDay(); count(); }
  }, 60000);
  // 다른 탭에서 고치면 여기도 바로
  addEventListener('storage', (e) => { if (e.key === 'soho.day.' + dayKey && document.activeElement !== memo) { data = load(dayKey); render(); count(); } });

  go(todayKey);
  return {
    open(v = panel.hidden) {
      panel.hidden = !v;
      store.set('todoOpen', v);
      if (v && !data.todos.length) setTimeout(() => input.focus(), 50);
      return v;
    },
    get isOpen() { return !panel.hidden; },
  };
}
