// ============================================================
// system_alerts 的「出口」：這張表自 0716000004 起只進不出——付款周邊
// 失敗、對帳錯誤、金額不符都寫進來，但沒有任何 API 讀它、resolved_at
// 全 codebase 無人寫入。「金額不符待人工裁決」這類告警實際上無人會
// 看到，且告警去重靠 resolved_at is null，永不 resolve 代表同一訂單
// 只告警一次、第一次漏看就永遠靜默。補上 admin 讀取與 resolve 端點。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

async function createAdmin(client: ReturnType<typeof adminClient>) {
  const admin = await createTestUser(client, { name: 'Alerts Admin' });
  await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
  return admin;
}

Deno.test('GET /admin/system-alerts：預設只列未處理告警，含本測試寫入的那筆', async () => {
  const client = adminClient();
  const admin = await createAdmin(client);
  const marker = `alerts-api-test-${crypto.randomUUID()}`;

  try {
    await client.from('system_alerts').insert({
      source: marker, severity: 'error', message: '測試告警', context: { probe: true },
    });

    const token = await getUserAccessToken(client, admin.email);
    const res = await app.request('/api/admin/system-alerts?limit=200', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 200, await res.clone().text());
    const body = await res.json();
    const mine = (body.data?.alerts ?? []).find((a: any) => a.source === marker);
    assert(mine, '未處理告警列表應包含剛寫入的那筆');
    assertEquals(mine.severity, 'error');
    assertEquals(mine.resolved_at, null);
  } finally {
    await client.from('system_alerts').delete().eq('source', marker);
    await deleteTestUsers(client, [admin.id]);
  }
});

Deno.test('POST /admin/system-alerts/:id/resolve：標記已處理後離開未處理列表', async () => {
  const client = adminClient();
  const admin = await createAdmin(client);
  const marker = `alerts-resolve-test-${crypto.randomUUID()}`;

  try {
    const { data: inserted } = await client.from('system_alerts')
      .insert({ source: marker, severity: 'warning', message: '待處理' })
      .select('id').single();
    assert(inserted);

    const token = await getUserAccessToken(client, admin.email);
    const resolveRes = await app.request(`/api/admin/system-alerts/${inserted.id}/resolve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(resolveRes.status, 200, await resolveRes.clone().text());

    const { data: row } = await client.from('system_alerts')
      .select('resolved_at').eq('id', inserted.id).single();
    assert(row?.resolved_at, 'resolved_at 應已寫入');

    // 已處理的告警不能重複 resolve（冪等性以 404 表達）
    const again = await app.request(`/api/admin/system-alerts/${inserted.id}/resolve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(again.status, 404);

    // 未處理列表不再包含它
    const list = await app.request('/api/admin/system-alerts?limit=200', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const stillThere = ((await list.json()).data?.alerts ?? [])
      .some((a: any) => a.id === inserted.id);
    assertEquals(stillThere, false);
  } finally {
    await client.from('system_alerts').delete().eq('source', marker);
    await deleteTestUsers(client, [admin.id]);
  }
});

Deno.test('system-alerts 端點受 admin 守門涵蓋：匿名 401', async () => {
  const res = await app.request('/api/admin/system-alerts');
  assertEquals(res.status, 401);
});
