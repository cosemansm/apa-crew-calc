// api/share/[token].ts
// Public GET — returns permitted share data for a token.
// Uses service role key to bypass RLS. Never exposes owner identity or rates.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server not configured', debug_reason: 'missing_env', debug_has_url: !!SUPABASE_URL, debug_has_key: !!SUPABASE_SERVICE_ROLE_KEY });
  }

  const { token } = req.query;
  console.log('[share] raw query:', JSON.stringify(req.query));
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Missing token' });
  }

  const headers: Record<string, string> = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };

  try {
    // 1. Look up the share record
    const shareRes = await fetch(
      `${SUPABASE_URL}/rest/v1/shared_jobs?token=eq.${token}&select=*`,
      { headers }
    );
    const shareRows = await shareRes.json();
    if (!Array.isArray(shareRows) || shareRows.length === 0) {
      return res.status(404).json({ error: 'not_found', debug_status: shareRes.status, debug_body: shareRows });
    }
    const share = shareRows[0];
    if (!share.is_active) {
      return res.status(404).json({ error: 'not_found', debug_reason: 'inactive', debug_is_active: share.is_active });
    }

    // 2. Fetch project name only (not client_name or owner info)
    const projectRes = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?id=eq.${share.project_id}&select=name`,
      { headers }
    );
    const projects = await projectRes.json();
    if (!Array.isArray(projects) || projects.length === 0) {
      return res.status(404).json({ error: 'not_found' });
    }

    // 2b. Fetch owner's display name from auth admin
    let ownerName = 'Someone';
    try {
      const ownerRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${share.owner_id}`,
        { headers }
      );
      const ownerData = await ownerRes.json();
      const fullName = ownerData?.user_metadata?.full_name ?? ownerData?.raw_user_meta_data?.full_name;
      if (fullName) {
        ownerName = fullName.split(' ')[0]; // First name only
      } else if (ownerData?.email) {
        ownerName = ownerData.email.split('@')[0];
      }
    } catch {
      // Non-critical — fall back to 'Someone'
    }

    // 3. Fetch all project days ordered by date
    const daysRes = await fetch(
      `${SUPABASE_URL}/rest/v1/project_days?project_id=eq.${share.project_id}&order=work_date.asc&select=*`,
      { headers }
    );
    const days = await daysRes.json();

    // 4. Shape the response — strip role_name, agreed_rate, grand_total, lineItems, subtotal
    const sharedDays = (Array.isArray(days) ? days : []).map((d: any) => ({
      workDate: d.work_date,
      dayType: d.day_type,
      dayOfWeek: d.day_of_week,
      callTime: d.call_time,
      wrapTime: d.wrap_time,
      firstBreakGiven: d.first_break_given ?? false,
      firstBreakTime: d.first_break_time ?? null,
      firstBreakDuration: d.first_break_duration ?? 60,
      secondBreakGiven: d.second_break_given ?? false,
      secondBreakTime: d.second_break_time ?? null,
      secondBreakDuration: d.second_break_duration ?? 30,
      continuousFirstBreakGiven: d.continuous_first_break_given ?? false,
      continuousAdditionalBreakGiven: d.continuous_additional_break_given ?? false,
      travelHours: d.travel_hours ?? 0,
      previousWrap: d.previous_wrap ?? null,
      isBankHoliday: d.is_bank_holiday ?? false,
      // Penalty descriptions only — no amounts (those are rate-specific)
      penalties: ((d.result_json?.penalties ?? []) as any[]).map((p: any) => ({
        description: p.description as string,
      })),
      // Only include expenses/equipment fields if the sharer opted in
      ...(share.include_expenses ? { mileage: d.mileage ?? 0 } : {}),
      ...(share.include_equipment
        ? { equipmentValue: d.equipment_value ?? 0, equipmentDiscount: d.equipment_discount ?? 0 }
        : {}),
    }));

    return res.status(200).json({
      projectName: projects[0].name,
      ownerName,
      includeExpenses: share.include_expenses,
      includeEquipment: share.include_equipment,
      days: sharedDays,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
