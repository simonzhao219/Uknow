import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_POSTHOG_KEY } from '../../../config/posthogTarget';
import { analyticsEnabled } from './analyticsGate';

describe('佔位 key 前綴一致性', () => {
  it('config 的佔位值在執行期 gate 視為停用', () => {
    expect(analyticsEnabled(PLACEHOLDER_POSTHOG_KEY)).toBe(false);
  });
});
