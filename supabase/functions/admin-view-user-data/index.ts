// supabase/functions/admin-view-user-data/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ADMIN_EMAIL = 'milo.cosemans@gmail.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const db = createClient(supabaseUrl, serviceRoleKey)

    // ── Auth: same pattern as admin-users ──
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: callerUser }, error: authError } = await db.auth.getUser(token)
    if (authError || !callerUser || callerUser.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    const targetUserId = body.userId
    if (!targetUserId || typeof targetUserId !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing userId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: authData, error: lookupError } = await db.auth.admin.getUserById(targetUserId)
    if (lookupError || !authData?.user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const targetUser = authData.user

    const [
      settingsResult,
      subscriptionResult,
      profileResult,
      projectsResult,
      customRolesResult,
      equipmentResult,
      favouritesResult,
      tokensResult,
    ] = await Promise.allSettled([
      db.from('user_settings').select('*').eq('user_id', targetUserId).maybeSingle(),
      db.from('subscriptions').select('status, trial_ends_at, current_period_end, trial_extended').eq('user_id', targetUserId).maybeSingle(),
      db.from('profiles').select('signup_country, default_engine, multi_engine_enabled, authorized_engines').eq('id', targetUserId).maybeSingle(),
      db.from('projects').select('id, name, client_name, status, calc_engine, created_at').eq('user_id', targetUserId).order('created_at', { ascending: false }),
      db.from('custom_roles').select('id, role_name, daily_rate, ot_coefficient, custom_bhr, is_buyout').eq('user_id', targetUserId).order('created_at', { ascending: true }),
      db.from('equipment_packages').select('id, name, day_rate').eq('user_id', targetUserId).order('name'),
      db.from('favourite_roles').select('id, role_name, default_rate').eq('user_id', targetUserId),
      db.from('bookkeeping_connections').select('platform').eq('user_id', targetUserId),
    ])

    const settings = settingsResult.status === 'fulfilled' ? settingsResult.value.data : null
    const subscription = subscriptionResult.status === 'fulfilled' ? subscriptionResult.value.data : null
    const profile = profileResult.status === 'fulfilled' ? profileResult.value.data : null
    const projects = projectsResult.status === 'fulfilled' ? (projectsResult.value.data ?? []) : []
    const customRoles = customRolesResult.status === 'fulfilled' ? (customRolesResult.value.data ?? []) : []
    const equipment = equipmentResult.status === 'fulfilled' ? (equipmentResult.value.data ?? []) : []
    const favourites = favouritesResult.status === 'fulfilled' ? (favouritesResult.value.data ?? []) : []
    const connections = tokensResult.status === 'fulfilled' ? (tokensResult.value.data ?? []) : []

    const projectIds = projects.map((p: { id: string }) => p.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allDays: any[] = []
    if (projectIds.length > 0) {
      const { data: daysData } = await db
        .from('project_days')
        .select('*')
        .in('project_id', projectIds)
        .order('day_number', { ascending: true })
      allDays = daysData ?? []
    }

    const enrichedProjects = projects.map((p: { id: string; name: string; client_name: string | null; status: string; calc_engine: string | null; created_at: string }) => ({
      ...p,
      days: allDays.filter(d => d.project_id === p.id),
    }))

    const bookkeepingConnections = {
      freeagent: connections.some((t: { platform: string }) => t.platform === 'freeagent'),
      xero: connections.some((t: { platform: string }) => t.platform === 'xero'),
      quickbooks: connections.some((t: { platform: string }) => t.platform === 'quickbooks'),
    }

    const result = {
      userId: targetUserId,
      email: targetUser.email ?? '',
      displayName: settings?.display_name ?? (targetUser.user_metadata?.full_name as string | undefined) ?? null,
      department: settings?.department ?? null,
      subscription,
      profile,
      projects: enrichedProjects,
      customRoles,
      equipmentPackages: equipment,
      favouriteRoles: favourites,
      userSettings: settings,
      bookkeepingConnections,
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
