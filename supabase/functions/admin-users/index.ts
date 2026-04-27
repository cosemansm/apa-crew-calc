// supabase/functions/admin-users/index.ts
// Admin-only — returns the full user list with subscription status for the management table.

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

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: callerUser }, error: authError } = await db.auth.getUser(token)
    if (authError || !callerUser || callerUser.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const [usersResult, subscriptionsResult, profilesResult] = await Promise.allSettled([
      db.auth.admin.listUsers({ perPage: 1000, page: 1 }),
      db.from('subscriptions').select('user_id, status, trial_ends_at, current_period_end, team_id'),
      db.from('profiles').select('id, signup_country, multi_engine_enabled, authorized_engines'),
    ])

    const users = usersResult.status === 'fulfilled' ? (usersResult.value.data?.users ?? []) : []
    const subscriptions = subscriptionsResult.status === 'fulfilled' ? (subscriptionsResult.value.data ?? []) : []
    const profiles = profilesResult.status === 'fulfilled' ? (profilesResult.value.data ?? []) : []

    const now = new Date()
    const subByUserId = new Map(subscriptions.map(s => [s.user_id, s]))
    const profileByUserId = new Map(profiles.map((p: { id: string; signup_country: string | null; multi_engine_enabled: boolean; authorized_engines: string[] }) => [p.id, p]))
    const userList = users.map(u => {
      const profile = profileByUserId.get(u.id)
      const sub = subByUserId.get(u.id)
      let status = sub?.status ?? 'trialing'
      // If trial has expired and user never converted, show as free
      if (status === 'trialing' && sub?.trial_ends_at && new Date(sub.trial_ends_at) < now) {
        status = 'free'
      }
      return {
        user_id: u.id,
        email: u.email ?? '',
        name: (u.user_metadata?.full_name as string | undefined) ?? '',
        status,
        trial_ends_at: sub?.trial_ends_at ?? null,
        team_id: sub?.team_id ?? null,
        created_at: u.created_at,
        signup_country: profile?.signup_country ?? null,
        multi_engine_enabled: profile?.multi_engine_enabled ?? false,
        authorized_engines: profile?.authorized_engines ?? ['apa-uk'],
      }
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return new Response(JSON.stringify({ userList }), {
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
