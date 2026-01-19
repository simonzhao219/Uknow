import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { IdNumberVerification } from './IdNumberVerification';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';

/**
 * 三步驟Dialog配置介面
 */
export interface ThreeStepConfig {
  // Dialog標題
  title: string;
  
  // 步驟1配置
  step1: {
    title: string;
    description: string;
    content: React.ReactNode;
    nextButtonText?: string;
  };
  
  // 步驟2配置（預覽變化）
  step2: {
    title: string;
    description: string;
    apiEndpoint?: string;  // 如果提供，將自動獲取預覽數據
    content: (data: any) => React.ReactNode;  // 接收預覽數據，返回渲染內容
    nextButtonText?: string;
  };
  
  // 步驟3配置（身分證驗證）
  step3: {
    title?: string;
    description?: string;
    warningMessage: string;  // 最後確認的警告訊息
    confirmButtonText?: string;
  };
}

interface ThreeStepDialogProps {
  isOpen: boolean;
  config: ThreeStepConfig;
  onClose: () => void;
  onConfirm: (idNumber: string) => Promise<void>;
  defaultPreviewData?: any;  // Fallback數據（如果API獲取失敗）
}

/**
 * ✅ 通用的三步驟驗證Dialog組件
 * 
 * 統一處理：
 * - 步驟狀態管理（1 → 2 → 3）
 * - 步驟2的API數據獲取
 * - 載入狀態和錯誤處理
 * - 步驟3的身分證驗證
 * 
 * 使用範例：
 * ```tsx
 * const config = createClaimRewardConfig(reward);
 * 
 * <ThreeStepDialog
 *   isOpen={isOpen}
 *   config={config}
 *   onClose={handleClose}
 *   onConfirm={handleConfirm}
 * />
 * ```
 */
export function ThreeStepDialog({
  isOpen,
  config,
  onClose,
  onConfirm,
  defaultPreviewData
}: ThreeStepDialogProps) {
  const [step, setStep] = useState(1);
  const [previewData, setPreviewData] = useState<any>(null);  // ✅ 不再使用 defaultPreviewData 初始化
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ===== 步驟2：自動獲取預覽數據 =====
  useEffect(() => {
    // ✅ 移除 !previewData 條件，確保總是調用 API 獲取最新的 SSOT 數據
    if (step === 2 && config.step2.apiEndpoint) {
      fetchPreviewData();
    }
  }, [step, config.step2.apiEndpoint]);

  const fetchPreviewData = async () => {
    if (!config.step2.apiEndpoint) {
      setPreviewData(defaultPreviewData);
      return;
    }

    try {
      setIsLoadingPreview(true);
      setPreviewError(null);

      const result = await apiRequestJson<{
        success: boolean;
        data: any;
      }>(buildApiUrl(config.step2.apiEndpoint));

      if (result.success) {
        setPreviewData(result.data);
      } else {
        throw new Error('獲取預覽數據失敗');
      }
    } catch (err) {
      console.error('❌ 獲取預覽數據失敗:', err);
      setPreviewError(err instanceof Error ? err.message : '獲取數據失敗，請稍後再試');
      
      // Fallback到默認數據
      if (defaultPreviewData) {
        setPreviewData(defaultPreviewData);
      }
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // ===== 步驟導航 =====
  const handleNext = () => {
    setStep(step + 1);
    setSubmitError(null);
  };

  const handleBack = () => {
    setStep(step - 1);
    setSubmitError(null);
  };

  // ===== 最終確認 =====
  const handleConfirm = async (idNumber: string) => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);
      await onConfirm(idNumber);
      // 成功後由父組件處理（顯示通知、關閉Dialog等）
      handleReset();
    } catch (err) {
      console.error('❌ 確認操作失敗:', err);
      setSubmitError(err instanceof Error ? err.message : '操作失敗，請稍後再試');
      throw err; // 拋出錯誤讓IdNumberVerification知道失敗了
    } finally {
      setIsSubmitting(false);
    }
  };

  // ===== 重置狀態 =====
  const handleReset = () => {
    setStep(1);
    setPreviewData(null);  // ✅ 清空預覽數據，確保下次打開時重新獲取
    setIsLoadingPreview(false);
    setPreviewError(null);
    setIsSubmitting(false);
    setSubmitError(null);
  };

  // ===== 關閉Dialog =====
  const handleClose = () => {
    handleReset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      {/* 步驟1：確認操作 */}
      {step === 1 && (
        <StepOneCard
          title={config.step1.title}
          description={config.step1.description}
          content={config.step1.content}
          nextButtonText={config.step1.nextButtonText}
          onNext={handleNext}
          onClose={handleClose}
        />
      )}

      {/* 步驟2：預覽變化 */}
      {step === 2 && (
        <StepTwoCard
          title={config.step2.title}
          description={config.step2.description}
          content={config.step2.content(previewData)}
          nextButtonText={config.step2.nextButtonText}
          isLoading={isLoadingPreview}
          error={previewError}
          onRetry={fetchPreviewData}
          onNext={handleNext}
          onBack={handleBack}
          onClose={handleClose}
        />
      )}

      {/* 步驟3：身分證驗證 */}
      {step === 3 && (
        <IdNumberVerification
          title={config.step3.title}
          description={config.step3.description}
          warningMessage={config.step3.warningMessage}
          confirmButtonText={config.step3.confirmButtonText}
          isSubmitting={isSubmitting}
          error={submitError}
          onBack={handleBack}
          onConfirm={handleConfirm}
          onClose={handleClose}
        />
      )}
    </div>
  );
}

// ========================================
// 子組件
// ========================================

interface StepOneCardProps {
  title: string;
  description: string;
  content: React.ReactNode;
  nextButtonText?: string;
  onNext: () => void;
  onClose: () => void;
}

function StepOneCard({
  title,
  description,
  content,
  nextButtonText = '下一步',
  onNext,
  onClose
}: StepOneCardProps) {
  return (
    <Card className="w-full max-w-lg">
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="mb-6">
          {content}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onNext}
            className="px-4 py-2 bg-[rgb(0,0,0)] text-white rounded-md hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            {nextButtonText}
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </Card>
  );
}

interface StepTwoCardProps {
  title: string;
  description: string;
  content: React.ReactNode;
  nextButtonText?: string;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}

function StepTwoCard({
  title,
  description,
  content,
  nextButtonText = '下一步',
  isLoading,
  error,
  onRetry,
  onNext,
  onBack,
  onClose
}: StepTwoCardProps) {
  return (
    <Card className="w-full max-w-lg">
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="mb-6">
          {/* 載入狀態 */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="ml-3 text-muted-foreground">正在獲取最新資料...</span>
            </div>
          )}

          {/* 錯誤提示 */}
          {error && !isLoading && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-900">{error}</p>
              <button
                onClick={onRetry}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700 underline"
              >
                重試
              </button>
            </div>
          )}

          {/* 預覽內容 */}
          {!isLoading && !error && content}
        </div>

        <div className="flex justify-between gap-3">
          <button
            onClick={onBack}
            disabled={isLoading}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            上一步
          </button>
          <button
            onClick={onNext}
            disabled={isLoading || !!error}
            className="px-4 py-2 bg-[rgb(0,0,0)] text-white rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {nextButtonText}
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </Card>
  );
}