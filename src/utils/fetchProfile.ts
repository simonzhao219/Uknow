export type ProfileFetchResult =
  | { kind: 'ok'; profile: any }
  | { kind: 'unauthorized'; status: number }
  | { kind: 'transient' };

export interface FetchProfileOptions {
  userId: string;
  force?: boolean;
  timeoutMs?: number;
}

export async function fetchProfile(
  _token: string,
  _opts: FetchProfileOptions,
): Promise<ProfileFetchResult> {
  return { kind: 'transient' };
}

export function clearInflight(): void {}
