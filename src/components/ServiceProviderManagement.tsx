import { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { UserContext } from '../App';
import { Plus, Edit, Eye, MapPin, ArrowLeft, Trash2 } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useNotification } from './notifications/NotificationContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useUserListing } from '../hooks/useUserListing';
import { createClient } from '../utils/supabase/client';

export function ServiceProviderManagement() {
  const { showToast, showError } = useNotification();
  const { user } = useContext(UserContext);
  const handleBack = useBackNavigation();
  // 刊登本身沒有狀態或效期（listings 表刻意不存 is_active／active_until）——
  // 是否對外顯示完全由帳號訂閱決定，且在資料層一處守門：HomePage 讀
  // public_listings view，view 以 has_active_subscription() 過濾，會員過期／
  // 停權的刊登會自動從首頁消失。因此這裡不再顯示任何「活躍／過期」狀態徽章。
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ✅ 新規格：單一刊登模式。取得／快取／revalidate 全部收斂在 useUserListing，
  // 與會員中心的刊登卡片共用同一份邏輯與同一個快取鍵。
  const { listing, loading, error: listingError, refetch: refetchListing } = useUserListing();
  const supabase = createClient();

  // 刪除刊登。確認一律走 AlertDialog（全站確認彈窗的統一標準）——
  // 原生 window.confirm 在 LINE 等內建瀏覽器可能被抑制、樣式與品牌
  // 脫節，也無法排版說明文字。
  const handleDeleteListing = async () => {
    if (!listing) return;
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

      // ✅ 重新獲取（應該會變成 null）——refetch 成功時會覆寫快取，
      // 不需要再另外 clearCache。
      await refetchListing();
    } catch (error) {
      console.error('[刪除刊登] ❌ 錯誤:', error);
      showError(
        '刪除失敗',
        error instanceof Error ? error.message : '刪除刊登時發生錯誤，請稍後再試',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {showDeleteConfirm && listing && (
        <AlertDialog open onOpenChange={() => setShowDeleteConfirm(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確認刪除刊登？</AlertDialogTitle>
              <AlertDialogDescription>
                確定要刪除刊登「{listing.name}」嗎？此操作無法復原，
                刊登的所有資料（包括照片）都會被永久刪除。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setShowDeleteConfirm(false);
                  handleDeleteListing();
                }}
              >
                確認刪除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="shrink-0"
            aria-label="返回上一頁"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">刊登管理</h1>
            {/* <p className="text-muted-foreground">管理理您的專業服務刊登</p> */}
          </div>
        </div>
        {/* ✅ 只有當用戶「確定」沒有刊登時，才顯示「刊登新服務」按鈕——
            讀取失敗時 listing 同樣是 null，此時放行會讓已有刊登的人建出
            第二則，違反單一刊登模式。 */}
        {!loading && !listingError && listing === null && (
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
            <p className="text-muted-foreground mb-6">正在獲取您的專業服務刊登</p>
          </CardContent>
        </Card>
      ) : listingError ? (
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-medium mb-2">暫時無法取得刊登狀態</h3>
            <p className="text-muted-foreground mb-6">{listingError}</p>
            <Button
              variant="outline"
              onClick={() => {
                void refetchListing();
              }}
            >
              重新載入
            </Button>
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
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/service-providers/${listing.id}`} aria-label="查看刊登">
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>

                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/service-providers/edit/${listing.id}`} aria-label="編輯刊登">
                          <Edit className="h-4 w-4" />
                        </Link>
                      </Button>

                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isDeleting}
                        aria-label="刪除刊登"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>
                        {listing.city} {listing.districts[0] ?? ''}
                      </span>
                    </div>
                  </div>

                  <p className="text-muted-foreground line-clamp-2">{listing.description}</p>

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
