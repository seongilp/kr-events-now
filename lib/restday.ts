/**
 * 휴관일(restdateculture) 자연어 → "오늘 여는가" 판정. **순수 함수만**(테스트가 여기 붙는다).
 *
 * ★ 이 파일이 박물관 레이어의 성패다. 원칙(팀 지시):
 *  1) 확실히 파싱되는 것만 판정한다 — 주간 요일 반복("매주 월요일"류)과 연중무휴.
 *  2) **파싱 실패를 '열림'으로 처리하지 않는다.** open / closed / unknown 세 상태를 명확히 나눈다.
 *  3) 원문을 항상 함께 보여준다(이 함수는 판정만; UI가 원문을 같이 렌더).
 *  4) 판정 불가를 조용히 숨기지 않는다(unknown 을 화면에서 따로 표시·집계).
 *  5) 공휴일 예외까지 구현하지 않는다 — 국경일/설·추석/공휴일 텍스트는 '소프트'로 보고
 *     전역 고지문으로 덮되, open 판정을 막지는 않는다(막으면 커버리지가 붕괴한다).
 *
 * 4개 언어 실측 분포에 근거한 설계:
 *  - 영: "Mondays" / "Open all year round" / "First Monday of every month"
 *  - 일: "月曜日" / "年中無休" / "第1月曜日"
 *  - 중(간/번): "每週一"/"週一" / "全年無休" / "每月第一個週二"  ← 週/周 접두 필수, 날짜의 月/日과 구분
 *
 * 판정 로직(verdictFor):
 *  - 오늘 요일 ∈ 주간휴무요일 → closed
 *  - 아니고, 평가 불가한 '하드' 절(서수·계절·전시준비 등)이 있으면 → unknown
 *  - 아니고, 연중무휴이거나 주간휴무요일을 파싱했으면 → open (오늘은 주간 휴무일이 아님)
 *  - 그 외(주간정보 없음·전부 공휴일·해석불가·빈값) → unknown
 */

import { dayOfWeek, isLastWeekdayOfMonth, monthOf, nthWeekdayOfMonth } from './kst';

export type OpenState = 'open' | 'closed' | 'unknown';

export interface Closure {
  /** 매주 쉬는 요일들(0=일 … 6=토). */
  weekly: number[];
  /** 연중무휴 문구가 잡혔는가. */
  openAllYear: boolean;
  /** 서수(매월 N번째 요일) 규칙들. 오늘 계산에 쓴다. */
  ordinals: Ordinal[];
  /** 평가 불가한 절이 있는가(계절 정기휴관·전시준비기간 등, 서수 제외). */
  hard: boolean;
  /** 공휴일/기념일 등 '소프트' 절이 있는가(전역 고지문 대상). */
  holidayCaveat: boolean;
}

interface Ordinal {
  weekday: number;
  /** 1~5 또는 'last'. null 이면 서수를 못 읽음(요일만 앎) → 그 요일엔 unknown. */
  nth: number | 'last' | null;
  /** 특정 달로 한정되면 그 달들(1~12). null 이면 매월. */
  months: number[] | null;
}

/* ── 정규화 ── */
function normalize(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── 연중무휴 ── */
const OPEN_ALL_YEAR =
  /(open\s+all\s+year|year[\s-]?round|open\s+every\s+day|no\s+closed\s+(?:days|dates)|no\s+closing\s+days|年中無休|年中无休|全年無休|全年无休|全年開放|全年开放|無休|无休|연중무휴)/i;

/* ── 하드(평가 불가) 절: 계절 정기휴관·전시 준비/교체 기간 ── */
const HARD_CLAUSE =
  /(exhibition\s+prep|during\s+exhibition|preparation|春季|夏季|秋季|冬季|定期休館|定期休观|定期休館日|準備期間|准备期间|準備期|布展|换展|換展|展示替え|展覧会の準備|展示準備|展示の入れ替え)/i;

/* ── 소프트(공휴일류) 절 ── */
const HOLIDAY_CLAUSE =
  /(public\s+holidays?|national\s+holidays?|new\s+year|seollal|chuseok|lunar|jan(?:uary|\.)?\s*1|祝日|公休日|國定假日|国定假日|節日|元旦|春節|春节|中秋|秋夕|旧正月|ソルナル|ソルラル|정월|설날|추석|법정공휴일|臨時休館|临时休馆|temporary\s+closure|\d{1,2}\s*月\s*\d{1,2}\s*日|\d{1,2}\s*\/\s*\d{1,2})/i;

/* ── 영어 요일 ── */
const EN_WD: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6,
};
/** 한자·간지 요일 문자 → 인덱스. */
const CJK_WD: Record<string, number> = {
  日: 0, 天: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6,
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
};

const ORD_WORD: Record<string, number | 'last'> = {
  first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3,
  fourth: 4, '4th': 4, fifth: 5, '5th': 5, last: 'last',
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 最後: 'last', 最后: 'last',
};

/** 요일 인덱스 목록에서 중복 제거. */
const uniq = (xs: number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);

/** 순환 요일 범위 확장(예: 금(5)→일(0) = [5,6,0]). */
function expandRange(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = (a + i) % 7;
    out.push(d);
    if (d === b) break;
  }
  return out;
}

/**
 * 서수(매월 N번째 요일) 규칙과 계절-주(週) 규칙을 원문에서 뽑아내고, 그 요일 언급을
 * 주간 파싱이 삼키지 않도록 **잘라낸** 나머지 문자열을 함께 돌려준다.
 * 잘라내지 않으면 "매월 첫째 화요일"의 '화요일'이 "매주 화요일"로 오독된다(최악의 함정).
 */
function extractOrdinals(s: string): { ordinals: Ordinal[]; rest: string; seasonalWeek: boolean } {
  const ordinals: Ordinal[] = [];
  let rest = s;
  let seasonalWeek = false;

  // 영어: "first/last/3rd Monday of every month" (+ "of March and November" 한정은 hard 로 넘김)
  rest = rest.replace(
    /\b(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
    (_m, ord: string, wd: string) => {
      ordinals.push({ weekday: EN_WD[wd.toLowerCase()], nth: ORD_WORD[ord.toLowerCase()], months: null });
      return ' ';
    },
  );

  // 일본어: "第1月曜日" / "第一月曜" (앞에 4月・11月の 등 달 한정이 붙을 수 있음)
  rest = rest.replace(
    /第\s*([1-5一二三四五])\s*([日月火水木金土])曜日?/g,
    (_m, ord: string, wd: string) => {
      ordinals.push({ weekday: CJK_WD[wd], nth: ORD_WORD[ord] ?? Number(ord) as number, months: null });
      return ' ';
    },
  );

  // 중국어: "每月第一個週二" / "每月最後一周周一" / "第1个周二"
  rest = rest.replace(
    /第\s*([一二三四1-5]|最後|最后)\s*個?\s*(?:週|周|个|個)?\s*(?:週|周|星期|礼拜|禮拜)?\s*([一二三四五六日天])/g,
    (_m, ord: string, wd: string) => {
      const nth = ORD_WORD[ord] ?? (Number(ord) || null);
      ordinals.push({ weekday: CJK_WD[wd], nth, months: null });
      return ' ';
    },
  );
  // 중국어 "最後一周周一" 형태(週 없이 最後一周)
  rest = rest.replace(
    /最[後后]\s*(?:一)?\s*(?:週|周)\s*(?:週|周|星期)?\s*([一二三四五六日天])/g,
    (_m, wd: string) => {
      ordinals.push({ weekday: CJK_WD[wd], nth: 'last', months: null });
      return ' ';
    },
  );

  // 계절/특정 '주(週)' 정기휴관: "3月第一週" "9月第一周" "春季定期休館(3月第一週)" → 평가 불가.
  if (/(第[一二三四1-5]\s*[週周])|(月\s*第[一二三四1-5])/.test(rest)) seasonalWeek = true;

  return { ordinals, rest, seasonalWeek };
}

/** 정규화된 문자열에서 '매주 쉬는 요일' 집합을 파싱. */
function parseWeekly(s: string): number[] {
  const days: number[] = [];
  const lower = s.toLowerCase();

  // 영어 weekend/weekday
  if (/\bweekends?\b/.test(lower)) days.push(0, 6);
  if (/\bweekdays?\b/.test(lower)) days.push(1, 2, 3, 4, 5);
  // 영어 요일 범위 "sunday-monday", "mon–fri"
  const enWd = '(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)';
  for (const m of lower.matchAll(new RegExp(`${enWd}\\s*[-–~]\\s*${enWd}`, 'g'))) {
    const a = EN_WD[normalizeEn(m[1])];
    const b = EN_WD[normalizeEn(m[2])];
    if (a != null && b != null) days.push(...expandRange(a, b));
  }
  // 영어 개별 요일(복수형 Mondays 허용)
  for (const m of lower.matchAll(new RegExp(`\\b${enWd}s?\\b`, 'g'))) {
    const d = EN_WD[normalizeEn(m[1])];
    if (d != null) days.push(d);
  }

  // 일본어: 週末 / 土日 / 曜 요일 + 범위(火曜日～日曜日)
  if (/週末|土日/.test(s)) days.push(0, 6);
  const jpChars = [...s.matchAll(/([日月火水木金土])曜日?/g)].map((m) => ({ d: CJK_WD[m[1]], i: m.index! }));
  // 범위 "X曜〜Y曜"
  for (const m of s.matchAll(/([日月火水木金土])曜日?\s*[～〜~－-]\s*([日月火水木金土])曜日?/g)) {
    days.push(...expandRange(CJK_WD[m[1]], CJK_WD[m[2]]));
  }
  for (const c of jpChars) days.push(c.d);

  // 중국어: 週末/周末 + (週|周|星期|礼拜)요일, 범위(週二~四 / 周一至周五)
  if (/週末|周末/.test(s)) days.push(0, 6);
  const zhPrefix = '(?:每)?\\s*(?:週|周|星期|礼拜|禮拜)';
  const zhWd = '([一二三四五六日天])';
  for (const m of s.matchAll(new RegExp(`${zhPrefix}\\s*${zhWd}\\s*[~～至到－-]\\s*(?:${zhPrefix}\\s*)?${zhWd}`, 'g'))) {
    days.push(...expandRange(CJK_WD[m[1]], CJK_WD[m[2]]));
  }
  for (const m of s.matchAll(new RegExp(`${zhPrefix}\\s*${zhWd}`, 'g'))) {
    days.push(CJK_WD[m[1]]);
  }
  // 접두 요일 뒤에 접두 없이 콤마로 이어지는 요일 리스트("每週一、二" → 월·화)
  for (const m of s.matchAll(
    new RegExp(`${zhPrefix}\\s*${zhWd}((?:\\s*[、,／/]\\s*[一二三四五六日天])+)`, 'g'),
  )) {
    for (const t of m[2].matchAll(/[一二三四五六日天]/g)) days.push(CJK_WD[t[0]]);
  }

  return uniq(days);
}

function normalizeEn(w: string): string {
  const x = w.toLowerCase();
  const map: Record<string, string> = {
    sunday: 'sun', monday: 'mon', tuesday: 'tue', tues: 'tue', wednesday: 'wed',
    thursday: 'thu', thur: 'thu', thurs: 'thu', friday: 'fri', saturday: 'sat',
  };
  return map[x] ?? x;
}

/** 원문 → 파싱된 휴무 구조. */
export function parseClosure(raw: string | null | undefined): Closure {
  const empty: Closure = { weekly: [], openAllYear: false, ordinals: [], hard: false, holidayCaveat: false };
  if (!raw) return empty;
  const s = normalize(raw);
  if (!s) return empty;

  const openAllYear = OPEN_ALL_YEAR.test(s);
  const { ordinals, rest, seasonalWeek } = extractOrdinals(s);
  const weekly = parseWeekly(rest);
  const hard = seasonalWeek || HARD_CLAUSE.test(rest);
  const holidayCaveat = HOLIDAY_CLAUSE.test(s);

  return { weekly, openAllYear, ordinals, hard, holidayCaveat };
}

/** 서수 규칙이 '오늘' 문을 닫는가. 완전 파싱 가능하면 true/false, 애매하면 'unknown'. */
function ordinalHitsToday(o: Ordinal, epochDay: number): boolean | 'unknown' {
  const dow = dayOfWeek(epochDay);
  if (o.weekday !== dow) return false; // 오늘이 그 요일이 아니면 이 규칙과 무관
  if (o.months && !o.months.includes(monthOf(epochDay))) return false;
  if (o.nth == null) return 'unknown'; // 요일은 맞는데 서수를 못 읽음 → 확신 못 함
  if (o.nth === 'last') return isLastWeekdayOfMonth(epochDay);
  return nthWeekdayOfMonth(epochDay) === o.nth;
}

/**
 * 오늘(KST 에폭 일수) 기준 개관 여부. 세 상태를 정직하게 구분한다.
 */
export function verdictFor(closure: Closure, epochDay: number): OpenState {
  const dow = dayOfWeek(epochDay);

  // 1) 매주 쉬는 요일에 해당 → 확실히 휴관.
  if (closure.weekly.includes(dow)) return 'closed';

  // 2) 서수 규칙 평가.
  let ordinalUnknown = false;
  for (const o of closure.ordinals) {
    const hit = ordinalHitsToday(o, epochDay);
    if (hit === true) return 'closed';
    if (hit === 'unknown') ordinalUnknown = true;
  }
  if (ordinalUnknown) return 'unknown';

  // 3) 평가 불가한 하드 절이 있으면 오늘 적용될지 알 수 없음 → unknown.
  if (closure.hard) return 'unknown';

  // 4) 연중무휴이거나 주간/서수 요일 규칙을 이해했으면 → 오늘은 (주간) 휴무일이 아님 = 개관.
  if (closure.openAllYear || closure.weekly.length > 0 || closure.ordinals.length > 0) return 'open';

  // 5) 주간 규칙은 없지만 '공휴일/특정일에만 휴관'으로 온전히 읽힌 경우 → 오늘은 개관으로 본다.
  //    이는 파싱 실패가 아니라 "공휴일 외엔 매일 개관"이라는 완결된 해석이다. 오늘이 실제
  //    공휴일인지까지는 확인하지 않으므로(과설계 금지), 전역 고지문으로 그 한계를 덮는다.
  if (closure.holidayCaveat) return 'open';

  // 6) 아무 것도 해석 못 함(예: "無(웹공지)") → 판정 불가.
  return 'unknown';
}

/** 원문 + 오늘 → 판정 한 방에. */
export function openTodayState(raw: string | null | undefined, epochDay: number): OpenState {
  return verdictFor(parseClosure(raw), epochDay);
}
