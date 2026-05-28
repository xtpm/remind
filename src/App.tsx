import {
  Bell,
  CalendarClock,
  Check,
  ExternalLink,
  MessageCircle,
  Monitor,
  Moon,
  LogIn,
  LogOut,
  Plus,
  Radio,
  Shield,
  Smartphone,
  Trash2,
  UserPlus,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Channel = "desktop" | "phone" | "discord";

type Reminder = {
  id: string;
  title: string;
  note: string;
  dueAt: string;
  channels: Channel[];
  done: boolean;
  sentAt?: string;
  createdAt?: string;
};

type User = {
  id: string;
  name: string;
  email: string;
};

type Session = Pick<User, "id" | "name" | "email">;

const channelMeta: Record<Channel, { label: string; icon: typeof Monitor }> = {
  desktop: { label: "desktop", icon: Monitor },
  phone: { label: "phone", icon: Smartphone },
  discord: { label: "discord", icon: MessageCircle },
};

const defaultTime = () => {
  const date = new Date(Date.now() + 30 * 60 * 1000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
};

const starterReminders: Reminder[] = [
  {
    id: crypto.randomUUID(),
    title: "ship reminder prototype",
    note: "desktop notification test",
    dueAt: defaultTime(),
    channels: ["desktop", "phone"],
    done: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    title: "wire discord delivery",
    note: "move webhook send to backend before real use",
    dueAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16),
    channels: ["discord"],
    done: false,
    createdAt: new Date().toISOString(),
  },
];

function formatDue(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "same-origin",
    ...options,
  });

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? `${response.status} request failed`);
  }

  return data;
}

function timeUntil(value: string) {
  const ms = new Date(value).getTime() - Date.now();
  const abs = Math.abs(ms);
  const minutes = Math.max(1, Math.round(abs / 60000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const label =
    days > 0
      ? `${days}d ${hours % 24}h`
      : hours > 0
        ? `${hours}h ${minutes % 60}m`
        : `${minutes}m`;

  return ms >= 0 ? `in ${label}` : `${label} late`;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState(defaultTime);
  const [channels, setChannels] = useState<Channel[]>(["desktop", "phone"]);
  const [webhook, setWebhook] = useState("");
  const [discordUserId, setDiscordUserId] = useState("");
  const [notificationState, setNotificationState] = useState(Notification.permission);
  const [now, setNow] = useState(Date.now());
  const [webhookTestState, setWebhookTestState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [browserNotifiedIds, setBrowserNotifiedIds] = useState<string[]>([]);
  const [enteringReminderIds, setEnteringReminderIds] = useState<string[]>([]);
  const [deletingReminderIds, setDeletingReminderIds] = useState<string[]>([]);

  const sortedReminders = useMemo(
    () =>
      [...reminders].sort((a, b) => {
        if (a.done !== b.done) return Number(a.done) - Number(b.done);
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      }),
    [reminders],
  );

  const nextReminder = sortedReminders.find((reminder) => !reminder.done);
  const activeCount = reminders.filter((reminder) => !reminder.done).length;
  const webhookStatus: "linked" | "offline" = webhook.trim() ? "linked" : "offline";

  const loadUserData = useCallback(async () => {
    const [reminderData, settingsData] = await Promise.all([
      apiRequest<{ reminders: Reminder[] }>("/api/reminders"),
      apiRequest<{ settings: { discordWebhook: string; discordUserId: string } }>("/api/settings"),
    ]);

    setReminders(reminderData.reminders);
    setWebhook(settingsData.settings.discordWebhook);
    setDiscordUserId(settingsData.settings.discordUserId ?? "");
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    let active = true;

    async function boot() {
      try {
        const data = await apiRequest<{ user: Session }>("/api/auth/session");
        if (!active) return;
        setSession(data.user);
        await loadUserData();
      } catch {
        if (active) {
          setSession(null);
          setReminders([]);
          setSettingsReady(false);
        }
      } finally {
        if (active) setAuthReady(true);
      }
    }

    boot();

    return () => {
      active = false;
    };
  }, [loadUserData]);

  useEffect(() => {
    if (!session || !settingsReady) return;

    const timeout = window.setTimeout(() => {
      apiRequest("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ discordWebhook: webhook, discordUserId }),
      }).catch(() => undefined);
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [webhook, discordUserId, session, settingsReady]);

  useEffect(() => {
    setWebhookTestState("idle");
  }, [webhook, discordUserId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session) return;

    async function checkDiscordDelivery() {
      try {
        const result = await apiRequest<{ sent: number }>("/api/cron/reminders");
        if (result.sent > 0) {
          await loadUserData();
        }
      } catch {
        // Delivery checks are best-effort; scheduled GitHub Actions also pings this route.
      }
    }

    checkDiscordDelivery();
    const timer = window.setInterval(checkDiscordDelivery, 30000);

    return () => window.clearInterval(timer);
  }, [session, loadUserData]);

  useEffect(() => {
    const due = reminders.filter(
      (reminder) =>
        !reminder.done &&
        !reminder.sentAt &&
        !browserNotifiedIds.includes(reminder.id) &&
        new Date(reminder.dueAt).getTime() <= now,
    );

    if (!due.length) return;

    due.forEach((reminder) => {
      if (reminder.channels.some((channel) => channel === "desktop" || channel === "phone")) {
        sendBrowserNotification(reminder);
      }
    });

    setBrowserNotifiedIds((current) => [
      ...current,
      ...due.map((reminder) => reminder.id).filter((id) => !current.includes(id)),
    ]);

    const clientOnlyDue = due.filter((reminder) => !reminder.channels.includes("discord"));

    if (clientOnlyDue.length) {
      setReminders((current) =>
        current.filter(
          (reminder) => !clientOnlyDue.some((item) => item.id === reminder.id),
        ),
      );

      clientOnlyDue.forEach((reminder) => {
        apiRequest(`/api/reminders/${reminder.id}`, { method: "DELETE" }).catch(() => undefined);
      });
    }
  }, [now, reminders, browserNotifiedIds]);

  async function askForNotifications() {
    const permission = await Notification.requestPermission();
    setNotificationState(permission);
  }

  function sendBrowserNotification(reminder: Reminder) {
    if (Notification.permission !== "granted") return;

    new Notification(reminder.title, {
      body: reminder.note || `Due ${formatDue(reminder.dueAt)}`,
      icon: "/icon.svg",
      tag: reminder.id,
    });
  }

  async function testDiscordWebhook() {
    if (webhookStatus !== "linked" || webhookTestState === "sending") return;

    setWebhookTestState("sending");

    try {
      await apiRequest("/api/discord/test", { method: "POST" });
      setWebhookTestState("sent");
      window.setTimeout(() => setWebhookTestState("idle"), 2400);
    } catch {
      setWebhookTestState("failed");
    }
  }

  function toggleChannel(channel: Channel) {
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    );
  }

  async function createReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !dueAt || !channels.length) return;

    const data = await apiRequest<{ reminder: Reminder }>("/api/reminders", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        note: note.trim(),
        dueAt,
        channels,
      }),
    });
    const id = data.reminder.id;

    setReminders((current) => [
      data.reminder,
      ...current,
    ]);
    setEnteringReminderIds((current) => [...current, id]);

    setTitle("");
    setNote("");
    setDueAt(defaultTime());

    window.setTimeout(() => {
      setEnteringReminderIds((current) => current.filter((item) => item !== id));
    }, 1400);
  }

  function completeReminder(id: string) {
    const reminder = reminders.find((item) => item.id === id);
    if (!reminder) return;

    const done = !reminder.done;
    setReminders((current) =>
      current.map((item) => (item.id === id ? { ...item, done } : item)),
    );

    apiRequest(`/api/reminders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ done }),
    }).catch(() => {
      setReminders((current) =>
        current.map((item) => (item.id === id ? { ...item, done: reminder.done } : item)),
      );
    });
  }

  function deleteReminder(id: string) {
    setDeletingReminderIds((current) => (current.includes(id) ? current : [...current, id]));

    window.setTimeout(() => {
      setReminders((current) => current.filter((reminder) => reminder.id !== id));
      setDeletingReminderIds((current) => current.filter((item) => item !== id));
      apiRequest(`/api/reminders/${id}`, { method: "DELETE" }).catch(() => undefined);
    }, 420);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");

    const email = authEmail.trim().toLowerCase();
    const password = authPassword;
    const name = authName.trim();

    if (!email || !password || (authMode === "signup" && !name)) {
      setAuthError("fill in the required fields");
      return;
    }

    try {
      const data = await apiRequest<{ user: Session }>(
        authMode === "signup" ? "/api/auth/signup" : "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ name, email, password }),
        },
      );

      setSession(data.user);
      setAuthName("");
      setAuthEmail("");
      setAuthPassword("");
      setSettingsReady(false);
      setReminders([]);
      setWebhook("");
      setDiscordUserId("");

      loadUserData().catch(() => {
        setSettingsReady(true);
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "auth failed");
    }
  }

  async function signOut() {
    await apiRequest("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setSession(null);
    setSettingsReady(false);
    setReminders([]);
    setWebhook("");
    setDiscordUserId("");
  }

  if (!authReady) {
    return (
      <main className="app-shell auth-shell">
        <section className="auth-layout">
          <div>
            <p className="eyebrow">r_ / loading</p>
            <h1>reminders</h1>
            <p className="subtitle">checking your session.</p>
          </div>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="app-shell auth-shell">
        <section className="auth-layout">
          <div className="auth-copy">
            <p className="eyebrow">r_ / access</p>
            <h1>reminders</h1>
            <p className="subtitle">
              a quiet reminder system for desktop, phone, and discord.
            </p>

            <div className="live-pill">
              <Shield size={15} />
              <span>private beta</span>
            </div>
          </div>

          <section className="auth-card-wrap">
            <form className="panel auth-panel" onSubmit={submitAuth}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{authMode}</p>
                  <h2>{authMode === "login" ? "welcome back" : "create account"}</h2>
                </div>
                {authMode === "login" ? <LogIn size={19} /> : <UserPlus size={19} />}
              </div>

              {authMode === "signup" && (
                <label>
                  <span>name</span>
                  <input
                    value={authName}
                    onChange={(event) => setAuthName(event.target.value)}
                    placeholder="retrial"
                    autoComplete="name"
                  />
                </label>
              )}

              <label>
                <span>email</span>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@kuudere.cc"
                  autoComplete="email"
                />
              </label>

              <label>
                <span>password</span>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="********"
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                />
              </label>

              {authError && <p className="auth-error">{authError}</p>}

              <button className="primary-action" type="submit">
                {authMode === "login" ? <LogIn size={17} /> : <UserPlus size={17} />}
                {authMode === "login" ? "sign in" : "sign up"}
              </button>

              <button
                className="ghost-action wide"
                type="button"
                onClick={() => {
                  setAuthMode(authMode === "login" ? "signup" : "login");
                  setAuthError("");
                }}
              >
                {authMode === "login" ? "need an account" : "have an account"}
              </button>
            </form>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div>
          <p className="eyebrow">r_ / reminder console</p>
          <h1>reminders</h1>
          <p className="subtitle">
            small alerts for desktop, phone, and discord.
          </p>
        </div>

        <div className="status-stack" aria-label="Reminder status">
          <div className="live-pill">
            <Radio size={15} />
            <span>checking</span>
          </div>
          <p>{new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
          <button className="ghost-action session-action" type="button" onClick={signOut}>
            <LogOut size={15} />
            {session.name}
          </button>
        </div>
      </section>

      <section className="stats-grid">
        <article>
          <span>active</span>
          <strong>{activeCount}</strong>
        </article>
        <article>
          <span>next</span>
          <strong>{nextReminder ? timeUntil(nextReminder.dueAt) : "clear"}</strong>
        </article>
        <article>
          <span>discord</span>
          <strong className={`status-text ${webhookStatus}`}>{webhookStatus}</strong>
        </article>
      </section>

      <div className="workspace-grid">
        <form className="composer panel" onSubmit={createReminder}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">new</p>
              <h2>create reminder</h2>
            </div>
            <Plus size={19} />
          </div>

          <label>
            <span>title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="pay invoice"
            />
          </label>

          <label>
            <span>time</span>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </label>

          <label>
            <span>note</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="short context"
              rows={4}
            />
          </label>

          <div className="channel-row" aria-label="Notification channels">
            {(Object.keys(channelMeta) as Channel[]).map((channel) => {
              const Icon = channelMeta[channel].icon;
              const checked = channels.includes(channel);

              return (
                <button
                  className={checked ? "channel active" : "channel"}
                  key={channel}
                  type="button"
                  onClick={() => toggleChannel(channel)}
                  title={channelMeta[channel].label}
                >
                  <Icon size={17} />
                  <span>{channelMeta[channel].label}</span>
                </button>
              );
            })}
          </div>

          <button className="primary-action" type="submit">
            <Bell size={17} />
            add reminder
          </button>
        </form>

        <section className="panel list-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">queue</p>
              <h2>upcoming</h2>
            </div>
            <CalendarClock size={19} />
          </div>

          <div className="reminder-list">
            {sortedReminders.map((reminder) => (
              <article
                className={[
                  "reminder",
                  reminder.done ? "done" : "",
                  enteringReminderIds.includes(reminder.id) ? "entering" : "",
                  deletingReminderIds.includes(reminder.id) ? "deleting" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={reminder.id}
              >
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => completeReminder(reminder.id)}
                  title={reminder.done ? "Mark active" : "Mark done"}
                >
                  <Check size={16} />
                </button>

                <div className="reminder-main">
                  <div className="reminder-title-row">
                    <h3>{reminder.title}</h3>
                    <time>{formatDue(reminder.dueAt)}</time>
                  </div>
                  {reminder.note && <p>{reminder.note}</p>}
                  <div className="mini-channels">
                    {reminder.channels.map((channel) => {
                      const Icon = channelMeta[channel].icon;
                      return (
                        <span key={channel}>
                          <Icon size={13} />
                          {channel}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => deleteReminder(reminder.id)}
                  title="Delete reminder"
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">channels</p>
              <h2>delivery</h2>
            </div>
            <Moon size={19} />
          </div>

          <div className="settings-row">
            <div>
              <strong>browser push</strong>
              <span>{notificationState}</span>
            </div>
            <button className="ghost-action" type="button" onClick={askForNotifications}>
              enable
            </button>
          </div>

          <label>
            <span>discord webhook</span>
            <input
              value={webhook}
              onChange={(event) => setWebhook(event.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
            />
          </label>

          <label>
            <span>discord user id</span>
            <input
              value={discordUserId}
              onChange={(event) => setDiscordUserId(event.target.value.replace(/\D/g, ""))}
              placeholder="123456789012345678"
            />
          </label>

          <div className="webhook-tools">
            <div className={`webhook-status ${webhookStatus}`}>
              <span aria-hidden="true" />
              <strong>{webhookStatus}</strong>
            </div>
            <button
              className="ghost-action webhook-test"
              type="button"
              onClick={testDiscordWebhook}
              disabled={webhookStatus !== "linked" || webhookTestState === "sending"}
            >
              {webhookTestState === "sending"
                ? "sending"
                : webhookTestState === "sent"
                  ? "sent"
                  : webhookTestState === "failed"
                    ? "failed"
                    : "test"}
            </button>
          </div>

          <a className="link-out" href="https://discord.com/developers/docs/resources/webhook" target="_blank">
            docs
            <ExternalLink size={14} />
          </a>
        </section>
      </div>
    </main>
  );
}
