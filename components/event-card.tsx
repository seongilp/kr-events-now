'use client';

import { CalendarDays, MapPin } from 'lucide-react';

import type { Festival, FestivalStatus } from '@/lib/festivals';
import { dict, type Locale } from '@/lib/i18n';
import { formatYmd } from '@/lib/format';
import { phaseBadgeClass, phaseLabel } from '@/lib/phase';
import { cn } from '@/lib/utils';

/**
 * 리스트의 한 축제 카드. 거리·상태·기간을 한눈에.
 *
 * 결측을 값인 척 하지 않는다(F-6): 거리를 모르면(위치 폴백 등) "거리 미상"으로,
 * 주소가 없으면 주소 줄을 아예 그리지 않는다(빈 "· "를 노출하지 않음).
 */
export function EventCard({
  festival,
  status,
  distanceKm,
  locale,
  selected,
  onSelect,
}: {
  festival: Festival;
  status: FestivalStatus;
  distanceKm: number | null;
  locale: Locale;
  selected: boolean;
  onSelect: () => void;
}) {
  const d = dict(locale);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full gap-3 rounded-xl border p-3 text-left transition-colors',
        selected
          ? 'border-primary bg-accent'
          : 'border-border bg-card hover:border-muted-foreground/40',
      )}
    >
      {festival.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={festival.image}
          alt=""
          loading="lazy"
          className="size-16 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <CalendarDays className="size-5" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{festival.title}</h3>
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
              phaseBadgeClass(status.phase),
            )}
          >
            {phaseLabel(status, d)}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5 shrink-0" />
          <span className="truncate">
            {d.dateRange(formatYmd(festival.startYmd, locale), formatYmd(festival.endYmd, locale))}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">
            {distanceKm != null ? d.distanceAway(distanceKm) : d.distanceUnknown}
            {festival.addr ? ` · ${festival.addr}` : ''}
          </span>
        </div>
      </div>
    </button>
  );
}
