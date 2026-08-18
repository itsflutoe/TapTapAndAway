/**
 * Supabase Edge Function: send-push
 *
 * Sends Web Push to a user's stored subscriptions.
 * Secrets (Dashboard → Edge Functions → Secrets):
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT          (e.g. mailto:you@example.com)
 *
 * Invoke:
 *   - Database Webhook on public.notifications INSERT (recommended)
 *   - Or POST JSON: { "user_id": "...", "title": "...", "body": "...", "url": "/" }
 *
 * Never put VAPID_PRIVATE_KEY in the Vite/frontend env.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') ?? Deno.env.get('VITE_VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@taptapandaway.app';

    if (!vapidPublic || !vapidPrivate) {
      return json({ error: 'VAPID keys not configured on server' }, 500);
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const payload = await req.json().catch(() => ({}));

    // Database Webhook payload shape: { type, table, record, ... }
    let userId: string | undefined = payload.user_id ?? payload.record?.user_id;
    let title: string = payload.title ?? payload.record?.title ?? 'Tap Tap and Away';
    let body: string = payload.body ?? payload.message ?? payload.record?.message ?? '';
    let url: string = payload.url ?? '/';

    if (!userId) {
      return json({ error: 'user_id required' }, 400);
    }

    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);

    if (error) {
      return json({ error: error.message }, 500);
    }
    if (!subs?.length) {
      return json({ ok: true, sent: 0, reason: 'no_subscriptions' });
    }

    const notificationPayload = JSON.stringify({
      title,
      body,
      url,
      tag: payload.record?.id ?? payload.tag ?? 'tta-push',
    });

    let sent = 0;
    const stale: string[] = [];

    for (const s of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          notificationPayload,
          { TTL: 60 * 60 }
        );
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        // Gone / expired subscription
        if (status === 404 || status === 410) {
          stale.push(s.endpoint);
        }
        console.error('push failed', status, err);
      }
    }

    if (stale.length) {
      await admin.from('push_subscriptions').delete().in('endpoint', stale);
    }

    return json({ ok: true, sent, removed_stale: stale.length });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
