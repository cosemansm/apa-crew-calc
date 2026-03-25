const CACHE_KEY = 'uk_bank_holidays_v1';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface BankHolidayCache {
  dates: string[];
  fetchedAt: number;
}

/**
 * Fetches England & Wales bank holidays from the UK Government API.
 * Caches in localStorage for 7 days to avoid repeated fetches.
 * Returns a Set of YYYY-MM-DD date strings.
 */
export async function getUKBankHolidays(): Promise<Set<string>> {
  // Return from cache if still fresh
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { dates, fetchedAt }: BankHolidayCache = JSON.parse(cached);
      if (Date.now() - fetchedAt < CACHE_TTL) {
        return new Set(dates);
      }
    }
  } catch {}

  // Fetch from UK Government bank holidays API
  try {
    const res = await fetch('https://www.gov.uk/bank-holidays.json');
    const data = await res.json();
    const dates: string[] = data['england-and-wales'].events.map(
      (e: { date: string }) => e.date
    );
    localStorage.setItem(CACHE_KEY, JSON.stringify({ dates, fetchedAt: Date.now() }));
    return new Set(dates);
  } catch {
    // Silently fail — calculations will proceed without bank holiday detection
    return new Set();
  }
}
