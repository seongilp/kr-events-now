import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CAT3_GALLERY,
  CAT3_MUSEUM,
  kindOf,
  normalizeMuseum,
  sanitizeText,
  type MuseumListRaw,
} from '../museums';

const base: MuseumListRaw = {
  contentid: '100',
  title: 'Amsa Museum (암사동선사유적박물관)',
  addr1: '1 Sejong-daero, Jung-gu, Seoul',
  mapx: '126.978',
  mapy: '37.5665',
  firstimage: 'https://img/x.jpg',
  cat3: CAT3_MUSEUM,
};

describe('kindOf — cat3 로만 박물관/미술관 판별(문화시설 혼입 차단)', () => {
  it('박물관/미술관 코드', () => {
    assert.equal(kindOf(CAT3_MUSEUM), 'museum');
    assert.equal(kindOf(CAT3_GALLERY), 'gallery');
  });
  it('그 외(빈값·도서관 등)는 null', () => {
    assert.equal(kindOf(''), null);
    assert.equal(kindOf(undefined), null);
    assert.equal(kindOf('A02060300'), null); // 전시관 — 박물관 아님
  });
});

describe('sanitizeText — <br>·태그를 화면용으로 정리', () => {
  it('<br> 은 줄바꿈, 나머지 태그는 제거', () => {
    assert.equal(sanitizeText('Mon <br> * note'), 'Mon\n* note');
    assert.equal(sanitizeText('a <b>bold</b> c'), 'a bold c');
  });
  it('빈 값은 null', () => {
    assert.equal(sanitizeText(''), null);
    assert.equal(sanitizeText(undefined), null);
  });
});

describe('normalizeMuseum — 좌표·cat3 없으면 버린다, 결측은 비운다', () => {
  it('정상: 제목 한글 괄호 제거, 좌표 숫자화, 상세 병합', () => {
    const m = normalizeMuseum(base, {
      restdateculture: 'Mondays <br> * holiday note',
      usetimeculture: '09:00-18:00',
      usefee: 'Adults 500 won',
      parkingculture: 'Available',
    })!;
    assert.equal(m.title, 'Amsa Museum');
    assert.equal(m.kind, 'museum');
    assert.equal(m.lat, 37.5665);
    assert.equal(m.restRaw, 'Mondays\n* holiday note'); // <br> 정리됨, 원문 보존
    assert.equal(m.hours, '09:00-18:00');
  });
  it('좌표 없으면 null(지도에 못 찍는다)', () => {
    assert.equal(normalizeMuseum({ ...base, mapx: '', mapy: '' }, null), null);
  });
  it('cat3 가 박물관/미술관이 아니면 null(책방·도서관 차단)', () => {
    assert.equal(normalizeMuseum({ ...base, cat3: 'A02060300' }, null), null);
    assert.equal(normalizeMuseum({ ...base, cat3: '' }, null), null);
  });
  it('제목의 한글 원제를 벗긴다(구분자 없이 붙은 것도)', () => {
    const m = normalizeMuseum({ ...base, title: '国立金海博物馆국립김해박물관' }, null)!;
    assert.equal(m.title, '国立金海博物馆');
  });
  it('제목이 한국어뿐이면 항목을 드롭한다("제목 없음"을 화면에 내보내지 않음)', () => {
    assert.equal(normalizeMuseum({ ...base, title: '국립김해박물관' }, null), null);
  });
  it('상세가 없어도(null) 목록만으로 정규화된다(휴관일 결측)', () => {
    const m = normalizeMuseum(base, null)!;
    assert.equal(m.restRaw, null);
    assert.equal(m.hours, null);
  });
  it('주소에 한글이 섞이면 null(외국인 노출 금지), 좌표는 살린다', () => {
    const m = normalizeMuseum({ ...base, addr1: '서울시 중구 세종대로 1' }, null)!;
    assert.equal(m.addr, null);
    assert.equal(m.lat, 37.5665);
  });
  it('관람시간에 한글이 섞이면 결측(hours null)', () => {
    const m = normalizeMuseum(base, { usetimeculture: '매일 09:00-18:00' })!;
    assert.equal(m.hours, null);
  });
});
