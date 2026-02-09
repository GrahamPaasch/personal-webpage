import BgpCommunityTool from './bgp-tool';

export const metadata = {
  title: 'BGP Community Decoder',
  description: 'Decode and normalize standard, large, and common extended BGP community formats.',
  alternates: { canonical: '/tools/bgp-communities' },
};

export default function BgpCommunitiesPage() {
  return (
    <section className="grid">
      <BgpCommunityTool />
    </section>
  );
}

