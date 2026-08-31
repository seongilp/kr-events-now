'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, ExternalLink, MapPin, Navigation, Phone, X } from 'lucide-react';

import type { Festival, FestivalStatus } from '@/lib/festivals';
import { dict, type Locale } from '@/lib/i18n';
import { formatYmd } from '@/lib/format';
import { phaseBadgeClass, phaseLabel } from '@/lib/phase';
import { cn } from '@/lib/utils';

interface DetailData {
  overview: string | null;
  homepage: string | null;
  unavailable: boolean;
}

/**
 * 상세 시트. overview 는 열 때 lazy fetch(사용자가 여는 것만 detailCommon2 를 쳐서 쿼터 분산).
 *
 * 세 상태를 서로 다르게 보여준다(F-6):
 *  - loading      : 불러오는 중(스켈레톤 아님, 짧은 텍스트)
 *  - overview 있음 : 그대로
 *  - overview null & !unavailable : 그 언어로 설명이 **없음**(overviewMissing) — 한국어로 안 메운다(F-2)
 *  - unavailable  : 지금 **불러오지 못함**(loadFailed + 재시도)
 */
export function EventDetail({
  festival,
  status,
  distanceKm,
  locale,
  onClose,
}: {
  festival: Festival;
  status: FestivalStatus;
  distanceKm: number | null;
  locale: Locale;
  onClose: () => void;
}) {
  const d = dict(locale);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDetail(null);
    fetch(`/api/festival/${festival.id}?lang=${locale}`)
      .then((r) => r.json())
      .then((json: DetailData) => {
        if (alive) setDetail(json);
      })
      .catch(() => {
        // 네트워크 자체 실패도 "불러오지 못함"으로.
        if (alive) setDetail({ overview: null, homepage: null, unavailable: true });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [festival.id, locale, reloadKey]);

  // 좌표 기반 길찾기. 주소가 한글일 수 있으므로(로마자여도) 좌표로 여는 게 가장 안전하다.
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${festival.lat},${festival.lon}`;

  return (
    <div className="flex max-h-[70dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-card sm:max-h-full sm:rounded-2xl sm:border">
      {/* 헤더 */}
      <div className="flex items-start gap-2 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              'mb-1.5 inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium',
              phaseBadgeClass(status.phase),
            )}
          >
            {phaseLabel(status, d)}
          </span>
          <h2 className="text-base font-bold leading-snug">{festival.title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={d.close}
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* 본문 스크롤 */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {festival.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={festival.image}
            alt=""
            className="h-40 w-full rounded-xl object-cover"
            loading="lazy"
          />
        )}

        <dl className="space-y-3 text-sm">
          <div className="flex gap-2">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <dt className="text-xs text-muted-foreground">{d.detailPeriod}</dt>
              <dd>
                {d.dateRange(
                  formatYmd(festival.startYmd, locale),
                  formatYmd(festival.endYmd, locale),
                )}
              </dd>
            </div>
          </div>

          {/* 주소·거리: 있는 것만. 결측을 빈 값으로 노출하지 않는다. */}
          <div className="flex gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{d.detailAddress}</dt>
              <dd>{festival.addr ?? d.noInfo}</dd>
              <dd className="text-xs text-muted-foreground">
                {distanceKm != null ? d.distanceAway(distanceKm) : d.distanceUnknown}
              </dd>
            </div>
          </div>

          {festival.tel && (
            <div className="flex gap-2">
              <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{d.detailTel}</dt>
                <dd className="break-words">{festival.tel}</dd>
              </div>
            </div>
          )}
        </dl>

        {/* overview: 로딩/있음/없음/실패를 구분 */}
        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">{d.detailOverview}</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">{d.loading}</p>
          ) : detail?.unavailable ? (
            <div className="text-sm">
              <p className="text-muted-foreground">{d.loadFailed}</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-1 text-primary underline underline-offset-2"
              >
                {d.retry}
              </button>
            </div>
          ) : detail?.overview ? (
            <p className="whitespace-pre-line text-sm leading-relaxed">{detail.overview}</p>
          ) : (
            // 그 언어로 설명이 없음 — 한국어/기계번역으로 메우지 않는다(F-2).
            <p className="text-sm italic text-muted-foreground">{d.overviewMissing}</p>
          )}
        </div>
      </div>

      {/* 액션 */}
      <div className="flex gap-2 border-t border-border p-3">
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          <Navigation className="size-4" />
          {d.directions}
        </a>
        {detail?.homepage && (
          <a
            href={detail.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium"
          >
            <ExternalLink className="size-4" />
            {d.detailHomepage}
          </a>
        )}
      </div>
    </div>
  );
}
