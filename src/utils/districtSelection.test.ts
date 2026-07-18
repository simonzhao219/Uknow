import { describe, it, expect } from 'vitest';
import { handleDistrictSelection, sortDistrictsWithAllFirst } from './districtSelection';

const AVAILABLE = ['中正區', '大同區', '中山區'];

describe('handleDistrictSelection', () => {
  it('checking 全區 selects 全區 plus every available district', () => {
    const result = handleDistrictSelection([], AVAILABLE, '全區', true);
    expect(result).toEqual(['全區', ...AVAILABLE]);
  });

  it('unchecking 全區 clears everything', () => {
    const result = handleDistrictSelection(['全區', ...AVAILABLE], AVAILABLE, '全區', false);
    expect(result).toEqual([]);
  });

  it('checking a specific district adds it', () => {
    const result = handleDistrictSelection([], AVAILABLE, '中正區', true);
    expect(result).toEqual(['中正區']);
  });

  it('checking the last remaining specific district auto-adds 全區', () => {
    const result = handleDistrictSelection(['中正區', '大同區'], AVAILABLE, '中山區', true);
    // all three specifics selected → 全區 auto-added, sorted first
    expect(result[0]).toBe('全區');
    expect(new Set(result)).toEqual(new Set(['全區', ...AVAILABLE]));
  });

  it('unchecking one specific district also drops 全區', () => {
    const result = handleDistrictSelection(['全區', ...AVAILABLE], AVAILABLE, '中山區', false);
    expect(result).not.toContain('全區');
    expect(result).not.toContain('中山區');
    expect(new Set(result)).toEqual(new Set(['中正區', '大同區']));
  });

  it('checking an already-selected district does not duplicate it', () => {
    const result = handleDistrictSelection(['中正區'], AVAILABLE, '中正區', true);
    expect(result).toEqual(['中正區']);
  });

  it('does not mutate the input array', () => {
    const current = ['中正區'];
    handleDistrictSelection(current, AVAILABLE, '大同區', true);
    expect(current).toEqual(['中正區']);
  });
});

describe('sortDistrictsWithAllFirst', () => {
  it('returns an empty array unchanged', () => {
    expect(sortDistrictsWithAllFirst([])).toEqual([]);
  });

  it('keeps 全區 at index 0', () => {
    expect(sortDistrictsWithAllFirst(['中正區', '全區', '大同區'])).toEqual([
      '全區',
      '中正區',
      '大同區',
    ]);
  });

  it('preserves order of specifics when 全區 is absent', () => {
    expect(sortDistrictsWithAllFirst(['大同區', '中正區'])).toEqual(['大同區', '中正區']);
  });

  it('collapses duplicate 全區 entries to one', () => {
    expect(sortDistrictsWithAllFirst(['全區', '中正區', '全區'])).toEqual(['全區', '中正區']);
  });
});
