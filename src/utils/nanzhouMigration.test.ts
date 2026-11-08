import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('../../supabase/migrations/20261114000001_rename_nanzhou_township.sql', import.meta.url),
  'utf8',
);

describe('rename_nanzhou_township migration', () => {
  it('只更新仍含舊值南鄉的刊登，重跑不命中任何列（冪等）', () => {
    expect(sql).toContain("array_replace(districts, '南鄉', '南州鄉')");
    expect(sql).toContain("where '南鄉' = any(districts)");
  });

  it('同一筆刊登已含南州鄉時只移除南鄉，不產生重複的南州鄉', () => {
    expect(sql).toContain("when '南州鄉' = any(districts) then array_remove(districts, '南鄉')");
  });
});
