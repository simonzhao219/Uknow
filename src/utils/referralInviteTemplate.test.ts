// Email 邀請信模板（supabase/email-templates/referral-invite.html）的內容契約。
// 模板是貼進 Supabase Dashboard「Invite user」的單一事實來源；這裡讀檔斷言：
// 揭露句、R2／一般兩分支、告知九要素、刪除措辭、數字綁程式常數、不含禁用字樣、
// 不用 GoTrue 自己的一次性連結、版面與驗證碼信（confirm-signup.html）一致（業主 2026-10-27 裁決 25）。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findForbiddenWord, referralDisclosureSentence } from '@recruitment-copy';
import { REFERRAL_INVITE_TOKEN_TTL_SECONDS } from '@referral-invite-payload';
import { OFFICIAL_EMAIL, YEARLY_PRICE } from './constants';
import { readPurgeDefaultDays } from '../test-utils/backendConstants';

const html = readFileSync(
  resolve(__dirname, '../../supabase/email-templates/referral-invite.html'),
  'utf8',
);
const R2_IF = '{{ if .Data.referral_invite_url }}';
// R2 內容分兩段：卡片內的邀請主體，與卡片外的個資告知小字（都只在 R2 邀請出現）。
// 每段從 `{{ if … }}` 取到它的 `{{ else }}` 或 `{{ end }}`。
const r2Branch = html
  .split(R2_IF)
  .slice(1)
  .map((part) => part.split(/\{\{ (?:else|end) \}\}/)[0])
  .join('\n');
const generalBranch = html.slice(html.indexOf('{{ else }}'), html.indexOf('{{ end }}'));
const NAME = '{{ .Data.referral_invite_name }}';

describe('referral-invite.html 結構', () => {
  it('以 referral_invite_url 分出 R2 與一般邀請兩支', () => {
    expect(html).toContain(R2_IF);
    expect(html).toContain('{{ else }}');
    expect(html).toContain('{{ end }}');
    expect(r2Branch.length).toBeGreaterThan(0);
    expect(generalBranch).toContain('{{ .ConfirmationURL }}');
  });

  it('檔頭註解說明 Dashboard 預覽會同時顯示兩個分支', () => {
    expect(html).toMatch(/預覽.*兩個分支|兩個分支.*預覽/);
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
  it('含推薦人揭露句（與 R1a-3 同一常數，姓名為模板變數）', () => {
    expect(r2Branch).toContain(referralDisclosureSentence(NAME));
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

  it('信件只表達邀請：不出現年費金額，客服信箱等於 OFFICIAL_EMAIL', () => {
    expect(html).not.toContain(`NT$${YEARLY_PRICE.toLocaleString('en-US')}`);
    expect(html).not.toContain('年費');
    expect(r2Branch).toContain(`mailto:${OFFICIAL_EMAIL}`);
  });

  it('不附服務條款／事業手冊連結與複製網址段', () => {
    expect(html).not.toContain('terms-of-service');
    expect(html).not.toContain('business-manual');
    expect(html).not.toContain('按鈕無法使用時');
  });

  it('7 天綁 token 效期與 purge 預設天數', () => {
    const days = REFERRAL_INVITE_TOKEN_TTL_SECONDS / 86400;
    expect(readPurgeDefaultDays()).toBe(days);
    expect(r2Branch).toContain(`連結 ${days} 天內有效`);
    expect(r2Branch).toContain(`${days} 天內未透過連結設定密碼即刪除`);
  });
});

describe('referral-invite.html 版面', () => {
  it('版型與驗證碼信一致：外層 48px 20px、卡片 520px、內文左右 40px', () => {
    expect(html).toContain('background-color:#f2f2f2;padding:48px 20px;');
    expect(html).toContain('max-width:520px');
    expect(r2Branch).toMatch(/<td style="padding:\d+px 40px/);
  });

  it('個資告知以卡片外的小字呈現、仍可讀', () => {
    const notice = r2Branch.slice(r2Branch.indexOf('資料來源'));
    expect(notice).toMatch(/font-size:1[12]px/);
  });

  it('不用淡灰頁尾色', () => {
    expect(html.toLowerCase()).not.toMatch(/#c0c0c8|#b0b0b8/);
  });
});
