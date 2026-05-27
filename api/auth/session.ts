import type { VercelRequest, VercelResponse } from "@vercel/node";
import { method, publicUser, requireUser } from "../_auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ["GET"])) return;

  const user = await requireUser(req, res);
  if (!user) return;

  res.status(200).json({ user: publicUser(user) });
}
