// @vitest-environment jsdom
//
// 取景框要等於整個方框：量測容器邊長，把它當 cropSize 交給 Cropper，
// 且媒體用 cover 蓋滿（直式照片 zoom 1 時不會左右留灰邊、也不會上下溢出框外）。
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const cropperProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));
vi.mock('react-easy-crop', () => ({
  default: (props: Record<string, unknown>) => {
    cropperProps.last = props;
    return <div data-testid="cropper" />;
  },
}));

// 容器被觀察時，立刻回報 300×300（jsdom 沒有版面，這裡給定尺寸）。
globalThis.ResizeObserver = class {
  constructor(private cb: ResizeObserverCallback) {}
  observe() {
    this.cb(
      [{ contentRect: { width: 300, height: 300 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

import PhotoCropDialog from './PhotoCropDialog';

afterEach(cleanup);

describe('PhotoCropDialog 取景框', () => {
  it('把量到的容器邊長當成 cropSize 交給 Cropper（取景框即整個方框）', async () => {
    render(
      <PhotoCropDialog ordinal={1} previewUrl="blob:p" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    await screen.findByTestId('cropper');
    expect(cropperProps.last?.cropSize).toEqual({ width: 300, height: 300 });
  });

  it('媒體用 cover 蓋滿取景框，最小縮放為 1', async () => {
    render(
      <PhotoCropDialog ordinal={1} previewUrl="blob:p" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    await screen.findByTestId('cropper');
    expect(cropperProps.last?.objectFit).toBe('cover');
    expect(cropperProps.last?.minZoom).toBe(1);
    expect(cropperProps.last?.aspect).toBe(1);
  });
});
