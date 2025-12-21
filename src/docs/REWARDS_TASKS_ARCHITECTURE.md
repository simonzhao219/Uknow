# 獎勵與任務系統架構指南

## 核心原則

### 三時點處理架構（Three-Phase Architecture）

```
┌─────────────────────────────────────────────────────────────┐
│                     三時點處理架構                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  時點A: 刊登創建時（同步）                                       │
│  ├─ 推薦關係建立                                               │
│  ├─ 第1個月獎勵立即發放                                         │
│  ├─ 任務計數器更新                                             │
│  └─ 創建獎勵排程（第2~12個月）                                  │
│                                                               │
│  時點B: 每日00:05（GitHub Actions 定時觸發）                    │
│  ├─ 掃描所有待發放獎勵排程                                      │
│  ├─ 發放到期的推薦獎勵                                          │
│  ├─ 結算任務完成狀態                                           │
│  └─ 發放任務獎勵                                               │
│                                                               │
│  時點C: 頁面進入時（同步讀取）                                   │
│  ├─ 直接讀取預計算的資料                                        │
│  ├─ 無需任何計算                                               │
│  └─ O(1) 時間複雜度                                            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

1. **預計算快取優先**
   - 所有統計資料在寫入時計算，讀取時直接返回
   - 避免即時計算導致的效能問題

2. **完全自動化**
   - GitHub Actions 定時觸發，無需用戶登入
   - 100% 符合 spec 規則（每月1日00:00發放）

3. **資料一致性保證**
   - 原子性更新
   - 發放前檢查來源刊登有效性

---

## 資料結構規範

### 推薦系統

#### user:{userId}:referral_stats
推薦統計（預計算快取）

```typescript
{
  totalReferrals: 8,           // 總推薦數
  firstGenCount: 3,            // 1代推薦數
  secondGenCount: 3,           // 2代推薦數
  thirdGenCount: 2,            // 3代推薦數
  lastUpdated: "2025-12-15T10:00:00Z"
}
```

#### listing:{listingId}:referral_tree
推薦樹（預計算快取）

```typescript
{
  myListing: {
    id: "listing_A",
    userId: "user_1",
    // ... 其他資訊
  },
  firstGeneration: [
    { 
      listingId: "listing_D", 
      userId: "user_2", 
      name: "王小明",
      createdAt: "2024-01-01" 
    }
  ],
  secondGeneration: [
    { listingId: "listing_E", userId: "user_3", createdAt: "2024-02-12" }
  ],
  thirdGeneration: [
    { listingId: "listing_F", userId: "user_4", createdAt: "2024-03-22" }
  ],
  lastUpdated: "2025-12-15T10:00:00Z"
}
```

#### user:{userId}:referral_monthly_log
月度推薦日誌（用於任務判定）

```typescript
{
  "2024-01": [
    { listingId: "listing_D", userId: "user_2", createdAt: "2024-01-15T10:00:00Z" }
  ],
  "2024-02": [
    { listingId: "listing_G", userId: "user_3", createdAt: "2024-02-10T14:30:00Z" },
    { listingId: "listing_J", userId: "user_5", createdAt: "2024-02-20T09:15:00Z" }
  ]
}
```

---

### 獎勵系統

#### user:{userId}:rewards
獎勵餘額

```typescript
{
  availableRewards: 1500,      // 可提領點數
  pendingRewards: 0,           // 處理中點數（提領申請中）
  withdrawnRewards: 500,       // 已提領點數
  totalEarned: 2000,           // 總累積點數
  lastUpdated: "2025-12-15T10:00:00Z"
}
```

#### user:{userId}:reward_history
獎勵歷史（最多200筆）

```typescript
[
  {
    id: "reward_001",
    type: "referral_gen1_month1",     // 推薦獎勵-第1代-第1個月
    amount: 10,
    sourceListingId: "listing_D",
    sourceUserName: "王小明",
    issuedAt: "2024-01-01T10:00:00Z",
    description: "推薦獎勵 - 王小明（第1代）- 第1個月"
  },
  {
    id: "reward_002",
    type: "task_consecutive_referral", // 任務獎勵-連續推薦達人
    amount: 1000,
    issuedAt: "2024-02-01T00:00:00Z",
    description: "任務獎勵 - 連續推薦達人"
  }
]
```

#### reward_schedule:{scheduleId}
獎勵排程（第2~12個月）

```typescript
{
  id: "schedule_001",
  userId: "user_1",
  sourceListingId: "listing_D",
  sourceUserId: "user_2",
  sourceUserName: "王小明",
  generation: 1,
  monthNumber: 2,                    // 第2個月（1-12）
  amount: 10,
  scheduledDate: "2024-02-01",       // 發放日期（只記錄日期）
  status: "pending",                 // pending | completed | cancelled
  createdAt: "2024-01-01T10:00:00Z",
  completedAt: null
}
```

#### reward_schedules_by_date:{YYYY-MM-DD}
日期索引（用於定時任務快速查找）

```typescript
[
  "schedule_001",
  "schedule_002",
  // ... 該日期的所有排程 ID
]
```

---

### 任務系統

#### user:{userId}:tasks
任務狀態

```typescript
{
  consecutiveReferral: {
    id: "task_consecutive",
    type: "consecutive_referral",
    title: "連續推薦達人",
    description: "連續12個月每月至少推薦1位用戶",
    target: 12,
    currentStreak: 3,                // 當前連續月數
    startMonth: "2024-01",           // 開始月份
    lastActiveMonth: "2024-03",      // 最後活躍月份
    monthlyRecord: {
      "2024-01": { count: 1, date: "2024-01-15", qualified: true },
      "2024-02": { count: 2, date: "2024-02-10", qualified: true },
      "2024-03": { count: 1, date: "2024-03-05", qualified: true }
    },
    completed: false,
    reward: 1000,
    lastCheckedAt: "2024-04-01T00:00:00Z"
  },
  
  monthlyKing: {
    id: "task_monthly_king",
    type: "monthly_king",
    title: "推薦王",
    description: "單月推薦10位以上用戶",
    target: 10,
    currentMonth: "2024-03",
    currentCount: 5,                 // 本月推薦數（僅統計第1代）
    completed: false,
    reward: 1000,
    history: [
      { 
        month: "2024-02", 
        count: 12, 
        qualified: true, 
        rewardIssued: true,
        rewardIssuedAt: "2024-03-01T00:00:00Z",
        checkedAt: "2024-03-01T00:00:00Z"
      }
    ]
  },
  
  lastUpdated: "2024-03-05T10:00:00Z"
}
```

---

## API 端點規範

### 刊登創建
**POST /make-server-5c6718b9/listings**

創建刊登時必須：
1. 調用 `processReferralRewards()` 函數
2. 更新所有推薦相關資料
3. 立即發放第1個月獎勵
4. 創建後續11個月的獎勵排程

時間複雜度：O(1)
預期響應時間：< 2秒

---

### 獎勵管理

**GET /make-server-5c6718b9/rewards**

獲取獎勵資料
- 直接讀取 `user:{userId}:rewards`
- 無需任何計算

時間複雜度：O(1)
預期響應時間：< 50ms

**GET /make-server-5c6718b9/rewards/history**

獲取獎勵歷史
- 直接讀取 `user:{userId}:reward_history`
- 返回最近200筆記錄

時間複雜度：O(1)
預期響應時間：< 50ms

---

### 任務管理

**GET /make-server-5c6718b9/tasks**

獲取任務列表
- 直接讀取 `user:{userId}:tasks`
- 無需任何計算

時間複雜度：O(1)
預期響應時間：< 50ms

---

### 推薦管理

**GET /make-server-5c6718b9/referrals/my-tree**

獲取推薦樹
- 直接讀取預計算的推薦樹
- 批量讀取刊登詳情

時間複雜度：O(1)
預期響應時間：< 100ms

---

### 定時任務

**POST /make-server-5c6718b9/cron/process-daily-rewards**

每日獎勵處理（由 GitHub Actions 觸發）
- 發放到期的推薦獎勵
- 結算任務完成狀態
- 發放任務獎勵

執行時間：每日 00:05 (UTC+8)
預期處理時間：< 5分鐘

---

## 實作檢查清單

### 修改推薦管理時
- [ ] 是否使用預計算快取（`referral_tree`、`referral_stats`）？
- [ ] 是否避免即時計算推薦關係？
- [ ] 是否避免使用 `kv.getByPrefix('listing:')` 掃描所有刊登？
- [ ] API 響應時間是否 < 100ms？

### 實作獎勵回饋時
- [ ] 刊登創建時是否立即發放第1個月獎勵？
- [ ] 是否創建後續11個月的獎勵排程？
- [ ] 是否將排程加入日期索引（`reward_schedules_by_date:{date}`）？
- [ ] 獎勵歷史是否限制在200筆以內？
- [ ] 是否檢查來源刊登的有效性（`cancelledAt`、`activeUntil`）？
- [ ] 是否記錄 `sourceUserName`（用於前端顯示）？

### 實作任務系統時
- [ ] 是否正確追蹤每月推薦記錄（`referral_monthly_log`）？
- [ ] 連續推薦任務是否正確判斷斷續？
- [ ] 推薦王任務是否正確處理月度重置？
- [ ] 是否防止重複發放獎勵（`completed` 標記）？
- [ ] 是否記錄 `lastCheckedAt` 時間戳？

### 定時任務
- [ ] GitHub Actions 是否配置正確（每日00:05）？
- [ ] 是否驗證 Service Role Key？
- [ ] 是否處理來源刊登的有效性檢查？
- [ ] 是否正確更新排程狀態（`pending` → `completed` / `cancelled`）？
- [ ] 是否記錄處理結果和統計資料？

---

## 常數配置

所有系統常數統一定義在 `/supabase/functions/server/reward_config.ts`

```typescript
export const REWARD_CONFIG = {
  // 推薦獎勵
  REFERRAL_REWARD_PER_MONTH: 10,      // 每月 10P
  REFERRAL_REWARD_MONTHS: 12,         // 持續 12 個月
  MAX_GENERATION: 3,                  // 最多 3 代
  
  // 任務獎勵
  TASK_CONSECUTIVE_MONTHS: 12,        // 連續 12 個月
  TASK_CONSECUTIVE_REWARD: 1000,      // 1000P
  TASK_MONTHLY_KING_TARGET: 10,       // 單月 10 個推薦
  TASK_MONTHLY_KING_REWARD: 1000,     // 1000P
  
  // 其他配置
  TIMEZONE: 'Asia/Taipei',            // 台北時間 (UTC+8)
  REWARD_HISTORY_MAX_COUNT: 200,      // 獎勵歷史最多保留200筆
  CRON_TIME: '5 16 * * *',           // GitHub Actions Cron 時間（UTC 16:05 = 台北00:05）
};
```

---

## 錯誤處理

### 刊登創建失敗
- 如果 `processReferralRewards` 失敗，記錄錯誤日誌
- 繼續完成刊登創建，避免影響用戶體驗
- 可通過後續的定時任務補發獎勵

### 定時任務失敗
- GitHub Actions 失敗時應發送通知
- 支援手動重新執行（`workflow_dispatch`）
- 記錄詳細的錯誤日誌供追蹤

---

## 效能指標

| 操作 | 目標 | 監控方式 |
|------|------|----------|
| 刊登創建 | < 2秒 | 後端日誌 |
| 推薦管理頁面 | < 100ms | 前端 Network 面板 |
| 獎勵回饋頁面 | < 50ms | 前端 Network 面板 |
| 任務系統頁面 | < 50ms | 前端 Network 面板 |
| 定時任務 | < 5分鐘 | GitHub Actions 日誌 |

---

## 測試要求

### 單元測試
- 刊登創建時的獎勵發放
- 推薦代數計算
- 任務進度更新
- 定時任務的獎勵發放

### 整合測試
- 完整的推薦鏈測試（3代）
- 跨月推薦的獎勵發放
- 任務完成的獎勵發放
- 刊登取消後的獎勵停止

### 效能測試
- 1000個刊登的情況下各 API 響應時間
- 定時任務處理 100 個用戶的時間

---

## 資料遷移

### 為現有資料建立快取

執行以下步驟為現有刊登重建預計算資料：

1. 掃描所有刊登
2. 重建推薦關係樹
3. 計算推薦統計
4. 初始化任務資料

**注意：** 此操作為一次性執行，應在系統維護時段進行。
