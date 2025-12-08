// src/lib/time.ts

export function getNowInfo(timezone: string) {
  const now = new Date();

  const dateFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const timeFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const dateParts = dateFormatter.formatToParts(now);
  const timeParts = timeFormatter.formatToParts(now);

  const dateString = dateParts
    .map((p) => p.value)
    .join(""); // something like 08/12/2025 depending on locale

  const timeString = timeParts
    .map((p) => p.value)
    .join(""); // "13:05:23" etc.

  const localeString = `${dateString} ${timeString}`;

  return {
    iso: now.toISOString(),
    timezone,
    localeString,
    dateString,
    timeString,
  };
}
