import React, { useState, useMemo, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { UserContext } from "../App";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";
import {
  MapPin,
  ChevronDown,
  Search,
  SlidersHorizontal,
  AlertCircle,
} from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { GenderBadge } from "./common/GenderBadge";
import { FilterCountBadge } from "./common/FilterCountBadge";
import { FilterChip } from "./common/FilterChip";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "./ui/utils";
import {
  SERVICE_CATEGORIES,
  TAIWAN_CITIES,
  TAIWAN_REGIONS,
  GENDER_OPTIONS,
} from "../utils/constants";
import { createClient } from '../utils/supabase/client';
import {
  toggleCity,
  toggleCityDistrict,
  cityDistricts,
  listingMatchesDistricts,
  type DistrictSelectionByCity,
} from '../utils/districtSelection';
import {
  readHomeViewMode,
  writeHomeViewMode,
  type HomeViewMode,
} from '../utils/homeViewMode';
import { HomeViewToggle } from './home/HomeViewToggle';
import { MobilePhotoWallCard } from './home/MobilePhotoWallCard';

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
  // 登入會員在手機版有固定底部導覽列（BottomNav），浮動搜尋／篩選工具列
  // 需要上移避開。
  const { isLoggedIn } = useContext(UserContext);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  // 以縣市為 scope 的選區狀態（見 districtSelection.ts 的說明）：
  // 每個縣市的「全區」與區選擇互相獨立，同名區不再跨縣市誤配。
  const [districtsByCity, setDistrictsByCity] = useState<DistrictSelectionByCity>({});
  const selectedCities = Object.keys(districtsByCity);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);

  // 手機首頁的檢視密度：預設 3 欄照片牆，回訪者沿用上次選擇（見 homeViewMode.ts）。
  // 以 lazy initializer 在首個 render 就讀回偏好，避免先閃一下預設再跳成偏好。
  const [viewMode, setViewMode] = useState<HomeViewMode>(() => readHomeViewMode());
  useEffect(() => {
    writeHomeViewMode(viewMode);
  }, [viewMode]);

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

      // 地區篩選：縣市層先比對，區層交由縣市 scope 的判定（該市勾全區
      // 或區清空＝該市全過；具體區要有交集；同名區不跨市誤配）。
      if (selectedCities.length > 0) {
        if (!selectedCities.includes(serviceProvider.city)) {
          return false;
        }
        const listingDistricts = Array.isArray(serviceProvider.districts)
          ? serviceProvider.districts
          : [serviceProvider.district || ''];  // 兼容旧格式
        if (!listingMatchesDistricts(districtsByCity, serviceProvider.city, listingDistricts)) {
          return false;
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
    districtsByCity,
    userCoords
  ]);

  const handleCityChange = (city: string, checked: boolean) => {
    // 勾選縣市＝預設全區；取消＝移除該市整個 key。純函式只動這一市。
    setDistrictsByCity((prev) => toggleCity(prev, city, checked, TAIWAN_REGIONS[city] || []));
  };

  const handleDistrictChange = (city: string, district: string, checked: boolean) => {
    // 單縣市內的「全區↔具體區」語意沿用 handleDistrictSelection（有測試釘住），
    // 縣市之間互不影響。
    setDistrictsByCity((prev) =>
      toggleCityDistrict(prev, city, TAIWAN_REGIONS[city] || [], district, checked)
    );
  };

  const handleGenderChange = (gender: string, checked: boolean) => {
    if (checked) {
      setSelectedGenders([...selectedGenders, gender]);
    } else {
      setSelectedGenders(selectedGenders.filter(g => g !== gender));
    }
  };

  const clearFilters = () => {
    setSelectedCategory("");
    setSelectedGenders([]);
    setDistrictsByCity({});
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

      {/* 桌面：搜尋＋篩選工具列同一列。
          手機：這一列整個隱藏——搜尋與篩選移到底部浮動工具列（拇指熱區、
          浮在內容上不佔版面），首屏直接呈現服務者列表。 */}
      <div className="hidden md:flex md:items-center gap-3">
        <div className="relative md:flex-1">
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

        {/* 桌面篩選：popover 下拉面板，內容與手機共用同一套 chip 元件；
            單選時直接把選中的值寫進按鈕文字，不展開也看得到目前條件 */}
        <div className="flex items-center gap-2">
          <DesktopFilterPopover
            label="性別"
            summary={
              selectedGenders.length === 1 ? `性別：${selectedGenders[0]}` : undefined
            }
            count={selectedGenders.length}
            panelClassName="w-auto"
          >
            <GenderFilterChips
              selectedGenders={selectedGenders}
              onGenderChange={handleGenderChange}
            />
          </DesktopFilterPopover>

          <DesktopFilterPopover
            label="服務類別"
            summary={selectedCategory ? `類別：${selectedCategory}` : undefined}
            count={selectedCategory ? 1 : 0}
            panelClassName="w-[min(560px,90vw)]"
          >
            <CategoryFilterChips
              selectedCategory={selectedCategory}
              onSelect={setSelectedCategory}
            />
          </DesktopFilterPopover>

          <DesktopFilterPopover
            label="服務地區"
            summary={
              selectedCities.length === 1 ? `地區：${selectedCities[0]}` : undefined
            }
            count={selectedCities.length}
            panelClassName="w-[min(640px,90vw)] max-h-[70vh] overflow-y-auto"
          >
            <LocationFilterChips
              selectedCities={selectedCities}
              districtsByCity={districtsByCity}
              onCityChange={handleCityChange}
              onDistrictChange={handleDistrictChange}
            />
          </DesktopFilterPopover>
        </div>
      </div>

      {/* 手機版底部浮動工具列：搜尋＋篩選集中在單手拇指熱區，
          浮在內容上、不佔版面；篩選為單一入口的整合面板 */}
      <MobileSearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalFilters={totalFilters}
        hasBottomNav={isLoggedIn}
        resultCount={filteredServiceProviders.length}
        onResetFilters={() => {
          setSelectedGenders([]);
          setSelectedCategory("");
          setDistrictsByCity({});
        }}
      >
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">性別</h3>
            <GenderFilterChips
              selectedGenders={selectedGenders}
              onGenderChange={handleGenderChange}
            />
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">服務類別</h3>
            <CategoryFilterChips
              selectedCategory={selectedCategory}
              onSelect={setSelectedCategory}
            />
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">服務地區</h3>
            <LocationFilterChips
              selectedCities={selectedCities}
              districtsByCity={districtsByCity}
              onCityChange={handleCityChange}
              onDistrictChange={handleDistrictChange}
            />
          </section>
        </div>
      </MobileSearchFilterBar>

      {/* 結果顯示區域 */}
      <div className="space-y-6">
        {/* 結果統計 - 僅在非載入狀態顯示 */}
        {!loading && (
          <div className="mb-4">
            <div className="flex justify-between items-center gap-3">
              <span className="text-sm text-muted-foreground">
                找到 {filteredServiceProviders.length} 位服務者
              </span>
              <div className="flex items-center gap-2">
                {/* 手機版搜尋／篩選都收進底部工具列後，這裡是面板外
                    唯一的一鍵清除入口，因此不再只限桌面顯示 */}
                {totalFilters > 0 && (
                  <Button
                    onClick={clearFilters}
                    variant="ghost"
                    size="sm"
                    className="text-xs md:text-sm px-2"
                  >
                    清除篩選 ({totalFilters})
                  </Button>
                )}
                {/* 檢視方式切換：手機專屬（桌面版面已寬、資訊完整，不提供切換） */}
                <HomeViewToggle
                  value={viewMode}
                  onChange={setViewMode}
                  className="md:hidden"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========== 載入中狀態：骨架屏（與卡片版面一致，降低版面跳動） ========== */}
        {loading && (
          <div aria-busy="true" aria-live="polite">
            <span className="sr-only">載入服務者資料中</span>
            {/* 手機：骨架屏跟著檢視模式走，資料到位時版面不跳動 */}
            <div className="block md:hidden">
              {viewMode === "photo" ? (
                <div className="grid grid-cols-3 gap-0.5">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square w-full rounded-none" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <MobileCardSkeleton key={i} />
                  ))}
                </div>
              )}
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
            {/* 手機版：依檢視模式在「3 欄照片牆」與「2 欄詳細卡」間切換 */}
            <div className="block md:hidden">
              {viewMode === "photo" ? (
                <div className="grid grid-cols-3 gap-0.5">
                  {filteredServiceProviders.map((serviceProvider) => (
                    <MobilePhotoWallCard key={serviceProvider.id} serviceProvider={serviceProvider} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredServiceProviders.map((serviceProvider) => (
                    <MobileServiceProviderCard key={serviceProvider.id} serviceProvider={serviceProvider} />
                  ))}
                </div>
              )}
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

      {/* 手機版底部工具列的佔位：避免最後一排卡片與頁尾被浮動列蓋住 */}
      <div className="h-20 md:hidden" aria-hidden="true" />
    </div>
  );
}

// ============================================
// 篩選 UI（手機底部面板與桌面折疊區共用同一套 chip 內容元件）
// ============================================

// 手機版篩選面板：從螢幕底部彈出（單手拇指可及），而非右側全幅滑出。
// 關閉動線以底部的「查看 N 位服務者」主按鈕為主（同時回饋目前結果數），
// 點背景遮罩也可關閉；右上角 X 僅作為輔助。
function MobileFilterSheet({
  trigger,
  title,
  description,
  resultCount,
  showReset,
  onReset,
  children,
}: {
  /** 開啟面板的觸發元素（會以 asChild 掛上 SheetTrigger） */
  trigger: React.ReactNode;
  title: string;
  description: string;
  /** 目前條件下的即時結果數，顯示在主按鈕上作為即時回饋 */
  resultCount: number;
  /** 是否顯示「重設」（有任一條件時才出現） */
  showReset: boolean;
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl gap-0 p-0">
        {/* 底部面板慣例的抓握指示條 */}
        <div
          className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-muted"
          aria-hidden="true"
        />
        <SheetHeader className="px-4 pt-2 pb-3">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {children}
        </div>
        <SheetFooter className="mt-0 flex-row gap-3 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {showReset && (
            <Button variant="ghost" onClick={onReset} className="shrink-0">
              重設
            </Button>
          )}
          <SheetClose asChild>
            <Button className="min-h-12 flex-1">
              查看 {resultCount} 位服務者
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// 手機版底部浮動工具列：搜尋與篩選的唯一入口。
//
// 設計取捨（對應「操作習慣在下方」與「不想讓搜尋列常駐佔位」兩個訴求）：
//   - fixed 浮在內容上方（含 safe-area 偏移），版面零佔用，首屏留給服務者列表；
//   - 預設收合成圓形按鈕（FAB）、點擊展開成長條：長條會遮到底下的內容
//     與按鈕，收合後只剩一顆圓；徽章顯示「搜尋＋篩選」總條件數，
//     狀態不因收合而消失；
//   - 登入會員的手機版有固定底部導覽列（BottomNav，56px＋safe-area），
//     工具列自動上移避開，兩態都不遮擋導覽按鈕；
//   - 搜尋開「頂部」覆蓋層而非底部面板——軟鍵盤從下方升起，輸入框在上方
//     永遠不會被鍵盤遮住（底部面板＋鍵盤在 iOS Safari 有遮擋/跳動的既知問題）；
//     輸入即時過濾，主按鈕同步顯示結果數；
//   - 篩選收斂成單一入口的整合面板（性別／類別／地區三個區塊一次看完），
//     取代原本三顆並排小按鈕；工具列上以數量徽章與搜尋字樣回饋目前條件。
function MobileSearchFilterBar({
  searchQuery,
  onSearchChange,
  totalFilters,
  hasBottomNav,
  resultCount,
  onResetFilters,
  children,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  totalFilters: number;
  /** 登入會員的固定底部導覽列存在時，工具列上移避開 */
  hasBottomNav: boolean;
  resultCount: number;
  /** 清除全部篩選條件（不含搜尋字串，搜尋在搜尋面板內清除） */
  onResetFilters: () => void;
  /** 整合篩選面板的內容（三個 chip 區塊） */
  children: React.ReactNode;
}) {
  // 一律預設收合：首頁的主角是內容，工具列常駐展開仍會遮到底下的
  // 卡片與按鈕；FAB 上的條件徽章確保收合時狀態仍可見。
  const [expanded, setExpanded] = useState(false);

  // 搜尋字串也算一項條件：收合後仍能從徽章看出「目前有條件生效」
  const activeCount = totalFilters + (searchQuery.trim() ? 1 : 0);

  // BottomNav 高 56px（min-h）＋ safe-area，再留 12px 間距
  const offsetClass = hasBottomNav
    ? "bottom-[calc(56px+env(safe-area-inset-bottom)+0.75rem)]"
    : "bottom-[max(1rem,env(safe-area-inset-bottom))]";

  if (!expanded) {
    return (
      <div className={cn("md:hidden fixed right-4 z-40", offsetClass)}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="展開搜尋與篩選"
          aria-expanded={false}
          className="relative flex h-14 w-14 items-center justify-center rounded-full border bg-background shadow-lg animate-in fade-in zoom-in-90 duration-200"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
          {activeCount > 0 && (
            <FilterCountBadge
              count={activeCount}
              className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground"
            />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={cn("md:hidden fixed inset-x-4 z-40", offsetClass)}>
      <div className="flex items-stretch rounded-full border bg-background shadow-lg animate-in fade-in zoom-in-95 duration-200">
        {/* 搜尋入口：顯示目前搜尋字樣作為狀態回饋 */}
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-l-full px-4 py-3 text-left"
            >
              <Search
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              {searchQuery ? (
                <span className="truncate text-sm">{searchQuery}</span>
              ) : (
                <span className="truncate text-sm text-muted-foreground">
                  搜尋服務者
                </span>
              )}
            </button>
          </SheetTrigger>
          <SheetContent side="top" className="gap-0 p-0">
            <SheetHeader className="px-4 pt-4 pb-2">
              <SheetTitle>搜尋服務者</SheetTitle>
              <SheetDescription>
                輸入名稱、服務內容或標籤，結果即時更新
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-4">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="搜尋服務者名稱、服務內容或標籤"
                  className="pl-9"
                  aria-label="搜尋服務者"
                  autoFocus
                />
              </div>
            </div>
            <SheetFooter className="mt-0 flex-row gap-3 border-t p-4">
              {searchQuery && (
                <Button
                  variant="ghost"
                  onClick={() => onSearchChange("")}
                  className="shrink-0"
                >
                  清除
                </Button>
              )}
              <SheetClose asChild>
                <Button className="min-h-12 flex-1">
                  查看 {resultCount} 位服務者
                </Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <div className="my-2 w-px shrink-0 bg-border" aria-hidden="true" />

        {/* 篩選入口：單一整合面板 */}
        <MobileFilterSheet
          trigger={
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 rounded-r-full px-4 py-3"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              <span className="text-sm">篩選</span>
              <FilterCountBadge count={totalFilters} />
            </button>
          }
          title="篩選"
          description="設定條件來縮小服務者範圍"
          resultCount={resultCount}
          showReset={totalFilters > 0}
          onReset={onResetFilters}
        >
          {children}
        </MobileFilterSheet>

        <div className="my-2 w-px shrink-0 bg-border" aria-hidden="true" />

        {/* 收合：縮成圓形按鈕，避免長條遮住底下的內容 */}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="收合搜尋與篩選"
          aria-expanded={true}
          className="flex shrink-0 items-center rounded-r-full px-3 text-muted-foreground"
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// 桌面版篩選：搜尋列旁的 popover 下拉按鈕。
// 原本三列全寬 Collapsible 收合列各只有短標題＋箭頭，包在大卡片裡
// 佔了近半屏卻幾乎全是留白；改為工具列後整個篩選區只佔一列高度，
// 面板浮出、不推擠結果列表。單選條件直接把值寫進按鈕文字（如「類別：美髮」），
// 多選則顯示數量徽章，不展開也能看到目前條件。
function DesktopFilterPopover({
  label,
  summary,
  count,
  panelClassName,
  children,
}: {
  label: string;
  /** 已選條件的摘要文字（取代 label 顯示）；未選或多選時傳 undefined */
  summary?: string;
  count: number;
  panelClassName?: string;
  children: React.ReactNode;
}) {
  const active = count > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 gap-1.5 rounded-full",
            active && "border-primary/60 bg-primary/5",
          )}
        >
          <span>{summary ?? label}</span>
          {/* 摘要已含選中的值時不再重複顯示數字 */}
          {!summary && <FilterCountBadge count={count} />}
          <ChevronDown className="h-4 w-4 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className={cn("p-4", panelClassName)}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

function GenderFilterChips({
  selectedGenders,
  onGenderChange,
}: {
  selectedGenders: string[];
  onGenderChange: (gender: string, checked: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {GENDER_OPTIONS.map((gender) => (
        <FilterChip
          key={gender}
          label={gender}
          selected={selectedGenders.includes(gender)}
          onToggle={() =>
            onGenderChange(gender, !selectedGenders.includes(gender))
          }
          className="min-w-20"
        />
      ))}
    </div>
  );
}

// 服務類別（單選）：chip 以內容寬度自動換行排滿整行，
// 取代一欄一項的直列，30 個類別不再需要長距離捲動。
// 再點一次已選類別可取消（回到全部）。
function CategoryFilterChips({
  selectedCategory,
  onSelect,
}: {
  selectedCategory: string;
  onSelect: (category: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <FilterChip
        label="全部類別"
        selected={selectedCategory === ""}
        onToggle={() => onSelect("")}
      />
      {SERVICE_CATEGORIES.map((category) => (
        <FilterChip
          key={category}
          label={category}
          selected={selectedCategory === category}
          onToggle={() =>
            onSelect(selectedCategory === category ? "" : category)
          }
        />
      ))}
    </div>
  );
}

// 服務地區：縣市 chip 換行排列；選了縣市後，該縣市的區域 chip 面板
// 直接顯示在下方（預設全區），不再需要 checkbox + 展開箭頭的雙重操作。
function LocationFilterChips({
  selectedCities,
  districtsByCity,
  onCityChange,
  onDistrictChange,
}: {
  selectedCities: string[];
  /** 以縣市為 scope 的選區狀態：各市「全區」互相獨立、同名區不跨市誤配 */
  districtsByCity: DistrictSelectionByCity;
  onCityChange: (city: string, checked: boolean) => void;
  onDistrictChange: (city: string, district: string, checked: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TAIWAN_CITIES.map((city) => (
          <FilterChip
            key={city}
            label={city}
            selected={selectedCities.includes(city)}
            onToggle={() => onCityChange(city, !selectedCities.includes(city))}
          />
        ))}
      </div>
      {selectedCities.map((city) => (
        <div key={city} className="space-y-2 rounded-lg bg-muted/30 p-3">
          <p className="text-sm font-medium">{city}的服務區域</p>
          <div className="flex flex-wrap gap-2">
            <FilterChip
              label="全區"
              selected={cityDistricts(districtsByCity, city).includes("全區")}
              onToggle={() =>
                onDistrictChange(
                  city,
                  "全區",
                  !cityDistricts(districtsByCity, city).includes("全區"),
                )
              }
            />
            {TAIWAN_REGIONS[city]?.map((district) => (
              <FilterChip
                key={district}
                label={district}
                selected={cityDistricts(districtsByCity, city).includes(district)}
                onToggle={() =>
                  onDistrictChange(
                    city,
                    district,
                    !cityDistricts(districtsByCity, city).includes(district),
                  )
                }
              />
            ))}
          </div>
        </div>
      ))}
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