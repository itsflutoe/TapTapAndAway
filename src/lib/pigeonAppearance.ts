/** Basic starter sprites (Phase 1). Pigeon ID ≠ sprite_id. */

export const BASIC_SPRITE_IDS = [
  'basic-01',
  'basic-02',
  'basic-03',
  'basic-04',
  'basic-05',
  'basic-06',
  'basic-07',
  'basic-08',
  'basic-09',
] as const;

export type BasicSpriteId = (typeof BASIC_SPRITE_IDS)[number];

export function isBasicSpriteId(id: string | null | undefined): id is BasicSpriteId {
  return !!id && (BASIC_SPRITE_IDS as readonly string[]).includes(id);
}

/**
 * Animated sprite-sheet registry (client-side only — no DB change).
 * Keys are sprite_id values already stored on pigeons.
 * Sheets are horizontal frame strips; each frame is equal width.
 *
 * Example:
 *   'custom-01': { frames: 4, fps: 8 }
 *   → loads /pigeons/custom/custom-01.png as a 4-frame sheet
 *
 * Sprites not listed here are treated as static single-frame PNGs.
 */
export type AnimatedSpriteConfig = {
  /** Number of equal-width frames left-to-right */
  frames: number;
  /** Frames per second (default 6) */
  fps?: number;
  /** Optional path override; default is spriteUrl(spriteId) */
  src?: string;
};

export const ANIMATED_SPRITES: Record<string, AnimatedSpriteConfig> = {
  /** Pink pigeon sheet: 2048×128 → 16 frames of 128×128 */
  'custom-01': { frames: 16, fps: 8 },
};

export type SpriteMeta =
  | { kind: 'static'; url: string }
  | { kind: 'sheet'; url: string; frames: number; fps: number };

/** Public URL for a stored sprite_id. Future: store/, rare/, event/ folders. */
export function spriteUrl(spriteId: string | null | undefined): string | null {
  if (!spriteId || !spriteId.trim()) return null;
  const id = spriteId.trim();
  if (id.startsWith('basic-')) {
    return `/pigeons/basic/${id}.png`;
  }
  const dash = id.indexOf('-');
  if (dash > 0) {
    const folder = id.slice(0, dash);
    return `/pigeons/${folder}/${id}.png`;
  }
  return `/pigeons/basic/${id}.png`;
}

/** Resolve how to render a sprite_id (static PNG vs horizontal sheet). */
export function getSpriteMeta(spriteId: string | null | undefined): SpriteMeta | null {
  if (!spriteId || !spriteId.trim()) return null;
  const id = spriteId.trim();
  const anim = ANIMATED_SPRITES[id];
  const url = anim?.src || spriteUrl(id);
  if (!url) return null;
  if (anim && anim.frames > 1) {
    return {
      kind: 'sheet',
      url,
      frames: Math.max(2, Math.floor(anim.frames)),
      fps: anim.fps && anim.fps > 0 ? anim.fps : 6,
    };
  }
  return { kind: 'static', url };
}

export function pickRandomBasicSpriteId(): BasicSpriteId {
  const i = Math.floor(Math.random() * BASIC_SPRITE_IDS.length);
  return BASIC_SPRITE_IDS[i];
}

export function spriteLabel(spriteId: string | null | undefined): string {
  if (!spriteId) return '—';
  return spriteId;
}

/** Whether this sprite_id is registered as an animated sheet. */
export function isAnimatedSprite(spriteId: string | null | undefined): boolean {
  if (!spriteId) return false;
  const cfg = ANIMATED_SPRITES[spriteId.trim()];
  return !!cfg && cfg.frames > 1;
}
