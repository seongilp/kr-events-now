import { NextResponse } from 'next/server';

import { getMuseumsCached, MIN_INTRO_COVERAGE } from '@/lib/museum-cache';
import { isLocale, SERVICE_BY_LOCALE } from '@/lib/i18n';
import { msUntilKstMidnight, todayYmdKst } from '@/lib/kst';

/**
 * 한 언어의 전국 박물관·미술관(상세 휴관일 병합). 위치와 무관 — 클라이언트가 거리·개관을 계산한다.
 *
 * 콜드 요청은 목록 2콜 + detailIntro2 배치(언어당 ≤198콜, 동시성 12)라 수 초 걸린다.
 * 자정까지 CDN·메모리로 재사용하므로 하루 1회만 비용이 든다. 실패는 캐시 금지(F-4).
 */
// 콜드 배치가 서버리스 타임아웃에 걸리지 않게 넉넉히 잡는다(Vercel Node).
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lang = searchParams.get('lang') ?? '';
  if (!isLocale(lang)) {
    return NextResponse.json({ error: 'invalid lang' }, { status: 400 });
  }

  try {
    const { museums, introCoverage } = await getMuseumsCached(SERVICE_BY_LOCALE[lang]);
    // 상세 병합률이 낮으면(쿼터·throttle) 자정까지 굳히지 않고 짧게(5분)만 캐시해 곧 재시도.
    const secToMidnight = Math.max(60, Math.floor(msUntilKstMidnight() / 1000));
    const sMaxAge = introCoverage >= MIN_INTRO_COVERAGE ? secToMidnight : 300;
    return NextResponse.json(
      { museums, today: todayYmdKst(), count: museums.length, introCoverage },
      {
        headers: {
          'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=1800`,
        },
      },
    );
  } catch (e) {
    const code = e instanceof Error && 'code' in e ? (e as { code: string }).code : 'ERROR';
    return NextResponse.json(
      { error: 'upstream', code },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
