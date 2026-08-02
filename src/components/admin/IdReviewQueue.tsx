import type { AdminIdReview } from '@contract';

export interface IdReviewQueueProps {
  /** 取回審核佇列。注入而非直接呼叫 apiClient——與 ReferralTreeView 同慣例。 */
  loadReviews: () => Promise<AdminIdReview[]>;
  /** 送出審核結果。退回時 reason 必填。 */
  submitReview: (userId: string, approve: boolean, reason?: string) => Promise<void>;
}

export function IdReviewQueue(_props: IdReviewQueueProps) {
  return null;
}
