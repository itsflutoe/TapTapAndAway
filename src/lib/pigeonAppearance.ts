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

export function pickRandomBasicSpriteId(): BasicSpriteId {
  const i = Math.floor(Math.random() * BASIC_SPRITE_IDS.length);
  return BASIC_SPRITE_IDS[i];
}

export function spriteLabel(spriteId: string | null | undefined): string {
  if (!spriteId) return '—';
  return spriteId;
}
