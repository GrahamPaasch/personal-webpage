'use client';

import { ChangeEvent } from 'react';
import { useMemo, useState } from 'react';

type Experience = {
  id: string;
  company: string;
  title: string;
  location: string;
  start: string;
  end: string;
  bullets: string[];
  summary: string;
};

type ResumeData = {
  contact: {
    name: string;
    location: string;
    email: string;
    phone: string;
    website: string;
  };
  summary: string;
  skills: string;
  education: string;
  certifications: string;
  experiences: Experience[];
  extras: string;
};

const createId = () =>
  (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

const createExperience = (): Experience => ({
  id: createId(),
  company: '',
  title: '',
  location: '',
  start: '',
  end: '',
  bullets: [''],
  summary: '',
});

const initialData: ResumeData = {
  contact: {
    name: '',
    location: '',
    email: '',
    phone: '',
    website: '',
  },
  summary: '',
  skills: '',
  education: '',
  certifications: '',
  experiences: [createExperience()],
  extras: '',
};

const safeSplit = (text: string) =>
  text
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

const formatRange = (start?: string, end?: string) => {
  const s = start?.trim();
  const e = end?.trim();
  if (s && e) return `${s} – ${e}`;
  if (s) return `${s} – Present`;
  if (e) return e;
  return '';
};

export default function ResumeTool() {
  const [data, setData] = useState<ResumeData>(initialData);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const skillsList = useMemo(() => safeSplit(data.skills), [data.skills]);
  const educationList = useMemo(() => safeSplit(data.education), [data.education]);
  const certificationList = useMemo(
    () => safeSplit(data.certifications),
    [data.certifications],
  );
  const extrasList = useMemo(() => safeSplit(data.extras), [data.extras]);

  const plainText = useMemo(() => {
    const lines: string[] = [];
    const { contact } = data;
    if (contact.name) lines.push(contact.name);
    const topLine = [contact.location, contact.email, contact.phone, contact.website]
      .map((item) => item.trim())
      .filter(Boolean)
      .join(' • ');
    if (topLine) lines.push(topLine);

    if (data.summary.trim()) {
      lines.push('', data.summary.trim());
    }

    if (skillsList.length) {
      lines.push('');
      lines.push('Skills');
      lines.push(...skillsList.map((skill) => `- ${skill}`));
    }

    if (data.experiences.length) {
      lines.push('');
      lines.push('Experience');
      data.experiences.forEach((exp) => {
        if (!exp.company && !exp.title) return;
        lines.push('');
        const heading = [exp.title, exp.company].filter(Boolean).join(' — ');
        if (heading) lines.push(heading);
        const subheading = [exp.location, formatRange(exp.start, exp.end)]
          .filter(Boolean)
          .join(' | ');
        if (subheading) lines.push(subheading);
        if (exp.summary.trim()) lines.push(exp.summary.trim());
        exp.bullets
          .map((bullet) => bullet.trim())
          .filter(Boolean)
          .forEach((bullet) => lines.push(`- ${bullet}`));
      });
    }

    if (educationList.length) {
      lines.push('');
      lines.push('Education');
      educationList.forEach((item) => lines.push(`- ${item}`));
    }

    if (certificationList.length) {
      lines.push('');
      lines.push('Certifications');
      certificationList.forEach((item) => lines.push(`- ${item}`));
    }

    if (extrasList.length) {
      lines.push('');
      lines.push('Additional');
      extrasList.forEach((item) => lines.push(`- ${item}`));
    }

    return lines.join('\n').trim();
  }, [
    certificationList,
    data.contact,
    data.experiences,
    data.summary,
    educationList,
    extrasList,
    skillsList,
  ]);

  const markdown = useMemo(() => {
    const lines: string[] = [];
    const { contact } = data;
    if (contact.name) lines.push(`# ${contact.name}`);
    const subline = [contact.location, contact.email, contact.phone, contact.website]
      .map((item) => item.trim())
      .filter(Boolean)
      .join(' • ');
    if (subline) lines.push(subline);

    if (data.summary.trim()) {
      lines.push('', data.summary.trim());
    }

    if (skillsList.length) {
      lines.push('', '## Skills');
      skillsList.forEach((skill) => lines.push(`- ${skill}`));
    }

    if (data.experiences.length) {
      lines.push('', '## Experience');
      data.experiences.forEach((exp) => {
        if (!exp.company && !exp.title) return;
        const heading = [exp.title, exp.company].filter(Boolean).join(' — ');
        if (heading) lines.push(`### ${heading}`);
        const subheading = [exp.location, formatRange(exp.start, exp.end)]
          .filter(Boolean)
          .join(' | ');
        if (subheading) lines.push(subheading);
        if (exp.summary.trim()) lines.push(exp.summary.trim());
        exp.bullets
          .map((bullet) => bullet.trim())
          .filter(Boolean)
          .forEach((bullet) => lines.push(`- ${bullet}`));
        lines.push('');
      });
    }

    if (educationList.length) {
      lines.push('## Education');
      educationList.forEach((item) => lines.push(`- ${item}`));
    }

    if (certificationList.length) {
      lines.push('', '## Certifications');
      certificationList.forEach((item) => lines.push(`- ${item}`));
    }

    if (extrasList.length) {
      lines.push('', '## Additional');
      extrasList.forEach((item) => lines.push(`- ${item}`));
    }

    return lines.join('\n').trim();
  }, [
    certificationList,
    data.contact,
    data.experiences,
    data.summary,
    educationList,
    extrasList,
    skillsList,
  ]);

  const json = useMemo(() => JSON.stringify(data, null, 2), [data]);

  const updateExperience = (id: string, update: Partial<Experience>) => {
    setData((prev) => ({
      ...prev,
      experiences: prev.experiences.map((exp) =>
        exp.id === id ? { ...exp, ...update } : exp,
      ),
    }));
  };

  const updateExperienceBullet = (id: string, index: number, value: string) => {
    setData((prev) => ({
      ...prev,
      experiences: prev.experiences.map((exp) => {
        if (exp.id !== id) return exp;
        const next = [...exp.bullets];
        next[index] = value;
        return { ...exp, bullets: next };
      }),
    }));
  };

  const addExperienceBullet = (id: string) => {
    setData((prev) => ({
      ...prev,
      experiences: prev.experiences.map((exp) =>
        exp.id === id ? { ...exp, bullets: [...exp.bullets, ''] } : exp,
      ),
    }));
  };

  const removeExperienceBullet = (id: string, index: number) => {
    setData((prev) => ({
      ...prev,
      experiences: prev.experiences.map((exp) => {
        if (exp.id !== id) return exp;
        const next = exp.bullets.filter((_, idx) => idx !== index);
        return { ...exp, bullets: next.length ? next : [''] };
      }),
    }));
  };

  const addExperience = () => {
    setData((prev) => ({
      ...prev,
      experiences: [...prev.experiences, createExperience()],
    }));
  };

  const removeExperience = (id: string) => {
    setData((prev) => ({
      ...prev,
      experiences:
        prev.experiences.length > 1
          ? prev.experiences.filter((exp) => exp.id !== id)
          : prev.experiences,
    }));
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopyFeedback(`${label} copied to clipboard.`);
        setTimeout(() => setCopyFeedback(null), 2500);
      } else {
        throw new Error('Clipboard API not available');
      }
    } catch {
      window.prompt(`Copy ${label}`, text);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'resume.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const sanitizeResumeData = (raw: unknown): ResumeData | null => {
    if (!raw || typeof raw !== 'object') return null;
    const source = raw as Partial<ResumeData>;
    const contact = {
      name: source.contact?.name ?? '',
      location: source.contact?.location ?? '',
      email: source.contact?.email ?? '',
      phone: source.contact?.phone ?? '',
      website: source.contact?.website ?? '',
    };

    const experiences: Experience[] = Array.isArray(source.experiences)
      ? source.experiences.map((entry) => {
          if (!entry || typeof entry !== 'object') return createExperience();
          const exp = entry as Partial<Experience>;
          const bulletList = Array.isArray(exp.bullets)
            ? exp.bullets
                .map((bullet) => (typeof bullet === 'string' ? bullet : ''))
                .filter((bullet) => bullet !== '')
            : [];
          return {
            id: typeof exp.id === 'string' && exp.id.trim() ? exp.id : createId(),
            company: exp.company ?? '',
            title: exp.title ?? '',
            location: exp.location ?? '',
            start: exp.start ?? '',
            end: exp.end ?? '',
            summary: exp.summary ?? '',
            bullets: bulletList.length ? bulletList : [''],
          };
        })
      : [];

    return {
      contact,
      summary: source.summary ?? '',
      skills: source.skills ?? '',
      education: source.education ?? '',
      certifications: source.certifications ?? '',
      experiences: experiences.length ? experiences : [createExperience()],
      extras: source.extras ?? '',
    };
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const normalized = sanitizeResumeData(parsed);
      if (!normalized) throw new Error('Unrecognized format');
      setData(normalized);
      setImportFeedback(`Loaded ${file.name}.`);
      setTimeout(() => setImportFeedback(null), 3000);
    } catch (error) {
      console.error('Resume import failed', error);
      setImportFeedback('Upload failed. Please provide a JSON export created by this tool.');
      setTimeout(() => setImportFeedback(null), 5000);
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="resume-tool">
      <div className="card">
        <h1>Resume Field Kit</h1>
        <p>
          A free, ATS-friendly resume builder that keeps your content in structured text
          so you never fight formatting again. Write once, reuse everywhere, and export
          Markdown, plain text, or JSON for any platform.
        </p>
        <ul>
          <li>No tables, columns, or hidden styles that ATS filters reject.</li>
          <li>Modular sections and bullet lists you can toggle, expand, or remix fast.</li>
          <li>Source-of-truth friendly: export the JSON and keep it in Git alongside your content.</li>
        </ul>
        <div className="import-row">
          <label className="rt-upload">
            <input type="file" accept="application/json" onChange={handleImport} />
            <span>Upload resume JSON</span>
          </label>
          <span className="muted small">
            Import an earlier export to pick up where you left off.
          </span>
        </div>
        {importFeedback ? <p className="muted">{importFeedback}</p> : null}
        {copyFeedback ? <p className="muted">{copyFeedback}</p> : null}
      </div>

      <div className="resume-tool-grid">
        <section className="card resume-panel">
          <h2>Authoring</h2>
          <p className="muted">
            Fill out each section below. Every change updates the previews instantly. Use
            one bullet per line to keep things modular.
          </p>

          <form className="resume-form">
            <fieldset>
              <legend>Contact</legend>
              <div className="form-grid">
                <label>
                  Name
                  <input
                    value={data.contact.name}
                    onChange={(event) =>
                      setData((prev) => ({
                        ...prev,
                        contact: { ...prev.contact, name: event.target.value },
                      }))
                    }
                    placeholder="Your name"
                  />
                </label>
                <label>
                  Location
                  <input
                    value={data.contact.location}
                    onChange={(event) =>
                      setData((prev) => ({
                        ...prev,
                        contact: { ...prev.contact, location: event.target.value },
                      }))
                    }
                    placeholder="City, ST"
                  />
                </label>
                <label>
                  Email
                  <input
                    value={data.contact.email}
                    onChange={(event) =>
                      setData((prev) => ({
                        ...prev,
                        contact: { ...prev.contact, email: event.target.value },
                      }))
                    }
                    placeholder="you@example.com"
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={data.contact.phone}
                    onChange={(event) =>
                      setData((prev) => ({
                        ...prev,
                        contact: { ...prev.contact, phone: event.target.value },
                      }))
                    }
                    placeholder="555-123-4567"
                  />
                </label>
                <label>
                  Website or Portfolio
                  <input
                    value={data.contact.website}
                    onChange={(event) =>
                      setData((prev) => ({
                        ...prev,
                        contact: { ...prev.contact, website: event.target.value },
                      }))
                    }
                    placeholder="https://yourdomain.com"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Summary</legend>
              <textarea
                rows={4}
                value={data.summary}
                onChange={(event) =>
                  setData((prev) => ({ ...prev, summary: event.target.value }))
                }
                placeholder="One or two sentences that anchor your value proposition."
              />
            </fieldset>

            <fieldset>
              <legend>Skills</legend>
              <textarea
                rows={4}
                value={data.skills}
                onChange={(event) =>
                  setData((prev) => ({ ...prev, skills: event.target.value }))
                }
                placeholder="One skill per line (e.g., Network Automation, Python, Terraform)"
              />
            </fieldset>

            <fieldset>
              <legend>Experience</legend>
              <p className="muted">
                Keep job titles and companies separate so you can reuse snippets across
                different resume versions.
              </p>
              <div className="experience-list">
                {data.experiences.map((exp) => (
                  <div key={exp.id} className="experience-card">
                    <div className="experience-header">
                      <strong>
                        {exp.title || 'Role'}, {exp.company || 'Company'}
                      </strong>
                      <div className="experience-actions">
                        <button
                          type="button"
                          className="rt-button danger"
                          onClick={() => removeExperience(exp.id)}
                          disabled={data.experiences.length === 1}
                          title="Remove experience"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="form-grid">
                      <label>
                        Title
                        <input
                          value={exp.title}
                          onChange={(event) =>
                            updateExperience(exp.id, { title: event.target.value })
                          }
                          placeholder="Senior Network Automation Engineer"
                        />
                      </label>
                      <label>
                        Company
                        <input
                          value={exp.company}
                          onChange={(event) =>
                            updateExperience(exp.id, { company: event.target.value })
                          }
                          placeholder="Google Fiber"
                        />
                      </label>
                      <label>
                        Location
                        <input
                          value={exp.location}
                          onChange={(event) =>
                            updateExperience(exp.id, { location: event.target.value })
                          }
                          placeholder="Austin, TX · Remote"
                        />
                      </label>
                      <label>
                        Start
                        <input
                          value={exp.start}
                          onChange={(event) =>
                            updateExperience(exp.id, { start: event.target.value })
                          }
                          placeholder="Jan 2024"
                        />
                      </label>
                      <label>
                        End
                        <input
                          value={exp.end}
                          onChange={(event) =>
                            updateExperience(exp.id, { end: event.target.value })
                          }
                          placeholder="Oct 2024 or Present"
                        />
                      </label>
                    </div>
                    <label>
                      Overview
                      <textarea
                        rows={3}
                        value={exp.summary}
                        onChange={(event) =>
                          updateExperience(exp.id, { summary: event.target.value })
                        }
                        placeholder="One sentence describing scope and mission impact."
                      />
                    </label>
                    <div className="bullets">
                      <span className="bullets-label">Highlights (one per bullet)</span>
                      {exp.bullets.map((bullet, index) => (
                        <div key={`${exp.id}-bullet-${index}`} className="bullet-row">
                          <textarea
                            rows={2}
                            value={bullet}
                            onChange={(event) =>
                              updateExperienceBullet(exp.id, index, event.target.value)
                            }
                            placeholder="Automated PyATS validation for FTTH lab covering MX/SRX, Nokia OLT/BNG, GPON, and XGSPON."
                          />
                          <button
                            type="button"
                            className="rt-button danger"
                            onClick={() => removeExperienceBullet(exp.id, index)}
                            title="Remove bullet"
                            disabled={exp.bullets.length === 1}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="rt-button"
                        onClick={() => addExperienceBullet(exp.id)}
                      >
                        Add bullet
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="rt-button" onClick={addExperience}>
                Add another experience
              </button>
            </fieldset>

            <fieldset>
              <legend>Education</legend>
              <textarea
                rows={3}
                value={data.education}
                onChange={(event) =>
                  setData((prev) => ({ ...prev, education: event.target.value }))
                }
                placeholder="One credential per line (e.g., B.S. Computer Science — University of Wisconsin, 2015)"
              />
            </fieldset>

            <fieldset>
              <legend>Certifications</legend>
              <textarea
                rows={3}
                value={data.certifications}
                onChange={(event) =>
                  setData((prev) => ({ ...prev, certifications: event.target.value }))
                }
                placeholder="One certification per line (e.g., CCNP Enterprise — 2022)"
              />
            </fieldset>

            <fieldset>
              <legend>Additional Highlights</legend>
              <textarea
                rows={3}
                value={data.extras}
                onChange={(event) =>
                  setData((prev) => ({ ...prev, extras: event.target.value }))
                }
                placeholder="Community work, publications, volunteer roles — one per line."
              />
            </fieldset>
          </form>
        </section>

        <section className="card resume-panel">
          <h2>Outputs</h2>
          <p className="muted">
            Copy the preview that fits your workflow. Plain text is the safest for ATS,
            Markdown works with Git-based pipelines, and JSON gives you a source-of-truth
            snapshot.
          </p>

          <div className="preview-card">
            <div className="preview-header">
              <h3>Plain Text</h3>
              <button
                type="button"
                className="rt-button"
                onClick={() => handleCopy(plainText, 'Plain text resume')}
              >
                Copy
              </button>
            </div>
            <pre className="preview-block">{plainText || 'Your plain text resume will appear here as you type.'}</pre>
          </div>

          <div className="preview-card">
            <div className="preview-header">
              <h3>Markdown</h3>
              <button
                type="button"
                className="rt-button"
                onClick={() => handleCopy(markdown, 'Markdown resume')}
              >
                Copy
              </button>
            </div>
            <pre className="preview-block">{markdown || 'Add content to generate Markdown output with headings and bullet lists.'}</pre>
          </div>

          <div className="preview-card">
            <div className="preview-header">
              <h3>JSON</h3>
              <div className="preview-actions">
                <button
                  type="button"
                  className="rt-button"
                  onClick={() => handleCopy(json, 'Resume JSON')}
                >
                  Copy
                </button>
                <button type="button" className="rt-button" onClick={handleDownload}>
                  Download
                </button>
              </div>
            </div>
            <pre className="preview-block json">{json}</pre>
          </div>
        </section>
      </div>
    </div>
  );
}
