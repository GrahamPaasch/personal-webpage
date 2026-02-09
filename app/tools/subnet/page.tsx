import SubnetTool from './subnet-tool';

export const metadata = {
  title: 'IPv4 Subnet Planner',
  description: 'CIDR calculator and subnet splitter for quick network planning.',
  alternates: { canonical: '/tools/subnet' },
};

export default function SubnetToolPage() {
  return (
    <section className="grid">
      <SubnetTool />
    </section>
  );
}

