'use client';

import React, { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,300;0,400;0,500;1,400&family=DM+Sans:wght@300;400;500;600&display=swap';

type Stage = 'context' | 'hamming';

interface Prompt {
  id: string;
  stage: Stage;
  title: string;
  prompt: string;
  placeholder: string;
}

const prompts: Prompt[] = [
  {
    id: 'domain',
    stage: 'context',
    title: 'Context Setting',
    prompt: 'What field or domain are you thinking about right now?',
    placeholder: 'e.g. AI alignment research, healthcare systems, education, my startup, public policy...'
  },
  {
    id: 'stakes',
    stage: 'context',
    title: 'Context Setting',
    prompt: 'Why does this field matter to you personally at this moment?',
    placeholder: 'What pulls you toward this domain? What feels urgent or alive here?'
  },
  {
    id: 'important_problems',
    stage: 'hamming',
    title: 'The Hamming Questions',
    prompt: 'What are the most important problems in your field?',
    placeholder: 'Name the highest-leverage problems, even if they feel intimidating.'
  },
  {
    id: 'current_work',
    stage: 'hamming',
    title: 'The Hamming Questions',
    prompt: 'What are you actually working on most of the time?',
    placeholder: 'Be concrete about where your real hours are going this week.'
  },
  {
    id: 'gap_reason',
    stage: 'hamming',
    title: 'The Hamming Questions',
    prompt: "Why does the gap exist between what matters most and what you're doing?",
    placeholder: 'List the practical, social, emotional, and strategic reasons.'
  },
  {
    id: 'belief_shift',
    stage: 'hamming',
    title: 'The Hamming Questions',
    prompt: 'What would you need to believe to switch toward the more important problem?',
    placeholder: 'Which assumptions would have to change? What evidence would convince you?'
  },
  {
    id: 'stopping_you',
    stage: 'hamming',
    title: 'The Hamming Questions',
    prompt: "What's stopping you right now, specifically?",
    placeholder: 'Name the real blockers, not the polite story.'
  }
];

const phaseMeta: Record<Stage, { label: string; description: string }> = {
  context: {
    label: 'Phase 1 of 3: Context Setting',
    description: 'Anchor the domain and stakes before asking the harder questions.'
  },
  hamming: {
    label: 'Phase 2 of 3: The Hamming Questions',
    description: 'Compare your highest-impact work with your actual allocation of attention.'
  }
};

const reflectionPrompts = [
  'If you protected 5 hours next week for the most important problem, what would you do first?',
  'Which blocker is externally real, and which blocker is a negotiable narrative?',
  'Who could give you leverage or accountability to make the switch credible?',
  'What is one visible commitment you can make in the next 48 hours?'
];

const Btn = ({
  onClick,
  children,
  secondary,
  disabled,
  style
}: {
  onClick: () => void;
  children: React.ReactNode;
  secondary?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      background: secondary ? 'transparent' : 'rgba(205, 150, 72, 0.18)',
      color: secondary ? 'rgba(242, 224, 196, 0.62)' : 'rgba(255, 233, 198, 0.9)',
      border: secondary ? '1px solid rgba(205, 150, 72, 0.25)' : '1px solid rgba(205, 150, 72, 0.45)',
      borderRadius: '10px',
      padding: '10px 20px',
      fontSize: '14px',
      fontFamily: "'DM Sans', sans-serif",
      fontWeight: 500,
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.25s ease',
      letterSpacing: '0.02em',
      opacity: disabled ? 0.5 : 1,
      ...style
    }}
  >
    {children}
  </button>
);

export default function HammingQuestionsPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isSummary = step >= prompts.length;
  const currentPrompt = !isSummary ? prompts[step] : null;
  const currentValue = currentPrompt ? answers[currentPrompt.id] ?? '' : '';

  useEffect(() => {
    if (!isSummary && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [step, isSummary]);

  const completion = useMemo(() => {
    if (isSummary) return 100;
    return Math.round(((step + 1) / prompts.length) * 100);
  }, [isSummary, step]);

  const contextItems = prompts.filter((p) => p.stage === 'context');
  const hammingItems = prompts.filter((p) => p.stage === 'hamming');

  const important = (answers.important_problems || '').trim();
  const current = (answers.current_work || '').trim();

  const gapSummary = useMemo(() => {
    if (important && current) {
      return `You named "${important}" as most important while your current work is "${current}".`;
    }
    if (important) {
      return `You named "${important}" as most important.`;
    }
    if (current) {
      return `You described your current work as "${current}".`;
    }
    return 'Use your responses above to name the gap between stated importance and actual focus.';
  }, [important, current]);

  const handleValueChange = (value: string) => {
    if (!currentPrompt) return;
    setAnswers((prev) => ({ ...prev, [currentPrompt.id]: value }));
  };

  const goBack = () => {
    if (isSummary) {
      setStep(prompts.length - 1);
      return;
    }
    if (step > 0) {
      setStep((prev) => prev - 1);
    }
  };

  const goNext = () => {
    if (!currentPrompt) return;
    if (!currentValue.trim()) return;

    if (step < prompts.length - 1) {
      setStep((prev) => prev + 1);
      return;
    }

    setStep(prompts.length);
  };

  const startOver = () => {
    setAnswers({});
    setStep(0);
  };

  const containerStyle: CSSProperties = {
    minHeight: '100vh',
    background: 'radial-gradient(circle at 18% 0%, #2a1b0a 0%, #171109 38%, #090705 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '38px 18px',
    fontFamily: "'Crimson Pro', Georgia, serif"
  };

  const cardStyle: CSSProperties = {
    width: '100%',
    maxWidth: '700px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(205, 150, 72, 0.2)',
    borderRadius: '16px',
    padding: '40px 30px',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)'
  };

  return (
    <>
      <link rel="stylesheet" href={FONTS_URL} />
      <div style={containerStyle}>
        <div style={cardStyle}>
          {!isSummary && currentPrompt && (
            <div>
              <p
                style={{
                  color: 'rgba(255, 218, 166, 0.52)',
                  fontSize: '11px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  fontFamily: "'DM Sans', sans-serif",
                  marginBottom: '8px'
                }}
              >
                Hamming Questions
              </p>

              <h1
                style={{
                  color: 'rgba(255, 234, 203, 0.92)',
                  fontSize: '30px',
                  fontWeight: 400,
                  margin: '0 0 8px 0',
                  lineHeight: 1.35,
                  fontStyle: 'italic'
                }}
              >
                What is the most important problem you could be working on?
              </h1>

              <p
                style={{
                  color: 'rgba(238, 210, 171, 0.6)',
                  fontSize: '15px',
                  lineHeight: 1.6,
                  margin: '0 0 22px 0'
                }}
              >
                {phaseMeta[currentPrompt.stage].label}  {String.fromCharCode(183)}  Step {step + 1} of {prompts.length}
              </p>

              <div
                style={{
                  width: '100%',
                  height: '6px',
                  borderRadius: '999px',
                  background: 'rgba(205, 150, 72, 0.14)',
                  marginBottom: '22px',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    width: `${completion}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, rgba(205, 150, 72, 0.9), rgba(232, 183, 104, 0.9))',
                    transition: 'width 0.25s ease'
                  }}
                />
              </div>

              <p
                style={{
                  color: 'rgba(255, 218, 166, 0.66)',
                  fontSize: '12px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontFamily: "'DM Sans', sans-serif",
                  margin: '0 0 10px 0'
                }}
              >
                {currentPrompt.title}
              </p>

              <p
                style={{
                  color: 'rgba(250, 227, 195, 0.86)',
                  fontSize: '19px',
                  lineHeight: 1.6,
                  margin: '0 0 10px 0',
                  fontStyle: 'italic'
                }}
              >
                {currentPrompt.prompt}
              </p>

              <p
                style={{
                  color: 'rgba(238, 210, 171, 0.55)',
                  fontSize: '14px',
                  lineHeight: 1.55,
                  margin: '0 0 16px 0'
                }}
              >
                {phaseMeta[currentPrompt.stage].description}
              </p>

              <textarea
                ref={textareaRef}
                value={currentValue}
                onChange={(e) => handleValueChange(e.target.value)}
                placeholder={currentPrompt.placeholder}
                rows={5}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(205, 150, 72, 0.25)',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  color: 'rgba(255, 234, 203, 0.86)',
                  fontSize: '16px',
                  fontFamily: "'Crimson Pro', Georgia, serif",
                  lineHeight: 1.55,
                  resize: 'vertical',
                  outline: 'none',
                  boxSizing: 'border-box',
                  minHeight: '130px'
                }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '18px',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}
              >
                <Btn onClick={goBack} secondary disabled={step === 0}>
                  Back
                </Btn>
                <Btn onClick={goNext} disabled={!currentValue.trim()}>
                  {step === prompts.length - 1 ? 'Review Summary' : 'Continue'}
                </Btn>
              </div>
            </div>
          )}

          {isSummary && (
            <div>
              <p
                style={{
                  color: 'rgba(255, 218, 166, 0.52)',
                  fontSize: '11px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  fontFamily: "'DM Sans', sans-serif",
                  marginBottom: '8px'
                }}
              >
                Phase 3 of 3: Reflection
              </p>

              <h2
                style={{
                  color: 'rgba(255, 234, 203, 0.92)',
                  fontSize: '28px',
                  fontWeight: 400,
                  margin: '0 0 12px 0',
                  fontStyle: 'italic'
                }}
              >
                Your Hamming Reflection
              </h2>

              <p
                style={{
                  color: 'rgba(238, 210, 171, 0.62)',
                  fontSize: '16px',
                  lineHeight: 1.65,
                  margin: '0 0 24px 0'
                }}
              >
                Review what you wrote, then decide whether your current work allocation matches your own declared priorities.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '22px' }}>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(205, 150, 72, 0.2)',
                    borderRadius: '12px',
                    padding: '16px 18px'
                  }}
                >
                  <p
                    style={{
                      color: 'rgba(255, 218, 166, 0.66)',
                      fontSize: '11px',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      fontFamily: "'DM Sans', sans-serif",
                      margin: '0 0 10px 0'
                    }}
                  >
                    Context Setting
                  </p>
                  {contextItems.map((item) => (
                    <div key={item.id} style={{ marginBottom: '12px' }}>
                      <p style={{ color: 'rgba(248, 223, 186, 0.8)', fontSize: '15px', lineHeight: 1.5, margin: '0 0 4px 0' }}>{item.prompt}</p>
                      <p style={{ color: 'rgba(238, 210, 171, 0.65)', fontSize: '15px', lineHeight: 1.55, margin: 0 }}>
                        {answers[item.id]?.trim() || 'No response.'}
                      </p>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(205, 150, 72, 0.2)',
                    borderRadius: '12px',
                    padding: '16px 18px'
                  }}
                >
                  <p
                    style={{
                      color: 'rgba(255, 218, 166, 0.66)',
                      fontSize: '11px',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      fontFamily: "'DM Sans', sans-serif",
                      margin: '0 0 10px 0'
                    }}
                  >
                    The Hamming Questions
                  </p>
                  {hammingItems.map((item) => (
                    <div key={item.id} style={{ marginBottom: '12px' }}>
                      <p style={{ color: 'rgba(248, 223, 186, 0.8)', fontSize: '15px', lineHeight: 1.5, margin: '0 0 4px 0' }}>{item.prompt}</p>
                      <p style={{ color: 'rgba(238, 210, 171, 0.65)', fontSize: '15px', lineHeight: 1.55, margin: 0 }}>
                        {answers[item.id]?.trim() || 'No response.'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(205, 150, 72, 0.07)',
                  border: '1px solid rgba(205, 150, 72, 0.24)',
                  borderRadius: '12px',
                  padding: '16px 18px',
                  marginBottom: '20px'
                }}
              >
                <p
                  style={{
                    color: 'rgba(255, 218, 166, 0.75)',
                    fontSize: '11px',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    fontFamily: "'DM Sans', sans-serif",
                    margin: '0 0 8px 0'
                  }}
                >
                  Gap Snapshot
                </p>
                <p style={{ color: 'rgba(250, 227, 195, 0.86)', fontSize: '16px', lineHeight: 1.6, margin: 0 }}>{gapSummary}</p>
              </div>

              <div
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(205, 150, 72, 0.16)',
                  borderRadius: '12px',
                  padding: '16px 18px',
                  marginBottom: '24px'
                }}
              >
                <p
                  style={{
                    color: 'rgba(255, 218, 166, 0.66)',
                    fontSize: '11px',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    fontFamily: "'DM Sans', sans-serif",
                    margin: '0 0 10px 0'
                  }}
                >
                  Reflection Prompts
                </p>
                <ul style={{ margin: 0, paddingLeft: '18px', color: 'rgba(238, 210, 171, 0.7)', lineHeight: 1.7, fontSize: '15px' }}>
                  {reflectionPrompts.map((prompt) => (
                    <li key={prompt}>{prompt}</li>
                  ))}
                </ul>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <Btn onClick={goBack} secondary>
                  Edit Last Answer
                </Btn>
                <Btn onClick={startOver}>Start Over</Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
