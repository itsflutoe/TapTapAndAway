export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export type PigeonGender = 'male' | 'female';
export type FriendshipStatus = 'pending' | 'accepted' | 'rejected' | 'blocked';
export type DeliveryStatus =
  | 'DRAFT'
  | 'PREPARING'
  | 'DISPATCHED'
  | 'FLYING'
  | 'ARRIVED'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  pigeon_id: string;
  gender: Gender;
  address: string;
  latitude: number | null;
  longitude: number | null;
  avatar_url: string | null;
  stamp_balance: number;
  is_banned: boolean;
  is_admin: boolean;
  active_pigeon_id?: string | null;
  tutorial_completed: boolean;
  last_seen_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type PigeonRarityKey =
  | 'basic'
  | 'common'
  | 'epic'
  | 'legendary'
  | 'mythical'
  | 'custom'
  | string;

export interface PigeonRarity {
  key: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  ability_limit: number;
  stat_potential: number;
  is_enabled: boolean;
  is_limited: boolean;
  sort_order: number;
}

export interface PigeonAbilityDef {
  id: string;
  key: string;
  name: string;
  description: string;
  ability_type: string;
  effect_key: string;
  effect_values: number[];
  max_level: number;
  allowed_rarities: string[];
  stackable: boolean;
  applies_to_delivery: boolean;
  applies_to_minigame: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface PigeonAbilityInstance {
  id?: string;
  ability_id: string;
  key?: string;
  name?: string;
  description?: string;
  ability_type?: string;
  effect_key?: string;
  effect_value?: number;
  ability_level: number;
  max_level?: number;
  applies_to_delivery?: boolean;
  applies_to_minigame?: boolean;
}

export interface PigeonStats {
  speed: number;
  stamina: number;
  reliability: number;
  accuracy: number;
  endurance: number;
  luck: number;
}

export interface Pigeon {
  id: string;
  owner_id: string;
  name: string;
  gender: PigeonGender;
  species: string;
  /** Artwork id e.g. basic-07 — NOT profiles.pigeon_id */
  sprite_id: string | null;
  speed: number;
  stamina: number;
  reliability: number;
  accuracy: number;
  endurance: number;
  luck: number;
  rarity: PigeonRarityKey;
  level: number;
  exp: number;
  is_active: boolean;
  total_distance_km?: number;
  total_flights?: number;
  successful_flights?: number;
  created_at: string;
  updated_at?: string;
}

/** Payload from get_pigeon_public RPC */
export interface PigeonPublicDetail {
  id: string;
  owner_id: string;
  name: string;
  gender: string | null;
  sprite_id: string | null;
  rarity: string;
  rarity_meta: {
    key: string;
    name: string;
    color: string;
    icon: string;
    ability_limit: number;
    description: string;
  } | null;
  level: number;
  exp: number;
  exp_to_next: number;
  stats: PigeonStats;
  abilities: PigeonAbilityInstance[];
  total_distance_km?: number;
  total_flights?: number;
  successful_flights?: number;
}

export interface PigeonDeliveryModifiers {
  speed_factor: number;
  failure_factor: number;
  weather_penalty_factor: number;
  long_distance_factor: number;
}

export interface Friendship {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: FriendshipStatus;
  created_at: string;
  requester?: Profile;
  receiver?: Profile;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  stamp_cost: number;
  created_at: string;
  read_at: string | null;
  sender?: Profile;
  receiver?: Profile;
  delivery?: Delivery;
}

export interface Delivery {
  id: string;
  message_id: string;
  pigeon_id: string | null;
  origin_latitude: number;
  origin_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
  distance_km: number;
  base_speed_mph: number;
  modified_speed_mph: number;
  weather: string | null;
  weather_multiplier: number;
  estimated_duration_seconds: number;
  actual_departure: string | null;
  actual_arrival: string | null;
  status: DeliveryStatus;
  failure_reason: string | null;
  progress_percent: number;
  created_at: string;
  updated_at: string;
}

export interface StampTransaction {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: string;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export interface SystemSettings {
  pigeon_base_speed_mph: number;
  failure_probability: number;
  time_multiplier: number;
  daily_stamp_reward: number;
  signup_stamp_bonus: number;
  weather_modifiers: Record<string, number>;
  /** @deprecated use km_per_stamp */
  stamp_cost_per_70km: number;
  km_per_stamp: number;
  min_stamp_cost: number;
  rate_limit_max: number;
  rate_limit_window_seconds: number;
  min_delivery_seconds: number;
  max_delivery_seconds: number;
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  display_name: string;
}

export interface WeatherInfo {
  condition: string;
  multiplier: number;
  description: string;
}
