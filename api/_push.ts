import webPush, { type PushSubscription } from "web-push";

let configured = false;

export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}

function configureWebPush() {
  if (configured) return;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@kuudere.cc";

  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured");
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export async function sendWebPush(subscription: unknown, payload: unknown) {
  configureWebPush();

  await webPush.sendNotification(
    subscription as PushSubscription,
    JSON.stringify(payload),
  );
}
