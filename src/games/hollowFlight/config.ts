export interface HollowFlightConfig {
  enabled: boolean;
  title: string;
  description: string;
  maintenanceMessage: string;
  gameVersion: string;
  gravity: number;
  flapStrength: number;
  baseSpeed: number;
  startDifficulty: number;
  difficultyInterval: number;
  difficultySpeedMult: number;
  maxDifficulty: number;
  spawnInterval: number;
  gapMin: number;
  gapMax: number;
  gapReducePerDiff: number;
  obstacleWidth: number;
  scoreMultiplier: number;
  pickupStampValue: number;
  rewardsEnabled: boolean;
  maxRewardPerRun: number;
  statCap: number;
  leaderboardEnabled: boolean;
  assetBackground: string;
  assetObstacle: string;
  assetPickup: string;
}

export const DEFAULT_HF_CONFIG: HollowFlightConfig = {
  enabled: true,
  title: 'Hollow Flight',
  description: 'Fly. Dodge. Collect.',
  maintenanceMessage: '',
  gameVersion: '1',
  gravity: 0.45,
  flapStrength: 7.2,
  baseSpeed: 2.6,
  startDifficulty: 0,
  difficultyInterval: 10,
  difficultySpeedMult: 0.08,
  maxDifficulty: 12,
  spawnInterval: 1.55,
  gapMin: 120,
  gapMax: 175,
  gapReducePerDiff: 4,
  obstacleWidth: 52,
  scoreMultiplier: 1.5,
  pickupStampValue: 1,
  rewardsEnabled: true,
  maxRewardPerRun: 150,
  statCap: 30,
  leaderboardEnabled: true,
  assetBackground: '',
  assetObstacle: '',
  assetPickup: '',
};

/** Cap a pigeon stat for Hollow Flight only (does not mutate real stats). */
export function hfCapStat(value: number | null | undefined, cap: number): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(0, n), cap);
}

export interface HfStatMods {
  /** Multiplies gravity (lower = easier float). */
  gravityFactor: number;
  /** Multiplies flap strength. */
  flapFactor: number;
  /** Extra pickup collection radius px. */
  pickupRadiusBonus: number;
  /** Slight speed assist (very small). */
  speedFactor: number;
  /** Extra chance weight for stamp pickup spawn. */
  pickupSpawnBonus: number;
}

/** Balanced, skill-first modifiers from capped stats. */
export function computeHfStatMods(
  stats: {
    speed?: number | null;
    stamina?: number | null;
    reliability?: number | null;
    accuracy?: number | null;
    endurance?: number | null;
    luck?: number | null;
  },
  cap: number
): HfStatMods {
  const speed = hfCapStat(stats.speed, cap);
  const stamina = hfCapStat(stats.stamina, cap);
  const reliability = hfCapStat(stats.reliability, cap);
  const accuracy = hfCapStat(stats.accuracy, cap);
  const endurance = hfCapStat(stats.endurance, cap);
  const luck = hfCapStat(stats.luck, cap);

  // Normalize 0–30 → mild 0–1
  const n = (v: number) => v / Math.max(1, cap);

  return {
    gravityFactor: 1 - n(stamina) * 0.08 - n(endurance) * 0.04,
    flapFactor: 1 + n(speed) * 0.06 + n(endurance) * 0.03,
    pickupRadiusBonus: n(accuracy) * 10,
    speedFactor: 1 + n(speed) * 0.03 - n(reliability) * 0.01,
    pickupSpawnBonus: n(luck) * 0.12,
  };
}
