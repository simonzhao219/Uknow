// 後台寫入的協議，一個地方寫一次（業主 2026-10-07 裁決 G）：
//
//   1. 鎖分頁只包住寫入請求——`try { await } finally { release() }`，結算後立即釋放、不等之後
//      的重讀；
//   2. 結果三分：成功、後端拒絕（4xx，未提交）、結果不明（其餘，可能已提交）；
//   3. 先失效、再回報、最後重讀：可能已提交的寫入先讓快取失效（之前送出的讀取晚到也寫不回去），
//      回報與重讀在同一個同步段；後端拒絕不失效，但同樣重讀一次。
//
// 順序是這支測試要釘的東西：「先 invalidate 再 reload」只靠各頁手抄的話，總有一頁會抄反。
import { describe, expect, it, vi } from 'vitest';
import type { AdminBusy } from './adminBusy';
import type { AdminCache } from './adminCache';
import { runAdminWrite } from './adminWrite';

/** 把鎖、失效、回報、重讀依發生順序記下來。 */
function recorder() {
  const steps: string[] = [];
  const busy: AdminBusy = {
    locked: false,
    noteId: '',
    startWrite: () => {
      steps.push('lock');
      return () => steps.push('release');
    },
    startExport: () => ({ progress: () => {}, end: () => {} }),
  };
  const cache = {
    invalidate: (event: string) => steps.push(`invalidate:${event}`),
  } as unknown as AdminCache;
  const settle = vi.fn((outcome: { kind: string }) => steps.push(`settle:${outcome.kind}`));
  const reload = vi.fn(() => steps.push('reload'));
  return { steps, busy, cache, settle, reload };
}

const status = (code: number) => Object.assign(new Error('被拒'), { status: code });

describe('runAdminWrite', () => {
  it('成功時依序：鎖、送出、釋放、失效、回報、重讀', async () => {
    const r = recorder();
    const submit = vi.fn(async () => {
      r.steps.push('submit');
      return 'ok';
    });
    const outcome = await runAdminWrite({ ...r, event: 'withdrawalStatus', submit });
    expect(r.steps).toEqual([
      'lock',
      'submit',
      'release',
      'invalidate:withdrawalStatus',
      'settle:done',
      'reload',
    ]);
    expect(outcome).toEqual({ kind: 'done', result: 'ok' });
  });

  it('結果不明時同樣先失效再重讀——交易可能已經提交', async () => {
    const r = recorder();
    const error = new TypeError('Failed to fetch');
    const outcome = await runAdminWrite({
      ...r,
      event: 'withdrawalStatus',
      submit: () => Promise.reject(error),
    });
    expect(r.steps).toEqual([
      'lock',
      'release',
      'invalidate:withdrawalStatus',
      'settle:unknown',
      'reload',
    ]);
    expect(outcome).toEqual({ kind: 'unknown', error });
  });

  it('後端拒絕時不失效，但同樣回報並重讀一次', async () => {
    const r = recorder();
    const error = status(409);
    const outcome = await runAdminWrite({
      ...r,
      event: 'withdrawalStatus',
      submit: () => Promise.reject(error),
    });
    expect(r.steps).toEqual(['lock', 'release', 'settle:rejected', 'reload']);
    expect(outcome).toEqual({ kind: 'rejected', error });
  });

  // 業主 Q1（實作審查）：寫入回 403＝權限可能已失，與讀取回 403 同一個意圖（K2）——清空快取，
  // 不在記憶體留未遮罩的 PII。仍是「未提交」：不為這次寫入失效、照樣回報與重讀。
  it('寫入回 403 時清空快取，先於回報', async () => {
    const r = recorder();
    const outcome = await runAdminWrite({
      ...r,
      event: 'memberSuspend',
      submit: () => Promise.reject(status(403)),
    });
    expect(r.steps).toEqual([
      'lock',
      'release',
      'invalidate:accessLost',
      'settle:rejected',
      'reload',
    ]);
    expect(outcome.kind).toBe('rejected');
  });

  it('不入失效表的寫入回 403 也清空快取', async () => {
    const r = recorder();
    await runAdminWrite({ ...r, event: null, submit: () => Promise.reject(status(403)) });
    expect(r.steps).toContain('invalidate:accessLost');
  });

  // 業主 R1：不拿 store 的頁面（告警）經 onAccessLost 請殼層清空——仍在這個單點、先於回報。
  it('只有 onAccessLost、沒有 cache 時，寫入回 403 照樣通知清空，先於回報', async () => {
    const r = recorder();
    const outcome = await runAdminWrite({
      busy: r.busy,
      settle: r.settle,
      reload: r.reload,
      onAccessLost: () => r.steps.push('accessLost'),
      event: null,
      submit: () => Promise.reject(status(403)),
    });
    expect(r.steps).toEqual(['lock', 'release', 'accessLost', 'settle:rejected', 'reload']);
    expect(outcome.kind).toBe('rejected');
  });

  it('其他 4xx 不通知 onAccessLost', async () => {
    const r = recorder();
    const onAccessLost = vi.fn();
    await runAdminWrite({
      ...r,
      onAccessLost,
      event: null,
      submit: () => Promise.reject(status(409)),
    });
    expect(onAccessLost).not.toHaveBeenCalled();
  });

  it('成功但沒有東西提交（例：批次全數失敗）時不失效', async () => {
    const r = recorder();
    await runAdminWrite({
      ...r,
      event: 'withdrawalBatchPaid',
      submit: async () => ({ succeeded: [] as string[] }),
      committed: (result) => result.succeeded.length > 0,
    });
    expect(r.steps).toEqual(['lock', 'release', 'settle:done', 'reload']);
  });

  it('不入失效表的寫入（event 為 null）照樣鎖、回報、重讀，只是不失效', async () => {
    const r = recorder();
    await runAdminWrite({ ...r, event: null, submit: async () => undefined });
    expect(r.steps).toEqual(['lock', 'release', 'settle:done', 'reload']);
  });

  it('送出時同步擲錯也歸結果不明，鎖照樣只釋放一次', async () => {
    const r = recorder();
    const outcome = await runAdminWrite({
      ...r,
      event: 'withdrawalStatus',
      submit: () => {
        throw new TypeError('回應格式不符');
      },
    });
    expect(outcome.kind).toBe('unknown');
    expect(r.steps.filter((step) => step === 'release')).toHaveLength(1);
  });
});
