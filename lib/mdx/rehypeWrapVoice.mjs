import { h } from 'hastscript';

const VALID_AUTHORS = new Set(['ai', 'human', 'unified']);

/**
 * @param {unknown} value
 * @returns {'ai' | 'human' | 'unified'}
 */
function resolveVoice(value) {
  if (typeof value === 'string') {
    const candidate = value.toLowerCase();
    if (VALID_AUTHORS.has(candidate)) {
      return /** @type {'ai' | 'human' | 'unified'} */ (candidate);
    }
  }
  return 'unified';
}

/**
 * @returns {import('unified').Transformer<import('hast').Root>}
 */
function rehypeWrapVoice() {
  return (tree, file) => {
    const fileData = /** @type {Record<string, unknown>} */ (file.data || {});
    const voice = resolveVoice(fileData.voiceAuthor);
    fileData.voiceAuthor = voice;
    file.data = fileData;

    const firstChild = tree.children[0];
    if (
      firstChild &&
      firstChild.type === 'element' &&
      firstChild.properties &&
      typeof firstChild.properties === 'object' &&
      Object.prototype.hasOwnProperty.call(firstChild.properties, 'data-voice')
    ) {
      return;
    }

    const wrapper = /** @type {import('hast').Element} */ (
      h('section', { 'data-voice': voice }, tree.children)
    );
    tree.children = [wrapper];
  };
}

export default rehypeWrapVoice;
