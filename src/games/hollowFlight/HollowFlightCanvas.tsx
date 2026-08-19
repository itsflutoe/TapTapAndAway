import { useEffect, useRef } from 'react';
import type { HollowFlightConfig, HfStatMods } from './config';
import { spriteUrl, ANIMATED_SPRITES } from '../../lib/pigeonAppearance';

export type CanvasPhase = 'ready' | 'playing' | 'dying' | 'dead';

export interface RunResult {
  score: number;
  pickups: number;
  durationMs: number;
}

interface Props {
  config: HollowFlightConfig;
  mods: HfStatMods;
  spriteId: string | null | undefined;
  pigeonName: string;
  phase: CanvasPhase;
  onPhaseChange: (p: CanvasPhase) => void;
  onScore: (score: number, pickups: number) => void;
  onRunEnd: (result: RunResult) => void;
  /** Increment to force full reset (play again) */
  resetToken: number;
}

interface Obstacle {
  x: number;
  gapY: number;
  gapH: number;
  w: number;
  passed: boolean;
  hasPickup: boolean;
  pickupTaken: boolean;
}

interface Bird {
  y: number;
  vy: number;
  r: number;
}

export default function HollowFlightCanvas({
  config,
  mods,
  spriteId,
  pigeonName,
  phase,
  onPhaseChange,
  onScore,
  onRunEnd,
  resetToken,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<CanvasPhase>(phase);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const sheetRef = useRef<{ frames: number; fps: number } | null>(null);

  // Mutable sim state (not React state — avoids per-frame re-renders)
  const sim = useRef({
    bird: { y: 0, vy: 0, r: 16 } as Bird,
    obstacles: [] as Obstacle[],
    score: 0,
    pickups: 0,
    difficulty: 0,
    spawnAcc: 0,
    runStart: 0,
    dieUntil: 0,
    w: 360,
    h: 520,
    groundY: 500,
    frame: 0,
  });

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Load sprite
  useEffect(() => {
    const url = spriteUrl(spriteId);
    sheetRef.current = null;
    imgRef.current = null;
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const anim = spriteId ? ANIMATED_SPRITES[spriteId] : undefined;
      if (anim) sheetRef.current = { frames: anim.frames, fps: anim.fps ?? 8 };
    };
    img.onerror = () => {
      imgRef.current = null;
    };
    img.src = url;
  }, [spriteId]);

  // Resize
  useEffect(() => {
    const el = wrapRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    const resize = () => {
      const rect = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(280, Math.floor(rect.width));
      const h = Math.max(360, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sim.current.w = w;
      sim.current.h = h;
      sim.current.groundY = h - 28;
      if (phaseRef.current === 'ready') {
        sim.current.bird.y = h * 0.42;
        sim.current.bird.vy = 0;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const resetSim = () => {
    const s = sim.current;
    s.bird.y = s.h * 0.42;
    s.bird.vy = 0;
    s.obstacles = [];
    s.score = 0;
    s.pickups = 0;
    s.difficulty = config.startDifficulty;
    s.spawnAcc = 0;
    s.runStart = 0;
    s.dieUntil = 0;
    s.frame = 0;
    onScore(0, 0);
  };

  useEffect(() => {
    resetSim();
    onPhaseChange('ready');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  const flap = () => {
    const p = phaseRef.current;
    if (p === 'dead' || p === 'dying') return;
    if (p === 'ready') {
      sim.current.runStart = performance.now();
      onPhaseChange('playing');
      phaseRef.current = 'playing';
    }
    if (phaseRef.current === 'playing') {
      sim.current.bird.vy = -config.flapStrength * mods.flapFactor;
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      flap();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        flap();
      }
    };
    canvas.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      canvas.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.flapStrength, mods.flapFactor]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const spawnObstacle = () => {
      const s = sim.current;
      const diff = Math.min(s.difficulty, config.maxDifficulty);
      const gapH = Math.max(
        config.gapMin,
        config.gapMax - diff * config.gapReducePerDiff
      );
      const margin = 40;
      const gapY =
        margin + Math.random() * Math.max(20, s.groundY - gapH - margin * 2);
      const pickupChance = 0.55 + mods.pickupSpawnBonus;
      s.obstacles.push({
        x: s.w + 10,
        gapY,
        gapH,
        w: config.obstacleWidth,
        passed: false,
        hasPickup: Math.random() < pickupChance,
        pickupTaken: false,
      });
    };

    const tick = (now: number) => {
      const dt = Math.min(32, now - last) / 16.67; // normalize ~60fps
      last = now;
      const s = sim.current;
      s.frame += 1;
      const p = phaseRef.current;

      if (p === 'playing') {
        const diff = Math.min(
          config.maxDifficulty,
          config.startDifficulty +
            Math.floor(s.score / Math.max(1, config.difficultyInterval))
        );
        s.difficulty = diff;
        const speed =
          config.baseSpeed *
          (1 + diff * config.difficultySpeedMult) *
          mods.speedFactor;

        // Physics
        s.bird.vy += config.gravity * mods.gravityFactor * dt;
        s.bird.y += s.bird.vy * dt;

        // Spawn
        s.spawnAcc += dt / 60;
        const interval = Math.max(0.85, config.spawnInterval - diff * 0.04);
        if (s.spawnAcc >= interval) {
          s.spawnAcc = 0;
          spawnObstacle();
        }

        // Move obstacles
        for (const o of s.obstacles) {
          o.x -= speed * dt * 1.7;
        }
        s.obstacles = s.obstacles.filter((o) => o.x + o.w > -40);

        // Score + pickups
        const bx = s.w * 0.28;
        const by = s.bird.y;
        const br = s.bird.r;
        for (const o of s.obstacles) {
          if (!o.passed && o.x + o.w < bx - br) {
            o.passed = true;
            s.score += 1;
            onScore(s.score, s.pickups);
          }
          if (o.hasPickup && !o.pickupTaken) {
            const px = o.x + o.w / 2;
            const py = o.gapY + o.gapH / 2;
            const pr = 12 + mods.pickupRadiusBonus;
            const dx = bx - px;
            const dy = by - py;
            if (dx * dx + dy * dy < (br + pr) * (br + pr)) {
              o.pickupTaken = true;
              s.pickups += 1;
              onScore(s.score, s.pickups);
            }
          }
        }

        // Collisions
        let hit = false;
        if (by + br > s.groundY || by - br < 0) hit = true;
        for (const o of s.obstacles) {
          if (bx + br > o.x && bx - br < o.x + o.w) {
            if (by - br < o.gapY || by + br > o.gapY + o.gapH) {
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          phaseRef.current = 'dying';
          onPhaseChange('dying');
          s.dieUntil = now + 650;
          s.bird.vy = 3;
        }
      } else if (p === 'dying') {
        s.bird.vy += config.gravity * 1.2 * dt;
        s.bird.y += s.bird.vy * dt;
        if (now >= s.dieUntil || s.bird.y > s.h + 40) {
          phaseRef.current = 'dead';
          onPhaseChange('dead');
          const durationMs = s.runStart ? Math.round(now - s.runStart) : 0;
          onRunEnd({ score: s.score, pickups: s.pickups, durationMs });
        }
      }

      // ---- render ----
      const w = s.w;
      const h = s.h;
      // Sky
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      if (config.assetBackground === 'dusk') {
        bg.addColorStop(0, '#2c1810');
        bg.addColorStop(0.5, '#6b3a2a');
        bg.addColorStop(1, '#1a1f29');
      } else {
        bg.addColorStop(0, '#87c5f5');
        bg.addColorStop(0.55, '#c8e6f8');
        bg.addColorStop(1, '#e8f4e0');
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Soft hills
      ctx.fillStyle = 'rgba(80,140,90,0.25)';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.72);
      for (let x = 0; x <= w; x += 20) {
        ctx.lineTo(x, h * 0.72 + Math.sin(x * 0.02 + s.frame * 0.01) * 8);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();

      // Obstacles (branches / beams)
      for (const o of s.obstacles) {
        const topH = o.gapY;
        const botY = o.gapY + o.gapH;
        const botH = s.groundY - botY;
        if (config.assetObstacle === 'wire') {
          ctx.strokeStyle = '#4a5568';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(o.x + o.w / 2, 0);
          ctx.lineTo(o.x + o.w / 2, topH);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(o.x + o.w / 2, botY);
          ctx.lineTo(o.x + o.w / 2, s.groundY);
          ctx.stroke();
        } else {
          // wooden beams
          ctx.fillStyle = '#6b4423';
          ctx.fillRect(o.x, 0, o.w, topH);
          ctx.fillRect(o.x, botY, o.w, botH);
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(o.x - 4, topH - 14, o.w + 8, 14);
          ctx.fillRect(o.x - 4, botY, o.w + 8, 14);
        }
        if (o.hasPickup && !o.pickupTaken) {
          const px = o.x + o.w / 2;
          const py = o.gapY + o.gapH / 2;
          ctx.font = '18px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🪙', px, py + Math.sin(s.frame * 0.12) * 3);
        }
      }

      // Ground
      ctx.fillStyle = '#5a8f3c';
      ctx.fillRect(0, s.groundY, w, h - s.groundY);
      ctx.fillStyle = '#3d6b28';
      ctx.fillRect(0, s.groundY, w, 4);

      // Bird
      const bx = w * 0.28;
      const by = s.bird.y;
      const img = imgRef.current;
      const sheet = sheetRef.current;
      if (img && img.complete) {
        const size = 40;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(Math.min(0.6, Math.max(-0.5, s.bird.vy * 0.05)));
        if (sheet) {
          const fw = img.width / sheet.frames;
          const fi = Math.floor((s.frame / Math.max(1, 60 / sheet.fps)) % sheet.frames);
          ctx.drawImage(img, fi * fw, 0, fw, img.height, -size / 2, -size / 2, size, size);
        } else {
          ctx.drawImage(img, -size / 2, -size / 2, size, size);
        }
        ctx.restore();
      } else {
        ctx.font = '32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🐦', bx, by);
      }

      // Ready overlay text is handled by parent UI

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, mods]);

  return (
    <div
      ref={wrapRef}
      style={{
        width: '100%',
        flex: 1,
        minHeight: 360,
        position: 'relative',
        touchAction: 'none',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#1a1f29',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        aria-label={`${pigeonName} Hollow Flight`}
      />
    </div>
  );
}
