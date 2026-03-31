// Vercel Serverless Function (Node.js runtime) — sends an invoice PDF via Resend

const RESEND_API_KEY = process.env.RESEND_API_KEY;

function buildHtml(message: string): string {
  // Convert plain-text message to HTML paragraphs
  const paragraphs = message
    .split('\n')
    .map(line => line.trim())
    .reduce<string[][]>((groups, line) => {
      if (line === '') {
        groups.push([]);
      } else {
        if (groups.length === 0) groups.push([]);
        groups[groups.length - 1].push(line);
      }
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

        <!-- Header -->
        <tr>
          <td style="background:#1F1F21;border-radius:12px 12px 0 0;padding:24px 36px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="display:inline-block;background:#FFD528;border-radius:8px;width:36px;height:36px;text-align:center;vertical-align:middle;line-height:0"><img src="https://crewdock.app/logo.png" alt="Crew Dock" width="22" height="22" style="display:inline-block;vertical-align:middle;margin-top:7px"></span>
                  <span style="color:#ffffff;font-weight:700;font-size:18px;vertical-align:middle;margin-left:10px">Crew Dock</span>
                </td>
                <td align="right">
                  <span style="color:#9A9A9A;font-size:12px">Invoice</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:36px;color:#1F1F21;font-size:15px;line-height:1.6">
            ${paragraphs}
          </td>
        </tr>

        <!-- Attachment notice -->
        <tr>
          <td style="background:#F5F3EE;padding:16px 36px">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:20px;padding-right:10px">📎</td>
                <td style="font-size:13px;color:#6B6B6B">Your invoice is attached as a PDF to this email.</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured — add RESEND_API_KEY to environment variables' });
  }

  const { to, subject, message, pdfBase64, fileName } = req.body;

  if (!to || !subject || !pdfBase64) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, pdfBase64' });
  }

  const toArray = Array.isArray(to) ? to : [to];
  const attachmentName = fileName || 'invoice.pdf';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Crew Dock <invoices@crewdock.app>',
        to: toArray,
        subject,
        text: message,        // plain-text fallback
        html: buildHtml(message), // HTML version (better deliverability)
        attachments: [
          {
            filename: attachmentName,
            content: pdfBase64,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: `Resend API error: ${errorText}` });
    }

    const data = await response.json();
    return res.status(200).json({ success: true, id: data.id });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
}
