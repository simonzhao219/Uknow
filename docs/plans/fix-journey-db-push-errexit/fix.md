# journey.yml 重試迴圈被繼承的 errexit 吃掉修復紀錄

分支:`fix/journey-db-push-errexit` | 重現測試(紅燈 commit):不適用,理由同
`fix-journey-branch-replay-race`(bash-in-YAML,無法合成測試)——這次改以**本機
用 `bash -e scriptfile.sh` 重現**(GitHub Actions 呼叫 `run:` script 的真實方式),
而非只用 `bash scriptfile.sh` 跑邏輯,見 §1。

## 1. 症狀與重現

上一個修復(PR #303,commit 9ccdfdf)合進 develop 後,晉升 PR #302 重新觸發
journey-full,`db push` 在建立分支後**依然**撞 `schema_migrations_pkey`——但這次
連重試迴圈自己的 `::warning::` 訊息都沒印出來,直接以 `##[error]Process completed
with exit code 1` 收場,秒級失敗(run 33681708670, job 100419665293,20:51:45
撞號、20:51:46 就整個 job 收工)。

**本機重現**:上一版 fix.md 聲稱「決策邏輯已用三個模擬情境本機驗證」,但驗證用的是
`bash scriptfile.sh`,不是 GitHub Actions 實際呼叫 `run:` 用的 `bash -e
scriptfile.sh`(見該 job log 的 `shell: /usr/bin/bash -e {0}`)。用後者重跑同一個
情境 1(撞兩次後成功)立即重現:`db push` 第一次失敗後,script 當場終止,不繼續到
`PUSH_STATUS=${PIPESTATUS[0]}` 那行,更別說重試。

## 2. 根因

GitHub Actions 對每個 `run:` step 一律用 `bash -e {0}` 呼叫 script(不是單純
`bash {0}`)——`-e`(errexit)在 script 的**第一行執行前就已經開著**,由外部
呼叫的 shell instance 帶進來。上一版修復寫的是 `set -uo pipefail`,這條指令
只**加開** `nounset` 與 `pipefail`,語意上不含 `+e`,**不會清掉外部已經開著的
errexit**——bash 的 `set -uo pipefail` 與 `set -e; set -uo pipefail` 效果不同,
只有後者才會讓 `-e` 確定是「這條指令設的」而非「殘留的」,但兩者的差異在這裡不重要,
重要的是「沒寫 `+e`,errexit 就還開著」。

於是 `supabase db push ... | tee push.log` 這條管線在 `pipefail` 下回傳非零時,
errexit 立刻終止整個 script——這條敘述**不在任何 if/while 條件式裡**(它是一句
獨立陳述),正是 errexit 會攔截的典型位置。重試迴圈的每一行(讀
`PUSH_STATUS`、比對錯誤訊息、`sleep`、`continue`)全部**永遠執行不到**,整個
「重試」機制形同虛設,只是把原本的即時失敗換成看起來一樣的即時失敗。

**為什麼設計時沒發現**:本機驗證用假的 `supabase` 指令模擬三種情境,但驗證指令是
`bash scriptfile.sh`,忽略了 GitHub Actions 實際呼叫方式帶有 `-e` 這個關鍵差異
——驗證了「重試邏輯本身對不對」,沒驗證「這段邏輯在它實際執行的環境裡會不會被跳過」。
兩者是不同的問題,本機測試只覆蓋了前者。

## 3. 同類掃描

- pattern:「在 `set -uo pipefail`(不含 `+e`)之後寫獨立陳述式的失敗處理邏輯,
  假設指令失敗不會讓 script 提前結束」。
- 掃描方式:`grep -n "^          set -" .github/workflows/*.yml` 找所有 `run:`
  step 開頭的 `set` 宣告,逐一檢查後面是否有依賴「失敗後還能繼續執行下一行」的
  邏輯(例如手動檢查 `$?`、重試迴圈、`||` 後接錯誤處理但前面不是最後一條陳述)。
- 結果:☑ 無同病灶——`journey.yml` 其餘 step 與其他 workflow 檔的 `set
  -euo pipefail`/`set -eo pipefail` 都是**刻意要 errexit**(單次失敗就該讓
  step 紅,例如 `套用 checkout 的 migrations 到分支` 修復前的原始版本、
  `建立拋棄式 Supabase 分支` 的 STATUS 輪詢迴圈本身雖然也是迴圈,但迴圈內只有
  `case` 判斷不含會失敗又要接著跑的指令,`curl -sf ... || true` 已經用 `|| true`
  正確蓋掉單一指令的失敗,不依賴 errexit 關閉)。這個「重試迴圈需要 errexit 關閉」
  的需求是這次新加的邏輯獨有,repo 裡沒有第二處。

## 4. 四面向審視

| 面向 | 檢視結論 |
|---|---|
| 系統 | 只影響剛新增的重試邏輯本身,不影響其他 step 或其他 workflow。 |
| 架構 | 點狀 bug(shell 語意誤解),不是架構問題。 |
| UIUX | 不適用。 |
| 需求 | 不適用——上一個修復的需求(重試邏輯)沒有變,只是實作有誤。 |

## 5. 修法與驗證

- 修了什麼:在 `set -uo pipefail` 前加一行 `set +e`,明確蓋掉 `bash -e {0}`
  繼承下來的 errexit。
- 為什麼這樣修是對的:直接對症——根因是「errexit 沒被清掉」,修法就是清掉它,
  不是繞路(例如把 `db push` 包進 `if`/`||` 讓 errexit 天然不觸發那種寫法,
  雖然也能繞開,但會讓 `PIPESTATUS` 的語意更難讀,不如明講 `set +e` 直接)。
- 驗證(記取上一版的教訓,這次**用 `bash -e scriptfile.sh` 而非 `bash
  scriptfile.sh`** 跑三個情境,精確對應 GitHub Actions 的實際呼叫方式):
  1. 撞兩次後第三次成功 → REACHED END、exit 0(之前用 `bash -e` 會在第一次
     失敗就終止,現在正確重試兩次後成功)。
  2. 第一次就是非 pkey 錯誤 → 立即印出 `::error::` 並 exit 1(行為與清掉
     errexit 前一致,因為這個路徑本來就是靠明確的 `exit 1`,不受 errexit
     影響)。
  3. 持續撞 pkey → 重試滿 10 次,印出重試上限訊息,exit 1(之前用 `bash -e`
     一樣會在第一次就終止,現在正確跑滿 10 次)。
  三者皆通過,且情境 1、3 的行為差異(之前 vs 現在)精確對應這次要修的 bug。

## 6. 防線回填

- 為什麼既有閘門沒攔到:`check-workflows.py` 與 YAML 語法檢查都不驗證 shell
  語意(errexit 的繼承規則),這屬於「shell 腳本執行語意」層級,不是「結構是否
  合法」層級。本機驗證雖然存在,但驗證方式(`bash script.sh`)與實際執行方式
  (`bash -e {0}`)不一致,是**驗證方法本身的落差**,不是缺閘門。
- 處置:☑ 攔不到,記 friction-log——通則是「本機驗證 CI 用的 shell 邏輯時,
  必須用與 CI 完全相同的呼叫方式(`bash -e`),差一個 flag 就可能讓同一段邏輯
  表現出完全不同的行為」。沒有新增機械閘門:這類「驗證方式與實際執行環境不一致」
  的落差難以用通用規則攔,比較實際的防線是把這條經驗寫進 friction-log,下次
  寫類似的重試/錯誤處理邏輯時能想起來對照。
