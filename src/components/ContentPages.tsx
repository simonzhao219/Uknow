// 法務內容路由的 lazy 進入點。
//
// 這個檔案是刻意的 chunk 邊界：App.tsx 以 React.lazy 載入這裡的四個
// 頁面元件，讓 MarkdownContent 與三份長文（刊登方案、推薦獎勵規則、
// 推薦獎勵合約）只在使用者實際點進內容頁時才下載，不進首屏 bundle。
// （termsOfService 因 CompleteProfile 的就地彈窗也需要，仍會存在於
// 註冊流程的 chunk——這裡引用的是同一份模組，不會重複打包。）
import { MarkdownContent } from './MarkdownContent';
import { termsOfServiceContent } from '../content/termsOfService';
import { listingPlansContent } from '../content/listingPlans';
import { referralRewardRulesContent } from '../content/referralRewardRules';
import { referralRewardContractContent } from '../content/referralRewardContract';

export function TermsOfServicePage() {
  return <MarkdownContent content={termsOfServiceContent} title="服務條款" />;
}

export function ListingPlansPage() {
  return <MarkdownContent content={listingPlansContent} title="刊登方案" />;
}

export function ReferralRewardRulesPage() {
  return <MarkdownContent content={referralRewardRulesContent} title="推薦獎勵規則" />;
}

export function ReferralRewardContractPage() {
  return <MarkdownContent content={referralRewardContractContent} title="推薦獎勵合約" />;
}
