'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Compass, Loader2, MapPin } from 'lucide-react';

import type { Festival, FestivalStatus, TimeWindow } from '@/lib/festivals';
import { inWindow, statusOf } from '@/lib/festivals';
import { haversineKm, SEOUL, type LatLon } from '@/lib/geo';
import { dict, LOCALES, LOCALE_LABEL, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { EventCard } from '@/components/event-card';
import { EventDetail } from '@/components/event-detail';
import { EventsMap, type MapPoint } from '@/components/events-map';

/** 위치 상태를 명확히 구분한다(무한 로딩 금지, F-6). */
type GeoState =
  | { kind: 'locating' }
  | { kind: 'granted'; at: LatLon }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'unsupported' };

/** 목록 로딩 상태. "0건"과 "로딩중"과 "실패"를 절대 섞지 않는다(F-6). */
type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; code?: string }
  | { kind: 'ready'; festivals: Festival[] };

interface Ranked {
  festival: Festival;
  status: FestivalStatus;
  distanceKm: number | null;
}

const WINDOWS: TimeWindow[] = ['weekend', 'twoweeks', 'upcoming'];

export function EventsBrowser({ locale }: { locale: Locale }) {
  const d = dict(locale);
  const [list, setList] = useState<ListState>({ kind: 'loading' });
  const [geo, setGeo] = useState<GeoState>({ kind: 'locating' });
  const [window, setWindow] = useState<TimeWindow>('twoweeks');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 상태·정렬의 기준 시각을 마운트에 고정 — 렌더마다 흔들리지 않게.
  const nowRef = useRef(Date.now());

  /* 목록 로드. 실패는 "결측"이 아니라 "실패" 상태로. */
  useEffect(() => {
    let alive = true;
    setList({ kind: 'loading' });
    fetch(`/api/festivals?lang=${locale}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { code?: string };
          throw Object.assign(new Error('upstream'), { code: body.code });
        }
        return r.json() as Promise<{ festivals: Festival[] }>;
      })
      .then((json) => {
        if (alive) setList({ kind: 'ready', festivals: json.festivals });
      })
      .catch((e: { code?: string }) => {
        if (alive) setList({ kind: 'error', code: e?.code });
      });
    return () => {
      alive = false;
    };
  }, [locale]);

  /* 위치. map 화면에 들어온 건 "내 주변"을 보겠다는 의도라 진입 시 한 번 요청한다.
     거부/불가/미지원을 각각 다른 상태로 두고, 어느 경우든 서울로 폴백해 계속 동작한다. */
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeo({ kind: 'unsupported' });
      return;
    }
    let alive = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (alive) setGeo({ kind: 'granted', at: { lat: pos.coords.latitude, lon: pos.coords.longitude } });
      },
      (err) => {
        if (!alive) return;
        setGeo({ kind: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
    return () => {
      alive = false;
    };
  }, []);

  const requestLocation = () => {
    setGeo({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ kind: 'granted', at: { lat: pos.coords.latitude, lon: pos.coords.longitude } }),
      (err) => setGeo({ kind: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // 거리 계산의 중심: 위치가 있으면 그 위치, 없으면 서울(폴백).
  const center: LatLon | null = geo.kind === 'granted' ? geo.at : null;
  const origin: LatLon = center ?? SEOUL;
  const hasRealLocation = geo.kind === 'granted';

  /* 필터 + 상태 + 거리 계산 + 거리순 정렬. */
  const ranked: Ranked[] = useMemo(() => {
    if (list.kind !== 'ready') return [];
    const now = nowRef.current;
    return list.festivals
      .filter((f) => inWindow(f, window, now))
      .map((f) => ({
        festival: f,
        status: statusOf(f, now),
        // 진짜 위치가 없으면 거리를 "미상"으로 둔다 — 서울 기준 거리를 진짜인 척 하지 않는다.
        distanceKm: hasRealLocation ? haversineKm(origin, { lat: f.lat, lon: f.lon }) : null,
      }))
      .sort((a, b) => {
        if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
        // 거리 미상이면 시작일 가까운 순.
        return a.festival.startYmd.localeCompare(b.festival.startYmd);
      });
  }, [list, window, origin, hasRealLocation]);

  const points: MapPoint[] = useMemo(
    () =>
      ranked.map((r) => ({
        id: r.festival.id,
        lon: r.festival.lon,
        lat: r.festival.lat,
        phase: r.status.phase,
        title: r.festival.title,
      })),
    [ranked],
  );

  const selected = ranked.find((r) => r.festival.id === selectedId) ?? null;

  return (
    <div className="flex h-dvh flex-col">
      {/* 상단 바: 로고 + 언어 스위처 */}
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <Link href={`/${locale}`} className="flex items-center gap-2 text-sm font-bold">
          <Compass className="size-4 text-primary" />
          {d.appName}
        </Link>
        <nav className="flex gap-1" aria-label={d.langLabel}>
          {LOCALES.map((l) => (
            <Link
              key={l}
              href={`/${l}/map`}
              className={cn(
                'rounded-full px-2 py-1 text-[11px] transition-colors',
                l === locale ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {LOCALE_LABEL[l]}
            </Link>
          ))}
        </nav>
      </header>

      {/* 시간 필터 */}
      <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-2">
        {WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWindow(w)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              w === window
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {w === 'weekend' ? d.filterWeekend : w === 'twoweeks' ? d.filterTwoWeeks : d.filterUpcoming}
          </button>
        ))}
      </div>

      {/* 위치 상태 배너: 폴백/거부/불가를 명확히. granted 면 배너 없음. */}
      {geo.kind !== 'granted' && geo.kind !== 'locating' && (
        <div className="flex items-center gap-2 border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          <MapPin className="size-3.5 shrink-0" />
          <span className="flex-1">
            {geo.kind === 'denied' ? d.locationDenied : d.locationUnavailable}
          </span>
          {geo.kind !== 'unsupported' && (
            <button
              type="button"
              onClick={requestLocation}
              className="shrink-0 rounded-full border border-amber-400/40 px-2 py-0.5 font-medium hover:bg-amber-400/10"
            >
              {d.useMyLocation}
            </button>
          )}
        </div>
      )}

      {/* 지도가 첫 화면: 위쪽에 크게. 리스트는 그 아래. 데스크톱은 좌우 분할. */}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row-reverse">
        {/* 지도 */}
        <div className="relative h-[45dvh] w-full shrink-0 sm:h-auto sm:flex-1">
          {list.kind === 'ready' && <EventsMap points={points} center={center} selectedId={selectedId} onSelect={setSelectedId} />}
          {list.kind === 'loading' && (
            <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {d.loading}
            </div>
          )}
          {list.kind === 'error' && (
            <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
              <AlertCircle className="size-6 text-destructive" />
              <p className="text-muted-foreground">{d.loadFailed}</p>
              <button
                type="button"
                onClick={() => location.reload()}
                className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent"
              >
                {d.retry}
              </button>
            </div>
          )}
        </div>

        {/* 리스트 */}
        <div className="flex min-h-0 flex-1 flex-col sm:w-96 sm:flex-none sm:border-r sm:border-border">
          <div className="flex items-baseline justify-between px-4 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{d.nearbyEvents}</span>
            {list.kind === 'ready' && (
              <span>
                {d.eventsCount(ranked.length)}
                {hasRealLocation ? ` · ${d.sortByDistance}` : ` · ${d.locationFallback}`}
              </span>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
            {list.kind === 'ready' && ranked.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <MapPin className="size-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">{d.emptyNearby}</p>
                <p className="text-xs text-muted-foreground">{d.emptyNearbyHint}</p>
              </div>
            )}
            {list.kind === 'ready' &&
              ranked.map((r) => (
                <EventCard
                  key={r.festival.id}
                  festival={r.festival}
                  status={r.status}
                  distanceKm={r.distanceKm}
                  locale={locale}
                  selected={r.festival.id === selectedId}
                  onSelect={() => setSelectedId(r.festival.id)}
                />
              ))}
            {list.kind === 'loading' &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[88px] animate-pulse rounded-xl bg-muted" />
              ))}
          </div>
        </div>
      </div>

      {/* 상세 시트: 모바일은 하단, 데스크톱은 우하단 카드 */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-20 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-96">
          <EventDetail
            festival={selected.festival}
            status={selected.status}
            distanceKm={selected.distanceKm}
            locale={locale}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  );
}
