// Vercel Serverless Function — sends the day-10 review prompt email via Resend

const RESEND_API_KEY = process.env.RESEND_API_KEY;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email service not configured' });

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
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Crew Dock <hello@crewdock.app>',
        to: [to],
        subject: `Your Crew Dock trial ends in ${days} day${days !== 1 ? 's' : ''} — get 14 more free`,
        html,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: `Resend error: ${err}` });
    }
    const data = await response.json();
    return res.status(200).json({ success: true, id: data.id });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
}
