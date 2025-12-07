// src/lib/readinessScore.js

export function computeReadinessScore(checkIn, trades) {
  if (!checkIn) {
    return {
      score: 0,
      level: "No data",
      message: "Log a daily check-in and some trades to get a readiness score.",
    };
  }

  let score = 50; // base

  const sleepHours = Number(checkIn.sleepHours || checkIn.sleep || 0);
  const sleepQuality = checkIn.sleepQuality || "Okay";
  const mood = checkIn.mood || "Neutral";
  const stress = checkIn.stress || "Normal";
  const focus = checkIn.focus || "Normal";
  const urge = checkIn.urge || checkIn.urgeToTrade || "Normal";

  // Sleep (0–20 pts)
  if (sleepHours >= 7 && sleepHours <= 9) score += 15;
  else if (sleepHours >= 6) score += 10;
  else if (sleepHours >= 5) score += 5;
  else score -= 5;

  if (sleepQuality === "Great") score += 5;
  else if (sleepQuality === "Bad") score -= 5;

  // Mood & Stress (–20 to +20)
  if (mood === "Calm" || mood === "Good" || mood === "Happy") score += 8;
  if (stress === "High") score -= 10;
  else if (stress === "Low") score += 5;

  // Focus & Urge to trade
  if (focus === "Sharp" || focus === "High") score += 8;
  if (urge === "Very high" || urge === "High") score -= 10;
  else if (urge === "Very low") score += 3;

  // Recent trading behaviour (last 5 trades)
  const lastTrades = (trades || []).slice(-5);
  if (lastTrades.length > 0) {
    const totalR = lastTrades.reduce(
      (s, t) => s + (Number(t.resultR || t.result || 0)),
      0
    );
    const avgR = totalR / lastTrades.length;

    if (avgR < -1) score -= 10; // recent heavy losses
    else if (avgR > 1) score += 5;

    const emotional = lastTrades.filter((t) => {
      const eb = (t.emotionBefore || "").toLowerCase();
      const notes = (t.notes || "").toLowerCase();
      return (
        eb.includes("angry") ||
        eb.includes("frustrated") ||
        notes.includes("revenge") ||
        notes.includes("tilt")
      );
    }).length;

    if (emotional >= 2) score -= 10;
  }

  // clamp 0–100
  score = Math.max(0, Math.min(100, Math.round(score)));

  let level;
  let message;

  if (score >= 75) {
    level = "GREEN";
    message =
      "Mentally and behaviourally you’re in a solid spot. Trade your plan, normal size, only A+ setups.";
  } else if (score >= 50) {
    level = "YELLOW";
    message =
      "Decent but not perfect. Trade less, be picky, reduce size a bit, and avoid emotional decisions.";
  } else if (score > 0) {
    level = "RED";
    message =
      "Danger zone. Either don’t trade, or trade very tiny size. Focus on rest, journaling, and mental reset.";
  } else {
    level = "No data";
    message = "Log a daily check-in and some trades to get a readiness score.";
  }

  return { score, level, message };
}
