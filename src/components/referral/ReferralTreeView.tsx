import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Users, Copy, ChevronDown, ChevronRight, Eye } from 'lucide-react@0.487.0';

interface ReferralListing {
  id: string;
  name: string;
  serviceType: string;
  city: string;
  ownerName: string;
  userId: string;
  activeUntil: string;
  isActive: boolean;
  photos: string[];
  referrer?: {
    ownerName: string;
    listingName: string;
  };
}

interface MyListing {
  id: string;
  name: string;
  serviceType: string;
  city: string;
  referralCode: string;
  activeUntil: string;
  isActive: boolean;
}

interface ReferralTree {
  myListing: MyListing;
  firstGeneration: ReferralListing[];
  secondGeneration: ReferralListing[];
  thirdGeneration: ReferralListing[];
}

interface ReferralTreeViewProps {
  tree: ReferralTree;
  onCopyCode: (code: string) => void;
}

export function ReferralTreeView({ tree, onCopyCode }: ReferralTreeViewProps) {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  
  const { myListing, firstGeneration, secondGeneration, thirdGeneration } = tree;
  
  // 計算各代的有效數量（非已失效）
  const firstGenActiveCount = firstGeneration.filter(r => r.isActive).length;
  const secondGenActiveCount = secondGeneration.filter(r => r.isActive).length;
  const thirdGenActiveCount = thirdGeneration.filter(r => r.isActive).length;
  
  const totalCount = firstGeneration.length + secondGeneration.length + thirdGeneration.length;
  const activeCount = firstGenActiveCount + secondGenActiveCount + thirdGenActiveCount;
  
  const renderReferralCard = (listing: ReferralListing, level: 1 | 2 | 3) => {
    const levelColors = {
      1: 'border-l-green-600 bg-green-50',
      2: 'border-l-purple-600 bg-purple-50',
      3: 'border-l-orange-600 bg-orange-50'
    };
    
    return (
      <div 
        key={listing.id}
        className={`relative p-3 pr-10 border-l-4 border rounded-lg transition-all duration-200 ${levelColors[level]} ${!listing.isActive ? 'opacity-50' : ''}`}
      >
        {/* 文字內容區 */}
        <div>
          {/* 第 1 行：被推薦人名稱 */}
          <p className={`font-medium truncate mb-1 ${!listing.isActive ? 'text-gray-400' : ''}`}>
            {listing.ownerName}-{listing.name}
          </p>
          
          {/* 第 2 行：城市·服務類別 */}
          <p className={`text-sm truncate mb-1 ${!listing.isActive ? 'text-gray-400' : 'text-muted-foreground'}`}>
            {listing.city} · {listing.serviceType}
          </p>
          
          {/* 第 3 行：推薦人資訊（僅二代和三代顯示）*/}
          {level > 1 && listing.referrer && (
            <p className={`text-sm truncate ${!listing.isActive ? 'text-gray-400' : 'text-muted-foreground'}`}>
              {listing.referrer.ownerName}-{listing.referrer.listingName}
            </p>
          )}
        </div>
        
        {/* 預覽按鈕 - 絕對定位，垂直居中對齊卡片中線 */}
        {!listing.isActive ? (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded shrink-0">
            已失效
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/service-providers/${listing.id}`);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
            title="預覽刊登詳細內容"
          >
            <Eye className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  };
  
  return (
    <div className="border rounded-lg">
      {/* 刊登標題區 */}
      <div 
        className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* 手機版：垂直堆疊佈局 */}
        <div className="md:hidden space-y-3">
          {/* 第一行：展開圖標 + 刊登標題 + 服務類型 */}
          <div className="flex items-start gap-3">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium">{myListing.name}</h3>
                <Badge variant="outline">{myListing.serviceType}</Badge>
                {!myListing.isActive && (
                  <Badge variant="destructive" className="text-xs">已失效</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground break-all mt-1">
                推薦碼：{myListing.referralCode}
              </p>
            </div>
          </div>
          
          {/* 第二行：統計數字 */}
          <div className="flex items-center justify-between text-sm pl-7">
            <span className="text-muted-foreground">
              {totalCount} 個推薦 ·  {activeCount} 個有效
            </span>
          </div>
          
          {/* 第三行：Badge 列表 */}
          {totalCount > 0 && (
            <div className="flex gap-1 flex-wrap pl-7">
              {firstGenActiveCount > 0 && (
                <Badge className="text-xs bg-green-600 text-white">
                  一代 {firstGenActiveCount}
                </Badge>
              )}
              {secondGenActiveCount > 0 && (
                <Badge className="text-xs bg-purple-600 text-white">
                  二代 {secondGenActiveCount}
                </Badge>
              )}
              {thirdGenActiveCount > 0 && (
                <Badge className="text-xs bg-orange-600 text-white">
                  三代 {thirdGenActiveCount}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* 平板版和桌面版：保持原本的水平佈局 */}
        <div className="hidden md:flex md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium">{myListing.name}</h3>
                <Badge variant="outline">{myListing.serviceType}</Badge>
                {!myListing.isActive && (
                  <Badge variant="destructive" className="text-xs">已失效</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                推薦碼：{myListing.referralCode}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex gap-1">
              {firstGenActiveCount > 0 && (
                <Badge className="text-xs bg-green-600 text-white">
                  一代 {firstGenActiveCount}
                </Badge>
              )}
              {secondGenActiveCount > 0 && (
                <Badge className="text-xs bg-purple-600 text-white">
                  二代 {secondGenActiveCount}
                </Badge>
              )}
              {thirdGenActiveCount > 0 && (
                <Badge className="text-xs bg-orange-600 text-white">
                  三代 {thirdGenActiveCount}
                </Badge>
              )}
              <div className="text-right">
                <p className="text-sm font-medium">
                  {totalCount} 個推薦
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeCount} 個有效
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 展開的推薦關係 */}
      {isExpanded && (
        <div className="border-t bg-muted/20 p-4">
          {totalCount === 0 ? (
            <div className="text-center py-6">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">此推碼尚未有推薦人</p>
              <p className="text-sm text-muted-foreground mt-1">
                分享推薦碼 {myListing.referralCode} 給好友吧！
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-3"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyCode(myListing.referralCode);
                }}
              >
                <Copy className="h-4 w-4 mr-2" />
                複製推薦碼
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 一代 */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Badge className="bg-green-600 text-white text-xs">一代</Badge>
                  ({firstGenActiveCount})
                </h4>
                <div className="space-y-2 max-h-[352px] overflow-y-auto pr-1">
                  {firstGeneration.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      尚未有一代推薦
                    </p>
                  ) : (
                    firstGeneration.map(listing => renderReferralCard(listing, 1))
                  )}
                </div>
              </div>

              {/* 二代 */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Badge className="bg-purple-600 text-white text-xs">二代</Badge>
                  ({secondGenActiveCount})
                </h4>
                <div className="space-y-2 max-h-[352px] overflow-y-auto pr-1">
                  {secondGeneration.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      尚未有二代推薦
                    </p>
                  ) : (
                    secondGeneration.map(listing => renderReferralCard(listing, 2))
                  )}
                </div>
              </div>

              {/* 三代 */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Badge className="bg-orange-600 text-white text-xs">三代</Badge>
                  ({thirdGenActiveCount})
                </h4>
                <div className="space-y-2 max-h-[352px] overflow-y-auto pr-1">
                  {thirdGeneration.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      尚未有三代推薦
                    </p>
                  ) : (
                    thirdGeneration.map(listing => renderReferralCard(listing, 3))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}