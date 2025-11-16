import React, { useState, useContext, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { mockServiceProviders } from '../data/mockData';
import { SERVICE_CATEGORIES, TAIWAN_CITIES, TAIWAN_REGIONS } from '../utils/constants';
import { ArrowLeft, Upload, X, Save } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { handleDistrictSelection } from '../utils/districtSelection';
import { validateContacts } from '../utils/contactValidation';
import { NAME_MAX_LENGTH, DESCRIPTION_MAX_LENGTH } from '../utils/constants';
import { getInputErrorClass, FieldError } from '../utils/formHelpers';
import { useNotification } from './notifications/NotificationContext';

export function EditServiceProvider() {
  const { id } = useParams();
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const { showToast } = useNotification();
  
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    city: '',
    districts: [] as string[], // 改為陣列支援多選
    description: '',
    photos: [] as string[],
    contacts: {
      instagram: '',
      line: '',
      facebook: ''
    }
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isDistrictSectionOpen, setIsDistrictSectionOpen] = useState(false);

  useEffect(() => {
    // 載入服務者資料
    const roommate = mockServiceProviders.find(r => r.id === id && r.userId === user?.id);
    if (roommate) {
      // 由於現有的mockData只有單一區域，我們需要將其轉換為陣列格式
      // 如果現有資料只有單一區域，預設加上「全區」選項
      const districts = roommate.district ? ['全區', roommate.district] : ['全區'];
      
      setFormData({
        name: roommate.name,
        category: roommate.category,
        city: roommate.city,
        districts: districts,
        description: roommate.description,
        photos: roommate.photos,
        contacts: roommate.contacts
      });
    }
    setIsLoading(false);
  }, [id, user?.id]);

  const validate = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) newErrors.name = '請輸入服務者名稱';
    if (!formData.category) newErrors.category = '請選擇服務類別';
    if (!formData.city) newErrors.city = '請選擇服務城市';
    if (formData.districts.length === 0) newErrors.districts = '請選擇至少一個服務區域';
    if (formData.photos.length === 0) newErrors.photos = '請至少上傳一張照片';

    // 驗證聯絡方式
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
      districts: ['全區', ...availableDistricts]  // 勾選全區 + 所有具體區域
    });
    // 自動展開區域選擇
    setIsDistrictSectionOpen(true);
    // 清除錯誤訊息
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

    // 清除區域錯誤
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

    // 模擬圖片上傳
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    // 模擬儲存成功
    showToast('服務者資訊已更新！', 'success');
    navigate('/service-providers');
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <p>載入中...</p>
      </div>
    );
  }

  const roommate = mockServiceProviders.find(r => r.id === id && r.userId === user?.id);
  if (!roommate) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <h2 className="text-2xl font-bold mb-4">找不到此服務者</h2>
        <Button onClick={() => navigate('/service-providers')}>返回服務者管理</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">編輯服務者</h1>
          <p className="text-muted-foreground">修改 {roommate.name} 的資訊</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>服務者資訊</CardTitle>
          <CardDescription>更新您的專業服務相關資訊</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">服務者名稱 * (最多10字)</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => {
                  if (e.target.value.length <= NAME_MAX_LENGTH) {
                    setFormData({...formData, name: e.target.value});
                  }
                }}
                placeholder="例：專業美髮師 Amy"
                maxLength={NAME_MAX_LENGTH}
                className={getInputErrorClass(!!errors.name)}
              />
              <div className="text-right text-sm text-muted-foreground">
                {formData.name.length}/{NAME_MAX_LENGTH}
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
                  if (e.target.value.length <= DESCRIPTION_MAX_LENGTH) {
                    setFormData({...formData, description: e.target.value});
                  }
                }}
                placeholder="簡單介紹您的專業服務..."
                className="resize-none"
                rows={3}
              />
              <div className="text-right text-sm text-muted-foreground">
                {formData.description.length}/{DESCRIPTION_MAX_LENGTH}
              </div>
            </div>

            <div className="space-y-2">
              <Label>上傳照片 * (最少1張，最多3張)</Label>
              <div className="grid grid-cols-3 gap-4">
                {formData.photos.map((photo, index) => (
                  <div key={index} className="relative aspect-video rounded-lg overflow-hidden border">
                    <img src={photo} alt={`照片 ${index + 1}`} className="w-full h-full object-cover" />
                    <Button
                      type="button"
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
              </div>
              <FieldError error={errors.contacts} />
            </div>

            <div className="flex gap-4">
              <Button type="button" variant="outline" onClick={() => navigate('/service-providers')} className="flex-1">
                取消
              </Button>
              <Button 
                type="submit" 
                className="flex-1"
                disabled={
                  !formData.name.trim() ||
                  !formData.category ||
                  !formData.city ||
                  formData.districts.length === 0 ||
                  (!formData.contacts.instagram && !formData.contacts.line && !formData.contacts.facebook)
                }
              >
                <Save className="h-4 w-4 mr-2" />
                儲存變更
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}