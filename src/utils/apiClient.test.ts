import { describe, it, expect } from 'vitest';
import { apiErrorFromBody, buildApiUrl, extractApiErrorMessage } from './apiClient';
import { projectId } from './supabase/info';

const BASE = `https://${projectId}.supabase.co/functions/v1/api`;

describe('buildApiUrl', () => {
  it('路徑本來就有前導斜線時原樣接上', () => {
    expect(buildApiUrl('/rewards')).toBe(`${BASE}/rewards`);
  });

  it('路徑缺前導斜線時補上', () => {
    expect(buildApiUrl('rewards')).toBe(`${BASE}/rewards`);
  });

  it('不產生重複斜線', () => {
    expect(buildApiUrl('/listings/upload-photo')).toBe(`${BASE}/listings/upload-photo`);
  });

  it('空路徑視為 api 根路徑', () => {
    expect(buildApiUrl('')).toBe(`${BASE}/`);
  });
});

// 後端錯誤信封有兩種並存格式（index.ts 有 69 處字串形、38 處物件形）：
//   { error: '已有有效訂閱，請到期後再續約' }   ← 字串形
//   { error: { message: '...' } }               ← 物件形
// 前端必須兩種都解析得出訊息，否則金流節點的具體錯誤原因會退化成
// 「請求失敗 (400)」這類通用文案。
describe('extractApiErrorMessage', () => {
  it('解析字串形信封 { error: string }', () => {
    expect(extractApiErrorMessage({ error: '已有有效訂閱，請到期後再續約' }, 'fallback')).toBe(
      '已有有效訂閱，請到期後再續約',
    );
  });

  it('解析物件形信封 { error: { message } }', () => {
    expect(extractApiErrorMessage({ error: { message: '未授權' } }, 'fallback')).toBe('未授權');
  });

  it('解析頂層 message 欄位', () => {
    expect(extractApiErrorMessage({ message: '身分證字號不正確' }, 'fallback')).toBe(
      '身分證字號不正確',
    );
  });

  it('無法辨識時回傳 fallback', () => {
    expect(extractApiErrorMessage({}, '請求失敗 (500)')).toBe('請求失敗 (500)');
    expect(extractApiErrorMessage(null, '請求失敗 (500)')).toBe('請求失敗 (500)');
    expect(extractApiErrorMessage({ error: { code: 42 } }, 'fb')).toBe('fb');
  });

  it('空字串錯誤視為無訊息、回傳 fallback', () => {
    expect(extractApiErrorMessage({ error: '' }, 'fb')).toBe('fb');
  });
});

// 錯誤**碼**是另一件事：訊息給人看，碼給程式分流。ApiError 一直有 code 欄位，
// 但 apiRequestJson 從來沒填過它——所以呼叫端想針對特定錯誤換一套 UI（掃描頁
// 的「您目前無法掃描」vs「掃描過於頻繁」vs 通用「無法驗證」）就只能比對中文
// 訊息字串，而訊息是隨時會被改文案的東西。
describe('apiErrorFromBody', () => {
  it('物件形信封的 code 會被帶進 ApiError', () => {
    const err = apiErrorFromBody({ error: { code: 'rate_limited', message: '太頻繁' } }, 429);
    expect(err.code).toBe('rate_limited');
    expect(err.message).toBe('太頻繁');
    expect(err.status).toBe(429);
  });

  it('沒有 code 時 code 為 undefined，訊息與狀態照樣帶出', () => {
    const err = apiErrorFromBody({ error: '已有有效訂閱，請到期後再續約' }, 400);
    expect(err.code).toBeUndefined();
    expect(err.message).toBe('已有有效訂閱，請到期後再續約');
  });

  it('無法辨識的信封退回帶狀態碼的通用訊息', () => {
    const err = apiErrorFromBody(null, 500);
    expect(err.message).toBe('請求失敗 (500)');
    expect(err.code).toBeUndefined();
  });

  it('code 不是字串時當作沒有 code', () => {
    expect(apiErrorFromBody({ error: { code: 42, message: 'x' } }, 400).code).toBeUndefined();
  });
});
