// @vitest-environment jsdom
//
// 會員驗證頁的「連續掃描」契約。
//
// bug 的形狀：解碼迴圈掃到碼就 `return`，不再排下一個 animation frame——
// 迴圈自我終止。而「繼續掃描下一位」只重設 React state，沒有任何機制把迴圈
// 接回去（擁有迴圈的 useEffect 相依 `[verifyToken]`，那是 `useCallback([])`
// 的常數，永遠不會重跑）。相機串流仍在播，畫面看起來正常，實際上第一次之後
// 再也不解碼——現場症狀就是「按了繼續完全沒反應」。
//
// 修法是讓迴圈永遠活著、改用「暫停」旗標控制解不解碼。這使兩件事變成
// 新的載重契約，兩者都在下面釘住：(1) 結果顯示期間不能繼續吃影格，
// 否則 60fps 打爆驗證 API；(2) 驗證成功的同一張碼還在鏡頭前時不能重複觸發，
// 否則按下繼續的當幀又跳出同一個人、並多寫一筆稽核。
//
// jsdom 沒有相機也沒有 canvas 2D context，所以整條硬體鏈路（getUserMedia /
// video 解碼狀態 / getImageData）都被替身接管，rAF 也換成可手動推進的佇列，
// 讓「第幾影格發生什麼」變成確定性的。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const jsQR = vi.hoisted(() => vi.fn());
vi.mock('jsqr', () => ({ default: jsQR }));

// 震動的樣式細節由 haptics 自己的測試釘住；這裡只驗「哪一種結果配哪一種回饋」。
const hapticSuccess = vi.hoisted(() => vi.fn());
const hapticAlert = vi.hoisted(() => vi.fn());
vi.mock('../../utils/haptics', () => ({ hapticSuccess, hapticAlert }));

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

const EXPIRED_MEMBER = {
  displayName: '四米特 阿里哈',
  status: 'expired' as const,
  activeUntil: '2024-01-01T00:00:00.000Z',
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

/** 掛載並退回手動輸入模式（相機不可用時沒有解碼迴圈，等不到影格）。 */
async function mountManualScanner() {
  (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
    new Error('permission denied'),
  );
  render(
    <MemoryRouter>
      <MemberVerifyScanner />
    </MemoryRouter>,
  );
  await screen.findByLabelText('驗證碼');
}

function clickScanNext() {
  fireEvent.click(screen.getByRole('button', { name: '繼續掃描下一位' }));
}

describe('MemberVerifyScanner', () => {
  it('按「繼續掃描下一位」後，下一個人的 QR 仍會被解碼並送出驗證', async () => {
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

  it('驗證結果還顯示在畫面上時，後續影格不再送出驗證請求', async () => {
    apiRequestJson.mockResolvedValue({ success: true, data: ACTIVE_MEMBER });
    jsQR.mockReturnValue({ data: 'token-a' });

    await mountScanner();
    await flushFrame();
    await screen.findByTestId('verify-result');

    await flushFrame();
    await flushFrame();

    expect(apiRequestJson).toHaveBeenCalledTimes(1);
  });

  it('已驗證成功的同一張 QR 還在鏡頭前時，按繼續不會重複送出驗證', async () => {
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

  it('驗證失敗後按繼續，同一張 QR 可以再送一次重試', async () => {
    apiRequestJson.mockRejectedValueOnce(new Error('驗證碼已過期，請會員重新出示'));
    jsQR.mockReturnValue({ data: 'token-a' });

    await mountScanner();
    await flushFrame();
    await screen.findByText('驗證碼已過期，請會員重新出示');

    apiRequestJson.mockResolvedValue({ success: true, data: ACTIVE_MEMBER });
    clickScanNext();
    await flushFrame();

    await screen.findByTestId('verify-result');
    expect(apiRequestJson).toHaveBeenCalledTimes(2);
  });

  describe('結果呈現與回饋', () => {
    // 手機上的原始症狀：掃到碼之後結果落在第一屏之外，店家要往下滑才看得到
    // 「這個人會籍有沒有效」——而那是這頁存在的唯一理由。根因是取景框沒有
    // 高度上限（w-full × 相機原生比例，390px 寬即 520~693px 高），把結果卡
    // 擠出視窗。修法是讓結果**疊在取景框上**、不佔流排版高度。
    //
    // jsdom 不套用 Tailwind，量不出真實版面，所以「不需捲動」測不到。
    // 這裡能釘的是它的結構前提：結果與繼續鈕都在取景容器**之內**。
    // 一旦有人把它們搬回取景框外的流排版，症狀就會原樣回來。
    it('驗證結果與繼續鈕都渲染在取景框容器之內', async () => {
      apiRequestJson.mockResolvedValue({ success: true, data: ACTIVE_MEMBER });
      jsQR.mockReturnValue({ data: 'token-a' });

      await mountScanner();
      await flushFrame();
      await screen.findByTestId('verify-result');

      const viewport = within(screen.getByTestId('scanner-viewport'));
      expect(viewport.getByTestId('verify-result')).toBeTruthy();
      expect(viewport.getByRole('button', { name: '繼續掃描下一位' })).toBeTruthy();
    });

    it('會籍有效時送出成功震動', async () => {
      apiRequestJson.mockResolvedValue({ success: true, data: ACTIVE_MEMBER });
      jsQR.mockReturnValue({ data: 'token-a' });

      await mountScanner();
      await flushFrame();
      await screen.findByTestId('verify-result');

      expect(hapticSuccess).toHaveBeenCalledTimes(1);
      expect(hapticAlert).not.toHaveBeenCalled();
    });

    it('會籍已過期時送出警示震動而非成功震動', async () => {
      // 驗證成功（API 有回）不等於這個人可以進場。兩者若震得一樣，
      // 不看螢幕的店家會把「已過期」當成「有效」放行。
      apiRequestJson.mockResolvedValue({ success: true, data: EXPIRED_MEMBER });
      jsQR.mockReturnValue({ data: 'token-a' });

      await mountScanner();
      await flushFrame();
      await screen.findByTestId('verify-result');

      expect(hapticAlert).toHaveBeenCalledTimes(1);
      expect(hapticSuccess).not.toHaveBeenCalled();
    });

    it('驗證碼無效導致驗證失敗時送出警示震動', async () => {
      apiRequestJson.mockRejectedValue(new Error('驗證碼已過期，請會員重新出示'));
      jsQR.mockReturnValue({ data: 'token-a' });

      await mountScanner();
      await flushFrame();
      await screen.findByText('驗證碼已過期，請會員重新出示');

      expect(hapticAlert).toHaveBeenCalledTimes(1);
      expect(hapticSuccess).not.toHaveBeenCalled();
    });

    it('相機不可用而退手動輸入時，結果與繼續鈕仍然顯示', async () => {
      // 結果三態只有一份節點，兩種模式共用。手動輸入模式沒有取景框可依附，
      // 若結果只活在 overlay 裡，這條路徑會靜默地什麼都不顯示。
      apiRequestJson.mockResolvedValue({ success: true, data: ACTIVE_MEMBER });

      await mountManualScanner();
      fireEvent.change(screen.getByLabelText('驗證碼'), { target: { value: 'token-a' } });
      fireEvent.click(screen.getByRole('button', { name: '驗證' }));

      await screen.findByTestId('verify-result');
      expect(screen.queryByTestId('scanner-viewport')).toBeNull();
      expect(screen.getByRole('button', { name: '繼續掃描下一位' })).toBeTruthy();
    });
  });
});
