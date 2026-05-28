import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import postgres from "postgres";
import type { PushSubscriptionRecord, ReminderRecord, SettingsRecord, UserRecord } from "./_types";

type LocalDb = {
  users: UserRecord[];
  reminders: ReminderRecord[];
  settings: SettingsRecord[];
  pushSubscriptions: PushSubscriptionRecord[];
};

const localDbPath = join(process.env.VERCEL ? "/tmp" : process.cwd(), ".data", "db.json");
let sqlClient: ReturnType<typeof postgres> | null = null;
let postgresReady = false;

const demoHash =
  "$2b$10$tS4fhBiuTw.xBW.obh93juFAYUb7bBmj61npoMUUuMTZRs0DTfRCm";

function usePostgres() {
  return Boolean(databaseUrl());
}

function databaseUrl() {
  return (
    process.env.DATABASE_URL ??
    process.env.STORAGE_URL_DATABASE_URL ??
    process.env.STORAGE_URL_PRISMA_DATABASE_URL ??
    process.env.STORAGE_URL_POSTGRES_URL
  );
}

export function assertPersistentStorage() {
  if (process.env.VERCEL && !usePostgres()) {
    throw new Error("DATABASE_URL is required for production account storage");
  }
}

function getSql() {
  if (!sqlClient) {
    sqlClient = postgres(databaseUrl()!, {
      ssl: process.env.POSTGRES_SSL === "false" ? false : "require",
    });
  }

  return sqlClient;
}

async function ensurePostgres() {
  if (postgresReady) return;
  const sql = getSql();

  await sql`
    create table if not exists users (
      id text primary key,
      name text not null,
      email text not null unique,
      password_hash text not null,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists reminders (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      title text not null,
      note text not null default '',
      due_at timestamptz not null,
      channels jsonb not null default '[]'::jsonb,
      done boolean not null default false,
      sent_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists user_settings (
      user_id text primary key references users(id) on delete cascade,
      discord_webhook text not null default '',
      discord_user_id text not null default ''
    )
  `;

  await sql`
    create table if not exists push_subscriptions (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      endpoint text not null unique,
      subscription jsonb not null,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    alter table user_settings
    add column if not exists discord_user_id text not null default ''
  `;

  await sql`
    insert into users (id, name, email, password_hash)
    values ('demo-user', 'demo', 'demo@kuudere.cc', ${demoHash})
    on conflict (email) do nothing
  `;

  postgresReady = true;
}

async function readLocalDb(): Promise<LocalDb> {
  try {
    const raw = await readFile(localDbPath, "utf8");
    return JSON.parse(raw) as LocalDb;
  } catch {
    const db: LocalDb = {
      users: [
        {
          id: "demo-user",
          name: "demo",
          email: "demo@kuudere.cc",
          passwordHash: demoHash,
          createdAt: new Date().toISOString(),
        },
      ],
      reminders: [],
      settings: [{ userId: "demo-user", discordWebhook: "", discordUserId: "" }],
      pushSubscriptions: [],
    };
    await writeLocalDb(db);
    return db;
  }
}

function mapPushSubscription(row: Record<string, unknown>): PushSubscriptionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    endpoint: String(row.endpoint),
    subscription: row.subscription,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  };
}

async function writeLocalDb(db: LocalDb) {
  await mkdir(dirname(localDbPath), { recursive: true });
  await writeFile(localDbPath, JSON.stringify(db, null, 2));
}

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  };
}

function mapReminder(row: Record<string, unknown>): ReminderRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: String(row.title),
    note: String(row.note),
    dueAt: new Date(row.due_at as string | Date).toISOString(),
    channels: Array.isArray(row.channels) ? row.channels : [],
    done: Boolean(row.done),
    sentAt: row.sent_at ? new Date(row.sent_at as string | Date).toISOString() : undefined,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  } as ReminderRecord;
}

export async function findUserByEmail(email: string) {
  if (usePostgres()) {
    await ensurePostgres();
    const rows = await getSql()`select * from users where email = ${email} limit 1`;
    return rows[0] ? mapUser(rows[0]) : null;
  }

  const db = await readLocalDb();
  return db.users.find((user) => user.email === email) ?? null;
}

export async function findUserById(id: string) {
  if (usePostgres()) {
    await ensurePostgres();
    const rows = await getSql()`select * from users where id = ${id} limit 1`;
    return rows[0] ? mapUser(rows[0]) : null;
  }

  const db = await readLocalDb();
  return db.users.find((user) => user.id === id) ?? null;
}

export async function createUser(user: UserRecord) {
  if (usePostgres()) {
    await ensurePostgres();
    await getSql()`
      insert into users (id, name, email, password_hash, created_at)
      values (${user.id}, ${user.name}, ${user.email}, ${user.passwordHash}, ${user.createdAt})
    `;
    return user;
  }

  const db = await readLocalDb();
  db.users.push(user);
  await writeLocalDb(db);
  return user;
}

export async function listReminders(userId: string) {
  if (usePostgres()) {
    await ensurePostgres();
    const rows = await getSql()`
      select * from reminders
      where user_id = ${userId}
      order by done asc, due_at asc
    `;
    return rows.map(mapReminder);
  }

  const db = await readLocalDb();
  return db.reminders
    .filter((reminder) => reminder.userId === userId)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.dueAt.localeCompare(b.dueAt));
}

export async function createReminder(reminder: ReminderRecord) {
  if (usePostgres()) {
    await ensurePostgres();
    const rows = await getSql()`
      insert into reminders (id, user_id, title, note, due_at, channels, done, created_at)
      values (
        ${reminder.id},
        ${reminder.userId},
        ${reminder.title},
        ${reminder.note},
        ${reminder.dueAt},
        ${getSql().json(reminder.channels)},
        ${reminder.done},
        ${reminder.createdAt}
      )
      returning *
    `;
    return mapReminder(rows[0]);
  }

  const db = await readLocalDb();
  db.reminders.push(reminder);
  await writeLocalDb(db);
  return reminder;
}

export async function updateReminder(userId: string, id: string, patch: Partial<ReminderRecord>) {
  if (usePostgres()) {
    await ensurePostgres();
    const currentRows = await getSql()`
      select * from reminders where user_id = ${userId} and id = ${id} limit 1
    `;
    if (!currentRows[0]) return null;

    const current = mapReminder(currentRows[0]);
    const next = { ...current, ...patch };
    const rows = await getSql()`
      update reminders
      set title = ${next.title},
          note = ${next.note},
          due_at = ${next.dueAt},
          channels = ${getSql().json(next.channels)},
          done = ${next.done},
          sent_at = ${next.sentAt ?? null}
      where user_id = ${userId} and id = ${id}
      returning *
    `;
    return rows[0] ? mapReminder(rows[0]) : null;
  }

  const db = await readLocalDb();
  const index = db.reminders.findIndex(
    (reminder) => reminder.userId === userId && reminder.id === id,
  );
  if (index === -1) return null;

  db.reminders[index] = { ...db.reminders[index], ...patch };
  await writeLocalDb(db);
  return db.reminders[index];
}

export async function deleteReminder(userId: string, id: string) {
  if (usePostgres()) {
    await ensurePostgres();
    await getSql()`delete from reminders where user_id = ${userId} and id = ${id}`;
    return;
  }

  const db = await readLocalDb();
  db.reminders = db.reminders.filter(
    (reminder) => !(reminder.userId === userId && reminder.id === id),
  );
  await writeLocalDb(db);
}

export async function savePushSubscription(
  userId: string,
  subscription: { endpoint?: string; [key: string]: unknown },
) {
  if (!subscription.endpoint) throw new Error("missing push endpoint");

  const record: PushSubscriptionRecord = {
    id: crypto.randomUUID(),
    userId,
    endpoint: subscription.endpoint,
    subscription,
    createdAt: new Date().toISOString(),
  };

  if (usePostgres()) {
    await ensurePostgres();
    const rows = await getSql()`
      insert into push_subscriptions (id, user_id, endpoint, subscription, created_at)
      values (
        ${record.id},
        ${record.userId},
        ${record.endpoint},
        ${getSql().json(record.subscription as any)},
        ${record.createdAt}
      )
      on conflict (endpoint) do update
      set user_id = excluded.user_id,
          subscription = excluded.subscription
      returning *
    `;
    return mapPushSubscription(rows[0]);
  }

  const db = await readLocalDb();
  db.pushSubscriptions = db.pushSubscriptions.filter((item) => item.endpoint !== record.endpoint);
  db.pushSubscriptions.push(record);
  await writeLocalDb(db);
  return record;
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  if (usePostgres()) {
    await ensurePostgres();
    await getSql()`delete from push_subscriptions where user_id = ${userId} and endpoint = ${endpoint}`;
    return;
  }

  const db = await readLocalDb();
  db.pushSubscriptions = db.pushSubscriptions.filter(
    (item) => !(item.userId === userId && item.endpoint === endpoint),
  );
  await writeLocalDb(db);
}

export async function listPushSubscriptions(userId: string) {
  if (usePostgres()) {
    await ensurePostgres();
    const rows = await getSql()`
      select * from push_subscriptions
      where user_id = ${userId}
      order by created_at desc
    `;
    return rows.map(mapPushSubscription);
  }

  const db = await readLocalDb();
  return db.pushSubscriptions.filter((item) => item.userId === userId);
}

export async function listDueDiscordReminders() {
  if (usePostgres()) {
    await ensurePostgres();
    const rows = await getSql()`
      select reminders.*, user_settings.discord_webhook, user_settings.discord_user_id
      from reminders
      left join user_settings on user_settings.user_id = reminders.user_id
      where reminders.done = false
        and reminders.sent_at is null
        and reminders.due_at <= now()
      order by reminders.due_at asc
      limit 50
    `;

    return rows.map((row) => ({
      reminder: mapReminder(row),
      discordWebhook: String(row.discord_webhook),
      discordUserId: String(row.discord_user_id ?? ""),
    }));
  }

  const db = await readLocalDb();
  const now = Date.now();

  return db.reminders
    .filter(
      (reminder) =>
        !reminder.done &&
        !reminder.sentAt &&
        new Date(reminder.dueAt).getTime() <= now,
    )
    .map((reminder) => ({
      reminder,
      discordWebhook:
        db.settings.find((settings) => settings.userId === reminder.userId)?.discordWebhook ?? "",
      discordUserId:
        db.settings.find((settings) => settings.userId === reminder.userId)?.discordUserId ?? "",
    }))
    .filter((item) => item.discordWebhook);
}

export async function getSettings(userId: string): Promise<SettingsRecord> {
  if (usePostgres()) {
    await ensurePostgres();
    const rows = await getSql()`
      insert into user_settings (user_id)
      values (${userId})
      on conflict (user_id) do update set user_id = excluded.user_id
      returning *
    `;
    return {
      userId,
      discordWebhook: rows[0].discord_webhook,
      discordUserId: rows[0].discord_user_id ?? "",
    };
  }

  const db = await readLocalDb();
  let settings = db.settings.find((item) => item.userId === userId);
  if (!settings) {
    settings = { userId, discordWebhook: "", discordUserId: "" };
    db.settings.push(settings);
    await writeLocalDb(db);
  }
  return settings;
}

export async function updateSettings(userId: string, settings: Partial<SettingsRecord>) {
  if (usePostgres()) {
    await ensurePostgres();
    const rows = await getSql()`
      insert into user_settings (user_id, discord_webhook, discord_user_id)
      values (${userId}, ${settings.discordWebhook ?? ""}, ${settings.discordUserId ?? ""})
      on conflict (user_id) do update
      set discord_webhook = excluded.discord_webhook,
          discord_user_id = excluded.discord_user_id
      returning *
    `;
    return {
      userId,
      discordWebhook: rows[0].discord_webhook,
      discordUserId: rows[0].discord_user_id ?? "",
    };
  }

  const db = await readLocalDb();
  const current = await getSettings(userId);
  const next = { ...current, ...settings };
  db.settings = db.settings.filter((item) => item.userId !== userId);
  db.settings.push(next);
  await writeLocalDb(db);
  return next;
}
