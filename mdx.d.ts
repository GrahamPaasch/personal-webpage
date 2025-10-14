/// <reference types="mdx" />

declare module '*.mdx' {
  export const voiceAuthor: import('./lib/mdx/voiceMDXProvider').VoiceAuthor;
  const MDXComponent: (props: Record<string, unknown>) => JSX.Element;
  export default MDXComponent;
}
