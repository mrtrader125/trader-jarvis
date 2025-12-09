// src/lib/time.ts
// Rich time helper: returns ISO, human and many convenience fields used across the project.
// Default timezone: Asia/Kolkata. Pass user's timezone string (IANA) where available.

export function getNowInfo(timezone = "Asia/Kolkata") {
  // Create a Date representation for the target timezone using toLocaleString
  const localStr = new Date().toLocaleString("en-US", { timeZone: timezone });
  const localDate = new Date(localStr);

  const iso = localDate.toISOString();
  const hour = localDate.getHours();
  let phase = "day";
  if (hour >= 5 && hour < 12) phase = "morning";
  else if (hour >= 12 && hour < 17) phase = "afternoon";
  else if (hour >= 17 && hour < 21) phase = "evening";
  else phase = "night";

  // human friendly formats
  const human = localDate.toLocaleString("en-US", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  const timeString = localDate.toLocaleTimeString("en-US", { timeZone: timezone, timeStyle: "short" });
  const dateString = localDate.toLocaleDateString("en-US", { timeZone: timezone, dateStyle: "medium" });
  const localeString = localDate.toLocaleString("en-US", { timeZone: timezone });

  // UTC string and timezone offset (minutes)
  const utcString = localDate.toUTCString();
  // tzOffsetMinutes: offset of the server runtime from UTC in minutes (note: this is server-side)
  const tzOffsetMinutes = -new Date().getTimezoneOffset();

  return {
    iso,
    hour,
    phase,
    human,
    timeString,
    dateString,
    localeString,
    utcString,
    tzOffsetMinutes,
    timezone,
  } as const;
}
export type NowInfo = ReturnType<typeof getNowInfo>;
