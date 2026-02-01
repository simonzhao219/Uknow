# Webhooks Function 部署指南

## 📋 前置准备检查清单

- [ ] 已安装 Supabase CLI
- [ ] 已登录 Supabase (`supabase login`)
- [ ] 已链接到项目 (`supabase link --project-ref <项目ID>`)
- [ ] 已准备好环境变量（见下方）

---

## 🚀 部署步骤

### 1. 部署 webhooks function

在项目根目录执行：

```bash
supabase functions deploy webhooks
```

部署成功后，会显示：
```
Deployed Function webhooks on project <项目ID>
Function URL: https://<项目ID>.supabase.co/functions/v1/webhooks
```

### 2. 配置环境变量

前往 **Supabase Dashboard → Functions → webhooks → Secrets**

或使用 CLI（推荐）：

```bash
# 创建 .env.webhooks 文件
cat > .env.webhooks << 'EOF'
# 统一金流配置（测试环境）
PAYUNI_TEST_MER_ID=your_test_mer_id
PAYUNI_TEST_HASH_KEY=your_test_hash_key
PAYUNI_TEST_HASH_IV=your_test_hash_iv

# 统一金流配置（正式环境）
PAYUNI_MER_ID=your_prod_mer_id
PAYUNI_HASH_KEY=your_prod_hash_key
PAYUNI_HASH_IV=your_prod_hash_iv

# Supabase 配置
SUPABASE_URL=https://<项目ID>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DATABASE_URL=your_database_url

# 其他配置
PASSWORD_ENCRYPTION_KEY=your_encryption_key
FRONTEND_URL=https://your-frontend-url.com
EOF

# 上传环境变量
supabase secrets set --env-file .env.webhooks
```

**⚠️ 重要提醒：**
- 这些环境变量必须与主服务（make-server-5c6718b9）保持一致
- 可以从 Supabase Dashboard → Settings → Edge Functions → Secrets 查看现有变量
- 上传后需要重新部署 function 才会生效

### 3. 验证部署

#### 测试 Health Check

```bash
curl https://<项目ID>.supabase.co/functions/v1/webhooks/health
```

预期响应：
```json
{
  "status": "ok",
  "service": "webhooks",
  "timestamp": "2025-02-01T12:34:56.789Z"
}
```

#### 测试 PayUni Webhook Health Check

```bash
curl https://<项目ID>.supabase.co/functions/v1/webhooks/payuni/health
```

预期响应：
```json
{
  "status": "ok",
  "service": "payuni-webhook",
  "timestamp": "2025-02-01T12:34:56.789Z"
}
```

### 4. 查看实时日志

```bash
supabase functions logs webhooks --follow
```

---

## 🧪 完整测试流程

### 步骤 1：创建测试订单

```bash
curl -X POST \
  https://<项目ID>.supabase.co/functions/v1/make-server-5c6718b9/payuni/prepare-order \
  -H "Authorization: Bearer <user_access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user_id",
    "userEmail": "test@example.com",
    "userPhone": "0912345678",
    "referralCode": "abc123456"
  }'
```

预期响应：
```json
{
  "success": true,
  "tradeNo": "20250201123456abcdefghijk",
  "paymentUrl": "https://sandbox-api.payuni.com.tw/..."
}
```

### 步骤 2：前往统一金流付款

1. 复制返回的 `paymentUrl`
2. 在浏览器中打开（测试环境）
3. 使用测试卡号完成支付

**测试卡号（统一金流测试环境）：**
- 信用卡号：`4000-2211-1111-1111`
- 有效期：任意未来日期
- CVV：`123`

### 步骤 3：验证 Webhook 回调

查看 webhooks 日志：
```bash
supabase functions logs webhooks --follow
```

预期日志：
```
[Webhook PayUni] 收到通知
[Webhook PayUni] MerID: ...
[Webhook PayUni] 使用環境：test
[Webhook PayUni] ✅ Hash 驗證通過
[Webhook PayUni] 解密數據: { Status: 'SUCCESS', ... }
[Webhook PayUni] 訂單用戶: test_user_id
[Webhook PayUni] 🎉 首期付款成功
[Webhook PayUni] 生成推薦碼: abc123456
[Webhook PayUni] ✅ 用戶資料已更新
[Webhook PayUni] ✅ 訂單已完成
[Webhook PayUni] ✅ 用戶已激活: test_user_id
```

### 步骤 4：验证用户状态

```bash
curl https://<项目ID>.supabase.co/functions/v1/make-server-5c6718b9/payuni/query-result/<tradeNo> \
  -H "Authorization: Bearer <user_access_token>"
```

预期响应：
```json
{
  "success": true,
  "status": "SUCCESS",
  "activated": true,
  "tradeInfo": {
    "Status": "SUCCESS",
    "PeriodTradeNo": "...",
    "ThisPeriod": "1",
    "TotalTimes": "12"
  }
}
```

---

## 🔧 环境切换（测试 → 正式）

修改 `/supabase/functions/webhooks/shared/payuni_config.ts`：

```typescript
// 测试环境
const MODE: 'test' | 'production' = 'test';

// 正式环境
const MODE: 'test' | 'production' = 'production';
```

然后重新部署：
```bash
supabase functions deploy webhooks
```

---

## 🐛 常见问题排查

### 问题 1：部署失败 - "Invalid function"

**原因：** 目录结构不正确

**检查：**
```bash
ls -la supabase/functions/webhooks/
# 应该看到：index.tsx, payuni_handler.ts, shared/
```

### 问题 2：环境变量未生效

**解决：**
```bash
# 重新上传环境变量
supabase secrets set --env-file .env.webhooks

# 重新部署
supabase functions deploy webhooks
```

### 问题 3：Webhook 回调 404

**检查 NotifyURL 是否正确：**
- 应该是：`https://<项目ID>.supabase.co/functions/v1/webhooks/payuni/notify`
- 不是：`https://<项目ID>.supabase.co/functions/v1/make-server-5c6718b9/...`

**验证路由：**
```bash
curl -X POST https://<项目ID>.supabase.co/functions/v1/webhooks/payuni/notify \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MerID=test&EncryptInfo=test&HashInfo=test"
```

应该返回错误（这是正常的，证明路由存在）：
```json
{
  "Status": "FAILED",
  "Message": "Hash verification failed"
}
```

### 问题 4：签名验证失败

**检查：**
1. 环境变量 `PAYUNI_TEST_HASH_IV` 是否正确
2. 环境变量 `PAYUNI_TEST_HASH_KEY` 是否正确
3. 是否使用了正确的环境（test vs production）

**查看日志中的详细信息：**
```bash
supabase functions logs webhooks --follow
```

---

## ✅ 部署后检查清单

- [ ] webhooks function 已成功部署
- [ ] 环境变量已配置完成
- [ ] Health check 测试通过
- [ ] 主服务的 NotifyURL 已更新指向 webhooks
- [ ] 完整测试流程通过
- [ ] 日志显示正常

---

## 📝 相关文件

- `/supabase/functions/webhooks/index.tsx` - 主入口
- `/supabase/functions/webhooks/payuni_handler.ts` - PayUni 处理器
- `/supabase/functions/webhooks/shared/payuni_config.ts` - 配置管理
- `/supabase/functions/webhooks/shared/payuni_crypto.ts` - 加解密工具
- `/supabase/functions/webhooks/shared/date_utils.ts` - 日期工具
- `/supabase/functions/webhooks/shared/kv_store.ts` - KV 操作

---

## 🔗 相关链接

- Supabase Dashboard: https://app.supabase.com
- PayUni 测试环境: https://sandbox-api.payuni.com.tw
- PayUni 正式环境: https://api.payuni.com.tw

---

**部署完成后，删除此文件以保持项目整洁。**
