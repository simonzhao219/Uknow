# 個資外洩處置 Runbook — `export/` 歷史清除

## 事故摘要

`export/` 目錄（`users.json`、`reward_schedules.json`、`subscriptions.json`、`listings.json`）
被提交進 git，內含 **146 位真實使用者的完整 PII**：姓名、email、電話、生日，以及
**身分證字號（`nationalId`）**。身分證字號屬《個人資料保護法》高敏感個資。

任何具備 repo 讀取權者皆可取得。此為實質外洩，需徹底處置。

## 已完成（HEAD 層，本 PR）

- `git rm -r export/`：自目前工作樹與索引移除。
- `.gitignore` 追加 `export/`：防止再次被加入。
- 已確認**無任何程式碼** import `export/*.json`（移除不影響功能）。

> ⚠️ 以上僅讓 **HEAD 之後**乾淨。舊 blob 仍存在於 git **歷史**中，`git log`/
> `git show <舊 commit>` 仍能取出。必須執行下方歷史重寫才算真正清除。

## 待執行（破壞性，需協調時間窗與授權）

### 1. 重寫歷史，清除所有 `export/` blob

使用 [`git-filter-repo`](https://github.com/newren/git-filter-repo)（官方推薦，優於 `filter-branch`）：

```bash
# 於乾淨的鏡像 clone 上操作，避免污染既有工作樹
git clone --mirror git@github.com:simonzhao219/Uknow.git uknow-mirror
cd uknow-mirror
git filter-repo --path export/ --invert-paths --force
git push --force --all
git push --force --tags
```

或 BFG：`bfg --delete-folders export --no-blob-protection`。

### 2. 影響面與協調

- **所有 commit SHA（首次出現 `export/` 之後）都會改變** → 需 `--force` 推送
  `main` 與所有分支/標籤。
- **通知所有協作者**：捨棄本地 clone、重新 `git clone`（舊本地分支會與新歷史分岔）。
- **關閉並重開受影響的 PR**（含本 Review PR，重寫後需 rebase 到新 `main`）。
- CI/部署若快取了舊 SHA，需清快取重跑。

### 3. 憑證輪替（假設已外洩處理）

- 輪替 Supabase **service-role key**（後端 Edge Function 用）。
- 評估輪替 **anon key**（`src/utils/supabase/info.tsx`，屬公開金鑰、風險較低但一併檢視）。
- 檢查 `export/` 是否連帶含任何其他密鑰/token，一併輪替。

### 4. 法遵

- 依《個人資料保護法》評估**通報義務**與**當事人告知**（含身分證字號外洩範圍）。
- 記錄事故時間線與處置措施備查。

## 執行前檢查表

- [ ] 已取得對 `main` 強制推送之授權
- [ ] 已公告協作者時間窗、暫停其他人推送
- [ ] 已備份現有 repo（鏡像）
- [ ] 歷史重寫完成、`git log --all -- export/` 無結果
- [ ] Supabase service-role / anon key 已輪替、部署環境已更新
- [ ] 法遵通報/告知評估完成
