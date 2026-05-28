import type { VercelRequest, VercelResponse } from "@vercel/node";
import { method } from "../_auth.js";
import { vapidPublicKey } from "../_push.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ["GET"])) return;

  const publicKey = vapidPublicKey();
  if (!publicKey) {
    res.status(503).json({ error: "push not configured" });
    return;
  }

  res.status(200).json({ publicKey });
}
