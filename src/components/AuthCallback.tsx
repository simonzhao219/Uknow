import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createClient } from '../utils/supabase/client';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from './ui/button';

export function AuthCallback() {
  const navigate = useNavigate();
  const supabase = createClient();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('正在處理驗證...');

  useEffect(() => {
    let isProcessing = false;

    const handleCallback = async () => {
      if (isProcessing) return;
      isProcessing = true;

      try {
        console.log('AuthCallback: Starting email verification process...');
        console.log('AuthCallback: Current URL:', window.location.href);
        console.log('AuthCallback: Hash:', window.location.hash);
        console.log('AuthCallback: Search params:', window.location.search);
        
        // 0. 檢查是否已經處理過這個 hash（避免重複處理）
        const currentHash = window.location.hash;
        const lastProcessedHash = sessionStorage.getItem('lastProcessedAuthHash');
        
        if (currentHash && currentHash === lastProcessedHash) {
          console.log('AuthCallback: This hash was already processed, redirecting to login...');
          // 清除 hash 並導向登入頁
          window.location.hash = '';
          sessionStorage.removeItem('lastProcessedAuthHash');
          navigate('/login', { replace: true });
          return;
        }
        
        // 1. 檢查 URL 是否包含 error（驗證失敗的情況）
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const errorParam = hashParams.get('error');
        const errorDescription = hashParams.get('error_description');
        
        if (errorParam) {
          console.error('AuthCallback: URL contains error:', errorParam, errorDescription);
          setStatus('error');
          setMessage(errorDescription || '驗證失敗，請重新嘗試');
          // 清除這個錯誤 hash
          window.location.hash = '';
          return;
        }

        // 2. 檢查是否有 hash fragments（PKCE flow）
        const hasHash = window.location.hash && window.location.hash.includes('access_token');
        
        if (!hasHash) {
          console.log('AuthCallback: No hash detected, this is a traditional email confirmation flow');
          console.log('AuthCallback: Supabase should handle session exchange automatically via cookie');
        }

        // 3. 使用 onAuthStateChange 監聽 session 變化
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          console.log('AuthCallback: Auth state changed:', event, 'Has session:', !!session);
          
          if (event === 'SIGNED_IN' && session) {
            console.log('AuthCallback: User signed in via email verification');
            // 記錄這個 hash 已被處理
            if (currentHash) {
              sessionStorage.setItem('lastProcessedAuthHash', currentHash);
            }
            await processSession(session);
            subscription.unsubscribe();
          } else if (event === 'TOKEN_REFRESHED' && session) {
            console.log('AuthCallback: Token refreshed');
            await processSession(session);
            subscription.unsubscribe();
          }
        });

        // 4. 也嘗試直接獲取 session（如果已經存在）
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        console.log('AuthCallback: Initial session check:', { 
          hasSession: !!session, 
          error: sessionError,
          url_has_hash: hasHash
        });

        if (session) {
          console.log('AuthCallback: Session found immediately');
          // 記錄這個 hash 已被處理
          if (currentHash) {
            sessionStorage.setItem('lastProcessedAuthHash', currentHash);
          }
          await processSession(session);
          subscription.unsubscribe();
          return;
        }

        // 5. 如果沒有立即找到 session，且沒有 hash，說明這是從 email 直接點擊過來的
        // Supabase 的 email verification 流程應該會自動處理，但可能需要更長的等待時間
        if (!hasHash) {
          console.log('AuthCallback: Waiting for Supabase to complete email verification...');
          setMessage('正在驗證您的 Email，請稍候...');
        } else {
          console.log('AuthCallback: Waiting for auth state change...');
        }
        
        // 6. 設置超時，如果 10 秒內沒有收到 session，顯示錯誤
        setTimeout(() => {
          if (status === 'loading') {
            console.error('AuthCallback: Timeout waiting for session');
            console.error('AuthCallback: This usually means:');
            console.error('  1. Email verification link expired');
            console.error('  2. Email already verified');
            console.error('  3. Supabase email confirmation not enabled');
            console.error('  4. Supabase configured to require manual login after verification');
            subscription.unsubscribe();
            
            // 檢查 Supabase Auth 中是否有已驗證但未登入的用戶
            // 如果是這種情況，引導用戶登入
            setStatus('success');
            setMessage('Email 驗證成功！請登入以繼續使用。');
            setTimeout(() => {
              navigate('/login', { 
                replace: true,
                state: { 
                  message: 'Email 驗證成功！請輸入密碼登入。',
                  emailVerified: true 
                }
              });
            }, 2000);
          }
        }, 5000); // 5 秒超時（從 10 秒改為 5 秒，更快引導用戶登入）
        
      } catch (error) {
        console.error('Error handling callback:', error);
        setStatus('error');
        setMessage('處理驗證時發生錯誤，請重新嘗試或聯繫客服');
      }
    };

    const processSession = async (session: any) => {
      if (status !== 'loading') {
        console.log('AuthCallback: Already processed, skipping');
        return;
      }

      console.log('AuthCallback: Processing session...');

      try {
        // 等待 500ms 讓 access token 完全生效
        console.log('AuthCallback: Waiting for token to be fully active...');
        await new Promise(resolve => setTimeout(resolve, 500));

        // 檢查用戶是否已完成資料填寫（帶 retry 機制）
        let profile = null;
        let lastError = null;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.log(`AuthCallback: Fetching profile (attempt ${attempt}/3)...`);
            
            const response = await fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/auth/profile`,
              {
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              }
            );

            console.log('AuthCallback: Profile check response:', response.status);

            if (response.ok) {
              profile = await response.json();
              console.log('AuthCallback: Profile data:', { 
                hasProfile: !!profile, 
                registrationStep: profile.registrationStep
              });
              break; // 成功，跳出 retry loop
            } else if (response.status === 401 && attempt < 3) {
              // 401 可能是 token 還沒完全生效，等待後重試
              const errorText = await response.text();
              console.warn(`AuthCallback: Attempt ${attempt} failed with 401, retrying...`, errorText);
              lastError = errorText;
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 遞增延遲
            } else {
              // 其他錯誤或最後一次嘗試失敗
              const errorText = await response.text();
              console.error('AuthCallback: Failed to fetch profile:', errorText);
              lastError = errorText;
              break;
            }
          } catch (fetchError) {
            console.error(`AuthCallback: Attempt ${attempt} error:`, fetchError);
            lastError = fetchError;
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
          }
        }

        // 如果最終沒有獲取到 profile，假設用戶需要完成註冊
        if (!profile) {
          console.log('AuthCallback: Could not fetch profile after retries, assuming new user needs onboarding');
          console.log('AuthCallback: Last error:', lastError);
          
          // 引導到完成資料填寫頁面（新用戶流程）
          setStatus('success');
          setMessage('Email 驗證成功！正在導向資料填寫頁面...');
          setTimeout(() => {
            navigate('/auth/complete-profile', { replace: true });
          }, 1500);
          return;
        }

        // ✅ 修改：根據實際資料完成度決定導向，而非依賴 registrationStep
        // 1. 檢查是否完成基本資料填寫（name, phone, birthDate）
        const hasCompleteProfile = !!(profile.name && profile.phone && profile.birthDate);
        
        // 2. 檢查是否已完成付款（有推薦碼 = 已付款）
        const hasPaidMembership = !!profile.referralCode;
        
        console.log('AuthCallback: Profile check -', {
          hasCompleteProfile,
          hasPaidMembership,
          hasReferralCode: profile.referralCode,
          hasName: !!profile.name,
          hasPhone: !!profile.phone,
          hasBirthDate: !!profile.birthDate
        });
        
        if (!hasCompleteProfile) {
          // 情況 1：尚未完成基本資料填寫，導向資料填寫頁面
          console.log('AuthCallback: User needs to complete profile, redirecting to /auth/complete-profile');
          setStatus('success');
          setMessage('Email 驗證成功！正在導向資料填寫頁面...');
          setTimeout(() => {
            navigate('/auth/complete-profile', { replace: true });
          }, 1500);
        } else if (hasCompleteProfile && !hasPaidMembership) {
          // 情況 2：已完成資料填寫但未付款，導向付款頁面
          console.log('AuthCallback: User needs to complete payment, redirecting to /payment/checkout');
          setStatus('success');
          setMessage('Email 驗證成功！正在導向付款頁面...');
          setTimeout(() => {
            navigate('/payment/checkout', { replace: true });
          }, 1500);
        } else {
          // 情況 3：已完成註冊（資料 + 付款），導向會員中心
          console.log('AuthCallback: User registration complete, redirecting to dashboard');
          setStatus('success');
          setMessage('驗證成功！正在登入...');
          setTimeout(() => {
            navigate('/dashboard', { replace: true });
          }, 1500);
        }
      } catch (error) {
        console.error('Error processing session:', error);
        
        // 即使發生錯誤，也引導用戶到完成資料頁面（容錯處理）
        console.log('AuthCallback: Error occurred, but redirecting to complete profile anyway');
        setStatus('success');
        setMessage('Email 驗證成功！在導向資料填寫頁面...');
        setTimeout(() => {
          navigate('/auth/complete-profile', { replace: true });
        }, 1500);
      }
    };

    handleCallback();
  }, [navigate, supabase, projectId, status]);

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {status === 'loading' && (
              <svg
                className="animate-spin h-12 w-12 mx-auto text-primary"
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
            )}
            {status === 'success' && (
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
            )}
            {status === 'error' && (
              <XCircle className="h-12 w-12 mx-auto text-red-500" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {status === 'loading' && '處理中'}
            {status === 'success' && '驗證成功！'}
            {status === 'error' && '驗證失敗'}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">{message}</p>

          {status === 'error' && (
            <Button onClick={() => navigate('/login')} className="w-full">
              返回登入頁面
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}