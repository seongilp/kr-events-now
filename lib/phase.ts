import type { Dict } from './i18n';
import type { EventPhase, FestivalStatus } from './festivals';

/**
 * 진행 상태의 표시 텍스트·색. 지도 마커(events-map PHASE_COLOR)와 **같은 의미의 팔레트**를
 * 쓰되, 여기서는 배지용 Tailwind 클래스를 준다. 텍스트는 사전(Dict)에서 언어별로.
 */
export function phaseLabel(status: FestivalStatus, d: Dict): string {
  switch (status.phase) {
    case 'ongoing':
      return d.statusOngoing;
    case 'today':
      return d.statusToday;
    case 'upcoming':
      return d.statusUpcoming(status.daysLeft ?? 0);
    case 'ended':
      return d.statusEnded;
  }
}

/** 배지 색 클래스(다크모드 기준). 지도 색과 의미가 일치한다. */
export function phaseBadgeClass(phase: EventPhase): string {
  switch (phase) {
    case 'ongoing':
      return 'bg-green-500/15 text-green-400 border-green-500/30';
    case 'today':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'upcoming':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    case 'ended':
      return 'bg-gray-500/15 text-gray-400 border-gray-500/30';
  }
}
