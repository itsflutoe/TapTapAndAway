export default function LoadingScreen() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f7',
      gap: 16,
    }}>
      <div style={{ fontSize: 48 }}>🐦</div>
      <div style={{ fontWeight: 600, color: '#6e6e73' }}>Tap Tap and Away</div>
      <div style={{
        width: 32,
        height: 32,
        border: '3px solid #e5e5ea',
        borderTopColor: '#0071e3',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
