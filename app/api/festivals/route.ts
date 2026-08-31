import { NextResponse } from 'next/server';

import { getFestivalsCached } from '@/lib/kto-cache';
import { isLocale, SERVICE_BY_LOCALE } from '@/lib/i18n';
import { msUntilKstMidnight, todayYmdKst } from '@/lib/kst';

/**
 * 한 언어의 전국 축제 목록. 위치와 무관하다 — 클라이언트가 현재 위치로 거리를 재 정렬한다.
 *
 * 캐시: 성공은 CDN 에서 KST 자정까지 재사용(s-maxage). "이번 주말/오늘" 판정이 KST '오늘'에
 * 의존하므로 자정을 넘기면 안 된다(F-11). Vercel 은 초 단위 s-maxage 를 받으므로 자정까지
 * 남은 초로 잘라 준다. 실패(쿼터·타임아웃)는 절대 캐시하지 않는다(F-4).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lang = searchParams.get('lang') ?? '';
  if (!isLocale(lang)) {
    return NextResponse.json({ error: 'invalid lang' }, { status: 400 });
  }

  try {
    const festivals = await getFestivalsCached(SERVICE_BY_LOCALE[lang]);
    // 다음 KST 자정까지 남은 초(최소 60초). 상태 판정이 KST '오늘'에 묶여 있으므로
    // CDN 캐시가 자정을 넘겨 하루 틀린 목록을 재사용하지 않게 자른다(F-11).
    const secToMidnight = Math.max(60, Math.floor(msUntilKstMidnight() / 1000));
    return NextResponse.json(
      { festivals, today: todayYmdKst(), count: festivals.length },
      {
        headers: {
          'Cache-Control': `public, s-maxage=${secToMidnight}, stale-while-revalidate=1800`,
        },
      },
    );
  } catch (e) {
    // "결측"이 아니라 "지금 불러오지 못함"으로 구분해 내보낸다(F-6). 캐시 금지.
    const code = e instanceof Error && 'code' in e ? (e as { code: string }).code : 'ERROR';
    return NextResponse.json(
      { error: 'upstream', code },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
