/**
 * 업스트림 보호 캐시(모듈 스코프 메모리 + inflight). 형제앱들의 캐시 패턴을 옮긴 것.
 *
 * 왜 필수인가: 언어가 4개 × 오퍼레이션당 1,000회/일. 축제 목록은 위치와 무관하므로
 * **언어당 하루 1회**만 받으면 모든 사용자를 커버한다 — 위치별로 받으면 쿼터가 금방 터진다.
 *
 * 규칙:
 *  - 성공만 캐시한다. 쿼터·타임아웃 실패는 예외로 그대로 던진다(호출부가 no-store 응답).
 *  - **TTL 을 KST 자정에서 자른다.** "이번 주말/오늘" 상태는 KST '오늘'에 의존하므로,
 *    자정을 넘긴 캐시를 재사용하면 상태가 하루씩 틀린다(F-11). 자정 컷으로 원천 차단.
 *  - Vercel 인스턴스는 언제든 새로 뜨므로 이 메모리 캐시는 웜 인스턴스 안에서의 최선이고,
 *    교차 인스턴스 지속성은 라우트의 CDN(s-maxage) 계층이 담당한다.
 */

import { fetchDetailCommon, fetchFestivals, type DetailCommonRaw } from './kto-api';
import { normalize, type Festival } from './festivals';
import { msUntilKstMidnight, todayYmdKst } from './kst';

interface ListEntry {
  /** 이 캐시가 무효화될 시각(=다음 KST 자정 인스턴트). */
  expiresAt: number;
  festivals: Festival[];
}

const listCache = new Map<string, ListEntry>();
const listInflight = new Map<string, Promise<Festival[]>>();

/**
 * 한 서비스(언어)의 전국 축제 목록(정규화 완료). 성공 시 KST 자정까지 캐시.
 * `service` 는 서버 전용 서비스명(EngService2 등). 캐시 키에 KST 날짜를 넣어 날짜가
 * 바뀌면 자동으로 새 키가 되게 한다(자정 컷과 이중 안전장치).
 */
export async function getFestivalsCached(service: string): Promise<Festival[]> {
  const today = todayYmdKst();
  const key = `${service}:${today}`;

  const hit = listCache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.festivals;

  const pending = listInflight.get(key);
  if (pending) return pending;

  const p = fetchFestivals(service, today)
    .then((raws) => {
      const festivals = raws
        .map(normalize)
        .filter((f): f is Festival => f !== null);
      // 자정을 넘기지 않게 TTL 을 다음 KST 자정으로 자른다.
      listCache.set(key, { expiresAt: Date.now() + msUntilKstMidnight(), festivals });
      // 어제 키 등 오래된 항목 청소.
      for (const k of listCache.keys()) {
        if (!k.endsWith(`:${today}`)) listCache.delete(k);
      }
      return festivals;
    })
    .finally(() => {
      listInflight.delete(key); // 실패든 성공이든 inflight 는 비운다(실패는 재시도 가능해야)
    });

  listInflight.set(key, p);
  return p;
}

interface DetailEntry {
  at: number;
  value: DetailCommonRaw | null;
}

/** 상세(overview 등)는 거의 안 바뀌므로 길게 잡는다. */
const DETAIL_TTL_MS = 12 * 60 * 60 * 1000;
const DETAIL_MAX = 2000;
const detailCache = new Map<string, DetailEntry>();
const detailInflight = new Map<string, Promise<DetailCommonRaw | null>>();

/** 상세 조회(캐시). 성공만 캐시(null=레코드 없음도 유효한 답이라 캐시). 실패는 던진다. */
export async function getDetailCached(
  service: string,
  contentId: string,
): Promise<DetailCommonRaw | null> {
  const key = `${service}:${contentId}`;
  const hit = detailCache.get(key);
  if (hit && Date.now() - hit.at < DETAIL_TTL_MS) return hit.value;

  const pending = detailInflight.get(key);
  if (pending) return pending;

  const p = fetchDetailCommon(service, contentId)
    .then((value) => {
      detailCache.set(key, { at: Date.now(), value });
      if (detailCache.size > DETAIL_MAX) {
        const oldest = detailCache.keys().next().value;
        if (oldest !== undefined) detailCache.delete(oldest);
      }
      return value;
    })
    .finally(() => {
      detailInflight.delete(key);
    });

  detailInflight.set(key, p);
  return p;
}
