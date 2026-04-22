// supabase/functions/admin-stats/index.ts
// Admin-only edge function — validates caller is milo.cosemans@gmail.com,
// then uses service role to query all tables and return aggregated stats.

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

    // Verify the caller is the admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Service role client — bypasses RLS
    const db = createClient(supabaseUrl, serviceRoleKey)

    // Verify JWT by passing the token explicitly (recommended edge function pattern)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: callerUser }, error: authError } = await db.auth.getUser(token)
    if (authError || !callerUser || callerUser.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── Fetch all data in parallel ──────────────────────────────────────────
    const [
      usersResult,
      subscriptionsResult,
      projectsResult,
      projectDaysResult,
      userSettingsResult,
      bookkeepingResult,
      customRolesResult,
      equipmentResult,
      featureRequestsResult,
      favouriteRolesResult,
      sharedJobsResult,
    ] = await Promise.allSettled([
      db.auth.admin.listUsers({ perPage: 1000, page: 1 }),
      db.from('subscriptions').select('user_id, status, trial_ends_at, trial_extended, current_period_end, created_at'),
      db.from('projects').select('id, user_id, status, created_at'),
      db.from('project_days').select('id, project_id, grand_total, role_name, day_type, work_date'),
      db.from('user_settings').select('user_id, department, calculator_tool, bookkeeping_software, onboarding_completed'),
      db.from('bookkeeping_connections').select('user_id, platform'),
      db.from('custom_roles').select('user_id'),
      db.from('equipment_packages').select('user_id'),
      db.from('feature_requests').select('category, created_at'),
      db.from('favourite_roles').select('user_id'),
      db.from('shared_jobs').select('id'),
    ])

    const users = usersResult.status === 'fulfilled' ? (usersResult.value.data?.users ?? []) : []
    const subscriptions = subscriptionsResult.status === 'fulfilled' ? (subscriptionsResult.value.data ?? []) : []
    const projects = projectsResult.status === 'fulfilled' ? (projectsResult.value.data ?? []) : []
    const projectDays = projectDaysResult.status === 'fulfilled' ? (projectDaysResult.value.data ?? []) : []
    const userSettings = userSettingsResult.status === 'fulfilled' ? (userSettingsResult.value.data ?? []) : []
    const bookkeepingConns = bookkeepingResult.status === 'fulfilled' ? (bookkeepingResult.value.data ?? []) : []
    const customRoles = customRolesResult.status === 'fulfilled' ? (customRolesResult.value.data ?? []) : []
    const equipmentPkgs = equipmentResult.status === 'fulfilled' ? (equipmentResult.value.data ?? []) : []
    const featureRequests = featureRequestsResult.status === 'fulfilled' ? (featureRequestsResult.value.data ?? []) : []
    const favouriteRoles = favouriteRolesResult.status === 'fulfilled' ? (favouriteRolesResult.value.data ?? []) : []
    const sharedJobs = sharedJobsResult.status === 'fulfilled' ? (sharedJobsResult.value.data ?? []) : []

    const now = new Date()

    // ── Helper: get last 12 month labels ───────────────────────────────────
    function last12MonthLabels(): string[] {
      const labels: string[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
      return labels
    }

    function last30DayLabels(): string[] {
      const labels: string[] = []
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        labels.push(d.toISOString().slice(0, 10)) // "YYYY-MM-DD"
      }
      return labels
    }

    function bucketByDay(dates: string[]): { day: string; count: number }[] {
      const days = last30DayLabels()
      const counts: Record<string, number> = {}
      days.forEach(d => { counts[d] = 0 })
      dates.forEach(d => {
        const key = d.slice(0, 10) // "YYYY-MM-DD"
        if (key in counts) counts[key]++
      })
      return days.map(d => ({ day: d, count: counts[d] }))
    }

    // Returns the ISO date of the Monday of the week containing dateStr
    function getWeekMonday(dateStr: string): string {
      const d = new Date(dateStr.slice(0, 10) + 'T00:00:00Z')
      const dow = d.getUTCDay() // 0=Sun
      const diff = (dow + 6) % 7 // days since Monday
      return new Date(d.getTime() - diff * 86400000).toISOString().slice(0, 10)
    }

    function last52WeekLabels(): string[] {
      const labels: string[] = []
      const todayStr = now.toISOString().slice(0, 10)
      const todayUTC = new Date(todayStr + 'T00:00:00Z')
      const dow = todayUTC.getUTCDay()
      const currentMonday = new Date(todayUTC.getTime() - ((dow + 6) % 7) * 86400000)
      for (let i = 51; i >= 0; i--) {
        labels.push(new Date(currentMonday.getTime() - i * 7 * 86400000).toISOString().slice(0, 10))
      }
      return labels
    }

    function bucketByWeek(dates: string[]): { week: string; count: number }[] {
      const weeks = last52WeekLabels()
      const counts: Record<string, number> = {}
      weeks.forEach(w => { counts[w] = 0 })
      dates.forEach(d => {
        const key = getWeekMonday(d)
        if (key in counts) counts[key]++
      })
      return weeks.map(w => ({ week: w, count: counts[w] }))
    }

    function bucketByMonth(dates: string[]): { month: string; count: number }[] {
      const months = last12MonthLabels()
      const counts: Record<string, number> = {}
      months.forEach(m => { counts[m] = 0 })
      dates.forEach(d => {
        const key = d.slice(0, 7) // "YYYY-MM"
        if (key in counts) counts[key]++
      })
      return months.map(m => ({ month: m, count: counts[m] }))
    }

    function countSince(dates: string[], days: number): number {
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      return dates.filter(d => new Date(d) >= cutoff).length
    }

    // ── Users ───────────────────────────────────────────────────────────────
    const userCreatedDates = users.map(u => u.created_at)
    const activeLastMonth = users.filter(u =>
      u.last_sign_in_at && new Date(u.last_sign_in_at) >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    ).length

    const departmentCounts: Record<string, number> = {}
    userSettings.forEach(s => {
      const dep = s.department || 'Unknown'
      departmentCounts[dep] = (departmentCounts[dep] ?? 0) + 1
    })
    const byDepartment = Object.entries(departmentCounts)
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count)

    // ── Subscriptions ───────────────────────────────────────────────────────
    let trialing = 0, free = 0, active = 0, lifetime = 0, pastDue = 0, canceled = 0, resubscribed = 0, trialExtended = 0

    subscriptions.forEach(s => {
      if (s.status === 'trialing') {
        const trialEnd = new Date(s.trial_ends_at)
        if (trialEnd >= now) {
          trialing++
        } else {
          free++ // trial expired, never converted
        }
      } else if (s.status === 'active') {
        if (s.previously_canceled) {
          resubscribed++
        } else {
          active++
        }
      } else if (s.status === 'lifetime') {
        lifetime++
      } else if (s.status === 'past_due' || s.status === 'unpaid') {
        pastDue++
      } else if (s.status === 'canceled') {
        canceled++
      }
      if (s.trial_extended) trialExtended++
    })

    const paidUsers = active + resubscribed + lifetime
    const everConverted = subscriptions.filter(s => s.status === 'active' || s.status === 'lifetime' || s.status === 'past_due' || s.status === 'canceled').length
    const conversionRate = users.length > 0 ? Math.round((everConverted / users.length) * 100) : 0

    // ── Projects ────────────────────────────────────────────────────────────
    const statusCounts: Record<string, number> = {}
    projects.forEach(p => {
      statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1
    })
    const byStatus = Object.entries(statusCounts)
      .map(([status, count]) => ({ status, count }))

    const projectCreatedDates = projects.map(p => p.created_at)
    const avgJobsPerUser = users.length > 0 ? Math.round((projects.length / users.length) * 10) / 10 : 0

    // ── Project Days ────────────────────────────────────────────────────────
    const totalValue = projectDays.reduce((sum, d) => sum + (d.grand_total ?? 0), 0)
    const daysWithRate = projectDays.filter(d => d.grand_total > 0)
    const avgRate = daysWithRate.length > 0
      ? Math.round(totalValue / daysWithRate.length)
      : 0

    const dayTypeCounts: Record<string, number> = {}
    projectDays.forEach(d => {
      const t = d.day_type || 'unknown'
      dayTypeCounts[t] = (dayTypeCounts[t] ?? 0) + 1
    })
    const byDayType = Object.entries(dayTypeCounts)
      .map(([dayType, count]) => ({ dayType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const roleCounts: Record<string, number> = {}
    projectDays.forEach(d => {
      if (d.role_name) {
        roleCounts[d.role_name] = (roleCounts[d.role_name] ?? 0) + 1
      }
    })
    const topRoles = Object.entries(roleCounts)
      .map(([roleName, count]) => ({ roleName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const dayWorkDates = projectDays.map(d => d.work_date)

    // ── Feature Adoption ────────────────────────────────────────────────────
    const usersWithBookkeeping = new Set(bookkeepingConns.map(b => b.user_id)).size
    const xeroUsers = new Set(bookkeepingConns.filter(b => b.platform === 'xero').map(b => b.user_id)).size
    const qbUsers = new Set(bookkeepingConns.filter(b => b.platform === 'quickbooks').map(b => b.user_id)).size
    const faUsers = new Set(bookkeepingConns.filter(b => b.platform === 'freeagent').map(b => b.user_id)).size
    const usersWithCustomRoles = new Set(customRoles.map(r => r.user_id)).size
    const usersWithEquipment = new Set(equipmentPkgs.map(e => e.user_id)).size
    const usersWithFavourites = new Set(favouriteRoles.map(f => f.user_id)).size

    const featureCategoryCounts: Record<string, number> = {}
    featureRequests.forEach(f => {
      const cat = f.category || 'Other'
      featureCategoryCounts[cat] = (featureCategoryCounts[cat] ?? 0) + 1
    })
    const featureRequestsByCategory = Object.entries(featureCategoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)

    // ── Onboarding Insights ────────────────────────────────────────────
    const calculatorToolCounts: Record<string, number> = {}
    const bookkeepingSoftwareCounts: Record<string, number> = {}
    let totalOnboarded = 0
    let totalSkipped = 0

    userSettings.forEach(s => {
      if (s.onboarding_completed) {
        totalOnboarded++
        if (!s.calculator_tool && !s.bookkeeping_software) {
          totalSkipped++
        }
      }
      if (s.calculator_tool) {
        calculatorToolCounts[s.calculator_tool] = (calculatorToolCounts[s.calculator_tool] ?? 0) + 1
      }
      if (s.bookkeeping_software) {
        bookkeepingSoftwareCounts[s.bookkeeping_software] = (bookkeepingSoftwareCounts[s.bookkeeping_software] ?? 0) + 1
      }
    })

    const onboardingCalcTools = Object.entries(calculatorToolCounts)
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)

    const onboardingBookkeeping = Object.entries(bookkeepingSoftwareCounts)
      .map(([software, count]) => ({ software, count }))
      .sort((a, b) => b.count - a.count)

    const totalAnswered = totalOnboarded - totalSkipped
    const completionRate = totalOnboarded > 0 ? Math.round((totalAnswered / totalOnboarded) * 100) : 0

    // ── Build response ──────────────────────────────────────────────────────
    const stats = {
      users: {
        total: users.length,
        last7Days: countSince(userCreatedDates, 7),
        last30Days: countSince(userCreatedDates, 30),
        byMonth: bucketByMonth(userCreatedDates),
        activeLastMonth,
        byDepartment,
      },
      subscriptions: {
        trialing,
        free,
        active,
        lifetime,
        pastDue,
        canceled,
        resubscribed,
        trialExtended,
        conversionRate,
        paidUsers,
      },
      jobs: {
        total: projects.length,
        last30Days: countSince(projectCreatedDates, 30),
        byStatus,
        byMonth: bucketByMonth(projectCreatedDates),
        byDay: bucketByDay(projectCreatedDates),
        byWeek: bucketByWeek(projectCreatedDates),
        avgPerUser: avgJobsPerUser,
      },
      days: {
        total: projectDays.length,
        last30Days: countSince(dayWorkDates, 30),
        byMonth: bucketByMonth(dayWorkDates),
        totalValue: Math.round(totalValue),
        avgRate,
        byDayType,
        topRoles,
      },
      features: {
        bookkeeping: {
          total: usersWithBookkeeping,
          xero: xeroUsers,
          quickbooks: qbUsers,
          freeagent: faUsers,
        },
        customRoles: usersWithCustomRoles,
        equipmentPackages: usersWithEquipment,
        favouriteRoles: usersWithFavourites,
        sharedJobsTotal: sharedJobs.length,
        featureRequests: featureRequests.length,
        featureRequestsByCategory,
      },
      onboarding: {
        calculatorTools: onboardingCalcTools,
        bookkeepingSoftware: onboardingBookkeeping,
        totalOnboarded,
        totalSkipped,
        completionRate,
      },
    }

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin-stats] error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
