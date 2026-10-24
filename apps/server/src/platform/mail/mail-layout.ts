import type { MailMessage } from './mailer.ts';

/** What every email of Toppo says, in the same shape: a heading, a few words, one thing to do. */
export interface MailContent {
  subject: string;
  heading: string;
  /** Plain text, escaped in the HTML part: names and titles come from users. */
  paragraphs: readonly string[];
  action: { label: string; url: URL };
  /** Why the person receives it, in small print. */
  footer: string;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Text placed in HTML as text, never as markup. */
export function escapeHtml(text: string): string {
  return text.replaceAll(/[&<>"']/gu, (character) => HTML_ESCAPES[character] ?? character);
}

/**
 * The plain text and HTML parts of an email. The HTML is a single column with inline styles,
 * which mail clients keep; the plain text says the same, the link written out.
 */
export function composeMail(content: MailContent): Pick<MailMessage, 'subject' | 'text' | 'html'> {
  const { subject, heading, paragraphs, action, footer } = content;
  const url = action.url.href;
  const text = [heading, ...paragraphs, `${action.label}: ${url}`, `-- \n${footer}`].join('\n\n');
  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px 12px;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111418">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e8ec;border-radius:12px;padding:32px 28px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(heading)}</h1>
${paragraphs.map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(paragraph)}</p>`).join('\n')}
<p style="margin:24px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:10px 18px;border-radius:8px">${escapeHtml(action.label)}</a></p>
</div>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#5b6270;text-align:center">${escapeHtml(footer)}</p>
</body>
</html>`;
  return { subject, text, html };
}
