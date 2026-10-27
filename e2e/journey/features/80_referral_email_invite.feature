Feature: Email 邀請——寄送、接受與清除的後端旅程
  推薦人在站內填對方 email，由 Uknow 代寄邀請信；對方點信中連結回註冊頁設定
  密碼，設完即完成 email 驗證（同一次呼叫）。本檔目前只走 API（POST
  /referrals/invites、POST /auth/invite/accept、密碼登入），驗的是 hosted 才測得到
  的部分：GoTrue 的 invite 與「設密碼＋驗證」真實互動、send-email hook 底下的寄送、
  service role 呼叫 purge。最後一個情境走 GUI：開信中連結 → 設定密碼畫面 → 完善資料頁
  顯示推薦人 → 結帳頁顯示推薦人。

  信中連結以 service key 從被邀請人的 user_metadata 讀出，不在 Python 重算簽章。

  節點：D5（已付款、有 active 推薦碼；「已加入推薦計畫」以 service role 標記，
  加入流程本身由 50_ 的 GUI 驗）。

  Background:
    Given journey 測試環境已就緒
    And 組織樹已建置完成
    And "D5" 已加入推薦計畫

  @journey @invite
  Scenario: 推薦人寄出邀請後，被邀請人以信中連結設定密碼即完成驗證
    When "D5" 以 Email 邀請一個新信箱
    Then 邀請已受理
    And 被邀請人的帳號已建立、尚未驗證，並蓋有 "D5" 的推薦碼
    When 被邀請人以信中連結設定密碼
    Then 被邀請人的 email 已驗證
    And 被邀請人能以剛設定的密碼登入
    When 被邀請人再以同一連結設定一次密碼
    Then 回應為邀請已完成設定

  @journey @invite
  Scenario: 同一信箱 24 小時內再邀請一次仍受理但不重寄
    When "D5" 以 Email 邀請一個新信箱
    And "D5" 再邀請同一個信箱一次
    Then 邀請已受理
    And 被邀請人的邀請信只寄出一次

  @journey @invite
  Scenario: 客服以信箱立即刪除邀請中的帳號
    When "D5" 以 Email 邀請一個新信箱
    And 客服以 service role 依信箱刪除邀請中的帳號
    Then 刪除筆數為 1
    And 被邀請人的帳號已不存在

  @journey @invite
  Scenario: 被邀請人開信中連結設定密碼後，完善資料頁與結帳頁都顯示推薦人
    When "D5" 以 Email 邀請新的被邀請人 "INVUI"
    Then 邀請已受理
    And 被邀請人的帳號已建立、尚未驗證，並蓋有 "D5" 的推薦碼
    When 被邀請人在瀏覽器開啟信中連結
    Then 畫面是設定密碼步驟且帶入被邀請人的 Email
    When 被邀請人在設定密碼畫面設定密碼並送出
    Then 完善資料頁已帶入 "D5" 的推薦碼並顯示其真實姓名
    When 被邀請人填寫基本資料並送出
    Then 結帳頁顯示 "D5" 為推薦人
