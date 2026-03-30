import { env } from "../config/env";
import { query } from "../db/postgres";

export class AlertsService {
  async notify(userId: string, eventType: string, message: string, chatId?: string | null) {
    await query(
      "INSERT INTO alerts (user_id, channel, event_type, message, delivered) VALUES ($1, $2, $3, $4, $5)",
      [userId, "telegram", eventType, message, false]
    );

    const destination = chatId ?? env.TELEGRAM_CHAT_ID;
    if (!env.TELEGRAM_BOT_TOKEN || !destination) {
      return;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: destination,
          text: message
        })
      }
    );

    if (response.ok) {
      await query(
        "UPDATE alerts SET delivered = TRUE WHERE user_id = $1 AND event_type = $2 AND message = $3",
        [userId, eventType, message]
      );
    }
  }
}
