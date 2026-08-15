import { useState } from 'react';
import { supabase } from '../lib/supabase';

export const REPORT_REASONS = [
  { id: 'spam', label: 'Spam / unwanted messages' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'scam', label: 'Scam or fraud' },
  { id: 'impersonation', label: 'Impersonation' },
  { id: 'other', label: 'Other' },
] as const;

interface Props {
  reportedUserId: string;
  reportedUsername: string;
  messageId?: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
}

export default function ReportModal({
  reportedUserId,
  reportedUsername,
  messageId,
  onClose,
  onSubmitted,
}: Props) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].id);
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError('');
    const { error: err } = await supabase.rpc('submit_user_report', {
      p_reported_user_id: reportedUserId,
      p_reason: reason,
      p_details: details.trim() || null,
      p_message_id: messageId || null,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    onSubmitted?.();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: '16px 16px 0 0',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div style={{ padding: 20 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Report submitted</h2>
            <p style={{ color: '#666', fontSize: 14, marginBottom: 16 }}>
              Thanks. Admins will review @{reportedUsername}.
            </p>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 12,
                border: 'none',
                background: '#007AFF',
                color: '#fff',
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Report @{reportedUsername}</h2>
              <p style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
                Choose a reason, then tap Submit report.
              </p>
            </div>

            <div style={{ padding: '0 20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {REPORT_REASONS.map((r) => (
                  <label
                    key={r.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: reason === r.id ? '2px solid #007AFF' : '1px solid #e5e5ea',
                      background: reason === r.id ? '#f0f7ff' : '#fff',
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={r.id}
                      checked={reason === r.id}
                      onChange={() => setReason(r.id)}
                    />
                    {r.label}
                  </label>
                ))}
              </div>

              <label style={{ fontSize: 12, color: '#666' }}>Details (optional)</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Anything admins should know…"
                style={{
                  width: '100%',
                  marginTop: 4,
                  marginBottom: 8,
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid #e5e5ea',
                  fontSize: 14,
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />

              {error && (
                <p style={{ color: '#c00', fontSize: 13, marginBottom: 8 }}>{error}</p>
              )}
            </div>

            {/* Sticky action bar — always visible above bottom nav */}
            <div
              style={{
                flexShrink: 0,
                padding: '12px 20px',
                paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
                borderTop: '1px solid #eee',
                background: '#fff',
                display: 'flex',
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid #e5e5ea',
                  background: '#f2f2f7',
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void submit()}
                style={{
                  flex: 1.2,
                  padding: 14,
                  borderRadius: 12,
                  border: 'none',
                  background: '#FF3B30',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 15,
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? 'Sending…' : 'Submit report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
