# Uknow Web App 軟體規格書

## 1. 專案概述

### 1.1 專案名稱
**Uknow** - 專業服務媒合平台

### 1.2 專案描述
Uknow是一個讓有專業服務技能的服務提供者曝光服務，同時讓需要服務的人能找到協助的Web App平台。平台提供完整的服務媒合、會員管理、推薦獎勵、訂閱服務等功能。

### 1.3 技術棧
- **前端框架**: React 18 + TypeScript
- **路由管理**: React Router
- **樣式框架**: Tailwind CSS v4
- **UI組件庫**: shadcn/ui
- **圖示庫**: Lucide React
- **響應式設計**: 移動優先，特別針對手機瀏覽器優化

### 1.4 設計理念
- 簡潔現代的使用者介面
- 響應式設計，支援桌面與移動裝置
- 以手機瀏覽器為主要優化目標
- 展示完整功能，不需串接真實backend

---

## 2. 系統架構

### 2.1 主要模組
```
Uknow Web App
├── 訪客功能
│   ├── 首頁瀏覽
│   ├── 服務提供者搜尋
│   ├── 服務提供者詳情
│   └── 會員註冊登入
├── 會員功能
│   ├── 會員儀表板
│   ├── 服務提供者管理
│   ├── 推薦系統
│   ├── 訂閱管理
│   ├── 任務系統
│   └── 獎勵回饋
└── 管理者功能
    ├── 會員管理
    ├── 任務管理
    ├── 提領管理
    └── 系統通知
```

### 2.2 用戶角色
- **訪客**: 瀏覽服務、註冊登入
- **一般會員**: 管理個人服務、使用推薦系統、獲得獎勵
- **管理員**: 平台管理、審核、系統維護

---

## 3. 功能規格

### 3.1 核心功能

#### 3.1.1 首頁 (HomePage)
- **路由**: `/`
- **功能**:
  - 服務提供者展示
  - 服務類別瀏覽
  - 地區篩選
  - 搜尋功能
  - 廣告橫幅顯示

#### 3.1.2 服務提供者詳情 (RoommateDetail)
- **路由**: `/roommate/:id`
- **功能**:
  - 服務提供者完整資訊
  - 相片瀏覽
  - 聯絡方式顯示
  - 服務標籤
  - 地圖位置

#### 3.1.3 會員系統
**登入頁面 (LoginPage)**
- **路由**: `/login`
- **功能**: 會員登入驗證

**註冊頁面 (RegisterPage)**
- **路由**: `/register`
- **功能**: 新會員註冊

### 3.2 會員功能 (需登入)

#### 3.2.1 會員儀表板 (MemberDashboard)
- **路由**: `/dashboard`
- **功能**:
  - 個人資訊總覽
  - 快速功能入口
  - 最新通知
  - 數據統計

#### 3.2.2 服務提供者管理 (RoommateManagement)
- **路由**: `/roommates`
- **功能**:
  - 個人服務列表
  - 服務狀態管理
  - 編輯/刪除服務

**新增服務 (CreateRoommate)**
- **路由**: `/roommates/create`
- **功能**: 建立新的服務項目

**編輯服務 (EditRoommate)**
- **路由**: `/roommates/edit/:id`
- **功能**: 修改現有服務資訊

#### 3.2.3 推薦系統 (ReferralManagement)
- **路由**: `/referrals`
- **功能**:
  - 推薦碼管理
  - 推薦統計
  - 推薦關係樹狀圖
  - 推薦獎勵計算 (一等親/二等親/三等親)

#### 3.2.4 訂閱管理 (SubscriptionManagement)
- **路由**: `/subscriptions`
- **功能**:
  - 月繳方案 (129元)
  - 年繳方案 (1188元)
  - 訂閱狀態管理
  - 付款記錄

#### 3.2.5 任務系統 (TaskDashboard)
- **路由**: `/tasks`
- **功能**:
  - 任務列表
  - 任務完成進度
  - 任務獎勵
  - 任務歷史記錄

#### 3.2.6 獎勵回饋 (RewardDashboard)
- **路由**: `/rewards`
- **功能**:
  - Point餘額管理
  - 獎勵明細記錄
  - Point提領申請
  - 提領申請記錄
  - 兩階段提領流程

### 3.3 管理者功能 (需管理員權限)

#### 3.3.1 管理者儀表板 (AdminDashboard)
- **路由**: `/admin`
- **功能**:
  - 平台數據統計
  - 系統監控
  - 快速管理入口

**會員管理 (MemberManagement)**
- 會員列表與狀態管理
- 會員資料審核
- 權限設定

**任務管理 (TaskManagement)**
- 任務建立與編輯
- 任務分配
- 完成狀態審核

**提領管理 (WithdrawalManagement)**
- 提領申請審核
- 提領狀態更新
- 財務記錄管理

**系統通知 (SystemNotifications)**
- 系統公告發布
- 通知管理
- 訊息推播

---

## 4. 獎勵回饋系統詳細規格

### 4.1 Point系統
- **獲得方式**: 推薦新會員、完成任務、活動獎勵
- **使用方式**: 提領為現金
- **計算單位**: 1 Point = 1 新台幣

### 4.2 推薦獎勵層級
- **一等親**: 直接推薦，獲得50 Point
- **二等親**: 間接推薦，獲得30 Point  
- **三等親**: 三層推薦，獲得20 Point

### 4.3 提領規則
- **最低提領**: $1,000 (必須為1000的倍數)
- **手續費**: 每次提領收取$15
- **處理時間**: 3-5個工作天
- **提領流程**: 
  1. 設定提領金額
  2. 身分驗證
  3. 送出申請
  4. 待查收狀態
  5. 確認查收完成

### 4.4 提領狀態
- **處理中 (pending)**: 申請已送出，等待處理
- **代查收 (awaiting_collection)**: 已處理完成，等待用戶確認查收
- **已完成 (completed)**: 用戶已確認查收
- **已拒絕 (rejected)**: 申請被拒絕

---

## 5. 資料結構

### 5.1 服務提供者資料
```typescript
interface ServiceProvider {
  id: string;
  name: string;
  category: string;
  city: string;
  district: string;
  gender: string;
  description: string;
  photos: string[];
  contacts: {
    instagram?: string;
    line?: string;
    facebook?: string;
  };
  tags: string[];
  createdAt: string;
  userId: string;
}
```

### 5.2 用戶資料
```typescript
interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  isAdmin: boolean;
  referralCode: string;
  referrer: string | null;
  availableRewards: number;
  pendingRewards: number;
  withdrawnRewards: number;
  isActive: boolean;
}
```

### 5.3 提領申請資料
```typescript
interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  fee: number;
  actualAmount: number;
  status: 'pending' | 'awaiting_collection' | 'completed' | 'rejected';
  appliedAt: string;
  processedAt: string | null;
}
```

---

## 6. 服務類別

### 6.1 美容美髮類
美髮、美容、按摩、除毛、睫毛、美甲、紋繡、刺青、採耳

### 6.2 專業服務類
保險、傳銷、房仲、汽車、財務顧問、法律顧問、平面設計師、室內設計師、攝影師、工程師、會計師、水電

### 6.3 教育運動類
健身教練、各項運動教練、各類音樂老師、身心靈老師

### 6.4 其他類別
上班族、學生、退休、其他

---

## 7. 地區支援

### 7.1 支援縣市
台北市、新北市、桃園市、台中市、台南市、高雄市、基隆市、新竹市、嘉義市、新竹縣、苗栗縣、彰化縣、南投縣、雲林縣、嘉義縣、屏東縣、宜蘭縣、花蓮縣、台東縣、澎湖縣、金門縣、連江縣

### 7.2 區域細分
每個縣市都支援到區/鄉鎮層級的詳細地理位置選擇

---

## 8. 技術規格

### 8.1 前端技術
- **React 18**: 現代化前端框架
- **TypeScript**: 型別安全開發
- **Tailwind CSS v4**: 原子化CSS框架
- **shadcn/ui**: 高品質UI組件庫
- **React Router**: 單頁應用路由管理

### 8.2 開發工具
- **Lucide React**: SVG圖示庫
- **React Hook Form**: 表單處理
- **Recharts**: 圖表視覺化

### 8.3 響應式設計
- **移動優先**: 主要針對手機瀏覽器優化
- **RWD支援**: 支援桌面、平板、手機多種裝置
- **Touch友善**: 觸控操作優化

---

## 9. 安全與權限

### 9.1 路由保護
- **ProtectedRoute**: 需要登入才能存取的頁面
- **AdminRoute**: 需要管理員權限才能存取的頁面

### 9.2 用戶權限
- **訪客**: 瀏覽公開內容
- **一般會員**: 管理個人服務與獎勵
- **管理員**: 平台管理與審核功能

### 9.3 資料保護
- 本專案為Demo展示，使用Mock資料
- 不處理真實個人資料
- 不串接真實金流系統

---

## 10. 部署與維護

### 10.1 部署需求
- **Node.js**: v18+
- **NPM/Yarn**: 套件管理
- **現代瀏覽器**: 支援ES6+

### 10.2 環境配置
- 開發環境: 本地開發伺服器
- 測試環境: Mock資料展示
- 生產環境: 靜態網站部署

---

## 11. 未來擴展規劃

### 11.1 功能擴展
- 即時通訊系統
- 評價評論機制  
- 服務預約系統
- 支付整合
- 多語言支援

### 11.2 技術升級
- PWA支援
- 離線功能
- 推播通知
- 資料庫整合
- API開發

---

**文件版本**: v1.0  
**最後更新**: 2024年  
**維護者**: Uknow Development Team