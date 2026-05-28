import type { VercelRequest, VercelResponse } from "@vercel/node";
import { method, readJson, requireUser } from "../_auth.js";
import { deleteReminder, updateReminder } from "../_db.js";
import type { Channel, ReminderRecord } from "../_types";

type PatchBody = Partial<Pick<ReminderRecord, "title" | "note" | "dueAt" | "channels" | "done" | "sentAt">>;

function reminderId(req: VercelRequest) {
  const id = req.query.id;
  return Array.isArray(id) ? id[0] : id;
}

function parseDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ["PATCH", "DELETE"])) return;

  const user = await requireUser(req, res);
  if (!user) return;

  const id = reminderId(req);
  if (!id) {
    res.status(400).json({ error: "missing reminder id" });
    return;
  }

  if (req.method === "DELETE") {
    await deleteReminder(user.id, id);
    res.status(200).json({ ok: true });
    return;
  }

  const body = await readJson<PatchBody>(req);
  const patch: PatchBody = {};

  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.note === "string") patch.note = body.note.trim();
  if (typeof body.dueAt === "string") {
    const dueAt = parseDateTime(body.dueAt);
    if (!dueAt) {
      res.status(400).json({ error: "invalid reminder time" });
      return;
    }
    patch.dueAt = dueAt;
  }
  if (typeof body.done === "boolean") patch.done = body.done;
  if (typeof body.sentAt === "string" || body.sentAt === undefined) patch.sentAt = body.sentAt;
  if (Array.isArray(body.channels)) {
    patch.channels = body.channels.filter((channel): channel is Channel =>
      ["desktop", "phone", "discord"].includes(channel),
    );
  }

  const reminder = await updateReminder(user.id, id, patch);
  if (!reminder) {
    res.status(404).json({ error: "not found" });
    return;
  }

  res.status(200).json({ reminder });
}
