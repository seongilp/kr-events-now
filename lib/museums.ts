/**
 * 박물관·미술관 데이터의 정규화. **순수 함수만**(테스트가 여기 붙는다).
 *
 * 축제(festivals.ts)의 형제 모듈이다. 소스는 같은 관광공사 외국어 서비스지만 오퍼레이션이
 * 다르다: areaBasedList2(목록) + detailIntro2(관람시간·휴관일·입장료·주차). 휴관일 원문은
 * restday.ts 가 "오늘 여는가"로 해석하고, 이 모듈은 지도·시트에 쓸 필드를 정규화만 한다.
 *
 * 함정(TODO-museum.md):
 *  - contentTypeId=78(외국어). 국문 14 로 부르면 0건 오진.
 *  - "문화시설"엔 책방·도서관이 섞인다 → cat3 로만 박물관/미술관을 거른다(A02060100/A02060500).
 *  - 결측은 결측으로. 한글이 섞인 주소는 외국인에게 못 읽으니 비운다(축제와 동일 규칙).
 */

import { cleanTitle, containsHangul } from './festivals';

export const CAT3_MUSEUM = 'A02060100';
export const CAT3_GALLERY = 'A02060500';

export type MuseumKind = 'museum' | 'gallery';

/** areaBasedList2 원본 item(우리가 쓰는 필드만). */
export interface MuseumListRaw {
  contentid?: string;
  title?: string;
  addr1?: string;
  addr2?: string;
  mapx?: string;
  mapy?: string;
  firstimage?: string;
  firstimage2?: string;
  tel?: string;
  cat3?: string;
}

/** detailIntro2 원본(문화시설 계열 필드). */
export interface MuseumIntroRaw {
  restdateculture?: string;
  usetimeculture?: string;
  usefee?: string;
  parkingculture?: string;
  infocenterculture?: string;
}

/** 클라이언트로 내보내는 정규화 박물관. 휴관일은 **원문 그대로**(restRaw) 보존한다. */
export interface Museum {
  id: string;
  title: string;
  kind: MuseumKind;
  addr: string | null;
  lat: number;
  lon: number;
  image: string | null;
  tel: string | null;
  /** 휴관일 원문(restdateculture). 판정이 틀려도 사용자가 직접 읽을 수 있어야 한다. */
  restRaw: string | null;
  hours: string | null;
  fee: string | null;
  parking: string | null;
}

const numOrNull = (v: string | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * TourAPI 텍스트 필드엔 `<br>` 등 HTML 이 섞여 온다(관람시간·입장료·휴관일). 화면에 리터럴
 * 태그가 보이지 않게 `<br>`→줄바꿈, 나머지 태그는 제거한다. 줄바꿈은 살리고 그 외 공백만 정리.
 */
export function sanitizeText(v: string | undefined): string | null {
  const s = v
    ?.replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  return s || null;
}

/** 한글이 섞이면 결측 처리(외국인에게 한국어 노출 금지), 아니면 태그 정리해 반환. */
function cleanField(v: string | undefined): string | null {
  const s = sanitizeText(v);
  if (!s) return null;
  return containsHangul(s) ? null : s;
}

export function kindOf(cat3: string | undefined): MuseumKind | null {
  if (cat3 === CAT3_MUSEUM) return 'museum';
  if (cat3 === CAT3_GALLERY) return 'gallery';
  return null;
}

/**
 * 목록 raw + 상세 raw → 정규화 Museum. 좌표가 없으면 null(지도가 존재 이유).
 * cat3 가 박물관/미술관이 아니면 null(책방·도서관 혼입 차단).
 */
export function normalizeMuseum(
  list: MuseumListRaw,
  intro: MuseumIntroRaw | null,
): Museum | null {
  const id = list.contentid?.trim();
  const kind = kindOf(list.cat3);
  const lon = numOrNull(list.mapx);
  const lat = numOrNull(list.mapy);
  if (!id || !kind || lat == null || lon == null) return null;

  const addrJoined = [list.addr1?.trim(), list.addr2?.trim()].filter(Boolean).join(' ').trim();

  return {
    id,
    title: cleanTitle(list.title),
    kind,
    addr: addrJoined && !containsHangul(addrJoined) ? addrJoined : null,
    lat,
    lon,
    image: list.firstimage?.trim() || list.firstimage2?.trim() || null,
    tel: list.tel?.trim() || null,
    // 휴관일 원문 — 태그만 정리하고 한글은 보존한다(판정용이자 표시용; 표시 시 한글이면
    // UI가 결측 안내로 대체한다). 파서는 자체 정규화하므로 어느 쪽이든 동작한다.
    restRaw: sanitizeText(intro?.restdateculture),
    hours: cleanField(intro?.usetimeculture),
    fee: cleanField(intro?.usefee),
    parking: cleanField(intro?.parkingculture),
  };
}
