-- 屏東縣「南鄉」更正為正式名稱「南州鄉」（W5-65、W6-9）。
-- 冪等：只動仍含舊值的列，重跑時 where 不命中、不改任何列。
update public.listings
   set districts = array_replace(districts, '南鄉', '南州鄉')
 where '南鄉' = any(districts);
