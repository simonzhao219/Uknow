import { Link } from "react-router-dom";
import { ImageWithFallback } from "../figma/ImageWithFallback";

// 手機首頁「照片牆」磚塊（3 欄密集網格用）。
//
// 取向刻意與 2 欄詳細卡相反：照片滿版、資訊直接疊在照片上，只保留使用者決策
// 時最先看的兩項——服務類別（左上）與名稱（左下）。地區 / 服務介紹 / 性別留給
// 詳細模式與詳情頁，避免在 ~120px 寬的小磚上塞爆。
//
// 防跑版 / 防溢出（過去踩過的坑 + Safari）重點：
//   * aspect-square 固定磚形，父層用 grid-cols-3 + minmax(0,1fr) 讓欄寬可縮，
//     不會被內容撐出水平捲軸。
//   * 類別標籤與名稱都 truncate 單行，並以 max-w 限制寬度，長字只截斷不換行。
//   * 底部加深色漸層遮罩，白字名稱在任何亮度的照片上都可讀（不用 backdrop-blur，
//     Safari 上較容易卡頓 / 破圖）。
export function MobilePhotoWallCard({ serviceProvider }: { serviceProvider: any }) {
  return (
    <Link
      to={`/service-providers/${serviceProvider.id}`}
      className="relative block aspect-square overflow-hidden bg-muted"
    >
      <ImageWithFallback
        src={serviceProvider.photos?.[0]}
        alt={serviceProvider.name}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* 服務類別：左上角膠囊。max-w 收在磚內、truncate 讓長類別單行截斷 */}
      <span className="absolute left-1 top-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-black/55 px-1.5 py-0.5 text-[11px] leading-tight text-white">
        {serviceProvider.category}
      </span>

      {/* 底部漸層 + 名稱：漸層確保白字可讀，名稱單行截斷 */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-1.5 pb-1.5 pt-6">
        <h3 className="truncate text-sm font-medium text-white drop-shadow-sm">
          {serviceProvider.name}
        </h3>
      </div>
    </Link>
  );
}
