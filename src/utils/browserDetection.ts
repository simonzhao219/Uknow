/**
 * 浏览器检测工具
 * 用于检测用户是否在内部浏览器（In-App Browser / WebView）中访问
 */

export type InAppBrowserPlatform = 'line' | 'facebook' | 'instagram' | 'twitter' | 'wechat' | 'webview' | null;

export interface BrowserDetectionResult {
  isInAppBrowser: boolean;
  platform: InAppBrowserPlatform;
  userAgent: string;
}

/**
 * 检测是否为内部浏览器
 */
export function detectInAppBrowser(): BrowserDetectionResult {
  // 开发测试模式（设为 true 可以强制显示警告页）
  const FORCE_IN_APP_BROWSER = false;
  
  if (FORCE_IN_APP_BROWSER) {
    return { 
      isInAppBrowser: true, 
      platform: 'line', 
      userAgent: 'test-mode' 
    };
  }
  
  const ua = navigator.userAgent.toLowerCase();
  
  // 排除搜索引擎爬虫
  if (ua.includes('googlebot') || 
      ua.includes('bingbot') || 
      ua.includes('crawler') ||
      ua.includes('spider')) {
    return { isInAppBrowser: false, platform: null, userAgent: ua };
  }
  
  // LINE 浏览器
  if (ua.includes('line/') || typeof (window as any).liff !== 'undefined') {
    return { isInAppBrowser: true, platform: 'line', userAgent: ua };
  }
  
  // Facebook 浏览器
  if (ua.includes('fban') || ua.includes('fbav') || ua.includes('fb_iab')) {
    return { isInAppBrowser: true, platform: 'facebook', userAgent: ua };
  }
  
  // Instagram 浏览器
  if (ua.includes('instagram')) {
    return { isInAppBrowser: true, platform: 'instagram', userAgent: ua };
  }
  
  // Twitter 浏览器
  if (ua.includes('twitter')) {
    return { isInAppBrowser: true, platform: 'twitter', userAgent: ua };
  }
  
  // 微信浏览器
  if (ua.includes('micromessenger')) {
    return { isInAppBrowser: true, platform: 'wechat', userAgent: ua };
  }
  
  // Android WebView (通用检测)
  if (ua.includes('wv') && ua.includes('android')) {
    return { isInAppBrowser: true, platform: 'webview', userAgent: ua };
  }
  
  // iOS WebView (启发式检测：包含 AppleWebKit 但不包含 Safari)
  // 注意：这个检测可能不够准确，某些合法浏览器可能被误判
  if (ua.includes('applewebkit') && !ua.includes('safari') && !ua.includes('chrome') && !ua.includes('crios')) {
    // 额外检查：不是 Chrome iOS 版本
    return { isInAppBrowser: true, platform: 'webview', userAgent: ua };
  }
  
  // 外部浏览器
  return { isInAppBrowser: false, platform: null, userAgent: ua };
}

/**
 * 获取当前页面的完整 URL
 */
export function getCurrentURL(): string {
  return window.location.href;
}

/**
 * 尝试在外部浏览器中打开
 */
export function openInExternalBrowser(): boolean {
  const currentURL = getCurrentURL();
  
  try {
    // iOS: 尝试使用 x-web-search scheme
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      window.location.href = `x-web-search://?${encodeURIComponent(currentURL)}`;
      return true;
    }
    
    // Android: 尝试使用 Intent
    if (/android/i.test(navigator.userAgent)) {
      const intentURL = `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;end`;
      window.location.href = intentURL;
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Failed to open in external browser:', error);
    return false;
  }
}

/**
 * 复制链接到剪贴板
 */
export async function copyLinkToClipboard(): Promise<boolean> {
  const currentURL = getCurrentURL();
  
  try {
    // 现代浏览器使用 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(currentURL);
      return true;
    }
    
    // 降级方案：使用 document.execCommand (已弃用但兼容性好)
    const textArea = document.createElement('textarea');
    textArea.value = currentURL;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    return successful;
  } catch (error) {
    console.error('Failed to copy link:', error);
    return false;
  }
}
