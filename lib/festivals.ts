/**
 * 축제 데이터의 정규화·상태 계산. **순수 함수만** 둔다(테스트가 여기에 붙는다).
 *
 * 형제앱들에서 실제로 터진 두 곳이 여기 모여 있다:
 *  1) 응답 파서 — 정상/에러 최상위 구조가 통째로 다르다(F-9). 한쪽만 기대하면 조용히 0건.
 *  2) KST 날짜 상태 — 자정 경계에서 하루씩 밀린다(F-11). 전부 에폭 일수 정수 뺄셈으로.
 */

import { kstToday, ymdToDay } from './kst';

/** searchFestival2 원본 item(우리가 쓰는 필드만). */
export interface FestivalRaw {
  contentid?: string;
  contenttypeid?: string;
  title?: string;
  addr1?: string;
  addr2?: string;
  eventstartdate?: string;
  eventenddate?: string;
  mapx?: string;
  mapy?: string;
  firstimage?: string;
  firstimage2?: string;
  tel?: string;
}

/** 클라이언트로 내보내는 정규화된 축제. 좌표는 숫자, 날짜는 YYYYMMDD 유지. */
export interface Festival {
  id: string;
  title: string;
  addr: string | null;
  lat: number;
  lon: number;
  startYmd: string;
  endYmd: string;
  image: string | null;
  tel: string | null;
}

/** 축제 진행 상태. UI는 이 값으로 "진행중/오늘마감/D-n/종료"를 서로 다르게 보여준다. */
export type EventPhase = 'ongoing' | 'today' | 'upcoming' | 'ended';

export interface FestivalStatus {
  phase: EventPhase;
  /** upcoming 이면 시작까지 남은 일수(>0), ongoing 이면 종료까지 남은 일수(>=0). */
  daysLeft: number | null;
}

/**
 * 응답 본문에서 items 배열을 안전하게 뽑는다.
 *
 * ★ data.go.kr 은 성공/에러의 최상위 구조가 다르다:
 *   - 정상: response.body.items.item  (item 은 배열 또는 단일 객체, 0건이면 items===""）
 *   - 에러: OpenAPI_ServiceResponse.cmmMsgHeader (여기 오면 상위에서 throw 되어야 정상)
 * 이 함수는 "정상 구조에서 아이템 꺼내기"만 한다. 에러 판정은 parseApiError 가 맡는다.
 */
export function itemsOf(json: unknown): FestivalRaw[] {
  const body = (json as { response?: { body?: { items?: unknown } } })?.response?.body?.items;
  if (!body || body === '') return []; // 0건은 items:"" 로 온다
  const item = (body as { item?: unknown }).item;
  if (Array.isArray(item)) return item as FestivalRaw[];
  return item ? [item as FestivalRaw] : [];
}

/**
 * 응답이 에러면 { code, msg }, 정상이면 null.
 *
 * 두 자리를 모두 본다:
 *  - OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode (키/쿼터 계열, 200/403 본문)
 *  - response.header.resultCode (정상은 "0000", 그 외는 파라미터·서비스 오류)
 * 200 이 성공이 아니라는 규칙(F-8)이 여기서 지켜진다.
 */
export function parseApiError(json: unknown): { code: string; msg: string } | null {
  const cmm = (
    json as {
      OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnReasonCode?: string; errMsg?: string } };
    }
  )?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (cmm?.returnReasonCode) {
    return { code: cmm.returnReasonCode, msg: cmm.errMsg ?? 'service error' };
  }
  const header = (json as { response?: { header?: { resultCode?: string; resultMsg?: string } } })
    ?.response?.header;
  if (header?.resultCode && header.resultCode !== '0000') {
    return { code: header.resultCode, msg: header.resultMsg ?? 'service error' };
  }
  return null;
}

/** 한글(자모 포함)이 하나라도 들어 있으면 true. */
export function containsHangul(s: string | undefined | null): boolean {
  // 한글 음절(AC00–D7A3) + 한글 호환 자모(3131–3163). CJK 한자는 제외 — 중국어 서비스의
  // 한자 지명까지 결측 처리하면 안 되기 때문이다(우리가 지우려는 건 '한국어'뿐).
  return !!s && /[가-힣ㄱ-ㅣ]/.test(s);
}

// 반각·전각 소괄호 + 대괄호 + CJK 각종 묶음괄호. 관광공사 외국어 제목은 원제(한글)를
// 이 중 아무 괄호로나 뒤에 달아 준다 — 실측: 축제는 () （）〈〉, 박물관은 [] 도 나온다.
const OPENERS = new Set(['(', '（', '〈', '《', '「', '『', '【', '[', '［']);
const CLOSERS = new Set([')', '）', '〉', '》', '」', '』', '】', ']', '］']);
// 한글 덩어리를 뗀 뒤 꼬리에 남는 구분자·중복 공백. 이것들만(한글 인접 시) 정리한다.
const TAIL_SEP = '\\s·・･\\u00b7\\-–—/,、，';
const TRAIL_JUNK = new RegExp(`[${TAIL_SEP}:：|]+$`);
const TRAIL_HANGUL = new RegExp(`[${TAIL_SEP}]*[가-힣ㄱ-ㅣ][가-힣ㄱ-ㅣ${TAIL_SEP}]*$`);

/**
 * 외국어 제목에서 **한글(한국어)만** 벗겨 낸 결과. 외국어 표기가 하나도 안 남으면 빈 문자열.
 *
 * 외국어 서비스 title 은 외국어 뒤에 한글 원제를 붙여 준다. 형태가 다양하다(박물관 실측):
 *  - 괄호 원제: "Alive Museum (Insa-dong Branch) [박물관은 살아있다(인사동점)]"  → 대괄호 포함
 *  - 구분자 없이 그냥 붙음: "国立金海博物馆국립김해박물관"                        → 꼬리 한글 런
 *  - 짝 안 맞는 닫는 괄호: "... (스위트파크 …)）"                               → 짝 없는 ) 한 글자 정리
 * 한글이 든 **괄호 그룹**과 **끝에 붙은 한글 런**을 안정될 때까지 번갈아 제거한다. 한자·가나는
 * 건드리지 않는다(containsHangul 이 한글만 대상). 남은 게 없거나 여전히 한글이 섞이면 ''.
 */
export function cleanForeignTitle(raw: string | undefined): string {
  if (!raw) return '';
  let s = raw.trim();
  let prev = '';
  while (s !== prev) {
    prev = s;
    // (1) 끝의 괄호 그룹: 한글 든 것만 제거. 짝 없는 닫는 괄호는 한 글자만 떼고 계속.
    for (;;) {
      s = s.replace(TRAIL_JUNK, '').trimEnd();
      const last = s[s.length - 1];
      if (!last || !CLOSERS.has(last)) break;
      let depth = 0;
      let open = -1;
      for (let i = s.length - 1; i >= 0; i -= 1) {
        const c = s[i];
        if (CLOSERS.has(c)) depth += 1;
        else if (OPENERS.has(c)) {
          depth -= 1;
          if (depth === 0) {
            open = i;
            break;
          }
        }
      }
      if (open === -1) {
        s = s.slice(0, -1); // 짝 없는 닫는 괄호 → 그 한 글자만 제거
        continue;
      }
      const group = s.slice(open);
      if (!containsHangul(group)) break; // 한글 없으면 정보 → 남긴다
      s = s.slice(0, open);
    }
    // (2) 끝에 구분자 없이 붙은 한글 꼬리 제거("…博物馆국립…박물관" → "…博物馆").
    s = s.replace(TRAIL_HANGUL, '');
  }
  s = s.replace(TRAIL_JUNK, '').trim();
  // 남은 게 없거나 여전히 한글이 섞이면 외국어 제목으로 못 쓴다 → '' (호출부가 결측 처리).
  if (!s || containsHangul(s)) return '';
  return s;
}

/**
 * 축제용 제목 정리. cleanForeignTitle 로 한글을 벗기되, 완전히 비면 원문을 돌려준다
 * (축제 제목은 항상 외국어 표기가 있어 이 폴백에 도달하지 않는다 — 안전장치).
 * 박물관은 결측 처리가 필요하므로 cleanForeignTitle 을 직접 쓴다(빈 문자열 → 항목 드롭).
 */
export function cleanTitle(raw: string | undefined): string {
  if (!raw) return '';
  return cleanForeignTitle(raw) || raw.trim();
}

const numOrNull = (v: string | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * 원본 item → 정규화 Festival. 좌표·필수 날짜가 없으면 null(지도에 못 찍고 상태도 못 정함).
 * 결측 필드는 비운 채로 둔다 — 절대 한국어/기계번역으로 메우지 않는다(F-2).
 */
export function normalize(raw: FestivalRaw): Festival | null {
  const id = raw.contentid?.trim();
  const lon = numOrNull(raw.mapx);
  const lat = numOrNull(raw.mapy);
  const start = raw.eventstartdate?.trim();
  const end = raw.eventenddate?.trim();
  // 좌표는 이 앱의 존재 이유(지도)라 없으면 버린다. 날짜도 시간축의 근간이라 없으면 버린다.
  if (!id || lat == null || lon == null || !ymdToDay(start) || !ymdToDay(end)) return null;

  const addrJoined = [raw.addr1?.trim(), raw.addr2?.trim()].filter(Boolean).join(' ').trim();
  // ★ 주소에 한글이 섞여 오면(주로 커버리지가 성긴 번체 ChtService2) 외국인에게 못 읽는
  //   한국어를 노출하지 말라는 규칙(F-3)에 따라 **결측으로** 처리한다. 좌표는 살아 있으므로
  //   지도 핀·길찾기는 그대로 되고, 주소만 "정보 없음"으로 정직하게 비운다.
  const addr = addrJoined && !containsHangul(addrJoined) ? addrJoined : null;
  return {
    id,
    title: cleanTitle(raw.title),
    addr,
    lat,
    lon,
    startYmd: start!,
    endYmd: end!,
    image: raw.firstimage?.trim() || raw.firstimage2?.trim() || null,
    tel: raw.tel?.trim() || null,
  };
}

/**
 * 오늘(KST) 기준 축제 상태. 전부 에폭 일수 정수 뺄셈이라 자정 경계에서 안 밀린다.
 *  - 시작 전: upcoming, daysLeft = 시작까지 일수(>0)
 *  - 오늘 시작~종료 전날: ongoing, daysLeft = 종료까지 일수(>0)
 *  - 오늘 종료: today, daysLeft = 0
 *  - 지남: ended
 */
export function statusOf(f: Festival, nowMs: number = Date.now()): FestivalStatus {
  const today = kstToday(nowMs);
  const start = ymdToDay(f.startYmd);
  const end = ymdToDay(f.endYmd);
  if (start == null || end == null) return { phase: 'ended', daysLeft: null };

  if (today < start) return { phase: 'upcoming', daysLeft: start - today };
  if (today > end) return { phase: 'ended', daysLeft: null };
  if (today === end) return { phase: 'today', daysLeft: 0 };
  return { phase: 'ongoing', daysLeft: end - today };
}

/** 시간 창(필터). weekend=이번 주말까지, twoweeks=앞으로 14일, upcoming=제한 없음. */
export type TimeWindow = 'weekend' | 'twoweeks' | 'upcoming';

/**
 * 다가오는 KST 주말(토·일)의 마지막 날(일요일)까지 며칠 남았는지.
 * 오늘이 토/일이면 이번 주말이 창이 된다. 월~금이면 이번 주 일요일까지.
 */
export function daysToWeekendEnd(nowMs: number = Date.now()): number {
  const today = kstToday(nowMs);
  // 1970-01-01(에폭 0)은 목요일. (day + 4) % 7 → 0=일 … 6=토.
  const dow = ((today % 7) + 4 + 7) % 7; // 0=Sun,1=Mon,...,6=Sat
  // 다음(또는 오늘 포함) 일요일까지의 일수.
  return dow === 0 ? 0 : 7 - dow;
}

/**
 * 시간 창에 걸리는가. 종료된 것은 항상 제외.
 *  - weekend: 오늘~이번 주말 일요일 사이에 열려 있는(또는 그 안에 시작하는) 축제.
 *  - twoweeks: 오늘~+14일 안에 겹치는 축제.
 *  - upcoming: 종료되지 않은 모든 축제.
 */
export function inWindow(f: Festival, window: TimeWindow, nowMs: number = Date.now()): boolean {
  const st = statusOf(f, nowMs);
  if (st.phase === 'ended') return false;
  if (window === 'upcoming') return true;

  const today = kstToday(nowMs);
  const start = ymdToDay(f.startYmd)!;
  const horizon = window === 'weekend' ? today + daysToWeekendEnd(nowMs) : today + 14;
  // 이미 진행중이면(start<=today) 창에 무조건 포함. 아니면 시작일이 지평선 안이어야.
  return start <= horizon;
}
