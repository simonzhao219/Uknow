import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_POSTHOG_KEY,
  POSTHOG_KEYS,
  resolvePosthogTarget,
} from './posthogTarget';

const REAL_KEYS = { production: 'phc_prod_real', develop: 'phc_dev_real' };

describe('resolvePosthogTarget', () => {
  it('預設 key 為佔位值時，main 與 develop 建置都不注入（W5-35 關閉態）', () => {
    expect(POSTHOG_KEYS.production).toBe(PLACEHOLDER_POSTHOG_KEY);
    expect(POSTHOG_KEYS.develop).toBe(PLACEHOLDER_POSTHOG_KEY);
    expect(resolvePosthogTarget({ CF_PAGES_BRANCH: 'main' }).key).toBeNull();
    expect(resolvePosthogTarget({ CF_PAGES_BRANCH: 'develop' }).key).toBeNull();
  });

  it('main 分支建置用正式 project key', () => {
    expect(resolvePosthogTarget({ CF_PAGES_BRANCH: 'main' }, REAL_KEYS).key).toBe('phc_prod_real');
  });

  it('develop 與其他預覽分支建置用 develop project key', () => {
    expect(resolvePosthogTarget({ CF_PAGES_BRANCH: 'develop' }, REAL_KEYS).key).toBe('phc_dev_real');
    expect(resolvePosthogTarget({ CF_PAGES_BRANCH: 'feature/x' }, REAL_KEYS).key).toBe(
      'phc_dev_real',
    );
  });

  it('沒有 CF_PAGES_BRANCH 的本機建置不注入', () => {
    expect(resolvePosthogTarget({}, REAL_KEYS).key).toBeNull();
  });

  it('VITE_ANALYTICS=off 時即使在 main 也不注入', () => {
    expect(
      resolvePosthogTarget({ CF_PAGES_BRANCH: 'main', VITE_ANALYTICS: 'off' }, REAL_KEYS).key,
    ).toBeNull();
  });

  it('外部明確指定 Supabase project（journey）時不注入，即使在 develop 分支', () => {
    expect(
      resolvePosthogTarget({ CF_PAGES_BRANCH: 'develop', explicitSupabaseProject: true }, REAL_KEYS)
        .key,
    ).toBeNull();
  });

  it('phc_test_ 前綴的假 key 可在無 CF 分支時覆寫', () => {
    expect(resolvePosthogTarget({ VITE_POSTHOG_KEY: 'phc_test_fake' }, REAL_KEYS).key).toBe(
      'phc_test_fake',
    );
  });

  it('非 phc_test_ 前綴的 VITE_POSTHOG_KEY 在 CF 建置下被忽略', () => {
    expect(
      resolvePosthogTarget({ CF_PAGES_BRANCH: 'main', VITE_POSTHOG_KEY: 'phc_other' }, REAL_KEYS)
        .key,
    ).toBe('phc_prod_real');
  });

  it('非 phc_test_ 前綴的 VITE_POSTHOG_KEY 在無 CF 分支時也不啟用', () => {
    expect(resolvePosthogTarget({ VITE_POSTHOG_KEY: 'phc_other' }, REAL_KEYS).key).toBeNull();
  });

  it('假 key 也服從 off 開關與 journey 排除', () => {
    expect(
      resolvePosthogTarget({ VITE_POSTHOG_KEY: 'phc_test_fake', VITE_ANALYTICS: 'off' }, REAL_KEYS)
        .key,
    ).toBeNull();
    expect(
      resolvePosthogTarget(
        { VITE_POSTHOG_KEY: 'phc_test_fake', explicitSupabaseProject: true },
        REAL_KEYS,
      ).key,
    ).toBeNull();
  });

  it('假 key 本身是佔位值時視為未設定', () => {
    expect(
      resolvePosthogTarget({ CF_PAGES_BRANCH: 'main' }, { production: PLACEHOLDER_POSTHOG_KEY, develop: 'x' })
        .key,
    ).toBeNull();
  });
});
