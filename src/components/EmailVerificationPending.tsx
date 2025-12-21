import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Mail, ArrowLeft, Clock, RefreshCw, AlertCircle } from 'lucide-react';
import { createClient } from '../utils/supabase/client';
import { useNotification } from './notifications/NotificationContext';

// 固定冷卻時間：90 秒
const COOLDOWN_DURATION = 90;

// 本地存儲鍵名
const STORAGE_KEY_START_TIME = 'emailVerificationStartTime';
const STORAGE_KEY_RESEND_COUNT = 'emailVerificationResendCount';

interface EmailVerificationState {
  firstEmailSentAt: number;
  cooldownSeconds: number;
  isResending: boolean;
  resendCount: number;
}

export function EmailVerificationPending() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const supabase = createClient();

  const email = location.state?.email || '';

  const [state, setState] = useState<EmailVerificationState>({
    firstEmailSentAt: 0,
    cooldownSeconds: 0,
    isResending: false,
    resendCount: 0,
  });

  // 計算初始冷卻時間
  const calculateInitialCooldown = (registrationTime: number): number => {
    const now = Date.now();
    const elapsed = Math.floor((now - registrationTime) / 1000);

    // 如果距離註冊時間已超過 90 秒，則可以立即重發
    if (elapsed >= COOLDOWN_DURATION) {
      return 0;
    }

    // 否則，冷卻剩餘時間 = 90 - 已經過的時間
    return COOLDOWN_DURATION - elapsed;
  };

  // 組件初始化
  useEffect(() => {
    // 1. 優先從 location.state 獲取註冊時間
    let registrationTime = location.state?.registrationTime;

    // 2. 如果沒有，從 localStorage 獲取
    if (!registrationTime) {
      const savedTime = localStorage.getItem(STORAGE_KEY_START_TIME);
      registrationTime = savedTime ? parseInt(savedTime) : null;
    }

    // 3. 如果還是沒有，使用當前時間（允許立即重發）
    if (!registrationTime) {
      registrationTime = Date.now();
    }

    // 保存到 localStorage（刷新頁面時使用）
    localStorage.setItem(STORAGE_KEY_START_TIME, registrationTime.toString());

    // 獲取已重發次數
    const savedResendCount = localStorage.getItem(STORAGE_KEY_RESEND_COUNT);
    const resendCount = savedResendCount ? parseInt(savedResendCount) : 0;

    // 計算初始冷卻時間
    const initialCooldown = calculateInitialCooldown(registrationTime);

    setState({
      firstEmailSentAt: registrationTime,
      cooldownSeconds: initialCooldown,
      isResending: false,
      resendCount,
    });
  }, [location.state]);

  // 倒數計時器
  useEffect(() => {
    if (state.cooldownSeconds <= 0) return;

    const timer = setInterval(() => {
      setState((prev) => {
        if (prev.cooldownSeconds <= 1) {
          clearInterval(timer);
          return { ...prev, cooldownSeconds: 0 };
        }
        return { ...prev, cooldownSeconds: prev.cooldownSeconds - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [state.cooldownSeconds]);

  // 重發處理
  const handleResend = async () => {
    if (!email) {
      showToast('無法重新發送驗證信', 'error');
      return;
    }

    setState((prev) => ({ ...prev, isResending: true }));

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        console.error('Resend error:', error);
        showToast('重新發送失敗，請稍後再試', 'error');
        setState((prev) => ({ ...prev, isResending: false }));
        return;
      }

      // 成功重發
      const newResendCount = state.resendCount + 1;
      localStorage.setItem(STORAGE_KEY_RESEND_COUNT, newResendCount.toString());

      showToast('驗證信已重新寄出！', 'success');

      setState((prev) => ({
        ...prev,
        isResending: false,
        cooldownSeconds: COOLDOWN_DURATION,
        resendCount: newResendCount,
      }));
    } catch (error) {
      console.error('Error resending email:', error);
      showToast('重新發送失敗，請稍後再試', 'error');
      setState((prev) => ({ ...prev, isResending: false }));
    }
  };

  const { cooldownSeconds, isResending, resendCount } = state;
  const isButtonDisabled = isResending || cooldownSeconds > 0;

  // 是否顯示建議（重發 3 次後）
  const showSuggestions = resendCount >= 3;

  return (
    <div className="max-w-md mx-auto mt-12 px-4">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">驗證您的 Email</CardTitle>
          <CardDescription>我們已發送驗證信到您的信箱</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Email 顯示區 */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="text-sm">
              <strong>寄送至：</strong>
              <span className="text-primary ml-1">{email}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              請檢查您的收件匣（或垃圾郵件匣），並點擊驗證連結以繼續註冊流程。
            </p>
          </div>

          {/* 基本提示 */}
          {!showSuggestions && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <p className="text-sm text-blue-900">
                <strong>📌 小提示：</strong>
              </p>
              <ul className="text-sm text-blue-800 space-y-1 ml-4 list-disc">
                <li>郵件可能需要 1-2 分鐘送達</li>
                <li>請同時檢查垃圾郵件匣</li>
                {resendCount >= 1 && <li>搜尋關鍵字「Uknow」或「驗證」</li>}
                {resendCount >= 2 && <li>檢查促銷內容或社交網路分類</li>}
              </ul>
            </div>
          )}

          {/* 重發 3 次後的建議 */}
          {showSuggestions && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="space-y-2 flex-1">
                  <p className="text-sm text-amber-900">
                    <strong>⚠️ 您已重發 {resendCount} 次驗證信</strong>
                  </p>
                  <p className="text-sm text-amber-800">仍未收到嗎？可能原因：</p>
                  <ul className="text-sm text-amber-800 space-y-1 ml-4 list-disc">
                    <li>信箱服務商延遲（特別是 Gmail, Yahoo）</li>
                    <li>郵件被攔截或歸類到其他資料夾</li>
                    <li>企業/學校信箱的安全設定</li>
                  </ul>
                  <p className="text-sm text-amber-900 mt-2">
                    <strong>💡 建議：</strong>
                  </p>
                  <ul className="text-sm text-amber-800 space-y-1 ml-4 list-disc">
                    <li>檢查垃圾郵件、促銷內容、社交網路分類</li>
                    <li>在信箱中搜尋「Uknow」或「驗證」</li>
                    <li>確認信箱地址是否正確</li>
                    <li>如使用企業/學校信箱，建議更換為 Gmail、Yahoo 或 Outlook</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 重發按鈕 */}
          <div className="space-y-3">
            <Button
              onClick={handleResend}
              disabled={isButtonDisabled}
              variant={cooldownSeconds > 0 ? 'secondary' : 'outline'}
              className="w-full"
            >
              {isResending ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 mr-2"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.928l3-2.647z"
                    />
                  </svg>
                  寄送中...
                </>
              ) : cooldownSeconds > 0 ? (
                <>
                  <Clock className="w-4 h-4 mr-2" />
                  請稍候 {cooldownSeconds} 秒後可重新寄送
                  {resendCount > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      （已重發 {resendCount} 次）
                    </span>
                  )}
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  重新寄出驗證信
                  {resendCount > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      （已重發 {resendCount} 次）
                    </span>
                  )}
                </>
              )}
            </Button>

            {/* 返回登入按鈕 */}
            <Button onClick={() => navigate('/login')} variant="ghost" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回登入頁面
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
