import { describe, expect, it } from 'vitest';
import {
  classifyInviteAcceptError,
  resolveInviteEntry,
  shouldRedirectToCompleteProfile,
} from './registrationFlow';

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const tokenOf = (payload: unknown) => `${b64url(JSON.stringify(payload))}.sig`;

describe('resolveInviteEntry', () => {
  it.each([
    ['壞 base64', '***.sig'],
    ['壞 JSON', `${b64url('{not json')}.sig`],
    ['缺 c 欄', tokenOf({ v: 1, e: 'a@b.co', x: 1 })],
    ['v 不是 1', tokenOf({ v: 2, e: 'a@b.co', c: '8048876', x: 1 })],
    ['沒有簽章段', b64url(JSON.stringify({ v: 1, e: 'a@b.co', c: '8048876', x: 1 }))],
  ])('%s時回 undecodable', (_label, token) => {
    expect(resolveInviteEntry(token)).toEqual({ kind: 'undecodable' });
  });

  it('有效 payload 時回 email 與推薦碼', () => {
    expect(resolveInviteEntry(tokenOf({ v: 1, e: 'a@b.co', c: '8048876', x: 4102444800 }))).toEqual(
      {
        kind: 'valid',
        email: 'a@b.co',
        code: '8048876',
      },
    );
  });

  it('到期時間已過仍回 valid（過期由伺服器判）', () => {
    expect(resolveInviteEntry(tokenOf({ v: 1, e: 'a@b.co', c: '8048876', x: 1 })).kind).toBe(
      'valid',
    );
  });
});

describe('classifyInviteAcceptError', () => {
  it.each([
    ['weak_password', 'stay2B', false],
    ['rate_limited', 'stay2B', false],
    ['unavailable', 'stay2B', false],
    ['disabled', 'stay2B', false],
    [undefined, 'stay2B', false],
    ['some_future_code', 'stay2B', false],
    ['expired', 'to2A', false],
    ['invalid_token', 'to2A', false],
    ['gone', 'to2A', false],
    ['already_accepted', 'to2A', true],
  ] as const)('code %s 有 email 時 → %s', (code, target, clearPassword) => {
    expect(classifyInviteAcceptError(code, true)).toEqual({ target, clearPassword });
  });

  it.each(['expired', 'invalid_token', 'gone', 'already_accepted'])(
    '沒有 email 時 %s 回步驟 1',
    (code) => {
      expect(classifyInviteAcceptError(code, false).target).toBe('toStep1');
    },
  );
});

describe('shouldRedirectToCompleteProfile', () => {
  it.each([
    ['/auth/complete-profile', false],
    ['/auth/reset-password', false],
    ['/dashboard', true],
    ['/register', true],
  ])('%s → %s', (pathname, expected) => {
    expect(shouldRedirectToCompleteProfile(pathname)).toBe(expected);
  });
});
