import type { VercelRequest, VercelResponse } from "@vercel/node";
import { method, readJson, requireUser } from "./_auth.js";
import { getSettings, updateSettings } from "./_db.js";

type SettingsBody = {
  discordWebhook?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ["GET", "PATCH"])) return;

  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const settings = await getSettings(user.id);
    res.status(200).json({
      settings,
      webhookStatus: "offline",
    });
    return;
  }

  const body = await readJson<SettingsBody>(req);
  const settings = await updateSettings(user.id, {
    discordWebhook: body.discordWebhook?.trim() ?? "",
  });

  res.status(200).json({
    settings,
    webhookStatus: "offline",
  });
}
