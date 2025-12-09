// src/lib/time.ts
// Time helper: returns ISO, human, and detailed fields including timeString & dateString.
// Default timezone Asia/Kolkata; you can pass user's timezone when available.

export function getNowInfo(timezone = "Asia/Kolkata") {
  // Build a Date object set to the target timezone using Intl
  // Use toLocaleString with the timezone to get correct local values
  const nowStr = new Date().toLocaleString("en-US", { timeZone: timezone });
  const now = new Date(nowStr);

  const iso = now.toISOString();
  const hour = now.getHours();
  let phase = "day";
  if (hour >= 5 && hour < 12) phase = "morning";
  else if (hour >= 12 && hour < 17) phase = "afternoon";
  else if (hour >= 17 && hour < 21) phase = "evening";
  else phase = "night";

  // human friendly (full date + time)
  const human = now.toLocaleString("en-US", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  // explicit pieces used in other code (fixes build error)
  const timeString = now.toLocaleTimeString("en-US", { timeZone: timezone, timeStyle: "short" });
  const dateString = now.toLocaleDateString("en-US", { timeZone: timezone, dateStyle: "medium" });

  return { iso, hour, phase, human, timezone, timeString, dateString };
}
export type NowInfo = ReturnType<typeof getNowInfo>;
