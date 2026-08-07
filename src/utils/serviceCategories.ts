/** 階段 1 stub——只求型別過,行為留空(TDD 紅燈期)。 */

export const CUSTOM_CATEGORY_SENTINEL = '__custom__';
export const CUSTOM_CATEGORY_MAX_LENGTH = 10;

export function normalizeCategoryInput(raw: string): string {
  return raw;
}

export function findCanonicalCategory(_raw: string, _known: readonly string[]): string | null {
  return null;
}

export interface CustomCategoryResult {
  value: string;
  error: string | null;
  matchedExisting: string | null;
}

export function validateCustomCategory(
  _raw: string,
  _known: readonly string[],
): CustomCategoryResult {
  return { value: '', error: null, matchedExisting: null };
}

export interface CategoryUsageRow {
  category: string;
  listing_count: number;
}

export function deriveCustomCategories(_rows: readonly CategoryUsageRow[]): string[] {
  return [];
}

export function allKnownCategories(
  _customCategories: readonly string[],
  _current?: string,
): string[] {
  return [];
}
