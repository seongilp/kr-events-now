import { notFound } from 'next/navigation';

import { isLocale, type Locale } from '@/lib/i18n';
import { EventsBrowser } from '@/components/events-browser';

/**
 * 앱 본체. 지도가 첫 화면(형제앱 meongtrip 에서 사용자가 "목록보다 지도를 먼저"라고 했다).
 * 데이터 로딩·위치·필터는 전부 클라이언트에서 — 서버는 목록 API 만 캐시해 준다.
 */
export default async function MapPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <EventsBrowser locale={lang as Locale} />;
}
