"use client";

import { useState } from 'react';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export default function A2AOptInForm() {
  const [domain, setDomain] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<FormState>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setError(null);

    try {
      const res = await fetch('/api/a2a/crawler-opt-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          contact,
          message,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('error');
        setError(typeof data?.error === 'string' ? data.error : 'Submission failed.');
        return;
      }
      setStatus('success');
      setDomain('');
      setContact('');
      setMessage('');
    } catch (err: any) {
      setStatus('error');
      setError(err?.message ?? 'Submission failed.');
    }
  }

  return (
    <form className="optin-form" onSubmit={handleSubmit}>
      <label>
        Domain
        <input
          type="url"
          required
          placeholder="https://example.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          disabled={status === 'submitting'}
        />
      </label>
      <label>
        Contact (email or URL, optional)
        <input
          type="text"
          placeholder="you@example.com"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          disabled={status === 'submitting'}
          maxLength={200}
        />
      </label>
      <label>
        Notes (optional)
        <textarea
          placeholder="Anything we should know about your agent?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={status === 'submitting'}
          maxLength={2000}
          rows={4}
        />
      </label>
      <button type="submit" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Submitting…' : 'Request inclusion'}
      </button>
      {status === 'success' && (
        <p className="success">Thanks! We’ll reach out once you’re added.</p>
      )}
      {status === 'error' && error && <p className="error">{error}</p>}
      <style jsx>{`
        .optin-form {
          display: grid;
          gap: 12px;
          margin-top: 12px;
        }
        label {
          display: grid;
          gap: 4px;
          font-size: 0.95rem;
        }
        input,
        textarea {
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: #121521;
          color: var(--text);
        }
        textarea {
          resize: vertical;
        }
        button {
          justify-self: start;
          padding: 10px 16px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: #0a5025;
          color: #dcfce7;
          font-weight: 500;
        }
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .success {
          color: #22c55e;
          font-size: 0.9rem;
        }
        .error {
          color: #f97316;
          font-size: 0.9rem;
        }
      `}</style>
    </form>
  );
}

