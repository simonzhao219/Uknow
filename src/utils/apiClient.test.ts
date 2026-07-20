import { describe, it, expect } from 'vitest';
import { buildApiUrl, extractApiErrorMessage } from './apiClient';
import { projectId } from './supabase/info';

const BASE = `https://${projectId}.supabase.co/functions/v1/api`;

describe('buildApiUrl', () => {
  it('appends a path that already has a leading slash', () => {
    expect(buildApiUrl('/rewards')).toBe(`${BASE}/rewards`);
  });

  it('adds the leading slash when the path lacks one', () => {
    expect(buildApiUrl('rewards')).toBe(`${BASE}/rewards`);
  });

  it('does not double the slash', () => {
    expect(buildApiUrl('/listings/upload-photo')).toBe(`${BASE}/listings/upload-photo`);
  });

  it('handles an empty path as the api root', () => {
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
    expect(extractApiErrorMessage({ error: '已有有效訂閱，請到期後再續約' }, 'fallback'))
      .toBe('已有有效訂閱，請到期後再續約');
  });

  it('解析物件形信封 { error: { message } }', () => {
    expect(extractApiErrorMessage({ error: { message: '未授權' } }, 'fallback'))
      .toBe('未授權');
  });

  it('解析頂層 message 欄位', () => {
    expect(extractApiErrorMessage({ message: '身分證字號不正確' }, 'fallback'))
      .toBe('身分證字號不正確');
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
