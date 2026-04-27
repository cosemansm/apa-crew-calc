// Vercel Serverless Function — handles all outbound emails via Resend
// Routes: /api/email/send-invoice  /api/email/review  /api/email/support
import type { VercelRequest, VercelResponse } from '@vercel/node';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPPORT_EMAIL = 'support@crewdock.app';

// ── Shared Resend helper ──────────────────────────────────────────────────────

async function sendEmail(payload: object): Promise<{ id: string }> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

// ── Invoice email ─────────────────────────────────────────────────────────────

function buildInvoiceHtml(message: string, fromName?: string): string {
  const paragraphs = message
    .split('\n')
    .map(line => line.trim())
    .reduce<string[][]>((groups, line) => {
      if (line === '') { groups.push([]); }
      else { if (groups.length === 0) groups.push([]); groups[groups.length - 1].push(line); }
      return groups;
    }, [[]])
    .filter(g => g.length > 0)
    .map(g => `<p style="margin:0 0 12px 0">${g.join('<br>')}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr>
          <td style="background:#1F1F21;border-radius:12px 12px 0 0;padding:24px 36px">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td>
                ${fromName
                  ? `<span style="color:#ffffff;font-weight:700;font-size:20px">${fromName}</span>`
                  : `<span style="display:inline-block;background:#FFD528;border-radius:8px;width:36px;height:36px;text-align:center;vertical-align:middle;line-height:0"><img src="https://crewdock.app/logo.png" alt="Crew Dock" width="22" height="22" style="display:inline-block;vertical-align:middle;margin-top:7px"></span><span style="color:#ffffff;font-weight:700;font-size:18px;vertical-align:middle;margin-left:10px">Crew Dock</span>`
                }
              </td>
              <td align="right"><span style="color:#9A9A9A;font-size:12px">Invoice</span></td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:36px;color:#1F1F21;font-size:15px;line-height:1.6">${paragraphs}</td>
        </tr>
        <tr>
          <td style="background:#F5F3EE;padding:16px 36px">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="font-size:20px;padding-right:10px">📎</td>
              <td style="font-size:13px;color:#6B6B6B">Your invoice is attached as a PDF to this email.</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="background:#f5f5f5;border-radius:0 0 12px 12px;padding:20px 36px;text-align:center">
            <p style="margin:0;font-size:11px;color:#ABABAB">Sent via <a href="https://crewdock.app" style="color:#ABABAB">Crew Dock</a> · APA Crew Rate Calculator</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function handleSendInvoice(req: VercelRequest, res: VercelResponse) {
  const { to, subject, message, pdfBase64, fileName, fromName } = req.body;
  if (!to || !subject || !pdfBase64) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, pdfBase64' });
  }
  const data = await sendEmail({
    from: fromName ? `${fromName} via Crew Dock <invoices@crewdock.app>` : 'Crew Dock <invoices@crewdock.app>',
    to: Array.isArray(to) ? to : [to],
    subject,
    text: message,
    html: buildInvoiceHtml(message, fromName),
    attachments: [{ filename: fileName || 'invoice.pdf', content: pdfBase64 }],
  });
  return res.status(200).json({ success: true, id: data.id });
}

// ── Review prompt email ───────────────────────────────────────────────────────

async function handleReview(req: VercelRequest, res: VercelResponse) {
  const { to, trialDaysLeft } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing email address' });

  const days = typeof trialDaysLeft === 'number' ? trialDaysLeft : 4;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr>
          <td style="background:#1F1F21;border-radius:12px 12px 0 0;padding:24px 36px">
            <span style="display:inline-block;background:#FFD528;border-radius:8px;width:36px;height:36px;text-align:center;vertical-align:middle;line-height:0">
              <img src="https://crewdock.app/logo.png" alt="Crew Dock" width="22" height="22" style="display:inline-block;vertical-align:middle;margin-top:7px">
            </span>
            <span style="color:#ffffff;font-weight:700;font-size:18px;vertical-align:middle;margin-left:10px">Crew Dock</span>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:36px;color:#1F1F21;font-size:15px;line-height:1.6">
            <p style="margin:0 0 16px 0;font-size:18px;font-weight:700">Enjoying Crew Dock so far?</p>
            <p style="margin:0 0 12px 0">Your free trial ends in <strong>${days} day${days !== 1 ? 's' : ''}</strong>.</p>
            <p style="margin:0 0 24px 0">If you're finding it useful, we'd love a quick review — and as a thank you, we'll add <strong>14 more days of Pro access</strong> for free, no card needed.</p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 24px 0">
              <tr>
                <td style="background:#FFD528;border-radius:8px;padding:12px 24px">
                  <a href="https://uk.trustpilot.com/evaluate/crewdock.app" style="color:#1F1F21;font-weight:700;font-size:14px;text-decoration:none">Leave a Review on Trustpilot → Get 14 Days Free</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;color:#888">After submitting your Trustpilot review, log back in to Crew Dock and click "I've left my review" to unlock your extension.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f5f5f5;border-radius:0 0 12px 12px;padding:20px 36px;text-align:center">
            <p style="margin:0;font-size:11px;color:#ABABAB">Sent by <a href="https://crewdock.app" style="color:#ABABAB">Crew Dock</a> · APA Crew Rate Calculator</p>
            <p style="margin:4px 0 0 0;font-size:11px;color:#ABABAB">Don't want emails like this? <a href="https://crewdock.app/settings" style="color:#ABABAB">Manage email preferences</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const data = await sendEmail({
    from: 'Crew Dock <hello@crewdock.app>',
    to: [to],
    subject: `Your Crew Dock trial ends in ${days} day${days !== 1 ? 's' : ''} — get 14 more free`,
    html,
    headers: {
      'List-Unsubscribe': '<https://crewdock.app/settings>',
    },
  });
  return res.status(200).json({ success: true, id: data.id });
}

// ── Support email ─────────────────────────────────────────────────────────────

function buildSupportHtml(name: string, email: string, subject: string, message: string): string {
  const escapedMessage = message
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0)
    .map((line: string) => `<p style="margin:0 0 8px 0">${line}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr>
          <td style="background:#1F1F21;border-radius:12px 12px 0 0;padding:24px 36px">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td>
                <span style="display:inline-block;background:#FFD528;border-radius:8px;width:32px;height:32px;line-height:32px;text-align:center;font-size:16px;vertical-align:middle">&#9875;</span>
                <span style="color:#ffffff;font-weight:700;font-size:18px;vertical-align:middle;margin-left:10px">Crew Dock</span>
              </td>
              <td align="right"><span style="color:#9A9A9A;font-size:12px">Support Message</span></td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:36px;color:#1F1F21;font-size:15px;line-height:1.6">
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
              <tr><td style="padding:8px 0;border-bottom:1px solid #eee"><strong style="color:#666;font-size:13px">From:</strong><span style="margin-left:8px">${name}</span></td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #eee"><strong style="color:#666;font-size:13px">Email:</strong><a href="mailto:${email}" style="margin-left:8px;color:#1F1F21">${email}</a></td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #eee"><strong style="color:#666;font-size:13px">Subject:</strong><span style="margin-left:8px">${subject}</span></td></tr>
            </table>
            <div style="padding:16px;background:#f9f9f7;border-radius:8px;border-left:3px solid #FFD528">${escapedMessage}</div>
          </td>
        </tr>
        <tr>
          <td style="background:#f5f5f5;border-radius:0 0 12px 12px;padding:20px 36px;text-align:center">
            <p style="margin:0;font-size:11px;color:#ABABAB">Sent via <a href="https://crewdock.app" style="color:#ABABAB">Crew Dock</a> Support Form</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function handleSupport(req: VercelRequest, res: VercelResponse) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
  }

  const { name, email, subject, message } = body ?? {};
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const data = await sendEmail({
    from: 'Crew Dock <support@crewdock.app>',
    to: [SUPPORT_EMAIL],
    reply_to: email,
    subject: `[Support] ${subject}`,
    html: buildSupportHtml(name, email, subject, message),
    text: `From: ${name} (${email})\nSubject: ${subject}\n\n${message}`,
  });
  return res.status(200).json({ success: true, id: data.id });
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email service not configured' });

  // Support CORS preflight (needed by send-support callers)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  try {
    switch (action) {
      case 'send-invoice': return await handleSendInvoice(req, res);
      case 'review':       return await handleReview(req, res);
      case 'support':      return await handleSupport(req, res);
      default:             return res.status(404).json({ error: 'not_found' });
    }
  } catch (err) {
    console.error(`Email handler error [${action}]:`, err);
    return res.status(500).json({ error: String(err) });
  }
}
