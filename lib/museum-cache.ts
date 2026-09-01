/**
 * 박물관 목록(정규화 완료) 캐시. kto-cache.ts 와 같은 규약:
 *  - 성공만 캐시, 실패는 예외로 던진다(no-store).
 *  - TTL 을 KST 자정에서 자른다("오늘 여는가" 판정이 KST '오늘'에 걸리므로).
 *  - inflight 로 콜드 요청 중복(배치 폭주)을 막는다 — 이게 여기선 특히 중요하다:
 *    첫 요청이 언어당 최대 ~198 detailIntro2 를 때리므로, 동시 요청이 그걸 배로 치면 안 된다.
 *
 * 목록 단계에서 상세(휴관일)까지 합쳐 캐시하는 이유: "오늘 여는 곳" 필터가 목록 단계에서
 * 휴관일을 알아야 동작하기 때문. 상세를 시트 열 때만 치면 필터가 성립하지 않는다(팀 지시).
 * 대신 하루 1회 배치로 모아 자정까지 캐시해 쿼터를 지킨다.
 */

import { fetchIntrosBatch, fetchMuseumList } from './museum-api';
import { normalizeMuseum, type Museum } from './museums';
import { msUntilKstMidnight, todayYmdKst } from './kst';

/**
 * 상세(휴관일) 병합률 임계치. 이 이상이면 정상으로 보고 자정까지 캐시한다.
 * 미만이면 상세 쿼터(코드 22)·throttle 로 대부분 실패한 것 — **목록(제목·좌표·종류)은
 * 여전히 유효하므로 레이어를 죽이지 않고 그대로 내보내되**, 자정까지 굳히지 않고 짧게만
 * 캐시해 쿼터가 풀리면 곧 다시 채운다. (제목의 한글 정리는 목록 단계라 상세와 무관하다.)
 */
export const MIN_INTRO_COVERAGE = 0.7;
/** 상세 병합률이 낮을 때의 짧은 캐시 수명(분). 상세 쿼터 회복 후 재시도되도록. */
const LOW_COVERAGE_TTL_MS = 10 * 60 * 1000;

interface Entry {
  expiresAt: number;
  museums: Museum[];
  /** 상세(휴관일) 조회에 성공한 비율 — 라우트가 부분 결측을 알릴 수 있게. */
  introCoverage: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();

async function build(service: string): Promise<Entry> {
  const list = await fetchMuseumList(service);
  const ids = list.map((r) => r.contentid?.trim()).filter((x): x is string => !!x);
  const intros = await fetchIntrosBatch(service, ids);

  let introOk = 0;
  const museums = list
    .map((raw) => {
      const intro = raw.contentid ? intros.get(raw.contentid.trim()) ?? null : null;
      if (intro) introOk += 1;
      return normalizeMuseum(raw, intro);
    })
    .filter((m): m is Museum => m !== null);

  const introCoverage = list.length ? introOk / list.length : 0;
  // 상세가 충분하면 자정까지, 부족하면(쿼터·throttle) 짧게만 캐시. 어느 쪽이든 목록은 내보낸다
  // — 제목·좌표는 상세와 무관하게 유효하므로 상세 쿼터 때문에 레이어를 통째로 죽이지 않는다.
  const ttl = introCoverage >= MIN_INTRO_COVERAGE ? msUntilKstMidnight() : LOW_COVERAGE_TTL_MS;
  return { expiresAt: Date.now() + ttl, museums, introCoverage };
}

/** 한 언어(서비스)의 박물관+미술관(상세 병합). 성공 시 KST 자정까지 캐시. */
export async function getMuseumsCached(
  service: string,
): Promise<{ museums: Museum[]; introCoverage: number }> {
  const key = `${service}:${todayYmdKst()}`;

  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt) return { museums: hit.museums, introCoverage: hit.introCoverage };

  const pending = inflight.get(key);
  if (pending) {
    const e = await pending;
    return { museums: e.museums, introCoverage: e.introCoverage };
  }

  const p = build(service)
    .then((entry) => {
      cache.set(key, entry);
      for (const k of cache.keys()) if (!k.endsWith(`:${todayYmdKst()}`)) cache.delete(k);
      return entry;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, p);
  const e = await p;
  return { museums: e.museums, introCoverage: e.introCoverage };
}
