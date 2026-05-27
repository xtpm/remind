import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { createSession, method, publicUser, readJson } from "../_auth.js";
import { assertPersistentStorage, createUser, findUserByEmail } from "../_db.js";
import type { UserRecord } from "../_types";

type SignupBody = {
  name?: string;
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

  const body = await readJson<SignupBody>(req);
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!name || !email || password.length < 6) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  if (await findUserByEmail(email)) {
    res.status(409).json({ error: "account already exists" });
    return;
  }

  const user: UserRecord = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString(),
  };

  await createUser(user);
  await createSession(res, user);
  res.status(201).json({ user: publicUser(user) });
}
