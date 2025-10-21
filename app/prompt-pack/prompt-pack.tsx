'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PromptCategory } from './data';
import { promptCategories } from './data';

type PlaceholderField = {
  key: string;
  raw: string;
  label: string;
  hint?: string;
};

type ToneOption = {
  id: string;
  label: string;
  helper: string;
  instruction?: string;
};

type FormatOption = {
  id: string;
  label: string;
  helper: string;
  instruction?: string;
};

const toneOptions: ToneOption[] = [
  { id: 'default', label: 'Default', helper: 'Let ChatGPT pick the tone.' },
  {
    id: 'friendly',
    label: 'Friendly coach',
    helper: 'Supportive and upbeat voice.',
    instruction: 'Adopt an encouraging, collaborative tone that sounds like a trusted teammate.',
  },
  {
    id: 'executive',
    label: 'Executive brief',
    helper: 'Concise and outcome-oriented.',
    instruction: 'Use concise, executive-ready language and highlight impact and decisions clearly.',
  },
  {
    id: 'data',
    label: 'Data storyteller',
    helper: 'Lean on evidence and signals.',
    instruction: 'Emphasize metrics, evidence, and observable signals when making recommendations.',
  },
];

const formatOptions: FormatOption[] = [
  { id: 'default', label: 'Let ChatGPT choose', helper: 'No extra formatting.' },
  {
    id: 'bullets',
    label: 'Bullet list',
    helper: 'Crisp list output.',
    instruction: 'Present the response as a tight markdown bullet list.',
  },
  {
    id: 'table',
    label: 'Table',
    helper: 'Side-by-side comparison.',
    instruction:
      'Return the answer as a markdown table with clear column headers that fit the content.',
  },
  {
    id: 'email',
    label: 'Email ready',
    helper: 'Subject, greeting, closing.',
    instruction:
      'Format the response as an email with a subject line, greeting, body paragraphs, and a concise closing.',
  },
];

const boosterInstruction =
  'After providing the main response, include three follow-up questions I can ask stakeholders or ChatGPT to keep the momentum going.';

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const formatLabel = (raw: string) => {
  const [labelPart] = raw.split(':');
  if (!labelPart) return raw;
  return labelPart
    .trim()
    .split(/[\s/]+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ');
};

const formatHint = (raw: string) => {
  const parts = raw.split(':');
  if (parts.length < 2) return undefined;
  return parts
    .slice(1)
    .join(':')
    .trim();
};

const getCategoryById = (id: string): PromptCategory => {
  const found = promptCategories.find((category) => category.id === id);
  return found ?? promptCategories[0];
};

export default function PromptPackTool() {
  const [categoryId, setCategoryId] = useState(promptCategories[0]?.id ?? '');
  const [useCaseIndex, setUseCaseIndex] = useState(0);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [tone, setTone] = useState<ToneOption['id']>('default');
  const [format, setFormat] = useState<FormatOption['id']>('default');
  const [includeBooster, setIncludeBooster] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const selectedCategory = useMemo(
    () => getCategoryById(categoryId),
    [categoryId],
  );

  useEffect(() => {
    setUseCaseIndex(0);
  }, [categoryId]);

  const selectedItem = selectedCategory.items[useCaseIndex] ?? selectedCategory.items[0];

  useEffect(() => {
    setCustomValues({});
    setTone('default');
    setFormat('default');
    setIncludeBooster(false);
    setCopyState('idle');
  }, [selectedItem]);

  const placeholders = useMemo<PlaceholderField[]>(() => {
    if (!selectedItem) return [];
    const seen = new Map<string, PlaceholderField>();
    const pattern = /\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(selectedItem.prompt)) !== null) {
      const raw = match[1].trim();
      const key = slugify(raw);
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          raw,
          label: formatLabel(raw),
          hint: formatHint(raw),
        });
      }
    }
    return Array.from(seen.values());
  }, [selectedItem]);

  const missingCount = useMemo(
    () =>
      placeholders.filter((placeholder) => !customValues[placeholder.key]?.trim())
        .length,
    [customValues, placeholders],
  );

  const toneInstruction = useMemo(
    () => toneOptions.find((option) => option.id === tone)?.instruction ?? '',
    [tone],
  );

  const formatInstruction = useMemo(
    () => formatOptions.find((option) => option.id === format)?.instruction ?? '',
    [format],
  );

  const finalPrompt = useMemo(() => {
    if (!selectedItem) return '';
    const base = selectedItem.prompt.replace(/\[([^\]]+)\]/g, (_match, rawValue) => {
      const key = slugify(String(rawValue));
      const customValue = customValues[key];
      return customValue && customValue.trim() ? customValue.trim() : `[${rawValue}]`;
    });

    const additions = [toneInstruction, formatInstruction];
    if (includeBooster) additions.push(boosterInstruction);

    const extra = additions.filter(Boolean).join('\n\n');
    return extra ? `${base}\n\n${extra}` : base;
  }, [customValues, formatInstruction, includeBooster, selectedItem, toneInstruction]);

  const handleCopy = async () => {
    if (!finalPrompt) return;
    try {
      await navigator.clipboard.writeText(finalPrompt);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2200);
    } catch {
      setCopyState('error');
    }
  };

  const handleOpenInChatGPT = () => {
    if (!finalPrompt) return;
    const encoded = encodeURIComponent(finalPrompt);
    const url = `https://chatgpt.com/?prompt=${encoded}`;
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener');
    }
  };

  const readyState =
    missingCount === 0
      ? 'Ready to run'
      : missingCount === 1
        ? 'Fill the last placeholder to lock it in.'
        : `Fill ${missingCount} placeholders to personalize the prompt.`;

  return (
    <div className="card prompt-card" data-voice="ai">
      <header className="prompt-header">
        <div>
          <h1>Work Prompt Studio</h1>
          <p className="muted">
            Explore the <a href="https://academy.openai.com/public/clubs/work-users-ynjqu/resources/chatgpt-for-any-role" target="_blank" rel="noreferrer">ChatGPT for any role</a> prompt pack with interactive controls to tailor each prompt before you run it.
          </p>
        </div>
        <div className="prompt-header-badge">Prompt Pack</div>
      </header>

      <div className="prompt-layout">
        <aside className="prompt-sidebar">
          <span className="prompt-sidebar-label">Focus area</span>
          <div className="prompt-category-list">
            {promptCategories.map((category) => {
              const isActive = category.id === selectedCategory.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  className={`prompt-category-button${isActive ? ' active' : ''}`}
                  onClick={() => setCategoryId(category.id)}
                  aria-pressed={isActive}
                >
                  <span className="prompt-category-title">{category.title}</span>
                  <span className="prompt-category-description">{category.description}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="prompt-main">
          <div>
            <span className="prompt-section-label">Use case</span>
            <div className="prompt-usecase-list">
              {selectedCategory.items.map((item, index) => {
                const isActive = index === useCaseIndex;
                return (
                  <button
                    key={item.useCase}
                    type="button"
                    className={`prompt-usecase-button${isActive ? ' active' : ''}`}
                    onClick={() => setUseCaseIndex(index)}
                    aria-pressed={isActive}
                  >
                    {item.useCase}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="prompt-fields">
            <span className="prompt-section-label">Personalize it</span>
            {placeholders.length === 0 ? (
              <p className="muted">No variables to fill in—this one is ready to launch.</p>
            ) : (
              <div className="prompt-placeholder-grid">
                {placeholders.map((placeholder) => (
                  <label key={placeholder.key} className="prompt-field">
                    <span className="prompt-field-title">{placeholder.label}</span>
                    {placeholder.hint ? (
                      <span className="prompt-field-hint">{placeholder.hint}</span>
                    ) : (
                      <span className="prompt-field-hint">{placeholder.raw}</span>
                    )}
                    <input
                      value={customValues[placeholder.key] ?? ''}
                      onChange={(event) =>
                        setCustomValues((prev) => ({
                          ...prev,
                          [placeholder.key]: event.target.value,
                        }))
                      }
                      placeholder={placeholder.raw}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="prompt-settings">
            <div className="prompt-setting">
              <label className="prompt-setting-label">
                Tone
                <select value={tone} onChange={(event) => setTone(event.target.value)}>
                  {toneOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="prompt-setting-helper">
                {toneOptions.find((option) => option.id === tone)?.helper}
              </p>
            </div>

            <div className="prompt-setting">
              <label className="prompt-setting-label">
                Format
                <select value={format} onChange={(event) => setFormat(event.target.value)}>
                  {formatOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="prompt-setting-helper">
                {formatOptions.find((option) => option.id === format)?.helper}
              </p>
            </div>

            <label className="prompt-booster">
              <input
                type="checkbox"
                checked={includeBooster}
                onChange={(event) => setIncludeBooster(event.target.checked)}
              />
              <span>Ask for follow-up questions</span>
            </label>
          </div>

          <div className="prompt-output-card">
            <div className="prompt-output-header">
              <div>
                <span className="prompt-section-label">Prompt preview</span>
                <p className="prompt-status">{readyState}</p>
              </div>
              <div className="prompt-actions">
                <button type="button" className="button" onClick={handleCopy} disabled={!finalPrompt}>
                  Copy prompt
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={handleOpenInChatGPT}
                  disabled={!finalPrompt}
                >
                  Launch in ChatGPT
                </button>
              </div>
            </div>
            <div className="preview-block">{finalPrompt}</div>
            <div className="prompt-footer">
              {copyState === 'copied' && <span className="prompt-feedback success">Copied!</span>}
              {copyState === 'error' && (
                <span className="prompt-feedback">Clipboard blocked. Paste manually instead.</span>
              )}
              <a
                href={selectedItem.url}
                target="_blank"
                rel="noreferrer"
                className="prompt-source-link"
              >
                View the original pack prompt →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
