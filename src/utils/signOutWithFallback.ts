export const SIGN_OUT_TIMEOUT_MS = 0;

export async function signOutWithFallback(_auth: {
  signOut: (opts?: { scope?: 'global' | 'local' | 'others' }) => Promise<unknown>;
}): Promise<{ localOnly: boolean }> {
  return { localOnly: false };
}
