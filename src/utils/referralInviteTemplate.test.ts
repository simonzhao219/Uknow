// Email 邀請信模板（supabase/email-templates/referral-invite.html）的內容契約。
// 模板是貼進 Supabase Dashboard「Invite user」的單一事實來源；這裡讀檔斷言：
// 揭露句、R2／一般兩分支、告知九要素、刪除措辭、數字綁程式常數、不含禁用字樣、
// 不用 GoTrue 自己的一次性連結、版面（側邊 padding 合計 ≤ 24px、網址可斷行）。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findForbiddenWord } from '@recruitment-copy';
import { REFERRAL_INVITE_TOKEN_TTL_SECONDS } from '@referral-invite-payload';
import { OFFICIAL_EMAIL, YEARLY_PRICE } from './constants';
import { readBackendConstant, readPurgeDefaultDays } from '../test-utils/backendConstants';

const html = readFileSync(
  resolve(__dirname, '../../supabase/email-templates/referral-invite.html'),
  'utf8',
);
const r2Branch = html.slice(
  html.indexOf('{{ if .Data.referral_invite_url }}'),
  html.indexOf('{{ else }}'),
);
const NAME = '{{ .Data.referral_invite_name }}';

describe('referral-invite.html 結構', () => {
  it('以 referral_invite_url 分出 R2 與一般邀請兩支', () => {
    expect(html).toContain('{{ if .Data.referral_invite_url }}');
    expect(html).toContain('{{ else }}');
    expect(html).toContain('{{ end }}');
    expect(r2Branch.length).toBeGreaterThan(0);
  });

  it('R2 分支的連結只用 user_metadata 的 referral_invite_url', () => {
    expect(r2Branch).toContain('href="{{ .Data.referral_invite_url }}"');
    for (const v of [
      '{{ .Token }}',
      '{{ .TokenHash }}',
      '{{ .ConfirmationURL }}',
      '{{ .RedirectTo }}',
      '{{ .SiteURL }}',
    ]) {
      expect(r2Branch).not.toContain(v);
    }
  });

  it('全文不含 {{ .Token }}', () => {
    expect(html).not.toContain('{{ .Token }}');
  });
});

describe('referral-invite.html 文案', () => {
  it('含推薦人揭露句（姓名為模板變數）', () => {
    expect(r2Branch).toContain(`本邀請由 Uknow 推薦人 ${NAME} 發送`);
  });

  it('用語一律推薦人，不出現上線或上層', () => {
    expect(html).not.toMatch(/上線|上層/);
  });

  it('不含招募禁用字樣', () => {
    expect(findForbiddenWord(html)).toBeUndefined();
  });

  it('含公司名與個資告知九要素', () => {
    expect(r2Branch).toContain('優識生活有限公司');
    for (const label of [
      '資料來源',
      '蒐集者',
      '蒐集目的',
      '資料類別',
      '利用期間',
      '利用地區',
      '利用對象',
      '利用方式',
      '當事人權利',
    ]) {
      expect(r2Branch).toContain(`${label}：`);
    }
  });

  it('含刪除措辭與系統紀錄保存句', () => {
    expect(r2Branch).toContain('7 天內未透過連結設定密碼即刪除');
    expect(r2Branch).toContain('系統紀錄依雲端服務商保存期限保存');
  });

  it('年費金額等於 YEARLY_PRICE、客服信箱等於 OFFICIAL_EMAIL', () => {
    expect(r2Branch).toContain(`NT$${YEARLY_PRICE.toLocaleString('en-US')}`);
    expect(r2Branch).toContain(`mailto:${OFFICIAL_EMAIL}`);
  });

  it('7 天綁 token 效期與 purge 預設天數、24 小時綁同一信箱窗口', () => {
    const days = REFERRAL_INVITE_TOKEN_TTL_SECONDS / 86400;
    expect(readPurgeDefaultDays()).toBe(days);
    expect(r2Branch).toContain(`連結 ${days} 天內有效`);
    const hours = readBackendConstant('REFERRAL_INVITE_TARGET_WINDOW_SECONDS') / 3600;
    expect(r2Branch).toContain(`同一信箱 ${hours} 小時內最多收到一封邀請`);
  });
});

describe('referral-invite.html 版面', () => {
  it('外層與卡片的側邊 padding 合計不超過 24px', () => {
    const outer = html.match(/background-color:#f2f2f2;padding:(\d+)px (\d+)px;/);
    expect(outer).not.toBeNull();
    const outerSide = Number(outer?.[2]);
    const cardSides = [...r2Branch.matchAll(/<td style="padding:\d+px (\d+)px/g)].map((m) =>
      Number(m[1]),
    );
    expect(cardSides.length).toBeGreaterThan(0);
    for (const side of cardSides) expect(outerSide + side).toBeLessThanOrEqual(24);
  });

  it('純文字網址可斷行', () => {
    expect(r2Branch).toMatch(/word-break:break-all;\s*overflow-wrap:anywhere/);
  });

  it('不用淡灰頁尾色', () => {
    expect(html.toLowerCase()).not.toMatch(/#c0c0c8|#b0b0b8/);
  });
});
