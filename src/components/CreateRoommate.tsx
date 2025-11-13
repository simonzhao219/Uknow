import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Checkbox } from './ui/checkbox';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { UserContext } from '../App';
import { serviceCategories, taiwanCities, taiwanRegions } from '../data/mockData';
import { ArrowLeft, Upload, X, CreditCard, Calendar, CheckCircle, AlertCircle, Users } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';

export function CreateRoommate() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [referralCode, setReferralCode] = useState('');
  const [referrerName, setReferrerName] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    city: '',
    districts: [] as string[],
    description: '',
    photos: [] as string[],
    contacts: {
      instagram: '',
      line: '',
      facebook: ''
    },
    subscriptionPlan: 'monthly',
    agreedToTerms: false
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isDistrictSectionOpen, setIsDistrictSectionOpen] = useState(false);

  // 載入最近使用的推薦碼
  useEffect(() => {
    const lastReferralCode = localStorage.getItem('lastReferralCode');
    if (lastReferralCode) {
      setReferralCode(lastReferralCode);
      // 自動驗證預設的推薦碼
      verifyReferralCode(lastReferralCode);
    }
  }, []);

  // 模擬推薦碼驗證
  const verifyReferralCode = async (code: string) => {
    if (!code.trim()) {
      setCodeVerified(false);
      setReferrerName("");
      return;
    }

    setIsVerifyingCode(true);
    
    // 模擬API呼叫延遲
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 模擬驗證邏輯
    const mockReferrers: { [key: string]: string } = {
      'MING2024': '王小明',
      'CHEN2024': '陳美華',
      'WANG2024': '王大同',
      'LIU2024': '劉小芳',
      'HUANG2024': '黃志偉'
    };

    if (mockReferrers[code.toUpperCase()]) {
      setCodeVerified(true);
      setReferrerName(mockReferrers[code.toUpperCase()]);
      // 保存到本地存儲
      localStorage.setItem('lastReferralCode', code.toUpperCase());
    } else {
      setCodeVerified(false);
      setReferrerName("");
    }
    
    setIsVerifyingCode(false);
  };

  // 處理推薦碼輸入
  const handleReferralCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const code = e.target.value.toUpperCase();
    setReferralCode(code);
    
    // 即時驗證推薦碼
    if (code.length >= 4) {
      verifyReferralCode(code);
    } else {
      setCodeVerified(false);
      setReferrerName("");
    }
  };

  // 確認推薦碼
  const confirmReferralCode = () => {
    if (confirmationChecked) {
      setConfirmationRequired(false);
      // 根據當前需要進入的步驟決定
      if (currentStep === 1) {
        setCurrentStep(2);
      } else {
        // 最後提交
        handleFinalSubmit();
      }
    }
  };

  const validateStep2 = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) newErrors.name = '請輸入服務提供者名稱';
    if (!formData.category) newErrors.category = '請選擇服務類別';
    if (!formData.city) newErrors.city = '請選擇服務城市';
    if (formData.districts.length === 0) newErrors.districts = '請選擇至少一個服務區域';
    if (formData.photos.length < 3) newErrors.photos = '請至少上傳3張照片';

    const contactCount = Object.values(formData.contacts).filter(c => c.trim()).length;
    if (contactCount === 0) newErrors.contacts = '請至少填寫一種聯絡方式';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep3 = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.subscriptionPlan) newErrors.subscriptionPlan = '請選擇訂閱方案';
    if (!formData.agreedToTerms) newErrors.agreedToTerms = '請同意服務條款';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getAvailableDistricts = () => {
    return formData.city ? taiwanRegions[formData.city] || [] : [];
  };

  const handleCityChange = (newCity: string) => {
    setFormData({
      ...formData,
      city: newCity,
      districts: ['全區']
    });
    setIsDistrictSectionOpen(true);
    const newErrors = { ...errors };
    delete newErrors.city;
    delete newErrors.districts;
    setErrors(newErrors);
  };

  const handleDistrictChange = (district: string, checked: boolean) => {
    const availableDistricts = getAvailableDistricts();
    let newDistricts = [...formData.districts];

    if (district === '全區') {
      if (checked) {
        newDistricts = ['全區', ...availableDistricts];
      } else {
        newDistricts = [];
      }
    } else {
      if (checked) {
        if (!newDistricts.includes(district)) {
          newDistricts.push(district);
        }
        const selectedSpecificDistricts = newDistricts.filter(d => d !== '全區');
        if (selectedSpecificDistricts.length === availableDistricts.length && 
            availableDistricts.every(d => selectedSpecificDistricts.includes(d))) {
          if (!newDistricts.includes('全區')) {
            newDistricts.push('全區');
          }
        }
      } else {
        newDistricts = newDistricts.filter(d => d !== district);
        newDistricts = newDistricts.filter(d => d !== '全區');
      }
    }
    
    setFormData({
      ...formData,
      districts: newDistricts
    });

    if (newDistricts.length > 0) {
      const newErrors = { ...errors };
      delete newErrors.districts;
      setErrors(newErrors);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (formData.photos.length + files.length > 3) {
      setErrors({...errors, photos: '最多只能上傳3張照片'});
      return;
    }

    const newPhotos = files.map((file, index) => 
      `https://images.unsplash.com/photo-${Date.now() + index}?w=400&h=300&fit=crop`
    );
    
    setFormData({
      ...formData,
      photos: [...formData.photos, ...newPhotos]
    });
    setErrors({...errors, photos: ''});
  };

  const removePhoto = (index: number) => {
    const newPhotos = formData.photos.filter((_, i) => i !== index);
    setFormData({...formData, photos: newPhotos});
  };

  const handleNext = () => {
    if (currentStep === 1) {
      // 推薦碼步驟
      if (referralCode && codeVerified) {
        setConfirmationRequired(true);
        return;
      }
      // 沒有推薦碼直接進入下一步
      setCurrentStep(2);
    } else if (currentStep === 2 && validateStep2()) {
      setCurrentStep(3);
    } else if (currentStep === 3 && validateStep3()) {
      setCurrentStep(4);
    }
  };

  const handleFinalSubmit = () => {
    // 模擬付款成功
    alert('付款成功！服務提供者刊登已建立。');
    navigate('/roommates');
  };

  const handleSubmit = () => {
    // 最後提交前也需要確認推薦碼（如果有的話）
    if (referralCode && codeVerified && !confirmationChecked) {
      setConfirmationRequired(true);
      return;
    }
    handleFinalSubmit();
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return '推薦碼';
      case 2: return '填寫服務提供者資訊';
      case 3: return '選擇訂閱方案';
      case 4: return '確認付款';
      default: return '';
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">刊登新服務提供者</h1>
          <p className="text-muted-foreground">{getStepTitle()}</p>
        </div>
      </div>

      {/* 步驟指示器 */}
      <div className="flex items-center justify-center space-x-4">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              currentStep >= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
              {step}
            </div>
            {step < 4 && <div className={`w-12 h-0.5 mx-2 ${currentStep > step ? 'bg-primary' : 'bg-muted'}`} />}
          </div>
        ))}
      </div>
      
      {/* 步驟 1: 推薦碼驗證 */}
      {currentStep === 1 && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Users className="h-5 w-5" />
              推薦人資料
            </CardTitle>
            <CardDescription>請填寫推薦碼，註冊後就無法更改</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="text-center">
                <Users className="h-12 w-12 text-primary mx-auto mb-2" />
                <h3 className="font-medium">有朋友推薦嗎？</h3>
                <p className="text-sm text-muted-foreground">
                  輸入推薦碼可享受更多優惠
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="referralCode">推薦碼（選填）</Label>
                <div className="relative">
                  <Input
                    id="referralCode"
                    value={referralCode}
                    onChange={handleReferralCodeChange}
                    placeholder="請輸入推薦碼"
                    className="pr-10"
                  />
                  {isVerifyingCode && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                    </div>
                  )}
                  {referralCode && !isVerifyingCode && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      {codeVerified ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  )}
                </div>
                
                {referralCode && codeVerified && referrerName && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      推薦人：<strong>{referrerName}</strong>
                    </AlertDescription>
                  </Alert>
                )}
                
                {referralCode && !isVerifyingCode && !codeVerified && referralCode.length >= 4 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>推薦碼無效，請確認後重新輸入</AlertDescription>
                  </Alert>
                )}
              </div>
            </div>

            <Button onClick={handleNext} className="w-full">
              {referralCode ? '確認推薦碼並繼續' : '跳過，直接建立'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 步驟 2: 填寫資訊 */}
      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>服務提供者基本資訊</CardTitle>
            <CardDescription>
              請填寫您的專業服務相關資訊
              {referralCode && codeVerified && (
                <span className="block text-green-600 text-sm mt-1">
                  推薦人：{referrerName} ✓
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">服務提供者名稱 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="例：專業美髮師 Amy"
              />
              {errors.name && (
                <Alert variant="destructive">
                  <AlertDescription>{errors.name}</AlertDescription>
                </Alert>
              )}
            </div>

            <div className="space-y-2">
              <Label>服務類別 *</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇服務類別" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {serviceCategories.map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && (
                <Alert variant="destructive">
                  <AlertDescription>{errors.category}</AlertDescription>
                </Alert>
              )}
            </div>

            {/* 服務地區選擇 */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>服務城市 * (只能選擇一個縣市)</Label>
                <Select value={formData.city} onValueChange={handleCityChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇城市" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {taiwanCities.map(city => (
                      <SelectItem key={city} value={city}>{city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.city && (
                  <Alert variant="destructive">
                    <AlertDescription>{errors.city}</AlertDescription>
                  </Alert>
                )}
              </div>

              {/* 服務區域多選 */}
              {formData.city && (
                <div className="space-y-2">
                  <Label>服務區域 * (可選擇多個區域)</Label>
                  <Collapsible 
                    open={isDistrictSectionOpen} 
                    onOpenChange={setIsDistrictSectionOpen}
                  >
                    <CollapsibleTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="w-full justify-between"
                        type="button"
                      >
                        {formData.districts.length > 0 
                          ? `已選擇 ${formData.districts.length} 個區域` 
                          : '點擊選擇區域'
                        }
                        <X className={`h-4 w-4 transform transition-transform ${isDistrictSectionOpen ? 'rotate-45' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2">
                      <div className="border rounded-lg p-4 bg-muted/30 max-h-60 overflow-y-auto">
                        <div className="space-y-2">
                          {/* 全區選項 */}
                          <div className="flex items-center space-x-2 p-2 bg-primary/5 rounded border-l-4 border-primary">
                            <Checkbox
                              id="district-all"
                              checked={formData.districts.includes('全區')}
                              onCheckedChange={(checked) => handleDistrictChange('全區', checked as boolean)}
                            />
                            <Label 
                              htmlFor="district-all" 
                              className="text-sm cursor-pointer font-medium text-primary"
                            >
                              全區
                            </Label>
                          </div>
                          
                          {/* 具體區域選項 */}
                          <div className="grid grid-cols-2 gap-2 mt-3">
                            {getAvailableDistricts().map((district) => (
                              <div key={district} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`district-${district}`}
                                  checked={formData.districts.includes(district)}
                                  onCheckedChange={(checked) => handleDistrictChange(district, checked as boolean)}
                                />
                                <Label 
                                  htmlFor={`district-${district}`} 
                                  className="text-sm cursor-pointer"
                                >
                                  {district}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  
                  {/* 顯示已選擇的區域 */}
                  {formData.districts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.districts.map((district) => (
                        <Badge 
                          key={district} 
                          variant={district === '全區' ? 'default' : 'secondary'}
                          className="cursor-pointer"
                          onClick={() => handleDistrictChange(district, false)}
                        >
                          {district}
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  {errors.districts && (
                    <Alert variant="destructive">
                      <AlertDescription>{errors.districts}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">服務介紹 (選填，最多200字)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => {
                  if (e.target.value.length <= 200) {
                    setFormData({...formData, description: e.target.value});
                  }
                }}
                placeholder="簡單介紹您的專業服務..."
                className="resize-none"
                rows={3}
              />
              <div className="text-right text-sm text-muted-foreground">
                {formData.description.length}/200
              </div>
            </div>

            <div className="space-y-2">
              <Label>上傳照片 * (必須上傳3張，第一張為封面照)</Label>
              <div className="grid grid-cols-3 gap-4">
                {formData.photos.map((photo, index) => (
                  <div key={index} className="relative aspect-video rounded-lg overflow-hidden border">
                    <img src={photo} alt={`照片 ${index + 1}`} className="w-full h-full object-cover" />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-1 right-1 h-6 w-6 p-0"
                      onClick={() => removePhoto(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                
                {formData.photos.length < 3 && (
                  <label className="aspect-video border-2 border-dashed border-muted-foreground/25 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-muted-foreground/50 transition-colors">
                    <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">上傳照片</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
              {errors.photos && (
                <Alert variant="destructive">
                  <AlertDescription>{errors.photos}</AlertDescription>
                </Alert>
              )}
            </div>

            <div className="space-y-4">
              <Label>聯絡方式 * (至少填寫一種)</Label>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="instagram">Instagram</Label>
                  <Input
                    id="instagram"
                    value={formData.contacts.instagram}
                    onChange={(e) => setFormData({
                      ...formData,
                      contacts: {...formData.contacts, instagram: e.target.value}
                    })}
                    placeholder="@your_instagram"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="line">LINE ID</Label>
                  <Input
                    id="line"
                    value={formData.contacts.line}
                    onChange={(e) => setFormData({
                      ...formData,
                      contacts: {...formData.contacts, line: e.target.value}
                    })}
                    placeholder="your_line_id"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="facebook">Facebook</Label>
                  <Input
                    id="facebook"
                    value={formData.contacts.facebook}
                    onChange={(e) => setFormData({
                      ...formData,
                      contacts: {...formData.contacts, facebook: e.target.value}
                    })}
                    placeholder="Facebook 專頁名稱"
                  />
                </div>
              </div>
              {errors.contacts && (
                <Alert variant="destructive">
                  <AlertDescription>{errors.contacts}</AlertDescription>
                </Alert>
              )}
            </div>

            <div className="flex gap-4">
              <Button variant="outline" onClick={() => setCurrentStep(1)} className="flex-1">
                上一步
              </Button>
              <Button onClick={handleNext} className="flex-1">
                下一步
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 步驟 3: 選擇訂閱方案 */}
      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>選擇訂閱方案</CardTitle>
            <CardDescription>
              選擇適合您的訂閱方案
              {referralCode && codeVerified && (
                <span className="block text-green-600 text-sm mt-1">
                  推薦人：{referrerName} ✓
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup value={formData.subscriptionPlan} onValueChange={(value) => setFormData({...formData, subscriptionPlan: value})}>
              <div className="space-y-4">
                <div className="flex items-center space-x-2 p-4 border rounded-lg">
                  <RadioGroupItem value="monthly" id="monthly" />
                  <div className="flex-1">
                    <Label htmlFor="monthly" className="cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">月繳方案</p>
                          <p className="text-sm text-muted-foreground">靈活選擇，隨時取消</p>
                        </div>
                        <Badge variant="default">$129/月</Badge>
                      </div>
                    </Label>
                  </div>
                </div>

                <div className="flex items-center space-x-2 p-4 border rounded-lg">
                  <RadioGroupItem value="yearly" id="yearly" />
                  <div className="flex-1">
                    <Label htmlFor="yearly" className="cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">年繳方案</p>
                          <p className="text-sm text-muted-foreground">省更多，年省 $360</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="default">$1,188/年</Badge>
                          <p className="text-xs text-muted-foreground">平均 $99/月</p>
                        </div>
                      </div>
                    </Label>
                  </div>
                </div>
              </div>
            </RadioGroup>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="terms"
                checked={formData.agreedToTerms}
                onCheckedChange={(checked) => setFormData({...formData, agreedToTerms: checked as boolean})}
              />
              <Label htmlFor="terms" className="cursor-pointer text-sm">
                我已詳讀並同意 <span className="text-primary">服務條款</span> 和 <span className="text-primary">付款條件</span>
              </Label>
            </div>
            {errors.agreedToTerms && (
              <Alert variant="destructive">
                <AlertDescription>{errors.agreedToTerms}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-4">
              <Button variant="outline" onClick={() => setCurrentStep(2)} className="flex-1">
                上一步
              </Button>
              <Button onClick={handleNext} className="flex-1">
                下一步
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 步驟 4: 確認付款 */}
      {currentStep === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              確認付款
            </CardTitle>
            <CardDescription>確認您的刊登資訊和付款詳情</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 推薦人資料 */}
            {referralCode && (
              <div className="bg-muted p-4 rounded-lg space-y-3">
                <h4 className="font-medium">推薦人資料</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">推薦碼（註冊後無法更改）</p>
                    <p className="font-medium">{referralCode}</p>
                  </div>
                  {referrerName && (
                    <div>
                      <p className="text-muted-foreground">推薦人</p>
                      <p className="font-medium text-green-600">{referrerName}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 刊登摘要 */}
            <div className="bg-muted p-4 rounded-lg space-y-3">
              <h4 className="font-medium">刊登摘要</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">服務提供者名稱</p>
                  <p className="font-medium">{formData.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">服務類別</p>
                  <p className="font-medium">{formData.category}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">服務地區</p>
                  <p className="font-medium">{formData.city}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {formData.districts.map(district => (
                      <Badge 
                        key={district} 
                        variant={district === '全區' ? 'default' : 'outline'} 
                        className="text-xs"
                      >
                        {district}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground">照片數量</p>
                  <p className="font-medium">{formData.photos.length} 張</p>
                </div>
              </div>
            </div>

            {/* 付款摘要 */}
            <div className="bg-muted p-4 rounded-lg space-y-3">
              <h4 className="font-medium">付款摘要</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>訂閱方案</span>
                  <span>{formData.subscriptionPlan === 'monthly' ? '月繳方案' : '年繳方案'}</span>
                </div>
                <div className="flex justify-between">
                  <span>費用</span>
                  <span>${formData.subscriptionPlan === 'monthly' ? '129' : '1,188'}</span>
                </div>
                <div className="flex justify-between">
                  <span>優惠</span>
                  <span className="text-green-600">
                    {formData.subscriptionPlan === 'yearly' ? '-$360' : '$0'}
                  </span>
                </div>
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>總計</span>
                  <span>${formData.subscriptionPlan === 'monthly' ? '129' : '1,188'}</span>
                </div>
              </div>
            </div>

            {/* 付款資訊 */}
            <div className="space-y-4">
              <h4 className="font-medium">付款方式</h4>
              <div className="bg-card border p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">信用卡付款</p>
                      <p className="text-sm text-muted-foreground">安全加密付款</p>
                    </div>
                  </div>
                  <Badge variant="outline">預設</Badge>
                </div>
              </div>

              <Alert>
                <Calendar className="h-4 w-4" />
                <AlertDescription>
                  付款成功後，您的服務提供者刊登將立即上線。
                  {formData.subscriptionPlan === 'monthly' ? '月繳方案將於每月同日自動續訂。' : '年繳方案將於一年後自動續訂。'}
                </AlertDescription>
              </Alert>
            </div>

            <div className="flex gap-4">
              <Button variant="outline" onClick={() => setCurrentStep(3)} className="flex-1">
                上一步
              </Button>
              <Button onClick={handleSubmit} className="flex-1">
                確認付款 ${formData.subscriptionPlan === 'monthly' ? '129' : '1,188'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 推薦碼確認對話框 */}
      <Dialog open={confirmationRequired} onOpenChange={setConfirmationRequired}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認推薦碼</DialogTitle>
            <DialogDescription>
              請確認您的推薦碼資訊無誤，刊登後將無法修改。
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <div className="font-medium">推薦碼：{referralCode}</div>
              <div className="text-sm text-muted-foreground">
                推薦人：{referrerName}
              </div>
            </div>
            
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>注意事項：</strong>
                <ul className="list-disc list-inside mt-2 text-sm">
                  <li>推薦碼刊登後無法修改</li>
                  <li>請確保推薦人資訊正確</li>
                  <li>推薦關係將影響您的獎勵分配</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="confirmation"
                checked={confirmationChecked}
                onCheckedChange={(checked) =>
                  setConfirmationChecked(checked as boolean)
                }
              />
              <Label htmlFor="confirmation" className="cursor-pointer">
                我確認推薦碼無誤，並了解刊登後無法修改
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmationRequired(false);
                setConfirmationChecked(false);
              }}
            >
              取消
            </Button>
            <Button
              onClick={confirmReferralCode}
              disabled={!confirmationChecked}
            >
              確認並繼續
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}