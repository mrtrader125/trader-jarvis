// src/lib/
// Small helper to provide market open/close times for major exchanges.
// Times are in the exchange's local timezone. Use getMarketStatus() with a user timezone
// to determine whether the market is open now (converted to that timezone).

import { getNowInfo } from "./time";

export type Market = {
  id: string;
  name: string;
  timezone: string; // IANA tz
  openHour: number; // local hour
  openMinute?: number;
  closeHour: number;
  closeMinute?: number;
};

// Basic list — extend as needed
export const MARKETS: Market[] = [
  { id: "NYSE", name: "NYSE/NASDAQ (US)", timezone: "America/New_York", openHour: 9, openMinute: 30, closeHour: 16, closeMinute: 0 },
  { id: "CME", name: "CME (US futures)", timezone: "America/New_York", openHour: 17, openMinute: 0, closeHour: 16, closeMinute: 0 }, // note: simplified
  { id: "NSE", name: "NSE (India)", timezone: "Asia/Kolkata", openHour: 9, openMinute: 15, closeHour: 15, closeMinute: 30 },
  { id: "SGX", name: "SGX (Singapore)", timezone: "Asia/Singapore", openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 0 },
];

function toMinutes(h: number, m = 0) { return h * 60 + (m || 0); }

export function getMarketStatus(marketId: string, asTimezone = "Asia/Kolkata") {
  const market = MARKETS.find((m) => m.id === marketId || m.name === marketId);
  if (!market) return { market: null, open: null, nowLocal: null, marketLocal: null };

  // now in market tz and user's tz
  const marketNowStr = new Date().toLocaleString("en-US", { timeZone: market.timezone });
  const marketNow = new Date(marketNowStr);
  const marketMinutes = toMinutes(marketNow.getHours(), marketNow.getMinutes());
  const openMin = toMinutes(market.openHour, market.openMinute);
  const closeMin = toMinutes(market.closeHour, market.closeMinute);

  const open = marketMinutes >= openMin && marketMinutes <= closeMin;

  const userNowStr = new Date().toLocaleString("en-US", { timeZone: asTimezone });
  const userNow = new Date(userNowStr);

  return {
    market,
    open,
    nowLocal: userNow.toISOString(),
    marketLocal: marketNow.toISOString(),
    marketTimeHuman: marketNow.toLocaleString("en-US", { timeZone: market.timezone, timeStyle: "short", dateStyle: "medium" }),
    userTimeHuman: userNow.toLocaleString("en-US", { timeZone: asTimezone, timeStyle: "short", dateStyle: "medium" }),
  };
}
