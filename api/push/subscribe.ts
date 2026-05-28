import type { VercelRequest, VercelResponse } from "@vercel/node";
import { method, readJson, requireUser } from "../_auth.js";
import { savePushSubscription } from "../_db.js";

type Body = {
  subscription?: { endpoint?: string; [key: string]: unknown };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ["POST"])) return;

  const user = await requireUser(req, res);
  if (!user) return;

  const body = await readJson<Body>(req);
  if (!body.subscription?.endpoint) {
    res.status(400).json({ error: "missing subscription" });
    return;
  }

  await savePushSubscription(user.id, body.subscription);
  res.status(200).json({ ok: true });
}
