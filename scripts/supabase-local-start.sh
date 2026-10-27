#!/usr/bin/env bash
# 啟動本地 Supabase——CI 的 api-tests 軌與本機／web session 共用的單一入口。
#
# 為什麼收成腳本:排除清單與退避重試原本寫在 ci.yml 的一個 step 裡,本機要起
# 時各自抄一份、版本漂移。收在這裡,CI 與本機跑的是同一份。
#
# 排除清單(supabase start -x):
#   studio logflare vector supavisor   只有 GUI／可觀測性用途
#   edge-runtime  測試用 app.request() 直接打 index.ts,不經 Edge Runtime
#   imgproxy      測試沒有圖片轉換
#   postgres-meta 只有 Studio 用(CLI 認的名字是 postgres-meta,不是 help 列的 meta)
#   realtime      沒有任何程式碼或測試使用(容器不起,但 CLI 仍會拉它的映像,省不到下載量)
# 名字要用 CLI 實際認的容器名(postgres-meta、edge-runtime…),不是 `supabase start --help`
# 列的簡稱——寫成 meta 時 postgres-meta 照樣被拉、照樣在跑(2026-10-27 實測)。
# 刻意保留:
#   inbucket(Mailpit)——referral-invite*.test.ts 真呼叫 inviteUserByEmail,
#   GoTrue 要有 SMTP 可寄,排除它那幾支測試會紅。別因為它「看起來只是信箱」
#   就拿掉。storage 也要留:listing-photos、id-cards 都走真 Storage。
#
# 映像從 registry 匿名拉取,共用 runner 的 IP 會撞上限流(ECR `Data limit
# exceeded`、ghcr `toomanyrequests`)——2026-10-26 一天四次(PR #399),每次都在
# 任何測試跑之前整步失敗。啟動冪等,比照規則 12(.claude/rules/github-actions.md)
# 退避重試。沙箱要改從 Docker Hub 拉時,在呼叫前設
# SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io,本腳本不碰它。
set -uo pipefail

exclude="studio,logflare,vector,supavisor,edge-runtime,imgproxy,postgres-meta,realtime"
max_attempts=4

for attempt in $(seq 1 "$max_attempts"); do
  if supabase start -x "$exclude"; then
    exit 0
  fi
  if [ "$attempt" -lt "$max_attempts" ]; then
    wait_s=$((attempt * 30))
    echo "::warning::第 ${attempt} 次啟動失敗，${wait_s} 秒後重試（多半是拉映像被限流）"
    supabase stop --no-backup || true
    sleep "$wait_s"
  fi
done

echo "::error::本地 Supabase 連續 ${max_attempts} 次啟動失敗——看上面每一次的輸出，判斷是映像限流還是 migration 本身有問題"
exit 1
