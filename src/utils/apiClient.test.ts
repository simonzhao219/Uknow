import { describe, it, expect } from 'vitest';
import { buildApiUrl } from './apiClient';
import { projectId } from './supabase/info';

const BASE = `https://${projectId}.supabase.co/functions/v1/api`;

describe('buildApiUrl', () => {
  it('appends a path that already has a leading slash', () => {
    expect(buildApiUrl('/rewards')).toBe(`${BASE}/rewards`);
  });

  it('adds the leading slash when the path lacks one', () => {
    expect(buildApiUrl('rewards')).toBe(`${BASE}/rewards`);
  });

  it('does not double the slash', () => {
    expect(buildApiUrl('/listings/upload-photo')).toBe(`${BASE}/listings/upload-photo`);
  });

  it('handles an empty path as the api root', () => {
    expect(buildApiUrl('')).toBe(`${BASE}/`);
  });
});
