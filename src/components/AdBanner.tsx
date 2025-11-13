import React from 'react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface AdBannerProps {
  className?: string;
}

export function AdBanner({ className = '' }: AdBannerProps) {
  // 模擬廣告內容
  const adContent = {
    title: '專業服務推廣',
    description: '想讓更多人看到您的服務？升級到付費會員方案，獲得更好的曝光機會！',
    image: 'https://images.unsplash.com/photo-1556761175-4b46a572b786?w=400&h=200&fit=crop',
    buttonText: '了解更多'
  };

  return (
    <div className={`w-full ${className}`}>
      <Card className="overflow-hidden border-dashed bg-accent/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative aspect-[2/1] flex-shrink-0 w-20 h-10 overflow-hidden rounded">
              <ImageWithFallback
                src={adContent.image}
                alt={adContent.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">廣告</Badge>
                <h4 className="font-medium text-sm truncate">{adContent.title}</h4>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">{adContent.description}</p>
            </div>
            <button className="bg-primary text-primary-foreground text-xs px-3 py-1 rounded hover:bg-primary/90 transition-colors flex-shrink-0">
              {adContent.buttonText}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}