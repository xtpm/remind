import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SignJWT, jwtVerify } from "jose";
import { findUserById } from "./_db.js";
import type { PublicUser, UserRecord } from "./_types";

const cookieName = "kuudere_session";

function secret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET ?? "dev-only-change-before-production",
  );
}

export function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

export async function createSession(res: VercelResponse, user: UserRecord) {
  const token = await new SignJWT({ sub: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());

  res.setHeader(
    "Set-Cookie",
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
  );
}

export function clearSession(res: VercelResponse) {
  res.setHeader(
    "Set-Cookie",
    `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

function getCookie(req: VercelRequest, name: string) {
  const raw = req.headers.cookie ?? "";
  const cookies = raw.split(";").map((part) => part.trim());
  const match = cookies.find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export async function requireUser(req: VercelRequest, res: VercelResponse) {
  const token = getCookie(req, cookieName);
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }

  try {
    const verified = await jwtVerify(token, secret());
    const userId = verified.payload.sub;
    if (!userId) throw new Error("missing subject");
    const user = await findUserById(userId);
    if (!user) throw new Error("missing user");
    return user;
  } catch {
    clearSession(res);
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
}

export async function readJson<T>(req: VercelRequest): Promise<T> {
  if (req.body && typeof req.body === "object") return req.body as T;
  if (typeof req.body === "string") return JSON.parse(req.body) as T;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

export function method(req: VercelRequest, res: VercelResponse, allowed: string[]) {
  if (allowed.includes(req.method ?? "")) return true;
  res.setHeader("Allow", allowed.join(", "));
  res.status(405).json({ error: "method not allowed" });
  return false;
}
