import React, { useContext, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { UserContext } from '../App';
import { Plus, Edit, Eye, Calendar, MapPin, Copy, Check, ArrowLeft } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useNotification } from './notifications/NotificationContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { createClient } from '../utils/supabase/client';
import { projectId } from '../utils/supabase/info';

export function ServiceProviderManagement() {
  const { showToast } = useNotification();
  const { user } = useContext(UserContext);
  const handleBack = useBackNavigation();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // ✅ 使用状态管理数据
  const [serviceProviders, setServiceProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // ✅ 获取用户的刊登列表
  useEffect(() => {
    if (user?.id) {
      fetchUserListings();
    }
  }, [user?.id]);

  const fetchUserListings = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        showToast('請先登入', 'error');
        setServiceProviders([]);
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/listings/user`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('獲取刊登列表失敗');
      }

      const data = await response.json();
      console.log('管理刊登 - 獲取到的數據:', data);
      setServiceProviders(data.listings || []);
    } catch (error) {
      console.error('獲取刊登列表失敗:', error);
      showToast('獲取刊登列表失敗，請稍後再試', 'error');
      setServiceProviders([]);
    } finally {
      setLoading(false);
    }
  };

  // ✅ 简化推荐码生成（直接使用后端返回的）
  const generateReferralCode = (serviceProviderId: string) => {
    const serviceProvider = serviceProviders.find(r => r.id === serviceProviderId);
    return serviceProvider?.referralCode || '';
  };

  // 复制推荐码
  const handleCopyReferralCode = async (serviceProviderId: string) => {
    const referralCode = generateReferralCode(serviceProviderId);
    
    if (!referralCode) {
      showToast('無法生成推薦碼', 'error');
      return;
    }
    
    try {
      // 使用传统的 execCommand 方法（更可靠，不受 Clipboard API 权限限制）
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
          setCopiedId(serviceProviderId);
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
            <p className="text-muted-foreground">管理您的專業服務刊登</p>
          </div>
        </div>
        <Button asChild>
          <Link to="/service-providers/create">
            <Plus className="h-4 w-4 mr-2" />
            刊登新服務
          </Link>
        </Button>
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
      ) : serviceProviders.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-medium mb-2">尚未刊登任何服務者</h3>
            <p className="text-muted-foreground mb-6">
              開始刊登您的專業服務，讓更多人找到您
            </p>
            <Button asChild>
              <Link to="/service-providers/create">
                <Plus className="h-4 w-4 mr-2" />
                刊登第一個服務者
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {serviceProviders.map((serviceProvider) => {
            // ✅ 数据格式转换
            const displayDistrict = Array.isArray(serviceProvider.districts)
              ? serviceProvider.districts[0]
              : serviceProvider.district || '';
            
            // ✅ 判断是否活跃
            const isActive = new Date(serviceProvider.activeUntil) >= new Date();

            return (
            <Card key={serviceProvider.id}>
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row gap-6">
                  {/* 圖片 */}
                  <div className="w-full md:w-48 aspect-video rounded-lg overflow-hidden">
                    <ImageWithFallback
                      src={serviceProvider.photos[0]}
                      alt={serviceProvider.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* 內容 */}
                  <div className="flex-1 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-xl font-semibold">{serviceProvider.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="default">{serviceProvider.category}</Badge>
                          <Badge variant={isActive ? "secondary" : "outline"}>
                            {isActive ? '活躍中' : '已過期'}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/service-providers/${serviceProvider.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/service-providers/edit/${serviceProvider.id}`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>{serviceProvider.city} {displayDistrict}</span>
                      </div>
                      
                      {!isActive && (
                        <div className="text-sm text-destructive">
                          有效期限已於 {new Date(serviceProvider.activeUntil).toLocaleDateString('zh-TW')} 截止
                        </div>
                      )}
                    </div>

                    <p className="text-muted-foreground line-clamp-2">
                      {serviceProvider.description}
                    </p>

                    {/* 推荐码区域 */}
                    <div className="pt-3 border-t">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">推薦碼：</span>
                          <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                            {generateReferralCode(serviceProvider.id)}
                          </code>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyReferralCode(serviceProvider.id)}
                          >
                            {copiedId === serviceProvider.id ? (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                已複製
                              </>
                            ) : (
                              <>
                                <Copy className="h-4 w-4 mr-1" />
                                複製
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {/* 不明顯的訂閱管理連結 */}
      <div className="flex justify-center pt-8 pb-4">
        <Button variant="ghost" size="sm" asChild className="text-xs text-muted-foreground hover:text-muted-foreground/80">
          <Link to="/subscriptions">我的訂閱</Link>
        </Button>
      </div>
    </div>
  );
}