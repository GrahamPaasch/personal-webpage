import type { Plugin } from 'unified';
import type { Root, Element } from 'hast';
import { h } from 'hastscript';

type VoiceAuthor = 'ai' | 'human' | 'unified';

const VALID_AUTHORS: VoiceAuthor[] = ['ai', 'human', 'unified'];

function isVoiceAuthor(value: unknown): value is VoiceAuthor {
  return typeof value === 'string' && (VALID_AUTHORS as string[]).includes(value);
}

const rehypeWrapVoice: Plugin<[], Root> = () => (tree, file) => {
  const fileData = file.data as Record<string, unknown>;
  const candidate = fileData.voiceAuthor;
  const voice: VoiceAuthor = isVoiceAuthor(candidate) ? candidate : 'unified';
  fileData.voiceAuthor = voice;

  const firstChild = tree.children[0];
  if (
    firstChild &&
    firstChild.type === 'element' &&
    firstChild.properties &&
    typeof firstChild.properties === 'object' &&
    'data-voice' in firstChild.properties
  ) {
    return;
  }

  const wrapper = h('section', { 'data-voice': voice }, tree.children) as Element;
  tree.children = [wrapper];
};

export default rehypeWrapVoice;
