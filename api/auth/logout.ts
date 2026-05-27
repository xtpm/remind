import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clearSession, method } from "../_auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ["POST"])) return;

  clearSession(res);
  res.status(200).json({ ok: true });
}
