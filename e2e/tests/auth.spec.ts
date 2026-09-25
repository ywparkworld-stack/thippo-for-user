import { expect, test, type Page } from '@playwright/test';
import { auditActions, closeDb, createTestUser, setStatus, type TestUser } from '../support/db';
import { urls } from '../support/env';
import { waitForMailLink } from '../support/mail';
import { freshTotp } from '../support/totp';

test.afterAll(async () => {
  await closeDb();
});

async function login(
  page: Page,
  base: string,
  user: { email: string; password: string },
  path = '/login',
) {
  await page.goto(`${base}${path}`);
  await page.getByLabel('メールアドレス').fill(user.email);
  await page.getByLabel('パスワード', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
}

test.describe('利用者サイト', () => {
  test('未ログインで会員ページを開くとログイン画面に移り、ログイン後に元のページへ戻る', async ({
    page,
  }) => {
    const user = await createTestUser('guest');
    await page.goto(`${urls.guest}/mypage`);
    await expect(page).toHaveURL(`${urls.guest}/login?next=%2Fmypage`);
    await page.getByLabel('メールアドレス').fill(user.email);
    await page.getByLabel('パスワード', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page).toHaveURL(`${urls.guest}/mypage`);
    await expect(page.getByText(user.email)).toBeVisible();

    await page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page).toHaveURL(`${urls.guest}/login`);
    await page.goto(`${urls.guest}/mypage`);
    await expect(page).toHaveURL(/\/login/);
  });

  test('パスワードが違うときは理由を区別しないメッセージを出す', async ({ page }) => {
    const user = await createTestUser('guest');
    await login(page, urls.guest, { email: user.email, password: 'wrong-password-1' });
    await expect(
      page.getByText('メールアドレスまたはパスワードが正しくありません。'),
    ).toBeVisible();
    await login(page, urls.guest, {
      email: 'nobody-e2e@example.com',
      password: 'wrong-password-1',
    });
    await expect(
      page.getByText('メールアドレスまたはパスワードが正しくありません。'),
    ).toBeVisible();
  });

  test('外部サイトへの戻り先は無視する', async ({ page }) => {
    const user = await createTestUser('guest');
    await login(page, urls.guest, user, '/login?next=https%3A%2F%2Fevil.example%2F');
    await expect(page).toHaveURL(`${urls.guest}/mypage`);
  });

  test('貸出主・運営のアカウントでは利用者サイトにログインできない', async ({ page }) => {
    for (const role of ['host', 'admin'] as const) {
      const user = await createTestUser(role);
      await login(page, urls.guest, user);
      await expect(
        page.getByText('このサイトではご利用いただけないアカウントです。'),
      ).toBeVisible();
      await page.goto(`${urls.guest}/mypage`);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('停止されたアカウントはログインできず、ログイン中のセッションも使えなくなる', async ({
    page,
  }) => {
    const user = await createTestUser('guest');
    await login(page, urls.guest, user);
    await expect(page).toHaveURL(`${urls.guest}/mypage`);

    await setStatus(user.id, 'suspended');
    await page.goto(`${urls.guest}/mypage`);
    await expect(page).toHaveURL(/\/login\?reason=suspended/);
    await expect(page.getByText('このアカウントは停止されています。')).toBeVisible();

    await login(page, urls.guest, user);
    await expect(
      page.getByText('このアカウントは停止されています。お問い合わせください。'),
    ).toBeVisible();
  });

  test('ログインの試行回数が多すぎると一時的に止める', async ({ page }) => {
    const user = await createTestUser('guest');
    for (let i = 0; i < 10; i++) {
      await login(page, urls.guest, { email: user.email, password: `wrong-password-${i}` });
      await expect(
        page.getByText('メールアドレスまたはパスワードが正しくありません。'),
      ).toBeVisible();
    }
    // 正しいパスワードでも止まる
    await login(page, urls.guest, user);
    await expect(page.getByText('試行回数が多すぎます。')).toBeVisible();
  });

  test('パスワードを再設定できる', async ({ page }) => {
    const user = await createTestUser('guest');
    await page.goto(`${urls.guest}/forgot-password`);
    await page.getByLabel('メールアドレス').fill(user.email);
    await page.getByRole('button', { name: '再設定のメールを送る' }).click();
    await expect(page.getByText('パスワード再設定のメールを送信しました。')).toBeVisible();

    const link = await waitForMailLink(user.email, 'パスワードの再設定');
    await page.goto(link);
    await expect(page).toHaveURL(`${urls.guest}/reset-password`);
    const newPassword = 'new-e2e-Password-456';
    await page.getByLabel('新しいパスワード（10文字以上）').fill(newPassword);
    await page.getByLabel('新しいパスワード（確認）').fill(newPassword);
    await page.getByRole('button', { name: 'パスワードを変更する' }).click();
    await expect(page).toHaveURL(`${urls.guest}/`);

    await page.context().clearCookies();
    await login(page, urls.guest, { email: user.email, password: newPassword });
    await expect(page).toHaveURL(`${urls.guest}/mypage`);
  });
});

test.describe('貸出主センター', () => {
  test('貸出主はログインでき、それ以外のロールは入れない', async ({ page }) => {
    await page.goto(`${urls.host}/`);
    await expect(page).toHaveURL(`${urls.host}/login`);

    const host = await createTestUser('host');
    await login(page, urls.host, host);
    await expect(page).toHaveURL(`${urls.host}/`);
    await expect(page.getByText(`${host.email} でログイン中`)).toBeVisible();

    await page.context().clearCookies();
    const guest = await createTestUser('guest');
    await login(page, urls.host, guest);
    await expect(page.getByText('このサイトではご利用いただけないアカウントです。')).toBeVisible();
  });
});

test.describe('運営管理', () => {
  async function enroll(
    page: Page,
    admin: TestUser,
  ): Promise<{ secret: string; lastCode: string }> {
    await login(page, urls.admin, admin);
    await expect(page).toHaveURL(`${urls.admin}/mfa/enroll`);
    await page.getByRole('button', { name: '登録を開始する' }).click();
    const secret = (await page.locator('code').textContent())?.trim() ?? '';
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    const code = await freshTotp(secret);
    await page.getByLabel('認証アプリに表示された6桁のコード').fill(code);
    await page.getByRole('button', { name: '確認する' }).click();
    await expect(page).toHaveURL(`${urls.admin}/`);
    return { secret, lastCode: code };
  }

  test('2段階認証を登録するまでどの画面も開けない', async ({ page }) => {
    const admin = await createTestUser('admin');
    await login(page, urls.admin, admin);
    await expect(page).toHaveURL(`${urls.admin}/mfa/enroll`);
    for (const path of ['/', '/reset-password', '/mfa/verify']) {
      await page.goto(`${urls.admin}${path}`);
      await expect(page).toHaveURL(`${urls.admin}/mfa/enroll`);
    }
  });

  test('2段階認証を登録し、次回からはコードの入力を求める', async ({ page }) => {
    const admin = await createTestUser('admin');
    const { secret, lastCode } = await enroll(page, admin);
    await expect(page.getByText('2段階認証済み')).toBeVisible();

    await page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page).toHaveURL(`${urls.admin}/login`);

    await login(page, urls.admin, admin);
    await expect(page).toHaveURL(`${urls.admin}/mfa/verify`);
    await page.goto(`${urls.admin}/`);
    await expect(page).toHaveURL(`${urls.admin}/mfa/verify`);

    await page.getByLabel('認証アプリに表示された6桁のコード').fill('000000');
    await page.getByRole('button', { name: '確認する' }).click();
    await expect(page.getByText('コードが正しくないか、有効期限が切れています')).toBeVisible();

    await page
      .getByLabel('認証アプリに表示された6桁のコード')
      .fill(await freshTotp(secret, lastCode));
    await page.getByRole('button', { name: '確認する' }).click();
    await expect(page).toHaveURL(`${urls.admin}/`);

    expect(await auditActions(admin.id)).toEqual([
      'admin.login',
      'admin.mfa_enroll',
      'admin.logout',
      'admin.login',
      'admin.mfa_failed',
      'admin.mfa_verify',
    ]);
  });

  test('運営のセッションは利用者サイト・貸出主センターと共有されない', async ({ page }) => {
    const admin = await createTestUser('admin');
    await enroll(page, admin);
    await page.goto(`${urls.guest}/mypage`);
    await expect(page).toHaveURL(/\/login/);
    await page.goto(`${urls.host}/`);
    await expect(page).toHaveURL(`${urls.host}/login`);
  });

  test('運営以外はログインできず、操作ログに記録される', async ({ page }) => {
    const host = await createTestUser('host');
    await login(page, urls.admin, host);
    await expect(page.getByText('このサイトではご利用いただけないアカウントです。')).toBeVisible();
    expect(await auditActions(host.id)).toEqual(['admin.login_denied']);
  });
});
