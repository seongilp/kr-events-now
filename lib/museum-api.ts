/**
 * 박물관·미술관 TourAPI 클라이언트. **서버 전용.** kto-api.ts 와 같은 규칙을 따른다:
 *  - serviceKey verbatim(재인코딩 금지, 403 함정), AbortSignal.timeout 6초, resultCode 로 실패 판정.
 *  - 오퍼레이션: areaBasedList2(목록) + detailIntro2(상세). 둘 다 contentTypeId=78(외국어).
 *
 * 쿼터 설계(오퍼레이션당 1,000/일):
 *  - areaBasedList2: 언어당 박물관·미술관 각 1페이지(numOfRows 크게) = 언어당 2콜.
 *  - detailIntro2: 언어당 목록 전건(약 145~198건)을 동시성 풀로 배치 호출. 언어당 ≤ 198콜.
 *    4언어 모두 하루 처음 1회만(자정까지 캐시) → detailIntro2 최대 ~703/일 < 1,000. (kto-cache 참조)
 */

import { itemsOf, parseApiError } from './festivals';
import {
  CAT3_GALLERY,
  CAT3_MUSEUM,
  type MuseumIntroRaw,
  type MuseumListRaw,
} from './museums';
import { KtoApiFailure } from './kto-api';

const HOST = 'https://apis.data.go.kr/B551011';
const TIMEOUT_MS = 6000;
const LIST_ROWS = 300; // 박물관 최대 ~127, 미술관 ~73 → 한 페이지에 담긴다.
/**
 * detailIntro2 는 data.go.kr 의 **초당** 요청 제한(returnReasonCode 23)에 걸린다. 실측상
 * 동시성 자체보다 **요청 시작 간격**이 관건이다 — 순차(≈3~4 req/s)는 96% 성공, 동시 5~12
 * 버스트는 절반이 throttle. 그래서 동시성이 아니라 **시작 간격(pacer)**으로 TPS 를 조인다.
 * REQUEST_INTERVAL_MS 마다 한 건씩만 출발시키고, 응답 지연은 소수 동시성으로 흡수한다.
 */
const DETAIL_CONCURRENCY = 6;
const REQUEST_INTERVAL_MS = 230; // ≈4.3 req/s. 언어당 ~198건이면 ≤45s(maxDuration 60 내).
/** 초당 제한(23)일 때만 재시도. 일일 쿼터(22)는 재시도 않고 배치를 조기 중단한다. */
const THROTTLE_CODE = '23';
const DAILY_QUOTA_CODE = '22';
const RETRY_BACKOFF_MS = [600, 1200, 2000];

function serviceKey(): string {
  const key = process.env.DATA_GO_KR_KEY?.trim() || process.env.HORSE?.trim();
  if (!key) throw new KtoApiFailure('NO_KEY', 'DATA_GO_KR_KEY 가 설정되지 않았습니다.');
  return key.includes('%') ? key : encodeURIComponent(key);
}

const COMMON = 'MobileOS=ETC&MobileApp=kr-events-now&_type=json';

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const code = /<returnReasonCode>([^<]*)</.exec(text)?.[1] ?? 'NON_JSON';
    throw new KtoApiFailure(code, `응답 해석 실패: ${text.slice(0, 120)}`);
  }
  const err = parseApiError(json);
  if (err) throw new KtoApiFailure(err.code, err.msg);
  return json;
}

/** cat3 한 분류의 목록을 받는다(전국, 좌표는 클라이언트가 거른다). */
async function fetchListByCat3(service: string, cat3: string): Promise<MuseumListRaw[]> {
  const url =
    `${HOST}/${service}/areaBasedList2?serviceKey=${serviceKey()}&${COMMON}` +
    `&contentTypeId=78&cat1=A02&cat2=A0206&cat3=${cat3}&arrange=A&numOfRows=${LIST_ROWS}&pageNo=1`;
  return itemsOf(await fetchJson(url)) as MuseumListRaw[];
}

/** 한 언어의 박물관+미술관 목록(상세 없이). cat3 가 이미 붙어 온다. */
export async function fetchMuseumList(service: string): Promise<MuseumListRaw[]> {
  const [museums, galleries] = await Promise.all([
    fetchListByCat3(service, CAT3_MUSEUM),
    fetchListByCat3(service, CAT3_GALLERY),
  ]);
  return [...museums, ...galleries];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 초당 제한(23)이면 백오프 후 재시도. 그 외 실패는 즉시 던진다. */
async function fetchWithThrottleRetry(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchJson(url);
    } catch (e) {
      const throttled = e instanceof KtoApiFailure && e.code === THROTTLE_CODE;
      if (!throttled || attempt >= RETRY_BACKOFF_MS.length) throw e;
      await sleep(RETRY_BACKOFF_MS[attempt]);
    }
  }
}

/** 한 시설의 상세(관람시간·휴관일 등). 실패 시 예외(캐시 금지). */
export async function fetchMuseumIntro(
  service: string,
  contentId: string,
): Promise<MuseumIntroRaw | null> {
  const url =
    `${HOST}/${service}/detailIntro2?serviceKey=${serviceKey()}&${COMMON}` +
    `&contentId=${encodeURIComponent(contentId)}&contentTypeId=78`;
  return (itemsOf(await fetchWithThrottleRetry(url))[0] as MuseumIntroRaw | undefined) ?? null;
}

/**
 * contentId 목록의 상세를 동시성 풀로 배치 호출. 개별 실패는 null 로 흡수(그 항목은 휴관일
 * 원문이 없을 뿐, 전체가 무너지면 안 된다). 순서는 입력과 무관(맵으로 돌려준다).
 */
export async function fetchIntrosBatch(
  service: string,
  ids: string[],
): Promise<Map<string, MuseumIntroRaw | null>> {
  const out = new Map<string, MuseumIntroRaw | null>();
  let cursor = 0;
  // 일일 쿼터 소진(코드 22)이 감지되면 나머지를 중단한다 — 소진된 쿼터에 200콜을 더
  // 던져 봐야 전부 실패다. 목록(제목·좌표)은 이미 확보돼 있으므로 상세만 결측으로 둔다.
  let dailyQuotaHit = false;
  // pacer: 다음 요청을 출발시킬 수 있는 가장 이른 시각. 워커들이 이 슬롯을 나눠 가져
  // 시작 간격을 REQUEST_INTERVAL_MS 로 강제한다(초당 한도 방어).
  let nextSlot = Date.now();
  async function pace(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, nextSlot);
    nextSlot = slot + REQUEST_INTERVAL_MS;
    if (slot > now) await sleep(slot - now);
  }
  async function worker(): Promise<void> {
    while (cursor < ids.length && !dailyQuotaHit) {
      const id = ids[cursor];
      cursor += 1;
      await pace();
      try {
        out.set(id, await fetchMuseumIntro(service, id));
      } catch (e) {
        out.set(id, null); // 개별 실패는 흡수(부분 결측), 배치는 계속.
        if (e instanceof KtoApiFailure && e.code === DAILY_QUOTA_CODE) dailyQuotaHit = true;
      }
    }
  }
  const workers = Array.from({ length: Math.min(DETAIL_CONCURRENCY, ids.length) }, worker);
  await Promise.all(workers);
  return out;
}
