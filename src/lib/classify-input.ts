export type InputIntent = 'timesheet' | 'question';

// Patterns that strongly indicate timesheet data entry
const TIMESHEET_PATTERNS = [
  // Times: 0800, 08:00, 6am, 6pm, 18:00
  /\b\d{4}\b/,                          // 0800
  /\b\d{1,2}:\d{2}\b/,                  // 08:00
  /\b\d{1,2}\s*(am|pm)\b/i,             // 6am, 6pm
  // Call/wrap keywords with time-like context
  /\b(call|wrap|called|wrapped)\s+(at\s+)?\d/i,
  // Rate: £568, £1,200
  /£\d+/,
  // Multi-day patterns: "3 day shoot", "2 days"
  /\b\d+\s*day(s)?\s*(shoot|as|at)\b/i,
];

// Patterns that indicate a question
const QUESTION_PATTERNS = [
  /\?$/,                                 // ends with ?
  /^(what|how|when|where|why|who|can|do|does|is|are|should|would|could)\b/i,
  /\b(explain|tell me|what's|whats|what is|how much|how many|how does|how do)\b/i,
];

export function classifyInput(input: string): InputIntent {
  const trimmed = input.trim();

  // Count signals for each category
  const timesheetScore = TIMESHEET_PATTERNS.filter(p => p.test(trimmed)).length;
  const questionScore = QUESTION_PATTERNS.filter(p => p.test(trimmed)).length;

  // Strong timesheet signal: has time data AND no question markers
  if (timesheetScore >= 2 && questionScore === 0) return 'timesheet';

  // Any question signal wins if no strong timesheet signal
  if (questionScore > 0) return 'question';

  // Weak timesheet signal (only 1 pattern, no question markers)
  if (timesheetScore >= 1) return 'timesheet';

  // Default: question (less disruptive if wrong)
  return 'question';
}
