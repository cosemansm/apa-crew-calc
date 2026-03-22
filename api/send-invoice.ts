// Vercel Edge Function — sends an invoice PDF via Resend
// POST /api/send-invoice
// Body: { to: string[], subject: string, message: string, pdfBase64: string, fileName: string, fromName: string }

export const config = {
  runtime: 'edge',
};

const RESEND_API_KEY = process.env.RESEND_API_KEY;

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'Email service not configured — add RESEND_API_KEY to environment variables' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: {
    to: string | string[];
    subject: string;
    message: string;
    pdfBase64: string;
    fileName?: string;
    fromName?: string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { to, subject, message, pdfBase64, fileName, fromName } = body;

  if (!to || !subject || !pdfBase64) {
    return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, pdfBase64' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const toArray = Array.isArray(to) ? to : [to];
  const senderName = fromName || 'Crew Dock';
  const attachmentName = fileName || 'invoice.pdf';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${senderName} via Crew Dock <noreply@crewdock.app>`,
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
      return new Response(JSON.stringify({ error: `Resend API error: ${errorText}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json() as { id?: string };
    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
