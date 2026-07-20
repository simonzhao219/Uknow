import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";
import { Checkbox } from "./ui/checkbox";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import {
  MapPin,
  ChevronDown,
  ChevronRight,
  Search,
  AlertCircle,
} from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { GenderBadge } from "./common/GenderBadge";
import { FilterCountBadge } from "./common/FilterCountBadge";
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
  SERVICE_CATEGORIES,
  TAIWAN_CITIES,
  TAIWAN_REGIONS,
  GENDER_OPTIONS,
} from "../utils/constants";
import { createClient } from '../utils/supabase/client';

// 計算兩個經緯度座標之間的距離（使用 Haversine 公式，單位：公里）
const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371; // 地球半徑（公里）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

// 依 districts 陣列組出可讀的地區字串：有「全區」只顯示全區，否則最多前 10 個。
// 手機與桌面卡片共用，避免重複邏輯。
const formatDistrict = (serviceProvider: any): string => {
  if (!Array.isArray(serviceProvider.districts) || serviceProvider.districts.length === 0) {
    return serviceProvider.district || "";
  }
  if (serviceProvider.districts.includes("全區")) {
    return "全區";
  }
  const maxDisplay = 10;
  const districts = serviceProvider.districts.slice(0, maxDisplay);
  const displayText = districts.join(", ");
  return serviceProvider.districts.length > maxDisplay ? `${displayText}...` : displayText;
};

export function HomePage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [openCities, setOpenCities] = useState<Record<string, boolean>>({});
  
  // 桌面版篩選器展開狀態
  const [isGenderFilterOpen, setIsGenderFilterOpen] = useState(false);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [isLocationFilterOpen, setIsLocationFilterOpen] = useState(false);
  
  // ✅ 数据状态管理
  const [serviceProviders, setServiceProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // 載入失敗與「真的沒有刊登」是兩回事：失敗要顯示錯誤與重試，
  // 不能偽裝成「目前沒有可用的服務者」空狀態。
  const [loadError, setLoadError] = useState(false);

  // 使用者真實座標（取得授權後才用來做「由近到遠」排序）。
  // 原本寫死台北市政府座標，對非台北使用者的距離排序具誤導性；
  // 未授權 / 不支援時保留後端的最新排序（created_at desc），不假裝依距離。
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // ✅ 获取所有活跃刊登
  useEffect(() => {
    fetchAllListings();
  }, []);

  // 嘗試取得使用者定位（失敗則沿用最新排序）
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserCoords(null),
      { timeout: 8000, maximumAge: 300000 }
    );
  }, []);

  const fetchAllListings = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const supabase = createClient();
      const { data: listings, error } = await supabase
        .from('public_listings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setServiceProviders(listings || []);
    } catch (error) {
      console.error('獲取刊登列表失敗:', error);
      setServiceProviders([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const filteredServiceProviders = useMemo(() => {
    let filtered = serviceProviders.filter((serviceProvider) => {
      // 關鍵字搜尋（名稱／服務介紹／標籤）
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const haystack = [
          serviceProvider.name,
          serviceProvider.description,
          ...(Array.isArray(serviceProvider.tags) ? serviceProvider.tags : []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }

      // 服務類別篩選（單選）
      if (selectedCategory && serviceProvider.category !== selectedCategory) {
        return false;
      }

      // ✅ 性別篩選（使用后端的 gender 字段）
      if (selectedGenders.length > 0) {
        if (!serviceProvider.gender || !selectedGenders.includes(serviceProvider.gender)) {
          return false;
        }
      }

      // ✅ 地區篩選（适配 districts 数组）
      if (selectedCities.length > 0) {
        // 檢查服務者的城市是否在選中的城市列表中
        if (!selectedCities.includes(serviceProvider.city)) {
          return false;
        }
        
        // 如果有選擇特定區域
        if (selectedDistricts.length > 0) {
          const hasAllDistricts = selectedDistricts.includes('全區');
          
          // ✅ 适配后端的 districts 数组格式
          const listingDistricts = Array.isArray(serviceProvider.districts)
            ? serviceProvider.districts
            : [serviceProvider.district || ''];  // 兼容旧格式
          
          // 检查是否有交集
          const hasSpecificDistrict = listingDistricts.some((d: string) => 
            selectedDistricts.includes(d)
          );
          
          if (!hasAllDistricts && !hasSpecificDistrict) {
            return false;
          }
        }
      }

      return true;
    });

    // 僅在取得使用者真實定位後，才依「由近到遠」排序；
    // 未授權 / 不支援時保留後端的最新（created_at desc）排序，不假裝依距離。
    if (userCoords) {
      filtered = [...filtered].sort((a, b) => {
        const aCoords = cityCoordinates[a.city];
        const bCoords = cityCoordinates[b.city];
        if (!aCoords && !bCoords) return 0;
        if (!aCoords) return 1;
        if (!bCoords) return -1;
        const distanceA = calculateDistance(userCoords.lat, userCoords.lng, aCoords.lat, aCoords.lng);
        const distanceB = calculateDistance(userCoords.lat, userCoords.lng, bCoords.lat, bCoords.lng);
        return distanceA - distanceB;
      });
    }

    return filtered;
  }, [
    serviceProviders,
    searchQuery,
    selectedCategory,
    selectedGenders,
    selectedCities,
    selectedDistricts,
    userCoords
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
      // 如果點擊的具體區域
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
    setSearchQuery("");
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

      {/* 關鍵字搜尋 */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <label htmlFor="service-search" className="sr-only">
          搜尋服務者
        </label>
        <Input
          id="service-search"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜尋服務者名稱、服務內容或標籤"
          className="pl-9"
        />
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
                  <FilterCountBadge count={selectedGenders.length} />
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
                  <FilterCountBadge count={selectedCategory ? 1 : 0} />
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
                  <FilterCountBadge count={selectedCities.length} />
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

        {/* 桌面可折疊篩選區域 */}
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
                  <FilterCountBadge count={selectedGenders.length} />
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
                  <FilterCountBadge count={selectedCategory ? 1 : 0} />
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
                  <FilterCountBadge count={selectedCities.length} />
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
      </div>

      {/* 結果顯示區域 */}
      <div className="space-y-6">
        {/* 結果統計 - 僅在非載入狀態顯示 */}
        {!loading && (
          <div className="mb-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                找到 {filteredServiceProviders.length} 位服務者
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
        )}

        {/* ========== 載入中狀態：骨架屏（與卡片版面一致，降低版面跳動） ========== */}
        {loading && (
          <div aria-busy="true" aria-live="polite">
            <span className="sr-only">載入服務者資料中</span>
            {/* 手機兩欄 */}
            <div className="block md:hidden">
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <MobileCardSkeleton key={i} />
                ))}
              </div>
            </div>
            {/* 桌面 2/3 欄 */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <DesktopCardSkeleton key={i} />
              ))}
            </div>
          </div>
        )}

        {/* ========== 載入失敗（與空狀態明確區分，提供重試） ========== */}
        {!loading && loadError && (
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground text-lg mb-2">載入失敗</p>
            <p className="text-sm text-muted-foreground mb-4">
              無法取得服務者列表，請檢查網路連線後再試一次
            </p>
            <Button onClick={fetchAllListings} variant="outline">
              重新載入
            </Button>
          </div>
        )}

        {/* ========== 空狀態顯示（僅在載入完成、無錯誤且無資料時） ========== */}
        {!loading && !loadError && filteredServiceProviders.length === 0 && (
          <div className="text-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground text-lg mb-2">
              {totalFilters > 0 || searchQuery.trim()
                ? '沒有找到符合條件的服務者'
                : '目前沒有可用的服務者'}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {totalFilters > 0 || searchQuery.trim()
                ? '試試調整搜尋或篩選條件，或清除所有條件來查看更多結果'
                : '請稍後再來看看，或許會有新的服務者加入'}
            </p>
            {(totalFilters > 0 || searchQuery.trim()) && (
              <Button
                onClick={clearFilters}
                variant="outline"
              >
                清除搜尋與篩選
              </Button>
            )}
          </div>
        )}

        {/* ========== 正常顯示資料（僅在載入完成且有資料時） ========== */}
        {!loading && filteredServiceProviders.length > 0 && (
          <>
            {/* 手機版資訊卡片網格 */}
            <div className="block md:hidden">
              <div className="grid grid-cols-2 gap-3">
                {filteredServiceProviders.map((serviceProvider) => (
                  <MobileServiceProviderCard key={serviceProvider.id} serviceProvider={serviceProvider} />
                ))}
              </div>
            </div>

            {/* 桌面版卡片網格 */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredServiceProviders.map((serviceProvider) => (
                <ServiceProviderCard key={serviceProvider.id} serviceProvider={serviceProvider} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// 載入中骨架屏：對應手機與桌面卡片外形，避免資料到位時版面跳動。
function MobileCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <Skeleton className="aspect-square w-full rounded-none" />
        <div className="p-2 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </CardContent>
    </Card>
  );
}

function DesktopCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-0">
        <Skeleton className="aspect-video w-full rounded-t-lg rounded-b-none" />
        <div className="p-4 space-y-3">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </CardContent>
    </Card>
  );
}

// 手機版資訊卡片：照片 + 名稱 + 類別 + 地區 + 性別，讓手機使用者不必逐一點入
// 也能判斷服務內容與地點（原本只有照片與名字，資訊量遠少於桌面版）。
function MobileServiceProviderCard({ serviceProvider }: { serviceProvider: any }) {
  const displayDistrict = formatDistrict(serviceProvider);
  return (
    <Link to={`/service-providers/${serviceProvider.id}`} className="block h-full">
      <Card className="h-full overflow-hidden hover:shadow-md transition-shadow">
        <CardContent className="p-0">
          <div className="relative aspect-square overflow-hidden group">
            <ImageWithFallback
              src={serviceProvider.photos?.[0]}
              alt={serviceProvider.name}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
            />
            <GenderBadge
              gender={serviceProvider.gender}
              showLabel={false}
              applyColor={false}
              variant="secondary"
              className="absolute top-1.5 left-1.5 text-xs px-1.5 py-0.5 shadow-sm"
            />
          </div>
          <div className="p-2 space-y-1">
            <h3 className="font-medium text-sm line-clamp-1">
              {serviceProvider.name}
            </h3>
            <Badge variant="secondary" className="text-xs">
              {serviceProvider.category}
            </Badge>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="line-clamp-1">
                {serviceProvider.city} {displayDistrict}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// 桌面版完整卡片組件
function ServiceProviderCard({ serviceProvider }: { serviceProvider: any }) {
  const displayDistrict = formatDistrict(serviceProvider);

  return (
    <Link to={`/service-providers/${serviceProvider.id}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        <CardContent className="p-0">
          <div className="aspect-video relative overflow-hidden rounded-t-lg">
            <ImageWithFallback
              src={serviceProvider.photos?.[0]}
              alt={serviceProvider.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <h3 className="font-semibold line-clamp-1">
                  {serviceProvider.name}
                </h3>
                {/* 🆕 性别 Badge */}
                <GenderBadge gender={serviceProvider.gender} className="text-xs shrink-0" />
              </div>
              <Badge variant="secondary" className="shrink-0">
                {serviceProvider.category}
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground line-clamp-2">
              {serviceProvider.description}
            </p>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>
                {serviceProvider.city} {displayDistrict}
              </span>
            </div>

            <div className="flex flex-wrap gap-1">
              {serviceProvider.tags && serviceProvider.tags
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
              {serviceProvider.tags && serviceProvider.tags.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{serviceProvider.tags.length - 2}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}