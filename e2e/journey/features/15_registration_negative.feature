Feature: 註冊負向邊界 — 資料完善頁
  用一個走到「完善資料」頁的臨時帳號（X1，不付款）驗證表單邊界。

  已知落差（不寫成情境）：規格 §1.1 要求身分證字號唯一性檢核，但
  migrations 對 profiles.national_id 沒有唯一約束、/auth/register 也
  未檢查——「重複身分證應被拒」目前必然失敗，待產品修正後補情境。

  Background:
    Given journey 測試環境已就緒
    And 臨時使用者 "X1" 已走到資料完善頁

  @journey @negative
  Scenario: 未滿 18 歲無法送出資料
    When "X1" 以未滿 18 歲的生日填寫並送出資料
    Then 生日欄顯示需年滿 18 歲的錯誤

  @journey @negative
  Scenario: 無效推薦碼即時驗證顯示錯誤提示
    When "X1" 在推薦碼欄輸入 "zzz999999" 並點驗證
    Then 推薦碼欄顯示無效提示
