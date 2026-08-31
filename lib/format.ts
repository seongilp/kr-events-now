import { INTL_LOCALE, type Locale } from './i18n';

/**
 * `20260901` → 로케일별 짧은 날짜. UTC 로 조립해 타임존에 흔들리지 않게 한다
 * (날짜만 보여주므로 시각·타임존은 의미 없다).
 */
export function formatYmd(ymd: string, locale: Locale): string {
  if (!/^\d{8}$/.test(ymd)) return ymd;
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6));
  const day = Number(ymd.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, day));
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
