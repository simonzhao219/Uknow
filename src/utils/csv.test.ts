import { describe, it, expect } from 'vitest';
import { escapeCsvField, buildCsvContent } from './csv';

describe('escapeCsvField', () => {
  it('不含特殊字元時原樣輸出', () => {
    expect(escapeCsvField('王小明')).toBe('王小明');
  });

  it('null 與 undefined 都輸出空字串', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('含逗號時以雙引號包起', () => {
    expect(escapeCsvField('台北市,大安區')).toBe('"台北市,大安區"');
  });

  it('含雙引號時內部引號加倍並整體包起', () => {
    expect(escapeCsvField('他說「"急件"」')).toBe('"他說「""急件""」"');
  });

  it('含換行時以雙引號包起而不截斷該列', () => {
    expect(escapeCsvField('第一行\n第二行')).toBe('"第一行\n第二行"');
  });

  it('以等號開頭時加前導單引號擋公式注入', () => {
    expect(escapeCsvField('=1+1')).toBe("'=1+1");
  });

  it('以加號、減號、小老鼠開頭時同樣加前導單引號', () => {
    expect(escapeCsvField('+SUM(A1)')).toBe("'+SUM(A1)");
    expect(escapeCsvField('-2+3')).toBe("'-2+3");
    expect(escapeCsvField('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('數字型別不套公式跳脫,負數維持可計算', () => {
    expect(escapeCsvField(-15)).toBe('-15');
    expect(escapeCsvField(1000)).toBe('1000');
  });

  it('公式字元與逗號同時出現時兩種跳脫都套用', () => {
    expect(escapeCsvField('=A1,B1')).toBe('"\'=A1,B1"');
  });
});

describe('buildCsvContent', () => {
  it('以 BOM 開頭,讓 Excel 正確辨識 UTF-8 中文', () => {
    expect(buildCsvContent(['會員'], [['王小明']]).startsWith('﻿')).toBe(true);
  });

  it('標題與資料列以換行分隔、欄位以逗號分隔', () => {
    const csv = buildCsvContent(['會員', '金額'], [['王小明', 1000]]);
    expect(csv).toBe('﻿會員,金額\n王小明,1000');
  });

  it('多列資料各自成行', () => {
    const csv = buildCsvContent(['會員'], [['甲'], ['乙']]);
    expect(csv).toBe('﻿會員\n甲\n乙');
  });

  it('資料列的特殊字元逐欄跳脫', () => {
    const csv = buildCsvContent(['備註'], [['a,b']]);
    expect(csv).toBe('﻿備註\n"a,b"');
  });

  it('標題本身含特殊字元時同樣跳脫', () => {
    expect(buildCsvContent(['金額,含手續費'], [])).toBe('﻿"金額,含手續費"');
  });

  it('沒有資料列時只輸出標題,不留空行', () => {
    expect(buildCsvContent(['會員'], [])).toBe('﻿會員');
  });
});
