#!/bin/bash

# 驗證部署文件完整性
# 在專案根目錄執行：bash verify_files.sh

echo "========================================="
echo "Supabase Functions 文件完整性檢查"
echo "========================================="
echo ""

# 1. 檢查當前目錄
echo "1. 當前目錄："
pwd
echo ""

# 2. 檢查 supabase 目錄是否存在
echo "2. 檢查 supabase 目錄："
if [ -d "supabase" ]; then
  echo "✅ supabase/ 目錄存在"
else
  echo "❌ supabase/ 目錄不存在"
  echo "   請確認您在專案根目錄（Uknow/）"
  exit 1
fi
echo ""

# 3. 檢查 functions 目錄
echo "3. 檢查 functions 目錄："
if [ -d "supabase/functions" ]; then
  echo "✅ supabase/functions/ 目錄存在"
  echo "   內容："
  ls -la supabase/functions/
else
  echo "❌ supabase/functions/ 目錄不存在"
  exit 1
fi
echo ""

# 4. 檢查 make-server-5c6718b9 目錄
echo "4. 檢查 make-server-5c6718b9 目錄："
if [ -d "supabase/functions/make-server-5c6718b9" ]; then
  echo "✅ supabase/functions/make-server-5c6718b9/ 目錄存在"
  echo "   內容："
  ls -la supabase/functions/make-server-5c6718b9/
else
  echo "❌ supabase/functions/make-server-5c6718b9/ 目錄不存在"
  exit 1
fi
echo ""

# 5. 檢查 index.ts 文件
echo "5. 檢查 index.ts 文件："
if [ -f "supabase/functions/make-server-5c6718b9/index.ts" ]; then
  echo "✅ index.ts 文件存在"
  
  # 文件大小
  FILE_SIZE=$(wc -c < "supabase/functions/make-server-5c6718b9/index.ts")
  echo "   文件大小：$FILE_SIZE bytes"
  
  # 行數
  LINE_COUNT=$(wc -l < "supabase/functions/make-server-5c6718b9/index.ts")
  echo "   行數：$LINE_COUNT"
  
  # 前 5 行內容
  echo "   前 5 行內容："
  head -5 "supabase/functions/make-server-5c6718b9/index.ts"
else
  echo "❌ index.ts 文件不存在"
  exit 1
fi
echo ""

# 6. 檢查 deno.json 文件
echo "6. 檢查 deno.json 文件："
if [ -f "supabase/functions/make-server-5c6718b9/deno.json" ]; then
  echo "✅ deno.json 文件存在"
  cat "supabase/functions/make-server-5c6718b9/deno.json"
else
  echo "⚠️  deno.json 文件不存在（可選）"
fi
echo ""

# 7. 檢查 server 目錄
echo "7. 檢查 server 目錄："
if [ -d "supabase/functions/server" ]; then
  echo "✅ supabase/functions/server/ 目錄存在"
  echo "   內容："
  ls -la supabase/functions/server/ | head -20
else
  echo "❌ supabase/functions/server/ 目錄不存在"
  exit 1
fi
echo ""

# 8. 檢查關鍵模塊文件
echo "8. 檢查關鍵模塊文件："

REQUIRED_FILES=(
  "supabase/functions/server/kv_store.tsx"
  "supabase/functions/server/db.ts"
  "supabase/functions/server/auth_v2.ts"
  "supabase/functions/server/listings_v2.ts"
  "supabase/functions/server/subscriptions_v2.ts"
  "supabase/functions/server/referrals_v2.ts"
  "supabase/functions/server/rewards_v2.ts"
  "supabase/functions/server/tasks_v2.ts"
  "supabase/functions/server/withdrawals_v2.ts"
  "supabase/functions/server/profile_v2.ts"
  "supabase/functions/server/cron_v2.ts"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file"
  else
    echo "❌ $file (缺失)"
  fi
done
echo ""

# 9. 檢查 config.toml
echo "9. 檢查 config.toml："
if [ -f "supabase/config.toml" ]; then
  echo "✅ supabase/config.toml 存在"
  cat "supabase/config.toml"
else
  echo "⚠️  supabase/config.toml 不存在"
fi
echo ""

# 10. 總結
echo "========================================="
echo "檢查完成！"
echo "========================================="
echo ""
echo "如果所有項目都是 ✅，但部署仍然失敗："
echo ""
echo "可能的原因："
echo "  1. Figma Make 虛擬文件系統同步延遲"
echo "  2. Supabase CLI 版本不兼容"
echo "  3. 權限問題"
echo ""
echo "建議解決方案："
echo "  方案 A：使用本地終端部署"
echo "  方案 B：使用 Supabase Dashboard 部署"
echo "  方案 C：使用 --debug 參數獲取詳細信息"
echo ""
echo "詳細指南：查看 /URGENT_FIX_FILE_NOT_FOUND.md"
echo ""
