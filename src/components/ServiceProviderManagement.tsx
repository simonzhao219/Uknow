import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { UserContext } from '../App';
import { Plus, Edit, Eye, Calendar, MapPin, Copy, Check } from 'lucide-react';
import { mockServiceProviders, mockUsers } from '../data/mockData';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useNotification } from './notifications/NotificationContext';

export function ServiceProviderManagement() {
  const { showToast } = useNotification();
  const { user } = useContext(UserContext);
  const [roommates, setServiceProviders] = useState(mockServiceProviders.filter(r => r.userId === user?.id));
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 生成推荐码：从mockData获取 publicUserId(5码) + publicListingId(7码)
  const generateReferralCode = (roommateId: string) => {
    const roommate = roommates.find(r => r.id === roommateId);
    if (!roommate) return '';
    
    // 从mockUsers中查找当前用户的publicUserId
    const currentUser = mockUsers.find(u => u.id === user?.id);
    const publicUserId = currentUser?.publicUserId || '';
    
    // 如果mockData中没有publicListingId，使用id生成一个临时的7位码
    // 在实际应用中，这会从backend（Supabase）获取
    let publicListingId = roommate.publicListingId;
    if (!publicListingId) {
      // 生成临时的7位推荐码（仅用于demo，实际会从数据库获取）
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const seed = parseInt(roommateId) || 0;
      publicListingId = Array.from({ length: 7 }, (_, i) => 
        chars[(seed * (i + 1) * 7) % chars.length]
      ).join('');
    }
    
    return `${publicUserId}${publicListingId}`;
  };

  // 复制推荐码
  const handleCopyReferralCode = async (roommateId: string) => {
    const referralCode = generateReferralCode(roommateId);
    
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
          setCopiedId(roommateId);
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
        <div>
          <h1 className="text-3xl font-bold">刊登管理</h1>
          <p className="text-muted-foreground">管理您的專業服務刊登</p>
        </div>
        <Button asChild>
          <Link to="/service-providers/create">
            <Plus className="h-4 w-4 mr-2" />
            刊登新服務
          </Link>
        </Button>
      </div>

      {/* 服務者列表 */}
      {roommates.length === 0 ? (
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
          {roommates.map((roommate) => (
            <Card key={roommate.id}>
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row gap-6">
                  {/* 圖片 */}
                  <div className="w-full md:w-48 aspect-video rounded-lg overflow-hidden">
                    <ImageWithFallback
                      src={roommate.photos[0]}
                      alt={roommate.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* 內容 */}
                  <div className="flex-1 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-xl font-semibold">{roommate.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="default">{roommate.category}</Badge>
                          <Badge variant="secondary">活躍中</Badge>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/service-provider/${roommate.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/service-providers/edit/${roommate.id}`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>{roommate.city} {roommate.district}</span>
                      </div>
                    </div>

                    <p className="text-muted-foreground line-clamp-2">
                      {roommate.description}
                    </p>

                    {/* 推荐码区域 */}
                    <div className="pt-3 border-t">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">推薦碼：</span>
                          <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                            {generateReferralCode(roommate.id)}
                          </code>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyReferralCode(roommate.id)}
                          >
                            {copiedId === roommate.id ? (
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
          ))}
        </div>
      )}
    </div>
  );
}