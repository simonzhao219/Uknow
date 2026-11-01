// T1-B stub
export async function endInvalidSession(_deps: {
  auth: { signOut(opts?: { scope?: 'global' | 'local' | 'others' }): Promise<unknown> };
  storage?: Storage | null;
}): Promise<void> {}
