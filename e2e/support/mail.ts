import { env } from './env';

interface MailpitMessage {
  ID: string;
  Subject: string;
}

/** Mailpit（ローカルの Supabase が送るメールの受け口）から、宛先へのメールの最初のリンクを取り出す */
export async function waitForMailLink(
  to: string,
  subjectIncludes: string,
  timeoutMs = 20_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${env.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    if (res.ok) {
      const body = (await res.json()) as { messages?: MailpitMessage[] };
      const msg = body.messages?.find((m) => m.Subject.includes(subjectIncludes));
      if (msg) {
        const detail = (await (
          await fetch(`${env.mailpitUrl}/api/v1/message/${msg.ID}`)
        ).json()) as { HTML: string };
        const href = /href="([^"]+)"/.exec(detail.HTML)?.[1];
        if (!href) throw new Error('no link in mail');
        return href.replaceAll('&amp;', '&');
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`mail to ${to} not found`);
}
