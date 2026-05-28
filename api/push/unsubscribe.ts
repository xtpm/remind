import type { VercelRequest, VercelResponse } from "@vercel/node";
import { method, readJson, requireUser } from "../_auth.js";
import { deletePushSubscription } from "../_db.js";

type Body = {
  endpoint?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ["POST"])) return;

  const user = await requireUser(req, res);
  if (!user) return;

  const body = await readJson<Body>(req);
  if (!body.endpoint) {
    res.status(400).json({ error: "missing endpoint" });
    return;
  }

  await deletePushSubscription(user.id, body.endpoint);
  res.status(200).json({ ok: true });
}
