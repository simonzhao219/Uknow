// Supabase Auth 錯誤 → 中文訊息的映射。
//
// 這組映射原本硬編在 AuthPage.tsx 與 ResetPasswordPage.tsx 裡,沒有任何
// 單元測試,唯一防線是 8 條 e2e 情境(friction-log 2026-08-07 的 e2e 去重
// 盤點副產品)。抽出來之後才測得起——這支測試就是那 8 條 e2e 的下層備援。
//
// 每個判斷都有 **code 與 message 兩條路**,兩條都要測:Supabase 的 error
// code 在不同版本/端點不一定給得齊,只認 code 會在升級後靜默失效,退回
// 通用的「請稍後再試」——使用者於是反覆重試一個永遠不會成功的密碼。
import { describe, expect, it } from 'vitest';
import {
  SAME_PASSWORD_MESSAGE,
  WEAK_PASSWORD_MESSAGE,
  isSamePasswordError,
  isWeakPasswordError,
  translateSignUpError,
} from './authErrors';

describe('isWeakPasswordError', () => {
  it('以 code 辨識', () => {
    expect(isWeakPasswordError({ code: 'weak_password' })).toBe(true);
  });

  it('沒有 code 時以訊息文字辨識（Supabase 的四種說法）', () => {
    // 這四種措辭都出自 Supabase 實際回過的訊息；少認一種就退回通用提示。
    expect(isWeakPasswordError({ message: 'Password is known to be weak' })).toBe(true);
    expect(isWeakPasswordError({ message: 'This password is easy to guess' })).toBe(true);
    expect(isWeakPasswordError({ message: 'password found in pwned list' })).toBe(true);
    expect(isWeakPasswordError({ message: 'leaked password detected' })).toBe(true);
  });

  it('大小寫不影響辨識', () => {
    expect(isWeakPasswordError({ message: 'KNOWN TO BE WEAK' })).toBe(true);
  });

  it('無關錯誤不誤判', () => {
    expect(isWeakPasswordError({ code: 'invalid_grant', message: 'Invalid login' })).toBe(false);
    expect(isWeakPasswordError({})).toBe(false);
    expect(isWeakPasswordError(null)).toBe(false);
    expect(isWeakPasswordError(undefined)).toBe(false);
  });
});

describe('isSamePasswordError', () => {
  it('以 code 辨識', () => {
    expect(isSamePasswordError({ code: 'same_password' })).toBe(true);
  });

  it('沒有 code 時以訊息文字辨識', () => {
    expect(
      isSamePasswordError({ message: 'New password should be different from the old password' }),
    ).toBe(true);
    expect(isSamePasswordError({ message: 'must be different from the old one' })).toBe(true);
  });

  it('無關錯誤不誤判——外洩密碼不是「與舊密碼相同」', () => {
    expect(isSamePasswordError({ code: 'weak_password' })).toBe(false);
    expect(isSamePasswordError(null)).toBe(false);
  });
});

describe('translateSignUpError', () => {
  it('外洩／過弱密碼', () => {
    expect(translateSignUpError({ code: 'weak_password' })).toBe(WEAK_PASSWORD_MESSAGE);
    expect(translateSignUpError({ message: 'known to be weak' })).toBe(WEAK_PASSWORD_MESSAGE);
  });

  it('已註冊過的 Email——導向登入,不是叫人再註冊一次', () => {
    const expected = '此電子郵件已經註冊過，請改用登入。';
    expect(translateSignUpError({ code: 'user_already_exists' })).toBe(expected);
    expect(translateSignUpError({ message: 'User already registered' })).toBe(expected);
    expect(translateSignUpError({ message: 'user already exists' })).toBe(expected);
  });

  it('寄信頻率上限', () => {
    const expected = '操作過於頻繁，請稍後再試。';
    expect(translateSignUpError({ code: 'over_email_send_rate_limit' })).toBe(expected);
    expect(translateSignUpError({ message: 'email rate limit exceeded' })).toBe(expected);
  });

  it('Email 格式不正確', () => {
    const expected = '電子郵件格式不正確，請重新輸入。';
    expect(translateSignUpError({ message: 'Invalid email address' })).toBe(expected);
    expect(translateSignUpError({ message: 'email address is invalid' })).toBe(expected);
  });

  it('認不出來的錯誤回通用提示,不把英文原文丟給使用者', () => {
    const fallback = '註冊失敗，請稍後再試。';
    expect(translateSignUpError({ code: 'unexpected_failure', message: 'Database error' })).toBe(
      fallback,
    );
    expect(translateSignUpError({})).toBe(fallback);
    expect(translateSignUpError(null)).toBe(fallback);
  });

  it('外洩密碼優先於其他判斷——同時帶著別的訊息時仍指出真正原因', () => {
    // 若順序反了，使用者會看到「操作過於頻繁」而一直等、一直重試同一個
    // 永遠不會被接受的密碼。
    expect(
      translateSignUpError({ code: 'weak_password', message: 'rate limit also mentioned' }),
    ).toBe(WEAK_PASSWORD_MESSAGE);
  });

  it('回傳的訊息都是中文且以句號結尾——這層的輸出直接進 toast', () => {
    const outputs = [
      translateSignUpError({ code: 'weak_password' }),
      translateSignUpError({ code: 'user_already_exists' }),
      translateSignUpError({ code: 'over_email_send_rate_limit' }),
      translateSignUpError({ message: 'invalid email' }),
      translateSignUpError({}),
    ];
    for (const out of outputs) {
      expect(out).toMatch(/[一-鿿]/);
      expect(out.endsWith('。')).toBe(true);
    }
  });
});

describe('訊息常數', () => {
  it('兩處共用同一份字串——AuthPage 與 ResetPasswordPage 曾各寫一份會漂移', () => {
    expect(WEAK_PASSWORD_MESSAGE).toBe(
      '此密碼曾出現在資料外洩名單中，容易被猜到，請改用其他密碼。',
    );
    expect(SAME_PASSWORD_MESSAGE).toBe('新密碼不能與舊密碼相同，請改用其他密碼。');
  });
});
