import { supabase } from '../lib/supabase';
import type {
  Pigeon,
  PigeonAbilityDef,
  PigeonDeliveryModifiers,
  PigeonPublicDetail,
  PigeonRarity,
} from '../types';

function parseJsonArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  }
  if (typeof value === 'string') {
    try {
      const p = JSON.parse(value) as unknown;
      return parseJsonArray(p);
    } catch {
      return [];
    }
  }
  return [];
}

export async function fetchPigeonRarities(): Promise<PigeonRarity[]> {
  const { data, error } = await supabase
    .from('pigeon_rarities')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as PigeonRarity[];
}

export async function fetchAbilityDefs(includeInactive = false): Promise<PigeonAbilityDef[]> {
  let q = supabase.from('pigeon_ability_defs').select('*').order('sort_order', { ascending: true });
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    ...(row as PigeonAbilityDef),
    effect_values: parseJsonArray((row as { effect_values: unknown }).effect_values),
    allowed_rarities: ((row as { allowed_rarities?: string[] }).allowed_rarities || []) as string[],
  }));
}

export async function getPigeonPublicDetail(
  pigeonId: string
): Promise<PigeonPublicDetail | null> {
  const { data, error } = await supabase.rpc('get_pigeon_public', {
    p_pigeon_id: pigeonId,
  });
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as PigeonPublicDetail;
}

export async function getPigeonDeliveryModifiers(
  pigeonId: string | null | undefined
): Promise<PigeonDeliveryModifiers> {
  const defaults: PigeonDeliveryModifiers = {
    speed_factor: 1,
    failure_factor: 1,
    weather_penalty_factor: 1,
    long_distance_factor: 1,
  };
  if (!pigeonId) return defaults;
  const { data, error } = await supabase.rpc('get_pigeon_delivery_modifiers', {
    p_pigeon_id: pigeonId,
  });
  if (error || !data) return defaults;
  const d = data as Record<string, unknown>;
  return {
    speed_factor: Number(d.speed_factor) || 1,
    failure_factor: Number(d.failure_factor) || 1,
    weather_penalty_factor: Number(d.weather_penalty_factor) || 1,
    long_distance_factor: Number(d.long_distance_factor) || 1,
  };
}

export async function fetchActivePigeonForUser(userId: string): Promise<Pigeon | null> {
  const { data } = await supabase
    .from('pigeons')
    .select('*')
    .eq('owner_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return (data as Pigeon) || null;
}

export function expProgressRatio(exp: number, expToNext: number): number {
  if (!expToNext || expToNext <= 0) return 1;
  return Math.max(0, Math.min(1, exp / expToNext));
}

/** Admin: list pigeons with optional search on name / owner */
export async function adminSearchPigeons(query: string, limit = 40): Promise<Pigeon[]> {
  let q = supabase
    .from('pigeons')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);
  const t = query.trim();
  if (t) {
    q = q.or(`name.ilike.%${t}%,rarity.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as Pigeon[];
}

export async function adminUpsertRarity(input: {
  key: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  ability_limit?: number;
  stat_potential?: number;
  is_enabled?: boolean;
  is_limited?: boolean;
  sort_order?: number;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_upsert_rarity', {
    p_key: input.key,
    p_name: input.name,
    p_description: input.description ?? '',
    p_color: input.color ?? '#94a3b8',
    p_icon: input.icon ?? '🐦',
    p_ability_limit: input.ability_limit ?? 0,
    p_stat_potential: input.stat_potential ?? 100,
    p_is_enabled: input.is_enabled ?? true,
    p_is_limited: input.is_limited ?? false,
    p_sort_order: input.sort_order ?? 0,
  });
  if (error) throw new Error(error.message);
}

export async function adminUpsertAbilityDef(
  input: Partial<PigeonAbilityDef> & { key: string; name: string }
): Promise<string> {
  const { data, error } = await supabase.rpc('admin_upsert_ability_def', {
    p_id: input.id ?? null,
    p_key: input.key,
    p_name: input.name,
    p_description: input.description ?? '',
    p_ability_type: input.ability_type ?? 'general',
    p_effect_key: input.effect_key ?? 'none',
    p_effect_values: input.effect_values ?? [5, 8, 12],
    p_max_level: input.max_level ?? 3,
    p_allowed_rarities: input.allowed_rarities ?? ['epic', 'legendary', 'mythical', 'custom'],
    p_stackable: input.stackable ?? false,
    p_applies_to_delivery: input.applies_to_delivery ?? true,
    p_applies_to_minigame: input.applies_to_minigame ?? false,
    p_is_active: input.is_active ?? true,
    p_sort_order: input.sort_order ?? 0,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function adminSetPigeonProgression(
  pigeonId: string,
  patch: {
    name?: string;
    rarity?: string;
    level?: number;
    exp?: number;
    speed?: number;
    stamina?: number;
    reliability?: number;
    accuracy?: number;
    endurance?: number;
    luck?: number;
    sprite_id?: string;
  }
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_pigeon_progression', {
    p_pigeon_id: pigeonId,
    p_name: patch.name ?? null,
    p_rarity: patch.rarity ?? null,
    p_level: patch.level ?? null,
    p_exp: patch.exp ?? null,
    p_speed: patch.speed ?? null,
    p_stamina: patch.stamina ?? null,
    p_reliability: patch.reliability ?? null,
    p_accuracy: patch.accuracy ?? null,
    p_endurance: patch.endurance ?? null,
    p_luck: patch.luck ?? null,
    p_sprite_id: patch.sprite_id ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function adminSetPigeonAbilities(
  pigeonId: string,
  abilities: { ability_id: string; ability_level: number }[]
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_pigeon_abilities', {
    p_pigeon_id: pigeonId,
    p_abilities: abilities,
  });
  if (error) throw new Error(error.message);
}
