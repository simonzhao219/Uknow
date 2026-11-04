// 距離計算與縣市中心座標（縣市級，階段 2 起改為區級，見 listingDistanceOrder）。
export type LatLng = { lat: number; lng: number };

// 計算兩個經緯度座標之間的距離（使用 Haversine 公式，單位：公里）
export const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const R = 6371; // 地球半徑（公里）
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// 台灣縣市座標對照表（用於距離計算）
export const cityCoordinates: Record<string, LatLng> = {
  台北市: { lat: 25.033, lng: 121.5654 },
  新北市: { lat: 25.0118, lng: 121.4654 },
  桃園市: { lat: 24.9936, lng: 121.301 },
  台中市: { lat: 24.1477, lng: 120.6736 },
  台南市: { lat: 22.9999, lng: 120.2269 },
  高雄市: { lat: 22.6273, lng: 120.3014 },
  基隆市: { lat: 25.1276, lng: 121.7392 },
  新竹市: { lat: 24.8138, lng: 120.9675 },
  嘉義市: { lat: 23.4801, lng: 120.4491 },
  新竹縣: { lat: 24.8387, lng: 121.0177 },
  苗栗縣: { lat: 24.5604, lng: 120.8214 },
  彰化縣: { lat: 24.0518, lng: 120.5161 },
  南投縣: { lat: 23.9609, lng: 120.9719 },
  雲林縣: { lat: 23.7092, lng: 120.4313 },
  嘉義縣: { lat: 23.4518, lng: 120.2554 },
  屏東縣: { lat: 22.5519, lng: 120.5487 },
  宜蘭縣: { lat: 24.7021, lng: 121.7378 },
  花蓮縣: { lat: 23.9871, lng: 121.6015 },
  台東縣: { lat: 22.7972, lng: 121.1713 },
  澎湖縣: { lat: 23.5713, lng: 119.5794 },
  金門縣: { lat: 24.4324, lng: 118.3175 },
  連江縣: { lat: 26.1605, lng: 119.9297 },
};
