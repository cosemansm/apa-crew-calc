# AI Assistant: T&C Q&A + Timesheet Parsing

**Date:** 2026-04-24
**Status:** Approved

## Summary

Transform the existing AI Input page from a single-purpose timesheet parser into a dual-mode AI assistant. Users type into a single text input; the system auto-classifies whether they're entering timesheet data or asking a question about the APA Terms & Conditions, then routes accordingly. T&C answers are powered by RAG over the full APA Recommended Terms document (2025 edition).

## Architecture

### Classification

A lightweight step determines user intent before routing:

- **Timesheet entry** — contains times (0800, 6am), rates (£568), roles (Gaffer, DoP), day references (Monday, 3 day shoot)
- **T&C question** — contains question words (what, how, when, can, do, is), question marks, or topic keywords without rate/time data (cancellation, holiday pay, force majeure, mileage)
- **Ambiguous** — defaults to Q&A mode (less disruptive; the answer can suggest "did you mean to enter a timesheet?")

Implementation: a Gemini call with a short classification prompt that returns `"timesheet"` or `"question"`. Cheap and accurate. Fallback to keyword heuristics if the API call fails.

### T&C Knowledge Pipeline

#### Chunking

Split the APA T&C PDF (`docs/reference/APA_Recommended_Terms_for_Crews_on_Commercials_2025.pdf`) into ~25-30 chunks by section number. Each chunk contains:

```ts
interface TCChunk {
  sectionId: string;    // e.g. "4.1"
  title: string;        // e.g. "Overtime Monday - Friday Grade I"
  text: string;         // Full section text
  embedding: number[];  // 768-dim vector from text-embedding-004
}
```

Sections to chunk (based on table of contents):
- 1 — Your Services
- 2.1 — The Basic Working Day (with sub-sections 2.1.1–2.1.5 as separate chunks)
- 2.2 — Continuous Working Day (with sub-sections 2.2.1–2.2.5 as separate chunks)
- 2.3 — Non-Shooting Day
- 2.4 — Working on Saturdays, Sundays, Bank Holiday and Statutory Holiday
- 3.1 — Travel Time
- 3.2 — Travel Expenses
- 3.3 — Travel by Air
- 4.1–4.3 — Overtime Grades I, II, III (separate chunks)
- 4.4 — Overtime After Midnight
- 4.5 — Overtime Charge Rounding
- 4.6 — Overtime on Saturdays
- 4.7 — Overtime on Sundays, Bank Holiday and Statutory Holidays
- 5 — Time Off The Clock
- 6.1 — Breakfast
- 6.2 — First Break
- 6.3 — Second Break
- 6.4 — Additional Break on Continuous Working Day
- 7 — Cancellation Fees
- 8 — Insurance
- 9 — Assignment of Services
- 10 — Holiday Pay
- 11 — Force Majeure
- Appendix 1 — Recommended Crew Rates (including PM/PA/Runner provisions a-c)
- Appendix 2 — Force Majeure Definition

#### Pre-computation

A build-time script (`scripts/embed-tc-chunks.ts`):
1. Reads the manually-prepared chunk text file (`src/data/apa-tc-sections.ts` — hand-curated from the PDF)
2. Calls Gemini `text-embedding-004` for each chunk
3. Writes `src/data/apa-tc-chunks.json` (~110KB) containing all chunks with embeddings

This JSON file is committed to the repo and bundled with the app. Re-run the script only when the T&C document changes.

#### Query Flow

1. Embed the user's question via Gemini `text-embedding-004`
2. Cosine similarity against all chunks in browser (microseconds for ~30 vectors)
3. Take top 3-5 matching chunks
4. Send to Gemini with the question + conversation history for a conversational answer
5. Parse the response which includes cited section numbers

### Data Flow

```
User input
    |
    v
Classify (question vs timesheet)
    |
    +-- Question --> Embed query --> Cosine match chunks --> Gemini + context --> Chat answer
    |
    +-- Timesheet --> Existing parseTimesheetWithGemini() --> Review/edit cards
```

## UI Design

### Input Stage (modified)

The existing input page is updated:
- Same text input and send button
- Example section expanded to include T&C question examples alongside timesheet examples:
  - "What overtime grade is a Gaffer?"
  - "How do cancellation fees work for a 4-day shoot?"
  - "What happens if my first break is missed?"
  - "How much mileage can I claim outside the M25?"
  - "What's the minimum rest between wrap and next call?"

### Q&A Mode (new)

When classified as a question:
- **Chat thread layout** — user messages left-aligned, AI answers right-aligned
- **Thinking indicator** — a small animated indicator appears on the right side (AI's side) while waiting for the response
- **Answer format** — conversational text with cited APA section numbers at the bottom of each answer, e.g. *"Source: Section 4.2 — Overtime Grade II"*
- **Follow-ups** — user can type follow-up questions; full conversation history is sent with each call for context
- **New conversation** — a button to reset the thread and return to the input stage

### Timesheet Mode (unchanged)

When classified as timesheet data:
- Routes to the existing review/edit card flow exactly as today
- No changes to the review stage

## Technical Details

### New Files

| File | Purpose |
|---|---|
| `src/data/apa-tc-sections.ts` | Hand-curated T&C text chunks with section IDs and titles |
| `src/data/apa-tc-chunks.json` | Pre-computed chunks + embeddings (~110KB) |
| `scripts/embed-tc-chunks.ts` | Build script to generate embeddings |
| `src/lib/tc-search.ts` | Cosine similarity search + query embedding logic |
| `src/lib/tc-chat.ts` | Gemini chat call with T&C context |
| `src/lib/classify-input.ts` | Intent classification (question vs timesheet) |

### Modified Files

| File | Change |
|---|---|
| `src/lib/gemini.ts` | Add embedding + chat functions (alongside existing parser) |
| `src/pages/AIInputPage.tsx` | Add classification routing, chat thread UI, thinking animation |

### Gemini API Usage

- **Classification:** 1 cheap call per user submission (~100 tokens)
- **Query embedding:** 1 embedding call per question
- **Answer generation:** 1 generation call per question (with ~2-4KB of chunk context)
- **Timesheet parsing:** unchanged (1 call as today)

### System Prompt for T&C Answers

The T&C answer prompt instructs Gemini to:
- Answer based only on the provided APA T&C context
- Cite specific section numbers in every answer
- Use clear, crew-friendly language (not legalese)
- If the context doesn't contain the answer, say so honestly rather than guessing
- If the question relates to a specific role, reference that role's rates/grade from Appendix 1

### Conversation History

- Session-only (stored in React state, not persisted to Supabase)
- Sent as prior messages in each Gemini call for follow-up context
- Cleared on "New conversation" or page navigation

## Scope Boundaries

- APA UK T&Cs only (single document, 2025 edition)
- No streaming responses — full response then render
- Chat history not persisted across sessions
- Sodyum BE deal memo can be added later by generating a second chunk file and routing based on active engine
- Pro feature — stays behind the existing `ProLockOverlay`

## Bundle Impact

- `apa-tc-chunks.json`: ~110KB (30 chunks x 768-dim embeddings + text)
- For context: a typical hero image is 200-500KB
- No new dependencies required — cosine similarity is trivial to implement inline
