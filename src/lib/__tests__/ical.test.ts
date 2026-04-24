import { describe, it, expect } from 'vitest'
import { generateICalFeed, type ICalDay } from '@/lib/ical'

const sampleDays: ICalDay[] = [
  {
    id: 'day-1',
    work_date: '2026-04-07',
    project_name: 'The Grand Budapest Hotel',
    role_name: '1st AC',
    grand_total: 450,
    project_status: 'ongoing',
  },
  {
    id: 'day-2',
    work_date: '2026-04-08',
    project_name: 'The Grand Budapest Hotel',
    role_name: '1st AC',
    grand_total: 450,
    project_status: 'ongoing',
  },
  {
    id: 'day-3',
    work_date: '2026-04-09',
    project_name: 'The Grand Budapest Hotel',
    role_name: '1st AC',
    grand_total: 450,
    project_status: 'ongoing',
  },
  {
    id: 'day-4',
    work_date: '2026-04-14',
    project_name: 'Moonrise Kingdom',
    role_name: 'DIT',
    grand_total: 380,
    project_status: 'finished',
  },
]

describe('generateICalFeed', () => {
  it('returns valid iCalendar wrapper', () => {
    const ics = generateICalFeed(sampleDays)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).toContain('PRODID:-//Crew Dock//Calendar Feed//EN')
    expect(ics).toContain('X-WR-CALNAME:Crew Dock')
  })

  it('groups consecutive days from same project into one event', () => {
    const ics = generateICalFeed(sampleDays)
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length
    expect(eventCount).toBe(2)
  })

  it('sets correct DTSTART and DTEND for multi-day event', () => {
    const ics = generateICalFeed(sampleDays)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260407')
    expect(ics).toContain('DTEND;VALUE=DATE:20260410')
  })

  it('sets correct DTSTART and DTEND for single-day event', () => {
    const ics = generateICalFeed(sampleDays)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260414')
    expect(ics).toContain('DTEND;VALUE=DATE:20260415')
  })

  it('includes project name and role in SUMMARY', () => {
    const ics = generateICalFeed(sampleDays)
    expect(ics).toContain('SUMMARY:The Grand Budapest Hotel \u2014 1st AC')
    expect(ics).toContain('SUMMARY:Moonrise Kingdom \u2014 DIT')
  })

  it('includes total and status in DESCRIPTION', () => {
    const ics = generateICalFeed(sampleDays)
    expect(ics).toContain('1350')
    expect(ics).toContain('ongoing')
  })

  it('generates stable UIDs from day IDs', () => {
    const ics = generateICalFeed(sampleDays)
    expect(ics).toContain('UID:day-1@crewdock.app')
  })

  it('returns empty calendar for no days', () => {
    const ics = generateICalFeed([])
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).not.toContain('BEGIN:VEVENT')
  })

  it('does not group non-consecutive days from same project', () => {
    const gappedDays: ICalDay[] = [
      { id: 'd1', work_date: '2026-04-07', project_name: 'Film A', role_name: 'Grip', grand_total: 300, project_status: 'ongoing' },
      { id: 'd2', work_date: '2026-04-09', project_name: 'Film A', role_name: 'Grip', grand_total: 300, project_status: 'ongoing' },
    ]
    const ics = generateICalFeed(gappedDays)
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length
    expect(eventCount).toBe(2)
  })
})
