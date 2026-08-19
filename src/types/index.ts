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
  tutorial_completed: boolean;
  last_seen_at?: string | null;
  created_at: string;
  updated_at: string;
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
  rarity: string;
  is_active: boolean;
  total_distance_km?: number;
  total_flights?: number;
  successful_flights?: number;
  created_at: string;
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
