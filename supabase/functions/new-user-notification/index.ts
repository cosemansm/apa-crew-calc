// supabase/functions/new-user-notification/index.ts
// Triggered by a DB trigger on auth.users INSERT.
// Sends a new-user notification email to support@crewdock.app via Resend.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPPORT_EMAIL = 'support@crewdock.app'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
  })
}

function buildHtml(user: {
  id: string
  email: string
  name: string
  provider: string
  created_at: string
}): string {
  const providerLabel = user.provider === 'google' ? 'Google' : 'Email & Password'
  const nameRow = user.name
    ? `<tr><td style="padding:10px 0;border-bottom:1px solid #F0EDE8;color:#888;font-size:13px;width:110px">Name</td><td style="padding:10px 0;border-bottom:1px solid #F0EDE8;font-size:14px">${user.name}</td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F3EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3EE;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

        <!-- Header -->
        <tr>
          <td style="background:#1F1F21;border-radius:12px 12px 0 0;padding:22px 32px">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td>
                <span style="display:inline-block;background:#FFD528;border-radius:8px;width:32px;height:32px;text-align:center;vertical-align:middle;line-height:0">
                  <img src="https://crewdock.app/logo.png" alt="" width="20" height="20" style="display:inline-block;vertical-align:middle;margin-top:6px">
                </span>
                <span style="color:#ffffff;font-weight:700;font-size:17px;vertical-align:middle;margin-left:10px">Crew Dock</span>
              </td>
              <td align="right">
                <span style="background:#2E2E30;color:#FFD528;font-size:11px;font-weight:600;letter-spacing:0.5px;padding:4px 10px;border-radius:20px;text-transform:uppercase">New Sign-up</span>
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;color:#1F1F21">
            <p style="margin:0 0 6px 0;font-size:22px;font-weight:700">New user joined</p>
            <p style="margin:0 0 28px 0;font-size:14px;color:#888">${formatDate(user.created_at)}</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #F0EDE8">
              ${nameRow}
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;color:#888;font-size:13px;width:110px">Email</td>
                <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;font-size:14px">
                  <a href="mailto:${user.email}" style="color:#1F1F21;text-decoration:none;font-weight:500">${user.email}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;color:#888;font-size:13px">Sign-up via</td>
                <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;font-size:14px">${providerLabel}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#888;font-size:13px">User ID</td>
                <td style="padding:10px 0;font-size:12px;font-family:monospace;color:#555">${user.id}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F5F3EE;border-radius:0 0 12px 12px;padding:18px 32px;text-align:center">
            <p style="margin:0;font-size:11px;color:#ABABAB">
              <a href="https://supabase.com/dashboard/project/dmqkmkzsveyvpwugxwym/auth/users" style="color:#ABABAB">View in Supabase</a>
              &nbsp;·&nbsp;
              <a href="https://crewdock.app" style="color:#ABABAB">Crew Dock</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const body = await req.json()

    // The trigger sends the NEW row from auth.users
    const user = {
      id: body.id ?? body.record?.id ?? '',
      email: body.email ?? body.record?.email ?? '',
      name: (body.raw_user_meta_data?.full_name ?? body.record?.raw_user_meta_data?.full_name ?? '') as string,
      provider: (body.app_metadata?.provider ?? body.record?.app_metadata?.provider ?? 'email') as string,
      created_at: body.created_at ?? body.record?.created_at ?? new Date().toISOString(),
    }

    if (!user.email) {
      return new Response(JSON.stringify({ error: 'No email in payload' }), { status: 400 })
    }

    const nameDisplay = user.name ? ` (${user.name})` : ''

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Crew Dock <hello@crewdock.app>',
        to: [SUPPORT_EMAIL],
        subject: `New sign-up: ${user.email}${nameDisplay}`,
        html: buildHtml(user),
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Resend error: ${text}`)
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('new-user-notification error:', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
})
