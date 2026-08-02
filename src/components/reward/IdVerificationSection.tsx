import type { IdPhotosResponse } from '@contract';

export type IdPhotosData = IdPhotosResponse['data'];

export interface IdVerificationSectionProps {
  /** 取回目前的證件狀態。注入而非直接呼叫 apiClient——與 ReferralTreeView 同慣例。 */
  loadStatus: () => Promise<IdPhotosData>;
  /** 重新上傳證件照。至少要帶一面。 */
  uploadPhotos: (files: { front?: File; back?: File }) => Promise<void>;
}

export function IdVerificationSection(_props: IdVerificationSectionProps) {
  return null;
}
