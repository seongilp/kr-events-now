import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cleanForeignTitle,
  cleanTitle,
  inWindow,
  itemsOf,
  normalize,
  parseApiError,
  statusOf,
  daysToWeekendEnd,
  type FestivalRaw,
} from '../festivals';

// 2026-09-01 12:00 KST 고정 기준(테스트 안정).
const NOW = Date.UTC(2026, 8, 1, 3, 0, 0);

describe('parseApiError — 정상/에러 최상위 구조가 통째로 다르다(F-9)', () => {
  it('정상(resultCode 0000)은 null', () => {
    assert.equal(parseApiError({ response: { header: { resultCode: '0000', resultMsg: 'OK' } } }), null);
  });
  it('cmmMsgHeader(키/쿼터 계열)를 잡는다 — 200 이어도 실패', () => {
    const json = {
      OpenAPI_ServiceResponse: {
        cmmMsgHeader: { returnReasonCode: '22', errMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR' },
      },
    };
    assert.deepEqual(parseApiError(json), { code: '22', msg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR' });
  });
  it('response.header 의 비-0000 도 에러로 잡는다(파라미터 오류 11 등)', () => {
    const json = { response: { header: { resultCode: '11', resultMsg: 'NO_MANDATORY_REQUEST_PARAMETERS_ERROR' } } };
    assert.deepEqual(parseApiError(json), { code: '11', msg: 'NO_MANDATORY_REQUEST_PARAMETERS_ERROR' });
  });
});

describe('itemsOf — 0건은 items:"" 로 온다', () => {
  it('0건(items:"")은 빈 배열 — throw 도 crash 도 아니다', () => {
    assert.deepEqual(itemsOf({ response: { body: { items: '', totalCount: 0 } } }), []);
  });
  it('단일 객체(item 하나)도 배열로 감싼다', () => {
    const one = itemsOf({ response: { body: { items: { item: { contentid: '1' } } } } });
    assert.equal(one.length, 1);
  });
  it('배열은 그대로', () => {
    const many = itemsOf({ response: { body: { items: { item: [{ contentid: '1' }, { contentid: '2' }] } } } });
    assert.equal(many.length, 2);
  });
  it('에러 구조가 들어와도 조용히 0건이 아니라 빈 배열(파서는 items 만; 판정은 parseApiError)', () => {
    assert.deepEqual(itemsOf({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '30' } } }), []);
  });
});

describe('cleanTitle — 외국어 뒤의 한글 원제 괄호를 벗긴다(F-2)', () => {
  it('중첩 한글 괄호를 통째로 제거', () => {
    assert.equal(
      cleanTitle('APAP Artwork Tour (APAP 작품투어 (안양공공예술프로젝트))'),
      'APAP Artwork Tour',
    );
  });
  it('한글 없는 괄호는 정보이므로 남긴다', () => {
    assert.equal(cleanTitle('Seoul Lantern Festival (Main)'), 'Seoul Lantern Festival (Main)');
  });
  it('일본어/중국어 제목 자체는 건드리지 않는다(한글만 타겟)', () => {
    assert.equal(cleanTitle('ソウルランタンフェスティバル'), 'ソウルランタンフェスティバル');
    assert.equal(cleanTitle('首爾燈節'), '首爾燈節');
  });
  it('전부 벗겨져 빈 문자열이 되면 원문을 돌려준다(안전장치)', () => {
    assert.equal(cleanTitle('(축제)'), '(축제)');
  });
  it('전각 괄호（）의 한글 원제도 벗긴다(일/중 서비스)', () => {
    assert.equal(
      cleanTitle('APAP作品ツアー（安養公共芸術プロジェクト）（APAP 작품투어（안양공공예술프로젝트））'),
      'APAP作品ツアー（安養公共芸術プロジェクト）',
    );
    assert.equal(cleanTitle('2026 天安 K-Culture 博览会（2026 천안 K-컬처박람회）'), '2026 天安 K-Culture 博览会');
  });
  it('CJK 각괄호〈〉의 한글 원제도 벗긴다', () => {
    assert.equal(
      cleanTitle('〈陶器，我们的生活之器〉〈도기陶器, 우리를 담은 질그릇〉'),
      '〈陶器，我们的生活之器〉',
    );
  });
});

describe('cleanForeignTitle — 박물관 제목의 한글 누출(구분자없음/대괄호/짝안맞는괄호) 제거', () => {
  it('구분자 없이 붙은 한글 꼬리 제거(중국어 서비스)', () => {
    assert.equal(cleanForeignTitle('国立金海博物馆국립김해박물관'), '国立金海博物馆');
    assert.equal(cleanForeignTitle('国立韩文博物馆국립한글박물관'), '国立韩文博物馆');
    assert.equal(cleanForeignTitle('釜山博物馆부산박물관'), '釜山博物馆');
    assert.equal(cleanForeignTitle('秋史博物馆추사박물관'), '秋史博物馆');
    assert.equal(cleanForeignTitle('足球主题博物馆풋볼 팬타지움'), '足球主题博物馆');
  });
  it('대괄호 [ ] 안 한글 원제 제거', () => {
    assert.equal(
      cleanForeignTitle('Alive Museum (Insa-dong Branch) [박물관은 살아있다(인사동점)]'),
      'Alive Museum (Insa-dong Branch)',
    );
  });
  it('공백 뒤 한글 런 제거(한자 괄호는 남긴다)', () => {
    assert.equal(cleanForeignTitle('健康与性博物馆(济州)  건강과 성 박물관'), '健康与性博物馆(济州)');
    assert.equal(cleanForeignTitle('国立现代美术馆(德寿宫馆)국립현대미술관'), '国立现代美术馆(德寿宫馆)');
    assert.equal(cleanForeignTitle('Junk Art Gallery (5Factory) 정크아트갤러리'), 'Junk Art Gallery (5Factory)');
  });
  it('한글 든 전각 괄호 제거 + 뒤 한글 런 제거', () => {
    assert.equal(cleanForeignTitle('猪庭（来看猪就행了）피아뜰'), '猪庭');
  });
  it('한글 없는 괄호는 남긴다(한자·라틴 원제)', () => {
    assert.equal(
      cleanForeignTitle('废品艺术工厂（Oh Daeho艺术工厂）정크아트갤러리'),
      '废品艺术工厂（Oh Daeho艺术工厂）',
    );
  });
  it('짝이 안 맞는 뒤 닫는 괄호 정리', () => {
    assert.equal(
      cleanForeignTitle('Sweet Park 乐天儿童食品体验馆 (스위트파크 롯데 어린이 식품체험관)）'),
      'Sweet Park 乐天儿童食品体验馆',
    );
  });
  it('한자·가나는 한글이 아니므로 건드리지 않는다', () => {
    assert.equal(cleanForeignTitle('首爾燈節'), '首爾燈節');
    assert.equal(cleanForeignTitle('ソウルランタンフェスティバル'), 'ソウルランタンフェスティバル');
  });
  it('외국어 표기가 하나도 없으면(한국어뿐) 빈 문자열 → 호출부가 결측 처리', () => {
    assert.equal(cleanForeignTitle('국립김해박물관'), '');
    assert.equal(cleanForeignTitle('피아뜰'), '');
    assert.equal(cleanForeignTitle('(축제)'), '');
  });
});

const rawOngoing: FestivalRaw = {
  contentid: '100',
  title: 'Test Fest (테스트 축제)',
  addr1: '1 Sejong-daero, Jung-gu, Seoul',
  eventstartdate: '20260801',
  eventenddate: '20261130',
  mapx: '126.978',
  mapy: '37.5665',
  firstimage: 'https://img/x.jpg',
};

describe('normalize — 좌표·날짜 없으면 버린다, 결측은 비운다', () => {
  it('정상 item 을 정규화(제목 한글 괄호 제거, 좌표 숫자화)', () => {
    const f = normalize(rawOngoing)!;
    assert.equal(f.title, 'Test Fest');
    assert.equal(f.lat, 37.5665);
    assert.equal(f.lon, 126.978);
    assert.equal(f.image, 'https://img/x.jpg');
  });
  it('좌표가 없으면 null(지도에 못 찍는다)', () => {
    assert.equal(normalize({ ...rawOngoing, mapx: '', mapy: '' }), null);
  });
  it('시작/종료일이 유효하지 않으면 null(시간축의 근간)', () => {
    assert.equal(normalize({ ...rawOngoing, eventstartdate: '' }), null);
    assert.equal(normalize({ ...rawOngoing, eventenddate: '20260231' }), null);
  });
  it('주소가 없으면 null 로 둔다(한국어/기계번역으로 안 메운다)', () => {
    const f = normalize({ ...rawOngoing, addr1: '', addr2: '' })!;
    assert.equal(f.addr, null);
  });
  it('주소에 한글이 섞이면 null 로 결측 처리(번체 커버리지 함정, F-3)', () => {
    const f = normalize({ ...rawOngoing, addr1: '전북특별자치도 남원시 양림길 54' })!;
    assert.equal(f.addr, null); // 좌표는 살아 지도는 되지만 주소는 노출 안 함
    assert.equal(f.lat, 37.5665);
  });
  it('로마자/현지어 주소는 그대로 유지', () => {
    const f = normalize({ ...rawOngoing, addr1: '1 Sejong-daero, Jung-gu, Seoul' })!;
    assert.equal(f.addr, '1 Sejong-daero, Jung-gu, Seoul');
  });
});

describe('statusOf — KST 오늘 기준 상태(자정 경계에서 안 밀린다)', () => {
  it('진행중', () => {
    const f = normalize(rawOngoing)!;
    const s = statusOf(f, NOW);
    assert.equal(s.phase, 'ongoing');
    assert.ok((s.daysLeft ?? 0) > 0);
  });
  it('오늘 종료면 today, daysLeft 0', () => {
    const f = normalize({ ...rawOngoing, eventenddate: '20260901' })!;
    assert.deepEqual(statusOf(f, NOW), { phase: 'today', daysLeft: 0 });
  });
  it('미래 시작이면 upcoming, daysLeft 는 시작까지 일수', () => {
    const f = normalize({ ...rawOngoing, eventstartdate: '20260905', eventenddate: '20260910' })!;
    assert.deepEqual(statusOf(f, NOW), { phase: 'upcoming', daysLeft: 4 });
  });
  it('종료된 것은 ended', () => {
    const f = normalize({ ...rawOngoing, eventstartdate: '20260701', eventenddate: '20260810' })!;
    assert.equal(statusOf(f, NOW).phase, 'ended');
  });
});

describe('inWindow — 시간 창 필터, ended 는 항상 제외', () => {
  it('upcoming 은 종료 안 된 모든 것', () => {
    const f = normalize({ ...rawOngoing, eventstartdate: '20261101', eventenddate: '20261130' })!;
    assert.equal(inWindow(f, 'upcoming', NOW), true);
  });
  it('twoweeks 는 +14일 안에 시작(또는 진행중)만', () => {
    const soon = normalize({ ...rawOngoing, eventstartdate: '20260910', eventenddate: '20260912' })!;
    const later = normalize({ ...rawOngoing, eventstartdate: '20261001', eventenddate: '20261005' })!;
    assert.equal(inWindow(soon, 'twoweeks', NOW), true);
    assert.equal(inWindow(later, 'twoweeks', NOW), false);
  });
  it('이미 진행중이면 어떤 창에서도 포함', () => {
    const f = normalize(rawOngoing)!;
    assert.equal(inWindow(f, 'weekend', NOW), true);
  });
  it('종료된 것은 upcoming 에서도 제외', () => {
    const ended = normalize({ ...rawOngoing, eventstartdate: '20260701', eventenddate: '20260810' })!;
    assert.equal(inWindow(ended, 'upcoming', NOW), false);
  });
});

describe('daysToWeekendEnd — 요일 계산', () => {
  it('2026-09-01 은 화요일 → 이번 주 일요일(9/6)까지 5일', () => {
    // 에폭 요일 검증: 2026-09-01 = 화
    assert.equal(daysToWeekendEnd(NOW), 5);
  });
  it('일요일이면 0', () => {
    // 2026-09-06 은 일요일
    const sun = Date.UTC(2026, 8, 6, 3, 0, 0);
    assert.equal(daysToWeekendEnd(sun), 0);
  });
});
