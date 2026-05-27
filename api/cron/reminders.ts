import type { VercelRequest, VercelResponse } from "@vercel/node";
import { listDueDiscordReminders, markReminderSent } from "../_db.js";

function isAuthorized(req: VercelRequest) {
  if (!process.env.CRON_SECRET) return true;
  return req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
}

async function sendDiscordWebhook(webhook: string, title: string, note: string, dueAt: string) {
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "kuudere reminders",
      content: `**${title}**\n${note || "reminder is due."}`,
      embeds: [
        {
          title,
          description: note || "reminder is due.",
          color: 16743094,
          footer: { text: `due ${dueAt}` },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed with ${response.status}`);
  }
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
    due.map(async ({ reminder, discordWebhook }) => {
      await sendDiscordWebhook(
        discordWebhook,
        reminder.title,
        reminder.note,
        reminder.dueAt,
      );
      await markReminderSent(reminder.userId, reminder.id);
      return reminder.id;
    }),
  );

  res.status(200).json({
    checked: due.length,
    sent: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  });
}
