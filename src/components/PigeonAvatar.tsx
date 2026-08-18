import { useEffect, useState } from 'react';
import { getSpriteMeta } from '../lib/pigeonAppearance';

interface Props {
  /** Saved pigeons.sprite_id e.g. basic-07 or custom-01 */
  spriteId?: string | null;
  size?: number;
  name?: string;
  className?: string;
  style?: React.CSSProperties;
  /** When false, sheets show frame 0 only (e.g. tiny list icons). Default true. */
  animate?: boolean;
}

/**
 * Displays the pigeon's permanent sprite.
 * - Static PNG: single <img>, pixelated, transparent BG preserved.
 * - Registered sheet: horizontal frames, one frame at a time, CSS background (no color-keying).
 * Missing file → emoji fallback (does not re-roll sprite_id).
 */
export default function PigeonAvatar({
  spriteId,
  size = 120,
  name,
  className,
  style,
  animate = true,
}: Props) {
  const meta = getSpriteMeta(spriteId);
  const [failed, setFailed] = useState(false);

  // Reset failure when sprite changes
  useEffect(() => {
    setFailed(false);
  }, [spriteId, meta?.url]);

  const box: React.CSSProperties = {
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...style,
  };

  if (!meta || failed) {
    return (
      <div className={className} title={spriteId || 'Pigeon'} style={box}>
        <span
          role="img"
          aria-label={name || 'Pigeon'}
          style={{ fontSize: size * 0.72, lineHeight: 1, display: 'block' }}
        >
          🐦
        </span>
      </div>
    );
  }

  if (meta.kind === 'sheet' && animate) {
    return (
      <div className={className} title={spriteId || 'Pigeon'} style={box}>
        <SheetPigeon
          url={meta.url}
          frames={meta.frames}
          fps={meta.fps}
          size={size}
          name={name || spriteId || 'Pigeon'}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  // Static PNG, or sheet with animate=false (show via img; sheet may look wide — prefer SheetPigeon frame 0)
  if (meta.kind === 'sheet' && !animate) {
    return (
      <div className={className} title={spriteId || 'Pigeon'} style={box}>
        <SheetPigeon
          url={meta.url}
          frames={meta.frames}
          fps={meta.fps}
          size={size}
          name={name || spriteId || 'Pigeon'}
          onError={() => setFailed(true)}
          frozen
        />
      </div>
    );
  }

  return (
    <div className={className} title={spriteId || 'Pigeon'} style={box}>
      <img
        src={meta.url}
        alt={name || spriteId || 'Pigeon'}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        draggable={false}
        style={{
          objectFit: 'contain',
          imageRendering: 'pixelated',
          maxWidth: '100%',
          maxHeight: '100%',
          // Never treat light pixels as transparent — browser uses PNG alpha only
        }}
      />
    </div>
  );
}

function SheetPigeon({
  url,
  frames,
  fps,
  size,
  name,
  onError,
  frozen = false,
}: {
  url: string;
  frames: number;
  fps: number;
  size: number;
  name: string;
  onError: () => void;
  frozen?: boolean;
}) {
  const [frame, setFrame] = useState(0);
  const [dims, setDims] = useState<{ fw: number; fh: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const fw = img.naturalWidth / frames;
      const fh = img.naturalHeight;
      if (!(fw > 0 && fh > 0 && Number.isFinite(fw))) {
        onError();
        return;
      }
      setDims({ fw, fh });
    };
    img.onerror = () => {
      if (!cancelled) onError();
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, frames, onError]);

  useEffect(() => {
    if (frozen || !dims) return;
    const ms = Math.max(50, Math.round(1000 / fps));
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % frames);
    }, ms);
    return () => window.clearInterval(id);
  }, [frozen, dims, fps, frames]);

  if (!dims) {
    // Reserve space while loading (no layout jump)
    return <div style={{ width: size, height: size }} aria-hidden />;
  }

  const scale = Math.min(size / dims.fw, size / dims.fh);
  const displayW = dims.fw * scale;
  const displayH = dims.fh * scale;
  const sheetW = dims.fw * frames * scale;

  return (
    <div
      role="img"
      aria-label={name}
      style={{
        width: displayW,
        height: displayH,
        overflow: 'hidden',
        // Clip to one frame; center inside parent flex box
      }}
    >
      <div
        style={{
          width: displayW,
          height: displayH,
          backgroundImage: `url(${url})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: `${sheetW}px ${displayH}px`,
          backgroundPosition: `-${frame * displayW}px 0`,
          imageRendering: 'pixelated',
          // PNG alpha only — no chroma key / white knockout
        }}
      />
    </div>
  );
}
