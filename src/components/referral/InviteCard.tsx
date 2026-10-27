// 邀請卡片（Email 邀請 R2）——三處「邀請好友」入口在旗標開啟時共用這一張。
//
// 一顆主鈕兩種身分：email 留空是「快速分享」（現行 shareReferralInvite，按下即關卡）；
// 填了 email 是「用 Email 邀請」（POST /referrals/invites，同意聲明必勾）。寄不了時
// 主鈕換回「快速分享」，錯誤句也講到它（按鈕改名對讀報器無聲）。結果只寫進同一個常駐
// live region，不用 toast；文案一律依 error code，不讀後端 message。
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import {
  normalizeReferralInviteEmail,
  REFERRAL_INVITE_TOKEN_TTL_SECONDS,
  referralInviteConsentText,
} from '@referral-invite-payload';
import type { ReferralInviteErrorCode } from '@contract';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { BreakableEmail } from '../common/BreakableEmail';
import { useNotification } from '../notifications/NotificationContext';
import { ApiError, apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { shareReferralInvite } from '../../utils/referralInvite';
import { cn } from '../ui/utils';

/** 與後端 REFERRAL_INVITE_RATE_MAX／_RATE_WINDOW_SECONDS 相等（backendConstants 測試把關）。 */
const HOURLY_MAX = 5;
/** 與後端 REFERRAL_INVITE_TARGET_WINDOW_SECONDS 相等（同上）。 */
const TARGET_WINDOW_HOURS = 24;
const TOKEN_TTL_DAYS = REFERRAL_INVITE_TOKEN_TTL_SECONDS / (24 * 60 * 60);
/** 寄送最壞約 30 秒（寄送、蓋章、補償各 10 秒），apiRequest 沒有逾時——卡片自己收。 */
const REQUEST_TIMEOUT_MS = 25_000;

const ERROR_TEXT: Record<ReferralInviteErrorCode, string> = {
  invalid_email: 'Email 格式不正確',
  self_invite: '不能邀請自己',
  consent_required: '請先勾選同意聲明',
  not_joined: '暫時無法寄送，可改按下方『快速分享』',
  restricted: '暫時無法寄送，可改按下方『快速分享』',
  rate_limited_hour: `每小時最多寄 ${HOURLY_MAX} 封，請稍後再試，或改按下方『快速分享』`,
  rate_limited_day: '今天的邀請額度已用完，請明天再試或改按下方『快速分享』',
  unavailable: '暫時無法寄送，可改按下方『快速分享』',
  disabled: 'Email 邀請暫停中，可改按下方『快速分享』',
};

/** 寄不了：主鈕換成「快速分享」。 */
const SWAP_TO_SHARE = new Set<ReferralInviteErrorCode>([
  'rate_limited_hour',
  'rate_limited_day',
  'unavailable',
  'disabled',
  'restricted',
  'not_joined',
]);
/** 重試必敗：本次開卡期間收合 email 區。 */
const LOCKED = new Set<ReferralInviteErrorCode>(['disabled', 'restricted', 'not_joined']);
/** 欄位錯：標在 email 欄。 */
const FIELD_ERRORS = new Set<ReferralInviteErrorCode>(['invalid_email', 'self_invite']);

function toErrorCode(error: unknown): ReferralInviteErrorCode {
  const code = error instanceof ApiError ? error.code : undefined;
  return code && code in ERROR_TEXT ? (code as ReferralInviteErrorCode) : 'unavailable';
}

type Live = (
  | { kind: 'none' }
  | { kind: 'text'; text: string; error: boolean }
  | { kind: 'accepted'; email: string }
) & {
  seq?: number;
};

interface InviteCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  memberName?: string | null;
}

export function InviteCardDialog({ open, onOpenChange, code, memberName }: InviteCardDialogProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto max-sm:top-4 max-sm:translate-y-0"
        onOpenAutoFocus={(e) => {
          // 聚焦標題而非 email 欄：不一開卡就彈鍵盤（多數人是要快速分享）。
          e.preventDefault();
          titleRef.current?.focus();
        }}
      >
        {/* Radix 關卡即卸載內容：全部狀態隨關卡歸零（勾選是對這一次寄送的同意）。 */}
        <InviteCard
          titleRef={titleRef}
          code={code}
          memberName={memberName}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function InviteCard({
  titleRef,
  code,
  memberName,
  onClose,
}: {
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  code: string;
  memberName?: string | null;
  onClose: () => void;
}) {
  const { showToast } = useNotification();
  const ids = useId();
  const emailId = `${ids}-email`;
  const descId = `${ids}-desc`;
  const liveId = `${ids}-live`;
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [consentInvalid, setConsentInvalid] = useState(false);
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState<Live>({ kind: 'none' });
  const [errorCode, setErrorCode] = useState<ReferralInviteErrorCode | null>(null);
  const [locked, setLocked] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLButtonElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const unmountedRef = useRef(false);

  // 關卡（卸載）時中止在途請求；中止後的失敗不再寫回已卸載的卡片。
  useEffect(
    () => () => {
      unmountedRef.current = true;
      abortRef.current?.abort();
    },
    [],
  );

  // 結果出現時捲到看得見（手機鍵盤開著時主鈕下方容易被蓋住）。
  useEffect(() => {
    if (live.kind !== 'none') liveRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [live]);

  const trimmed = email.trim();
  const name = memberName?.trim() || '';
  // 同意聲明要寫出信中會顯示的推薦人姓名；沒有姓名就不提供 Email 邀請，只剩快速分享。
  const canEmail = !locked && name !== '';
  const hasEmail = canEmail && trimmed !== '';
  const swapToShare = errorCode !== null && SWAP_TO_SHARE.has(errorCode);
  const fieldError = errorCode !== null && FIELD_ERRORS.has(errorCode);
  const showShare = !hasEmail || swapToShare;

  /** 每次寫入換一個 key，讓 live region 的內容節點重建：同一句也會重播。 */
  const seqRef = useRef(0);
  const announce = (next: Live) => {
    seqRef.current += 1;
    setLive({ ...next, seq: seqRef.current });
  };

  const handleEmailChange = (value: string) => {
    const changed = value.trim().toLowerCase() !== email.trim().toLowerCase();
    setEmail(value);
    if (!changed) return;
    setErrorCode(null);
    setConsentInvalid(false);
    if (consent) {
      setConsent(false);
      announce({ kind: 'text', text: 'Email 已變更，請重新勾選同意聲明', error: false });
    } else if (live.kind !== 'none') {
      // 錯誤句與上一筆的受理訊息都屬於舊的輸入。
      setLive({ kind: 'none' });
    }
  };

  const quickShare = () => {
    shareReferralInvite(code, showToast, memberName);
    onClose();
  };

  const fail = (code: ReferralInviteErrorCode) => {
    setErrorCode(code);
    if (LOCKED.has(code)) setLocked(true);
    announce({ kind: 'text', text: ERROR_TEXT[code], error: true });
    if (FIELD_ERRORS.has(code)) emailRef.current?.focus();
  };

  const sendInvite = async () => {
    if (sendingRef.current) return;
    if (!consent) {
      setConsentInvalid(true);
      consentRef.current?.focus();
      announce({ kind: 'text', text: ERROR_TEXT.consent_required, error: true });
      return;
    }
    const normalized = normalizeReferralInviteEmail(email);
    if (!normalized) {
      fail('invalid_email');
      return;
    }

    sendingRef.current = true;
    setSending(true);
    // 上一次的錯誤句屬於上一次送出，在途期間不留著。
    setLive({ kind: 'none' });
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      await apiRequestJson(buildApiUrl('/referrals/invites'), {
        method: 'POST',
        body: JSON.stringify({ email: normalized, consent: true }),
        signal: controller.signal,
      });
      setEmail('');
      setConsent(false);
      setErrorCode(null);
      announce({ kind: 'accepted', email: normalized });
    } catch (error) {
      if (unmountedRef.current) return;
      fail(toErrorCode(error));
    } finally {
      clearTimeout(timer);
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sendingRef.current) return;
    if (showShare) {
      quickShare();
      return;
    }
    void sendInvite();
  };

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle asChild>
          <h2
            ref={titleRef}
            tabIndex={-1}
            className="text-lg leading-none font-semibold outline-none"
          >
            邀請好友
          </h2>
        </DialogTitle>
        <DialogDescription id={descId}>
          填寫 Email，由 Uknow 代寄邀請信給對方；留空則用 LINE 等 App 分享你的邀請連結
        </DialogDescription>
      </DialogHeader>

      {canEmail && (
        <div className="space-y-2">
          <Label htmlFor={emailId}>對方的 Email（選填）</Label>
          <Input
            ref={emailRef}
            id={emailId}
            type="text"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            readOnly={sending}
            aria-readonly={sending || undefined}
            aria-invalid={fieldError || undefined}
            aria-describedby={fieldError ? `${descId} ${liveId}` : descId}
            onChange={(e) => handleEmailChange(e.target.value)}
          />
        </div>
      )}

      {/* 主鈕換成快速分享時沒有對應的寄送動作：同意聲明收起（勾選狀態保留，email 一改即重置）。 */}
      {hasEmail && !swapToShare && (
        <div className="flex items-start gap-2">
          <Checkbox
            ref={consentRef}
            id={`${ids}-consent`}
            touchTarget="expanded"
            checked={consent}
            disabled={sending}
            aria-invalid={consentInvalid || undefined}
            onCheckedChange={(checked) => {
              setConsent(checked === true);
              if (checked === true) setConsentInvalid(false);
            }}
            className="mt-0.5"
          />
          <Label
            htmlFor={`${ids}-consent`}
            className="min-w-0 flex-1 cursor-pointer text-sm leading-relaxed font-normal wrap-anywhere"
          >
            {referralInviteConsentText(name)}
          </Label>
        </div>
      )}

      <Button
        type="submit"
        tone="flow"
        className={cn('w-full', sending && 'pointer-events-none opacity-60')}
        aria-disabled={sending || undefined}
        data-testid="invite-card-submit"
      >
        {sending ? '寄送中…' : showShare ? '快速分享' : '用 Email 邀請'}
      </Button>

      <div
        ref={liveRef}
        id={liveId}
        aria-live="polite"
        data-testid="invite-card-live"
        className={cn(
          'space-y-1 text-sm',
          live.kind === 'text' && live.error && 'text-destructive',
        )}
      >
        {live.kind === 'text' && <span key={live.seq}>{live.text}</span>}
        {live.kind === 'accepted' && (
          <Fragment key={live.seq}>
            <p>
              已受理邀請（寄往 <BreakableEmail email={live.email} />
              ）。
            </p>
            <p>
              若對方還沒有 Uknow 帳號、且 {TARGET_WINDOW_HOURS} 小時內沒收過邀請，會收到一封由 Uknow
              寄出的邀請信，連結 {TOKEN_TTL_DAYS} 天內有效。
            </p>
            <p>請提醒對方查看垃圾郵件匣。</p>
          </Fragment>
        )}
      </div>
    </form>
  );
}
