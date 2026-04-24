// api/calendar/[token].ts
// Public GET — returns iCal feed for a calendar feed token.
// Uses service role key to bypass RLS.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Missing token' });
  }

  // Validate UUID format to prevent injection
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(token)) {
    return res.status(400).json({ error: 'Invalid token format' });
  }

  const headers: Record<string, string> = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };

  try {
    // 1. Look up the feed token
    const tokenRes = await fetch(
      `${SUPABASE_URL}/rest/v1/calendar_feed_tokens?token=eq.${token}&select=user_id`,
      { headers }
    );
    const tokenRows = await tokenRes.json();
    if (!Array.isArray(tokenRows) || tokenRows.length === 0) {
      return res.status(404).json({ error: 'Feed not found' });
    }
    const userId = tokenRows[0].user_id;

    // 2. Fetch all projects for this user
    const projectsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?user_id=eq.${userId}&select=id,name,status`,
      { headers }
    );
    const projects = await projectsRes.json();
    if (!Array.isArray(projects) || projects.length === 0) {
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="crewdock.ics"');
      return res.status(200).send(emptyCalendar());
    }

    const projectMap = new Map(projects.map((p: any) => [p.id, p]));
    const projectIds = projects.map((p: any) => `"${p.id}"`).join(',');

    // 3. Fetch all project days
    const daysRes = await fetch(
      `${SUPABASE_URL}/rest/v1/project_days?project_id=in.(${projectIds})&order=work_date.asc&select=id,project_id,work_date,role_name,grand_total`,
      { headers }
    );
    const days = await daysRes.json();
    if (!Array.isArray(days)) {
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      return res.status(200).send(emptyCalendar());
    }

    // 4. Map to ICalDay format
    const icalDays = days.map((d: any) => {
      const project = projectMap.get(d.project_id);
      return {
        id: d.id,
        work_date: d.work_date,
        project_name: project?.name ?? 'Unknown Project',
        role_name: d.role_name ?? '',
        grand_total: d.grand_total ?? 0,
        project_status: project?.status ?? 'ongoing',
      };
    });

    // 5. Generate iCal
    const ics = generateICalFeed(icalDays);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="crewdock.ics"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).send(ics);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}

// ── Inline iCal generator (mirrors src/lib/ical.ts logic) ──────────────────

interface ICalDay {
  id: string;
  work_date: string;
  project_name: string;
  role_name: string;
  grand_total: number;
  project_status: string;
}

function generateICalFeed(days: ICalDay[]): string {
  const events = groupIntoEvents(days);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Crew Dock//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Crew Dock',
  ];

  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTART;VALUE=DATE:${event.dtstart}`,
      `DTEND;VALUE=DATE:${event.dtend}`,
      `SUMMARY:${escapeICalText(event.summary)}`,
      `DESCRIPTION:${escapeICalText(event.description)}`,
      `DTSTAMP:${formatTimestamp(new Date())}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function groupIntoEvents(days: ICalDay[]) {
  if (days.length === 0) return [];

  const sorted = [...days].sort((a, b) => {
    const projCmp = a.project_name.localeCompare(b.project_name);
    if (projCmp !== 0) return projCmp;
    return a.work_date.localeCompare(b.work_date);
  });

  const events: { uid: string; dtstart: string; dtend: string; summary: string; description: string }[] = [];
  let spanStart = sorted[0];
  let spanEnd = sorted[0];
  let spanDays = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const day = sorted[i];
    const prevDate = new Date(spanEnd.work_date + 'T00:00:00');
    const currDate = new Date(day.work_date + 'T00:00:00');
    const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
    const sameProject = day.project_name === spanStart.project_name && day.role_name === spanStart.role_name;

    if (sameProject && diffDays === 1) {
      spanEnd = day;
      spanDays.push(day);
    } else {
      events.push(buildEvent(spanStart, spanEnd, spanDays));
      spanStart = day;
      spanEnd = day;
      spanDays = [day];
    }
  }
  events.push(buildEvent(spanStart, spanEnd, spanDays));
  return events;
}

function buildEvent(start: ICalDay, end: ICalDay, days: ICalDay[]) {
  const total = days.reduce((sum, d) => sum + d.grand_total, 0);
  const endDate = new Date(end.work_date + 'T00:00:00');
  endDate.setDate(endDate.getDate() + 1);
  return {
    uid: `${start.id}@crewdock.app`,
    dtstart: start.work_date.replace(/-/g, ''),
    dtend: fmtDate(endDate),
    summary: `${start.project_name} \u2014 ${start.role_name}`,
    description: `Total: ${total} | Status: ${start.project_status}`,
  };
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function formatTimestamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICalText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function emptyCalendar(): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Crew Dock//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Crew Dock',
    'END:VCALENDAR',
  ].join('\r\n');
}
