import React from 'react';
import { VoiceMDXProvider } from '@/lib/mdx/voiceMDXProvider';

type VoiceLayoutProps = {
  children: React.ReactNode;
};

export default function VoiceLayout({ children }: VoiceLayoutProps) {
  return <VoiceMDXProvider>{children}</VoiceMDXProvider>;
}
