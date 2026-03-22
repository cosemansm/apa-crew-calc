// Vercel Serverless Function (Node.js runtime) — sends an invoice PDF via Resend
// Node.js runtime is used instead of Edge so we can handle larger PDF payloads.

const RESEND_API_KEY = process.env.RESEND_API_KEY;

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
        from: 'Crew Dock <noreply@crewdock.app>',
        to: toArray,
        subject,
        text: message,
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
