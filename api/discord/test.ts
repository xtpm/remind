import type { VercelRequest, VercelResponse } from "@vercel/node";
import { method, requireUser } from "../_auth.js";
import { sendDiscordEmbed } from "../_discord.js";
import { getSettings } from "../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ["POST"])) return;

  const user = await requireUser(req, res);
  if (!user) return;

  const settings = await getSettings(user.id);
  if (!settings.discordWebhook) {
    res.status(400).json({ error: "discord webhook offline" });
    return;
  }

  await sendDiscordEmbed(settings.discordWebhook, {
    title: "test reminder",
    description: "Discord webhook delivery is linked.",
    footer: { text: `sent from remind.kuudere.cc for ${user.name}` },
  });

  res.status(200).json({ ok: true });
}
