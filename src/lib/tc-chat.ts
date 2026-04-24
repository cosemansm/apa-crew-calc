import type { TCChunk } from './tc-search';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TCAnswer {
  content: string;
  sections: string[]; // e.g. ["4.1", "4.2"]
}

function buildSystemPrompt(chunks: TCChunk[]): string {
  const context = chunks
    .map(c => `[Section ${c.sectionId}: ${c.title}]\n${c.text}`)
    .join('\n\n---\n\n');

  return `You are a knowledgeable assistant for UK commercials crew members. You answer questions about the APA Recommended Terms for Engaging Crew on the Production of Commercials (2025 edition).

RULES:
1. Answer ONLY based on the APA T&C context provided below. Do not make up information.
2. If the context does not contain the answer, say so honestly — suggest which section might be relevant or recommend the user check the full document.
3. Use clear, crew-friendly language. Avoid unnecessary legalese.
4. When referencing specific rates, grades, or rules, be precise and include the numbers.
5. At the END of your answer, on a new line, list the section numbers you referenced in this exact format:
   SOURCES: 4.1, 4.2, 6.2
   If no sections were referenced, write: SOURCES: none

APA T&C CONTEXT:
${context}`;
}

export async function askTCQuestion(
  question: string,
  chunks: TCChunk[],
  history: ChatMessage[],
): Promise<TCAnswer> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured.');
  }

  const systemPrompt = buildSystemPrompt(chunks);

  // Build conversation contents for Gemini
  const contents = [
    {
      role: 'user' as const,
      parts: [{ text: systemPrompt }],
    },
    {
      role: 'model' as const,
      parts: [{ text: 'I understand. I\'ll answer questions about the APA T&Cs based only on the context provided, citing section numbers in every answer.' }],
    },
    // Previous conversation turns
    ...history.map(msg => ({
      role: (msg.role === 'user' ? 'user' : 'model') as 'user' | 'model',
      parts: [{ text: msg.content }],
    })),
    // Current question
    {
      role: 'user' as const,
      parts: [{ text: question }],
    },
  ];

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.3,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error?.message || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response from Gemini. Please try again.');

  // Parse SOURCES line from the end of the response
  const sourcesMatch = text.match(/SOURCES:\s*(.+)$/im);
  const sections = sourcesMatch
    ? sourcesMatch[1].split(',').map((s: string) => s.trim()).filter((s: string) => s && s !== 'none')
    : [];

  // Remove the SOURCES line from the displayed content
  const content = text.replace(/\n?SOURCES:\s*.+$/im, '').trim();

  return { content, sections };
}
