import React, { useState, useEffect } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';

interface IdNumberInputProps {
  value: string;
  onChange: (value: string) => void;
  onVerified: (idNumber: string) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
}

type VerificationStatus = 'idle' | 'verifying' | 'success' | 'error';

/**
 * 可重用的身分證輸入驗證組件
 * 
 * 功能：
 * - 輸入滿 10 個字符時自動驗證
 * - 顯示驗證狀態（驗證中、成功、失敗）
 * - 驗證成功後調用 onVerified 回調
 */
export function IdNumberInput({
  value,
  onChange,
  onVerified,
  disabled = false,
  label = '身分證字號',
  placeholder = '例如：A123456789'
}: IdNumberInputProps) {
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // ✅ 當輸入值變化時，自動驗證
  useEffect(() => {
    // 重置驗證狀態
    if (value.length < 10) {
      setStatus('idle');
      setErrorMessage('');
      return;
    }

    // 格式驗證
    const idPattern = /^[A-Z][12]\d{8}$/;
    if (!idPattern.test(value.toUpperCase())) {
      setStatus('error');
      setErrorMessage('身分證字號格式不正確');
      return;
    }

    // 自動調用後端驗證
    verifyIdNumber(value.toUpperCase());
  }, [value]);

  const verifyIdNumber = async (idNumber: string) => {
    try {
      setStatus('verifying');
      setErrorMessage('');

      const result = await apiRequestJson<{ success: boolean; message?: string }>(
        buildApiUrl('/rewards/verify-id'),
        {
          method: 'POST',
          body: JSON.stringify({ idNumber })
        }
      );

      if (result.success) {
        setStatus('success');
        setErrorMessage('');
        // ✅ 驗證成功，通知父組件（傳遞當前 props 中的 value，確保一致性）
        onVerified(value);
      } else {
        setStatus('error');
        setErrorMessage(result.message || '身分證字號不正確');
      }
    } catch (err) {
      console.error('驗證身分證錯誤:', err);
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : '驗證失敗，請稍後再試');
    }
  };

  // ✅ 根據驗證狀態顯示圖標
  const getStatusIcon = () => {
    switch (status) {
      case 'verifying':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return null;
    }
  };

  // ✅ 根據驗證狀態設置邊框顏色
  const getBorderClass = () => {
    switch (status) {
      case 'success':
        return 'border-green-500 focus-visible:ring-green-500';
      case 'error':
        return 'border-red-500 focus-visible:ring-red-500';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="idNumber">{label}</Label>
      <div className="relative">
        <Input
          id="idNumber"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          maxLength={10}
          className={`uppercase pr-10 ${getBorderClass()}`}
          disabled={disabled}
        />
        {/* 驗證狀態圖標 */}
        {status !== 'idle' && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {getStatusIcon()}
          </div>
        )}
      </div>

      {/* 錯誤提示 */}
      {status === 'error' && errorMessage && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}

      {/* 成功提示 */}
      {status === 'success' && (
        <p className="text-sm text-green-600">✓ 身分證驗證成功</p>
      )}

      {/* 格式說明 */}
      {status === 'idle' && (
        <p className="text-xs text-muted-foreground">
          格式：1個英文字母 + 9個數字（例如：A123456789）
        </p>
      )}

      {/* 驗證中提示 */}
      {status === 'verifying' && (
        <p className="text-sm text-blue-600">驗證中...</p>
      )}
    </div>
  );
}