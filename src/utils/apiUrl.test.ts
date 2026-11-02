import { describe, expect, it } from 'vitest';
import * as apiClient from './apiClient';
import { buildApiUrl } from './apiUrl';

// apiUrl 是零依賴模組：fetchProfile 從這裡取網址，apiClient 才能反向 import fetchProfile
// 而不形成循環（T1-B §2.2）。
describe('buildApiUrl', () => {
  it('組出 functions/v1/api 底下的完整網址，缺前導斜線時自動補上', () => {
    expect(buildApiUrl('/profile')).toMatch(
      /^https:\/\/[^/]+\.supabase\.co\/functions\/v1\/api\/profile$/,
    );
    expect(buildApiUrl('profile')).toBe(buildApiUrl('/profile'));
  });

  it('apiClient 轉出的 buildApiUrl 與 apiUrl 是同一個函式', () => {
    expect(apiClient.buildApiUrl).toBe(buildApiUrl);
  });
});
