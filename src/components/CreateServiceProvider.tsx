import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { UserContext } from '../App';
import { SERVICE_CATEGORIES, TAIWAN_CITIES, TAIWAN_REGIONS, MAX_PHOTO_SIZE, MAX_PHOTO_COUNT, ALLOWED_PHOTO_FORMATS } from '../utils/constants';
import { ArrowLeft, Upload, X, CreditCard, Calendar } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { handleDistrictSelection } from '../utils/districtSelection';
import { validateContacts } from '../utils/contactValidation';
import { YEARLY_PRICE } from '../utils/constants';
import { FieldError, getInputErrorClass } from '../utils/formHelpers';
import { useNotification } from './notifications/NotificationContext';
import { createClient } from '../utils/supabase/client';
import { buildApiUrl } from '../utils/apiClient';

interface ContactInfo {
  instagram: string;
  line: string;
  facebook: string;
}

export function CreateServiceProvider() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const { showSuccess, showError, showToast } = useNotification();
  
  // ✅ 只有 1 个步骤，直接填写后提交
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    gender: '',
    city: '',
    districts: [] as string[],
    description: '',
    photos: [] as string[],
    contacts: {
      instagram: '',
      line: '',
      facebook: ''
    }
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isDistrictSectionOpen, setIsDistrictSectionOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [listingTempId] = useState(`temp_${Date.now()}`);
  const supabase = createClient();

  // ✅ 检查用户是否已有刊登
  useEffect(() => {
    const checkExistingListing = async () => {
      if (!user?.id) return;
      try {
        const { data: existingListing } = await supabase
          .from('listings')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (existingListing) {
          showToast('您已經有一個刊登，每個帳號只能建立一個刊登', 'info');
          navigate(`/service-providers/edit/${existingListing.id}`, { replace: true });
        }
      } catch (error) {
        console.error('檢查刊登失敗:', error);
      }
    };
    
    checkExistingListing();
  }, [user?.id, navigate, showToast, supabase]);

  const validateStep1 = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) newErrors.name = '請輸入服務者名稱';
    if (!formData.category) newErrors.category = '請選擇服務類別';
    if (!formData.gender) newErrors.gender = '請選擇性別';
    if (!formData.city) newErrors.city = '請選擇服務城市';
    if (formData.districts.length === 0) newErrors.districts = '請選擇至少一個服務區域';
    if (formData.photos.length < 3) newErrors.photos = '請至少上傳3張照片';

    // 验证联络方式
    const contactErrors = validateContacts(formData.contacts);
    Object.assign(newErrors, contactErrors);

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getAvailableDistricts = () => {
    return formData.city ? TAIWAN_REGIONS[formData.city] || [] : [];
  };

  const handleCityChange = (newCity: string) => {
    const availableDistricts = TAIWAN_REGIONS[newCity] || [];
    setFormData({
      ...formData,
      city: newCity,
      districts: ['全區', ...availableDistricts]
    });
    setIsDistrictSectionOpen(true);
    const newErrors = { ...errors };
    delete newErrors.city;
    delete newErrors.districts;
    setErrors(newErrors);
  };

  const handleDistrictChange = (district: string, checked: boolean) => {
    const availableDistricts = getAvailableDistricts();
    const newDistricts = handleDistrictSelection(
      formData.districts,
      availableDistricts,
      district,
      checked
    );
    
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
    
    if (formData.photos.length + files.length > MAX_PHOTO_COUNT) {
      showToast(`最多只能上傳${MAX_PHOTO_COUNT}張照片`, 'error');
      return;
    }
    
    const oversizedFiles = files.filter(file => file.size > MAX_PHOTO_SIZE);
    if (oversizedFiles.length > 0) {
      showToast('照片大小不能超過 5MB', 'error');
      return;
    }
    
    const invalidFiles = files.filter(file => !ALLOWED_PHOTO_FORMATS.includes(file.type));
    if (invalidFiles.length > 0) {
      showToast('只支援 JPG、PNG、WEBP 格式', 'error');
      return;
    }
    
    uploadPhotosToServer(files);
  };

  const uploadPhotosToServer = async (files: File[]) => {
    setUploadingPhotos(true);

    try {
      console.log(`[Upload Photos] 開始上傳 ${files.length} 張照片...`);
      
      const uploadPromises = files.map(async (file) => {
        console.log(`[Upload Photos] 上傳照片: ${file.name}, 大小: ${file.size} bytes`);
        
        const formDataToSend = new FormData();
        formDataToSend.append('file', file);
        formDataToSend.append('listingTempId', listingTempId);
        
        const { data: { session: s } } = await supabase.auth.getSession();
        const response = await fetch(buildApiUrl('/listings/upload-photo'), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${s?.access_token}` },
          body: formDataToSend,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || '上傳失敗');
        }

        const data = await response.json();
        return data.photoUrl;
      });
      
      const photoUrls = await Promise.all(uploadPromises);
      
      console.log(`[Upload Photos] ✅ 所有照片上傳完成，共 ${photoUrls.length} 張`);
      console.log(`[Upload Photos] 照片 URLs:`, photoUrls);
      
      setFormData({
        ...formData,
        photos: [...formData.photos, ...photoUrls]
      });
      
      const newErrors = { ...errors };
      delete newErrors.photos;
      setErrors(newErrors);
      
      showToast(`成功上傳 ${photoUrls.length} 張照片`, 'success');
      
    } catch (error) {
      console.error('[Upload Photos] 照片上傳錯誤:', error);
      showToast(error instanceof Error ? error.message : '照片上傳失敗，請重試', 'error');
    } finally {
      setUploadingPhotos(false);
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = formData.photos.filter((_, i) => i !== index);
    setFormData({...formData, photos: newPhotos});
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);

    try {
      
      console.log('[Create Listing] 步驟1: 創建刊登...');

      const { error: insertError } = await supabase.from('listings').insert({
        user_id:     user.id,
        name:        formData.name,
        category:    formData.category,
        gender:      formData.gender,
        city:        formData.city,
        districts:   formData.districts,
        description: formData.description,
        photos:      formData.photos,
        contacts:    formData.contacts,
      });

      if (insertError) {
        showError('刊登建立失敗', insertError.message || '請稍後再試');
        return;
      }

      console.log('[Create Listing] ✅ 刊登建立完成');
      
      showToast('刊登建立成功！', 'success');
      
      navigate('/service-providers');
      
    } catch (error) {
      console.error('刊登建立錯誤:', error);
      showError('網絡錯誤', '請檢查網絡連線後再試');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!validateStep1()) return;
    handleFinalSubmit();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">刊登新服務者</h1>
          <p className="text-muted-foreground">請填寫您的專業服務相關資訊</p>
        </div>
      </div>
      
      {/* ✅ 移除步驟指示器，直接顯示表單 */}
      <Card>
        <CardHeader>
          <CardTitle>服務者基本資訊</CardTitle>
          <CardDescription>
            請填寫您的專業服務相關資訊
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">服務者名稱 * (最多10字)</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => {
                if (e.target.value.length <= 10) {
                  setFormData({...formData, name: e.target.value});
                }
              }}
              placeholder="例：專業美髮師 Amy"
              maxLength={10}
              className={getInputErrorClass(!!errors.name)}
            />
            <div className="text-right text-sm text-muted-foreground">
              {formData.name.length}/10
            </div>
            <FieldError error={errors.name} />
          </div>

          <div className="space-y-2">
            <Label>服務類別 *</Label>
            <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
              <SelectTrigger className={getInputErrorClass(!!errors.category)}>
                <SelectValue placeholder="選擇服務類別" />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {SERVICE_CATEGORIES.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError error={errors.category} />
          </div>

          <div className="space-y-2">
            <Label>性別 *</Label>
            <Select value={formData.gender} onValueChange={(value) => setFormData({...formData, gender: value})}>
              <SelectTrigger className={getInputErrorClass(!!errors.gender)}>
                <SelectValue placeholder="選擇性別" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="男">男</SelectItem>
                <SelectItem value="女">女</SelectItem>
              </SelectContent>
            </Select>
            <FieldError error={errors.gender} />
          </div>

          {/* 服務地區選擇 */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>服務城市 * (只能選擇一個縣市)</Label>
              <Select value={formData.city} onValueChange={handleCityChange}>
                <SelectTrigger className={getInputErrorClass(!!errors.city)}>
                  <SelectValue placeholder="選擇城市" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {TAIWAN_CITIES.map(city => (
                    <SelectItem key={city} value={city}>{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError error={errors.city} />
            </div>

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
                
                <FieldError error={errors.districts} />
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
                <label className={`aspect-video border-2 border-dashed border-muted-foreground/25 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-muted-foreground/50 transition-colors ${uploadingPhotos ? 'opacity-50 pointer-events-none' : ''}`}>
                  {uploadingPhotos ? (
                    <>
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mb-2"></div>
                      <span className="text-sm text-muted-foreground">上傳中...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">上傳照片</span>
                    </>
                  )}
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                    disabled={uploadingPhotos}
                  />
                </label>
              )}
            </div>
            <FieldError error={errors.photos} />
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
                  className={getInputErrorClass(!!errors.instagram)}
                />
                <FieldError error={errors.instagram} />
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
                  className={getInputErrorClass(!!errors.facebook)}
                />
                <FieldError error={errors.facebook} />
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
                  className={getInputErrorClass(!!errors.line)}
                />
                <FieldError error={errors.line} />
              </div>
            </div>
            <FieldError error={errors.contacts} />
          </div>

          <Button 
            onClick={handleSubmit} 
            className="w-full"
            disabled={
              isSubmitting ||
              !formData.name.trim() || 
              !formData.category || 
              !formData.gender ||
              !formData.city || 
              formData.districts.length === 0 || 
              formData.photos.length !== 3 || 
              (!formData.contacts.instagram && !formData.contacts.line && !formData.contacts.facebook)
            }
          >
            {isSubmitting ? '建立中...' : '建立刊登'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}