import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { AlertCircle, Copy, ExternalLink, Check } from 'lucide-react';
import { InAppBrowserPlatform, copyLinkToClipboard, openInExternalBrowser } from '../utils/browserDetection';

interface InAppBrowserWarningProps {
  platform: InAppBrowserPlatform;
  currentURL: string;
}

// 平台特定的引導資訊
const platformGuides: Record<string, {
  title: string;
  description: string;
  steps: string[];
}> = {
  line: {
    title: 'LINE 內建瀏覽器無法正常使用',
    description: '為確保支付流程順利完成，請在外部瀏覽器（如 Safari 或 Chrome）中開啟',
    steps: [
      '點擊右上角/右下角的「⋯」按鈕',
      '選擇「在 Safari/Chrome 中開啟」',
      '或點擊下方按鈕複製連結，手動在瀏覽器中開啟'
    ]
  },
  facebook: {
    title: 'Facebook 內建瀏覽器無法正常使用',
    description: '為確保支付流程順利完成，請在外部瀏覽器中開啟',
    steps: [
      '點擊右上角/右下角的「⋯」按鈕',
      '選擇「在 Safari/Chrome 中開啟」',
      '或點擊下方按鈕複製連結，手動在瀏覽器中開啟'
    ]
  },
  instagram: {
    title: 'Instagram 內建瀏覽器無法正常使用',
    description: '為確保支付流程順利完成，請在外部瀏覽器中開啟',
    steps: [
      '點擊右上角/右下角的「⋯」按鈕',
      '選擇「在 Safari/Chrome 中開啟」',
      '或點擊下方按鈕複製連結，手動在瀏覽器中開啟'
    ]
  },
  twitter: {
    title: 'Twitter 內建瀏覽器無法正常使用',
    description: '為確保支付流程順利完成，請在外部瀏覽器中開啟',
    steps: [
      '點擊右上角/右下角的「⋯」按鈕',
      '選擇「在 Safari/Chrome 中開啟」',
      '或點擊下方按鈕複製連結，手動在瀏覽器中開啟'
    ]
  },
  wechat: {
    title: '微信內建瀏覽器無法正常使用',
    description: '為確保支付流程順利完成，請在外部瀏覽器中開啟',
    steps: [
      '點擊右上角/右下角的「⋯」按鈕',
      '選擇「在 Safari/Chrome 中開啟」',
      '或點擊下方按鈕複製連結，手動在瀏覽器中開啟'
    ]
  },
  webview: {
    title: '目前瀏覽器無法正常使用',
    description: '為確保支付流程順利完成，請在外部瀏覽器（如 Safari 或 Chrome）中開啟',
    steps: [
      '複製下方連結',
      '在 Safari、Chrome 或其他瀏覽器中開啟',
      '貼上連結並造訪'
    ]
  }
};

export function InAppBrowserWarning({ platform, currentURL }: InAppBrowserWarningProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  
  // 取得平台特定的引導資訊，如果沒有則使用通用引導
  const guide = platform ? platformGuides[platform] : platformGuides.webview;
  
  // 處理複製連結
  const handleCopyLink = async () => {
    setCopyError(false);
    const success = await copyLinkToClipboard();
    
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000); // 3 秒後恢復按鈕狀態
    } else {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    }
  };
  
  // 處理在外部瀏覽器中開啟
  const handleOpenExternal = () => {
    const opened = openInExternalBrowser();
    
    if (!opened) {
      // 如果無法自動開啟，提示使用者手動複製連結
      handleCopyLink();
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center space-y-4">
          {/* 警告圖示 */}
          <div className="flex justify-center">
            <div className="rounded-full bg-orange-100 p-4">
              <AlertCircle className="h-12 w-12 text-orange-600" />
            </div>
          </div>
          
          {/* 標題 */}
          <CardTitle className="text-2xl font-bold">
            {guide.title}
          </CardTitle>
          
          {/* 描述 */}
          <p className="text-muted-foreground">
            {guide.description}
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* 操作步驟 */}
          <div className="space-y-3">
            <p className="font-medium text-sm">請按照以下步驟操作：</p>
            <ol className="space-y-2">
              {guide.steps.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                    {index + 1}
                  </span>
                  <span className="text-sm text-muted-foreground pt-0.5">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          
          {/* 連結顯示框 */}
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">目前頁面連結：</p>
            <p className="text-sm font-mono break-all">
              {currentURL}
            </p>
          </div>
          
          {/* 操作按鈕 */}
          <div className="space-y-3">
            {/* 複製連結按鈕 */}
            <Button
              onClick={handleCopyLink}
              className="w-full"
              variant={copied ? 'default' : 'default'}
              disabled={copied}
            >
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  連結已複製
                </>
              ) : copyError ? (
                <>
                  <AlertCircle className="mr-2 h-4 w-4" />
                  複製失敗，請手動複製
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  複製連結
                </>
              )}
            </Button>
            
            {/* 嘗試在外部瀏覽器開啟 */}
            <Button
              onClick={handleOpenExternal}
              className="w-full"
              variant="outline"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              嘗試在瀏覽器中開啟
            </Button>
          </div>
          
          {/* 提示資訊 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              💡 <strong>為什麼需要在外部瀏覽器開啟？</strong><br />
              內建瀏覽器可能導致支付流程中斷、登入狀態遺失等問題。在 Safari、Chrome 等獨立瀏覽器中使用可確保功能正常運作。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
