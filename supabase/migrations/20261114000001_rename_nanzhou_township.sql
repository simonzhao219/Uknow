-- 屏東縣「南鄉」更正為正式名稱「南州鄉」（W5-65、W6-9）。
-- 冪等：只動仍含舊值的列，重跑時 where 不命中、不改任何列。
-- 同一筆已同時含「南州鄉」時直接移除「南鄉」，避免 array_replace 產生重複的「南州鄉」。
update public.listings
   set districts = case
         when '南州鄉' = any(districts) then array_remove(districts, '南鄉')
         else array_replace(districts, '南鄉', '南州鄉')
       end
 where '南鄉' = any(districts);
