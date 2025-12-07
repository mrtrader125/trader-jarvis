// src/lib/time.ts

// Simple helper to get "now" information in a given timezone
export function getNowInfo(timezone: string) {
  const now = new Date();

  const iso = now.toISOString();
  const localeString = now.toLocaleString("en-IN", { timeZone: timezone });

  return {
    iso,           // "2025-12-07T16:30:21.000Z"
    localeString,  // "07/12/2025, 10:00 pm" (for Asia/Kolkata)
    timezone,
  };
}
