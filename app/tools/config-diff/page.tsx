import ConfigDiffTool from './config-diff-tool';

export const metadata = {
  title: 'Config Diff Viewer',
  description: 'Compare two network configs and get a readable line diff.',
  alternates: { canonical: '/tools/config-diff' },
};

export default function ConfigDiffPage() {
  return (
    <section className="grid">
      <ConfigDiffTool />
    </section>
  );
}

