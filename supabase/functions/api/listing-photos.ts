// ============================================================
// 刊登照片的 Storage 清理（DELETE /listings/photos、DELETE /listings/:id）。
// 規格：規格書 §11、§14。
//
// 依賴方向：本檔**不得 import ./index.ts**（同 referral-invite.ts 的理由）；
// 資料庫與 Storage 都以注入式 deps 傳入，純邏輯可在 *.unit.test.ts 秒級驗證。
// ============================================================

import type { Context } from 'npm:hono@4';

/** 刊登照片 bucket 的單一事實來源（upload-photo 與清理共用，勿再複製字串）。 */
export const LISTING_PHOTOS_BUCKET = 'listings-photos';

/** DELETE /listings/photos 單次最多幾個 path。 */
export const MAX_DELETE_PATHS = 10;

export type DeletePathsValidation =
  | { ok: true; paths: string[] }
  | { ok: false; status: 400 | 403; message: string };

/** upload-photo 產生的 path 形狀（不含 uid 前綴）：`<時間戳>_<小寫英數>.<副檔名>`。 */
const FILE_PART = String.raw`\d+_[a-z0-9]+\.(?:jpg|png|webp)`;
/** 任何使用者前綴（UUID）——用來區分「他人的合法 path」（403）與「根本不合格式」（400）。 */
const ANY_OWNER_PATTERN = new RegExp(
  String.raw`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/${FILE_PART}$`,
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 只收 `<userId>/<時間戳>_<英數>.<jpg|png|webp>`；userId 取自 token，不信 client。 */
export function listingPhotoPathPattern(userId: string): RegExp {
  return new RegExp(`^${escapeRegExp(userId)}/${FILE_PART}$`);
}

/**
 * 驗證 DELETE /listings/photos 的 body。任一筆不合整批拒絕（不部分刪）：
 * 非物件／非陣列／空／非字串／重複／超量／格式不合 → 400；格式合法但屬他人前綴 → 403。
 */
export function validateDeletePathsBody(body: unknown, userId: string): DeletePathsValidation {
  const paths = (body as { paths?: unknown } | null)?.paths;
  if (!Array.isArray(paths) || paths.length === 0) {
    return { ok: false, status: 400, message: '請提供要刪除的照片路徑' };
  }
  if (paths.length > MAX_DELETE_PATHS) {
    return { ok: false, status: 400, message: `單次最多刪除 ${MAX_DELETE_PATHS} 張` };
  }
  if (!paths.every((p) => typeof p === 'string')) {
    return { ok: false, status: 400, message: '照片路徑格式錯誤' };
  }
  if (new Set(paths).size !== paths.length) {
    return { ok: false, status: 400, message: '照片路徑不得重複' };
  }
  const own = listingPhotoPathPattern(userId);
  let foreign = false;
  for (const p of paths as string[]) {
    if (own.test(p)) continue;
    if (ANY_OWNER_PATTERN.test(p)) foreign = true;
    else return { ok: false, status: 400, message: '照片路徑格式錯誤' };
  }
  if (foreign) return { ok: false, status: 403, message: '無權刪除他人的照片' };
  return { ok: true, paths: paths as string[] };
}

/**
 * 把 listings.photos 內的 public URL 解析回 path；只接受「以本 bucket publicUrl base 開頭」
 * 且解析後符合刊登者自己前綴的格式——RLS 允許使用者把 photos 寫成任意字串，
 * 不自驗的話可借 service_role 刪他人的檔。不符者回 null（呼叫端 warn 並忽略）。
 */
export function photoUrlToOwnedPath(
  url: unknown,
  publicBase: string,
  userId: string,
): string | null {
  if (typeof url !== 'string' || !url.startsWith(publicBase)) return null;
  const path = url.slice(publicBase.length);
  return listingPhotoPathPattern(userId).test(path) ? path : null;
}

export interface PhotoCleanupDeps {
  /** storage getPublicUrl(path) 的結果（與 upload-photo 回傳同一格式）。 */
  publicUrlOf: (path: string) => string;
  /**
   * 回傳 ownerId 本人刊登的 photos 仍含有的 URL；查詢出錯必須 throw。
   * 只認本人：他人把你的 URL 寫進自己的 photos 不得擋住清理（條款十之一）。
   */
  findReferencedUrls: (urls: string[], ownerId: string) => Promise<string[]>;
  /** Storage remove；回傳實際被刪的 path；出錯必須 throw。 */
  removeObjects: (paths: string[]) => Promise<string[]>;
}

/**
 * 刪掉「檔案前綴本人的刊登沒有引用」的照片。引用檢查只看 ownerId 的刊登（以 deps.publicUrlOf
 * 重組 URL，與 upload-photo 回傳同一格式）、一次批次查詢；查詢出錯 throw 且一檔不刪（fail-closed）。
 * `removed` 取 Storage 實際回傳數（不存在的檔不算、重送冪等）。
 */
export async function removeUnreferencedPhotos(
  deps: PhotoCleanupDeps,
  paths: string[],
  ownerId: string,
): Promise<{ removed: number; skipped: string[] }> {
  if (paths.length === 0) return { removed: 0, skipped: [] };
  const referenced = new Set(await deps.findReferencedUrls(paths.map(deps.publicUrlOf), ownerId));
  const skipped = paths.filter((p) => referenced.has(deps.publicUrlOf(p)));
  const toRemove = paths.filter((p) => !referenced.has(deps.publicUrlOf(p)));
  if (toRemove.length === 0) return { removed: 0, skipped };
  const removedPaths = await deps.removeObjects(toRemove);
  return { removed: removedPaths.length, skipped };
}

// ============================================================
// 孤兒排程清理（POST /internal/purge-orphan-listing-photos；條款十之一）
// ============================================================
/** list_orphan_listing_photos 的回傳（camelCase；index.ts 由 RPC 的 jsonb 轉換）。 */
export interface OrphanReport {
  candidates: string[];
  orphanTotal: number;
  totalObjects: number;
  referencedUrls: number;
  matchedUrls: number;
}

export interface OrphanSweepDeps {
  /** 第一支 RPC；出錯必須 throw。 */
  listOrphans: (publicBase: string, graceHours: number, limit: number) => Promise<OrphanReport>;
  /** 第二支 RPC（刪前複查）；出錯必須 throw（fail-closed）。 */
  filterUnreferenced: (publicBase: string, names: string[]) => Promise<string[]>;
  removeObjects: PhotoCleanupDeps['removeObjects'];
  warn: (message: string, ...detail: unknown[]) => void;
}

export interface SweepOptions {
  publicBase: string;
  graceHours: number;
  limit: number;
  dryRun: boolean;
  /** 只放行比例閘；錨點失效不可放行。 */
  forceRatio: boolean;
}

export interface SweepResult {
  dryRun: boolean;
  candidates: string[];
  /** 截斷前的孤兒總數；大於 candidates 長度時代表還要再跑幾輪。 */
  orphanTotal: number;
  removed: number;
  notRemoved: number;
  totalObjects: number;
  referencedUrls: number;
  matchedUrls: number;
}

export type SweepErrorCode = 'circuit_open' | 'sweep_failed';
/** 斷路器是哪一道：anchor 不可放行，ratio 可用 forceRatio 放行。 */
export type CircuitReason = 'anchor' | 'ratio';

export class SweepError extends Error {
  constructor(
    readonly code: SweepErrorCode,
    message: string,
    readonly removedSoFar: number,
    readonly reason?: CircuitReason,
  ) {
    super(message);
  }
}

/**
 * 寬限期（W2-7）：物件上傳後多久才可能被當成孤兒。寫死、改動要發 PR（維運參數，
 * 不是 reward_config 那類業務參數）。migration 20261102000001 的刪前複查寫死同一個值，
 * 兩邊必須相等，由 listing-photos.unit.test.ts 讀原文比對。
 */
export const ORPHAN_GRACE_HOURS = 168;
/** 單輪最多處理幾個候選。 */
export const ORPHAN_SWEEP_LIMIT = 500;

/** Storage remove 單批上限。 */
export const SWEEP_REMOVE_BATCH = 100;

/** 比例閘：孤兒占 bucket 過半且物件數超過此值才中止（小 bucket 的比例沒有意義）。 */
const RATIO_GATE_MIN_OBJECTS = 20;

/**
 * 判準 RPC → 斷路器 → 刪前複查 → 分批 remove。任何一步出錯都 throw SweepError，
 * 已刪的數量帶在 removedSoFar；刪除冪等，重跑安全。
 *
 * 斷路器（dry-run 也適用，讓每日 dry-run 先暴露問題）：
 *   - 錨點失效：有引用、有物件，卻一個引用都對不到物件——base 推導錯了，
 *     所有活照片都會被當成孤兒。不可放行。
 *   - 比例閘：截斷前的孤兒總數占 bucket 過半。forceRatio 只放行這一條。
 */
export async function sweepOrphanPhotos(
  deps: OrphanSweepDeps,
  opts: SweepOptions,
): Promise<SweepResult> {
  let rep: OrphanReport;
  try {
    rep = await deps.listOrphans(opts.publicBase, opts.graceHours, opts.limit);
  } catch (err) {
    throw new SweepError('sweep_failed', `列孤兒失敗：${errorMessage(err)}`, 0);
  }
  // 統計欄位若成 NaN，下面兩道斷路器的比較全為 false、會靜默放行——寧可整輪失敗。
  const stats = [rep.orphanTotal, rep.totalObjects, rep.referencedUrls, rep.matchedUrls];
  if (!stats.every(Number.isFinite)) {
    throw new SweepError('sweep_failed', '列孤兒回傳的統計欄位不是有限數字', 0);
  }
  if (rep.matchedUrls === 0 && rep.referencedUrls > 0 && rep.totalObjects > 0) {
    throw new SweepError('circuit_open', '錨點失效：沒有任何引用對得到物件', 0, 'anchor');
  }
  if (
    !opts.forceRatio && rep.totalObjects > RATIO_GATE_MIN_OBJECTS &&
    rep.orphanTotal / rep.totalObjects > 0.5
  ) {
    throw new SweepError('circuit_open', '比例閘：孤兒超過 bucket 物件數的一半', 0, 'ratio');
  }
  const result: SweepResult = {
    dryRun: opts.dryRun,
    candidates: rep.candidates,
    orphanTotal: rep.orphanTotal,
    removed: 0,
    notRemoved: 0,
    totalObjects: rep.totalObjects,
    referencedUrls: rep.referencedUrls,
    matchedUrls: rep.matchedUrls,
  };
  if (opts.dryRun || rep.candidates.length === 0) return result;

  let toRemove: string[];
  try {
    toRemove = await deps.filterUnreferenced(opts.publicBase, rep.candidates);
  } catch (err) {
    throw new SweepError('sweep_failed', `刪前複查失敗：${errorMessage(err)}`, 0);
  }
  for (let i = 0; i < toRemove.length; i += SWEEP_REMOVE_BATCH) {
    const batch = toRemove.slice(i, i + SWEEP_REMOVE_BATCH);
    let removed: string[];
    try {
      removed = await deps.removeObjects(batch);
    } catch (err) {
      throw new SweepError(
        'sweep_failed',
        `Storage 刪除失敗：${errorMessage(err)}`,
        result.removed,
      );
    }
    result.removed += removed.length;
    result.notRemoved += batch.length - removed.length;
  }
  if (result.notRemoved > 0) {
    deps.warn('[listing-photos] 孤兒清理有物件未被 Storage 刪除', result.notRemoved);
  }
  return result;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ============================================================
// 路由處理函式（依賴注入；index.ts 組一次 deps 並註冊路由）
// ============================================================
/** 兩個端點各自的限流（fail-open；放大風險由單次 10 筆與前綴約束托底）。 */
export const LISTING_PHOTOS_DELETE_RATE = { max: 20, windowSeconds: 60 };
export const LISTING_DELETE_RATE = { max: 20, windowSeconds: 60 };

export interface ListingPhotoHandlerDeps {
  requireAuth: (c: Context) => Promise<{ id: string } | null>;
  rateLimit: (key: string, max: number, windowSeconds: number) => Promise<boolean>;
  cleanup: PhotoCleanupDeps;
  /** 刪除該使用者的該筆刊登並回傳被刪列的 photos；不存在或非本人回 null；DB 錯誤必須 throw。 */
  deleteListingRow: (id: string, userId: string) => Promise<{ photos: string[] } | null>;
  /** x-internal-secret 與 RECONCILE_SECRET 的常數時間比對（同兩個既有 /internal/* 端點）。 */
  verifyInternalSecret: (c: Context) => Promise<boolean>;
  sweep: OrphanSweepDeps;
  /** 本 bucket 的 public URL 前綴（由 publicUrlOf('x') 去尾推導）。 */
  publicBase: () => string;
  warn: (message: string, ...detail: unknown[]) => void;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 錯誤形狀 `{ success:false, error:{ code, message } }`：前端依 code 分流
// （extractApiErrorCode；`not_found` 才被視為「已刪除」，裸 404 不是）。
function fail(
  c: Context,
  status: 400 | 401 | 403 | 404 | 429 | 500,
  code: string,
  message: string,
) {
  return c.json({ success: false, error: { code, message } }, status);
}

export function createListingPhotoHandlers(deps: ListingPhotoHandlerDeps) {
  /** 逐一把 photos URL 解析成刊登者自己的 path，不符者忽略並 warn，再走引用檢查清理。 */
  async function cleanupListingPhotos(userId: string, photoUrls: string[]): Promise<void> {
    // 由非空 path 推導 base（不靠 storage-js 對空 path 的未定義行為）。
    const base = deps.cleanup.publicUrlOf('x').slice(0, -1);
    const paths: string[] = [];
    for (const url of photoUrls) {
      const path = photoUrlToOwnedPath(url, base, userId);
      if (path) paths.push(path);
      else deps.warn('[listing-photos] 忽略非本人／非本 bucket 的照片 URL', url);
    }
    await removeUnreferencedPhotos(deps.cleanup, [...new Set(paths)], userId);
  }

  return {
    deletePhotos: async (c: Context) => {
      const user = await deps.requireAuth(c);
      if (!user) return fail(c, 401, 'unauthorized', '未授權');
      const { max, windowSeconds } = LISTING_PHOTOS_DELETE_RATE;
      if (!(await deps.rateLimit(`listing-photos-del:${user.id}`, max, windowSeconds))) {
        return fail(c, 429, 'rate_limited', '操作太頻繁，請稍後再試');
      }
      const body = await c.req.json().catch(() => null);
      const v = validateDeletePathsBody(body, user.id);
      if (!v.ok) {
        return fail(c, v.status, v.status === 403 ? 'forbidden' : 'invalid_request', v.message);
      }
      try {
        const result = await removeUnreferencedPhotos(deps.cleanup, v.paths, user.id);
        return c.json({ success: true, ...result });
      } catch (err) {
        console.error('[listing-photos] 清理失敗', err);
        return fail(c, 500, 'cleanup_failed', '照片清理失敗');
      }
    },

    // 內部維運端點（排程 workflow 呼叫）。repo 是 public，Actions log 公開：回應預設
    // 不含 name（含會員 uid），失敗 message 也不帶 Storage 錯誤字串。
    purgeOrphans: async (c: Context) => {
      if (!(await deps.verifyInternalSecret(c))) return fail(c, 401, 'unauthorized', '未授權');
      const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
      // 只有 JSON boolean false 才實刪；缺漏、解析失敗、字串 "false" 一律 dry-run。
      const dryRun = body?.dry_run !== false;
      try {
        const r = await sweepOrphanPhotos(deps.sweep, {
          publicBase: deps.publicBase(),
          graceHours: ORPHAN_GRACE_HOURS,
          limit: ORPHAN_SWEEP_LIMIT,
          dryRun,
          forceRatio: body?.force_ratio === true,
        });
        return c.json({
          success: true,
          data: {
            dryRun: r.dryRun,
            candidateCount: r.candidates.length,
            orphanTotal: r.orphanTotal,
            removed: r.removed,
            notRemoved: r.notRemoved,
            totalObjects: r.totalObjects,
            referencedUrls: r.referencedUrls,
            matchedUrls: r.matchedUrls,
            ...(body?.include_names === true ? { names: r.candidates } : {}),
          },
        });
      } catch (err) {
        console.error('[listing-photos] 孤兒清理失敗', err);
        const e = err instanceof SweepError ? err : new SweepError('sweep_failed', '', 0);
        const message = e.code === 'circuit_open' ? '斷路器中止，未刪除' : '孤兒清理失敗';
        const error = e.reason
          ? { code: e.code, reason: e.reason, message }
          : { code: e.code, message };
        return c.json({ success: false, error, removedSoFar: e.removedSoFar }, 500);
      }
    },

    deleteListing: async (c: Context) => {
      const user = await deps.requireAuth(c);
      if (!user) return fail(c, 401, 'unauthorized', '未授權');
      const { max, windowSeconds } = LISTING_DELETE_RATE;
      if (!(await deps.rateLimit(`listing-del:${user.id}`, max, windowSeconds))) {
        return fail(c, 429, 'rate_limited', '操作太頻繁，請稍後再試');
      }
      const id = c.req.param('id') ?? '';
      // 非 UUID 回「無標記」的 404：前端只把帶 not_found 的 404 當作已刪除。
      if (!UUID_PATTERN.test(id)) return fail(c, 404, 'invalid_id', '無效的刊登編號');
      let row: { photos: string[] } | null;
      try {
        row = await deps.deleteListingRow(id, user.id);
      } catch (err) {
        console.error('[listing-photos] 刪除刊登失敗', err);
        return fail(c, 500, 'delete_failed', '刪除失敗');
      }
      if (!row) return fail(c, 404, 'not_found', '刊登不存在');
      // 列已刪：Storage 清理失敗只 warn，不可使刪除回報失敗。
      try {
        await cleanupListingPhotos(user.id, row.photos ?? []);
      } catch (err) {
        deps.warn('[listing-photos] 刪刊登後 Storage 清理失敗（列已刪）', err);
      }
      return c.json({ success: true });
    },
  };
}
