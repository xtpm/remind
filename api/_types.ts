export type Channel = "desktop" | "phone" | "discord";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

export type ReminderRecord = {
  id: string;
  userId: string;
  title: string;
  note: string;
  dueAt: string;
  channels: Channel[];
  done: boolean;
  sentAt?: string;
  createdAt: string;
};

export type SettingsRecord = {
  userId: string;
  discordWebhook: string;
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
};
