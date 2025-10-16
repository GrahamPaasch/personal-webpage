import ResumeTool from './resume-tool';

export const metadata = {
  title: 'Resume Field Kit',
  description:
    'Build an ATS-friendly, modular resume and export Markdown, plain text, or JSON straight from the canonical content.',
  alternates: { canonical: '/resume-tool' },
};

export default function ResumeToolPage() {
  return <ResumeTool />;
}
