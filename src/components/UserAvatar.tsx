interface Props {
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}

export default function UserAvatar({ name, src, size = 48, className = '' }: Props) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={`avatar-circle ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {src ? <img src={src} alt="" /> : initial}
    </div>
  );
}
