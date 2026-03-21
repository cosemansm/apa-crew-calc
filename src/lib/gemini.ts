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
}

const ROLE_LIST = APA_CREW_ROLES.map(r => `${r.role} (${r.department}, max £${r.maxRate ?? 'N/A'})`).join('\n');

const SYSTEM_PROMPT = `You are a UK commercials crew rate parser. Your job is to extract structured timesheet data from natural language descriptions of shoot days.

You MUST return valid JSON — an array of objects. No markdown, no commentary, no explanation. Just the JSON array.

Each object must have these exact fields:
- "role": string — Must match one of the available roles EXACTLY (see list below). Use fuzzy matching: "DoP" = "Director Of Photography", "spark" = "Lighting Technician", "chippie" = "Carpenter", "best boy" = "Lighting Technician", "focus puller" = "Focus Puller (1st AC)", "1st AC" = "Focus Puller (1st AC)", "clapper" = "Clapper Loader", "boom op" = "Boom Operator", "art director" = "Art Director", "AD" or "1st AD" = "1st Assistant Director", "2nd AD" = "2nd Assistant Director", "3rd AD" = "3rd Assistant Director", "runner" = "Floor Runner / AD Trainee", "prod runner" = "Production Runner", "sparks" = "Lighting Technician", "grip" = "Key Grip or has NVQ3" etc.
- "agreedRate": number — The daily rate in GBP. If the user specifies a rate, use it. If not, use the maxRate from the role data.
- "dayType": one of "basic_working", "continuous_working", "prep", "recce", "build_strike", "pre_light", "rest", "travel". Default to "basic_working" unless stated otherwise. "Continuous" or "no breaks" = "continuous_working". "Prep" or "prep day" = "prep". "Recce" = "recce". "Travel day" = "travel". "Rest day" = "rest". "Build" or "strike" = "build_strike". "Pre-light" = "pre_light".
- "dayOfWeek": one of "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "bank_holiday". Infer from date if given, or from context. Default to "monday" if completely ambiguous.
- "callTime": string in "HH:MM" 24h format. "6am" = "06:00", "7:30am" = "07:30", "6pm" = "18:00" etc.
- "wrapTime": string in "HH:MM" 24h format. Same conversion rules. Handle overnight wraps (e.g. call 18:00, wrap 05:00 next day).
- "workDate": string in "YYYY-MM-DD" format if a specific date is mentioned, otherwise omit.
- "notes": string — any extra context like missed breaks, special conditions, etc. Empty string if none.

AVAILABLE ROLES:
${ROLE_LIST}

RULES:
1. If a user says "3 day shoot" or similar, output 3 separate entries
2. If the user mentions a rate, apply it to all days unless they specify different rates per day
3. If no role is specified, ask via notes field: "Role not specified — please clarify"
4. Times like "0800" or "08:00" or "8am" are all valid — normalise to "HH:MM"
5. Saturday/Sunday should be detected as weekend days
6. If user says "night shoot", the call is typically evening (18:00+) and wrap is early morning
7. Today's date is ${new Date().toISOString().split('T')[0]}

Return ONLY the JSON array. Example:
[{"role":"Gaffer","agreedRate":568,"dayType":"basic_working","dayOfWeek":"monday","callTime":"08:00","wrapTime":"21:00","notes":""}]`;

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

  // Extract the text from Gemini response
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('No response from Gemini. Please try again.');
  }

  // Parse the JSON — Gemini sometimes wraps in markdown code blocks
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

  // Validate and clean up entries
  return entries.map(entry => ({
    role: entry.role || 'Unknown',
    agreedRate: Number(entry.agreedRate) || 0,
    dayType: entry.dayType || 'basic_working',
    dayOfWeek: entry.dayOfWeek || 'monday',
    callTime: entry.callTime || '08:00',
    wrapTime: entry.wrapTime || '18:00',
    workDate: entry.workDate,
    notes: entry.notes || '',
  }));
}
