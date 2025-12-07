// src/lib/time.ts

export type NowInfo = {
  iso: string;
  timezone: string;
  timeString: string;   // e.g. "1:57:12 am"
  dateString: string;   // e.g. "8/12/2025"
  localeString: string; // e.g. "8/12/2025, 1:57:12 am"
};

export function getNowInfo(timezone: string): NowInfo {
  const now = new Date();

  const timeString = now.toLocaleTimeString("en-IN", {
    timeZone: timezone,
    hour12: true,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

  const dateString = now.toLocaleDateString("en-IN", {
    timeZone: timezone,
  });

  const localeString = `${dateString}, ${timeString}`;

  return {
    iso: now.toISOString(),
    timezone,
    timeString,
    dateString,
    localeString,
  };
}
