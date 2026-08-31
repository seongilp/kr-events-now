# KR Events Now

**What's on near you, right now** — festivals and events happening over the next two
weeks around you, on a map, in your language. Built for foreign travelers in Korea.

The niche: VisitKorea buries festivals in a static catalog, and Google/Naver Maps don't
aggregate "what's on this weekend near me" by **date**. The time axis is the killer
feature. This app answers the question travelers actually ask.

- **Live app**: https://kr-events-now.vercel.app
- **4 languages**: English `/en`, 日本語 `/ja`, 简体中文 `/zh-CN`, 繁體中文 `/zh-TW`
- **Map-first, mobile-first, dark mode**

## Data

Korea Tourism Organization **TourAPI** foreign-language services
(`B551011/{Eng,Jpn,Chs,Cht}Service2`), operation `searchFestival2` for the festival list
and `detailCommon2` for descriptions. Coordinates are WGS84 (`mapx`=lon, `mapy`=lat),
supplied directly by the API, so map pins work regardless of the address language.

Measured festival counts (nationwide, ongoing/upcoming from today):

| Language | Service | Festivals |
|---|---|---|
| English | `EngService2` | ~71 |
| 日本語 | `JpnService2` | ~60 |
| 简体中文 | `ChsService2` | ~58 |
| 繁體中文 | `ChtService2` | ~56 |

## How it works

- The server fetches the **nationwide** festival list per language **once per KST day**
  and caches it (memory + CDN, TTL cut at KST midnight). Location filtering happens in the
  **browser** — distance from the user's position — so we never re-hit the upstream per
  location. This keeps us far under the 1,000 req/day/operation quota with 4 languages.
- `searchFestival2` requires `eventStartDate` and, in the foreign services, returns **0**
  when `areaCode` is passed (the foreign items have empty `areacode`). So we filter by
  coordinates client-side, never by server-side region code.

## Honesty rules (why this app doesn't lie)

- **Missing is missing.** Empty descriptions/addresses are shown as "no information" in
  the viewer's language — never machine-translated, never Korean text leaked to foreigners.
- **Korean is stripped.** Foreign titles append the Korean original in brackets
  (`()`,`（）`,`〈〉`…); we remove the bracketed Korean. Addresses that come back in Korean
  (mainly the sparser 繁體中文 catalog) are dropped to "no information" — the map pin still
  works via coordinates.
- **Three different empty states.** "No events near you", "couldn't load" (upstream
  failure, never cached), and "location denied" look different on screen. No infinite
  skeletons, no "0 = available".
- **KST dates.** Event status ("on now / ends today / starts in N days") is computed from
  integer epoch-days in KST, so it never drifts a day at the midnight boundary.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · shadcn/ui · MapLibre GL
**v5** (v6 fails to load its worker under Turbopack) · Vercel `regions: ["icn1"]`.

## Develop

```bash
npm install
cp .env.example .env.local   # put your data.go.kr Encoding key in DATA_GO_KR_KEY
npm run dev                  # http://localhost:3000  → redirects to /en
npm test                     # KST date math + response parser (the two things that broke siblings)
npm run build
```

### The service key trap

`DATA_GO_KR_KEY` is an **already %-encoded** Encoding key. It is interpolated into the
query string **verbatim**. Do not put it through `URLSearchParams` or an axios `params`
object — that re-encodes it (`%2B`→`%252B`) and yields a 403
`SERVICE_KEY_IS_NOT_REGISTERED`, which is easy to misdiagnose as "not subscribed".

## Tests

`npm test` runs the pure-logic tests (Node's built-in runner via `tsx`):

- `lib/__tests__/kst.ts` — KST calendar math, midnight boundary, cache-TTL cut.
- `lib/__tests__/festivals.ts` — the dual response parser (success vs error top-level
  structures differ), title cleaning (nested/fullwidth/CJK brackets), Korean-address
  dropping, event status, and time-window filtering.
