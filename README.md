# 🐦 Tap Tap and Away — Phase 1

**Every message takes a journey.**

A mobile-first messaging prototype where messages are delivered by virtual pigeons that fly between real-world registered addresses.

## Features (Phase 1)

- Username + password authentication (email hidden from users)
- Unique **Pigeon ID** (PID-XXXXXXXX) per account
- Address-based delivery with Nominatim geocoding
- Great-circle (Haversine) distance + Stamp cost tiers
- Open-Meteo weather affecting flight speed
- Interactive Leaflet map with animated pigeon flight
- Realtime inbox & delivery progress (Supabase Realtime)
- Stamp currency (signup bonus + daily reward)
- Friend system (search by username / PID)
- Delivery states: DISPATCHED → FLYING → DELIVERED / FAILED
- Low chance of fictional delivery failure + Stamp refund
- Admin panel with User Mode switch
- Store & future systems shown as Coming Soon
- Mobile-first iPhone-style UI

## Tech Stack

- **Frontend:** React 19 + Vite + TypeScript
- **Backend:** Supabase (Auth, Postgres, Realtime, RLS)
- **Map:** Leaflet + OpenStreetMap tiles
- **Weather:** Open-Meteo (free, no key)
- **Geocoding:** Nominatim / OpenStreetMap (free, no key)

## Quick Start

### 1. Clone & install

```bash
cd tap-tap-and-away
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a project.
2. In the SQL Editor, run the full contents of:

   `supabase/migrations/001_initial_schema.sql`

3. (Optional) Enable Realtime for tables: `messages`, `deliveries`, `notifications`  
   (Database → Replication → enable the tables).

### 3. Environment variables

Copy the example and fill in your project values:

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Find these under **Project Settings → API**.

### 4. Run locally

```bash
npm run dev
```

Open the URL shown (usually http://localhost:5173).

### 5. Create an admin user

1. Sign up normally through the app.
2. In Supabase → Table Editor → `profiles`, set `is_admin = true` for that user.
3. Sign out and sign back in — you will land in the Admin Panel.
4. Use **Enter User Mode** to experience the app as a normal user.

## Demo / Test Accounts

Create several accounts with different worldwide addresses, e.g.:

| Username | Suggested address              |
|----------|--------------------------------|
| kai      | Pandi, Bulacan, Philippines    |
| luna     | Tokyo, Japan                   |
| john     | New York, USA                  |
| maria    | São Paulo, Brazil              |

Add them as friends and send pigeons between long distances.

## How delivery timing works (Phase 1 testing)

- Base pigeon speed: **100 mph**
- Weather multiplies speed (clear 1.0 … storm 0.5)
- Real flight time is calculated, then divided by a **time multiplier** (default **3600**) so long-distance deliveries complete in seconds during development.
- Change the multiplier later in `system_settings` (`time_multiplier` → `1` for production-like timing).

## Project structure

```
tap-tap-and-away/
├── src/
│   ├── components/     # BottomNav, LoadingScreen, …
│   ├── pages/          # Home, Inbox, Send, Friends, Profile, Store, Admin, Delivery
│   ├── contexts/       # AuthContext
│   ├── services/       # messaging.ts
│   ├── lib/            # supabase, geo, utils
│   ├── types/
│   └── styles/
├── supabase/
│   └── migrations/     # 001_initial_schema.sql
├── .env.example
├── package.json
└── README.md
```

## Security notes

- Stamp changes go through the `adjust_stamps` Postgres function (SECURITY DEFINER).
- RLS is enabled on all tables.
- Never put the **service_role** key in the frontend.
- Username/password is mapped to an internal email (`username@taptap.internal`) so Supabase Auth works without exposing email to users.

## Future (architected, not implemented)

- Pigeon breeding / genetics
- Marketplace & trading
- Mini-games (Pigeon Grounds)
- Push notifications
- Advanced admin tools
- PWA install + offline polish

## License

Prototype — use freely for development and learning.
