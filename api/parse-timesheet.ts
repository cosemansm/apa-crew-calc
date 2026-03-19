// Vercel Edge Function for AI-powered timesheet parsing
// Uses Claude API to parse natural language into structured timesheet data

export const config = {
  runtime: 'edge',
};

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { input, availableRoles } = await req.json();

  const systemPrompt = `You are a timesheet parser for UK commercial film/TV production crews. Parse the user's natural language description into structured timesheet entries.

Available crew roles: ${availableRoles.join(', ')}

For each day described, extract:
- role: The closest matching role from the available list
- agreedRate: The daily rate in GBP (number only). If not specified, use the role's max rate from APA 2025 terms.
- dayType: One of: basic_working, continuous_working, prep, recce, build_strike, pre_light, rest, travel
- dayOfWeek: One of: monday, tuesday, wednesday, thursday, friday, saturday, sunday, bank_holiday
- callTime: In HH:MM 24hr format
- wrapTime: In HH:MM 24hr format
- notes: Any additional notes about breaks missed, penalties, etc.

Default to "basic_working" if not specified. Infer the day of week from context if possible.

Respond with ONLY valid JSON in this format:
{
  "entries": [
    {
      "role": "string",
      "agreedRate": number,
      "dayType": "string",
      "dayOfWeek": "string",
      "callTime": "HH:MM",
      "wrapTime": "HH:MM",
      "notes": "string"
    }
  ]
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: input }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: `Anthropic API error: ${errorText}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const text = data.content[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
