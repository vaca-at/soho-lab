// 앱 전체에서 쓰는 고정 데이터: 층(서버), 자리, 캐릭터(체형·머리·옷), 친구, 책상 꾸미기, 동작, 기본 메모

const Q = new URLSearchParams(location.search);

// 방 중계 서버 주소 (server/ 폴더의 Cloudflare Worker).
// ?relay=local 이면 내 컴퓨터에서 띄운 서버(wrangler dev), ?solo 면 혼자 보기
export const RELAY_URL = Q.get('relay') === 'local' ? 'http://127.0.0.1:8787'
  : Q.has('solo') ? ''
  : 'https://soho-lab-rooms.bellachord.workers.dev';

export const SITE = 'https://soho-lab.site';
export const FLOORS = 10; // 서버 = 층. 1층부터 10층까지
export const SEATS = 20; // 층마다 책상 20개, 20명까지
// 층마다 사무실 테마 (world.js 의 THEMES id). 1층부터 차례로
export const FLOOR_THEMES = ['loft', 'white', 'neon', 'forest', 'nordic', 'hanok', 'space', 'cafe', 'library', 'beach'];
export const MAX_MEMOS = 5; // 머리 위 메모 (첫 번째 메모가 '지금 하는 일'처럼 모니터 아래 줄에도 떠요)
export const MAX_LINKS = 3; // 자랑하는 결과물
export const MAX_ITEMS = 8; // 책상 위 소품 (6 m 책상)
export const LIMITS = { name: 12, memo: 30, title: 24, desc: 60, url: 200 };

export const SKIN_TONES = ['#f4c9a6', '#e8b48c', '#d79b72', '#b97a55', '#8d5a3b'];

// ───────── 캐릭터 ─────────
// 체형: 얼굴은 같고 키·등신·체격만 달라요 (캠핑장과 같은 표). k 전체 · leg 다리 · th 몸통 · tw 어깨 · head 머리 · limb 팔다리 굵기
export const BODIES = [
  { id: 'base', label: '보통', k: 1, leg: 1, th: 1, tw: 1, head: 1, limb: 1 },
  { id: 'sturdy', label: '듬직한 체격', k: 1, leg: 1, th: 1, tw: 1.28, head: 1, limb: 1.25 },
  { id: 'petite', label: '아담한 키', k: 0.95, leg: 0.76, th: 0.92, tw: 1, head: 1, limb: 1 },
  { id: 'teen', label: '조금 작은 키', k: 0.9, leg: 0.9, th: 0.9, tw: 0.92, head: 1.03, limb: 0.92 },
  { id: 'child', label: '작은 키', k: 0.82, leg: 0.62, th: 0.72, tw: 0.86, head: 1.12, limb: 0.86 },
  { id: 'tiny', label: '아주 작은 키', k: 0.72, leg: 0.48, th: 0.58, tw: 0.82, head: 1.16, limb: 0.82 },
];
export const bodyOf = (look) => BODIES.find((b) => b.id === look?.body) || BODIES[0];

export const GENDERS = [{ id: 'f', name: '여자', cap: '여자 머리 8가지' }, { id: 'm', name: '남자', cap: '남자 머리 8가지' }];

// 머리 스타일 (blocky.js 의 PRESETS · HAIR 와 짝). 머리 색도 여기서 정해져요
export const CHAR_TYPES = [
  { id: 'moral', hairF: '단발', hairM: '옆 가르마', color: '까만 머리' },
  { id: 'appteacher', hairF: '낮은 묶음', hairM: '스포츠', color: '까만 머리' },
  { id: 'tycoon', hairF: '올림머리', hairM: '올백', color: '까만 머리' },
  { id: 'trainee', hairF: '땋은 머리', hairM: '바가지', color: '밤색 머리' },
  { id: 'planner', hairF: '웨이브', hairM: '가운데 가르마', color: '갈색 머리' },
  { id: 'knitdev', hairF: '양갈래', hairM: '곱슬', color: '까만 머리' },
  { id: 'hoodie', hairF: '숏컷', hairM: '투블럭', color: '짙은 갈색' },
  { id: 'beige', hairF: '긴 생머리', hairM: '묶은 머리', color: '갈색 머리' },
];
export const hairName = (t, gender) => (gender === 'm' ? t.hairM : t.hairF);

// 옷: 예전 '캐릭터' 8가지 차림(wear_…) + 사무실 · 편한 옷. 머리 스타일과 따로 골라서 조합해요
// style 'own' + preset: 그 캐릭터 고유 차림. deco: 상의 무늬
export const OUTFITS = [
  { id: 'wear_hoodie', name: '초록 후드티', cap: '모자 달린 후드와 끈', style: 'own', preset: 'hoodie' },
  { id: 'wear_appteacher', name: '초록 셔츠와 안경', cap: '동그란 안경', style: 'own', preset: 'appteacher' },
  { id: 'wear_knitdev', name: '초록 줄무늬 니트', cap: '포근한 스웨터', style: 'own', preset: 'knitdev' },
  { id: 'wear_beige', name: '베이지 재킷', cap: '검은 상의와 바지', style: 'own', preset: 'beige' },
  { id: 'wear_moral', name: '남색 카디건', cap: '흰 깃이 보이는 차림', style: 'own', preset: 'moral' },
  { id: 'wear_trainee', name: '파란 모자와 명찰', cap: '흰 셔츠에 목걸이 명찰', style: 'own', preset: 'trainee' },
  { id: 'wear_planner', name: '베레모와 분홍 니트', cap: '빨간 베레모', style: 'own', preset: 'planner' },
  { id: 'wear_tycoon', name: '검은 정장', cap: '빨간 넥타이', style: 'own', preset: 'tycoon' },
  { id: 'mtm', name: '회색 맨투맨', cap: '편한 맨투맨에 조거 바지', top: '#9aa0a6', bottom: '#2f3540', style: 'plain' },
  { id: 'flannel', name: '체크 셔츠', cap: '빨간 체크 남방', top: '#b8403a', bottom: '#2c3450', deco: 'check', decoC: '#6a2420', style: 'plain' },
  { id: 'turtle', name: '검은 터틀넥', cap: '개발자 국룰', top: '#1f1f22', bottom: '#3a3c42', style: 'plain' },
  { id: 'sky', name: '하늘 셔츠', cap: '단추 달린 하늘색 셔츠', top: '#a9c8e8', bottom: '#3a3f4a', deco: 'buttons', decoC: '#7a9cc0', style: 'plain' },
  { id: 'cardigan', name: '도톰한 가디건', cap: '겨자색 가디건에 면바지', top: '#d9a441', bottom: '#cdbb9a', deco: 'buttons', decoC: '#6e4c30', style: 'plain' },
  { id: 'track', name: '트레이닝복', cap: '흰 줄 세 개 운동복', top: '#2f6f62', bottom: '#2f6f62', deco: 'track', decoC: '#f4f4f2', style: 'plain' },
  { id: 'windbreaker', name: '바람막이', cap: '주황 바람막이에 검은 바지', top: '#e2603d', bottom: '#2f3540', deco: 'track', decoC: '#2f3540', style: 'plain' },
  { id: 'fleece', name: '플리스', cap: '복슬복슬 크림 플리스', top: '#efe6d2', bottom: '#5a6b52', deco: 'puffer', decoC: '#e2d8c0', style: 'plain' },
  { id: 'puffer', name: '패딩 점퍼', cap: '퇴근길 남색 패딩', top: '#2f3e66', bottom: '#2a2a2c', deco: 'puffer', decoC: '#26345a', style: 'plain' },
  { id: 'overalls', name: '청 멜빵바지', cap: '흰 티에 청 멜빵', top: '#f4f4f2', bottom: '#4a6fa5', deco: 'overalls', decoC: '#4a6fa5', style: 'plain' },
  { id: 'pajama', name: '잠옷', cap: '분홍 줄무늬 잠옷 (재택 모드)', top: '#f3d6e0', bottom: '#f3d6e0', deco: 'stripes', decoC: '#e58fa6', style: 'plain' },
  // 예전 값: 머리 스타일(type)에 딸린 차림. 저장된 모습을 불러올 때 wear_… 로 바꿔요
  { id: 'own', name: '캐릭터 기본 옷', style: 'own', hidden: true },
];

export const ACCESSORIES = [
  { id: 'none', name: '없음', cap: '소품 빼기' },
  { id: 'headphones', name: '헤드폰', cap: '집중할 때 필수' },
  { id: 'glasses', name: '뿔테 안경', cap: '갈색 뿔테' },
  { id: 'roundglasses', name: '동그란 안경', cap: '얇은 금테' },
  { id: 'sunglasses', name: '선글라스', cap: '까만 네모' },
  { id: 'beanie', name: '털모자', cap: '빨간 비니' },
  { id: 'ribbon', name: '리본 핀', cap: '커다란 빨간 리본' },
  { id: 'lotuspin', name: '꽃 핀', cap: '분홍 꽃' },
  { id: 'scarf', name: '목도리', cap: '포근한 체크 목도리' },
  { id: 'bowtie', name: '나비넥타이', cap: '빨간 나비넥타이' },
  { id: 'backpack', name: '백팩', cap: '노트북 가방' },
];

// 책상 친구: 소호랩 기본 + 캠핑장 · 큰법당에서 인기 많았던 친구들. 고르는 목록 순서 (동물 → 사물 → AI → 없음)
export const PET_IDS = [
  'dog', 'cat', 'russianblue', 'baekgu', 'hamster', 'squirrel', 'bunny', 'otter', 'panda', 'turtle', 'squid', 'fishbowl',
  'coffee', 'icecoffee', 'book', 'laptop', 'tablet',
  'ai', 'claude', 'drone',
  'none',
];
export const NEW_PETS = new Set(['russianblue', 'baekgu', 'squirrel', 'otter', 'panda', 'turtle', 'squid', 'fishbowl', 'laptop', 'tablet']);

// ───────── 책상 꾸미기 ─────────
export const DESK_COLORS = [
  { id: 'oak', name: '원목', c: '#d8c3a0' },
  { id: 'white', name: '화이트', c: '#ecebe6' },
  { id: 'walnut', name: '월넛', c: '#7a5236' },
  { id: 'black', name: '블랙', c: '#2b2d33' },
  { id: 'mint', name: '민트', c: '#a9d8c6' },
  { id: 'pink', name: '핑크', c: '#f0c4cc' },
  { id: 'sky', name: '하늘', c: '#b8d0ea' },
];
export const CHAIR_COLORS = [
  { id: 'charcoal', name: '차콜', c: '#3d4452' },
  { id: 'navy', name: '남색', c: '#2f3f6a' },
  { id: 'wine', name: '와인', c: '#6a2f42' },
  { id: 'teal', name: '청록', c: '#2f6a66' },
  { id: 'terra', name: '테라코타', c: '#c26a4a' },
  { id: 'cream', name: '크림', c: '#e8e0cf' },
  { id: 'orange', name: '주황', c: '#e2873a' },
];
// ───────── 집중 → 경험치 · 포인트 → 책상 아이템 ─────────
// 책상에 앉아 있던 1분 = 1 XP = 1 P. XP 는 쌓이기만 하고(레벨), P 는 아이템을 사면 줄어요
export const levelOf = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 60)) + 1; // Lv2 1시간 · Lv3 4시간 · Lv5 16시간 · Lv10 81시간
export const xpForLevel = (lv) => (lv - 1) ** 2 * 60;
// tier: 0 기본 · 1 필수템 · 2 욕심템 · 3 사치템. price P, lv 필요한 레벨

export const MONITORS = [
  { id: 'm', name: '24인치', cap: '기본 모니터 하나', price: 0, lv: 1, tier: 0 },
  { id: 'l', name: '32인치', cap: '큼직한 모니터 하나', price: 300, lv: 2, tier: 1 },
  { id: 'd', name: '듀얼 모니터', cap: '24인치 두 대, 오른쪽은 터미널', price: 500, lv: 3, tier: 2 },
  { id: 'v', name: '가로 + 세로', cap: '하나는 세로로 세워 코드 길게', price: 600, lv: 3, tier: 2 },
  { id: 'w', name: '울트라와이드', cap: '34인치, 왼쪽은 파일 트리', price: 900, lv: 4, tier: 2 },
  { id: 'studio', name: '맥 모니터 5K', cap: '은색 알루미늄, 얇은 테두리', price: 2500, lv: 7, tier: 3 },
];
export const KEYBOARDS = [
  { id: 'basic', name: '기본 키보드', cap: '회사에서 준 그거', price: 0, lv: 1, tier: 0 },
  { id: 'mech', name: '기계식 키보드', cap: '알록달록 키캡, 딸깍딸깍', price: 200, lv: 2, tier: 1 },
  { id: 'split', name: '스플릿 키보드', cap: '반으로 나뉜 인체공학', price: 700, lv: 4, tier: 2 },
  { id: 'hhkb', name: '무접점 키보드', cap: '하얀 미니 배열, 보글보글', price: 900, lv: 5, tier: 3 },
];
export const CHAIRS = [
  { id: 'basic', name: '기본 의자', cap: '바퀴 달린 사무용', price: 0, lv: 1, tier: 0 },
  { id: 'gaming', name: '게이밍 의자', cap: '높은 등받이, 줄무늬', price: 800, lv: 4, tier: 2 },
  { id: 'mesh', name: '허먼밀러 의자', cap: '그물 등받이, 하루 종일 편안', price: 3000, lv: 8, tier: 3 },
];
// 책상 위 소품. 고른 순서대로 책상 빈자리(왼쪽 뒤 → 오른쪽 뒤 → …)에 놓여요. spot: 'mon' 은 모니터에 붙는 것
export const DESK_ITEMS = [
  { id: 'plant', name: '화분', price: 0, lv: 1, tier: 0 },
  { id: 'mug', name: '머그컵', price: 0, lv: 1, tier: 0 },
  { id: 'postit', name: '포스트잇', price: 0, lv: 1, tier: 0, spot: 'mon' },
  { id: 'books', name: '책 더미', price: 0, lv: 1, tier: 0 },
  { id: 'lamp', name: '스탠드', price: 0, lv: 1, tier: 0 },
  { id: 'duck', name: '러버덕', cap: '말로 설명하면 버그가 보여요', price: 0, lv: 1, tier: 0 },
  { id: 'cans', name: '에너지 음료', price: 20, lv: 1, tier: 1 },
  { id: 'cactus', name: '선인장', price: 30, lv: 1, tier: 1 },
  { id: 'clock', name: '탁상시계', price: 40, lv: 1, tier: 1 },
  { id: 'keycap', name: '키캡 장난감', price: 40, lv: 1, tier: 1 },
  { id: 'frame', name: '액자', price: 50, lv: 1, tier: 1 },
  { id: 'hourglass', name: '뽀모도로 모래시계', price: 60, lv: 1, tier: 1 },
  { id: 'tumbler', name: '텀블러', cap: '얼음 가득 아아', price: 60, lv: 1, tier: 1 },
  { id: 'fan', name: '탁상 선풍기', cap: '살랑살랑 돌아가요', price: 50, lv: 1, tier: 1 },
  { id: 'humidifier', name: '가습기', cap: '촉촉한 김이 모락모락', price: 70, lv: 1, tier: 1 },
  { id: 'blanket', name: '무릎담요', cap: '의자에 걸쳐 둔 체크 담요', price: 80, lv: 1, tier: 1, spot: 'chair' },
  { id: 'cushion', name: '따뜻한 방석', cap: '의자 위 온열 방석, 빨간 불', price: 120, lv: 2, tier: 1, spot: 'chair' },
  { id: 'catdoll', name: '고양이 인형', price: 80, lv: 2, tier: 1 },
  { id: 'speaker', name: '스피커', price: 90, lv: 2, tier: 1 },
  { id: 'gamepad', name: '게임패드', price: 100, lv: 2, tier: 1 },
  { id: 'globe', name: '지구본', price: 120, lv: 2, tier: 1 },
  { id: 'figure', name: '로봇 피규어', price: 150, lv: 2, tier: 1 },
  { id: 'lightbar', name: '모니터 라이트바', cap: '모니터 위에서 손만 비춰요', price: 150, lv: 2, tier: 1, spot: 'mon' },
  { id: 'headset', name: '헤드폰 거치대', cap: '노이즈캔슬링 헤드폰과 함께', price: 200, lv: 2, tier: 1 },
  { id: 'webcam', name: '4K 웹캠', cap: '모니터 위에 콕', price: 250, lv: 2, tier: 2, spot: 'mon' },
  { id: 'drip', name: '핸드드립 세트', cap: '드리퍼와 서버', price: 300, lv: 2, tier: 2 },
  { id: 'ipad', name: '태블릿과 펜', price: 350, lv: 3, tier: 2 },
  { id: 'macbook', name: '맥북과 거치대', cap: '세워 둔 노트북', price: 400, lv: 3, tier: 2 },
  { id: 'mic', name: '마이크 암', cap: '방송하는 개발자', price: 450, lv: 3, tier: 2 },
  { id: 'monstera', name: '몬스테라', cap: '커다란 잎 화분', price: 500, lv: 4, tier: 2 },
  { id: 'retro', name: '레트로 게임기', cap: '작은 오락실 기계', price: 600, lv: 4, tier: 2 },
  { id: 'lego', name: '레고 우주선', price: 800, lv: 5, tier: 2 },
  { id: 'aquarium', name: '미니 어항', cap: '구피가 헤엄쳐요', price: 900, lv: 5, tier: 2 },
  { id: 'macmini', name: '맥미니', cap: '작고 하얀 상자, 빌드가 빨라요', price: 1200, lv: 5, tier: 3 },
  { id: 'neon', name: '네온사인', cap: '칸막이 위 Hello World', price: 1500, lv: 6, tier: 3, spot: 'wall' },
  { id: 'espresso', name: '에스프레소 머신', cap: '내 책상 위 드롱기', price: 2000, lv: 6, tier: 3 },
];
export const TIERS = ['기본', '필수템', '욕심템', '사치템'];
export const SHOP = { mon: MONITORS, kb: KEYBOARDS, chair: CHAIRS, it: DESK_ITEMS };
export const shopKey = (kind, id) => `${kind}:${id}`;
// 처음부터 가진 것: 가격이 0 인 것 전부
export const FREE_OWNED = Object.entries(SHOP).flatMap(([k, list]) => list.filter((x) => !x.price).map((x) => shopKey(k, x.id)));

export const defaultDesk = () => ({ c: 'oak', ch: 'charcoal', mon: 'm', kb: 'basic', chair: 'basic', it: ['plant', 'mug', 'lamp'] });

// 동작. auto: 동작 막대에 안 나옴(앉으면 저절로). dur: 끝나는 시간(초)
// feed: 같은 층에 뜨는 알림 ("○○님이 박수를 쳤습니다.")
// trip: 그 자리까지 걸어가서 pose 를 하고 내 자리로 돌아와요. pose: 동작 막대에 안 나오는 자세
export const ACTIONS = [
  { id: 'type', name: '코딩', auto: true },
  { id: 'wave', name: '손인사', cap: '반가워요', dur: 2.2, feed: '손을 흔들었습니다.' },
  { id: 'stretch', name: '기지개', cap: '두 팔 쭉', dur: 3, feed: '기지개를 켰습니다.' },
  { id: 'coffee', name: '커피', cap: '한 모금', dur: 3.6, feed: '커피를 한 모금 마셨습니다.' },
  { id: 'think', name: '고민', cap: '턱 괴고 생각', dur: 6, feed: '고민에 빠졌습니다.' },
  { id: 'clap', name: '박수', cap: '배포 성공!', dur: 2.6, feed: '박수를 쳤습니다.' },
  // 걸어갔다 오는 동작
  { id: 't_coffee', name: '커피 타 오기', cap: '커피 바까지', trip: 'coffee', pose: 'pour', feed: '커피를 타러 갔습니다.' },
  { id: 't_print', name: '프린트하기', cap: '프린터까지', trip: 'printer', pose: 'print', feed: '프린트하러 갔습니다.' },
  { id: 't_water', name: '물 마시기', cap: '정수기까지', trip: 'water', pose: 'drink', feed: '물 마시러 갔습니다.' },
  { id: 't_board', name: '화이트보드', cap: '아이디어 적기', hidden: true, trip: 'board', pose: 'board', feed: '화이트보드에 뭔가 적으러 갔습니다.' },
  { id: 't_window', name: '바람 쐬기', cap: '창가에서 기지개', trip: 'window', pose: 'window', feed: '창가로 바람 쐬러 갔습니다.' },
  { id: 't_fridge', name: '냉장고 가기', cap: '음료 무제한 무료', fridge: true },
  // 냉장고 음료 (무알콜 맥주 · 콜라 · 사이다 무제한 무료). 냉장고를 누르면 고르는 창이 떠요
  { id: 't_beer', name: '무알콜 맥주', hidden: true, trip: 'fridge', pose: 'can_beer', feed: '냉장고에서 무알콜 맥주를 꺼냈습니다. 🍺' },
  { id: 't_cola', name: '콜라', hidden: true, trip: 'fridge', pose: 'can_cola', feed: '냉장고에서 콜라를 꺼냈습니다. 🥤' },
  { id: 't_cider', name: '사이다', hidden: true, trip: 'fridge', pose: 'can_cider', feed: '냉장고에서 사이다를 꺼냈습니다. 🫧' },
  { id: 'can_beer', pose: true, dur: 4 },
  { id: 'can_cola', pose: true, dur: 4 },
  { id: 'can_cider', pose: true, dur: 4 },
  // 도착해서 하는 자세 (막대에 안 나옴)
  { id: 'pour', pose: true, dur: 4 },
  { id: 'print', pose: true, dur: 4 },
  { id: 'drink', pose: true, dur: 3.6 },
  { id: 'board', pose: true, dur: 5 },
  { id: 'window', pose: true, dur: 5 },
];

// 처음 들어온 분께 채워 두는 메모 5개 (내 책상 꾸미기에서 바꿀 수 있음)
export const DEFAULT_MEMOS = ['어서오세요', '다들 화이팅!', '집중 모드 🎧', '다들 뭐하세요?', '배포 성공 🎉'];

// 말풍선: auto 돌아가며 · one 하나만 계속 · off 안 띄우기
export const MEMO_MODES = [
  { id: 'auto', name: '자동', cap: '돌아가며 떠요' },
  { id: 'one', name: '하나', cap: '고른 메모만' },
  { id: 'off', name: '없음', cap: '안 띄워요' },
];

// 닉네임: 앞말 3글자 + 뒷말 2글자 (16 × 16 = 256가지)
export const NAME_ADJ = ['말랑한', '포근한', '느긋한', '수줍은', '씩씩한', '엉뚱한', '야무진', '깜찍한', '배고픈', '꼼꼼한', '신나는', '다정한', '커밋한', '배포한', '야근한', '코딩한'];
export const NAME_NOUN = ['감자', '만두', '쿠키', '푸딩', '젤리', '호떡', '모찌', '두부', '펭귄', '수달', '판다', '오리', '햄찌', '냥이', '픽셀', '키캡'];
export const randomName = () => NAME_ADJ[(Math.random() * NAME_ADJ.length) | 0] + ' ' + NAME_NOUN[(Math.random() * NAME_NOUN.length) | 0];

export const defaultLook = () => ({ body: 'base', type: 'hoodie', gender: 'm', skin: SKIN_TONES[0], outfit: 'wear_hoodie', acc: 'headphones', pet: 'coffee' });

// 예전에 저장된 모습 · 프로필을 지금 모양으로 (캐릭터 기본 옷 → 그 캐릭터 차림, 한 줄 소개·지금 하는 일 → 메모)
export function fixLook(l) {
  const look = { ...defaultLook(), ...(l || {}) };
  if (look.outfit === 'own' || !OUTFITS.some((o) => o.id === look.outfit)) look.outfit = 'wear_' + (CHAR_TYPES.some((t) => t.id === look.type) ? look.type : 'hoodie');
  if (!BODIES.some((b) => b.id === look.body)) look.body = 'base';
  if (!ACCESSORIES.some((a) => a.id === look.acc)) look.acc = 'none';
  if (!PET_IDS.includes(look.pet)) look.pet = 'none';
  return look;
}
// 예전(메모 10개 시절) 기본 메모. 이것만 그대로 둔 분은 새 기본 메모 5개로 바꿔 드려요
const OLD_DEFAULT_MEMOS = new Set(['오늘도 커밋 하나!', '집중 모드 🎧', '버그 잡는 중…', '이거 왜 되지?', '커피 리필하러 갑니다 ☕', '배포 성공 🎉', '다들 화이팅!', '혼자지만 같이 일해요', '오늘은 여기까지', '내일 또 만나요 👋']);
export function fixProfile(p) {
  const kept = Array.isArray(p?.memos) ? p.memos.map((m) => String(m || '').trim()).filter(Boolean) : null;
  const untouched = kept && kept.length > 5 && kept.every((m) => OLD_DEFAULT_MEMOS.has(m));
  const memos = [p?.now, p?.intro, ...(kept && !untouched ? kept : DEFAULT_MEMOS)].map((m) => String(m || '').trim().slice(0, LIMITS.memo)).filter(Boolean);
  return {
    memos: memos.slice(0, MAX_MEMOS),
    links: (Array.isArray(p?.links) ? p.links : []).slice(0, MAX_LINKS),
    desk: { ...defaultDesk(), ...(p?.desk || {}) },
  };
}
export const defaultProfile = () => fixProfile(null);

// 결과물 링크는 http(s) 만
export function safeUrl(u) {
  try {
    const s = String(u || '').trim();
    if (!s) return '';
    const url = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.href.slice(0, LIMITS.url);
  } catch { return ''; }
}
export const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };
