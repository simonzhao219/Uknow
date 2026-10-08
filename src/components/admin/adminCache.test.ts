// @vitest-environment jsdom
//
// 後台記憶體快取。jsdom 是為了 Storage——PII 守衛要能證明「一次都沒寫進
// sessionStorage／localStorage」，node 環境根本沒有 Storage 可監看。
//
// 守的幾件事：
//   * 查詢身分與快取槽同源：帶日期或搜尋的查詢不進快取（不在記憶體累積被查詢者）。
//   * 失效走對照表、fence 與請求戳同一條序列：失效之前送出的讀取不得寫回。
//   * 空結果刪掉舊條目——「目前沒有提領申請」不能拿快取當真，舊列也不該殘留。
//   * dispose 之後拒絕寫入：卸載後晚到的讀取不能把 PII 寫回剛清空的 store。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextStamp } from '../../hooks/useLatestRequest';
import {
  ADMIN_MUTATION_GROUPS,
  type AdminMutationEvent,
  type AdminResource,
  type AdminSlot,
  adminQuery,
  createAdminCache,
} from './adminCache';

afterEach(() => {
  vi.restoreAllMocks();
});

const snap = (ids: string[], fetchedAt = 1_000) => ({
  items: ids.map((id) => ({ id })),
  total: ids.length,
  fetchedAt,
});
const idsIn = (s: { items: unknown[] } | undefined) =>
  s?.items.map((i) => (i as { id: string }).id) ?? null;

describe('adminQuery', () => {
  it('提領只有狀態篩選時有快取槽，帶日期或搜尋時回 null 槽', () => {
    expect(adminQuery.withdrawals({ status: 'all' }).slot).toBe('withdrawals:all');
    expect(adminQuery.withdrawals({ status: 'pending' }).slot).toBe('withdrawals:pending');
    expect(adminQuery.withdrawals({ status: 'all', from: '2026-10-01' }).slot).toBeNull();
    expect(adminQuery.withdrawals({ status: 'all', to: '2026-10-07' }).slot).toBeNull();
    expect(adminQuery.withdrawals({ status: 'pending', search: '王' }).slot).toBeNull();
  });

  it('提領查詢的身分涵蓋全部條件，null 槽也照樣比對提領的 fence', () => {
    const plain = adminQuery.withdrawals({ status: 'all' });
    const dated = adminQuery.withdrawals({ status: 'all', from: '2026-10-01' });
    const searched = adminQuery.withdrawals({ status: 'all', search: '王' });
    expect(new Set([plain.id, dated.id, searched.id]).size).toBe(3);
    expect(dated.resource).toBe('withdrawals');
    expect(searched.params).toEqual({ status: 'all', search: '王' });
  });

  it('會員只有空白搜尋時有快取槽，搜尋結果不進快取', () => {
    const blank = adminQuery.members({ search: '' });
    const searched = adminQuery.members({ search: '王小明' });
    expect(blank.slot).toBe('members:list');
    expect(searched.slot).toBeNull();
    expect(searched.resource).toBe('members');
    expect(blank.id).not.toBe(searched.id);
    // 空白搜尋照舊不帶 search 參數送出（與改版前的 `search || undefined` 相同）。
    expect(blank.params).toEqual({ search: undefined });
    expect(searched.params).toEqual({ search: '王小明' });
  });

  it('公告固定一個槽，證件審核恆為 null 槽且不比對任何 fence', () => {
    expect(adminQuery.announcements().slot).toBe('announcements:list');
    expect(adminQuery.announcements().resource).toBe('announcements');
    expect(adminQuery.idReviews().slot).toBeNull();
    expect(adminQuery.idReviews().resource).toBeNull();
    expect(adminQuery.idReviews().id).not.toBe('');
  });
});

describe('createAdminCache', () => {
  it('寫入後讀得到同一份快照', () => {
    const cache = createAdminCache();
    cache.write('withdrawals:all', snap(['w1'], 5_000), nextStamp());
    expect(cache.read('withdrawals:all')).toEqual(snap(['w1'], 5_000));
    expect(cache.read('withdrawals:pending')).toBeUndefined();
  });

  it('戳記早於該資源 fence 的寫入被丟棄', () => {
    const cache = createAdminCache();
    const sentBefore = nextStamp();
    cache.invalidate('withdrawalStatus');
    expect(cache.fenceOf('withdrawals')).toBeGreaterThan(sentBefore);
    cache.write('withdrawals:all', snap(['stale']), sentBefore);
    expect(cache.read('withdrawals:all')).toBeUndefined();
  });

  it('先失效、再送出的讀取可以寫回', () => {
    const cache = createAdminCache();
    cache.invalidate('withdrawalStatus');
    const sentAfter = nextStamp();
    expect(sentAfter).toBeGreaterThanOrEqual(cache.fenceOf('withdrawals'));
    cache.write('withdrawals:all', snap(['fresh']), sentAfter);
    expect(idsIn(cache.read('withdrawals:all'))).toEqual(['fresh']);
  });

  it('戳記早於現有條目的寫入被丟棄', () => {
    const cache = createAdminCache();
    const older = nextStamp();
    const newer = nextStamp();
    cache.write('members:list', snap(['new']), newer);
    cache.write('members:list', snap(['old']), older);
    expect(idsIn(cache.read('members:list'))).toEqual(['new']);
  });

  it('空結果刪掉該槽原有的條目', () => {
    const cache = createAdminCache();
    cache.write('withdrawals:pending', snap(['w1']), nextStamp());
    expect(idsIn(cache.read('withdrawals:pending'))).toEqual(['w1']);
    cache.write('withdrawals:pending', snap([]), nextStamp());
    expect(cache.read('withdrawals:pending')).toBeUndefined();
  });

  it('較舊的空結果不刪掉較新的條目', () => {
    const cache = createAdminCache();
    const older = nextStamp();
    cache.write('withdrawals:pending', snap(['w1']), nextStamp());
    cache.write('withdrawals:pending', snap([]), older);
    expect(idsIn(cache.read('withdrawals:pending'))).toEqual(['w1']);
  });

  const SLOTS: AdminSlot[] = [
    'withdrawals:all',
    'withdrawals:pending',
    'members:list',
    'announcements:list',
  ];
  const RESOURCES: AdminResource[] = ['withdrawals', 'members', 'announcements'];
  const EXPECTED: Record<AdminMutationEvent, AdminResource[]> = {
    withdrawalStatus: ['withdrawals'],
    withdrawalBatchPaid: ['withdrawals'],
    memberSuspend: ['members'],
    memberAdmin: ['members'],
    announcementCreate: ['announcements'],
    announcementDelete: ['announcements'],
    accessLost: ['withdrawals', 'members', 'announcements'],
  };

  it('對照表的事件與預期的失效集合一一對應，沒有多出或漏掉的事件', () => {
    expect(Object.keys(ADMIN_MUTATION_GROUPS).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.keys(EXPECTED) as AdminMutationEvent[])(
    '%s 只清掉對照表上那些資源的槽，並推進它們的 fence',
    (event) => {
      const cache = createAdminCache();
      for (const slot of SLOTS) cache.write(slot, snap([slot]), nextStamp());
      const fencesBefore = RESOURCES.map((r) => cache.fenceOf(r));

      cache.invalidate(event);

      const hit = EXPECTED[event];
      for (const slot of SLOTS) {
        const resource = slot.split(':')[0] as AdminResource;
        expect(cache.read(slot) === undefined, slot).toBe(hit.includes(resource));
      }
      RESOURCES.forEach((resource, i) => {
        expect(cache.fenceOf(resource) > fencesBefore[i], resource).toBe(hit.includes(resource));
      });
    },
  );

  it('accessLost 連切回位置一起清掉', () => {
    const cache = createAdminCache();
    cache.writeView({ withdrawalStatus: 'pending', memberTab: 'id-reviews' });
    cache.invalidate('accessLost');
    expect(cache.readView()).toEqual({ withdrawalStatus: 'all', memberTab: 'members' });
  });

  it('切回位置預設提領「全部」、會員「會員列表」，寫入部分欄位只改那些欄位', () => {
    const cache = createAdminCache();
    expect(cache.readView()).toEqual({ withdrawalStatus: 'all', memberTab: 'members' });
    cache.writeView({ memberTab: 'id-reviews' });
    expect(cache.readView()).toEqual({ withdrawalStatus: 'all', memberTab: 'id-reviews' });
  });

  it('dispose 清空資料與切回位置並拒絕寫入，open 之後恢復', () => {
    const cache = createAdminCache();
    cache.write('withdrawals:all', snap(['w1']), nextStamp());
    cache.writeView({ withdrawalStatus: 'pending' });

    cache.dispose();
    expect(cache.read('withdrawals:all')).toBeUndefined();
    expect(cache.readView().withdrawalStatus).toBe('all');
    cache.write('withdrawals:all', snap(['late']), nextStamp());
    cache.writeView({ withdrawalStatus: 'rejected' });
    expect(cache.read('withdrawals:all')).toBeUndefined();
    expect(cache.readView().withdrawalStatus).toBe('all');

    cache.open();
    cache.write('withdrawals:all', snap(['w2']), nextStamp());
    expect(idsIn(cache.read('withdrawals:all'))).toEqual(['w2']);
  });

  it('含身分證與帳號的資料走完寫入、讀取、失效與 dispose，一次都不寫進 Storage', () => {
    // 盲點：spy 看不到屬性賦值（sessionStorage.k = v）——那條路由 repoHygiene 的靜態守衛擋。
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const cache = createAdminCache();
    const pii = {
      items: [{ id: 'w1', idNumber: 'A123456789', bankAccount: '0123456789012' }],
      total: 1,
      fetchedAt: 1_000,
    };
    cache.write('withdrawals:all', pii, nextStamp());
    cache.read('withdrawals:all');
    cache.writeView({ withdrawalStatus: 'pending' });
    cache.invalidate('withdrawalStatus');
    cache.write('withdrawals:all', pii, nextStamp());
    cache.invalidate('accessLost');
    cache.dispose();
    expect(setItem).not.toHaveBeenCalled();
  });
});
