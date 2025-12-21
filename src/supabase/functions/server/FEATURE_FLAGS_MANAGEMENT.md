# 功能开关管理指南

## 概述

功能开关系统允许管理员通过修改 KV Store 来控制平台功能的启用/停用状态。

---

## 功能列表

| 功能 Key | 中文名称 | 默认状态 | 说明 |
|---------|---------|---------|------|
| `serviceProviderManagement` | 刊登管理 | ✅ 开启 | 会员可以建立、编辑和管理服务者刊登 |
| `referralManagement` | 推荐管理 | ❌ 关闭 | 会员可以查看和管理推荐关系、推荐码 |
| `taskCenter` | 任务中心 | ❌ 关闭 | 会员可以查看和完成平台任务 |
| `rewardSystem` | 奖励回馈 | ❌ 关闭 | 会员可以查看奖金、申请提领 |

---

## 数据结构

### KV Store Key: `system:feature_flags`

```json
{
  "features": {
    "serviceProviderManagement": true,
    "referralManagement": false,
    "taskCenter": false,
    "rewardSystem": false
  },
  "lastUpdatedAt": "2024-12-11T15:30:00.789Z",
  "lastUpdatedBy": {
    "userId": "system",
    "email": "admin@uknow.com.tw",
    "name": "管理員"
  }
}
```

---

## 方法 1：通过 Supabase Dashboard SQL 编辑器（推荐）

### 1. 查看当前功能状态

```sql
SELECT 
  key,
  value->>'features' as features,
  value->>'lastUpdatedAt' as last_updated,
  value->'lastUpdatedBy'->>'name' as updated_by
FROM kv_store_5c6718b9 
WHERE key = 'system:feature_flags';
```

### 2. 开启单个功能（示例：推荐管理）

```sql
UPDATE kv_store_5c6718b9 
SET value = jsonb_set(
  jsonb_set(
    jsonb_set(
      value, 
      '{features,referralManagement}', 
      'true'::jsonb
    ),
    '{lastUpdatedAt}',
    to_jsonb(now()::text)
  ),
  '{lastUpdatedBy,name}',
  '"管理員（手動）"'::jsonb
)
WHERE key = 'system:feature_flags';
```

### 3. 关闭单个功能（示例：刊登管理）

```sql
UPDATE kv_store_5c6718b9 
SET value = jsonb_set(
  jsonb_set(
    jsonb_set(
      value, 
      '{features,serviceProviderManagement}', 
      'false'::jsonb
    ),
    '{lastUpdatedAt}',
    to_jsonb(now()::text)
  ),
  '{lastUpdatedBy,name}',
  '"管理員（手動）"'::jsonb
)
WHERE key = 'system:feature_flags';
```

### 4. 一次性更新所有功能

```sql
UPDATE kv_store_5c6718b9 
SET value = jsonb_build_object(
  'features', jsonb_build_object(
    'serviceProviderManagement', true,
    'referralManagement', true,
    'taskCenter', true,
    'rewardSystem', true
  ),
  'lastUpdatedAt', now()::text,
  'lastUpdatedBy', jsonb_build_object(
    'userId', 'system',
    'email', 'admin@uknow.com.tw',
    'name', '管理員（批次更新）'
  )
)
WHERE key = 'system:feature_flags';
```

### 5. 重置为默认值

```sql
UPDATE kv_store_5c6718b9 
SET value = jsonb_build_object(
  'features', jsonb_build_object(
    'serviceProviderManagement', true,
    'referralManagement', false,
    'taskCenter', false,
    'rewardSystem', false
  ),
  'lastUpdatedAt', now()::text,
  'lastUpdatedBy', jsonb_build_object(
    'userId', 'system',
    'email', 'system@uknow.com.tw',
    'name', '系統重置'
  )
)
WHERE key = 'system:feature_flags';
```

---

## 方法 2：通过 Supabase Dashboard Table Editor

1. 登入 Supabase Dashboard
2. 选择项目：`uhtwwxtazwqnlbejhprl`
3. 侧边栏 → Table Editor → `kv_store_5c6718b9`
4. 找到 `key = 'system:feature_flags'` 的行
5. 点击该行的 `value` 列
6. 直接编辑 JSON：
   ```json
   {
     "features": {
       "serviceProviderManagement": true,
       "referralManagement": true,
       "taskCenter": false,
       "rewardSystem": false
     },
     "lastUpdatedAt": "2024-12-11T16:00:00.000Z",
     "lastUpdatedBy": {
       "userId": "admin",
       "email": "admin@uknow.com.tw",
       "name": "管理員（手動編輯）"
     }
   }
   ```
7. 点击「Save」

---

## 重要提醒

### ⚠️ 变更功能开关后必须做的事

**必须手动登出所有使用者，以确保变更生效！**

#### 方法：使用 SQL 批量登出

```sql
-- 登出所有使用者
DELETE FROM auth.sessions;
```

执行步骤：
1. Supabase Dashboard → SQL Editor
2. 新建查询
3. 输入上述 SQL
4. 点击「Run」
5. ✅ 所有用户已登出

---

## 常见操作示例

### 示例 1：开启推荐管理功能

```sql
-- 1. 查看当前状态
SELECT value->'features'->>'referralManagement' as referral_status
FROM kv_store_5c6718b9 
WHERE key = 'system:feature_flags';

-- 2. 开启功能
UPDATE kv_store_5c6718b9 
SET value = jsonb_set(
  jsonb_set(
    value, 
    '{features,referralManagement}', 
    'true'::jsonb
  ),
  '{lastUpdatedAt}',
  to_jsonb(now()::text)
)
WHERE key = 'system:feature_flags';

-- 3. 登出所有用户
DELETE FROM auth.sessions;
```

### 示例 2：维护模式（关闭所有功能）

```sql
-- 关闭所有功能（仅保留系统访问）
UPDATE kv_store_5c6718b9 
SET value = jsonb_build_object(
  'features', jsonb_build_object(
    'serviceProviderManagement', false,
    'referralManagement', false,
    'taskCenter', false,
    'rewardSystem', false
  ),
  'lastUpdatedAt', now()::text,
  'lastUpdatedBy', jsonb_build_object(
    'userId', 'system',
    'email', 'system@uknow.com.tw',
    'name', '系統維護模式'
  )
)
WHERE key = 'system:feature_flags';

-- 登出所有用户
DELETE FROM auth.sessions;
```

### 示例 3：开放所有功能

```sql
-- 开启所有功能
UPDATE kv_store_5c6718b9 
SET value = jsonb_build_object(
  'features', jsonb_build_object(
    'serviceProviderManagement', true,
    'referralManagement', true,
    'taskCenter', true,
    'rewardSystem', true
  ),
  'lastUpdatedAt', now()::text,
  'lastUpdatedBy', jsonb_build_object(
    'userId', 'system',
    'email', 'admin@uknow.com.tw',
    'name', '管理員（全面開放）'
  )
)
WHERE key = 'system:feature_flags';

-- 登出所有用户
DELETE FROM auth.sessions;
```

---

## 验证变更

### 1. 检查 KV Store

```sql
SELECT 
  value->'features' as features,
  value->>'lastUpdatedAt' as last_updated,
  value->'lastUpdatedBy' as updated_by
FROM kv_store_5c6718b9 
WHERE key = 'system:feature_flags';
```

### 2. 检查前端是否生效

- 方法 1：查看浏览器开发者工具 Console
  ```
  应该看到：
  ✅ FeatureContext: 成功獲取功能開關 {...}
  ```

- 方法 2：检查会员仪表板
  - 功能开启 → 选项显示
  - 功能关闭 → 选项隐藏

---

## API 端点

前端通过以下 API 获取功能状态：

```
GET https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/admin/features
```

响应：
```json
{
  "success": true,
  "features": {
    "serviceProviderManagement": true,
    "referralManagement": false,
    "taskCenter": false,
    "rewardSystem": false
  },
  "metadata": {
    "lastUpdatedAt": "2024-12-11T15:30:00.789Z",
    "lastUpdatedBy": {
      "userId": "system",
      "email": "admin@uknow.com.tw",
      "name": "管理員"
    }
  }
}
```

---

## 注意事项

1. ✅ **变更前备份**：建议先复制当前配置，以便需要时恢复
2. ✅ **非高峰时段**：建议在深夜或清晨进行变更
3. ✅ **提前通知**：重大功能变更应提前通知会员
4. ✅ **验证生效**：变更后应该测试确认功能确实开启/关闭
5. ⚠️ **必须登出**：变更后必须执行 `DELETE FROM auth.sessions;`

---

## 故障排除

### 问题 1：功能开关变更后，前端没有更新

**原因**：用户的 session 仍在使用旧的功能状态

**解决方案**：
```sql
DELETE FROM auth.sessions;
```

### 问题 2：无法找到 `system:feature_flags` 记录

**原因**：首次访问时尚未初始化

**解决方案**：
前端首次访问 GET API 时会自动初始化，或手动初始化：
```sql
INSERT INTO kv_store_5c6718b9 (key, value)
VALUES (
  'system:feature_flags',
  jsonb_build_object(
    'features', jsonb_build_object(
      'serviceProviderManagement', true,
      'referralManagement', false,
      'taskCenter', false,
      'rewardSystem', false
    ),
    'lastUpdatedAt', now()::text,
    'lastUpdatedBy', jsonb_build_object(
      'userId', 'system',
      'email', 'system@uknow.com.tw',
      'name', '系統初始化'
    )
  )
);
```

### 问题 3：JSON 格式错误

**症状**：SQL 执行失败，提示 JSON 格式错误

**解决方案**：
- 使用 SQL 编辑器的语法检查
- 复制粘贴本文档中的完整 SQL
- 确保布尔值使用 `true`/`false` 而不是 `"true"`/`"false"`

---

## 联系支持

如有问题，请查看：
- Supabase Dashboard Logs
- 前端浏览器 Console
- Backend Server Logs

---

**文档更新日期：2024-12-11**
