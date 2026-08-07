// @vitest-environment jsdom
//
// 掃碼核身頁的「連續掃描」契約。
//
// bug 的形狀：解碼迴圈掃到碼就 `return`，不再排下一個 animation frame——
// 迴圈自我終止。而「繼續掃描下一位」只重設 React state，沒有任何機制把迴圈
// 接回去（擁有迴圈的 useEffect 相依 `[verifyToken]`，那是 `useCallback([])`
// 的常數，永遠不會重跑）。相機串流仍在播，畫面看起來正常，實際上第一次之後
// 再也不解碼——現場症狀就是「按了繼續完全沒反應」。
//
// 修法是讓迴圈永遠活著、改用「暫停」旗標控制解不解碼。這使兩件事變成
// 新的載重契約，兩者都在下面釘住：(1) 結果顯示期間不能繼續吃影格，
// 否則 60fps 打爆核身 API；(2) 核身成功的同一張碼還在鏡頭前時不能重複觸發，
// 否則按下繼續的當幀又跳出同一個人、並多寫一筆稽核。
//
// jsdom 沒有相機也沒有 canvas 2D context，所以整條硬體鏈路（getUserMedia /
// video 解碼狀態 / getImageData）都被替身接管，rAF 也換成可手動推進的佇列，
// 讓「第幾影格發生什麼」變成確定性的。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const jsQR = vi.hoisted(() => vi.fn());
vi.mock('jsqr', () => ({ default: jsQR }));

const apiRequestJson = vi.hoisted(() => vi.fn());
vi.mock('../../utils/apiClient', () => ({
  apiRequestJson,
  buildApiUrl: (path: string) => `https://api.test${path}`,
}));

const { MemberVerifyScanner } = await import('./MemberVerifyScanner');

const ACTIVE_MEMBER = {
  displayName: '四米特 阿里哈',
  status: 'active' as const,
  activeUntil: '2027-07-25T00:00:00.000Z',
};

/** 待執行的 animation frame callback；由 flushFrame() 手動推進。 */
let frames: FrameRequestCallback[] = [];
const trackStop = vi.fn();

function stubProperty(target: object, key: string, get: () => unknown) {
  Object.defineProperty(target, key, { configurable: true, get });
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }),
    },
  });

  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    writable: true,
    value: null,
  });
  stubProperty(HTMLMediaElement.prototype, 'readyState', () => 4); // HAVE_ENOUGH_DATA
  stubProperty(HTMLVideoElement.prototype, 'videoWidth', () => 8);
  stubProperty(HTMLVideoElement.prototype, 'videoHeight', () => 8);
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
  })) as unknown as HTMLCanvasElement['getContext'];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** 掛載元件並等到解碼迴圈排上第一個影格（相機初始化是 async 的）。 */
async function mountScanner() {
  render(
    <MemoryRouter>
      <MemberVerifyScanner />
    </MemoryRouter>,
  );
  await waitFor(() => expect(frames.length).toBeGreaterThan(0));
}

/** 推進一個影格：跑掉目前排隊的 callback，讓它們有機會排下一個。 */
async function flushFrame() {
  const pending = frames;
  frames = [];
  await act(async () => {
    for (const cb of pending) cb(0);
  });
}

function clickScanNext() {
  fireEvent.click(screen.getByRole('button', { name: '繼續掃描下一位' }));
}

describe('MemberVerifyScanner', () => {
  it('按「繼續掃描下一位」後，下一個人的 QR 仍會被解碼並送出核身', async () => {
    apiRequestJson.mockResolvedValue({ success: true, data: ACTIVE_MEMBER });
    jsQR.mockReturnValue({ data: 'token-a' });

    await mountScanner();
    await flushFrame();
    await screen.findByTestId('verify-result');
    expect(apiRequestJson).toHaveBeenCalledTimes(1);

    clickScanNext();
    jsQR.mockReturnValue({ data: 'token-b' });
    await flushFrame();

    await waitFor(() => expect(apiRequestJson).toHaveBeenCalledTimes(2));
  });

  it('核身結果還顯示在畫面上時，後續影格不再送出核身請求', async () => {
    apiRequestJson.mockResolvedValue({ success: true, data: ACTIVE_MEMBER });
    jsQR.mockReturnValue({ data: 'token-a' });

    await mountScanner();
    await flushFrame();
    await screen.findByTestId('verify-result');

    await flushFrame();
    await flushFrame();

    expect(apiRequestJson).toHaveBeenCalledTimes(1);
  });

  it('已核身成功的同一張 QR 還在鏡頭前時，按繼續不會重複送出核身', async () => {
    apiRequestJson.mockResolvedValue({ success: true, data: ACTIVE_MEMBER });
    jsQR.mockReturnValue({ data: 'token-a' }); // 鏡頭沒移開，一直解到同一張

    await mountScanner();
    await flushFrame();
    await screen.findByTestId('verify-result');

    clickScanNext();
    await flushFrame();
    await flushFrame();

    expect(apiRequestJson).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('verify-result')).toBeNull();
  });

  it('核身失敗後按繼續，同一張 QR 可以再送一次重試', async () => {
    apiRequestJson.mockRejectedValueOnce(new Error('核身碼已過期，請會員重新出示'));
    jsQR.mockReturnValue({ data: 'token-a' });

    await mountScanner();
    await flushFrame();
    await screen.findByText('核身碼已過期，請會員重新出示');

    apiRequestJson.mockResolvedValue({ success: true, data: ACTIVE_MEMBER });
    clickScanNext();
    await flushFrame();

    await screen.findByTestId('verify-result');
    expect(apiRequestJson).toHaveBeenCalledTimes(2);
  });
});
