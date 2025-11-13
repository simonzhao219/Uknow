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
import { serviceCategories, taiwanCities, taiwanRegions, mockRoommates } from '../data/mockData';
import { ArrowLeft, Upload, X, Save } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';

export function EditRoommate() {
  const { id } = useParams();
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  
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
    // 載入室友資料
    const roommate = mockRoommates.find(r => r.id === id && r.userId === user?.id);
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

    if (!formData.name.trim()) newErrors.name = '請輸入室友名稱';
    if (!formData.category) newErrors.category = '請選擇服務類別';
    if (!formData.city) newErrors.city = '請選擇服務城市';
    if (formData.districts.length === 0) newErrors.districts = '請選擇至少一個服務區域';
    if (formData.photos.length === 0) newErrors.photos = '請至少上傳一張照片';

    const contactCount = Object.values(formData.contacts).filter(c => c.trim()).length;
    if (contactCount === 0) newErrors.contacts = '請至少填寫一種聯絡方式';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getAvailableDistricts = () => {
    return formData.city ? taiwanRegions[formData.city] || [] : [];
  };

  const handleCityChange = (newCity: string) => {
    // 當城市變更時，預設選擇「全區」
    setFormData({
      ...formData,
      city: newCity,
      districts: ['全區']
    });
    // 自動展開區域選擇
    setIsDistrictSectionOpen(true);
    // 清除相關錯誤
    const newErrors = { ...errors };
    delete newErrors.city;
    delete newErrors.districts;
    setErrors(newErrors);
  };

  const handleDistrictChange = (district: string, checked: boolean) => {
    const availableDistricts = getAvailableDistricts();
    let newDistricts = [...formData.districts];

    if (district === '全區') {
      // 如果點擊「全區」
      if (checked) {
        // 勾選全區 = 勾選所有區域 + 全區
        newDistricts = ['全區', ...availableDistricts];
      } else {
        // 取消全區 = 取消所有選擇
        newDistricts = [];
      }
    } else {
      // 如果點擊具體區域
      if (checked) {
        // 新增這個區域
        if (!newDistricts.includes(district)) {
          newDistricts.push(district);
        }
        // 檢查是否所有具體區域都被選中
        const selectedSpecificDistricts = newDistricts.filter(d => d !== '全區');
        if (selectedSpecificDistricts.length === availableDistricts.length && 
            availableDistricts.every(d => selectedSpecificDistricts.includes(d))) {
          // 如果所有具體區域都被選中，自動勾選「全區」
          if (!newDistricts.includes('全區')) {
            newDistricts.push('全區');
          }
        }
      } else {
        // 取消這個區域
        newDistricts = newDistricts.filter(d => d !== district);
        // 取消任何具體區域時，自動取消「全區」
        newDistricts = newDistricts.filter(d => d !== '全區');
      }
    }
    
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
    alert('室友資訊已更新！');
    navigate('/roommates');
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <p>載入中...</p>
      </div>
    );
  }

  const roommate = mockRoommates.find(r => r.id === id && r.userId === user?.id);
  if (!roommate) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <h2 className="text-2xl font-bold mb-4">找不到此室友</h2>
        <Button onClick={() => navigate('/roommates')}>返回室友管理</Button>
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
          <h1 className="text-3xl font-bold">編輯室友</h1>
          <p className="text-muted-foreground">修改 {roommate.name} 的資訊</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>室友資訊</CardTitle>
          <CardDescription>更新您的專業服務相關資訊</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">室友名稱 *</Label>
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
              <Button type="button" variant="outline" onClick={() => navigate('/roommates')} className="flex-1">
                取消
              </Button>
              <Button type="submit" className="flex-1">
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