// src/lib/time.ts
// Time helper: returns ISO, human and phase (morning/afternoon/evening/night)
// Default timezone Asia/Kolkata; you can pass user's timezone when available.

export function getNowInfo(timezone = "Asia/Kolkata") {
  // Build a Date object set to the target timezone using Intl
  const nowStr = new Date().toLocaleString("en-US", { timeZone: timezone });
  const now = new Date(nowStr);

  const iso = now.toISOString();
  const hour = now.getHours();
  let phase = "day";
  if (hour >= 5 && hour < 12) phase = "morning";
  else if (hour >= 12 && hour < 17) phase = "afternoon";
  else if (hour >= 17 && hour < 21) phase = "evening";
  else phase = "night";

  // human friendly
  const human = now.toLocaleString("en-US", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  return { iso, hour, phase, human, timezone };
}
export type NowInfo = ReturnType<typeof getNowInfo>;
