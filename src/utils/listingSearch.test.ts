import { describe, expect, it } from 'vitest';
import { listingMatchesSearch, type SearchableListing } from './listingSearch';

const listing: SearchableListing = {
  name: '王小明',
  description: '專營到府服務，可預約假日',
  category: '寵物美容',
};

describe('listingMatchesSearch', () => {
  it('空字串不套用搜尋條件', () => {
    expect(listingMatchesSearch('', listing)).toBe(true);
  });

  it('只有空白的關鍵字不套用搜尋條件', () => {
    expect(listingMatchesSearch('   ', listing)).toBe(true);
  });

  it('命中服務者名稱', () => {
    expect(listingMatchesSearch('王小明', listing)).toBe(true);
  });

  it('命中服務介紹', () => {
    expect(listingMatchesSearch('到府', listing)).toBe(true);
  });

  // 搜尋框的 placeholder 承諾「名稱、服務內容或標籤」，category 卻不在
  // 比對範圍內——這支測試是那個承諾的斷言。
  it('命中服務類別（自訂類別被收合時，搜尋是它的第二條入口）', () => {
    expect(listingMatchesSearch('寵物美容', listing)).toBe(true);
  });

  it('命中內建服務類別', () => {
    expect(listingMatchesSearch('美髮', { ...listing, category: '美髮' })).toBe(true);
  });

  it('三個欄位都沒有的字串不命中', () => {
    expect(listingMatchesSearch('水電', listing)).toBe(false);
  });

  it('關鍵字前後空白會被去除再比對', () => {
    expect(listingMatchesSearch('  寵物美容  ', listing)).toBe(true);
  });

  it('英文比對不分大小寫', () => {
    expect(listingMatchesSearch('spa', { ...listing, category: 'SPA' })).toBe(true);
  });

  it('欄位缺值時不整筆略過，其餘欄位照樣比對', () => {
    const partial = { name: '王小明', description: '', category: '寵物美容' };
    expect(listingMatchesSearch('寵物美容', partial)).toBe(true);
  });

  it('關鍵字跨欄位時不命中（欄位以空白相接，不是同一串連續文字）', () => {
    expect(listingMatchesSearch('王小明專營', listing)).toBe(false);
  });
});
