import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendDiscordEmbed } from "../_discord.js";
import { deleteReminder, listDueDiscordReminders } from "../_db.js";

function isAuthorized(req: VercelRequest) {
  if (!process.env.CRON_SECRET) return true;
  return req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const due = await listDueDiscordReminders();
  const results = await Promise.allSettled(
    due.map(async ({ reminder, discordWebhook, discordUserId }) => {
      await sendDiscordEmbed(discordWebhook, {
        title: reminder.title,
        description: reminder.note || "reminder is due.",
        mentionUserId: discordUserId,
        footer: { text: `due ${reminder.dueAt}` },
      });
      await deleteReminder(reminder.userId, reminder.id);
      return reminder.id;
    }),
  );

  res.status(200).json({
    checked: due.length,
    sent: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  });
}
