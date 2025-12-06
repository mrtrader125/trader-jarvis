// Simple reminder pinger.
// Right now it sends to a fixed list of chat IDs.
// Later we can store subscribers in a DB and ping them from a cron job.

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN missing");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

export async function GET() {
  try {
    // TODO: replace this with your real chat id(s).
    // Get it by sending /id to your bot and reading the reply.
    const CHAT_IDS = [
      /* YOUR_CHAT_ID_HERE as a number, e.g. 123456789 */
    ];

    if (CHAT_IDS.length === 0) {
      console.warn("No chat IDs configured in reminder-ping");
      return new Response("No chat ids configured", { status: 200 });
    }

    const message =
      "Yo bro 🕒\n\nQuick reminder from Jarvis:\n- Do your *daily check-in*.\n- Stick to your trading rules.\n- No revenge trades, no FOMO.\n\nYou got this. 💪";

    await Promise.all(
      CHAT_IDS.map((id) => sendTelegramMessage(id, message))
    );

    return new Response("reminders sent", { status: 200 });
  } catch (err) {
    console.error("Error in reminder-ping:", err);
    return new Response("error", { status: 200 });
  }
}
