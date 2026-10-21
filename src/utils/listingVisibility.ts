export type ListingVisibility = 'visible' | 'hidden' | 'unknown';

export function listingVisibility(
  _subscription: { status?: 'active' | 'expired' } | null | undefined,
): ListingVisibility {
  return 'unknown';
}
