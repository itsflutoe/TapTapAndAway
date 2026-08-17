import { useState } from 'react';
import { spriteUrl } from '../lib/pigeonAppearance';

interface Props {
  /** Saved pigeons.sprite_id e.g. basic-07 */
  spriteId?: string | null;
  size?: number;
  name?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Displays the pigeon's permanent sprite PNG.
 * On missing file → emoji fallback (does not re-roll sprite_id).
 */
export default function PigeonAvatar({ spriteId, size = 120, name, className, style }: Props) {
  const url = spriteUrl(spriteId);
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={className}
      title={spriteId || 'Pigeon'}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={name || spriteId || 'Pigeon'}
          width={size}
          height={size}
          onError={() => setFailed(true)}
          style={{
            objectFit: 'contain',
            imageRendering: 'pixelated',
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        />
      ) : (
        <span
          role="img"
          aria-label={name || 'Pigeon'}
          style={{ fontSize: size * 0.72, lineHeight: 1, display: 'block' }}
        >
          🐦
        </span>
      )}
    </div>
  );
}
