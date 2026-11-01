// ============================================================
// T1-B 暫時性故障不登出（後端 B1）：/profile 把「讀不到」與「不合格」分開。
//
// - authenticate()：Auth 抖動（retryable、5xx、429、拋例外）→ transient（503），
//   只有 AuthApiError 4xx 才是 unauthorized（401）。只給 /profile 用，其餘端點的
//   requireAuth 語意不變（總綱 T1-02）。
// - buildProfileResponse 五個讀取：零列維持原語意，查詢失敗擲 ProfileReadError
//   → 呼叫者回 503 PROFILE_UNAVAILABLE，不再退化成 404／step 1／expired／未付款
//   （規格書 §5.3、§14 #8①②；pending 讀取失敗被當未付款＝重複付款風險）。
// - ?retry=1：前端逾時後的重試只跳過 heal／repair 兩支 RPC（第一個請求可能仍在跑）。
//
// 純單元：注入假 client 與假 heal／repair，不連資料庫（T4）。
// ============================================================
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { ensureEdgeFunctionEnv } from './test-helpers.ts';
import { PROFILE_UNAVAILABLE } from '../_shared/api-contract.ts';

ensureEdgeFunctionEnv();

const {
  authenticate,
  buildProfileResponse,
  loadProfileOrError,
  makeProfileHandler,
  ProfileReadError,
} = await import('./index.ts');

// ---------- 假 client ----------

type Res = { data: unknown; error: unknown };
type Reads = {
  profiles: Res;
  user_account_status: Res;
  referral_codes: Res;
  payment_orders: Res;
  rpc: Res;
};

const PGRST116 = {
  code: 'PGRST116',
  message: 'JSON object requested, multiple (or no) rows returned',
};
const DB_DOWN = { code: '08006', message: 'connection failure' };

function okReads(step = 1, overrides: Partial<Reads> = {}): Reads {
  return {
    profiles: {
      data: { id: 'u1', name: '王小明', suspended_at: null, is_admin: false },
      error: null,
    },
    user_account_status: { data: { status: 'expired', end_date: null }, error: null },
    referral_codes: { data: null, error: null },
    payment_orders: { data: [], error: null },
    rpc: { data: step, error: null },
    ...overrides,
  };
}

/** 依序回傳多份讀取結果（自癒遞迴重入會讀第二次）。 */
function fakeClient(...rounds: Reads[]) {
  let call = -1;
  const current = () => rounds[Math.min(call, rounds.length - 1)];
  const chain = (table: keyof Reads) => {
    const c: any = {};
    for (const m of ['select', 'eq', 'order']) c[m] = () => c;
    const end = () => Promise.resolve(current()[table]);
    c.single = end;
    c.maybeSingle = end;
    c.limit = end;
    return c;
  };
  return {
    from(table: keyof Reads) {
      if (table === 'profiles') call += 1; // 每輪 Promise.all 第一個讀 profiles
      return chain(table);
    },
    rpc: () => Promise.resolve(current().rpc),
  };
}

function spies() {
  const calls = { heal: 0, repair: 0 };
  return {
    calls,
    heal: () => {
      calls.heal += 1;
      return Promise.resolve(false);
    },
    repair: () => {
      calls.repair += 1;
      return Promise.resolve();
    },
  };
}

// ---------- authenticate ----------

const authWith = (impl: () => Promise<any>) => ({ getUser: impl });

Deno.test('authenticate：沒有 token → unauthorized', async () => {
  const r = await authenticate(authWith(() => Promise.reject(new Error('不該被呼叫'))), undefined);
  assertEquals(r, { error: 'unauthorized' });
});

Deno.test('authenticate：getUser 回使用者 → 回該使用者', async () => {
  const user = { id: 'u1', email: 'a@b.c' };
  const r = await authenticate(
    authWith(() => Promise.resolve({ data: { user }, error: null })),
    't',
  );
  assertEquals(r, { user });
});

Deno.test('authenticate：AuthRetryableFetchError → transient', async () => {
  const error = { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' };
  const r = await authenticate(
    authWith(() => Promise.resolve({ data: { user: null }, error })),
    't',
  );
  assertEquals(r, { error: 'transient' });
});

Deno.test('authenticate：Auth 回 5xx、429 或 status 0 → transient', async () => {
  for (const status of [0, 500, 502, 503, 429]) {
    const error = { name: 'AuthApiError', status, message: 'x' };
    const r = await authenticate(
      authWith(() => Promise.resolve({ data: { user: null }, error })),
      't',
    );
    assertEquals(r, { error: 'transient' }, `status ${status}`);
  }
});

Deno.test('authenticate：getUser 拋例外 → transient（不冒成 500）', async () => {
  const r = await authenticate(authWith(() => Promise.reject(new TypeError('boom'))), 't');
  assertEquals(r, { error: 'transient' });
});

Deno.test('authenticate：AuthApiError 400／401／403 → unauthorized', async () => {
  for (const status of [400, 401, 403]) {
    const error = { name: 'AuthApiError', status, code: 'user_not_found', message: 'x' };
    const r = await authenticate(
      authWith(() => Promise.resolve({ data: { user: null }, error })),
      't',
    );
    assertEquals(r, { error: 'unauthorized' }, `status ${status}`);
  }
});

// ---------- buildProfileResponse：讀取對照表 ----------

Deno.test('buildProfileResponse：五個讀取都成功 → 回 profile，step 1 不跑 heal／repair', async () => {
  const s = spies();
  const p = await buildProfileResponse(fakeClient(okReads(1)), 'u1', 'a@b.c', s);
  assertEquals(p?.registrationStep, 1);
  assertEquals(s.calls, { heal: 0, repair: 0 });
});

Deno.test('buildProfileResponse：任一讀取查詢失敗 → 擲 ProfileReadError（帶讀取名）', async () => {
  for (
    const table of [
      'profiles',
      'user_account_status',
      'referral_codes',
      'payment_orders',
      'rpc',
    ] as const
  ) {
    const reads = okReads(1, { [table]: { data: null, error: DB_DOWN } });
    const err = await assertRejects(
      () => buildProfileResponse(fakeClient(reads), 'u1', undefined, spies()),
      ProfileReadError,
    );
    assertEquals((err as InstanceType<typeof ProfileReadError>).read, table, table);
  }
});

Deno.test('buildProfileResponse：profiles 零列（PGRST116）→ null（維持 404 語意）', async () => {
  const reads = okReads(1, { profiles: { data: null, error: PGRST116 } });
  assertEquals(await buildProfileResponse(fakeClient(reads), 'u1', undefined, spies()), null);
});

Deno.test('buildProfileResponse：user_account_status 零列 → accountStatus expired', async () => {
  const reads = okReads(1, { user_account_status: { data: null, error: PGRST116 } });
  const p = await buildProfileResponse(fakeClient(reads), 'u1', undefined, spies());
  assertEquals(p?.accountStatus, 'expired');
  assertEquals(p?.subscriptionEndDate, null);
});

Deno.test('buildProfileResponse：註冊進度 rpc 回 null → 擲 ProfileReadError', async () => {
  const reads = okReads(1, { rpc: { data: null, error: null } });
  await assertRejects(
    () => buildProfileResponse(fakeClient(reads), 'u1', undefined, spies()),
    ProfileReadError,
  );
});

Deno.test('buildProfileResponse：自癒遞迴重入時讀取失敗 → 擲 ProfileReadError', async () => {
  const paid = { data: [{ transaction_id: 'T1', payuniStatus: 'SUCCESS' }], error: null };
  const first = okReads(2, { payment_orders: paid });
  const second = okReads(3, { profiles: { data: null, error: DB_DOWN } });
  const heal = () => Promise.resolve(true);
  await assertRejects(
    () =>
      buildProfileResponse(fakeClient(first, second), 'u1', undefined, {
        heal,
        repair: () => Promise.resolve(),
      }),
    ProfileReadError,
  );
});

// ---------- ?retry=1 ----------

Deno.test('buildProfileResponse：非重試的 step 3 → 跑 repair', async () => {
  const s = spies();
  await buildProfileResponse(fakeClient(okReads(3)), 'u1', undefined, s);
  assertEquals(s.calls.repair, 1);
});

Deno.test('buildProfileResponse：retry 的 step 3 → 不跑 repair，旗標仍重設為 false', async () => {
  const s = spies();
  const paid = { data: [{ transaction_id: 'T1', payuniStatus: 'SUCCESS' }], error: null };
  const p = await buildProfileResponse(
    fakeClient(okReads(3, { payment_orders: paid })),
    'u1',
    undefined,
    { ...s, retry: true },
  );
  assertEquals(s.calls.repair, 0);
  assertEquals(p?.paidAwaitingActivation, false);
});

Deno.test('buildProfileResponse：retry 的已付款待開通 → 不跑 heal，回未自癒的 step 2', async () => {
  const s = spies();
  const paid = { data: [{ transaction_id: 'T1', payuniStatus: 'SUCCESS' }], error: null };
  const p = await buildProfileResponse(
    fakeClient(okReads(2, { payment_orders: paid })),
    'u1',
    undefined,
    { ...s, retry: true },
  );
  assertEquals(s.calls.heal, 0);
  assertEquals(p?.registrationStep, 2);
  assertEquals(p?.paidAwaitingActivation, true);
});

// ---------- 呼叫者的 404／503 分流 ----------

Deno.test('loadProfileOrError：讀取失敗（ProfileReadError）→ 回 503 PROFILE_UNAVAILABLE', async () => {
  const r = await loadProfileOrError(() => Promise.reject(new ProfileReadError('profiles')));
  assertEquals(r.ok, false);
  if (r.ok) return;
  assertEquals(r.status, 503);
  assertEquals((r.body as any).error.code, PROFILE_UNAVAILABLE);
});

Deno.test('loadProfileOrError：零列 null → 404；其他例外照常拋出', async () => {
  const r = await loadProfileOrError(() => Promise.resolve(null));
  assertEquals(r, { ok: false, status: 404, body: { error: '用戶不存在' } });
  await assertRejects(
    () => loadProfileOrError(() => Promise.reject(new TypeError('x'))),
    TypeError,
  );
});

// ---------- GET /profile handler ----------

function fakeContext(url: string, token?: string) {
  return {
    req: {
      header: (name: string) => (name === 'Authorization' && token ? `Bearer ${token}` : undefined),
      query: (name: string) => new URL(url).searchParams.get(name) ?? undefined,
    },
    json: (body: unknown, status = 200) => ({ body, status }),
  };
}

Deno.test('GET /profile：Auth 暫時性故障 → 503 PROFILE_UNAVAILABLE', async () => {
  const h = makeProfileHandler({
    authenticate: () => Promise.resolve({ error: 'transient' }),
    build: () => Promise.reject(new Error('不該被呼叫')),
  });
  const r: any = await h(fakeContext('https://x/profile', 't'));
  assertEquals(r.status, 503);
  assertEquals(r.body.error.code, PROFILE_UNAVAILABLE);
});

Deno.test('GET /profile：Auth 判無效 → 401', async () => {
  const h = makeProfileHandler({
    authenticate: () => Promise.resolve({ error: 'unauthorized' }),
    build: () => Promise.reject(new Error('不該被呼叫')),
  });
  const r: any = await h(fakeContext('https://x/profile', 't'));
  assertEquals(r.status, 401);
});

Deno.test('GET /profile：讀取失敗 → 503；零列 → 404；成功 → 200', async () => {
  const user = { id: 'u1', email: 'a@b.c' };
  const cases: Array<[() => Promise<any>, number]> = [
    [() => Promise.reject(new ProfileReadError('payment_orders')), 503],
    [() => Promise.resolve(null), 404],
    [() => Promise.resolve({ id: 'u1' }), 200],
  ];
  for (const [build, status] of cases) {
    const h = makeProfileHandler({ authenticate: () => Promise.resolve({ user }), build });
    const r: any = await h(fakeContext('https://x/profile', 't'));
    assertEquals(r.status, status);
  }
});

Deno.test('GET /profile：?retry=1 → build 收到 retry:true；一般請求為 false', async () => {
  const seen: boolean[] = [];
  const h = makeProfileHandler({
    authenticate: () => Promise.resolve({ user: { id: 'u1' } }),
    build: (_id, _email, opts) => {
      seen.push(!!opts.retry);
      return Promise.resolve({ id: 'u1' });
    },
  });
  await h(fakeContext('https://x/profile?retry=1', 't'));
  await h(fakeContext('https://x/profile', 't'));
  assertEquals(seen, [true, false]);
});

// ---------- 範圍守衛（原始碼列舉） ----------

const indexSrc = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('原始碼：三個 buildProfileResponse 呼叫者都經 loadProfileOrError 分流', () => {
  for (const route of ["'/auth/register'", "'/auth/complete-registration'"]) {
    const start = indexSrc.indexOf(`app.post(${route}`);
    assert(start >= 0, route);
    const body = indexSrc.slice(start, indexSrc.indexOf('\n});', start));
    assert(body.includes('loadProfileOrError('), `${route} 未經 loadProfileOrError`);
  }
  assert(
    /app\.get\('\/profile', makeProfileHandler\(/.test(indexSrc),
    '/profile 未用 makeProfileHandler',
  );
});

Deno.test('原始碼：requireAuth 本體與其餘端點的呼叫數不變（只有 /profile 改用 authenticate）', async () => {
  assert(indexSrc.includes('return error || !user ? null : user;'), 'requireAuth 本體被改動');
  const count = (src: string) => (src.match(/requireAuth\(/g) ?? []).length;
  const read = (f: string) => Deno.readTextFile(new URL(f, import.meta.url));
  // index.ts：定義 1 ＋ 46 個呼叫點（T1-B 前 47 個，/profile 移出）。
  assertEquals(count(indexSrc), 47);
  assertEquals(count(await read('./listing-photos.ts')), 2);
  assertEquals(count(await read('./referral-invite.ts')), 1);
});
