'use client';

import { Button, FormMessage, TextField } from '@thippo/ui';
import { useActionState, useState, useTransition } from 'react';
import type { FormState, TotpEnrollment } from '../actions';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
const initial: FormState = {};

export function LoginForm({
  action,
  next,
  notice,
}: {
  action: Action;
  next?: string;
  notice?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} noValidate>
      {notice && !state.message ? <FormMessage>{notice}</FormMessage> : null}
      <FormMessage>{state.message}</FormMessage>
      <input type="hidden" name="next" value={next ?? ''} />
      <TextField
        label="メールアドレス"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        error={state.errors?.email}
      />
      <TextField
        label="パスワード"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.errors?.password}
      />
      <Button type="submit" disabled={pending} style={{ width: '100%' }}>
        {pending ? 'ログイン中…' : 'ログイン'}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} noValidate>
      <FormMessage kind={state.ok ? 'success' : 'error'}>{state.message}</FormMessage>
      <TextField
        label="メールアドレス"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        error={state.errors?.email}
      />
      <Button type="submit" disabled={pending} style={{ width: '100%' }}>
        再設定のメールを送る
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} noValidate>
      <FormMessage>{state.message}</FormMessage>
      <TextField
        label="新しいパスワード（10文字以上）"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={state.errors?.password}
      />
      <TextField
        label="新しいパスワード（確認）"
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        required
        error={state.errors?.passwordConfirm}
      />
      <Button type="submit" disabled={pending} style={{ width: '100%' }}>
        パスワードを変更する
      </Button>
    </form>
  );
}

export function TotpCodeForm({ action, factorId }: { action: Action; factorId?: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} noValidate>
      <FormMessage>{state.message}</FormMessage>
      {factorId ? <input type="hidden" name="factorId" value={factorId} /> : null}
      <TextField
        label="認証アプリに表示された6桁のコード"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        error={state.errors?.code}
      />
      <Button type="submit" disabled={pending} style={{ width: '100%' }}>
        確認する
      </Button>
    </form>
  );
}

export function TotpEnrollForm({
  start,
  verify,
}: {
  start: () => Promise<TotpEnrollment | { error: string }>;
  verify: Action;
}) {
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!enrollment) {
    return (
      <div>
        <FormMessage>{error}</FormMessage>
        <p style={{ fontSize: 14 }}>
          運営管理を使うには2段階認証の登録が必要です。Google Authenticator
          などの認証アプリを用意してください。
        </p>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await start();
              if ('error' in r) setError(r.error);
              else setEnrollment(r);
            })
          }
        >
          登録を開始する
        </Button>
      </div>
    );
  }
  return (
    <div>
      <p style={{ fontSize: 14 }}>
        認証アプリで QR コードを読み取り、表示されたコードを入力してください。
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL の QR コード */}
      <img src={enrollment.qrCode} alt="2段階認証の QR コード" width={200} height={200} />
      <p style={{ fontSize: 12, wordBreak: 'break-all' }}>
        読み取れない場合はこのキーを入力: <code>{enrollment.secret}</code>
      </p>
      <TotpCodeForm action={verify} factorId={enrollment.factorId} />
    </div>
  );
}

export function SignOutButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <Button type="submit" variant="secondary">
        ログアウト
      </Button>
    </form>
  );
}
