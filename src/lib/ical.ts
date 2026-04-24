export interface ICalDay {
  id: string
  work_date: string // YYYY-MM-DD
  project_name: string
  role_name: string
  grand_total: number
  project_status: string
}

interface ICalEvent {
  uid: string
  dtstart: string // YYYYMMDD
  dtend: string   // YYYYMMDD (exclusive, day after last day)
  summary: string
  description: string
}

/**
 * Groups consecutive days from the same project+role into spans,
 * then generates an RFC 5545 iCalendar string.
 */
export function generateICalFeed(days: ICalDay[]): string {
  const events = groupIntoEvents(days)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Crew Dock//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Crew Dock',
  ]

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
    )
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function groupIntoEvents(days: ICalDay[]): ICalEvent[] {
  if (days.length === 0) return []

  const sorted = [...days].sort((a, b) => {
    const projCmp = a.project_name.localeCompare(b.project_name)
    if (projCmp !== 0) return projCmp
    return a.work_date.localeCompare(b.work_date)
  })

  const events: ICalEvent[] = []
  let spanStart = sorted[0]
  let spanEnd = sorted[0]
  let spanDays = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const day = sorted[i]
    const prevDate = new Date(spanEnd.work_date + 'T00:00:00')
    const currDate = new Date(day.work_date + 'T00:00:00')
    const diffMs = currDate.getTime() - prevDate.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)

    const sameProject =
      day.project_name === spanStart.project_name &&
      day.role_name === spanStart.role_name

    if (sameProject && diffDays === 1) {
      spanEnd = day
      spanDays.push(day)
    } else {
      events.push(buildEvent(spanStart, spanEnd, spanDays))
      spanStart = day
      spanEnd = day
      spanDays = [day]
    }
  }
  events.push(buildEvent(spanStart, spanEnd, spanDays))

  return events
}

function buildEvent(start: ICalDay, end: ICalDay, days: ICalDay[]): ICalEvent {
  const total = days.reduce((sum, d) => sum + d.grand_total, 0)
  const endDate = new Date(end.work_date + 'T00:00:00')
  endDate.setDate(endDate.getDate() + 1) // DTEND is exclusive for all-day events

  return {
    uid: `${start.id}@crewdock.app`,
    dtstart: start.work_date.replace(/-/g, ''),
    dtend: formatDate(endDate),
    summary: `${start.project_name} \u2014 ${start.role_name}`,
    description: `Total: ${total} | Status: ${start.project_status}`,
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function formatTimestamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}
