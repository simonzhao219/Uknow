/**
 * 路由層 lazy chunk 的載入韌性。
 *
 * 背景（2026-08-07 的正式站事故）：admin 後台整頁進不去，console 是
 *   Failed to load module script: Expected a JavaScript-or-Wasm module script
 *   but the server responded with a MIME type of "text/html"
 *   TypeError: Failed to fetch dynamically imported module: /assets/AdminDashboard-*.js
 * 根因不在前端程式——那次 Cloudflare Pages 部署少上傳了三個 chunk 檔
 * （textarea / stat-card-grid / trash-2），而 `_redirects` 的 SPA 後備
 * （`/* /index.html 200`）把「檔案不存在」翻譯成「200 + text/html」，
 * 於是 module loader 收到 HTML、直接拒絕。
 *
 * 但**前端把一次資產取不到變成了死路**，這是我們該修的部分：
 * `React.lazy` 的 promise 一旦 reject 就永久 reject，ErrorBoundary 接住後
 * 整個路由再也進不去，只剩「重新整理」。這裡補上兩段自癒：
 *
 *   1. 重試一次——暫時性的網路抖動、CDN 邊緣節點尚未同步，第二次就過了。
 *   2. 仍失敗就整頁重載一次——換一份新的 index.html 與資產清單。用
 *      sessionStorage 記號上鎖，確保「最多一次」，重載後仍壞就把錯誤
 *      往外拋給 ErrorBoundary，不把使用者關進重載迴圈。
 */

/** sessionStorage 記號：這個分頁已經為了 chunk 失效重載過一次。 */
export const CHUNK_RELOADED_KEY = 'uknow:chunk-reloaded';

type MinimalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ChunkRecoveryDeps {
  /** 整頁重載。抽成參數才測得到「有沒有重載、重載幾次」。 */
  reload: () => void;
  /** 迴圈防線的記號存放處；null＝沒有可用的 storage，此時放棄自癒。 */
  storage: MinimalStorage | null;
}

function defaultDeps(): ChunkRecoveryDeps {
  let storage: MinimalStorage | null = null;
  try {
    // 無痕模式／停用 storage 的瀏覽器存取 sessionStorage 會直接擲錯，
    // 不是回 null——所以要 try，不能只判斷 typeof window。
    storage = typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    storage = null;
  }
  return {
    reload: () => window.location.reload(),
    storage,
  };
}

/**
 * 包住 `() => import(...)`：失敗重試一次，再失敗則整頁重載一次自癒。
 *
 * 回傳的 promise 在最終失敗時照樣 reject——呼叫端（React.lazy）需要那個
 * reject 才能把畫面交給 ErrorBoundary。重載是額外的補救，不是取代。
 */
export async function importWithRetry<T>(
  loader: () => Promise<T>,
  deps: ChunkRecoveryDeps = defaultDeps(),
): Promise<T> {
  const { reload, storage } = deps;

  const clearFlag = () => {
    // 成功就把記號清掉：下一次部署若又遇到同樣情況，仍然有一次自癒機會。
    try {
      storage?.removeItem(CHUNK_RELOADED_KEY);
    } catch {
      // storage 寫入失敗不該讓成功的載入變成失敗。
    }
  };

  try {
    const mod = await loader();
    clearFlag();
    return mod;
  } catch {
    // 第一次失敗：不做任何昂貴的事，單純再試一次。
  }

  try {
    const mod = await loader();
    clearFlag();
    return mod;
  } catch (error) {
    let alreadyReloaded = true; // 取不到記號時保守假設「已重載過」＝不重載
    try {
      alreadyReloaded = storage ? storage.getItem(CHUNK_RELOADED_KEY) === '1' : true;
    } catch {
      alreadyReloaded = true;
    }

    if (!alreadyReloaded) {
      try {
        storage?.setItem(CHUNK_RELOADED_KEY, '1');
        reload();
      } catch {
        // 記號寫不進去就不重載——沒有迴圈防線的重載比錯誤畫面更糟。
      }
    }

    throw error;
  }
}
