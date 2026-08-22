export default function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="brand-mark">🐦</div>
      <div style={{ fontWeight: 800, fontSize: 18 }}>Tap Tap and Away</div>
      <div className="spinner" />
    </div>
  );
}
