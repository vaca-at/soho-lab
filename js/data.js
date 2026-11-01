// 앱 전체에서 쓰는 고정 데이터: 층(서버), 자리, 캐릭터, 옷, 동작, 기본 메모

const Q = new URLSearchParams(location.search);

// 방 중계 서버 주소 (server/ 폴더의 Cloudflare Worker).
// ?relay=local 이면 내 컴퓨터에서 띄운 서버(wrangler dev), ?solo 면 혼자 보기
export const RELAY_URL = Q.get('relay') === 'local' ? 'http://127.0.0.1:8787'
  : Q.has('solo') ? ''
  : 'https://soho-lab-rooms.bellachord.workers.dev';

export const SITE = 'https://soho-lab.site';
export const FLOORS = 10; // 서버 = 층. 1층부터 10층까지
export const SEATS = 20; // 층마다 책상 20개, 20명까지
export const MAX_MEMOS = 10;
export const MAX_LINKS = 6;
export const LIMITS = { name: 12, intro: 40, now: 40, memo: 30, title: 24, desc: 60, url: 200 };

export const SKIN_TONES = ['#f4c9a6', '#e8b48c', '#d79b72', '#b97a55', '#8d5a3b'];

// 블록 사람 유형 (blocky.js 의 PRESETS 와 짝)
export const CHAR_TYPES = [
  { id: 'hoodie', name: '초록 후드티', desc: '모자 달린 후드와 끈' },
  { id: 'appteacher', name: '안경과 초록 셔츠', desc: '동그란 안경, 까만 머리' },
  { id: 'knitdev', name: '줄무늬 니트', desc: '포근한 줄무늬 스웨터' },
  { id: 'beige', name: '베이지 재킷', desc: '검은 상의와 바지' },
  { id: 'moral', name: '남색 카디건', desc: '흰 깃이 보이는 차림' },
  { id: 'trainee', name: '파란 모자', desc: '흰 셔츠에 목걸이 명찰' },
  { id: 'planner', name: '베레모와 분홍 니트', desc: '빨간 베레모' },
  { id: 'tycoon', name: '검은 정장', desc: '빨간 넥타이' },
];

export const GENDERS = [{ id: 'f', name: '여자', cap: '긴 머리' }, { id: 'm', name: '남자', cap: '짧은 머리' }];

// 옷: 'own' 은 캐릭터 고유 차림, 나머지는 색만 바꾼다 (style 별 작은 장식)
export const OUTFITS = [
  { id: 'own', name: '캐릭터 기본 옷', top: '#3c9a6a', bottom: '#2c2f36', style: 'own' },
  { id: 'mtm', name: '회색 맨투맨', top: '#9aa0a6', bottom: '#2f3540', style: 'plain' },
  { id: 'flannel', name: '체크 셔츠', top: '#b8403a', bottom: '#2c3450', style: 'check' },
  { id: 'turtle', name: '검은 터틀넥', top: '#1f1f22', bottom: '#3a3c42', style: 'plain' },
  { id: 'sky', name: '하늘 셔츠', top: '#a9c8e8', bottom: '#3a3f4a', style: 'plain' },
  { id: 'pajama', name: '잠옷', top: '#f3d6e0', bottom: '#f3d6e0', style: 'pajama' },
];

export const ACCESSORIES = [
  { id: 'none', name: '없음' },
  { id: 'headphones', name: '헤드폰' },
  { id: 'glasses', name: '뿔테 안경' },
  { id: 'beanie', name: '털모자' },
  { id: 'backpack', name: '백팩' },
];

// 동작. auto: 동작 막대에 안 나옴(앉으면 저절로). dur: 끝나는 시간(초). seated: 앉아서만
export const ACTIONS = [
  { id: 'type', name: '코딩', auto: true },
  { id: 'stretch', name: '기지개', cap: '두 팔 쭉', dur: 3 },
  { id: 'coffee', name: '커피', cap: '한 모금', dur: 3.6 },
  { id: 'think', name: '고민', cap: '턱 괴고 생각', dur: 6 },
  { id: 'clap', name: '박수', cap: '배포 성공!', dur: 2.6 },
  { id: 'wave', name: '손인사', cap: '반가워요', dur: 2.2 },
];

// 처음 들어온 분께 채워 두는 메모 10개 (내 책상 꾸미기에서 바꿀 수 있음)
export const DEFAULT_MEMOS = [
  '오늘도 커밋 하나!',
  '집중 모드 🎧',
  '버그 잡는 중…',
  '이거 왜 되지?',
  '커피 리필하러 갑니다 ☕',
  '배포 성공 🎉',
  '다들 화이팅!',
  '혼자지만 같이 일해요',
  '오늘은 여기까지',
  '내일 또 만나요 👋',
];

// 닉네임: 형용사 + 동물 (무작위)
const ADJ = ['야근하는', '새벽의', '조용한', '성실한', '커밋하는', '배포하는', '디버깅', '느긋한', '집중한', '퇴근한', '부지런한', '밤샘하는'];
const NOUN = ['고양이', '부엉이', '다람쥐', '펭귄', '너구리', '수달', '여우', '판다', '고슴도치', '햄스터', '알파카', '오리'];
export const randomName = () => ADJ[(Math.random() * ADJ.length) | 0] + ' ' + NOUN[(Math.random() * NOUN.length) | 0];

export const defaultLook = () => ({ type: 'hoodie', gender: 'm', skin: SKIN_TONES[0], outfit: 'own', acc: 'headphones', pet: 'coffee' });

export const defaultProfile = () => ({
  intro: '',
  now: '',
  memos: [...DEFAULT_MEMOS],
  links: [],
});

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
