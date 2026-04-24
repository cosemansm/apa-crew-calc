// scripts/embed-tc-chunks.ts
//
// Usage: VITE_GEMINI_API_KEY=<key> npx tsx scripts/embed-tc-chunks.ts
//
// Reads APA T&C sections, embeds each via Gemini gemini-embedding-001,
// writes src/data/apa-tc-chunks.json.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { APA_TC_SECTIONS } from '../src/data/apa-tc-sections.js';

const API_KEY = process.env.VITE_GEMINI_API_KEY;
if (!API_KEY) {
  console.error('Error: VITE_GEMINI_API_KEY env var is required');
  process.exit(1);
}

const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${API_KEY}`;

interface EmbeddedChunk {
  sectionId: string;
  title: string;
  text: string;
  embedding: number[];
}

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Embedding API error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.embedding.values;
}

async function main() {
  console.log(`Embedding ${APA_TC_SECTIONS.length} sections...`);

  const chunks: EmbeddedChunk[] = [];

  for (const section of APA_TC_SECTIONS) {
    const input = `${section.title}\n\n${section.text}`;
    console.log(`  [${section.sectionId}] ${section.title} (${input.length} chars)`);
    const embedding = await embedText(input);
    chunks.push({
      sectionId: section.sectionId,
      title: section.title,
      text: section.text,
      embedding,
    });
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  const outPath = resolve(import.meta.dirname, '../src/data/apa-tc-chunks.json');
  writeFileSync(outPath, JSON.stringify(chunks, null, 2));
  console.log(`\nWrote ${chunks.length} chunks to ${outPath}`);
  console.log(`File size: ${(JSON.stringify(chunks).length / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
