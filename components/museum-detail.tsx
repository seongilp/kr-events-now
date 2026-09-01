'use client';

import { CalendarX, Clock, Info, MapPin, Navigation, ParkingCircle, Phone, Ticket, X } from 'lucide-react';

import type { Museum } from '@/lib/museums';
import type { OpenState } from '@/lib/restday';
import { containsHangul } from '@/lib/festivals';
import { dict, type Locale } from '@/lib/i18n';
import { openStateBadgeClass, openStateLabel } from '@/lib/museum-ui';
import { cn } from '@/lib/utils';

/**
 * 박물관/미술관 상세 시트. 상세는 목록 단계에서 이미 병합돼 오므로 lazy fetch 가 없다.
 *
 * ★ 핵심 정직함(팀 지시):
 *  - 개관 판정(state) 배지 + **휴관일 원문(restRaw)을 항상 함께** 보여준다. 판정이 원문을
 *    대체하지 않는다 — 판정이 틀려도 사용자가 원문을 읽고 스스로 판단할 수 있어야 한다.
 *  - 판정의 한계(주간 휴관일 기준·공휴일 미확인)를 고지문으로 명시한다.
 *  - 원문에 한글이 섞이면(외국인에게 못 읽음) 원문 대신 "그 언어로 없음"을 밝힌다 — 결측은 결측.
 */
export function MuseumDetail({
  museum,
  state,
  distanceKm,
  locale,
  onClose,
}: {
  museum: Museum;
  state: OpenState;
  distanceKm: number | null;
  locale: Locale;
  onClose: () => void;
}) {
  const d = dict(locale);
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${museum.lat},${museum.lon}`;
  // 원문에 한글이 섞이면 노출하지 않는다(F-2). 판정 배지는 그대로 두되 원문은 결측 안내.
  const showRaw = museum.restRaw && !containsHangul(museum.restRaw);

  return (
    <div className="flex max-h-[75dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-card sm:max-h-full sm:rounded-2xl sm:border">
      {/* 헤더 */}
      <div className="flex items-start gap-2 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium',
                openStateBadgeClass(state),
              )}
            >
              {openStateLabel(state, d)}
            </span>
            <span className="inline-block rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              {museum.kind === 'gallery' ? d.kindGallery : d.kindMuseum}
            </span>
          </div>
          <h2 className="text-base font-bold leading-snug">{museum.title}</h2>
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

      {/* 본문 */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {museum.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={museum.image} alt="" className="h-40 w-full rounded-xl object-cover" loading="lazy" />
        )}

        {/* ★ 휴관일 원문 — 판정과 함께 항상. 판정의 근거이자 판정이 틀렸을 때의 안전망. */}
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarX className="size-3.5" />
            {d.detailClosedDays}
          </div>
          {showRaw ? (
            <p className="whitespace-pre-line text-sm leading-relaxed">{museum.restRaw}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">{d.closureRawUnavailable}</p>
          )}
          {/* 판정 한계 고지 — 과설계(공휴일 처리) 대신 못 하는 걸 드러낸다. */}
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground/80">
            <Info className="mt-0.5 size-3 shrink-0" />
            {d.openStateDisclaimer}
          </p>
        </div>

        <dl className="space-y-3 text-sm">
          {museum.hours && (
            <Row icon={<Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />} label={d.detailHours}>
              <span className="whitespace-pre-line">{museum.hours}</span>
            </Row>
          )}
          {museum.fee && (
            <Row icon={<Ticket className="mt-0.5 size-4 shrink-0 text-muted-foreground" />} label={d.detailFee}>
              <span className="whitespace-pre-line">{museum.fee}</span>
            </Row>
          )}
          {museum.parking && (
            <Row
              icon={<ParkingCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              label={d.detailParking}
            >
              {museum.parking}
            </Row>
          )}
          <Row icon={<MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />} label={d.detailAddress}>
            <span>{museum.addr ?? d.noInfo}</span>
            <span className="block text-xs text-muted-foreground">
              {distanceKm != null ? d.distanceAway(distanceKm) : d.distanceUnknown}
            </span>
          </Row>
          {museum.tel && (
            <Row icon={<Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />} label={d.detailTel}>
              <span className="break-words">{museum.tel}</span>
            </Row>
          )}
        </dl>
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
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      {icon}
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd>{children}</dd>
      </div>
    </div>
  );
}
