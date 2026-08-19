/** Mini-game catalog for the Home launcher. Add entries here for new games. */
export interface GameCatalogEntry {
  id: string;
  title: string;
  emoji: string;
  tagline: string;
  path: string;
  /** system_settings key for enable flag (optional) */
  enabledSettingKey?: string;
}

export const GAME_CATALOG: GameCatalogEntry[] = [
  {
    id: 'hollow-flight',
    title: 'Hollow Flight',
    emoji: '🐦',
    tagline: 'Fly. Dodge. Collect.',
    path: '/games/hollow-flight',
    enabledSettingKey: 'hf_enabled',
  },
];
