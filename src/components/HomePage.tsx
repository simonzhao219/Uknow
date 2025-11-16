import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import {
  MapPin,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { mockServiceProviders } from "../data/mockData";
import { AdBanner } from "./AdBanner";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { 
  NAME_MAX_LENGTH, 
  NAME_DISPLAY_LENGTH_MOBILE, 
  NAME_DISPLAY_LENGTH_DESKTOP,
  SERVICE_CATEGORIES,
  TAIWAN_CITIES,
  TAIWAN_REGIONS,
  GENDER_OPTIONS,
} from "../utils/constants";

// 基於姓名或職業的性別推測（簡化版）
const getGenderByName = (name: string) => {
  // 基於常見的女性名字或職業
  const femaleKeywords = ['Amy', 'Linda', 'Chloe', 'Michelle', 'Emma', 'Sophie', 'Vivian', 'Grace', 'Alice', 'Jenny', 'Sarah', 'Luna', 'Crystal', 'Helen', 'Tina', 'Bella', 'Ruby', 'Iris', 'Nancy', 'Victoria', 'Diana', 'Zoe', 'Kate', 'Melody', '美髮師', '美容師', '美甲師', '睫毛師', '除毛師', '紋繡師'];
  
  for (const keyword of femaleKeywords) {
    if (name.includes(keyword)) {
      return '女';
    }
  }
  return '男'; // 預設為男性
};

// 台灣縣市座標對照表（用於距離計算）
const cityCoordinates: Record<string, { lat: number; lng: number }> = {
  '台北市': { lat: 25.0330, lng: 121.5654 },
  '新北市': { lat: 25.0118, lng: 121.4654 },
  '桃園市': { lat: 24.9936, lng: 121.3010 },
  '台中市': { lat: 24.1477, lng: 120.6736 },
  '台南市': { lat: 22.9999, lng: 120.2269 },
  '高雄市': { lat: 22.6273, lng: 120.3014 },
  '基隆市': { lat: 25.1276, lng: 121.7392 },
  '新竹市': { lat: 24.8138, lng: 120.9675 },
  '嘉義市': { lat: 23.4801, lng: 120.4491 },
  '新竹縣': { lat: 24.8387, lng: 121.0177 },
  '苗栗縣': { lat: 24.5604, lng: 120.8214 },
  '彰化縣': { lat: 24.0518, lng: 120.5161 },
  '南投縣': { lat: 23.9609, lng: 120.9719 },
  '雲林縣': { lat: 23.7092, lng: 120.4313 },
  '嘉義縣': { lat: 23.4518, lng: 120.2554 },
  '屏東縣': { lat: 22.5519, lng: 120.5487 },
  '宜蘭縣': { lat: 24.7021, lng: 121.7378 },
  '花蓮縣': { lat: 23.9871, lng: 121.6015 },
  '台東縣': { lat: 22.7972, lng: 121.1713 },
  '澎湖縣': { lat: 23.5713, lng: 119.5794 },
  '金門縣': { lat: 24.4324, lng: 118.3175 },
  '連江縣': { lat: 26.1605, lng: 119.9297 }
};

export function HomePage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [openCities, setOpenCities] = useState<Record<string, boolean>>({});
  
  // 桌面版篩選器展開狀態
  const [isGenderFilterOpen, setIsGenderFilterOpen] = useState(false);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [isLocationFilterOpen, setIsLocationFilterOpen] = useState(false);
  
  // 模擬用戶位置（台北市政府）
  const userLocation = { lat: 25.0380, lng: 121.5640 };

  // 計算距離的函數（使用 Haversine 公式）
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371; // 地球半徑 (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const filteredServiceProviders = useMemo(() => {
    let filtered = mockServiceProviders.filter((roommate) => {
      // 服務類別篩選（單選）
      if (selectedCategory && roommate.category !== selectedCategory) {
        return false;
      }

      // 性別篩選（多選）
      if (selectedGenders.length > 0) {
        const roommateGender = (roommate as any).gender || getGenderByName(roommate.name);
        if (!selectedGenders.includes(roommateGender)) {
          return false;
        }
      }

      // 地區篩選邏輯
      if (selectedCities.length > 0) {
        // 檢查服務者的城市是否在選中的城市列表中
        if (!selectedCities.includes(roommate.city)) {
          return false;
        }
        
        // 如果有選擇特定區域
        if (selectedDistricts.length > 0) {
          // 檢查是否選擇了「全區」或者具體的區域
          const hasAllDistricts = selectedDistricts.includes('全區');
          const hasSpecificDistrict = selectedDistricts.includes(roommate.district);
          
          if (!hasAllDistricts && !hasSpecificDistrict) {
            return false;
          }
        }
      }

      return true;
    });

    // 按距離排序（使用城市座標）
    filtered.sort((a, b) => {
      // 使用服務者城市對應的座標，如果沒有���應座標則使用台北市作為預設
      const aCoords = cityCoordinates[a.city] || cityCoordinates['台北市'];
      const bCoords = cityCoordinates[b.city] || cityCoordinates['台北市'];
      
      // 確保座標存在才進行計算
      if (!aCoords || !bCoords) {
        return 0;
      }
      
      const distanceA = calculateDistance(userLocation.lat, userLocation.lng, aCoords.lat, aCoords.lng);
      const distanceB = calculateDistance(userLocation.lat, userLocation.lng, bCoords.lat, bCoords.lng);
      
      return distanceA - distanceB;
    });

    return filtered;
  }, [
    selectedCategory,
    selectedGenders,
    selectedCities,
    selectedDistricts,
    userLocation
  ]);

  const handleCityChange = (city: string, checked: boolean) => {
    if (checked) {
      setSelectedCities([...selectedCities, city]);
      // 當選擇縣市時，自動展開該縣市的區域選項並選擇全區
      setOpenCities({ ...openCities, [city]: true });
      const cityDistricts = TAIWAN_REGIONS[city] || [];
      const allCityDistricts = ['全區', ...cityDistricts];
      setSelectedDistricts([...selectedDistricts, ...allCityDistricts]);
    } else {
      setSelectedCities(selectedCities.filter((c) => c !== city));
      // 取消選擇縣市時，也清除該縣市下的所有區域選擇（包含全區）
      const cityDistricts = TAIWAN_REGIONS[city] || [];
      const allCityDistricts = ['全區', ...cityDistricts];
      setSelectedDistricts(selectedDistricts.filter((d) => !allCityDistricts.includes(d)));
      setOpenCities({ ...openCities, [city]: false });
    }
  };

  const handleDistrictChange = (city: string, district: string, checked: boolean) => {
    const cityDistricts = TAIWAN_REGIONS[city] || [];
    
    if (district === '全區') {
      // 如果點擊的是「全區」
      if (checked) {
        // 勾選全區時，勾選該縣市下所有區域
        const allCityDistricts = ['全區', ...cityDistricts];
        const newDistricts = [...selectedDistricts.filter(d => !allCityDistricts.includes(d)), ...allCityDistricts];
        setSelectedDistricts(newDistricts);
      } else {
        // 取消勾選全區時，取消該縣市下所有區域
        const allCityDistricts = ['全區', ...cityDistricts];
        setSelectedDistricts(selectedDistricts.filter(d => !allCityDistricts.includes(d)));
      }
    } else {
      // 如果點擊的是具體區域
      if (checked) {
        const newDistricts = [...selectedDistricts, district];
        // 檢查是否該縣市下所有區域都被選中，如是則同時勾選「全區」
        const selectedCityDistricts = newDistricts.filter(d => cityDistricts.includes(d));
        if (selectedCityDistricts.length === cityDistricts.length) {
          newDistricts.push('全區');
        }
        setSelectedDistricts(newDistricts);
      } else {
        // 取消勾選具體區域時，同時取消勾選「全區」
        const newDistricts = selectedDistricts.filter(d => d !== district && d !== '全區');
        setSelectedDistricts(newDistricts);
      }
    }
  };

  const handleGenderChange = (gender: string, checked: boolean) => {
    if (checked) {
      setSelectedGenders([...selectedGenders, gender]);
    } else {
      setSelectedGenders(selectedGenders.filter(g => g !== gender));
    }
  };

  const toggleCityOpen = (city: string) => {
    setOpenCities({ ...openCities, [city]: !openCities[city] });
  };

  const clearFilters = () => {
    setSelectedCategory("");
    setSelectedGenders([]);
    setSelectedCities([]);
    setSelectedDistricts([]);
    setOpenCities({});
  };

  const totalFilters = (selectedCategory ? 1 : 0) + selectedGenders.length + selectedCities.length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 標題區域 */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl md:text-4xl font-bold">
          找到你需要的專業服務
        </h1>
        <p className="text-muted-foreground">
          Uknow 連結專業服務者與需求者，讓專業技能發揮最大價值
        </p>
      </div>

      {/* 篩選區域 */}
      <div className="bg-card p-6 rounded-lg border space-y-4">
        {/* 手機版三個獨立篩選按鈕 */}
        <div className="flex flex-col gap-3 md:hidden">
          <div className="grid grid-cols-3 gap-2">
            {/* 性別篩選按鈕 */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex flex-col items-center gap-1 h-auto py-3"
                >
                  <span className="text-xs">性別</span>
                  {selectedGenders.length > 0 && (
                    <Badge variant="secondary" className="text-xs px-1 py-0">
                      {selectedGenders.length}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md pt-12">
                <SheetHeader className="pb-4">
                  <SheetTitle>性別篩選</SheetTitle>
                  <SheetDescription>
                    選擇您偏好的性別來篩選服務者
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 px-4 space-y-4">
                  {GENDER_OPTIONS.map((gender) => (
                    <div key={gender} className="flex items-center space-x-3 py-2">
                      <Checkbox
                        id={`mobile-gender-${gender}`}
                        checked={selectedGenders.includes(gender)}
                        onCheckedChange={(checked) => handleGenderChange(gender, checked as boolean)}
                        className="h-5 w-5"
                      />
                      <Label htmlFor={`mobile-gender-${gender}`} className="text-base cursor-pointer flex-1">
                        {gender}
                      </Label>
                    </div>
                  ))}
                </div>
              </SheetContent>
            </Sheet>

            {/* 服務類別篩選按鈕 */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex flex-col items-center gap-1 h-auto py-3"
                >
                  <span className="text-xs">服務類別</span>
                  {selectedCategory && (
                    <Badge variant="secondary" className="text-xs px-1 py-0">
                      1
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md pt-12">
                <SheetHeader className="pb-4">
                  <SheetTitle>服務類別</SheetTitle>
                  <SheetDescription>
                    選擇您需要的服務類別來篩選服務者
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 px-4 space-y-3 h-full overflow-y-auto">
                  <RadioGroup 
                    value={selectedCategory} 
                    onValueChange={setSelectedCategory}
                    className="space-y-3"
                  >
                    <div className="flex items-center space-x-3 py-2">
                      <RadioGroupItem value="" id="mobile-category-all" className="h-5 w-5" />
                      <Label htmlFor="mobile-category-all" className="text-base cursor-pointer flex-1">
                        全部類別
                      </Label>
                    </div>
                    {SERVICE_CATEGORIES.map((category) => (
                      <div key={category} className="flex items-center space-x-3 py-2">
                        <RadioGroupItem value={category} id={`mobile-category-${category}`} className="h-5 w-5" />
                        <Label htmlFor={`mobile-category-${category}`} className="text-base cursor-pointer flex-1">
                          {category}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </SheetContent>
            </Sheet>

            {/* 服務地區篩選按鈕 */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex flex-col items-center gap-1 h-auto py-3"
                >
                  <span className="text-xs">服務地區</span>
                  {selectedCities.length > 0 && (
                    <Badge variant="secondary" className="text-xs px-1 py-0">
                      {selectedCities.length}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md pt-12">
                <SheetHeader className="pb-4">
                  <SheetTitle>服務地區</SheetTitle>
                  <SheetDescription>
                    選擇您偏好的服務地區來篩選服務者
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 px-4 space-y-3 h-full overflow-y-auto">
                  {TAIWAN_CITIES.map((city) => (
                    <Collapsible
                      key={city}
                      open={openCities[city]}
                      onOpenChange={() => toggleCityOpen(city)}
                    >
                      <div className="space-y-3 py-1">
                        <div className="flex items-center space-x-3 py-2">
                          <Checkbox
                            id={`mobile-city-${city}`}
                            checked={selectedCities.includes(city)}
                            onCheckedChange={(checked) => handleCityChange(city, checked as boolean)}
                            className="h-5 w-5"
                          />
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex items-center justify-between w-full p-0 h-auto font-normal"
                            >
                              <Label htmlFor={`mobile-city-${city}`} className="text-base cursor-pointer flex-1 text-left">
                                {city}
                              </Label>
                              {selectedCities.includes(city) && (
                                <ChevronDown className={`h-4 w-4 transition-transform ${openCities[city] ? 'rotate-180' : ''}`} />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                        
                        {selectedCities.includes(city) && (
                          <CollapsibleContent className="space-y-3 ml-8">
                            {/* 全區選項 */}
                            <div className="flex items-center space-x-3 py-2">
                              <Checkbox
                                id={`mobile-district-${city}-all`}
                                checked={selectedDistricts.includes('全區')}
                                onCheckedChange={(checked) => handleDistrictChange(city, '全區', checked as boolean)}
                                className="h-5 w-5"
                              />
                              <Label htmlFor={`mobile-district-${city}-all`} className="text-base cursor-pointer font-medium text-primary flex-1">
                                全區
                              </Label>
                            </div>
                            {/* 具體區域選項 */}
                            {TAIWAN_REGIONS[city]?.map((district) => (
                              <div key={district} className="flex items-center space-x-3 py-2">
                                <Checkbox
                                  id={`mobile-district-${city}-${district}`}
                                  checked={selectedDistricts.includes(district)}
                                  onCheckedChange={(checked) => handleDistrictChange(city, district, checked as boolean)}
                                  className="h-5 w-5"
                                />
                                <Label htmlFor={`mobile-district-${city}-${district}`} className="text-base cursor-pointer flex-1">
                                  {district}
                                </Label>
                              </div>
                            ))}
                          </CollapsibleContent>
                        )}
                      </div>
                    </Collapsible>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>
          
          {/* 清除篩選按鈕 */}
          {totalFilters > 0 && (
            <Button
              onClick={clearFilters}
              variant="ghost"
              size="sm"
              className="text-xs md:hidden"
            >
              清除所有篩選 ({totalFilters})
            </Button>
          )}
        </div>

        {/* 桌面版可折疊篩選區域 */}
        <div className="hidden md:block space-y-3">
          {/* 性別篩選 */}
          <Collapsible
            open={isGenderFilterOpen}
            onOpenChange={setIsGenderFilterOpen}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center justify-between w-full p-2 h-auto font-medium text-left"
              >
                <span className="flex items-center gap-2">
                  性別篩選
                  {selectedGenders.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedGenders.length}
                    </Badge>
                  )}
                </span>
                <ChevronRight className={`h-4 w-4 transition-transform ${isGenderFilterOpen ? 'rotate-90' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pl-4 pr-2 pb-2">
              <div className="flex gap-4">
                {GENDER_OPTIONS.map((gender) => (
                  <div key={gender} className="flex items-center space-x-2">
                    <Checkbox
                      id={`desktop-gender-${gender}`}
                      checked={selectedGenders.includes(gender)}
                      onCheckedChange={(checked) => handleGenderChange(gender, checked as boolean)}
                    />
                    <Label htmlFor={`desktop-gender-${gender}`} className="text-sm cursor-pointer">
                      {gender}
                    </Label>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* 服務類別篩選 */}
          <Collapsible
            open={isCategoryFilterOpen}
            onOpenChange={setIsCategoryFilterOpen}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center justify-between w-full p-2 h-auto font-medium text-left"
              >
                <span className="flex items-center gap-2">
                  服務類別
                  {selectedCategory && (
                    <Badge variant="secondary" className="text-xs">
                      1
                    </Badge>
                  )}
                </span>
                <ChevronRight className={`h-4 w-4 transition-transform ${isCategoryFilterOpen ? 'rotate-90' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pl-4 pr-2 pb-2">
              <div className="bg-muted/30 p-4 rounded-lg max-h-48 overflow-y-auto">
                <RadioGroup 
                  value={selectedCategory} 
                  onValueChange={setSelectedCategory}
                  className="grid grid-cols-3 lg:grid-cols-4 gap-3"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="" id="desktop-category-all" />
                    <Label htmlFor="desktop-category-all" className="text-sm cursor-pointer">
                      全部
                    </Label>
                  </div>
                  {SERVICE_CATEGORIES.map((category) => (
                    <div key={category} className="flex items-center space-x-2">
                      <RadioGroupItem value={category} id={`desktop-category-${category}`} />
                      <Label htmlFor={`desktop-category-${category}`} className="text-sm cursor-pointer">
                        {category}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* 服務地區篩選 */}
          <Collapsible
            open={isLocationFilterOpen}
            onOpenChange={setIsLocationFilterOpen}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center justify-between w-full p-2 h-auto font-medium text-left"
              >
                <span className="flex items-center gap-2">
                  服務地區
                  {selectedCities.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedCities.length}
                    </Badge>
                  )}
                </span>
                <ChevronRight className={`h-4 w-4 transition-transform ${isLocationFilterOpen ? 'rotate-90' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pl-4 pr-2 pb-2">
              <div className="bg-muted/30 p-4 rounded-lg max-h-48 overflow-y-auto">
                <div className="space-y-3">
                  {TAIWAN_CITIES.map((city) => (
                    <Collapsible
                      key={city}
                      open={openCities[city]}
                      onOpenChange={() => toggleCityOpen(city)}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`desktop-city-${city}`}
                            checked={selectedCities.includes(city)}
                            onCheckedChange={(checked) => handleCityChange(city, checked as boolean)}
                          />
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex items-center justify-between w-full p-0 h-auto font-normal"
                            >
                              <Label htmlFor={`desktop-city-${city}`} className="text-sm cursor-pointer flex-1 text-left">
                                {city}
                              </Label>
                              {selectedCities.includes(city) && (
                                <ChevronDown className={`h-4 w-4 transition-transform ${openCities[city] ? 'rotate-180' : ''}`} />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                        
                        {selectedCities.includes(city) && (
                          <CollapsibleContent className="ml-6">
                            <div className="grid grid-cols-3 lg:grid-cols-4 gap-2">
                              {/* 全區選項 */}
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`desktop-district-${city}-all`}
                                  checked={selectedDistricts.includes('全區')}
                                  onCheckedChange={(checked) => handleDistrictChange(city, '全區', checked as boolean)}
                                />
                                <Label htmlFor={`desktop-district-${city}-all`} className="text-sm cursor-pointer font-medium text-primary">
                                  全區
                                </Label>
                              </div>
                              {/* 具體區域選項 */}
                              {TAIWAN_REGIONS[city]?.map((district) => (
                                <div key={district} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`desktop-district-${city}-${district}`}
                                    checked={selectedDistricts.includes(district)}
                                    onCheckedChange={(checked) => handleDistrictChange(city, district, checked as boolean)}
                                  />
                                  <Label htmlFor={`desktop-district-${city}-${district}`} className="text-sm cursor-pointer">
                                    {district}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        )}
                      </div>
                    </Collapsible>
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* 結果統計 */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            找到 {filteredServiceProviders.length} 位服務者（按距離排序）
          </span>
          {totalFilters > 0 && (
            <Button
              onClick={clearFilters}
              variant="ghost"
              size="sm"
              className="hidden md:flex text-xs md:text-sm px-2"
            >
              清除篩選 ({totalFilters})
            </Button>
          )}
        </div>
      </div>

      {/* 手機版緊湊網格 */}
      <div className="block md:hidden">
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {filteredServiceProviders.map((roommate) => (
            <MobileServiceProviderCard key={roommate.id} roommate={roommate} />
          ))}
        </div>
      </div>

      {/* 桌面版卡片網格 */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredServiceProviders.map((roommate) => (
          <ServiceProviderCard key={roommate.id} roommate={roommate} />
        ))}
      </div>

      {/* 空狀態顯示 */}
      {filteredServiceProviders.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            沒有找到符合條件的服務者
          </p>
          <Button
            onClick={clearFilters}
            variant="outline"
            className="mt-4"
          >
            清除篩選條件
          </Button>
        </div>
      )}
    </div>
  );
}

// 手機版緊湊網格項目組件
function MobileServiceProviderCard({ roommate }: { roommate: any }) {
  return (
    <Link to={`/service-providers/${roommate.id}`} className="block">
      <div className="relative aspect-square overflow-hidden rounded-lg group">
        <ImageWithFallback
          src={roommate.photos[0]}
          alt={roommate.name}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />
        {/* 半透明覆蓋層 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        {/* 左下角姓名 */}
        <div className="absolute bottom-1 left-1">
          <span className="text-white text-xs font-medium drop-shadow-md">
            {roommate.name.length > NAME_DISPLAY_LENGTH_MOBILE ? `${roommate.name.substring(0, NAME_DISPLAY_LENGTH_MOBILE)}...` : roommate.name}
          </span>
        </div>
      </div>
    </Link>
  );
}

// 桌面版完整卡片組件
function ServiceProviderCard({ roommate }: { roommate: any }) {
  return (
    <Link to={`/service-providers/${roommate.id}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        <CardContent className="p-0">
          <div className="aspect-video relative overflow-hidden rounded-t-lg">
            <ImageWithFallback
              src={roommate.photos[0]}
              alt={roommate.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <h3 className="font-semibold line-clamp-1">
                {roommate.name.length > NAME_DISPLAY_LENGTH_DESKTOP ? `${roommate.name.substring(0, NAME_DISPLAY_LENGTH_DESKTOP)}...` : roommate.name}
              </h3>
              <Badge variant="secondary">
                {roommate.category}
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground line-clamp-2">
              {roommate.description.length > 20
                ? `${roommate.description.substring(0, 20)}...`
                : roommate.description}
            </p>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>
                {roommate.city} {roommate.district}
              </span>
            </div>

            <div className="flex flex-wrap gap-1">
              {roommate.tags
                .slice(0, 2)
                .map((tag: string, index: number) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="text-xs"
                  >
                    {tag}
                  </Badge>
                ))}
              {roommate.tags.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{roommate.tags.length - 2}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}