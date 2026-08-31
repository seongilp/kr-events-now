/**
 * i18n 설정. 이 앱의 대상은 외국인 여행객이라 **한국어 UI 는 만들지 않는다.**
 *
 * 4개 로케일 각각이 관광공사 외국어 서비스 하나에 1:1로 매핑된다. 로케일 코드는
 * URL 세그먼트(`/en` `/ja` `/zh-CN` `/zh-TW`)이자 `<html lang>`·hreflang 값이다.
 * 서비스명은 서버에서만 쓰고 절대 클라이언트로 내보내지 않는다.
 */

export const LOCALES = ['en', 'ja', 'zh-CN', 'zh-TW'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** 로케일 → 관광공사 외국어 서비스명(서버 전용). */
export const SERVICE_BY_LOCALE: Record<Locale, string> = {
  en: 'EngService2',
  ja: 'JpnService2',
  'zh-CN': 'ChsService2',
  'zh-TW': 'ChtService2',
};

/** `<html lang>` 에 넣을 BCP-47 값. 로케일 코드와 대체로 같지만 분리해 둔다. */
export const HTML_LANG: Record<Locale, string> = {
  en: 'en',
  ja: 'ja',
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
};

/** 언어 선택 UI에 보일 자기 언어 이름(모국어 표기). */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

/** Intl.DateTimeFormat 에 넘길 로캘(날짜 표기 현지화). */
export const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-US',
  ja: 'ja-JP',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
};

/**
 * UI 문자열 사전. 기계번역이 아니라 각 언어로 직접 채운 것 — 빈 데이터를
 * 기계번역으로 때우지 말라는 규칙(F-2)은 데이터에만 적용되는 게 아니라 UI에도 적용된다.
 * "정보 없음"류 문구가 각 언어로 자연스러워야 결측을 결측으로 정직하게 보여줄 수 있다.
 */
export interface Dict {
  appName: string;
  tagline: string;
  /** 랜딩 히어로 */
  heroTitle: string;
  heroSubtitle: string;
  openMap: string;
  /** 시간 필터 */
  filterWeekend: string;
  filterTwoWeeks: string;
  filterUpcoming: string;
  /** 리스트/지도 */
  nearbyEvents: string;
  eventsCount: (n: number) => string;
  sortByDistance: string;
  /** 상태 배지 */
  statusOngoing: string;
  statusToday: string;
  statusUpcoming: (days: number) => string;
  statusEnded: string;
  /** 거리 */
  distanceAway: (km: number) => string;
  distanceUnknown: string;
  /** 날짜 */
  dateRange: (start: string, end: string) => string;
  endsOn: (end: string) => string;
  /** 상세 */
  detailOverview: string;
  detailAddress: string;
  detailPeriod: string;
  detailTel: string;
  detailHomepage: string;
  directions: string;
  close: string;
  /** 결측·오류·빈 상태 — 서로 다르게 보여야 한다(F-6) */
  noInfo: string;
  overviewMissing: string;
  emptyNearby: string;
  emptyNearbyHint: string;
  loadFailed: string;
  retry: string;
  loading: string;
  /** 위치 */
  locating: string;
  locationDenied: string;
  locationUnavailable: string;
  locationFallback: string;
  useMyLocation: string;
  /** 데이터 출처 */
  dataSource: string;
  langLabel: string;
}

const en: Dict = {
  appName: 'KR Events Now',
  tagline: "What's on near you, right now",
  heroTitle: 'Festivals & events near you, in your language',
  heroSubtitle:
    "Find festivals happening now and over the next two weeks around you — on a map, sorted by distance. Google Maps and VisitKorea won't tell you what's on this weekend nearby. This does.",
  openMap: 'Open the map',
  filterWeekend: 'This weekend',
  filterTwoWeeks: 'Next 2 weeks',
  filterUpcoming: 'All upcoming',
  nearbyEvents: 'Nearby events',
  eventsCount: (n) => (n === 1 ? '1 event' : `${n} events`),
  sortByDistance: 'Nearest first',
  statusOngoing: 'On now',
  statusToday: 'Ends today',
  statusUpcoming: (d) => (d === 1 ? 'Starts tomorrow' : `Starts in ${d} days`),
  statusEnded: 'Ended',
  distanceAway: (km) => (km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`),
  distanceUnknown: 'Distance unknown',
  dateRange: (s, e) => `${s} – ${e}`,
  endsOn: (e) => `Until ${e}`,
  detailOverview: 'About',
  detailAddress: 'Address',
  detailPeriod: 'Dates',
  detailTel: 'Contact',
  detailHomepage: 'Website',
  directions: 'Directions',
  close: 'Close',
  noInfo: 'No information',
  overviewMissing: 'No description available in English yet.',
  emptyNearby: 'No events near you in this window',
  emptyNearbyHint: 'Try “All upcoming”, or move the map to another area.',
  loadFailed: 'Could not load events',
  retry: 'Retry',
  loading: 'Loading events…',
  locating: 'Finding your location…',
  locationDenied: 'Location permission denied — showing Seoul. You can enable it in your browser settings.',
  locationUnavailable: 'Could not get your location — showing Seoul.',
  locationFallback: 'Showing Seoul',
  useMyLocation: 'Use my location',
  dataSource: 'Data: Korea Tourism Organization (TourAPI)',
  langLabel: 'Language',
};

const ja: Dict = {
  appName: 'KR Events Now',
  tagline: '今、あなたの近くで開催中',
  heroTitle: 'あなたの近くのお祭り・イベントを、あなたの言語で',
  heroSubtitle:
    '今開催中、そしてこれから2週間のお祭りを、地図上で近い順に表示します。Googleマップや VisitKorea は「今週末この近くで何がある?」には答えてくれません。これが答えます。',
  openMap: '地図を開く',
  filterWeekend: '今週末',
  filterTwoWeeks: '2週間以内',
  filterUpcoming: '開催予定すべて',
  nearbyEvents: '近くのイベント',
  eventsCount: (n) => `${n}件`,
  sortByDistance: '近い順',
  statusOngoing: '開催中',
  statusToday: '本日終了',
  statusUpcoming: (d) => (d === 1 ? '明日開始' : `${d}日後に開始`),
  statusEnded: '終了',
  distanceAway: (km) => (km < 1 ? `${Math.round(km * 1000)} m先` : `${km.toFixed(1)} km先`),
  distanceUnknown: '距離不明',
  dateRange: (s, e) => `${s} 〜 ${e}`,
  endsOn: (e) => `${e} まで`,
  detailOverview: '概要',
  detailAddress: '住所',
  detailPeriod: '開催期間',
  detailTel: '連絡先',
  detailHomepage: 'ウェブサイト',
  directions: '経路案内',
  close: '閉じる',
  noInfo: '情報なし',
  overviewMissing: '日本語の説明はまだありません。',
  emptyNearby: 'この期間、近くにイベントはありません',
  emptyNearbyHint: '「開催予定すべて」を試すか、地図を別の地域へ動かしてください。',
  loadFailed: 'イベントを読み込めませんでした',
  retry: '再試行',
  loading: 'イベントを読み込み中…',
  locating: '現在地を取得中…',
  locationDenied: '位置情報が拒否されました — ソウルを表示します。ブラウザ設定で許可できます。',
  locationUnavailable: '現在地を取得できませんでした — ソウルを表示します。',
  locationFallback: 'ソウルを表示中',
  useMyLocation: '現在地を使う',
  dataSource: 'データ:韓国観光公社(TourAPI)',
  langLabel: '言語',
};

const zhCN: Dict = {
  appName: 'KR Events Now',
  tagline: '此刻，你附近正在举办',
  heroTitle: '用你的语言，发现你附近的庆典与活动',
  heroSubtitle:
    '在地图上按距离显示正在举办以及未来两周的庆典。谷歌地图和 VisitKorea 不会告诉你"这个周末附近有什么"，而这里会。',
  openMap: '打开地图',
  filterWeekend: '本周末',
  filterTwoWeeks: '未来两周',
  filterUpcoming: '全部即将举办',
  nearbyEvents: '附近的活动',
  eventsCount: (n) => `${n} 个活动`,
  sortByDistance: '由近到远',
  statusOngoing: '正在举办',
  statusToday: '今日结束',
  statusUpcoming: (d) => (d === 1 ? '明天开始' : `${d} 天后开始`),
  statusEnded: '已结束',
  distanceAway: (km) => (km < 1 ? `${Math.round(km * 1000)} 米` : `${km.toFixed(1)} 公里`),
  distanceUnknown: '距离未知',
  dateRange: (s, e) => `${s} – ${e}`,
  endsOn: (e) => `至 ${e}`,
  detailOverview: '简介',
  detailAddress: '地址',
  detailPeriod: '举办日期',
  detailTel: '联系方式',
  detailHomepage: '官网',
  directions: '路线',
  close: '关闭',
  noInfo: '暂无信息',
  overviewMissing: '暂无简体中文简介。',
  emptyNearby: '此时间段内附近没有活动',
  emptyNearbyHint: '试试"全部即将举办"，或将地图移到其他区域。',
  loadFailed: '无法加载活动',
  retry: '重试',
  loading: '正在加载活动…',
  locating: '正在获取你的位置…',
  locationDenied: '定位权限被拒绝 — 改为显示首尔。你可以在浏览器设置中允许。',
  locationUnavailable: '无法获取你的位置 — 改为显示首尔。',
  locationFallback: '正在显示首尔',
  useMyLocation: '使用我的位置',
  dataSource: '数据:韩国观光公社(TourAPI)',
  langLabel: '语言',
};

const zhTW: Dict = {
  appName: 'KR Events Now',
  tagline: '此刻,你附近正在舉辦',
  heroTitle: '用你的語言,發現你附近的慶典與活動',
  heroSubtitle:
    '在地圖上依距離顯示正在舉辦以及未來兩週的慶典。Google 地圖和 VisitKorea 不會告訴你「這個週末附近有什麼」,而這裡會。',
  openMap: '開啟地圖',
  filterWeekend: '本週末',
  filterTwoWeeks: '未來兩週',
  filterUpcoming: '全部即將舉辦',
  nearbyEvents: '附近的活動',
  eventsCount: (n) => `${n} 個活動`,
  sortByDistance: '由近到遠',
  statusOngoing: '正在舉辦',
  statusToday: '今日結束',
  statusUpcoming: (d) => (d === 1 ? '明天開始' : `${d} 天後開始`),
  statusEnded: '已結束',
  distanceAway: (km) => (km < 1 ? `${Math.round(km * 1000)} 公尺` : `${km.toFixed(1)} 公里`),
  distanceUnknown: '距離未知',
  dateRange: (s, e) => `${s} – ${e}`,
  endsOn: (e) => `至 ${e}`,
  detailOverview: '簡介',
  detailAddress: '地址',
  detailPeriod: '舉辦日期',
  detailTel: '聯絡方式',
  detailHomepage: '官網',
  directions: '路線',
  close: '關閉',
  noInfo: '暫無資訊',
  overviewMissing: '暫無繁體中文簡介。',
  emptyNearby: '此時間範圍內附近沒有活動',
  emptyNearbyHint: '試試「全部即將舉辦」,或將地圖移到其他區域。',
  loadFailed: '無法載入活動',
  retry: '重試',
  loading: '正在載入活動…',
  locating: '正在取得你的位置…',
  locationDenied: '定位權限被拒絕 — 改為顯示首爾。你可以在瀏覽器設定中允許。',
  locationUnavailable: '無法取得你的位置 — 改為顯示首爾。',
  locationFallback: '正在顯示首爾',
  useMyLocation: '使用我的位置',
  dataSource: '資料:韓國觀光公社(TourAPI)',
  langLabel: '語言',
};

export const DICT: Record<Locale, Dict> = { en, ja, 'zh-CN': zhCN, 'zh-TW': zhTW };

export function dict(locale: Locale): Dict {
  return DICT[locale];
}
