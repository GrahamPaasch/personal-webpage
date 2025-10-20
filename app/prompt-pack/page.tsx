import PromptPackTool from './prompt-pack';

export const metadata = {
  title: 'Work Prompt Studio',
  description:
    'A playful frontend for the ChatGPT “For Work” prompt pack. Mix-and-match a role-focused use case, fill in details, and send it straight to ChatGPT.',
  alternates: { canonical: '/prompt-pack' },
};

export default function PromptPackPage() {
  return (
    <section className="grid">
      <PromptPackTool />
    </section>
  );
}
