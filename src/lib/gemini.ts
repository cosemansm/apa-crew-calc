import { APA_CREW_ROLES } from '@/data/apa-rates';
import type { DayType, DayOfWeek } from '@/data/calculation-engine';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export interface ParsedEntry {
  role: string;
  agreedRate: number;
  dayType: DayType;
  dayOfWeek: DayOfWeek;
  callTime: string;
  wrapTime: string;
  workDate?: string;
  notes: string;
  // Which fields were NOT explicitly stated in the input (need user confirmation)
  missingFields: Array<'role' | 'rate' | 'date' | 'callTime' | 'wrapTime'>;
}

const ROLE_LIST = APA_CREW_ROLES.map(r => `${r.role} (${r.department}, max £${r.maxRate ?? 'N/A'})`).join('\n');

const SYSTEM_PROMPT = `You are a UK commercials crew rate parser. Extract structured timesheet data from natural language shoot day descriptions.

Return ONLY a valid JSON array — no markdown, no commentary.

Each object must have EXACTLY these fields:
- "role": string — Match from the available roles list below using fuzzy matching. "DoP"="Director Of Photography", "spark"/"sparks"="Lighting Technician", "chippie"="Carpenter", "best boy"="Lighting Technician", "focus puller"/"1st AC"="Focus Puller (1st AC)", "clapper"="Clapper Loader", "boom op"="Boom Operator", "AD"/"1st AD"="1st Assistant Director", "2nd AD"="2nd Assistant Director", "3rd AD"="3rd Assistant Director", "runner"="Floor Runner / AD Trainee". If role is completely unknown, set to empty string "".
- "agreedRate": number — Daily rate in GBP. Use explicit rate if given. If not given, use the maxRate from the role. If role is unknown, use 0.
- "dayType": one of "basic_working"|"continuous_working"|"prep"|"recce"|"build_strike"|"pre_light"|"rest"|"travel". Default "basic_working". "Continuous"/"no breaks"="continuous_working". OT mentioned on a basic day stays "basic_working".
- "dayOfWeek": one of "monday"|"tuesday"|"wednesday"|"thursday"|"friday"|"saturday"|"sunday"|"bank_holiday". Infer from date if given. Default "monday" if unknown.
- "callTime": string "HH:MM" 24h. "6am"="06:00", "6pm"="18:00". If not given, set to "".
- "wrapTime": string "HH:MM" 24h. If not given, set to "". Handle overnight wraps.
- "workDate": string "YYYY-MM-DD" if a specific date is mentioned, else omit entirely.
- "notes": string — extra context (missed breaks, OT hours mentioned, special conditions). Empty string if none.
- "missingFields": array of strings — list ONLY the fields that were NOT explicitly stated by the user. Possible values: "role", "rate", "date", "callTime", "wrapTime". If role was guessed/inferred (not explicitly named), include "role". If rate was defaulted from role max rate (not explicitly stated), include "rate". If no specific date or day of week was given, include "date". If call time not given, include "callTime". If wrap time not given, include "wrapTime".

AVAILABLE ROLES:
${ROLE_LIST}

RULES:
1. "3 day shoot" or similar → output 3 separate objects
2. Explicit rate applies to all days unless per-day rates are specified
3. Times like "0800", "08:00", "8am" all normalise to "HH:MM"
4. Saturday/Sunday → weekend dayOfWeek
5. "Night shoot" → call typically 18:00+, wrap early morning
6. OT/overtime mentioned in notes field — do not change dayType
7. Today's date: ${new Date().toISOString().split('T')[0]}

Example — input "call 0800 wrap 1700":
[{"role":"","agreedRate":0,"dayType":"basic_working","dayOfWeek":"monday","callTime":"08:00","wrapTime":"17:00","workDate":undefined,"notes":"","missingFields":["role","rate","date"]}]

Example — input "Gaffer Monday call 0800 wrap 2100 £568":
[{"role":"Gaffer","agreedRate":568,"dayType":"basic_working","dayOfWeek":"monday","callTime":"08:00","wrapTime":"21:00","notes":"","missingFields":[]}]

Return ONLY the JSON array.`;

export async function parseTimesheetWithGemini(userInput: string): Promise<ParsedEntry[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured. Add VITE_GEMINI_API_KEY to your .env file.');
  }

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: SYSTEM_PROMPT },
            { text: `Parse this timesheet input:\n\n${userInput}` },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        topP: 0.95,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const msg = errorData?.error?.message || `Gemini API error: ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response from Gemini. Please try again.');

  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  let entries: ParsedEntry[];
  try {
    entries = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse AI response. Raw output:\n${text.slice(0, 300)}`);
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('AI returned no entries. Try being more specific about your shoot days.');
  }

  return entries.map(entry => ({
    role: entry.role ?? '',
    agreedRate: Number(entry.agreedRate) || 0,
    dayType: entry.dayType || 'basic_working',
    dayOfWeek: entry.dayOfWeek || 'monday',
    callTime: entry.callTime ?? '',
    wrapTime: entry.wrapTime ?? '',
    workDate: entry.workDate,
    notes: entry.notes || '',
    missingFields: Array.isArray(entry.missingFields) ? entry.missingFields : [],
  }));
}
