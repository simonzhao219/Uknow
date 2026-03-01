import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { AlertCircle, Copy, ExternalLink, Check } from 'lucide-react';
import { InAppBrowserPlatform, copyLinkToClipboard, openInExternalBrowser } from '../utils/browserDetection';

interface InAppBrowserWarningProps {
  platform: InAppBrowserPlatform;
  currentURL: string;
}

// 平台特定的引导信息
const platformGuides: Record<string, {
  title: string;
  description: string;
  steps: string[];
}> = {
  line: {
    title: 'LINE 内置浏览器无法正常使用',
    description: '为确保支付流程顺利完成，请在外部浏览器（如 Safari 或 Chrome）中打开',
    steps: [
      '点击右上角的「⋯」按钮',
      '选择「在 Safari 中打开」或「在 Chrome 中打开」',
      '或点击下方按钮复制链接，手动在浏览器中打开'
    ]
  },
  facebook: {
    title: 'Facebook 内置浏览器无法正常使用',
    description: '为确保支付流程顺利完成，请在外部浏览器中打开',
    steps: [
      '点击右上角的「⋯」按钮',
      '选择「在浏览器中打开」',
      '或点击下方按钮复制链接，手动在浏览器中打开'
    ]
  },
  instagram: {
    title: 'Instagram 内置浏览器无法正常使用',
    description: '为确保支付流程顺利完成，请在外部浏览器中打开',
    steps: [
      '点击右上角的「⋯」按钮',
      '选择「在浏览器中打开」',
      '或点击下方按钮复制链接，手动在浏览器中打开'
    ]
  },
  twitter: {
    title: 'Twitter 内置浏览器无法正常使用',
    description: '为确保支付流程顺利完成，请在外部浏览器中打开',
    steps: [
      '点击右上角的「⋯」按钮',
      '选择「在 Safari 中打开」',
      '或点击下方按钮复制链接，手动在浏览器中打开'
    ]
  },
  wechat: {
    title: '微信内置浏览器无法正常使用',
    description: '为确保支付流程顺利完成，请在外部浏览器中打开',
    steps: [
      '点击右上角的「⋯」按钮',
      '选择「在浏览器中打开」',
      '或点击下方按钮复制链接，手动在浏览器中打开'
    ]
  },
  webview: {
    title: '当前浏览器无法正常使用',
    description: '为确保支付流程顺利完成，请在外部浏览器（如 Safari 或 Chrome）中打开',
    steps: [
      '复制下方链接',
      '在 Safari、Chrome 或其他浏览器中打开',
      '粘贴链接并访问'
    ]
  }
};

export function InAppBrowserWarning({ platform, currentURL }: InAppBrowserWarningProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  
  // 获取平台特定的引导信息，如果没有则使用通用引导
  const guide = platform ? platformGuides[platform] : platformGuides.webview;
  
  // 处理复制链接
  const handleCopyLink = async () => {
    setCopyError(false);
    const success = await copyLinkToClipboard();
    
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000); // 3秒后恢复按钮状态
    } else {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    }
  };
  
  // 处理在外部浏览器中打开
  const handleOpenExternal = () => {
    const opened = openInExternalBrowser();
    
    if (!opened) {
      // 如果无法自动打开，提示用户手动复制链接
      handleCopyLink();
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center space-y-4">
          {/* 警告图标 */}
          <div className="flex justify-center">
            <div className="rounded-full bg-orange-100 p-4">
              <AlertCircle className="h-12 w-12 text-orange-600" />
            </div>
          </div>
          
          {/* 标题 */}
          <CardTitle className="text-2xl font-bold">
            {guide.title}
          </CardTitle>
          
          {/* 描述 */}
          <p className="text-muted-foreground">
            {guide.description}
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* 操作步骤 */}
          <div className="space-y-3">
            <p className="font-medium text-sm">请按照以下步骤操作：</p>
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
          
          {/* 链接显示框 */}
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">当前页面链接：</p>
            <p className="text-sm font-mono break-all">
              {currentURL}
            </p>
          </div>
          
          {/* 操作按钮 */}
          <div className="space-y-3">
            {/* 复制链接按钮 */}
            <Button
              onClick={handleCopyLink}
              className="w-full"
              variant={copied ? 'default' : 'default'}
              disabled={copied}
            >
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  链接已复制
                </>
              ) : copyError ? (
                <>
                  <AlertCircle className="mr-2 h-4 w-4" />
                  复制失败，请手动复制
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  复制链接
                </>
              )}
            </Button>
            
            {/* 尝试在外部浏览器打开 */}
            <Button
              onClick={handleOpenExternal}
              className="w-full"
              variant="outline"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              尝试在浏览器中打开
            </Button>
          </div>
          
          {/* 提示信息 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              💡 <strong>为什么需要在外部浏览器打开？</strong><br />
              内置浏览器可能导致支付流程中断、登录状态丢失等问题。在 Safari、Chrome 等独立浏览器中使用可以确保功能正常运作。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
