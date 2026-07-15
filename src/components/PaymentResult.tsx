import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Loader2, CheckCircle, XCircle, Clock, CreditCard, AlertCircle } from 'lucide-react';
import { apiRequestJson, buildApiUrl } from '../utils/apiClient';

// 我們自己的訂單生命週期，只用來在沒有 status 參數時判斷該顯示什麼畫面——
// 實際成功/失敗的判斷與明細一律以 payuni（PayUni 原始回傳資料）為準。
type OrderStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

// ✅ PayUni 原始回傳資料，原樣顯示，不重新定義/轉換欄位
interface PayUniResponse {
  Status: string;            // 'SUCCESS' 表示成功，其他值皆視為失敗
  TradeNo?: string;          // PayUni 自己的交易編號
  AuthAmt?: string;          // 授權金額
  PayerName?: string;        // 付款人姓名
  PayerPhone?: string;       // 付款人電話
  PayerEmail?: string;       // 付款人 Email
  Card6No?: string;          // 卡號前 6 碼
  Card4No?: string;          // 卡號後 4 碼
  CardExpired?: string;      // 卡片到期日 (MMYY)
  AuthBankName?: string;     // 銀行名稱
  Message?: string;          // 訊息
  ResCode?: string;          // 回應代碼
  ResCodeMsg?: string;       // 回應代碼訊息
  [key: string]: any;
}

interface OrderResult {
  orderStatus: OrderStatus;
  completedAt?: string;
  payuni: PayUniResponse | null;
}

type ResolvedStatus = 'success' | 'failed' | 'pending' | 'unknown';

// 沒有輕量重試次數上限時，這裡最多再查幾次——只是給 webhook/return 端點
// 一點緩衝時間，不是等待劇場，所以次數很小、也不在畫面上顯示倒數。
const MAX_PENDING_RECHECKS = 2;

export function PaymentResult() {
  const [searchParams] = useSearchParams();

  const tradeNo = searchParams.get('tradeNo');
  // PayUni 導回時，後端 /payuni/return 已經解密並判定結果，直接把
  // status 帶在網址上——有這個值就不需要再等待或輪詢。
  const statusParam = searchParams.get('status');

  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  // 只有在網址沒有 status（例如舊連結、或 return 端點當下處理失敗的 fallback）
  // 時才需要等這次查詢。
  const [isLoadingStatus, setIsLoadingStatus] = useState(!statusParam);
  const [pendingRecheckCount, setPendingRecheckCount] = useState(0);

  // 背景抓訂單明細（付款人、卡片資訊、金額），純粹用來豐富成功/失敗畫面的顯示內容，
  // 不影響狀態判斷——狀態已經由 statusParam 或下面的 fallback 查詢決定。
  useEffect(() => {
    if (!tradeNo) {
      setIsLoadingStatus(false);
      return;
    }

    apiRequestJson<{ success: boolean; data: OrderResult }>(buildApiUrl(`/payuni/result/${tradeNo}`))
      .then((result) => {
        if (result.success) setOrderResult(result.data);
      })
      .catch(() => {
        // 忽略：如果網址已經有 status，這只是拿明細，失敗不影響畫面判斷
      })
      .finally(() => {
        if (!statusParam) setIsLoadingStatus(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeNo]);

  // 沒有 status 參數、查到的訂單仍是 pending 時，做少量輕量重試
  // （不是 12 次指數退避的等待劇場，只是給後端一點緩衝時間）。
  useEffect(() => {
    if (statusParam) return;
    if (!tradeNo) return;
    if (orderResult?.orderStatus !== 'pending') return;
    if (pendingRecheckCount >= MAX_PENDING_RECHECKS) return;

    const timer = setTimeout(() => {
      apiRequestJson<{ success: boolean; data: OrderResult }>(buildApiUrl(`/payuni/result/${tradeNo}`))
        .then((result) => {
          if (result.success) setOrderResult(result.data);
        })
        .catch(() => {})
        .finally(() => setPendingRecheckCount((n) => n + 1));
    }, 3000);

    return () => clearTimeout(timer);
  }, [statusParam, tradeNo, orderResult, pendingRecheckCount]);

  const resolvedStatus: ResolvedStatus = statusParam === 'SUCCESS'
    ? 'success'
    : statusParam === 'FAILED'
      ? 'failed'
      : orderResult?.orderStatus === 'completed'
        ? 'success'
        : orderResult?.orderStatus === 'failed' || orderResult?.orderStatus === 'cancelled'
          ? 'failed'
          : orderResult?.orderStatus === 'pending'
            ? 'pending'
            : 'unknown';

  const handleGoToDashboard = () => {
    window.location.href = '/dashboard';
  };

  const handleRetryPayment = () => {
    window.location.href = '/payment/checkout';
  };

  const handleContactSupport = () => {
    window.open('https://line.me/ti/p/@Uknow', '_blank');
  };

  if (!tradeNo) {
    return (
      <div className="container max-w-2xl mx-auto p-4 pt-20" data-testid="payment-result-missing-tradeno">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">查詢訂單失敗</CardTitle>
            <CardDescription>缺少訂單編號</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleContactSupport} className="w-full" size="lg" data-testid="contact-support-button">
              聯絡官方客服
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 只有網址沒有 status（fallback 情境）時，才會短暫出現這個畫面
  if (isLoadingStatus) {
    return (
      <div className="container max-w-2xl mx-auto p-4 pt-20">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Loader2 className="h-16 w-16 text-blue-600 animate-spin" />
            </div>
            <CardTitle className="text-2xl">查詢付款結果中</CardTitle>
            <CardDescription>請稍候，正在確認您的付款狀態</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // 付款成功（以 PayUni 自己回傳的 Status 為準，不重新定義一套詞彙）
  if (resolvedStatus === 'success') {
    const paymentData = orderResult?.payuni;

    const formatCardExpiry = (expiry?: string) => {
      if (expiry && expiry.length === 4) {
        return `${expiry.substring(0, 2)}/${expiry.substring(2)}`;
      }
      return expiry;
    };

    return (
      <div className="container max-w-2xl mx-auto p-4 pt-20" data-testid="payment-result-success">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-600" />
            </div>
            <CardTitle className="text-2xl">付款成功！</CardTitle>
            <CardDescription>您的付款已成功處理，帳號已完成註冊</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {paymentData && (
              <div className="bg-gradient-to-br from-green-50 to-blue-50 border border-green-200 rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-green-200">
                  <CreditCard className="h-5 w-5 text-green-600" />
                  <h3 className="text-base font-semibold text-green-800">付款資訊</h3>
                </div>

                {(paymentData.PayerName || paymentData.PayerPhone || paymentData.PayerEmail) && (
                  <div className="border-b border-green-200 p-3 space-y-2">
                    {paymentData.PayerName && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">付款人姓名</span>
                        <span className="text-sm text-gray-900 font-medium">{paymentData.PayerName}</span>
                      </div>
                    )}
                    {paymentData.PayerPhone && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">付款人電話</span>
                        <span className="text-sm text-gray-900">{paymentData.PayerPhone}</span>
                      </div>
                    )}
                    {paymentData.PayerEmail && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">付款人Email</span>
                        <span className="text-sm text-gray-900 break-all">{paymentData.PayerEmail}</span>
                      </div>
                    )}
                  </div>
                )}

                {(paymentData.AuthBankName || paymentData.Card6No) && (
                  <div className="border-b border-green-200 p-3 space-y-2">
                    {paymentData.AuthBankName && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">信用卡銀行</span>
                        <span className="text-sm text-gray-900 font-medium">{paymentData.AuthBankName}</span>
                      </div>
                    )}
                    {paymentData.Card6No && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">信用卡號</span>
                        <span className="text-sm text-gray-900 font-mono">
                          {paymentData.Card6No} ****** {paymentData.Card4No}
                        </span>
                      </div>
                    )}
                    {paymentData.CardExpired && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">到期日</span>
                        <span className="text-sm text-gray-900">{formatCardExpiry(paymentData.CardExpired)}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">訂單編號</span>
                    <span className="text-sm text-gray-900 font-mono">{paymentData.TradeNo || tradeNo}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">付款金額</span>
                    <span className="text-lg text-green-600 font-bold">NT$ {paymentData.AuthAmt || '1,200'}</span>
                  </div>
                </div>
              </div>
            )}

            <Button onClick={handleGoToDashboard} className="w-full" size="lg" data-testid="go-to-dashboard-button">
              前往會員中心
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 付款失敗（原因直接來自 PayUni 回傳資料）
  if (resolvedStatus === 'failed') {
    const failReason = orderResult?.payuni?.ResCodeMsg || orderResult?.payuni?.Message;
    return (
      <div className="container max-w-2xl mx-auto p-4 pt-20" data-testid="payment-result-failed">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <XCircle className="h-16 w-16 text-red-600" />
            </div>
            <CardTitle className="text-2xl">付款失敗</CardTitle>
            <CardDescription>很抱歉，您的付款未成功</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {failReason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800 font-medium">錯誤原因：</p>
                <p className="text-sm text-red-800 mt-1">{failReason}</p>
                {orderResult?.payuni?.ResCode && (
                  <p className="text-xs text-red-600 mt-2">錯誤代碼：{orderResult.payuni.ResCode}</p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={handleRetryPayment} className="flex-1" size="lg" data-testid="retry-payment-button">
                重新付款
              </Button>
              <Button onClick={handleContactSupport} variant="outline" className="flex-1" size="lg" data-testid="contact-support-button">
                聯繫客服
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 處理中：webhook / return 端點都還沒把結果落地——款項已受理，不會造成
  // 重複扣款或款項遺失，讓使用者可以安心離開，不用一直守在這個頁面。
  if (resolvedStatus === 'pending') {
    return (
      <div className="container max-w-2xl mx-auto p-4 pt-20" data-testid="payment-result-pending">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Clock className="h-16 w-16 text-orange-600 animate-pulse" />
            </div>
            <CardTitle className="text-2xl">款項確認中</CardTitle>
            <CardDescription>您的付款已受理，系統正在確認中</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-2">
              <p className="text-sm text-orange-800">
                訂單編號：<span className="font-mono">{tradeNo}</span>
              </p>
              <p className="text-sm text-orange-800">
                這不會造成您重複扣款或款項遺失，您可以安心先關閉此頁——完成確認後，會員中心會自動顯示最新狀態。
              </p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-yellow-700">
                    如果過一段時間後會員中心仍未更新，歡迎聯繫客服協助確認。
                  </p>
                  <Button
                    onClick={handleContactSupport}
                    variant="link"
                    className="text-yellow-800 underline p-0 h-auto mt-1"
                    data-testid="contact-support-button"
                  >
                    聯繫客服
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 未知狀態
  return (
    <div className="container max-w-2xl mx-auto p-4 pt-20" data-testid="payment-result-unknown">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">查詢訂單失敗</CardTitle>
          <CardDescription>無法查詢到訂單資訊</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-800">訂單編號：{tradeNo}</p>
          </div>
          <Button onClick={handleContactSupport} className="w-full" size="lg" data-testid="contact-support-button">
            聯絡官方客服
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
