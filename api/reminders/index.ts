import type { VercelRequest, VercelResponse } from "@vercel/node";
import { method, readJson, requireUser } from "../_auth.js";
import { createReminder, listReminders } from "../_db.js";
import type { Channel, ReminderRecord } from "../_types";

type ReminderBody = {
  title?: string;
  note?: string;
  dueAt?: string;
  channels?: Channel[];
};

function parseDueAt(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ["GET", "POST"])) return;

  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === "GET") {
    res.status(200).json({ reminders: await listReminders(user.id) });
    return;
  }

  const body = await readJson<ReminderBody>(req);
  const title = body.title?.trim();
  const dueAt = parseDueAt(body.dueAt);
  const channels = body.channels?.filter((channel) =>
    ["desktop", "phone", "discord"].includes(channel),
  );

  if (!title || !dueAt || !channels?.length) {
    res.status(400).json({ error: "missing reminder fields" });
    return;
  }

  const reminder: ReminderRecord = {
    id: crypto.randomUUID(),
    userId: user.id,
    title,
    note: body.note?.trim() ?? "",
    dueAt,
    channels,
    done: false,
    createdAt: new Date().toISOString(),
  };

  res.status(201).json({ reminder: await createReminder(reminder) });
}
