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
import { KtoApiFailure } from './kto-api';
import { msUntilKstMidnight, todayYmdKst } from './kst';

/**
 * 상세 병합률이 이보다 낮으면 배치가 throttle 등으로 대부분 실패한 것 → 캐시하지 않고 실패로
 * 던진다(F-4). 부분 결측을 자정까지 굳혀 "오늘 여는 곳" 판정을 반나절 망치는 걸 막는다.
 */
const MIN_INTRO_COVERAGE = 0.7;

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
  // 배치가 대부분 실패했으면(초당 제한 지속 등) 캐시 금지 — 예외로 던져 다음 요청이 재시도.
  if (list.length > 0 && introCoverage < MIN_INTRO_COVERAGE) {
    throw new KtoApiFailure('PARTIAL', `intro coverage too low: ${introCoverage.toFixed(2)}`);
  }

  return {
    expiresAt: Date.now() + msUntilKstMidnight(),
    museums,
    introCoverage,
  };
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
