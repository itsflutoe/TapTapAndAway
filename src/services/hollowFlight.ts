import { supabase } from '../lib/supabase';
import {
  DEFAULT_HF_CONFIG,
  type HollowFlightConfig,
} from '../games/hollowFlight/config';

function parseSetting(raw: unknown, fallback: string): string {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }
    return t;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  try {
    return String(raw);
  } catch {
    return fallback;
  }
}

function num(map: Record<string, unknown>, key: string, fallback: number): number {
  const v = map[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  // JSONB may arrive already unquoted
  const s = parseSetting(v, String(fallback));
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function bool(map: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = map[key];
  if (typeof v === 'boolean') return v;
  const s = parseSetting(v, String(fallback)).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return fallback;
}

export async function loadHollowFlightConfig(): Promise<HollowFlightConfig> {
  const { data } = await supabase.from('system_settings').select('key, value');
  const map: Record<string, unknown> = {};
  (data || []).forEach((row: { key: string; value: unknown }) => {
    map[row.key] = row.value;
  });

  const d = DEFAULT_HF_CONFIG;
  return {
    enabled: bool(map, 'hf_enabled', d.enabled),
    title: parseSetting(map['hf_title'], d.title) || d.title,
    description: parseSetting(map['hf_description'], d.description) || d.description,
    maintenanceMessage: parseSetting(map['hf_maintenance_message'], d.maintenanceMessage),
    gameVersion: parseSetting(map['hf_game_version'], d.gameVersion) || d.gameVersion,
    gravity: num(map, 'hf_gravity', d.gravity),
    flapStrength: num(map, 'hf_flap_strength', d.flapStrength),
    baseSpeed: num(map, 'hf_base_speed', d.baseSpeed),
    startDifficulty: num(map, 'hf_start_difficulty', d.startDifficulty),
    difficultyInterval: num(map, 'hf_difficulty_interval', d.difficultyInterval),
    difficultySpeedMult: num(map, 'hf_difficulty_speed_mult', d.difficultySpeedMult),
    maxDifficulty: num(map, 'hf_max_difficulty', d.maxDifficulty),
    spawnInterval: num(map, 'hf_spawn_interval', d.spawnInterval),
    gapMin: num(map, 'hf_gap_min', d.gapMin),
    gapMax: num(map, 'hf_gap_max', d.gapMax),
    gapReducePerDiff: num(map, 'hf_gap_reduce_per_diff', d.gapReducePerDiff),
    obstacleWidth: num(map, 'hf_obstacle_width', d.obstacleWidth),
    scoreMultiplier: num(map, 'hf_score_multiplier', d.scoreMultiplier),
    pickupStampValue: num(map, 'hf_pickup_stamp_value', d.pickupStampValue),
    rewardsEnabled: bool(map, 'hf_rewards_enabled', d.rewardsEnabled),
    maxRewardPerRun: num(map, 'hf_max_reward_per_run', d.maxRewardPerRun),
    statCap: num(map, 'hf_stat_cap', d.statCap),
    leaderboardEnabled: bool(map, 'hf_leaderboard_enabled', d.leaderboardEnabled),
    assetBackground: parseSetting(map['hf_asset_background'], d.assetBackground),
    assetObstacle: parseSetting(map['hf_asset_obstacle'], d.assetObstacle),
    assetPickup: parseSetting(map['hf_asset_pickup'], d.assetPickup),
  };
}

export async function startHollowFlightSession(): Promise<{
  session_id: string;
  pigeon_id: string;
  pigeon_name: string;
  game_version: string;
}> {
  const { data, error } = await supabase.rpc('start_hollow_flight_session');
  if (error) throw error;
  return data as {
    session_id: string;
    pigeon_id: string;
    pigeon_name: string;
    game_version: string;
  };
}

export async function submitHollowFlightRun(params: {
  sessionId: string;
  score: number;
  pickups: number;
  durationMs: number;
}): Promise<{
  run_id: string;
  score: number;
  pickups: number;
  stamps_earned: number;
  best_score: number;
  stamp_balance: number;
}> {
  const { data, error } = await supabase.rpc('submit_hollow_flight_run', {
    p_session_id: params.sessionId,
    p_score: params.score,
    p_pickups: params.pickups,
    p_duration_ms: params.durationMs,
  });
  if (error) throw error;
  return data as {
    run_id: string;
    score: number;
    pickups: number;
    stamps_earned: number;
    best_score: number;
    stamp_balance: number;
  };
}

export async function getHollowFlightMyStats(): Promise<{
  best_score: number;
  total_games: number;
  total_score: number;
  total_stamps_earned: number;
  best_pickups: number;
}> {
  const { data, error } = await supabase.rpc('get_hollow_flight_my_stats');
  if (error) throw error;
  return data as {
    best_score: number;
    total_games: number;
    total_score: number;
    total_stamps_earned: number;
    best_pickups: number;
  };
}

export interface LeaderboardRow {
  user_id?: string;
  score: number;
  pickups?: number;
  stamps_earned?: number;
  pigeon_name?: string;
  created_at?: string;
  username?: string;
  display_name?: string;
}

export async function getHollowFlightLeaderboard(
  scope: 'global' | 'friends' | 'personal',
  limit = 25
): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc('get_hollow_flight_leaderboard', {
    p_scope: scope,
    p_limit: limit,
  });
  if (error) throw error;
  return (data as LeaderboardRow[]) || [];
}
