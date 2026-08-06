/** 3학년 herdr반 공용 헬퍼 — 순수 함수만. */

export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

export const lerp = (from, to, k) => from + (to - from) * k;

/** 문자열 → 0..1 결정적 해시. 학생 외모(피부·머리·옷)를 pane마다 고정하는 데 쓴다. */
export const hash01 = (text) => {
  let hash = 2166136261;
  for (let i = 0; i < String(text).length; i++) {
    hash ^= String(text).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
};

/** 해시로 배열에서 하나 고르기 — 같은 pane은 항상 같은 항목. */
export const pickBy = (seed, items, salt = 0) =>
  items[Math.floor(hash01(`${seed}#${salt}`) * items.length) % items.length];

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** ISO 시각 → "12초 / 3분 / 2시간" 상대 표기. */
export const relTime = (iso, nowMs = Date.now()) => {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return '';
  const sec = Math.max(0, Math.round((nowMs - at) / 1000));
  if (sec < 60) return `${sec}초`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분`;
  return `${Math.floor(sec / 3600)}시간`;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const koreanDate = (date) =>
  `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}. (${WEEKDAYS[date.getDay()]})`;

export const trimText = (text, max) => {
  const value = String(text ?? '').trim();
  if (value.length === 0) return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

/** 애니메이션 클래스를 한 번 재생하고 스스로 떼어낸다. */
export const playOnce = (element, className, ms) => {
  element.classList.remove(className);
  // 리플로우를 강제해야 같은 클래스를 연속으로 다시 재생할 수 있다.
  void element.offsetWidth;
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), ms);
};
