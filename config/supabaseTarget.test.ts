import { describe, expect, it } from 'vitest';
import { projectId as productionProjectId } from '../src/utils/supabase/info';
import { DEVELOP_SUPABASE, resolveSupabaseTarget } from './supabaseTarget';

describe('resolveSupabaseTarget', () => {
  it('main 分支不注入，沿用 info.tsx 的正式站', () => {
    expect(resolveSupabaseTarget({ CF_PAGES_BRANCH: 'main' })).toBeNull();
  });

  it('本機建置（無 CF_PAGES_BRANCH）不注入，行為與過去相同', () => {
    expect(resolveSupabaseTarget({})).toBeNull();
  });

  it('develop 分支指向 develop 的 Supabase 分支 DB', () => {
    expect(resolveSupabaseTarget({ CF_PAGES_BRANCH: 'develop' })).toEqual(DEVELOP_SUPABASE);
  });

  it('feature／claude 預覽分支同樣指向 develop——只有 main 打正式站', () => {
    for (const branch of ['feature/x', 'fix/y', 'claude/rewards-filter-layout-design-md0x0q']) {
      expect(resolveSupabaseTarget({ CF_PAGES_BRANCH: branch })).toEqual(DEVELOP_SUPABASE);
    }
  });

  it('明確指定的 VITE_SUPABASE_PROJECT_ID 優先（journey 指向拋棄式分支不可被蓋掉）', () => {
    expect(
      resolveSupabaseTarget({
        VITE_SUPABASE_PROJECT_ID: 'journeytmpbranchref',
        CF_PAGES_BRANCH: 'develop',
      }),
    ).toBeNull();
  });

  it('develop 目標不得等於正式站專案——這是整個規則存在的理由', () => {
    expect(DEVELOP_SUPABASE.projectId).not.toBe(productionProjectId);
    const target = resolveSupabaseTarget({ CF_PAGES_BRANCH: 'develop' });
    expect(target?.projectId).not.toBe(productionProjectId);
  });
});
