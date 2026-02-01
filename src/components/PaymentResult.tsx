import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Loader2, CheckCircle, XCircle, AlertCircle, Phone } from 'lucide-react';
import { UserContext } from '../App';
import { createClient } from '../utils/supabase/client';
import { projectId } from '../utils/supabase/info';
import { useNotification } from './notifications/NotificationContext';

export function PaymentResult() {
  const [searchParams] = useSearchParams();
  const tradeNo = searchParams.get('tradeNo');
  
  const [status, setStatus] = useState<'pending' | 'success' | 'failed'>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  
  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const { showToast, showSuccess } = useNotification();
  const supabase = createClient();

  // 輪詢查詢付款結果
  useEffect(() => {
    if (!tradeNo) {
      showToast('訂單編號不存在', 'error');
      navigate('/auth/payment-checkout', { replace: true });
      return;
    }

    let interval: NodeJS.Timeout;

    const checkPaymentStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          showToast('登入已過期，請重新登入', 'error');
          navigate('/login');
          return;
        }

        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/payuni/result/${tradeNo}`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          }
        );

        if (!response.ok) {
          throw new Error('查詢失敗');
        }

        const result = await response.json();
        
        console.log('[PaymentResult] Status:', result.data.status);

        if (result.data.status === 'success') {
          setStatus('success');
          setCompletedAt(result.data.completedAt);
          setIsPolling(false);
          clearInterval(interval);
        } else if (result.data.status === 'failed') {
          setStatus('failed');
          setErrorMessage(result.data.errorMessage || '付款失敗');
          setIsPolling(false);
          clearInterval(interval);
        }
        // 如果是 pending，繼續輪詢
        
      } catch (error: any) {
        console.error('[PaymentResult] Error:', error);
        // 不顯示錯誤，繼續輪詢
      }
    };

    // 立即執行一次
    checkPaymentStatus();

    // 每3秒查詢一次
    interval = setInterval(checkPaymentStatus, 3000);

    // 30秒後停止輪詢（避免無限輪詢）
    const timeout = setTimeout(() => {
      if (isPolling) {
        setIsPolling(false);
        clearInterval(interval);
        showToast('查詢超時，請稍後重新整理頁面', 'warning');
      }
    }, 30000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [tradeNo]);

  // 完成註冊
  const handleCompleteRegistration = async () => {
    try {
      // 獲取最新的用戶資料
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        showToast('登入已過期，請重新登入', 'error');
        navigate('/login');
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/auth/profile`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      );

      if (response.ok) {
        const profile = await response.json();
        
        // 更新用戶狀態
        setUser(profile);
        localStorage.setItem('user', JSON.stringify(profile));
        localStorage.removeItem('pendingUser');

        showToast('註冊成功，歡迎加入 Uknow！', 'success');
        
        // 導向會員中心
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 500);
      } else {
        showToast('無法獲取用戶資料，請稍後再試', 'error');
      }
    } catch (error: any) {
      console.error('[PaymentResult] Complete registration error:', error);
      showToast(error.message || '操作失敗', 'error');
    }
  };

  // 聯繫客服
  const handleContactSupport = () => {
    showToast('請撥打客服電話或發送郵件', 'info');
    // TODO: 實際的客服聯繫方式
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {status === 'pending' && (
              <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              </div>
            )}
            {status === 'success' && (
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            )}
            {status === 'failed' && (
              <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
            )}
          </div>
          
          <CardTitle className="text-2xl">
            {status === 'pending' && '處理中...'}
            {status === 'success' && '付款成功'}
            {status === 'failed' && '付款失敗'}
          </CardTitle>
          
          <CardDescription>
            {status === 'pending' && '正在確認您的付款狀態，請稍候'}
            {status === 'success' && '您的帳號已成功啟用'}
            {status === 'failed' && '付款處理失敗，請聯繫客服協助處理'}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* 訂單編號 */}
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="text-sm text-muted-foreground">訂單編號</div>
            <div className="font-mono text-sm break-all">{tradeNo}</div>
          </div>

          {/* Pending 狀態 */}
          {status === 'pending' && (
            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">正在處理付款</p>
                <p className="text-blue-700">
                  系統正在與統一金流確認您的付款狀態，這可能需要幾秒鐘時間。請勿關閉此頁面。
                </p>
              </div>
            </div>
          )}

          {/* Success 狀態 */}
          {status === 'success' && (
            <>
              <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div className="text-sm text-green-900">
                  <p className="font-medium mb-1">付款成功</p>
                  <p className="text-green-700">
                    您的年費已成功繳納，現在可以開始使用 Uknow 平台的所有功能。
                  </p>
                  {completedAt && (
                    <p className="text-xs text-green-600 mt-2">
                      完成時間：{new Date(completedAt).toLocaleString('zh-TW')}
                    </p>
                  )}
                </div>
              </div>
              
              <Button
                onClick={handleCompleteRegistration}
                className="w-full"
                size="lg"
              >
                完成註冊
              </Button>
            </>
          )}

          {/* Failed 狀態 */}
          {status === 'failed' && (
            <>
              <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
                <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="text-sm text-red-900">
                  <p className="font-medium mb-1">付款失敗</p>
                  <p className="text-red-700 mb-2">
                    {errorMessage || '付款處理過程中發生錯誤'}
                  </p>
                  <p className="text-red-700">
                    請確認您的信用卡資訊是否正確，或聯繫客服協助處理。
                  </p>
                </div>
              </div>
              
              <div className="space-y-3">
                <Button
                  onClick={handleContactSupport}
                  variant="outline"
                  className="w-full"
                >
                  <Phone className="mr-2 h-4 w-4" />
                  聯繫客服
                </Button>
                
                <Button
                  onClick={() => navigate('/auth/payment-checkout', { replace: true })}
                  variant="ghost"
                  className="w-full"
                >
                  返回付款頁面
                </Button>
              </div>
            </>
          )}

          {/* 輪詢指示器 */}
          {isPolling && status === 'pending' && (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>每 3 秒自動查詢...</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
