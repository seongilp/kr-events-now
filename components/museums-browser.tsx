'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Info, Loader2, MapPin } from 'lucide-react';

import type { Museum } from '@/lib/museums';
import { openTodayState, type OpenState } from '@/lib/restday';
import { kstToday } from '@/lib/kst';
import { haversineKm, SEOUL, type LatLon } from '@/lib/geo';
import { dict, type Locale } from '@/lib/i18n';
import { OPEN_STATE_COLOR } from '@/lib/museum-ui';
import { cn } from '@/lib/utils';
import { MuseumCard } from '@/components/museum-card';
import { MuseumDetail } from '@/components/museum-detail';
import { EventsMap, type MapPoint } from '@/components/events-map';

type GeoState =
  | { kind: 'locating' }
  | { kind: 'granted'; at: LatLon }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'unsupported' };

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; code?: string }
  | { kind: 'ready'; museums: Museum[] };

type MuseumFilter = 'all' | 'open';

interface Ranked {
  museum: Museum;
  state: OpenState;
  distanceKm: number | null;
}

export function MuseumsBrowser({ locale }: { locale: Locale }) {
  const d = dict(locale);
  const [list, setList] = useState<ListState>({ kind: 'loading' });
  const [geo, setGeo] = useState<GeoState>({ kind: 'locating' });
  const [filter, setFilter] = useState<MuseumFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const nowRef = useRef(Date.now());
  // 개관 판정 기준 '오늘'은 KST 에폭 일수 정수(자정 경계에서 안 밀린다).
  const epochDay = kstToday(nowRef.current);

  /* 목록 로드(상세 휴관일 병합본). 실패는 "결측"이 아니라 "실패" 상태로. */
  useEffect(() => {
    let alive = true;
    setList({ kind: 'loading' });
    fetch(`/api/museums?lang=${locale}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { code?: string };
          throw Object.assign(new Error('upstream'), { code: body.code });
        }
        return r.json() as Promise<{ museums: Museum[] }>;
      })
      .then((json) => {
        if (alive) setList({ kind: 'ready', museums: json.museums });
      })
      .catch((e: { code?: string }) => {
        if (alive) setList({ kind: 'error', code: e?.code });
      });
    return () => {
      alive = false;
    };
  }, [locale]);

  /* 위치. 진입 시 한 번 요청, 거부/불가/미지원을 각각 다른 상태로 두고 서울로 폴백. */
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

  const center: LatLon | null = geo.kind === 'granted' ? geo.at : null;
  const origin: LatLon = center ?? SEOUL;
  const hasRealLocation = geo.kind === 'granted';

  /* 상태 판정 + 거리 + 거리순 정렬(필터는 아래에서 별도로). */
  const rankedAll: Ranked[] = useMemo(() => {
    if (list.kind !== 'ready') return [];
    return list.museums
      .map((m) => ({
        museum: m,
        state: openTodayState(m.restRaw, epochDay),
        distanceKm: hasRealLocation ? haversineKm(origin, { lat: m.lat, lon: m.lon }) : null,
      }))
      .sort((a, b) => {
        if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
        return a.museum.title.localeCompare(b.museum.title);
      });
  }, [list, origin, hasRealLocation, epochDay]);

  const ranked = useMemo(
    () => (filter === 'open' ? rankedAll.filter((r) => r.state === 'open') : rankedAll),
    [rankedAll, filter],
  );

  // "오늘 여는 곳"에서 판정 불가로 빠진 건수 — 조용히 숨기지 않고 화면에 밝힌다.
  const undeterminedHidden = useMemo(
    () => (filter === 'open' ? rankedAll.filter((r) => r.state === 'unknown').length : 0),
    [rankedAll, filter],
  );

  const points: MapPoint[] = useMemo(
    () =>
      ranked.map((r) => ({
        id: r.museum.id,
        lon: r.museum.lon,
        lat: r.museum.lat,
        color: OPEN_STATE_COLOR[r.state],
        title: r.museum.title,
      })),
    [ranked],
  );

  const selected = ranked.find((r) => r.museum.id === selectedId) ?? null;

  return (
    <>
      {/* 필터: 전체 / 오늘 여는 곳 */}
      <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-2">
        {(['all', 'open'] as MuseumFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              f === filter
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {f === 'all' ? d.filterAllMuseums : d.filterOpenToday}
          </button>
        ))}
      </div>

      {/* 위치 배너 */}
      {geo.kind !== 'granted' && geo.kind !== 'locating' && (
        <div className="flex items-center gap-2 border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          <MapPin className="size-3.5 shrink-0" />
          <span className="flex-1">{geo.kind === 'denied' ? d.locationDenied : d.locationUnavailable}</span>
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

      {/* 판정 불가 고지 — "오늘 여는 곳" 필터가 조용히 숨긴 게 아님을 밝힌다. */}
      {undeterminedHidden > 0 && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" />
          <span>{d.undeterminedNote(undeterminedHidden)}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row-reverse">
        {/* 지도 */}
        <div className="relative h-[45dvh] w-full shrink-0 sm:h-auto sm:flex-1">
          {list.kind === 'ready' && (
            <EventsMap points={points} center={center} selectedId={selectedId} onSelect={setSelectedId} />
          )}
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
            <span className="font-medium text-foreground">{d.nearbyMuseums}</span>
            {list.kind === 'ready' && (
              <span>
                {d.placesCount(ranked.length)}
                {hasRealLocation ? ` · ${d.sortByDistance}` : ` · ${d.locationFallback}`}
              </span>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
            {list.kind === 'ready' && ranked.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <MapPin className="size-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">{d.emptyMuseums}</p>
                <p className="text-xs text-muted-foreground">{d.emptyMuseumsHint}</p>
              </div>
            )}
            {list.kind === 'ready' &&
              ranked.map((r) => (
                <MuseumCard
                  key={r.museum.id}
                  museum={r.museum}
                  state={r.state}
                  distanceKm={r.distanceKm}
                  locale={locale}
                  selected={r.museum.id === selectedId}
                  onSelect={() => setSelectedId(r.museum.id)}
                />
              ))}
            {list.kind === 'loading' &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[88px] animate-pulse rounded-xl bg-muted" />
              ))}
          </div>
        </div>
      </div>

      {/* 상세 시트 */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-20 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-96">
          <MuseumDetail
            museum={selected.museum}
            state={selected.state}
            distanceKm={selected.distanceKm}
            locale={locale}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </>
  );
}
