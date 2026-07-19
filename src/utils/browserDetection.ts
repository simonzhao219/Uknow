/**
 * 瀏覽器檢測工具
 * 用於檢測使用者是否在內建瀏覽器（In-App Browser / WebView）中存取
 */

export type InAppBrowserPlatform = 'line' | 'facebook' | 'instagram' | 'twitter' | 'wechat' | 'webview' | null;

export interface BrowserDetectionResult {
  isInAppBrowser: boolean;
  platform: InAppBrowserPlatform;
  userAgent: string;
}

/**
 * 檢測是否為內建瀏覽器
 */
export function detectInAppBrowser(): BrowserDetectionResult {
  // 開發測試模式（設為 true 可強制顯示警告頁）
  const FORCE_IN_APP_BROWSER = false;
  
  if (FORCE_IN_APP_BROWSER) {
    return { 
      isInAppBrowser: true, 
      platform: 'line', 
      userAgent: 'test-mode' 
    };
  }
  
  const ua = navigator.userAgent.toLowerCase();
  
  // 排除搜尋引擎爬蟲
  if (ua.includes('googlebot') || 
      ua.includes('bingbot') || 
      ua.includes('crawler') ||
      ua.includes('spider')) {
    return { isInAppBrowser: false, platform: null, userAgent: ua };
  }
  
  // LINE 瀏覽器
  if (ua.includes('line/') || typeof (window as any).liff !== 'undefined') {
    return { isInAppBrowser: true, platform: 'line', userAgent: ua };
  }
  
  // Facebook 瀏覽器
  if (ua.includes('fban') || ua.includes('fbav') || ua.includes('fb_iab')) {
    return { isInAppBrowser: true, platform: 'facebook', userAgent: ua };
  }
  
  // Instagram 瀏覽器
  if (ua.includes('instagram')) {
    return { isInAppBrowser: true, platform: 'instagram', userAgent: ua };
  }
  
  // Twitter 瀏覽器
  if (ua.includes('twitter')) {
    return { isInAppBrowser: true, platform: 'twitter', userAgent: ua };
  }
  
  // 微信瀏覽器
  if (ua.includes('micromessenger')) {
    return { isInAppBrowser: true, platform: 'wechat', userAgent: ua };
  }
  
  // Android WebView（通用檢測）
  if (ua.includes('wv') && ua.includes('android')) {
    return { isInAppBrowser: true, platform: 'webview', userAgent: ua };
  }
  
  // iOS WebView（啟發式檢測：包含 AppleWebKit 但不包含 Safari）
  // 注意：此檢測可能不夠準確，某些合法瀏覽器可能被誤判
  if (ua.includes('applewebkit') && !ua.includes('safari') && !ua.includes('chrome') && !ua.includes('crios')) {
    // 額外檢查：不是 Chrome iOS 版本
    return { isInAppBrowser: true, platform: 'webview', userAgent: ua };
  }
  
  // 外部瀏覽器
  return { isInAppBrowser: false, platform: null, userAgent: ua };
}
