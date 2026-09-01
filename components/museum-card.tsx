'use client';

import { Landmark, MapPin, Palette } from 'lucide-react';

import type { Museum } from '@/lib/museums';
import type { OpenState } from '@/lib/restday';
import { dict, type Locale } from '@/lib/i18n';
import { openStateBadgeClass, openStateLabel } from '@/lib/museum-ui';
import { cn } from '@/lib/utils';

/**
 * 리스트의 박물관/미술관 카드. 개관 상태 배지 + 종류 + 거리.
 * 결측은 값인 척 하지 않는다: 거리를 모르면 "거리 미상", 주소 없으면 주소 줄 생략.
 */
export function MuseumCard({
  museum,
  state,
  distanceKm,
  locale,
  selected,
  onSelect,
}: {
  museum: Museum;
  state: OpenState;
  distanceKm: number | null;
  locale: Locale;
  selected: boolean;
  onSelect: () => void;
}) {
  const d = dict(locale);
  const KindIcon = museum.kind === 'gallery' ? Palette : Landmark;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full gap-3 rounded-xl border p-3 text-left transition-colors',
        selected ? 'border-primary bg-accent' : 'border-border bg-card hover:border-muted-foreground/40',
      )}
    >
      {museum.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={museum.image} alt="" loading="lazy" className="size-16 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <KindIcon className="size-5" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{museum.title}</h3>
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
              openStateBadgeClass(state),
            )}
          >
            {openStateLabel(state, d)}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          <KindIcon className="size-3.5 shrink-0" />
          <span className="truncate">
            {museum.kind === 'gallery' ? d.kindGallery : d.kindMuseum}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">
            {distanceKm != null ? d.distanceAway(distanceKm) : d.distanceUnknown}
            {museum.addr ? ` · ${museum.addr}` : ''}
          </span>
        </div>
      </div>
    </button>
  );
}
