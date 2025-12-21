/**
 * Signup Flow Controller (4 Steps)
 * 
 * Step 0: Email Check (pre-validation)
 * Step 1: Account Creation (password + send verification email)
 * Step 2: Profile Completion (name, ID, phone, referral code)
 * Step 3: Payment (annual fee $1,200)
 * 
 * @component SignupFlow
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ProgressIndicator } from './ProgressIndicator';
import { EmailCheckStep } from './EmailCheckStep';
import { AccountCreationStep } from './AccountCreationStep';
import { ProfileStep } from './ProfileStep';
import { PaymentStep } from './PaymentStep';
import { useNotification } from '../notifications/NotificationContext';

export function SignupFlow() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useNotification();
  
  // Get current step from URL (0-3)
  const stepParam = searchParams.get('step');
  const currentStep = stepParam ? parseInt(stepParam, 10) : 0;
  
  // Store email and user ID across steps
  const [email, setEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  
  // Validate step
  useEffect(() => {
    if (currentStep < 0 || currentStep > 3) {
      navigate('/signup?step=0', { replace: true });
    }
  }, [currentStep, navigate]);
  
  // Step completion handlers
  const handleStep0Complete = (validatedEmail: string) => {
    setEmail(validatedEmail);
    navigate('/signup?step=1');
  };
  
  const handleStep1Complete = (createdUserId: string, createdEmail: string) => {
    setUserId(createdUserId);
    setEmail(createdEmail);
    // User will receive verification email
    // After clicking verification link, they'll be redirected to step 2
    navigate('/auth/verify-email', { state: { email: createdEmail } });
  };
  
  const handleStep2Complete = () => {
    navigate('/signup?step=3');
  };
  
  const handleStep3Complete = () => {
    showToast('註冊完成！歡迎加入 Uknow', 'success');
    navigate('/dashboard', { replace: true });
  };
  
  // Render current step
  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <EmailCheckStep onComplete={handleStep0Complete} />;
      case 1:
        return <AccountCreationStep email={email} onComplete={handleStep1Complete} />;
      case 2:
        return <ProfileStep onComplete={handleStep2Complete} />;
      case 3:
        return <PaymentStep onComplete={handleStep3Complete} />;
      default:
        return <EmailCheckStep onComplete={handleStep0Complete} />;
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Progress Indicator */}
        <ProgressIndicator currentStep={currentStep} totalSteps={3} />
        
        {/* Step Content */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-2xl text-center">
              {currentStep === 0 && 'Email 檢核'}
              {currentStep === 1 && '建立帳號'}
              {currentStep === 2 && '完善資料'}
              {currentStep === 3 && '支付年費'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderStep()}
          </CardContent>
        </Card>
        
        {/* Help Text */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          已經有帳號？
          <button
            onClick={() => navigate('/login')}
            className="ml-2 text-blue-600 hover:text-blue-700 underline"
          >
            立即登入
          </button>
        </div>
      </div>
    </div>
  );
}
