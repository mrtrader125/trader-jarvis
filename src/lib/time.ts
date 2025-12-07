// lib/time.ts
export function getNowInfo(timezone: string) {
  const now = new Date();

  const iso = now.toISOString();
  const localeString = now.toLocaleString("en-IN", { timeZone: timezone });

  return {
    iso,                 // 2025-12-07T16:25:13.000Z
    localeString,        // "07/12/2025, 9:55 pm" for Asia/Kolkata
    timezone,
  };
}
