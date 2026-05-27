import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { createSession, method, publicUser, readJson } from "../_auth.js";
import { assertPersistentStorage, findUserByEmail } from "../_db.js";

type LoginBody = {
  email?: string;
  password?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ["POST"])) return;

  try {
    assertPersistentStorage();
  } catch {
    res.status(503).json({ error: "database not configured" });
    return;
  }

  const body = await readJson<LoginBody>(req);
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    res.status(400).json({ error: "missing credentials" });
    return;
  }

  const user = await findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "invalid login" });
    return;
  }

  await createSession(res, user);
  res.status(200).json({ user: publicUser(user) });
}
