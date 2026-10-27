import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { CategoryBadge } from './common/CategoryBadge';
import { LoadErrorCallout } from './common/LoadErrorCallout';
import {
  ArrowLeft,
  MapPin,
  Instagram,
  MessageCircle,
  Facebook,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { PhotoCarousel } from './listing/PhotoCarousel';
import { GenderBadge } from './common/GenderBadge';
import { createClient } from '../utils/supabase/client';
import { useNotification } from './notifications/NotificationContext';
import { openExternalLink } from '../utils/externalLink';
import { resolveDocBackTarget } from '../utils/backNavigation';
import { useLatestRequest } from '../hooks/useLatestRequest';
import type { PublicListingRow } from '../types/listing';

// 「真的沒有這筆」只有兩種：.single() 對零列回 PGRST116；id 不是合法 uuid（分享連結被
// 截斷、手打錯）回 22P02。其餘（網路、5xx、沒有資料也沒有錯誤碼的怪回應）是暫時讀不到——
// 從 LINE 分享連結進來的訪客遇到這種失敗，不能被告知「找不到」，要給重試。
const NOT_FOUND_CODES = new Set(['PGRST116', '22P02']);

type LoadStatus = 'loading' | 'ready' | 'notFound' | 'error';

export function ServiceProviderDetail() {
  const { showToast } = useNotification();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [serviceProvider, setServiceProvider] = useState<PublicListingRow | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  // 只認最後一次請求：id 在途切換時，前一筆的晚到回應不得蓋掉後一筆。
  const request = useLatestRequest();

  // 重試只重發這一支請求，不整頁重載（reload 會重開整個 SPA、白畫面閃爍）。
  const fetchListing = useCallback(async () => {
    if (!id) return;
    const ticket = request.begin();
    setStatus('loading');
    try {
      const supabase = createClient();
      const { data: listing, error: queryError } = await supabase
        .from('public_listings')
        .select('*')
        .eq('id', id)
        .single();
      if (!request.isLatest(ticket)) return;

      if (queryError && NOT_FOUND_CODES.has(queryError.code)) {
        setStatus('notFound');
        return;
      }
      if (queryError) throw queryError;
      if (!listing) throw new Error('回應沒有刊登資料');
      setServiceProvider(listing);
      setStatus('ready');
    } catch (error) {
      if (!request.isLatest(ticket)) return;
      console.error('❌ 獲取刊登詳情失敗:', error);
      setStatus('error');
    }
  }, [id, request]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  // 焦點跟著使用者的重試走（ui-ux-guidelines §9 焦點後備落點）：錯誤框一換成骨架，按下的
  // 「重試」就卸載了，焦點掉到 body、骨架期間報讀器無聲。按下重試時把焦點交給骨架（名稱
  // 即播報字）；落地時骨架也卸載了，焦點若已掉到 body 就交給錯誤框或頁面標題。首次載入
  // 不搶焦點。
  const focusAfterLoad = useRef(false);
  const skeletonRef = useRef<HTMLOutputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const notFoundRef = useRef<HTMLHeadingElement>(null);

  const handleRetry = () => {
    focusAfterLoad.current = true;
    fetchListing();
  };

  useEffect(() => {
    if (!focusAfterLoad.current) return;
    if (status === 'loading') {
      skeletonRef.current?.focus();
      return;
    }
    focusAfterLoad.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const target = { error: errorRef, ready: headingRef, notFound: notFoundRef }[status];
    target.current?.focus();
  }, [status]);

  // 頁首返回圖示鈕（全站同款，§12.13）。去向與 MarkdownContent 同一個決策來源：從 LINE
  // 分享連結直接開進來時站內沒有上一頁（location.key 是 'default'），navigate(-1) 會離開
  // 網站或沒反應，改回首頁。不用 useBackNavigation——它的層級表把 /service-providers/*
  // 對到會員中心，訪客進不去。
  const backTarget = resolveDocBackTarget(location.key);
  const backButton = (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => (typeof backTarget === 'number' ? navigate(backTarget) : navigate(backTarget))}
      className="shrink-0"
      aria-label={typeof backTarget === 'number' ? '返回上一頁' : '回首頁'}
    >
      <ArrowLeft className="h-5 w-5" />
    </Button>
  );

  if (status === 'notFound') {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <h2
          ref={notFoundRef}
          tabIndex={-1}
          className="text-2xl font-bold mb-4 scroll-mt-20 outline-none"
        >
          找不到此服務者
        </h2>
        {/* 找不到頁面唯一的出路＝流程鈕；手機整寬、桌機文字寬（§12.11） */}
        <Button onClick={() => navigate('/')} className="w-full md:w-auto">
          返回首頁
        </Button>
      </div>
    );
  }

  if (status !== 'ready' || !serviceProvider) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {backButton}
        {status === 'error' ? (
          // 暫時讀不到＝「錯誤但可重試」（LoadErrorCallout，§12.11）；ref 是重試後的焦點落點。
          <LoadErrorCallout
            ref={errorRef}
            titleAs="h2"
            title="暫時無法載入服務者資料"
            description="可能是網路不穩，請再試一次。"
            retryLabel="重試"
            onRetry={handleRetry}
          />
        ) : (
          <DetailSkeleton outputRef={skeletonRef} />
        )}
      </div>
    );
  }

  const handleContactClick = (platform: string, value: string) => {
    let url = '';
    switch (platform) {
      case 'instagram':
        url = `https://instagram.com/${value.replace('@', '')}`;
        break;
      case 'line':
        url = `https://line.me/R/ti/p/${value}`;
        break;
      case 'facebook':
        url = `https://facebook.com/${value}`;
        break;
    }
    if (url) {
      openExternalLink(url);
    }
  };

  const copyLineId = (lineId: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = lineId;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('LINE ID 已複製！', 'success');
    } catch (err) {
      console.error('複製失敗:', err);
      showToast('複製失敗，請重試', 'error');
    }
    document.body.removeChild(textArea);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {backButton}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 圖片區域：正方形輪播（Instagram 式），結構與 DetailSkeleton 第一欄同形 */}
        <PhotoCarousel photos={serviceProvider.photos} name={serviceProvider.name} />

        {/* 詳細資訊區域 */}
        <div className="space-y-6">
          {/* 標題列照全站畫面稿：名稱與性別徽章兩端對齊，類別灰 chip 在下一行。名稱
              換行不截斷——訪客要看到完整名稱（上限 10 字，NAME_MAX_LENGTH）。類別與
              性別是分類標記，不上重色（§12.5 (b)）。 */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="min-w-0 text-2xl md:text-3xl font-bold scroll-mt-20 outline-none"
              >
                {serviceProvider.name}
              </h1>
              <GenderBadge gender={serviceProvider.gender} className="mt-1.5 md:mt-2" />
            </div>
            {/* flex（不是 inline-flex）：徽章自成一個區塊，不坐在行盒裡多吃 3px 行高 */}
            <CategoryBadge category={serviceProvider.category} className="flex w-fit" />
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>
                {serviceProvider.city}{' '}
                {serviceProvider.districts.includes('全區')
                  ? '全區'
                  : serviceProvider.districts.join(', ')}
              </span>
            </div>
          </div>

          {/* 服務介紹 */}
          <Card>
            <CardHeader>
              <CardTitle>服務介紹</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {serviceProvider.description}
              </p>
            </CardContent>
          </Card>

          {/* 聯絡方式 */}
          <Card>
            <CardHeader>
              <CardTitle>聯絡方式</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 聯絡鈕的文字是使用者貼上的帳號或原始網址，不截斷、只換行：按鈕自帶
                  whitespace-nowrap 與固定高度，這裡改回可換行、高度隨內容。 */}
              {/* Facebook 藍／Instagram 粉／LINE 綠：第三方品牌識別色，S2 色彩
                  收斂（D3）刻意排除在外——業界慣例是保留品牌色以利使用者一眼
                  找到聯絡方式，不受「彩色只留語義色」規則約束（見
                  scripts/color-usage-baseline.json 對這個檔案的 baseline 條目）。 */}
              {serviceProvider.contacts.facebook && (
                <Button
                  tone="secondary"
                  className="w-full h-auto justify-start whitespace-normal"
                  onClick={() => handleContactClick('facebook', serviceProvider.contacts.facebook)}
                >
                  <Facebook className="h-5 w-5 mr-3 text-blue-600" />
                  <span className="min-w-0 flex-1 text-left wrap-anywhere">
                    {serviceProvider.contacts.facebook}
                  </span>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}

              {serviceProvider.contacts.instagram && (
                <Button
                  tone="secondary"
                  className="w-full h-auto justify-start whitespace-normal"
                  onClick={() =>
                    handleContactClick('instagram', serviceProvider.contacts.instagram)
                  }
                >
                  <Instagram className="h-5 w-5 mr-3 text-pink-500" />
                  <span className="min-w-0 flex-1 text-left wrap-anywhere">
                    {serviceProvider.contacts.instagram}
                  </span>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}

              {serviceProvider.contacts.line && (
                <Button
                  tone="secondary"
                  className="w-full h-auto justify-start whitespace-normal"
                  onClick={() => copyLineId(serviceProvider.contacts.line)}
                >
                  <MessageCircle className="h-5 w-5 mr-3 text-green-500" />
                  <span className="min-w-0 flex-1 text-left wrap-anywhere">
                    {serviceProvider.contacts.line}
                  </span>
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const CONTACT_KEYS = ['c1', 'c2', 'c3'];

/**
 * 詳情頁骨架：沿用實際內容的同一組 grid（手機單欄、lg 起兩欄），資料到位時版面不跳
 * （ui-ux-guidelines §5；位置由 e2e `test_public_skeleton_layout.py` 實測把關）。第一欄
 * 是「正方形＋一列與圓點列同高（h-6）的空白」：刊登表單要求剛好 MAX_PHOTO_COUNT 張，所以一般
 * 刊登載入後都有圓點列（資料層 `photos` 沒有數量約束，只有一張的刊登沒有圓點列、會上移 24px）。
 *
 * 外層是 `<output>`（隱含 role="status"）＋名稱＋`aria-busy`，比照後台的
 * `AdminListSkeleton`；裡面只用 div，不放 heading，免得報讀器把骨架當成已載入的內容。
 * `tabIndex={-1}`：使用者按重試時焦點交給它（名稱即播報字），見元件裡的焦點落點。
 */
function DetailSkeleton({ outputRef }: { outputRef: Ref<HTMLOutputElement> }) {
  return (
    <output
      ref={outputRef}
      tabIndex={-1}
      aria-label="載入服務者詳情中"
      aria-busy="true"
      className="block scroll-mt-20 outline-none"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <Skeleton className="aspect-square w-full rounded-lg" />
          <div className="h-6" />
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-8 md:h-9 w-1/2" />
              <Skeleton className="mt-1.5 md:mt-2 h-[22px] w-10" />
            </div>
            <Skeleton className="h-[22px] w-14" />
            <Skeleton className="h-6 w-2/3" />
          </div>

          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            {/* 內文 leading-relaxed：一行 26px，三行約等於一般長度的服務介紹 */}
            <CardContent className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent className="space-y-3">
              {CONTACT_KEYS.map((key) => (
                // 聯絡鈕 h-auto＋py-2：滑鼠 38px，觸控 44px
                <Skeleton key={key} className="h-[38px] pointer-coarse:h-11 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </output>
  );
}
