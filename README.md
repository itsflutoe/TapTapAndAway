# 🐦 Tap Tap and Away

**Every message takes a journey.**

A mobile-first messaging app where messages are delivered by virtual pigeons that fly between real-world registered addresses.

## Features

- Username + password authentication
- Unique **Pigeon ID** (PID-XXXXXXXX) per account
- Address-based delivery with Nominatim geocoding
- Great-circle (Haversine) distance + configurable Stamp cost (`km_per_stamp`, `min_stamp_cost`)
- Open-Meteo weather affecting flight speed (multipliers from Admin / `system_settings`)
- Interactive Leaflet map with animated pigeon flight
- Realtime inbox & delivery progress (Supabase Realtime)
- **Server-authoritative delivery resolution** (`resolve_delivery` RPC): failure probability, refunds, pigeon stats
- Stamp currency (signup bonus + daily reward — configurable)
- Friend system, conversations, delivery history
- Admin panel: users, economy, delivery settings, weather, maintenance, events, reports
- PWA install + Web Push (VAPID private key server-side only)

## Architecture

```text
User sends message
        ↓
Client validates UI + previews cost/ETA (reads system_settings)
        ↓
Client creates message + delivery rows (stamps via adjust_stamps RPC)
        ↓
Client animates journey / writes progress via update_delivery_progress
        ↓
At ETA: resolve_delivery (SECURITY DEFINER) rolls failure_probability,
        updates status, refunds, pigeon stats, notification
        ↓
Realtime + Home/Inbox resolve_overdue_deliveries_for_user
```

**Rule of thumb:** Admins control game rules via `system_settings`. Developers control implementation.

### Configurable settings (Admin → Settings)

| Key | Default | Purpose |
|-----|---------|---------|
| `failure_probability` | `0.005` | Delivery fail chance (0–1) |
| `time_multiplier` | `3600` | 1 = real time; 3600 = fast test |
| `pigeon_base_speed_mph` | `100` | Base flight speed (mph) |
| `km_per_stamp` | `10` | Distance per stamp |
| `min_stamp_cost` | `1` | Minimum paid send cost |
| `weather_modifiers` | JSON | Condition → speed multiplier |
| `daily_stamp_reward` | `1` | Daily claim amount |
| `signup_stamp_bonus` | `10` | Signup stamps |
| `rate_limit_max` | `5` | Max sends per window |
| `rate_limit_window_seconds` | `60` | Rate limit window |
| `sending_paused` | — | Blocks new sends when true |
| `maintenance_mode` / `maintenance_message` | — | Maintenance banner |

Stamp cost formula:

```text
cost = max(min_stamp_cost, ceil(distanceKm / km_per_stamp))
```

(Events may zero or reduce cost.)

## Tech stack

- **Frontend:** React 19 + Vite + TypeScript
- **Backend:** Supabase (Auth, Postgres, Realtime, RLS, Edge Functions)
- **Map:** Leaflet + OpenStreetMap
- **Weather:** Open-Meteo
- **Geocoding:** Nominatim

## Quick start

### 1. Install

```bash
cd TapTapAndAway
npm install
cp .env.example .env
# Fill VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, optional VITE_VAPID_PUBLIC_KEY
npm run dev
```

### 2. Supabase

1. Create a project.
2. Run SQL migrations in order under `supabase/migrations/` (`001` … `015`).
3. Deploy Edge Function `supabase/functions/send-push` and set secrets:
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (usually provided)
4. Optional: Database Webhook on `notifications` INSERT → invoke `send-push`.

### Migrations notes

- **004** + **004b**: conversation RPC. `004b` is a safe re-apply of the RPC only; keep both for fresh installs.
- **014**: introduces `km_per_stamp` (replaces hard-coded 70 km tier in app logic).
- **015**: `resolve_delivery`, overdue batch, progress RPC, `push_subscriptions`, hardened `adjust_stamps`, extra settings.

### 3. Build

```bash
npm run build
```

## PWA / Push

- Service worker: `public/sw.js` (cache `tta-shell-v2`, skips Supabase/API hosts).
- Public VAPID key only in frontend (`VITE_VAPID_PUBLIC_KEY`).
- Subscriptions stored in `push_subscriptions` via `upsert_push_subscription` / `delete_push_subscription`.
- See `docs/BACKGROUND_PUSH_SETUP.md` for operator steps.

## Security highlights

- RLS on core tables; admin checks use `profiles.is_admin` server-side.
- `adjust_stamps` restricts self-service types; admins use `admin_adjust_stamps` / `admin_set_stamps`.
- `resolve_delivery` is SECURITY DEFINER, participant-or-admin only, race-safe with row lock.
- VAPID private key and service role key never ship to the client.

## Deployment

Typical: Vercel (or any static host) for the Vite build + Supabase cloud.

Set environment variables on the host to match `.env.example`. After deploy, clients pick up the new service worker (`tta-shell-v2`) and replace the old cache.

## Troubleshooting

- **Stuck flying:** ensure migration 015 is applied; open Home/Inbox to run overdue resolution.
- **Wrong stamp cost:** check Admin `km_per_stamp` / `min_stamp_cost` (not legacy `stamp_cost_per_70km`).
- **Push silent:** confirm VAPID public in frontend, private in Edge secrets, and `push_subscriptions` rows exist.
- **Stale UI after deploy:** hard-refresh or wait for SW activate (old caches deleted on activate).
