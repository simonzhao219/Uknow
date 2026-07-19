import React, { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Loader2 } from 'lucide-react';
import { UserContext } from '../App';
import { createClient } from '../utils/supabase/client';
import { useNotification } from './notifications/NotificationContext';
import { getInputErrorClass, FieldError } from '../utils/formHelpers';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';  // ✅ 新增統一 API 請求工具
import { getPendingReferral, clearPendingReferral } from '../utils/referralInvite';
import { validateProfileForm } from '../utils/profileValidation';
import { resolveProfilePageRedirect } from '../utils/registrationFlow';

export function CompleteProfile() {
  const [formData, setFormData] = useState({
    name: '',
    nationalId: '',  // ✅ 新增身分證字號欄位
    phone: '',
    birthDate: '',
    referralCode: '',
    agreedToTerms: false,
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [verifiedReferralCode, setVerifiedReferralCode] = useState('');
  const [referrerName, setReferrerName] = useState('');
  const hasConfirmedReferralCode = useRef(false);

  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast, showSuccess, showNotification } = useNotification();
  const supabase = createClient();

  // 「編輯」意圖：從結帳頁按「編輯」回來的人，資料本來就填齊了。若守衛只看
  // 「資料是否存在」就會把想改資料的人立刻彈回結帳頁（本次修的 bug）。
  // 意圖以 React Router 的 location.state 傳遞（PaymentCheckout.handleEdit 設定）。
  const isEditing = !!(location.state as { editing?: boolean } | null)?.editing;

  // 編輯模式回填：把使用者剛剛在結帳頁看到的資料帶回表單，讓「編輯」名副其實
  // （而不是一張空白表單）。資料來源是 handleEdit 存進 localStorage 的 pendingUser
  // 快照，它是使用者當下看到的內容，且含推薦人姓名。
  //
  // 特別注意推薦碼：後端 /auth/register 會把 referred_by_code 寫成這次送出的值，
  // 若編輯時把推薦碼欄位留空再送出，會「清掉」原本的推薦關係。因此必須回填
  // referredByCode，並把它預先標記為已驗證（本來就是綁定中的有效碼），使用者
  // 不必為了改個電話而被迫重新驗證推薦碼。
  useEffect(() => {
    if (!isEditing) return;
    try {
      const raw = localStorage.getItem('pendingUser');
      if (!raw) return;
      const snapshot = JSON.parse(raw);
      const boundCode = (snapshot.referredByCode || '').toLowerCase();
      setFormData((prev) => ({
        ...prev,
        name: snapshot.name || '',
        nationalId: snapshot.nationalId || '',
        phone: snapshot.phone || '',
        birthDate: snapshot.birthDate || '',
        referralCode: boundCode,
        // 走到結帳頁代表先前已同意過服務條款，編輯時不再要求重新勾選。
        agreedToTerms: true,
      }));
      if (boundCode) {
        setVerifiedReferralCode(boundCode);
        setCodeVerified(true);
        if (snapshot.referrerName) setReferrerName(snapshot.referrerName);
      }
    } catch (error) {
      console.error('CompleteProfile: Error prefilling edit data:', error);
    }
    // 僅在掛載時依 isEditing 執行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // 檢查用戶是否已登入，並獲取 profile
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          console.log('CompleteProfile: No session found, redirecting to login');
          showToast('請先登入', 'error');
          navigate('/login', { replace: true });
          return;
        }

        // 嘗試加載現有的 profile
        const response = await fetch(
          buildApiUrl('/auth/profile'),
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (response.ok) {
          const profile = await response.json();
          console.log('CompleteProfile: Loaded profile:', profile);

          // 導向決策收斂到單一純函式（見 registrationFlow.ts），不再在頁面內
          // 各寫一份 if/else。editing=true 時一律留在本頁讓使用者改資料。
          const redirect = resolveProfilePageRedirect(profile.registrationStep, { editing: isEditing });

          if (redirect === '/dashboard') {
            // 已完成註冊：保留原本的友善提示與短暫延遲。
            console.log('CompleteProfile: User already completed registration, redirecting to dashboard');
            showToast('您已完成註冊，正在跳轉到會員中心...', 'info');
            setTimeout(() => {
              navigate('/dashboard', { replace: true });
            }, 1000);
            return;
          }

          if (redirect) {
            console.log('CompleteProfile: Redirecting to', redirect);
            navigate(redirect, { replace: true });
            return;
          }
          // redirect === null：留在本頁（新用戶填資料，或使用者要編輯既有資料）。
        }
      } catch (error) {
        console.error('CompleteProfile: Error checking profile:', error);
        // 發生錯誤時，允許用戶繼續填寫資料
      }
    };
    checkSession();
  }, [supabase, navigate, showToast, isEditing]);

  // 邀請連結帶進來的推薦碼：掛載時自動填入並驗證（顯示推薦人姓名），欄位仍可修改。
  // 只在欄位為空時帶入，避免覆蓋使用者手動輸入的值。
  useEffect(() => {
    // 編輯模式已回填綁定中的推薦碼，別讓邀請連結的暫存碼蓋掉它。
    if (isEditing) return;
    const pending = getPendingReferral();
    if (pending && !formData.referralCode) {
      setFormData((prev) => ({ ...prev, referralCode: pending }));
      verifyReferralCode(pending);
    }
    // 僅在掛載時執行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 驗證規則集中在 src/utils/profileValidation.ts（純函式、有單元測試），
  // 這裡只負責把當前 formData 丟進去、拿回錯誤 map。
  const validateForm = () => validateProfileForm(formData);

  // 欄位在畫面上的先後順序，用來把焦點移到「第一個」有問題的欄位。
  const FIELD_ORDER = ['name', 'nationalId', 'birthDate', 'phone', 'referralCode', 'agreedToTerms'];
  const FIELD_FOCUS_ID: { [key: string]: string } = {
    name: 'name',
    nationalId: 'nationalId',
    birthDate: 'birthDate',
    phone: 'phone',
    referralCode: 'referralCode',
    agreedToTerms: 'terms',
  };

  const focusFirstError = (errs: { [key: string]: string }) => {
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (!first) return;
    const el = document.getElementById(FIELD_FOCUS_ID[first]);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 用 requestAnimationFrame 等捲動後再 focus，避免焦點把畫面又拉走
      requestAnimationFrame(() => (el as HTMLElement).focus?.());
    }
  };

  // 失焦時只驗證「該欄位」，讓使用者一離開欄位就看到紅字提示，
  // 而不是把整張表單的錯誤一次全部亮起來。
  const handleBlur = (field: string) => {
    const all = validateForm();
    setErrors((prev) => ({ ...prev, [field]: all[field] || '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 驗證表單
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      // 一次亮出所有問題欄位的紅字（setErrors 直接覆蓋），而不是只有一個 toast
      setErrors(validationErrors);
      // 顯示第一個錯誤並把焦點移過去
      const firstErrorKey = FIELD_ORDER.find((f) => validationErrors[f]);
      const firstError = firstErrorKey ? validationErrors[firstErrorKey] : Object.values(validationErrors)[0];
      showToast(firstError, 'error');
      focusFirstError(validationErrors);
      return;
    }

    // 推薦碼已填但尚未驗證：在此明確擋下並給出可執行的下一步，避免按鈕看似可按卻無反應
    if (formData.referralCode.trim() && !(codeVerified && formData.referralCode === verifiedReferralCode)) {
      setCodeError('請先點「驗證」確認推薦碼，或清空此欄位');
      showToast('請先驗證推薦碼', 'warning');
      focusFirstError({ referralCode: 'x' });
      return;
    }

    // ✅ 推薦碼確認警告（無論有沒有填推薦碼都要顯示）
    if (!hasConfirmedReferralCode.current) {
      // 準備警告訊息的詳細資訊
      const details: string[] = [];
      
      if (formData.referralCode.trim() && referrerName) {
        // 有填推薦碼：顯示推薦碼和推薦人
        details.push(`推薦碼：${formData.referralCode}`);
        details.push(`推薦人：${referrerName}`);
      } else {
        // 沒有填推薦碼：提示將沒有推薦人
        details.push('您未填寫推薦碼');
      }
      
      // 顯示警告卡片
      showNotification({
        type: 'warning',
        title: '重要提醒',
        message: '推薦碼註冊後將永久綁定，無法修改。請再次確認您的推薦碼資訊是否正確。',
        details,
        confirmText: '確認無誤，繼續',
        cancelText: '返回檢查',
        onConfirm: () => {
          // 設定已確認，然後重新觸發提交
          hasConfirmedReferralCode.current = true;
          // 使用 setTimeout 確保狀態更新後再提交
          setTimeout(() => {
            handleSubmit(e);
          }, 100);
        },
        onCancel: () => {
          // 什麼都不做，停留在當前頁面
          console.log('User cancelled referral code confirmation');
        }
      });
      return;
    }

    // ✅ 如果有輸入推薦碼，必須先驗證
    if (formData.referralCode.trim()) {
      // 檢查是否已驗證
      if (!codeVerified || formData.referralCode !== verifiedReferralCode) {
        showToast('請先驗證推薦碼', 'warning');
        setCodeError('請先驗證推薦碼');
        return;
      }
      
      // ✅ 即使已驗證，點擊下一步時再驗證一次（確保推薦碼仍然有效）
      setIsLoading(true);
      try {
        const result = await apiRequestJson<{ 
          valid: boolean;
          referrerName?: string;
          referrerUserId?: string;
          error?: { message: string };
        }>(
          buildApiUrl('/listings/verify-referral-code'),
          {
            method: 'POST',
            body: JSON.stringify({
              referralCode: formData.referralCode.toLowerCase().trim(),
              currentUserId: null
            }),
          }
        );

        if (!result.valid) {
          showToast(result.error?.message || '推薦碼無效，請重新驗證', 'error');
          setCodeError(result.error?.message || '推薦碼無效');
          setCodeVerified(false);
          setVerifiedReferralCode('');
          setReferrerName('');
          setIsLoading(false);
          return;
        }
        
        // 驗證成功，更新推薦人姓名（可能已變更）
        if (result.referrerName) {
          setReferrerName(result.referrerName);
        }
      } catch (err: any) {
        console.error('CompleteProfile: Re-verification error:', err);
        showToast(err.message || '推薦碼驗證失敗，請稍後再試', 'error');
        setCodeError(err.message || '推薦碼驗證失敗');
        setCodeVerified(false);
        setVerifiedReferralCode('');
        setReferrerName('');
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);

    try {
      console.log('CompleteProfile: Starting profile submission...');
      
      // 取得當前 session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('CompleteProfile: No session found');
        showToast('登入狀態已過期，請重新登入', 'error');
        navigate('/login');
        return;
      }

      console.log('CompleteProfile: Session found, submitting profile data...');

      // 呼叫後端儲存資料
      const response = await fetch(
        buildApiUrl('/auth/register'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name: formData.name,
            nationalId: formData.nationalId,  // ✅ 新增身分證字號欄位
            phone: formData.phone,
            birthDate: formData.birthDate,
            referralCode: formData.referralCode,
          }),
        }
      );

      console.log('CompleteProfile: API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('CompleteProfile: API error:', errorData);
        throw new Error(errorData.error || '註冊失敗');
      }

      const profile = await response.json();
      console.log('CompleteProfile: Profile created successfully:', profile);

      // ✅ 1. 保存到 localStorage（給 PaymentCheckout 使用）
      // ✅ 手動加入推薦人姓名（前端已驗證時獲取）
      const pendingUserData = {
        ...profile,
        referrerName: referrerName || null  // 加入推薦人姓名
      };
      localStorage.setItem('pendingUser', JSON.stringify(pendingUserData));

      // ✅ 2. 設置 user 到 UserContext（讓 ProtectedRoute 通過）
      setUser(profile);
      localStorage.setItem('user', JSON.stringify(profile));

      // 推薦碼已隨註冊送出綁定，清除暫存以免污染下一位使用者
      clearPendingReferral();

      // 顯示簡單提示（自動消失，不阻塞）
      showToast('基本資訊已儲存，請完成付款', 'success');

      // 導向付款頁面
      navigate('/payment/checkout', { replace: true });
    } catch (error: any) {
      console.error('CompleteProfile: Error completing profile:', error);
      showToast(error.message || '註冊失敗，請稍後再試', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLaterSignup = async () => {
    try {
      console.log('CompleteProfile: User chose to sign up later, cleaning up...');
      
      // 1. 取得當前 session，用於呼叫後端刪除帳號
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // 2. 呼叫後端刪除未完成的用戶帳號
        try {
          console.log('CompleteProfile: Calling cancel-signup API...');
          const response = await fetch(
            buildApiUrl('/auth/cancel-signup'),
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );
          
          if (response.ok) {
            console.log('CompleteProfile: Account deleted successfully');
          } else {
            console.error('CompleteProfile: Failed to delete account, status:', response.status);
          }
        } catch (error) {
          console.error('CompleteProfile: Error calling cancel-signup API:', error);
        }
      }
      
      // 3. 清除本地狀態（在登出前先清除，避免競態條件）
      setUser(null);
      localStorage.removeItem('user');
      clearPendingReferral();
      
      // 4. 登出 Supabase session（確保完全登出）
      console.log('CompleteProfile: Signing out from Supabase...');
      await supabase.auth.signOut();
      
      // 5. 顯示提示訊息
      showToast('您可以稍後再完��註冊', 'info');
      
      // 6. 等待一小段時間確保 session 清除完成，然後導向首頁
      setTimeout(() => {
        console.log('CompleteProfile: Navigating to home page...');
        navigate('/', { replace: true });
      }, 100);
    } catch (error: any) {
      console.error('CompleteProfile: Error during cancellation:', error);
      
      // 即使發生錯誤，也要嘗試清除狀態並導航
      setUser(null);
      localStorage.removeItem('user');
      await supabase.auth.signOut();
      showToast('已取消註冊', 'info');
      navigate('/', { replace: true });
    }
  };

  // codeArg 讓「自動帶入」能用明確的推薦碼驗證，避免 setState 後才 verify 時讀到舊 state。
  // 注意：按鈕的 onClick 會把事件物件當第一參數傳進來，所以只在 codeArg 是字串時才採用。
  const verifyReferralCode = async (codeArg?: string) => {
    const code = typeof codeArg === 'string' ? codeArg : formData.referralCode;
    if (!code.trim()) {
      setCodeError('請輸入推薦碼');
      return;
    }

    setIsVerifyingCode(true);
    setCodeError('');

    try {
      // ✅ 使用統一的 API 請求工具
      const result = await apiRequestJson<{
        valid: boolean;
        referrerName?: string;
        referrerUserId?: string;
        error?: { message: string };
      }>(
        buildApiUrl('/listings/verify-referral-code'),
        {
          method: 'POST',
          body: JSON.stringify({
            referralCode: code.toLowerCase().trim(),
            currentUserId: null  // ✅ 註冊流程中用戶還沒有完整的 profile，傳 null
          }),
        }
      );

      if (result.valid && result.referrerName) {
        setCodeVerified(true);
        setCodeError('');
        setVerifiedReferralCode(code);  // ✅ 儲存已驗證的推薦碼
        setReferrerName(result.referrerName);  // ✅ 儲存推薦人姓名
        showToast('推薦碼驗證成功', 'success');  // ✅ 只顯示簡單訊息
      } else {
        setCodeError(result.error?.message || '推薦碼無效');
        setCodeVerified(false);
        setVerifiedReferralCode('');
        setReferrerName('');
        showToast(result.error?.message || '推薦碼無效', 'error');
      }
    } catch (err: any) {
      console.error('CompleteProfile: Referral code verification error:', err);
      
      if (err instanceof ApiError && err.status === 401) {
        setCodeError('登入已過期，請重新登入');
        showToast('登入已過期，請重新登入', 'error');
      } else {
        setCodeError(err.message || '推薦碼驗證失敗，請稍後再試');
        showToast(err.message || '推薦碼驗證失敗', 'error');
      }
      setCodeVerified(false);
      setVerifiedReferralCode('');
      setReferrerName('');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  // 推薦碼已填但尚未驗證（或驗證後又被改動）——用來在欄位下方顯示提醒，
  // 但「不再」拿來讓按鈕反灰；按鈕永遠可按，點下去才明確告訴使用者卡在哪。
  const referralNeedsVerify =
    !!formData.referralCode.trim() &&
    !(codeVerified && formData.referralCode === verifiedReferralCode);

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">完善個人資料</CardTitle>
          <CardDescription>最後一步，請填寫您的基本資料</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 姓名 */}
            <div className="space-y-2">
              <Label htmlFor="name">姓名 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => {
                  if (e.target.value.length <= 10) {
                    setFormData({ ...formData, name: e.target.value });
                    setErrors({ ...errors, name: '' });
                  }
                }}
                onBlur={() => handleBlur('name')}
                placeholder="請輸入身分證上的姓名"
                maxLength={10}
                className={getInputErrorClass(!!errors.name)}
              />
              <div className="text-right text-sm text-muted-foreground">
                {formData.name.length}/10
              </div>
              <FieldError error={errors.name} />
            </div>

            {/* 身分證字號 */}
            <div className="space-y-2">
              <Label htmlFor="nationalId">身份證字號 *</Label>
              <Input
                id="nationalId"
                value={formData.nationalId}
                onChange={(e) => {
                  setFormData({ ...formData, nationalId: e.target.value });
                  setErrors({ ...errors, nationalId: '' });
                }}
                onBlur={() => handleBlur('nationalId')}
                placeholder="A123456789"
                maxLength={10}
                className={getInputErrorClass(!!errors.nationalId)}
              />
              <FieldError error={errors.nationalId} />
              <p className="text-sm text-muted-foreground">
                格式：1 碼英文字母 + 9 碼數字，第 2 碼為 1（男）或 2（女），例：A123456789
              </p>
            </div>

            {/* 生日 */}
            <div className="space-y-2">
              <Label htmlFor="birthDate">出生年月日 *</Label>
              <Input
                id="birthDate"
                type="date"
                value={formData.birthDate}
                max={(() => {
                  const today = new Date();
                  const eighteenYearsAgo = new Date(
                    today.getFullYear() - 18,
                    today.getMonth(),
                    today.getDate()
                  );
                  return eighteenYearsAgo.toISOString().split('T')[0];
                })()}
                onChange={(e) => {
                  setFormData({ ...formData, birthDate: e.target.value });
                  setErrors({ ...errors, birthDate: '' });
                }}
                onBlur={() => handleBlur('birthDate')}
                className={getInputErrorClass(!!errors.birthDate)}
              />
              <FieldError error={errors.birthDate} />
              <p className="text-sm text-muted-foreground">
                註冊用戶需年滿 18 歲
              </p>
            </div>
            
            {/* 手機號碼 */}
            <div className="space-y-2">
              <Label htmlFor="phone">手機號碼 *</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => {
                  setFormData({ ...formData, phone: e.target.value });
                  setErrors({ ...errors, phone: '' });
                }}
                onBlur={() => handleBlur('phone')}
                placeholder="09XXXXXXXX"
                maxLength={10}
                className={getInputErrorClass(!!errors.phone)}
              />
              <FieldError error={errors.phone} />
              <p className="text-sm text-muted-foreground">
                台灣手機號碼格式：09 開頭，共 10 位數
              </p>
            </div>

            {/* 推薦碼 */}
            <div className="space-y-2">
              <Label htmlFor="referralCode">推薦碼 (選填)</Label>
              <div className="flex gap-2">
                <Input
                  id="referralCode"
                  value={formData.referralCode}
                  onChange={(e) => {
                    const newCode = e.target.value.toLowerCase(); // ✅ 立即轉小寫
                    setFormData({ ...formData, referralCode: newCode });
                    setCodeError('');
                    
                    // ✅ 如果推薦碼改變，清除驗證狀態和確認狀態
                    if (newCode !== verifiedReferralCode) {
                      setCodeVerified(false);
                      setReferrerName('');
                      hasConfirmedReferralCode.current = false;
                    }
                  }}
                  placeholder="輸入推薦碼"
                  className={getInputErrorClass(!!codeError)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => verifyReferralCode()}
                  disabled={isVerifyingCode || !formData.referralCode.trim() || (codeVerified && formData.referralCode === verifiedReferralCode)}
                  className="shrink-0"
                >
                  {isVerifyingCode ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      驗證中
                    </>
                  ) : (
                    '驗證'
                  )}
                </Button>
              </div>
              <FieldError error={codeError} />

              {/* 已填但尚未驗證：主動提示，避免使用者以為「填了就好」卻在按鈕卡住 */}
              {referralNeedsVerify && !codeError && (
                <p className="text-sm text-amber-600" data-testid="referral-code-hint">
                  尚未驗證，請點右側「驗證」，或清空此欄位後即可繼續
                </p>
              )}

              {/* ✅ 推薦人姓名顯示 */}
              {referrerName && !referralNeedsVerify && (
                <p className="text-sm text-green-600" data-testid="referral-code-status">
                  推薦人：{referrerName}
                </p>
              )}
            </div>

            {/* 服務條款 */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="terms"
                  checked={formData.agreedToTerms}
                  onCheckedChange={(checked) => {
                    setFormData({ ...formData, agreedToTerms: checked as boolean });
                    setErrors({ ...errors, agreedToTerms: '' });
                  }}
                />
                <Label htmlFor="terms" className="text-sm cursor-pointer">
                  我已詳讀並同意 <Link to="/terms-of-service" className="text-primary underline" onClick={(e) => e.stopPropagation()}>服務條款</Link>
                </Label>
              </div>
              <FieldError error={errors.agreedToTerms} />
            </div>

            {/* 提交按鈕 */}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              onClick={handleSubmit}
              data-testid="profile-submit-button"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  處理中...
                </>
              ) : (
                '下一步'
              )}
            </Button>

            {/* 稍後註冊按鈕 */}
            <Button
              type="button"
              variant="outline"
              className="w-full mt-2"
              onClick={handleLaterSignup}
            >
              稍後註冊
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}