'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarClock, Compass, Landmark } from 'lucide-react';

import { dict, LOCALES, LOCALE_LABEL, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { EventsBrowser } from '@/components/events-browser';
import { MuseumsBrowser } from '@/components/museums-browser';

/**
 * 앱 셸: 헤더(로고 + 언어) + 레이어 탭(축제 / 박물관) + 활성 레이어 본체.
 *
 * 축제가 본체이고 박물관은 **레이어(탭)** 로 얹는다(팀 지시) — 축제 기능은 그대로 두고
 * 상단 탭 하나만 추가했다. 레이어 전환은 클라이언트 상태라 지도/데이터가 탭별로 독립이다.
 */
type Layer = 'festivals' | 'museums';

export function AppShell({ locale }: { locale: Locale }) {
  const d = dict(locale);
  const [layer, setLayer] = useState<Layer>('festivals');

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

      {/* 레이어 탭 */}
      <div className="flex gap-1 border-b border-border px-4 py-1.5" role="tablist">
        <LayerTab active={layer === 'festivals'} onClick={() => setLayer('festivals')} icon={<CalendarClock className="size-3.5" />}>
          {d.layerFestivals}
        </LayerTab>
        <LayerTab active={layer === 'museums'} onClick={() => setLayer('museums')} icon={<Landmark className="size-3.5" />}>
          {d.layerMuseums}
        </LayerTab>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {layer === 'festivals' ? <EventsBrowser locale={locale} /> : <MuseumsBrowser locale={locale} />}
      </div>
    </div>
  );
}

function LayerTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
