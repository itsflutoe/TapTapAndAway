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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        zIndex: 100,
        background: 'rgba(0,0,0,0.45)',
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
          padding: 20,
          maxHeight: '85vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Report submitted</h2>
            <p style={{ color: '#666', fontSize: 14, marginBottom: 16 }}>
              Thanks. Admins will review @{reportedUsername}.
            </p>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 10,
                border: 'none',
                background: '#007AFF',
                color: '#fff',
                fontWeight: 600,
              }}
            >
              Done
            </button>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)}>
            <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Report @{reportedUsername}</h2>
            <p style={{ color: '#666', fontSize: 13, marginBottom: 14 }}>
              Choose a reason. False reports may affect your account.
            </p>

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
              rows={3}
              maxLength={500}
              placeholder="Anything admins should know…"
              style={{
                width: '100%',
                marginTop: 4,
                marginBottom: 12,
                padding: 10,
                borderRadius: 10,
                border: '1px solid #e5e5ea',
                fontSize: 14,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />

            {error && (
              <p style={{ color: '#c00', fontSize: 13, marginBottom: 10 }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #e5e5ea',
                  background: '#f2f2f7',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  border: 'none',
                  background: '#FF3B30',
                  color: '#fff',
                  fontWeight: 600,
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? 'Sending…' : 'Submit report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
