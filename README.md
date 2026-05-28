# Kuudere Reminders

Reminder web app with Vercel API routes for auth, reminder storage, and user settings.

## Local Development

```bash
npm install
npm run dev
```

Local URL:

```txt
http://127.0.0.1:5173/
```

Demo login:

```txt
email: demo@kuudere.cc
password: demo1234
```

Local development uses `.data/db.json` when `DATABASE_URL` is not set.

## Production Environment

Set these Vercel environment variables:

```txt
AUTH_SECRET
DATABASE_URL
CRON_SECRET optional
```

`DATABASE_URL` should point at a Postgres database. The API creates the required tables automatically on first use.

Discord webhook reminders are sent by the backend cron route:

```txt
/api/cron/reminders
```

On the free Vercel Hobby plan, Vercel cron jobs cannot run every minute. This repo uses a GitHub Actions schedule in `.github/workflows/reminder-cron.yml` to ping the backend every 5 minutes and send due reminders that include the Discord channel.

To ping a Discord user, save their numeric Discord user ID in the delivery settings. The app sends mentions as `<@USER_ID>` with Discord `allowed_mentions` restricted to that user.

## Domain

Target domain:

```txt
remind.kuudere.cc
```

For a Vercel subdomain, add the domain to the project, inspect it in Vercel, then add the DNS record Vercel recommends. The usual subdomain record is:

```txt
Type: CNAME
Name: remind
Value: cname.vercel-dns-0.com
```

Use the exact value shown by Vercel if it gives a project-specific CNAME.
