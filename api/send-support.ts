// Vercel Serverless Function — sends support contact form via Resend

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPPORT_EMAIL = 'support@crewdock.app';

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
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="display:inline-block;background:#FFD528;border-radius:8px;width:32px;height:32px;line-height:32px;text-align:center;font-size:16px;vertical-align:middle">&#9875;</span>
                  <span style="color:#ffffff;font-weight:700;font-size:18px;vertical-align:middle;margin-left:10px">Crew Dock</span>
                </td>
                <td align="right">
                  <span style="color:#9A9A9A;font-size:12px">Support Message</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:36px;color:#1F1F21;font-size:15px;line-height:1.6">
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #eee">
                  <strong style="color:#666;font-size:13px">From:</strong>
                  <span style="margin-left:8px">${name}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #eee">
                  <strong style="color:#666;font-size:13px">Email:</strong>
                  <a href="mailto:${email}" style="margin-left:8px;color:#1F1F21">${email}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #eee">
                  <strong style="color:#666;font-size:13px">Subject:</strong>
                  <span style="margin-left:8px">${subject}</span>
                </td>
              </tr>
            </table>
            <div style="padding:16px;background:#f9f9f7;border-radius:8px;border-left:3px solid #FFD528">
              ${escapedMessage}
            </div>
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

export default async function handler(req: any, res: any) {
  // Allow CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  // Parse body — Vercel may pass it as a string in some runtimes
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
  }

  const { name, email, subject, message } = body ?? {};

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Crew Dock <support@crewdock.app>',
        to: [SUPPORT_EMAIL],
        reply_to: email,
        subject: `[Support] ${subject}`,
        html: buildSupportHtml(name, email, subject, message),
        text: `From: ${name} (${email})\nSubject: ${subject}\n\n${message}`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: `Email send failed: ${errorText}` });
    }

    const data = await response.json();
    return res.status(200).json({ success: true, id: data.id });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
}
