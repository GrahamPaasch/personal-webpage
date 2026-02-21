'use client';
import React, { useState, useEffect, useRef, CSSProperties } from 'react';

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap';

type Mode = 'intro' | 'solo' | 'guided';
type Phase = 'main' | 'followup';

interface Step {
  id: string;
  title: string;
  main: string;
  followup: string;
  placeholder: string;
  followupPlaceholder: string;
  redirect?: (text: string) => string | null;
}

const steps: Step[] = [
  {
    id: 'clearing',
    title: 'Clearing a Space',
    main: 'Without trying to solve anything yet... what\'s between you and feeling perfectly fine right now?',
    followup: 'Set that down gently, like placing a package on the ground beside you. What else is there?',
    placeholder: 'Whatever comes to mind... don\'t filter it',
    followupPlaceholder: 'Anything else sitting there...',
    redirect: (t: string) => /\b(because|therefore|logically|analysis|reason is)\b/i.test(t) ? 'You\'re in your head. Can you feel where this lives in your body instead?' : null,
  },
  {
    id: 'felt_sense',
    title: 'Felt Sense',
    main: 'Choose one of those things. Don\'t go inside it yet. Just stand back and sense the whole of it. What is the unclear, body-sense of this whole thing?',
    followup: 'Stay with that murky feeling. Where do you notice it in your body? What quality does it have?',
    placeholder: 'The whole feel of it...',
    followupPlaceholder: 'Heavy, tight, fluttery, hollow...',
    redirect: (t: string) => /\b(I think|my opinion|rationally|obviously)\b/i.test(t) ? 'Gently set aside what you think about it. What do you feel about it, in your body?' : null,
  },
  {
    id: 'handle',
    title: 'Finding a Handle',
    main: 'What word, phrase, or image captures the quality of this felt sense?',
    followup: 'Say that word or phrase back to yourself slowly. Does it resonate? Does something in you go "yes, that\'s it"?',
    placeholder: 'A word or image that fits...',
    followupPlaceholder: 'How it resonates...',
  },
  {
    id: 'resonating',
    title: 'Resonating',
    main: 'Go back and forth between the felt sense and your handle. Do they match? If the feeling changes, follow it.',
    followup: 'What shifted? What does the felt sense want you to know?',
    placeholder: 'What you notice as you check...',
    followupPlaceholder: 'What\'s emerging...',
  },
  {
    id: 'asking',
    title: 'Asking',
    main: 'Gently ask the felt sense: what is it about this whole thing that makes it so [your handle]?',
    followup: 'Wait for the answer to come from the feeling itself, not from your thinking mind. What comes?',
    placeholder: 'What the felt sense says...',
    followupPlaceholder: 'The answer that comes from within...',
  },
  {
    id: 'receiving',
    title: 'Receiving',
    main: 'Welcome whatever came with a gentle, accepting attitude. This is your body\'s wisdom. How do you receive it?',
    followup: 'Take a moment to appreciate that something in you just spoke. Is there anything else it wants you to know before we close?',
    placeholder: 'How you receive this...',
    followupPlaceholder: 'Any last whisper...',
  },
];

const Btn = ({ onClick, children, secondary, style }: { onClick: () => void; children: React.ReactNode; secondary?: boolean; style?: CSSProperties }) => (
  <button
    onClick={onClick}
    style={{
      background: secondary ? 'transparent' : 'rgba(140,120,200,0.15)',
      color: secondary ? 'rgba(190,170,230,0.5)' : 'rgba(210,200,235,0.8)',
      border: secondary ? '1px solid rgba(140,120,200,0.15)' : '1px solid rgba(140,120,200,0.25)',
      borderRadius: '8px',
      padding: '10px 24px',
      fontSize: '14px',
      fontFamily: "'DM Sans', sans-serif",
      fontWeight: 400,
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      letterSpacing: '0.02em',
      ...style,
    }}
  >
    {children}
  </button>
);

export default function FocusingPage() {
  const [mode, setMode] = useState<Mode>('intro');
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('main');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  const [redirectMsg, setRedirectMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentStep = steps[stepIndex];
  const allAnswers = Object.values(answers).filter(Boolean);

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus();
  }, [stepIndex, phase]);

  const handleSubmit = () => {
    if (!input.trim()) return;
    const key = `${currentStep.id}_${phase}`;

    if (phase === 'main' && currentStep.redirect) {
      const msg = currentStep.redirect(input);
      if (msg) { setRedirectMsg(msg); return; }
    }

    setAnswers(prev => ({ ...prev, [key]: input.trim() }));
    setInput('');
    setRedirectMsg(null);

    if (phase === 'main') {
      setPhase('followup');
    } else {
      if (stepIndex < steps.length - 1) {
        setStepIndex(stepIndex + 1);
        setPhase('main');
      } else {
        setMode('intro');
        setStepIndex(steps.length);
      }
    }
  };

  const isComplete = stepIndex >= steps.length;

  const containerStyle: CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(170deg, #0a0a12 0%, #12101f 40%, #0e0c18 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    fontFamily: "'Crimson Pro', Georgia, serif",
  };

  const cardStyle: CSSProperties = {
    maxWidth: '560px',
    width: '100%',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(140,120,200,0.08)',
    borderRadius: '16px',
    padding: '48px 40px',
  };

  return (
    <>
      <link rel="stylesheet" href={FONTS_URL} />
      <div style={containerStyle}>
        <div style={cardStyle}>
          {!isComplete && mode === 'intro' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'rgba(190,170,230,0.35)', fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: '32px' }}>Focusing</p>
              <h1 style={{ color: 'rgba(210,200,235,0.85)', fontSize: '28px', fontWeight: 300, lineHeight: 1.4, margin: '0 0 16px 0', fontStyle: 'italic' }}>Listen inward.</h1>
              <p style={{ color: 'rgba(190,180,215,0.45)', fontSize: '16px', lineHeight: 1.7, margin: '0 0 40px 0' }}>Focusing is a practice of turning attention to the subtle, unclear body-sense beneath your thoughts. This tool guides you through Gendlin's six movements.</p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <Btn onClick={() => { setMode('solo'); setStepIndex(0); setPhase('main'); setAnswers({}); }}>Solo Practice</Btn>
                <Btn onClick={() => { setMode('guided'); setStepIndex(0); setPhase('main'); setAnswers({}); }} secondary>Guided Mode</Btn>
              </div>
            </div>
          )}

          {!isComplete && mode !== 'intro' && (
            <div>
              <p style={{ color: 'rgba(190,170,230,0.35)', fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: '8px' }}>{currentStep.title}</p>
              <p style={{ color: 'rgba(140,120,200,0.2)', fontSize: '11px', fontFamily: "'DM Sans', sans-serif", marginBottom: '32px' }}>Step {stepIndex + 1} of {steps.length}</p>
              <p style={{ color: 'rgba(210,200,235,0.75)', fontSize: '18px', lineHeight: 1.65, fontStyle: 'italic', margin: '0 0 24px 0' }}>{phase === 'main' ? currentStep.main : currentStep.followup}</p>

              {redirectMsg && (
                <p style={{ color: 'rgba(200,170,130,0.6)', fontSize: '14px', fontStyle: 'italic', margin: '0 0 16px 0', padding: '12px 16px', background: 'rgba(200,170,130,0.05)', borderRadius: '8px', border: '1px solid rgba(200,170,130,0.1)' }}>{redirectMsg}</p>
              )}

              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => { setInput(e.target.value); setRedirectMsg(null); }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                placeholder={phase === 'main' ? currentStep.placeholder : currentStep.followupPlaceholder}
                rows={3}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(140,120,200,0.1)',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  color: 'rgba(210,200,235,0.7)',
                  fontSize: '15px',
                  fontFamily: "'Crimson Pro', Georgia, serif",
                  lineHeight: 1.6,
                  resize: 'vertical',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <Btn onClick={handleSubmit}>Continue</Btn>
              </div>
            </div>
          )}

          {isComplete && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'rgba(190,170,230,0.35)', fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: '32px' }}>Session Complete</p>
              <h2 style={{ color: 'rgba(210,200,235,0.8)', fontSize: '22px', fontWeight: 300, fontStyle: 'italic', margin: '0 0 12px 0' }}>Thank you for listening inward.</h2>
              <p style={{ color: 'rgba(190,180,215,0.4)', fontSize: '15px', lineHeight: 1.7, margin: '0 0 32px 0' }}>Something was heard. That matters, even if nothing dramatic shifted.</p>

              {allAnswers.length > 0 && (
                <div style={{ marginBottom: '40px' }}>
                  <p style={{ color: 'rgba(190,170,230,0.45)', fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: '16px' }}>Your session</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {steps.map(s => {
                      const main = answers[`${s.id}_main`];
                      const fu = answers[`${s.id}_followup`];
                      if (!main && !fu) return null;
                      return (
                        <div key={s.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(190,170,230,0.1)', borderRadius: '12px', padding: '16px 20px' }}>
                          <p style={{ color: 'rgba(190,170,230,0.6)', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", margin: '0 0 8px 0' }}>{s.title}</p>
                          {main && <p style={{ color: 'rgba(210,200,235,0.75)', fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '15px', lineHeight: 1.65, margin: fu ? '0 0 8px 0' : '0' }}>{main}</p>}
                          {fu && <p style={{ color: 'rgba(190,180,215,0.55)', fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '14px', lineHeight: 1.6, margin: '0', fontStyle: 'italic' }}>{fu}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <Btn onClick={() => { setMode('intro'); setStepIndex(0); setPhase('main'); setAnswers({}); setInput(''); setRedirectMsg(null); }}>Begin Again</Btn>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
