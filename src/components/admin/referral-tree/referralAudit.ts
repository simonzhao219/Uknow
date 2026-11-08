// 階段 6 紅燈 stub：純函式在綠燈 commit 實作。
import type {
  AdminReferralAnomalyKind,
  AdminReferralGeneration,
  AdminReferralNode,
} from '@contract';

export type Tone = 'neutral' | 'muted' | 'warning';
export interface Label {
  text: string;
  tone: Tone;
}
export interface LayerState {
  items: AdminReferralNode[];
  total: number;
  pinned: AdminReferralNode | null;
}
export type ExpandStep =
  | { kind: 'top'; ensureId: string }
  | { kind: 'children'; parentId: string; ensureId: string }
  | { kind: 'unplaceable'; ensureId: string };

export const emptyLayer = (): LayerState => ({ items: [], total: 0, pinned: null });
export function appendPage(
  state: LayerState,
  _page: { nodes: AdminReferralNode[]; total: number; pinned: AdminReferralNode | null },
): LayerState {
  return state;
}
export function rowsToRender(_state: LayerState): { node: AdminReferralNode; pinned: boolean }[] {
  return [];
}
export function shownCount(_state: LayerState): number {
  return -1;
}
export function resultLabel(
  _result: AdminReferralGeneration['result'],
  _reason: AdminReferralGeneration['reason'],
): Label {
  return { text: '', tone: 'neutral' };
}
export function anomalyLabel(_kind: AdminReferralAnomalyKind): string {
  return '';
}
export function nodeAnomalyBadges(_kinds: AdminReferralAnomalyKind[]): string[] {
  return [];
}
export function layerLabel(_layer: number | null): string {
  return '';
}
export function unplaceableReasonText(_reason: 'cycle' | 'truncated'): string {
  return '';
}
export function uplineLabel(_index: number): string {
  return '';
}
export function displayName(name: string): string {
  return name;
}
export function withdrawalBlockReason(_node: AdminReferralNode): string | null {
  return null;
}
export function expansionPath(
  _targetId: string,
  _ancestorIds: string[] | null,
  _unplaceableReason: 'cycle' | 'truncated' | null,
): ExpandStep[] | null {
  return [];
}
