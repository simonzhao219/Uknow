import { nextStamp } from '../../hooks/useLatestRequest';

/**
 * 後台資料的記憶體快取（S5）。
 *
 * **只在記憶體。** 提領列帶未遮罩的身分證字號與銀行帳號，絕不寫進 sessionStorage、
 * localStorage 或任何會落地的地方。store 是 `AdminConsole` 的一個 state：離開 /admin、
 * 登出、session 過期、權限被撤、換帳號時隨元件卸載而 `dispose`。
 *
 * **為何不沿用 `DataCacheContext`**（只沿用它的模式：讀取時水合、對照表式的失效）：
 *   1. 它把整份快取寫進 sessionStorage——正是上一條要擋的；
 *   2. 它掛在 App 根、只在 SIGNED_OUT 時清：離開 /admin 不清，同分頁直接換帳號也不清；
 *   3. 它的鍵是固定聯集，後台要依篩選參數化。
 *
 * **不設 TTL：每次掛載（切回分頁）都背景重讀。** 請求數與時序和沒有快取時相同，快取只
 * 省掉骨架、不省請求——提領列是匯款依據，TTL 內不重讀等於拿沒確認過的資料下手；列上的
 * 證件照也是 1 小時的簽名網址。
 *
 * **不快取的**：會員詳情、證件審核佇列、系統告警（即時資料，也是確認框的依據）；帶日期
 * 或搜尋的查詢（不在記憶體累積被查詢者）；空結果——「目前沒有提領申請」不能拿快取當真，
 * 落地為空時連舊條目一起刪。
 *
 * **整數戳與 fence。** 寫入帶的是請求送出那一刻的戳記（`nextStamp()`），失效時以同一條
 * 序列取新號設成該資源的 fence；戳記**嚴格小於** fence＝請求在失效之前送出，不得寫回，
 * 也不得被當成已確認的資料。反例：不擋的話，標記已匯款之前送出的讀取晚到，會把那筆
 * 「待匯款」寫回快取，切回時它又出現在待匯款裡——可能被再匯一次。失效只能經對照表
 * （`ADMIN_MUTATION_GROUPS`），沒有逐槽刪除的公開介面。
 */
export type AdminResource = 'withdrawals' | 'members' | 'announcements';

const RESOURCES: readonly AdminResource[] = ['withdrawals', 'members', 'announcements'];

/** 快取鍵，前綴是它所屬的資源——失效依資源整批刪。 */
export type AdminSlot = `${AdminResource}:${string}`;

/**
 * 頁面只組一次查詢物件：身分、快取槽與實際送出的參數同源。
 * - `id`：完整查詢的序列化，恆非空——決定何時重讀；
 * - `slot`：快取鍵，`null` 不讀不寫；
 * - `resource`：落地時比對哪一個 fence（`slot` 為 `null` 也照樣比對）；`null` 不在對照表；
 * - `params`：原樣交給取數函式。
 */
export interface AdminQuery<P> {
  id: string;
  slot: AdminSlot | null;
  resource: AdminResource | null;
  params: P;
}

export interface WithdrawalListParams {
  status: string;
  from?: string;
  to?: string;
  search?: string;
}

export interface MemberListParams {
  search?: string;
}

export const adminQuery = {
  /** 只有狀態篩選時有槽；帶日期或搜尋回 `null`（前端目前沒接，先處理免得日後接上時漏）。 */
  withdrawals({
    status,
    from,
    to,
    search,
  }: WithdrawalListParams): AdminQuery<WithdrawalListParams> {
    const params = {
      status,
      from: from || undefined,
      to: to || undefined,
      search: search || undefined,
    };
    const narrowed = Boolean(params.from || params.to || params.search);
    return {
      id: JSON.stringify(['withdrawals', status, params.from, params.to, params.search]),
      slot: narrowed ? null : `withdrawals:${status}`,
      resource: 'withdrawals',
      params,
    };
  },
  /** 只有空白搜尋時有槽：搜尋結果不快取。 */
  members({ search }: { search: string }): AdminQuery<MemberListParams> {
    return {
      id: JSON.stringify(['members', search]),
      slot: search === '' ? 'members:list' : null,
      resource: 'members',
      params: { search: search || undefined },
    };
  },
  announcements(): AdminQuery<Record<string, never>> {
    return {
      id: 'announcements',
      slot: 'announcements:list',
      resource: 'announcements',
      params: {},
    };
  },
  /** 證件審核恆為 `null` 槽：即時資料、通過／退回的依據。拿 store 只為了 403 時整體清空。 */
  idReviews(): AdminQuery<Record<string, never>> {
    return { id: 'idReviews', slot: null, resource: null, params: {} };
  },
};

export interface AdminSnapshot<T = unknown, M = unknown> {
  items: T[];
  total: number;
  meta?: M;
  /** 取得時間（牆鐘）。 */
  fetchedAt: number;
}

export type AdminMutationEvent =
  | 'withdrawalStatus'
  | 'withdrawalBatchPaid'
  | 'memberSuspend'
  | 'memberAdmin'
  | 'announcementCreate'
  | 'announcementDelete'
  | 'accessLost';

/**
 * 寫入事件 → 失效的資源。寫入呼叫端**先 `invalidate` 再 `reload`**。
 * 不入表、逐一確認過的寫入：證件審核通過／退回（佇列不快取，審核狀態只在不快取的詳情裡）、
 * 告警標記已處理（告警不快取）。
 */
export const ADMIN_MUTATION_GROUPS: Record<AdminMutationEvent, readonly AdminResource[]> = {
  withdrawalStatus: ['withdrawals'],
  withdrawalBatchPaid: ['withdrawals'],
  memberSuspend: ['members'],
  memberAdmin: ['members'],
  announcementCreate: ['announcements'],
  announcementDelete: ['announcements'],
  // 任何後台讀取回 403：權限可能已失，PII 不該再可達——全部清掉，連切回位置一起。
  accessLost: RESOURCES,
};

/** 切回位置：分頁重掛時以它為初始 state。搜尋字、勾選、展開中的卡、捲動不存。 */
export interface AdminView {
  withdrawalStatus: string;
  memberTab: string;
}

const DEFAULT_VIEW: AdminView = { withdrawalStatus: 'all', memberTab: 'members' };

export interface AdminCache {
  read<T = unknown, M = unknown>(slot: AdminSlot): AdminSnapshot<T, M> | undefined;
  /** 空結果＝刪除該槽；戳記早於該槽最後一次寫入或該資源 fence 者丟棄。 */
  write(slot: AdminSlot, snapshot: AdminSnapshot, stamp: number): void;
  invalidate(event: AdminMutationEvent): void;
  fenceOf(resource: AdminResource): number;
  readView(): AdminView;
  writeView(partial: Partial<AdminView>): void;
  /** 與 `dispose` 成對：`dispose` 清空資料與 view 並拒絕寫入，`open` 重新啟用。 */
  open(): void;
  dispose(): void;
}

const resourceOf = (slot: AdminSlot) => slot.slice(0, slot.indexOf(':')) as AdminResource;

export function createAdminCache(): AdminCache {
  const entries = new Map<AdminSlot, AdminSnapshot>();
  // 每個槽最後一次被接受的寫入戳記——空結果刪掉條目後仍留著，較舊的晚到寫入才擋得住。
  const written = new Map<AdminSlot, number>();
  const fences = new Map<AdminResource, number>();
  let view: AdminView = { ...DEFAULT_VIEW };
  let accepting = true;

  const fenceOf = (resource: AdminResource) => fences.get(resource) ?? 0;

  return {
    read<T = unknown, M = unknown>(slot: AdminSlot) {
      return entries.get(slot) as AdminSnapshot<T, M> | undefined;
    },
    write(slot, snapshot, stamp) {
      if (!accepting) return;
      if (stamp < fenceOf(resourceOf(slot)) || stamp < (written.get(slot) ?? 0)) return;
      written.set(slot, stamp);
      if (snapshot.items.length === 0) entries.delete(slot);
      else entries.set(slot, snapshot);
    },
    invalidate(event) {
      const resources = ADMIN_MUTATION_GROUPS[event];
      for (const slot of [...entries.keys()]) {
        if (resources.includes(resourceOf(slot))) entries.delete(slot);
      }
      for (const resource of resources) fences.set(resource, nextStamp());
      if (event === 'accessLost') view = { ...DEFAULT_VIEW };
    },
    fenceOf,
    readView: () => ({ ...view }),
    writeView(partial) {
      if (accepting) view = { ...view, ...partial };
    },
    open() {
      accepting = true;
    },
    dispose() {
      accepting = false;
      entries.clear();
      written.clear();
      view = { ...DEFAULT_VIEW };
    },
  };
}
