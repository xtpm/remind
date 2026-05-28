import {
  ArrowRight,
  BellRing,
  Check,
  Clock3,
  History,
  Inbox,
  MessageCircle,
  Monitor,
  LogIn,
  LogOut,
  Settings,
  Smartphone,
  Trash2,
  UserPlus,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BorderGlow } from "./BorderGlow";
import GradualBlur from "./GradualBlur";
import { LightRays } from "./LightRays";
import { SplitText } from "./SplitText";

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
type ConsoleView = "queue" | "scheduled" | "history" | "channels" | "settings";

const consoleNavMeta: Record<ConsoleView, { label: string; icon: typeof Inbox }> = {
  queue: { label: "queue", icon: Inbox },
  scheduled: { label: "scheduled", icon: Clock3 },
  history: { label: "history", icon: History },
  channels: { label: "channels", icon: BellRing },
  settings: { label: "settings", icon: Settings },
};

const channelMeta: Record<Channel, { label: string; icon: typeof Monitor }> = {
  desktop: { label: "desktop", icon: Monitor },
  phone: { label: "phone", icon: Smartphone },
  discord: { label: "discord", icon: MessageCircle },
};

const defaultTime = () => {
  const date = new Date(Date.now() + 30 * 60 * 1000);
  date.setSeconds(0, 0);
  return formatDatetimeLocal(date);
};

function formatDatetimeLocal(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string) {
  return new Date(value).toISOString();
}

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
    dueAt: formatDatetimeLocal(new Date(Date.now() + 3 * 60 * 60 * 1000)),
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

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
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
  const [path, setPath] = useState(() => window.location.pathname);
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
  const [consoleView, setConsoleView] = useState<ConsoleView>("queue");
  const [previousConsoleView, setPreviousConsoleView] = useState<ConsoleView>("queue");
  const [composerOpen, setComposerOpen] = useState(false);

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
  const scheduledCount = reminders.filter(
    (reminder) => !reminder.done && new Date(reminder.dueAt).getTime() > now,
  ).length;
  const historyCount = reminders.filter((reminder) => reminder.done || reminder.sentAt).length;
  const webhookStatus: "linked" | "offline" = webhook.trim() ? "linked" : "offline";
  const visibleReminders = useMemo(() => {
    if (consoleView === "history") {
      return sortedReminders.filter((reminder) => reminder.done || reminder.sentAt);
    }

    if (consoleView === "scheduled") {
      return sortedReminders.filter(
        (reminder) => !reminder.done && new Date(reminder.dueAt).getTime() > now,
      );
    }

    return sortedReminders.filter((reminder) => !reminder.done);
  }, [consoleView, now, sortedReminders]);
  const viewTitle =
    consoleView === "scheduled"
      ? "scheduled"
      : consoleView === "history"
        ? "history"
        : consoleView === "channels"
          ? "channels"
          : consoleView === "settings"
            ? "settings"
            : "queue";
  const viewCount =
    consoleView === "scheduled"
      ? scheduledCount
      : consoleView === "history"
        ? historyCount
        : activeCount;
  const consoleOrder: ConsoleView[] = ["queue", "scheduled", "history", "channels", "settings"];
  const viewDirection =
    consoleOrder.indexOf(consoleView) >= consoleOrder.indexOf(previousConsoleView)
      ? "forward"
      : "back";

  function switchConsoleView(view: ConsoleView) {
    if (view === consoleView) return;
    setPreviousConsoleView(consoleView);
    setConsoleView(view);
  }

  const navigate = useCallback((nextPath: string) => {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
  }, []);

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
    const syncPath = () => setPath(window.location.pathname);
    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
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
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setNotificationState("denied");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationState(permission);

    if (permission !== "granted") return;

    const [{ publicKey }, registration] = await Promise.all([
      apiRequest<{ publicKey: string }>("/api/push/public-key"),
      navigator.serviceWorker.register("/sw.js"),
    ]);

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    await apiRequest("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ subscription }),
    });
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
        dueAt: datetimeLocalToIso(dueAt),
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
    setComposerOpen(false);

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
      navigate("/app");
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

  const authForm = (
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
  );

  if (!session && (path === "/login" || path === "/app")) {
    return (
      <main className="app-shell auth-shell">
        <section className="auth-layout">
          <div className="auth-copy">
            <p className="eyebrow">r_ / access</p>
            <h1>remind</h1>
            <p className="subtitle">
              sign in to manage your reminder queue and delivery channels.
            </p>

            <button className="ghost-action" type="button" onClick={() => navigate("/")}>
              back home
            </button>
          </div>

          <section className="auth-card-wrap">
            {authForm}
          </section>
        </section>
      </main>
    );
  }

  if (!session || path === "/") {
    return (
      <main className="landing-shell">
        <div className="landing-grid-bg" aria-hidden="true" />
        <div className="landing-rays" aria-hidden="true">
          <LightRays
            raysOrigin="top-center"
            raysColor="#ff7ab6"
            raysSpeed={0.22}
            lightSpread={0.82}
            rayLength={1.85}
            followMouse
            mouseInfluence={0.08}
            noiseAmount={0.08}
            distortion={0.045}
            fadeDistance={0.72}
            saturation={1.18}
            respectReducedMotion={false}
            pulsating
          />
        </div>
        <GradualBlur
          className="landing-blur landing-blur-bottom"
          target="page"
          position="bottom"
          height="9rem"
          strength={1.7}
          divCount={7}
          curve="bezier"
          exponential
          opacity={0.82}
          zIndex={-1}
        />
        <div className="particle-field" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <span key={index} />
          ))}
        </div>

        <nav className="landing-nav" aria-label="Landing navigation">
          <button className="brand-button" type="button" onClick={() => navigate("/")}>
            remind
          </button>
          <div className="landing-links">
            <a href="#features">features</a>
            <a href="#delivery">delivery</a>
            <button className="ghost-action" type="button" onClick={() => navigate(session ? "/app" : "/login")}>
              {session ? "open app" : "log in"}
            </button>
            <button className="primary-action nav-cta" type="button" onClick={() => navigate(session ? "/app" : "/login")}>
              start reminding
            </button>
          </div>
        </nav>

        <section className="landing-hero">
          <div className="landing-copy centered">
            <SplitText
              tag="h1"
              text="calm, finally."
              className="landing-headline"
              delay={38}
              duration={0.82}
              ease="power3.out"
              splitType="chars"
              from={{ opacity: 0, y: 72, rotateX: -28 }}
              to={{ opacity: 1, y: 0, rotateX: 0 }}
              threshold={0.1}
              rootMargin="0px"
            />
            <p>
              Reminders that reach desktop, iPhone, and Discord before the thought disappears.
            </p>
            <span className="proof-line">built for quiet personal queues</span>
            <div className="landing-actions">
              <button className="primary-action" type="button" onClick={() => navigate(session ? "/app" : "/login")}>
                start reminding
                <ArrowRight size={17} />
              </button>
              <button className="ghost-action" type="button" onClick={() => {
                document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
              }}>
                see features
                <ArrowRight size={17} />
              </button>
            </div>
          </div>
        </section>

        <BorderGlow
          className="product-preview-glow"
          edgeSensitivity={24}
          glowColor="327 100 74"
          backgroundColor="#120713"
          borderRadius={6}
          glowRadius={34}
          glowIntensity={0.74}
          coneSpread={22}
          animated
          colors={["#ff7ab6", "#963096", "#e9edf7"]}
          fillOpacity={0.2}
        >
        <section className="product-preview" aria-label="Reminder product preview">
          <aside className="preview-sidebar">
            <strong>remind</strong>
            <span className="active-item">queue</span>
            <span>scheduled</span>
            <span>history</span>
            <span>channels</span>
            <span>settings</span>
          </aside>
          <div className="preview-queue">
            <div className="preview-topline">
              <span>queue</span>
              <strong>4 active</strong>
            </div>
            {[
              ["pay invoice", "today at 5:00 PM", "in 2h 34m"],
              ["review PR feedback", "today at 7:30 PM", "in 4h 59m"],
              ["drink water", "tomorrow at 9:00 AM", "in 18h"],
              ["call mom", "tomorrow at 6:00 PM", "in 27h"],
            ].map(([itemTitle, itemTime, itemEta]) => (
              <div className="preview-task" key={itemTitle}>
                <span className="task-check" />
                <div>
                  <strong>{itemTitle}</strong>
                  <span>{itemTime}</span>
                </div>
                <time>{itemEta}</time>
              </div>
            ))}
            <div className="preview-add">
              <span>what do you want to be reminded of?</span>
              <button type="button">add reminder</button>
            </div>
          </div>
          <aside className="preview-delivery">
            <div>
              <span>delivery</span>
              <strong>all systems go</strong>
            </div>
            <div className="delivery-row"><Monitor size={17} /> desktop <span>ready</span></div>
            <div className="delivery-row"><Smartphone size={17} /> iphone push <span>ready</span></div>
            <div className="delivery-row"><MessageCircle size={17} /> discord <span>linked</span></div>
            <div className="webhook-mini">discord webhook <strong>linked</strong></div>
          </aside>
        </section>
        </BorderGlow>

        <section className="benefit-stack" id="features">
          <article>
            <div className="benefit-visual">
              <div className="capture-card">
                <span className="input-line" />
                <button type="button">+</button>
              </div>
            </div>
            <div>
              <span>01</span>
              <h2>Capture the thought</h2>
              <p>Jot it down in a second. Quick add, short notes, and clean timing keep the queue moving.</p>
            </div>
          </article>
          <article id="delivery">
            <div className="benefit-visual delivery-map">
              <div>
                <Monitor size={22} />
                <span>desktop</span>
              </div>
              <div>
                <Smartphone size={22} />
                <span>iphone</span>
              </div>
              <div>
                <MessageCircle size={22} />
                <span>discord</span>
              </div>
            </div>
            <div>
              <span>02</span>
              <h2>Choose where it lands</h2>
              <p>Send reminders to desktop, iPhone, Discord, or all three when something really matters.</p>
            </div>
          </article>
          <article id="pricing">
            <div className="benefit-visual timeline-visual">
              <span style={{ "--delay": "0s" } as React.CSSProperties} />
              <span style={{ "--delay": "0.12s" } as React.CSSProperties} />
              <span style={{ "--delay": "0.24s" } as React.CSSProperties} />
            </div>
            <div>
              <span>03</span>
              <h2>Stay ahead of the queue</h2>
              <p>A focused reminder system with smart delivery checks and a quiet interface for daily use.</p>
            </div>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="console-page">
      <div className="landing-grid-bg" aria-hidden="true" />
      <div className="particle-field" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => (
          <span key={index} />
        ))}
      </div>

      <section className="remind-console">
        <aside className="console-sidebar">
          <button className="console-brand" type="button" onClick={() => navigate("/")}>
            remind
          </button>
          <nav aria-label="Reminder console">
            {([
              ["queue", activeCount],
              ["scheduled", scheduledCount],
              ["history", historyCount],
              ["channels", null],
              ["settings", null],
            ] as Array<[ConsoleView, number | null]>).map(([view, count]) => {
              const Icon = consoleNavMeta[view].icon;

              return (
                <button
                  className={consoleView === view ? "active" : ""}
                  key={view}
                  type="button"
                  onClick={() => switchConsoleView(view)}
                >
                  <span>
                    <Icon size={15} />
                    {consoleNavMeta[view].label}
                  </span>
                  {typeof count === "number" && <strong>{count}</strong>}
                </button>
              );
            })}
          </nav>
          <button className="console-user" type="button" onClick={signOut}>
            <LogOut size={15} />
            {session.name}
          </button>
        </aside>

        <section className="console-queue" id="queue">
          <header className="queue-header">
            <span>{viewTitle}</span>
            <strong>
              {consoleView === "channels" || consoleView === "settings"
                ? "ready"
                : `${viewCount} ${viewCount === 1 ? "item" : "items"}`}
            </strong>
          </header>

          <div className={`console-view-frame ${viewDirection}`} key={consoleView}>
            {consoleView === "channels" ? (
              <section className="console-detail-view">
              <article>
                <Monitor size={22} />
                <div>
                  <h3>desktop notifications</h3>
                  <p>Send browser push reminders to this computer while you work.</p>
                </div>
                <button type="button" onClick={askForNotifications}>
                  {notificationState === "granted" ? "ready" : "enable"}
                </button>
              </article>
              <article>
                <Smartphone size={22} />
                <div>
                  <h3>iphone push</h3>
                  <p>Add remind to your iPhone Home Screen, then enable browser push.</p>
                </div>
                <button type="button" onClick={askForNotifications}>
                  {notificationState === "granted" ? "ready" : "enable"}
                </button>
              </article>
              <article>
                <MessageCircle size={22} />
                <div>
                  <h3>discord webhook</h3>
                  <p>Store a webhook and optional user ID to send embeds with mentions.</p>
                </div>
                <strong className={webhookStatus}>{webhookStatus}</strong>
              </article>
              </section>
            ) : consoleView === "settings" ? (
              <section className="console-detail-view settings-view">
              <article>
                <div>
                  <h3>signed in</h3>
                  <p>{session.email}</p>
                </div>
                <button type="button" onClick={signOut}>sign out</button>
              </article>
              <article>
                <div>
                  <h3>next reminder</h3>
                  <p>{nextReminder ? `${nextReminder.title} · ${timeUntil(nextReminder.dueAt)}` : "your queue is clear"}</p>
                </div>
                <strong>{activeCount} active</strong>
              </article>
              <article>
                <div>
                  <h3>local status</h3>
                  <p>delivery checks run while the app is open, with scheduled backend checks for due reminders.</p>
                </div>
                <strong>live</strong>
              </article>
              </section>
            ) : (
              <div className="console-reminders">
              {visibleReminders.length === 0 && (
                <div className="console-empty">
                  <h3>{consoleView === "history" ? "nothing completed yet" : "nothing scheduled here"}</h3>
                  <p>Add a reminder below or switch views from the sidebar.</p>
                </div>
              )}
              {visibleReminders.map((reminder) => (
              <article
                className={[
                  "console-reminder",
                  reminder.done ? "done" : "",
                  enteringReminderIds.includes(reminder.id) ? "entering" : "",
                  deletingReminderIds.includes(reminder.id) ? "deleting" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={reminder.id}
              >
                <button
                  className="console-check"
                  type="button"
                  onClick={() => completeReminder(reminder.id)}
                  title={reminder.done ? "Mark active" : "Mark done"}
                >
                  {reminder.done && <Check size={13} />}
                </button>

                <div className="console-reminder-main">
                  <h3>{reminder.title}</h3>
                  <span>{formatDue(reminder.dueAt)}</span>
                  {reminder.note && <p>{reminder.note}</p>}
                </div>

                <time>{timeUntil(reminder.dueAt)}</time>
                <button
                  className="console-delete"
                  type="button"
                  onClick={() => deleteReminder(reminder.id)}
                  title="Delete reminder"
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
              </div>
            )}
          </div>

          <button className="console-open-composer" type="button" onClick={() => setComposerOpen(true)}>
            <span>what do you want to be reminded of?</span>
            <strong>add reminder</strong>
          </button>
        </section>

        <aside className="console-delivery" id="channels">
          <div className="delivery-heading">
            <span>delivery</span>
            <strong>all systems go</strong>
          </div>

          <button className="console-delivery-row" type="button" onClick={askForNotifications}>
            <Monitor size={17} />
            <span>desktop</span>
            <strong>{notificationState === "granted" ? "ready" : notificationState}</strong>
          </button>
          <button className="console-delivery-row" type="button" onClick={askForNotifications}>
            <Smartphone size={17} />
            <span>iphone push</span>
            <strong>{notificationState === "granted" ? "ready" : notificationState}</strong>
          </button>
          <div className="console-delivery-row">
            <MessageCircle size={17} />
            <span>discord</span>
            <strong className={webhookStatus}>{webhookStatus}</strong>
          </div>
          <div className={`console-webhook ${webhookStatus}`}>
            <span>discord webhook</span>
            <strong>{webhookStatus}</strong>
          </div>

          <div className="console-settings" id="settings">
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

            <button
              className="console-test-button"
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
                    : "test webhook"}
            </button>
          </div>
        </aside>
      </section>

      {composerOpen && (
        <div className="composer-popover-backdrop" role="presentation" onClick={() => setComposerOpen(false)}>
          <form
            className="composer-popover"
            onClick={(event) => event.stopPropagation()}
            onSubmit={createReminder}
          >
            <div className="composer-popover-heading">
              <div>
                <span>new reminder</span>
                <h2>add to queue</h2>
              </div>
              <button type="button" onClick={() => setComposerOpen(false)} aria-label="Close reminder menu">
                close
              </button>
            </div>

            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="what do you want to be reminded of?"
              aria-label="title"
            />
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              aria-label="time"
            />
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="note"
              aria-label="note"
            />
            <div className="console-channel-row" aria-label="Notification channels">
              {(Object.keys(channelMeta) as Channel[]).map((channel) => {
                const Icon = channelMeta[channel].icon;
                const checked = channels.includes(channel);

                return (
                  <button
                    className={checked ? "console-channel active" : "console-channel"}
                    key={channel}
                    type="button"
                    onClick={() => toggleChannel(channel)}
                    title={channelMeta[channel].label}
                  >
                    <Icon size={15} />
                    <span>{channelMeta[channel].label}</span>
                  </button>
                );
              })}
            </div>
            <button className="console-add-button" type="submit">
              add reminder
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
