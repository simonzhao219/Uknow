/**
 * Progress Indicator Component
 * 
 * Visual progress bar for 4-step signup flow
 * 
 * @component ProgressIndicator
 */

import { Check } from 'lucide-react';

interface ProgressIndicatorProps {
  currentStep: number;  // 0-3
  totalSteps: number;   // Always 3 (steps 1-3)
}

export function ProgressIndicator({ currentStep, totalSteps }: ProgressIndicatorProps) {
  const steps = [
    { number: 1, label: '建立帳號' },
    { number: 2, label: '完善資料' },
    { number: 3, label: '支付年費' }
  ];
  
  const progress = currentStep === 0 ? 0 : (currentStep / totalSteps) * 100;
  
  return (
    <div className="w-full">
      {/* Progress Bar */}
      <div className="relative mb-8">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        {/* Step Indicators */}
        <div className="flex justify-between mt-4">
          {steps.map((step) => {
            const isCompleted = currentStep > step.number;
            const isCurrent = currentStep === step.number;
            const isPending = currentStep < step.number;
            
            return (
              <div key={step.number} className="flex flex-col items-center">
                {/* Circle */}
                <div
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    transition-all duration-300
                    ${isCompleted ? 'bg-blue-600 text-white' : ''}
                    ${isCurrent ? 'bg-blue-600 text-white ring-4 ring-blue-200' : ''}
                    ${isPending ? 'bg-gray-200 text-gray-400' : ''}
                  `}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span className="font-semibold">{step.number}</span>
                  )}
                </div>
                
                {/* Label */}
                <span
                  className={`
                    mt-2 text-sm
                    ${isCurrent || isCompleted ? 'text-gray-900 font-medium' : 'text-gray-400'}
                  `}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Current Step Info */}
      <div className="text-center mb-4">
        <p className="text-sm text-muted-foreground">
          {currentStep === 0 && '準備開始註冊流程'}
          {currentStep === 1 && '步驟 1/3：建立您的帳號'}
          {currentStep === 2 && '步驟 2/3：填寫個人資料'}
          {currentStep === 3 && '步驟 3/3：完成年費支付'}
        </p>
      </div>
    </div>
  );
}
