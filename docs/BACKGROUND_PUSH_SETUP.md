# Background push setup (app closed)

This does **not** change messaging, friends, delivery, or admin business logic.
In-app notification center + Realtime keep working as before.

## You already have

- Service worker `push` handler (`public/sw.js`)
- Opt-in Enable browser alerts (never on page load)
- `VITE_VAPID_PUBLIC_KEY` on Vercel (public only)

## What this adds

1. Table `push_subscriptions` + RPCs `save_push_subscription` / `delete_push_subscription`
2. Client saves subscription to Supabase when user enables alerts
3. Edge Function `send-push` that sends Web Push with the **private** key

---

## Step 1 — Run SQL

Supabase → **SQL Editor** → run:

`supabase/migrations/015_push_subscriptions.sql`

---

## Step 2 — Vercel (public key only)

Already done if you set:

`VITE_VAPID_PUBLIC_KEY` = your public key → **Redeploy**

---

## Step 3 — Supabase Edge Function secrets (private key)

In Supabase Dashboard → **Project Settings** → **Edge Functions** → **Secrets**  
(or CLI: `supabase secrets set ...`)

Set:

| Secret | Value |
|--------|--------|
| `VAPID_PUBLIC_KEY` | same public key as Vercel |
| `VAPID_PRIVATE_KEY` | your **private** key only |
| `VAPID_SUBJECT` | e.g. `mailto:you@yourdomain.com` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are usually available automatically to Edge Functions.

---

## Step 4 — Deploy the Edge Function

From a machine with [Supabase CLI](https://supabase.com/docs/guides/cli) logged in:

```bash
cd tap-tap-and-away
supabase functions deploy send-push --no-verify-jwt
```

`--no-verify-jwt` is useful if a **Database Webhook** calls the function (no user JWT).  
If you prefer JWT-only invokes, omit that flag and call the function with the service role from a trusted path only.

Function source: `supabase/functions/send-push/index.ts`

---

## Step 5 — Call the function when a notification is created

### Option A — Database Webhook (recommended, no app code change)

1. Supabase → **Database** → **Webhooks** (or Integrations → Webhooks)
2. Create webhook:
   - Table: `notifications`
   - Events: **Insert**
   - Type: Supabase Edge Function **or** HTTP URL to:
     `https://<PROJECT_REF>.supabase.co/functions/v1/send-push`
   - Headers: `Authorization: Bearer <SERVICE_ROLE_KEY>` (if required)
3. Body should include the new row (`record` with `user_id`, `title`, `message`)

The Edge Function already reads `payload.record.user_id`, `title`, `message`.

### Option B — Manual test

```bash
curl -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push' \
  -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"<USER_UUID>","title":"Test","body":"Background push works","url":"/"}'
```

---

## Step 6 — User device setup

1. Open the installed PWA or site over **HTTPS**
2. Log in
3. Tap **Enable browser alerts** (bell or Profile) → Allow
4. Confirm a row appears in table `push_subscriptions` for that user
5. Close the app completely
6. Send Admin **Broadcast** (or run curl above)
7. OS notification should appear without opening the app

---

## Platform notes

- **Android Chrome**: best support
- **Desktop Chrome/Edge**: good support
- **iPhone**: limited; Add to Home Screen + recent iOS; not as reliable as Android

---

## Safety

- Never put `VAPID_PRIVATE_KEY` or service role key in the frontend / `VITE_*` / GitHub
- Existing Realtime in-app notifications are unchanged
- If Edge Function or webhook is missing, the app still works; users only miss closed-app OS push
