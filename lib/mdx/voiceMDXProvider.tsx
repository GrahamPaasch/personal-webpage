import React, { createContext, useContext, useMemo } from 'react';
import { MDXProvider } from '@mdx-js/react';
import type { MDXComponents } from 'mdx/types';

export type VoiceAuthor = 'ai' | 'human' | 'unified';

interface VoiceMDXProviderProps {
  voiceAuthor?: VoiceAuthor;
  children: React.ReactNode;
}

const VALID_AUTHORS: VoiceAuthor[] = ['ai', 'human', 'unified'];

function isVoiceAuthor(value: unknown): value is VoiceAuthor {
  return typeof value === 'string' && (VALID_AUTHORS as string[]).includes(value);
}

const VoiceContext = createContext<VoiceAuthor>('unified');

export function useVoiceAuthor(): VoiceAuthor {
  return useContext(VoiceContext);
}

export function VoiceWrapper({ children }: { children: React.ReactNode }) {
  const voice = useVoiceAuthor();
  const collected = React.Children.toArray(children);

  if (
    collected.length === 1 &&
    React.isValidElement(collected[0]) &&
    typeof (collected[0] as React.ReactElement).props?.['data-voice'] === 'string'
  ) {
    return <>{children}</>;
  }

  return <section data-voice={voice}>{children}</section>;
}

const baseComponents: MDXComponents = {
  blockquote: (props) => <blockquote data-voice="human" {...props} />,
  pre: (props) => <pre data-voice="ai" {...props} />,
  code: (props) => <code data-voice="ai" {...props} />,
  table: (props) => <table data-voice="unified" {...props} />,
  wrapper: VoiceWrapper,
};

export function VoiceMDXProvider({ children, voiceAuthor }: VoiceMDXProviderProps) {
  const inferredVoice = useMemo<VoiceAuthor>(() => {
    if (isVoiceAuthor(voiceAuthor)) return voiceAuthor;

    const childArray = React.Children.toArray(children);
    if (
      childArray.length > 0 &&
      React.isValidElement(childArray[0]) &&
      typeof (childArray[0] as React.ReactElement).props?.['data-voice'] === 'string'
    ) {
      const candidate = String((childArray[0] as React.ReactElement).props['data-voice']).toLowerCase();
      if (isVoiceAuthor(candidate)) return candidate;
    }

    return 'unified';
  }, [children, voiceAuthor]);

  const components = useMemo(() => baseComponents, []);

  return (
    <VoiceContext.Provider value={inferredVoice}>
      <MDXProvider components={components}>{children}</MDXProvider>
    </VoiceContext.Provider>
  );
}
