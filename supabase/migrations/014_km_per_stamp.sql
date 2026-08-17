-- =====================================================
-- 014: stamp cost by km (km_per_stamp), replace 70km tier
-- =====================================================

INSERT INTO public.system_settings (key, value, description)
VALUES (
  'km_per_stamp',
  '10',
  'Kilometers of flight per 1 stamp (min cost still 1). Example: 10 → 15km costs 2 stamps.'
)
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description;

-- Keep old key for compatibility but app will prefer km_per_stamp
UPDATE public.system_settings
SET description = 'Deprecated: use km_per_stamp. Legacy tier every N km.'
WHERE key = 'stamp_cost_per_70km';

-- Let logged-in users read public economy / runtime settings (needed for send cost preview)
DROP POLICY IF EXISTS "Authenticated read public settings" ON public.system_settings;
CREATE POLICY "Authenticated read public settings" ON public.system_settings
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND key IN (
      'km_per_stamp',
      'stamp_cost_per_70km',
      'time_multiplier',
      'pigeon_base_speed_mph',
      'weather_modifiers',
      'sending_paused',
      'maintenance_mode',
      'maintenance_message',
      'daily_stamp_reward',
      'signup_stamp_bonus'
    )
  );
