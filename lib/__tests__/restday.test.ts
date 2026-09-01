import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ymdToDay } from '../kst';
import { openTodayState, parseClosure, verdictFor } from '../restday';

/** 테스트 기준일을 요일로 잡기 쉽게 헬퍼. */
const day = (ymd: string) => ymdToDay(ymd)!;
// 2026-09-01 = 화요일(첫째 화요일), 09-07 = 월요일, 09-06 = 일요일, 09-05 = 토요일.
const TUE = day('20260901');
const MON = day('20260907');
const SUN = day('20260906');
const SAT = day('20260905');
const WED = day('20260902');

describe('parseClosure — 연중무휴 4개 언어', () => {
  for (const s of ['N/A (Open all year round)', 'Open all year round', '年中無休', '全年无休', '全年無休']) {
    it(`연중무휴로 인식: ${s}`, () => {
      const c = parseClosure(s);
      assert.equal(c.openAllYear, true);
      assert.equal(openTodayState(s, MON), 'open'); // 월요일에도 열림
    });
  }
});

describe('parseClosure — 매주 월요일(4개 언어)은 월요일에 closed, 화요일에 open', () => {
  for (const s of ['Mondays', '月曜日', '每週一', '週一', '每周一', '周一']) {
    it(`월요일 휴무 인식: ${s}`, () => {
      assert.deepEqual(parseClosure(s).weekly, [1]);
      assert.equal(openTodayState(s, MON), 'closed');
      assert.equal(openTodayState(s, TUE), 'open');
    });
  }
});

describe('요일 리스트·범위', () => {
  it('영어 "Sunday-Monday" 범위', () => {
    assert.deepEqual(parseClosure('Sunday-Monday').weekly, [0, 1]);
  });
  it('중국어 "週二~四" 범위 → 화·수·목', () => {
    assert.deepEqual(parseClosure('週二~四').weekly, [2, 3, 4]);
  });
  it('일본어 "火曜日、水曜日、木曜日" 리스트', () => {
    assert.deepEqual(parseClosure('火曜日、水曜日、木曜日').weekly, [2, 3, 4]);
  });
  it('중국어 "每週一、二" → 월·화', () => {
    assert.deepEqual(parseClosure('每週一、二').weekly, [1, 2]);
  });
  it('주말: en/ja/zh 모두 토·일', () => {
    assert.deepEqual(parseClosure('Weekends & public holidays').weekly, [0, 6]);
    assert.deepEqual(parseClosure('週末、祝日').weekly, [0, 6]);
    assert.deepEqual(parseClosure('週末、國定假日').weekly, [0, 6]);
  });
});

describe('★ 최악의 함정: 서수(매월 N번째)를 "매주"로 오독하지 않는다', () => {
  it('"First Monday of every month" 는 weekly 에 월요일을 넣지 않는다', () => {
    const c = parseClosure('First Monday of every month');
    assert.deepEqual(c.weekly, []);
    assert.equal(c.ordinals.length, 1);
  });
  it('일반 월요일(9/7)엔 열려 있어야(첫째 월요일이 아니면)', () => {
    // 2026-09-07 은 첫째 월요일 → closed. 둘째 월요일 09-14 는 open.
    assert.equal(openTodayState('First Monday of every month', day('20260914')), 'open');
    assert.equal(openTodayState('First Monday of every month', day('20260907')), 'closed');
  });
  it('중국어 "每月第一個週二公休" — 첫째 화요일(9/1) closed, 둘째 화요일 open', () => {
    assert.deepEqual(parseClosure('每月第一個週二公休').weekly, []);
    assert.equal(openTodayState('每月第一個週二公休', TUE), 'closed');
    assert.equal(openTodayState('每月第一個週二公休', day('20260908')), 'open');
  });
  it('일본어 "第1月曜日" — 첫째 월요일 closed', () => {
    assert.deepEqual(parseClosure('第1月曜日').weekly, []);
    assert.equal(openTodayState('第1月曜日', day('20260907')), 'closed');
  });
  it('중국어 "每月最后一周周一" — 마지막 월요일 closed(9/28), 그 외 월요일 open', () => {
    assert.deepEqual(parseClosure('每月最后一周周一').weekly, []);
    assert.equal(openTodayState('每月最后一周周一', day('20260928')), 'closed');
    assert.equal(openTodayState('每月最后一周周一', day('20260907')), 'open');
  });
});

describe('공휴일 절은 소프트 — open 판정을 막지 않되 caveat 플래그를 세운다', () => {
  it('"매주 월요일 + 설·추석" → 화요일 open, holidayCaveat true', () => {
    const s = "Mondays, January 1, Seollal (Lunar New Year's Day) & Chuseok holidays";
    const c = parseClosure(s);
    assert.deepEqual(c.weekly, [1]);
    assert.equal(c.holidayCaveat, true);
    assert.equal(verdictFor(c, TUE), 'open');
    assert.equal(verdictFor(c, MON), 'closed');
  });
});

describe('하드 절(전시준비/계절 정기휴관)은 unknown 으로', () => {
  it('전시 준비기간만 있으면(주간 규칙 없음) unknown', () => {
    assert.equal(openTodayState('展覧会の準備期間中は休館', TUE), 'unknown');
    assert.equal(openTodayState('Closed during exhibition preparation', TUE), 'unknown');
  });
  it('주간 월요일 + 계절 정기휴관 → 화요일이라도 unknown(계절 휴관이 오늘 걸릴 수 있음)', () => {
    assert.equal(openTodayState('每週一公休、春季定期休館(3月第一週)、秋季定期休館(9月第一週)', TUE), 'unknown');
  });
  it('단, 월요일이면 계절 절이 있어도 확실히 closed(주간이 우선)', () => {
    assert.equal(openTodayState('每週一公休、秋季定期休館(9月第一週)', MON), 'closed');
  });
});

describe('판정 불가(주간 정보 없음)는 unknown — 절대 open 으로 새지 않는다', () => {
  it('빈 문자열/없음', () => {
    assert.equal(openTodayState('', TUE), 'unknown');
    assert.equal(openTodayState(null, TUE), 'unknown');
    assert.equal(openTodayState(undefined, TUE), 'unknown');
  });
  it('진짜 해석 불가(요일도 공휴일 키워드도 없음)만 unknown', () => {
    assert.equal(openTodayState('無（休館時官方網站公告）', TUE), 'unknown');
    assert.equal(openTodayState('Closed during exhibition preparation', TUE), 'unknown');
  });
});

describe('공휴일에만 휴관(주간 규칙 없음)은 오늘 open — 완결된 해석이지 파싱 실패가 아니다', () => {
  it('설·추석·1월1일만 닫는 곳은 (공휴일 아닌) 오늘 open, holidayCaveat true', () => {
    const c = parseClosure("New Year's Day, Seollal & Chuseok holidays");
    assert.equal(c.holidayCaveat, true);
    assert.deepEqual(c.weekly, []);
    assert.equal(verdictFor(c, TUE), 'open');
    assert.equal(openTodayState('1月1日、ソルナル・秋夕の当日', TUE), 'open');
  });
});

describe('일본어 날짜의 月을 월요일로 오독하지 않는다', () => {
  it('"1月1日" 은 요일이 아님 → weekly 비어야', () => {
    assert.deepEqual(parseClosure('1月1日、ソルナル（旧暦1月1日）・秋夕（旧暦8月15日）の当日').weekly, []);
  });
  it('"月曜日、1月1日" 은 월요일만', () => {
    assert.deepEqual(parseClosure('月曜日、1月1日').weekly, [1]);
  });
});

describe('실측 문자열 스모크', () => {
  it('en 진짜 값', () => {
    assert.equal(
      openTodayState('January 1, Mondays <br> * Closed next day if Monday is a holiday', MON),
      'closed',
    );
    assert.equal(
      openTodayState('January 1, Mondays <br> * Closed next day if Monday is a holiday', WED),
      'open',
    );
  });
  it('zh 일요일+공휴일 → 일요일 closed, 토요일 open', () => {
    assert.equal(openTodayState('每週日、國定假日', SUN), 'closed');
    assert.equal(openTodayState('每週日、國定假日', SAT), 'open');
  });
});
