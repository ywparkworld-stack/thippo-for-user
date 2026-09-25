/**
 * メール送信のインターフェース。実装（Resend など）はアプリ側で注入し、差し替えられるようにする。
 * テンプレートはフェーズ 3 以降で src/mail-templates に集約する。
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** 送信記録（notifications）用のテンプレート名 */
  template: string;
}

export interface MailSender {
  send(message: MailMessage): Promise<{ id: string }>;
}

/** テスト・ローカル開発用。送信内容をメモリに貯める */
export class InMemoryMailSender implements MailSender {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<{ id: string }> {
    this.sent.push(message);
    return { id: `mem_${this.sent.length}` };
  }
}
