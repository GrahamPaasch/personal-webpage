'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PATTERN_LIBRARY, getPatternById } from '@/lib/patternpals/patterns';
import { recommendPatterns } from '@/lib/patternpals/recommendations';
import type {
  ExperienceLevel,
  JugglerProfile,
  PatternStatus,
  PracticeMode,
  ProgressEntry,
  PropType,
  SessionEntry,
} from '@/lib/patternpals/types';

const EXPERIENCE_OPTIONS: ExperienceLevel[] = ['Beginner', 'Intermediate', 'Advanced'];
const PROP_OPTIONS: PropType[] = ['clubs', 'balls', 'rings'];

const LOCAL_KEYS = {
  activeId: 'patternpals.activeJugglerId',
  partnerId: 'patternpals.activePartnerId',
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatPattern = (patternId: string) => getPatternById(patternId)?.name ?? patternId;

const buildStatusCounts = (entries: ProgressEntry[]) => {
  return entries.reduce(
    (acc, entry) => {
      acc[entry.status] += 1;
      return acc;
    },
    { known: 0, working: 0, curious: 0 } as Record<PatternStatus, number>,
  );
};

export default function PatternPalsApp() {
  const [jugglers, setJugglers] = useState<JugglerProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [partnerProgress, setPartnerProgress] = useState<ProgressEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [mode, setMode] = useState<PracticeMode>('passing');
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patternSearch, setPatternSearch] = useState('');

  const [profileForm, setProfileForm] = useState<{
    name: string;
    experience: ExperienceLevel;
    props: PropType[];
  }>({
    name: '',
    experience: 'Beginner',
    props: [],
  });
  const [editingProfile, setEditingProfile] = useState(false);

  const [partnerForm, setPartnerForm] = useState<{
    name: string;
    experience: ExperienceLevel;
    props: PropType[];
  }>({
    name: '',
    experience: 'Beginner',
    props: [],
  });

  const [sessionForm, setSessionForm] = useState<{
    scheduledFor: string;
    durationMinutes: number;
    location: string;
    partnerId: string;
    partnerName: string;
    focusPatterns: string[];
    outcome: string;
  }>({
    scheduledFor: '',
    durationMinutes: 90,
    location: '',
    partnerId: '',
    partnerName: '',
    focusPatterns: [],
    outcome: '',
  });
  const [focusInput, setFocusInput] = useState('');

  const activeProfile = useMemo(
    () => jugglers.find((juggler) => juggler.id === activeId) ?? null,
    [jugglers, activeId],
  );
  const partnerProfile = useMemo(
    () => jugglers.find((juggler) => juggler.id === partnerId) ?? null,
    [jugglers, partnerId],
  );

  const progressMap = useMemo(
    () => new Map(progress.map((entry) => [entry.patternId, entry.status])),
    [progress],
  );

  const progressCounts = useMemo(() => buildStatusCounts(progress), [progress]);

  const upcomingSessions = useMemo(() => {
    const now = Date.now();
    return sessions.filter((session) => {
      const scheduled = new Date(session.scheduledFor).getTime();
      return session.status === 'scheduled' && scheduled >= now;
    });
  }, [sessions]);

  const recentPatternIds = useMemo(() => {
    const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 21;
    const recent = new Set<string>();
    sessions.forEach((session) => {
      if (session.status !== 'completed') return;
      const when = new Date(session.scheduledFor).getTime();
      if (when < cutoff) return;
      session.focusPatterns.forEach((patternId) => recent.add(patternId));
    });
    return Array.from(recent);
  }, [sessions]);

  const recommendations = useMemo(() => {
    if (!activeProfile) return [];
    return recommendPatterns(PATTERN_LIBRARY, {
      mode,
      myProfile: activeProfile,
      myProgress: progress,
      partnerProfile,
      partnerProgress,
      recentPatternIds,
    }).slice(0, 6);
  }, [activeProfile, mode, partnerProfile, partnerProgress, progress, recentPatternIds]);

  const filteredPatterns = useMemo(() => {
    const query = patternSearch.trim().toLowerCase();
    if (!query) return PATTERN_LIBRARY;
    return PATTERN_LIBRARY.filter((pattern) =>
      pattern.name.toLowerCase().includes(query) ||
      pattern.description.toLowerCase().includes(query) ||
      pattern.tags.some((tag) => tag.toLowerCase().includes(query)),
    );
  }, [patternSearch]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/patternpals/jugglers');
        if (!res.ok) throw new Error('Failed to load jugglers.');
        const data = await res.json();
        if (!cancelled) {
          setJugglers(data.items ?? []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Could not load jugglers.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (jugglers.length === 0) return;
    if (!activeId) {
      const stored = window.localStorage.getItem(LOCAL_KEYS.activeId);
      if (stored && jugglers.some((juggler) => juggler.id === stored)) {
        setActiveId(stored);
      }
    }
    if (!partnerId) {
      const storedPartner = window.localStorage.getItem(LOCAL_KEYS.partnerId);
      if (storedPartner && jugglers.some((juggler) => juggler.id === storedPartner)) {
        setPartnerId(storedPartner);
      }
    }
  }, [jugglers, activeId, partnerId]);

  useEffect(() => {
    if (activeId) {
      window.localStorage.setItem(LOCAL_KEYS.activeId, activeId);
    }
  }, [activeId]);

  useEffect(() => {
    if (partnerId) {
      window.localStorage.setItem(LOCAL_KEYS.partnerId, partnerId);
    }
  }, [partnerId]);

  useEffect(() => {
    if (!activeId) {
      setProgress([]);
      setSessions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [progressRes, sessionsRes] = await Promise.all([
          fetch(`/api/patternpals/progress?jugglerId=${encodeURIComponent(activeId)}`),
          fetch(`/api/patternpals/sessions?hostId=${encodeURIComponent(activeId)}`),
        ]);
        if (!progressRes.ok || !sessionsRes.ok) {
          throw new Error('Failed to load profile data.');
        }
        const progressData = await progressRes.json();
        const sessionsData = await sessionsRes.json();
        if (!cancelled) {
          setProgress(progressData.items ?? []);
          setSessions(sessionsData.items ?? []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Could not load profile data.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    if (!partnerId) {
      setPartnerProgress([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/patternpals/progress?jugglerId=${encodeURIComponent(partnerId)}`);
        if (!res.ok) throw new Error('Failed to load partner progress.');
        const data = await res.json();
        if (!cancelled) {
          setPartnerProgress(data.items ?? []);
        }
      } catch {
        if (!cancelled) setPartnerProgress([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  useEffect(() => {
    if (activeProfile && !editingProfile) {
      setProfileForm({
        name: activeProfile.name,
        experience: activeProfile.experience,
        props: activeProfile.props,
      });
    }
  }, [activeProfile, editingProfile]);

  useEffect(() => {
    if (partnerProfile && !sessionForm.partnerId) {
      setSessionForm((prev) => ({
        ...prev,
        partnerId: partnerProfile.id,
        partnerName: partnerProfile.name,
      }));
    }
  }, [partnerProfile, sessionForm.partnerId]);

  const handleCreateProfile = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setStatusMessage(null);
    if (!profileForm.name.trim()) {
      setError('Name is required.');
      return;
    }
    try {
      const res = await fetch('/api/patternpals/jugglers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create profile.');
      }
      const created = await res.json();
      setJugglers((prev) => [...prev, created]);
      setActiveId(created.id);
      setEditingProfile(false);
      setStatusMessage('Profile created.');
    } catch (err: any) {
      setError(err?.message || 'Profile creation failed.');
    }
  };

  const handleUpdateProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeProfile) return;
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/patternpals/jugglers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeProfile.id, ...profileForm }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update profile.');
      }
      const updated = await res.json();
      setJugglers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingProfile(false);
      setStatusMessage('Profile updated.');
    } catch (err: any) {
      setError(err?.message || 'Profile update failed.');
    }
  };

  const handleCreatePartner = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setStatusMessage(null);
    if (!partnerForm.name.trim()) {
      setError('Partner name is required.');
      return;
    }
    try {
      const res = await fetch('/api/patternpals/jugglers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partnerForm),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add partner.');
      }
      const created = await res.json();
      setJugglers((prev) => [...prev, created]);
      setPartnerForm({ name: '', experience: 'Beginner', props: [] });
      setStatusMessage('Partner added.');
    } catch (err: any) {
      setError(err?.message || 'Partner add failed.');
    }
  };

  const handleSetActive = (id: string) => {
    setActiveId(id);
    setStatusMessage('Active profile switched.');
  };

  const handleSetPartner = (id: string | null) => {
    setPartnerId(id);
    if (id) {
      setMode('passing');
    }
  };

  const updatePatternStatus = async (patternId: string, status: PatternStatus) => {
    if (!activeProfile) return;
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/patternpals/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jugglerId: activeProfile.id, patternId, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update pattern status.');
      }
      const entry = await res.json();
      setProgress((prev) => {
        const idx = prev.findIndex((item) => item.patternId === entry.patternId);
        if (idx === -1) return [...prev, entry];
        const updated = [...prev];
        updated[idx] = entry;
        return updated;
      });
      setStatusMessage('Pattern status updated.');
    } catch (err: any) {
      setError(err?.message || 'Pattern status update failed.');
    }
  };

  const handleSessionCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeProfile) return;
    setError(null);
    setStatusMessage(null);
    if (!sessionForm.scheduledFor) {
      setError('Please choose a session time.');
      return;
    }
    const partner =
      jugglers.find((juggler) => juggler.id === sessionForm.partnerId) ??
      (partnerProfile && partnerProfile.id === sessionForm.partnerId ? partnerProfile : null);
    const payload = {
      hostId: activeProfile.id,
      partnerId: partner ? partner.id : null,
      partnerName: partner ? partner.name : sessionForm.partnerName.trim() || null,
      scheduledFor: new Date(sessionForm.scheduledFor).toISOString(),
      durationMinutes: sessionForm.durationMinutes,
      location: sessionForm.location.trim() || null,
      focusPatterns: sessionForm.focusPatterns,
      status: 'scheduled',
      outcome: sessionForm.outcome.trim() || null,
    };
    try {
      const res = await fetch('/api/patternpals/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to schedule session.');
      }
      const created = await res.json();
      setSessions((prev) => [...prev, created]);
      setSessionForm({
        scheduledFor: '',
        durationMinutes: 90,
        location: '',
        partnerId: partner?.id ?? '',
        partnerName: partner?.name ?? '',
        focusPatterns: [],
        outcome: '',
      });
      setFocusInput('');
      setStatusMessage('Session scheduled.');
    } catch (err: any) {
      setError(err?.message || 'Session scheduling failed.');
    }
  };

  const handleSessionStatus = async (sessionId: string, status: SessionEntry['status']) => {
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/patternpals/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update session.');
      }
      const updated = await res.json();
      setSessions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setStatusMessage('Session updated.');
    } catch (err: any) {
      setError(err?.message || 'Session update failed.');
    }
  };
  const addFocusPattern = () => {
    const raw = focusInput.trim();
    if (!raw) return;
    const match =
      PATTERN_LIBRARY.find((pattern) => pattern.id === raw) ??
      PATTERN_LIBRARY.find((pattern) => pattern.name.toLowerCase() === raw.toLowerCase());
    if (!match) {
      setError('Pattern not found in the library.');
      return;
    }
    setSessionForm((prev) => {
      if (prev.focusPatterns.includes(match.id)) return prev;
      return { ...prev, focusPatterns: [...prev.focusPatterns, match.id] };
    });
    setFocusInput('');
  };

  const removeFocusPattern = (patternId: string) => {
    setSessionForm((prev) => ({
      ...prev,
      focusPatterns: prev.focusPatterns.filter((id) => id !== patternId),
    }));
  };

  const renderPropPicker = (
    value: PropType[],
    onChange: (next: PropType[]) => void,
  ) => {
    return (
      <div className="patternpals-props">
        {PROP_OPTIONS.map((prop) => (
          <button
            key={prop}
            type="button"
            className={`patternpals-prop-chip${value.includes(prop) ? ' active' : ''}`}
            onClick={() => {
              if (value.includes(prop)) {
                onChange(value.filter((item) => item !== prop));
              } else {
                onChange([...value, prop]);
              }
            }}
          >
            {prop}
          </button>
        ))}
      </div>
    );
  };

  if (loading) {
    return <p className="muted">Loading PatternPals...</p>;
  }

  return (
    <section className="grid patternpals-grid">
      <article className="card patternpals-hero">
        <div className="patternpals-hero-content">
          <div>
            <h1>PatternPals</h1>
            <p className="muted">
              Track passing progress, schedule sessions, and surface pattern recommendations tailored
              to who you are juggling with right now.
            </p>
            <div className="patternpals-hero-actions">
              <a className="button primary" href="#patternpals-profile">
                Set up your profile
              </a>
              <a className="button" href="/hobbies/juggling">
                Read my juggling notes
              </a>
            </div>
          </div>
          <div className="patternpals-stat-grid">
            <div className="patternpals-stat">
              <span className="patternpals-stat-label">Known patterns</span>
              <strong>{progressCounts.known}</strong>
            </div>
            <div className="patternpals-stat">
              <span className="patternpals-stat-label">Working now</span>
              <strong>{progressCounts.working}</strong>
            </div>
            <div className="patternpals-stat">
              <span className="patternpals-stat-label">Upcoming sessions</span>
              <strong>{upcomingSessions.length}</strong>
            </div>
          </div>
        </div>
        {statusMessage ? <p className="patternpals-note success">{statusMessage}</p> : null}
        {error ? <p className="patternpals-note error">{error}</p> : null}
      </article>
      <article className="card half" id="patternpals-profile">
        <h2>Your profile</h2>
        {activeProfile && !editingProfile ? (
          <div className="patternpals-profile">
            <div>
              <p className="patternpals-profile-name">{activeProfile.name}</p>
              <p className="muted">
                {activeProfile.experience} - {activeProfile.props.join(', ') || 'No props yet'}
              </p>
            </div>
            <div className="patternpals-profile-actions">
              <button
                type="button"
                className="button"
                onClick={() => setEditingProfile(true)}
              >
                Edit profile
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={activeProfile ? handleUpdateProfile : handleCreateProfile} className="patternpals-form">
            <label>
              Name
              <input
                value={profileForm.name}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Your name"
                required
              />
            </label>
            <label>
              Experience
              <select
                value={profileForm.experience}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    experience: event.target.value as ExperienceLevel,
                  }))
                }
              >
                {EXPERIENCE_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <p className="muted small">Preferred props</p>
              {renderPropPicker(profileForm.props, (next) =>
                setProfileForm((prev) => ({ ...prev, props: next })),
              )}
            </div>
            <div className="patternpals-form-actions">
              <button type="submit" className="button primary">
                {activeProfile ? 'Save changes' : 'Create profile'}
              </button>
              {activeProfile ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => setEditingProfile(false)}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        )}
      </article>

      <article className="card half">
        <h2>Roster</h2>
        <p className="muted">Add jugglers you pass with and pick a partner for recommendations.</p>
        <div className="patternpals-roster">
          {jugglers
            .filter((juggler) => juggler.id !== activeId)
            .map((juggler) => (
              <div key={juggler.id} className="patternpals-roster-row">
                <div>
                  <strong>{juggler.name}</strong>
                  <div className="muted small">{juggler.experience}</div>
                </div>
                <div className="patternpals-roster-actions">
                  <button
                    type="button"
                    className={`patternpals-mini-button${partnerId === juggler.id ? ' active' : ''}`}
                    onClick={() => handleSetPartner(juggler.id)}
                  >
                    {partnerId === juggler.id ? 'Active partner' : 'Use partner'}
                  </button>
                  <button
                    type="button"
                    className="patternpals-mini-button ghost"
                    onClick={() => handleSetActive(juggler.id)}
                  >
                    Switch to profile
                  </button>
                </div>
              </div>
            ))}
          {jugglers.filter((juggler) => juggler.id !== activeId).length === 0 ? (
            <p className="muted small">No partners yet. Add a few below.</p>
          ) : null}
        </div>
        <form onSubmit={handleCreatePartner} className="patternpals-form">
          <label>
            Partner name
            <input
              value={partnerForm.name}
              onChange={(event) => setPartnerForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="New partner"
              required
            />
          </label>
          <label>
            Experience
            <select
              value={partnerForm.experience}
              onChange={(event) =>
                setPartnerForm((prev) => ({
                  ...prev,
                  experience: event.target.value as ExperienceLevel,
                }))
              }
            >
              {EXPERIENCE_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <div>
            <p className="muted small">Props they use</p>
            {renderPropPicker(partnerForm.props, (next) =>
              setPartnerForm((prev) => ({ ...prev, props: next })),
            )}
          </div>
          <button type="submit" className="button">
            Add partner
          </button>
        </form>
      </article>
      <article className="card patternpals-recommendations">
        <div className="patternpals-section-header">
          <div>
            <h2>Recommendations</h2>
            <p className="muted">
              Ranked by your progress, recent sessions, and the partner you selected.
            </p>
          </div>
          <div className="patternpals-mode">
            <button
              type="button"
              className={`patternpals-mini-button${mode === 'solo' ? ' active' : ''}`}
              onClick={() => setMode('solo')}
            >
              Solo mode
            </button>
            <button
              type="button"
              className={`patternpals-mini-button${mode === 'passing' ? ' active' : ''}`}
              onClick={() => setMode('passing')}
            >
              Passing mode
            </button>
          </div>
        </div>
        <div className="patternpals-recommendation-grid">
          {recommendations.length === 0 ? (
            <p className="muted">Set up your profile and progress to see recommendations.</p>
          ) : (
            recommendations.map((item) => (
              <div key={item.pattern.id} className="patternpals-recommendation">
                <div>
                  <h3>{item.pattern.name}</h3>
                  <p className="muted small">{item.pattern.description}</p>
                </div>
                <div className="patternpals-reasons">
                  {item.reasons.slice(0, 3).map((reason) => (
                    <span key={reason} className={`patternpals-reason ${item.readiness}`}>
                      {reason}
                    </span>
                  ))}
                </div>
                <div className="patternpals-recommendation-actions">
                  <button
                    type="button"
                    className="patternpals-mini-button"
                    onClick={() => updatePatternStatus(item.pattern.id, 'working')}
                  >
                    Mark working
                  </button>
                  <button
                    type="button"
                    className="patternpals-mini-button ghost"
                    onClick={() => updatePatternStatus(item.pattern.id, 'known')}
                  >
                    Mark known
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </article>

      <article className="card half">
        <h2>Schedule a session</h2>
        <form onSubmit={handleSessionCreate} className="patternpals-form">
          <label>
            When
            <input
              type="datetime-local"
              value={sessionForm.scheduledFor}
              onChange={(event) =>
                setSessionForm((prev) => ({ ...prev, scheduledFor: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Duration (minutes)
            <input
              type="number"
              min={15}
              max={240}
              value={sessionForm.durationMinutes}
              onChange={(event) =>
                setSessionForm((prev) => ({
                  ...prev,
                  durationMinutes: Number(event.target.value || 0),
                }))
              }
            />
          </label>
          <label>
            Location
            <input
              value={sessionForm.location}
              onChange={(event) => setSessionForm((prev) => ({ ...prev, location: event.target.value }))}
              placeholder="Field, gym, or park"
            />
          </label>
          <label>
            Passing partner
            <select
              value={sessionForm.partnerId}
              onChange={(event) =>
                setSessionForm((prev) => ({
                  ...prev,
                  partnerId: event.target.value,
                  partnerName:
                    jugglers.find((juggler) => juggler.id === event.target.value)?.name ?? '',
                }))
              }
            >
              <option value="">Select partner</option>
              {jugglers
                .filter((juggler) => juggler.id !== activeId)
                .map((juggler) => (
                  <option key={juggler.id} value={juggler.id}>
                    {juggler.name}
                  </option>
                ))}
            </select>
          </label>
          {!sessionForm.partnerId ? (
            <label>
              Partner name (manual)
              <input
                value={sessionForm.partnerName}
                onChange={(event) =>
                  setSessionForm((prev) => ({ ...prev, partnerName: event.target.value }))
                }
                placeholder="Optional if partner is not on the roster"
              />
            </label>
          ) : null}
          <div>
            <label>
              Focus pattern
              <input
                list="patternpals-patterns"
                value={focusInput}
                onChange={(event) => setFocusInput(event.target.value)}
                placeholder="Start typing a pattern"
              />
            </label>
            <div className="patternpals-inline-actions">
              <button type="button" className="patternpals-mini-button" onClick={addFocusPattern}>
                Add pattern
              </button>
            </div>
            <datalist id="patternpals-patterns">
              {PATTERN_LIBRARY.map((pattern) => (
                <option key={pattern.id} value={pattern.name} />
              ))}
            </datalist>
            {sessionForm.focusPatterns.length > 0 ? (
              <div className="patternpals-chip-row">
                {sessionForm.focusPatterns.map((patternId) => (
                  <span key={patternId} className="patternpals-chip">
                    {formatPattern(patternId)}
                    <button
                      type="button"
                      onClick={() => removeFocusPattern(patternId)}
                      aria-label={`Remove ${formatPattern(patternId)}`}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <label>
            Session notes
            <input
              value={sessionForm.outcome}
              onChange={(event) => setSessionForm((prev) => ({ ...prev, outcome: event.target.value }))}
              placeholder="Focus, goals, or outcomes"
            />
          </label>
          <button type="submit" className="button primary">
            Schedule session
          </button>
        </form>
      </article>
      <article className="card half">
        <h2>Upcoming sessions</h2>
        {upcomingSessions.length === 0 ? (
          <p className="muted">No sessions scheduled yet.</p>
        ) : (
          <div className="patternpals-session-list">
            {upcomingSessions.map((session) => (
              <div key={session.id} className="patternpals-session-card">
                <div>
                  <strong>{formatDateTime(session.scheduledFor)}</strong>
                  <p className="muted small">
                    {session.partnerName || 'Open session'} ?{' '}
                    {session.location || 'Location TBD'}
                  </p>
                  <p className="muted small">
                    Focus: {session.focusPatterns.map(formatPattern).join(', ') || 'Open focus'}
                  </p>
                </div>
                <div className="patternpals-session-actions">
                  <button
                    type="button"
                    className="patternpals-mini-button"
                    onClick={() => handleSessionStatus(session.id, 'completed')}
                  >
                    Mark completed
                  </button>
                  <button
                    type="button"
                    className="patternpals-mini-button ghost"
                    onClick={() => handleSessionStatus(session.id, 'canceled')}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="card patternpals-progress">
        <div className="patternpals-section-header">
          <div>
            <h2>Progress tracker</h2>
            <p className="muted">
              Mark patterns as known, working, or curious to tune recommendations.
            </p>
          </div>
          <div className="patternpals-search">
            <input
              value={patternSearch}
              onChange={(event) => setPatternSearch(event.target.value)}
              placeholder="Search patterns"
            />
          </div>
        </div>
        <div className="patternpals-pattern-list">
          {filteredPatterns.map((pattern) => {
            const status = progressMap.get(pattern.id);
            return (
              <div key={pattern.id} className="patternpals-pattern-row">
                <div>
                  <strong>{pattern.name}</strong>
                  <div className="muted small">
                    {pattern.difficulty} - {pattern.requiredJugglers} jugglers - {pattern.props.join(', ')}
                  </div>
                </div>
                <div className="patternpals-status-buttons">
                  {(['known', 'working', 'curious'] as PatternStatus[]).map((state) => (
                    <button
                      key={state}
                      type="button"
                      className={`patternpals-mini-button${status === state ? ' active' : ''}`}
                      onClick={() => updatePatternStatus(pattern.id, state)}
                    >
                      {state}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}
