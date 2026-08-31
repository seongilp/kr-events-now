/**
 * 지리 계산. 좌표는 전부 WGS84 (mapx=경도, mapy=위도) — 관광공사 API 가 직접 준다.
 *
 * "내 주변"은 서버가 아니라 브라우저에서 판정한다. 서버는 전국 축제를 언어별로 한 번만
 * 캐시하고(위치 무관), 클라이언트가 현재 위치로부터 거리를 재 정렬한다 — 이렇게 해야
 * 위치마다 업스트림을 새로 치지 않아 일일 쿼터를 지킨다.
 */

const EARTH_RADIUS_KM = 6371;

export interface LatLon {
  lat: number;
  lon: number;
}

/** 서울시청. 위치 권한이 없거나 거부됐을 때의 폴백 중심. */
export const SEOUL: LatLon = { lat: 37.5665, lon: 126.978 };

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 두 좌표 사이 대권 거리(km). 하버사인. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
