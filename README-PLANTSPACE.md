# PlantSpace MVP

The Render prototype remains the public live demonstration. The authenticated MVP uses Supabase Auth and Postgres; each account sees only its own plants, sensors, and history.

## Supabase setup (free tier)

1. Create a Supabase project on the free plan.
2. In SQL Editor, run `server/supabase/schema.sql`.
3. In Authentication settings, disable email confirmation for the requested immediate-login signup flow.
4. Add the Render URL and local development URL to Auth's allowed redirect URLs.
5. Set these Render environment variables. Do not commit or publish the secret key:
   - `SUPABASE_URL`: Project URL.
   - `SUPABASE_ANON_KEY`: publishable/anon key (safe to use in the browser; database RLS remains mandatory).
   - `SUPABASE_SERVICE_ROLE_KEY`: service-role secret, server only. Never prefix it with a public/client variable name.

The public prototype readings are stored separately in `prototype_readings`, so the demo survives Render restarts without exposing private account data. Login, signup, and private data require the Supabase keys and migrations.

## MVP behavior

- Public landing page shows the current ESP32 prototype reading and its persisted history.
- Signup asks for name, email, password, and international-format WhatsApp phone. WhatsApp delivery is not enabled in this MVP.
- Users create plants with name, species, location, and a suggested, editable moisture threshold.
- Private dashboard queries are scoped by authenticated user and reinforced with Supabase RLS.
- Alerts are shown in the dashboard. Low-moisture alerts are immediate; `alert_repeat_hours` defaults to 12 and is user configurable in the database. Email and WhatsApp sending are intentionally not configured.
- Sensor offline state is calculated after one hour without data.
- The schema includes sensor ownership and readings; per-user ESP32 ingestion must use a device key and server-side service-role credential before connecting real user sensors.
- Old sensor readings can be removed by running the optional `server/supabase/schedule_retention.sql` setup after the schema. The cleanup function is not executable by anon/authenticated clients.

## Deploy

Render does not receive any Supabase key from source control. Configure the three variables in the Render service dashboard, then manually deploy the GitHub commit. The current public demonstration endpoint remains `/api/status`; the original ESP32 ingestion remains `/api/readings` with the existing `API_KEY`.

For this MVP the sensor-ownership API is `/api/device/readings` with a unique `x-device-key`; the device key is stored hashed in Postgres. Pairing from the dashboard shows the raw key only once. To bind the ESP32, set `SERVIDOR_URL` to `https://umidade-esp32.onrender.com/api/device/readings`, add `#define DEVICE_KEY "..."` from the pairing dialog in the ignored `secrets.h`, then compile and upload. With no `DEVICE_KEY`, the firmware continues using the public prototype endpoint and `API_KEY`.

The signup asks for international phone format, for example `+5511999999999`. The number and notification preferences are stored, but no WhatsApp or email messages are sent until a provider and consent flow are configured.
