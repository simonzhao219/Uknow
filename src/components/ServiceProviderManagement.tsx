import React, { useContext, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { UserContext } from '../App';
import { Plus, Edit, Eye, Calendar, MapPin, Copy, Check, ArrowLeft, Trash2 } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useNotification } from './notifications/NotificationContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useDataCache } from '../contexts/DataCacheContext'; // ✅ 新增：資料快取
import { createClient } from '../utils/supabase/client';

export function ServiceProviderManagement() {
  const { showToast, showError } = useNotification();
  const { user } = useContext(UserContext);
  const handleBack = useBackNavigation();
  const { getValidCache, setCache, clearCache } = useDataCache(); // ✅ 新增：使用資料快取
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // ✅ 新規格：單一刊登模式
  const [listing, setListing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // ✅ 優化：獲取用戶的刊登（使用快取）
  useEffect(() => {
    if (user?.id) {
      // ✅ 優先使用快取（過期視同 cache miss，5 分鐘 TTL）
      const cached = getValidCache('userListing');
      if (cached != null) {
        console.log('🎯 ServiceProviderManagement: 使用快取的刊登資料');
        setListing(cached);
        setLoading(false);
      } else {
        console.log('🔄 ServiceProviderManagement: 無快取或已過期，載入新資料');
        fetchUserListing();
      }
    } else {
      // ✅ 若沒有 user，停止 loading 並清空 listing
      console.log('ServiceProviderManagement: No user, skipping fetch');
      setLoading(false);
      setListing(null);
    }
  }, [user?.id]);

  const fetchUserListing = async () => {
    setLoading(true);
    try {
      if (!user?.id) { setListing(null); return; }

      const { data: listingData, error } = await supabase
        .from('listings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      setCache('userListing', listingData);
      setListing(listingData);
    } catch (error) {
      console.error('獲取刊登失敗:', error);
      showToast('獲取刊登失敗，請稍後再試', 'error');
      setListing(null);
    } finally {
      setLoading(false);
    }
  };

  // ✅ 複製推薦碼（簡化版）
  const handleCopyReferralCode = async () => {
    const referralCode = listing?.referralCode;
    
    if (!referralCode) {
      showToast('無法取得推薦碼', 'error');
      return;
    }
    
    try {
      // 使用傳統的 execCommand 方法（更可靠，不受 Clipboard API 權限限制）
      const textArea = document.createElement('textarea');
      textArea.value = referralCode;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
          setCopiedId(listing.id);
          showToast('推薦碼已複製到剪貼簿', 'success');
          setTimeout(() => setCopiedId(null), 2000);
        } else {
          throw new Error('execCommand failed');
        }
      } catch (err) {
        document.body.removeChild(textArea);
        throw err;
      }
    } catch (err) {
      console.error('複製失敗:', err);
      showToast('複製失敗，請手動複製推薦碼', 'error');
    }
  };

  // ✅ 刪除刊登
  const handleDeleteListing = async () => {
    if (!listing) return;
    
    // 顯示確認對話框
    const confirmed = window.confirm(
      `確定要刪除刊登「${listing.name}」嗎？\n\n此操作無法復原，刊登的所有資料（包括照片）都會被永久刪除。`
    );
    
    if (!confirmed) return;
    
    setIsDeleting(true);
    
    try {
      console.log(`[刪除刊登] 開始刪除: ${listing.id}`);
      
      const { error: deleteError } = await supabase
        .from('listings')
        .delete()
        .eq('id', listing.id)
        .eq('user_id', user.id);

      if (deleteError) throw new Error(deleteError.message || '刪除失敗');
      console.log(`[刪除刊登] ✅ 成功`);
      
      showToast('刊登已成功刪除', 'success');
      
      // ✅ 清除快取並重新獲取刊登列表（應該會變成 null）
      clearCache('userListing');
      await fetchUserListing();
      
    } catch (error) {
      console.error('[刪除刊登] ❌ 錯誤:', error);
      showError(
        '刪除失敗',
        error instanceof Error ? error.message : '刪除刊登時發生錯誤，請稍後再試'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={handleBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">刊登管理</h1>
            {/* <p className="text-muted-foreground">管理理您的專業服務刊登</p> */}
          </div>
        </div>
        {/* ✅ 只有當用戶沒有刊登時，才顯示「刊登新服務」按鈕 */}
        {!loading && listing === null && (
          <Button asChild>
            <Link to="/service-providers/create">
              <Plus className="h-4 w-4 mr-2" />
              刊登新服務
            </Link>
          </Button>
        )}
      </div>

      {/* 服務者列表 */}
      {loading ? (
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-medium mb-2">載入中...</h3>
            <p className="text-muted-foreground mb-6">
              正在獲取您的專業服務刊登
            </p>
          </CardContent>
        </Card>
      ) : listing === null ? (
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-medium mb-2">尚未刊登服務者</h3>
            <p className="text-muted-foreground mb-6">
              點擊右上角的按鈕刊登您的專業服務，讓更多人找到您
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* ✅ 單一對象 */}
          <Card key={listing.id}>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-6">
                {/* 圖片 */}
                <div className="w-full md:w-48 aspect-video rounded-lg overflow-hidden">
                  <ImageWithFallback
                    src={listing.photos[0]}
                    alt={listing.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* 內容 */}
                <div className="flex-1 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-semibold">{listing.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="default">{listing.category}</Badge>
                        <Badge variant={new Date(listing.activeUntil) >= new Date() ? "secondary" : "outline"}>
                          {new Date(listing.activeUntil) >= new Date() ? '活躍中' : '已過期'}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/service-providers/${listing.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/service-providers/edit/${listing.id}`}>
                          <Edit className="h-4 w-4" />
                        </Link>
                      </Button>
                      
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={handleDeleteListing}
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{listing.city} {Array.isArray(listing.districts) ? listing.districts[0] : listing.district || ''}</span>
                    </div>
                    
                    {new Date(listing.activeUntil) < new Date() && (
                      <div className="text-sm text-destructive">
                        有效期限已於 {new Date(listing.activeUntil).toLocaleDateString('zh-TW')} 截止
                      </div>
                    )}
                  </div>

                  <p className="text-muted-foreground line-clamp-2">
                    {listing.description}
                  </p>

                  {/* 推薦碼區域已移除 */}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 移除訂閱管理連結 - 訂閱功能已整合到會員中心 */}
    </div>
  );
}