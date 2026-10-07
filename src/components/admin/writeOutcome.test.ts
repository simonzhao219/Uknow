// 寫入失敗的兩種結局。
//
// 4xx 是後端明確拒絕（狀態機擋下、權限不足）——交易沒提交，照原文說出來即可。
// 其餘一律「結果不明」：網路斷在送出之後、5xx、2xx 但回應解析失敗丟出的原生錯誤，
// 交易都可能已經提交。5xx 多半代表沒提交，但歸「結果不明」是安全方向——錯的只會是
// 描述；反過來把可能已提交的寫入說成「失敗」，admin 會再按一次（例：重複匯款）。
import { describe, expect, it } from 'vitest';
import { UNKNOWN_OUTCOME, classifyWriteFailure } from './writeOutcome';

describe('classifyWriteFailure', () => {
  it.each([
    ['409 狀態衝突', 'rejected', Object.assign(new Error('狀態已變更'), { status: 409 })],
    ['403 權限不足', 'rejected', Object.assign(new Error('沒有權限'), { status: 403 })],
    ['400 參數錯誤', 'rejected', { status: 400, message: '缺少欄位' }],
    ['500 伺服器錯誤', 'unknown', Object.assign(new Error('伺服器錯誤'), { status: 500 })],
    ['502 閘道錯誤', 'unknown', Object.assign(new Error('Bad Gateway'), { status: 502 })],
    ['沒有 status 的網路錯誤', 'unknown', new TypeError('Failed to fetch')],
    ['回應解析失敗的原生錯誤', 'unknown', new SyntaxError('Unexpected end of JSON input')],
    ['status 不是數字', 'unknown', { status: '409' }],
    ['擲出的不是物件', 'unknown', 'boom'],
    ['擲出 null', 'unknown', null],
  ])('%s歸為 %s', (_label, expected, err) => {
    expect(classifyWriteFailure(err)).toBe(expected);
  });
});

// 結果不明的固定文案：不斷言斷線（5xx 也歸這類），只說「沒收到確認」與下一步。
describe('UNKNOWN_OUTCOME', () => {
  it('單筆提領前綴姓名，請 admin 在列表更新後確認那一筆', () => {
    expect(UNKNOWN_OUTCOME.withdrawal('王小明')).toBe(
      '王小明：未收到伺服器確認，結果不明，列表更新後請確認該筆狀態',
    );
  });

  it('批次匯款請 admin 逐筆確認列表', () => {
    expect(UNKNOWN_OUTCOME.withdrawalBatch).toBe(
      '批次匯款未收到伺服器確認，結果不明，請逐筆確認列表',
    );
  });
});
