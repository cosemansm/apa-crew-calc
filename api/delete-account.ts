// Vercel Serverless Function — deletes a user account and all associated data

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server not configured — add SUPABASE_SERVICE_ROLE_KEY to environment variables' });
  }

  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  try {
    // 1. Delete all user data from related tables (in dependency order)
    //    project_days are cascade-deleted when projects are deleted (or we delete explicitly)
    const tables = [
      { table: 'project_days', joinField: 'project_id', parentTable: 'projects', userField: 'user_id' },
    ];

    // Delete project_days via project_id
    const projectsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?user_id=eq.${userId}&select=id`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    const projects = await projectsRes.json();
    if (Array.isArray(projects) && projects.length > 0) {
      const ids = projects.map((p: any) => p.id).join(',');
      await fetch(`${SUPABASE_URL}/rest/v1/project_days?project_id=in.(${ids})`, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
    }

    // Delete all user-owned rows from each table
    const userTables = ['projects', 'user_settings', 'favourite_roles', 'custom_roles', 'equipment_packages', 'calculation_history', 'subscriptions'];
    for (const table of userTables) {
      await fetch(`${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${userId}`, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
    }

    // 2. Delete the auth user via Supabase Admin API
    const deleteUserRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
      {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!deleteUserRes.ok) {
      const errText = await deleteUserRes.text();
      return res.status(500).json({ error: `Failed to delete auth user: ${errText}` });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
}
