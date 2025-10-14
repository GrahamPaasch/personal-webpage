import matter from 'gray-matter';

const VALID_AUTHORS = new Set(['ai', 'human', 'unified']);

/**
 * @param {unknown} value
 * @returns {'ai' | 'human' | 'unified'}
 */
function normaliseVoice(value) {
  if (typeof value === 'string') {
    const candidate = value.trim().toLowerCase();
    if (VALID_AUTHORS.has(candidate)) {
      return /** @type {'ai' | 'human' | 'unified'} */ (candidate);
    }
  }
  return 'unified';
}

/**
 * @param {'ai' | 'human' | 'unified'} voice
 * @returns {import('mdast').Node}
 */
function createVoiceExportNode(voice) {
  return {
    type: 'mdxjsEsm',
    value: `export const voiceAuthor = '${voice}';`,
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        body: [
          {
            type: 'ExportNamedDeclaration',
            declaration: {
              type: 'VariableDeclaration',
              kind: 'const',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: {
                    type: 'Identifier',
                    name: 'voiceAuthor',
                  },
                  init: {
                    type: 'Literal',
                    value: voice,
                    raw: `'${voice}'`,
                  },
                },
              ],
            },
            specifiers: [],
            source: null,
          },
        ],
      },
    },
  };
}

/**
 * @returns {import('unified').Transformer<import('mdast').Root>}
 */
function withVoiceFrontmatter() {
  return (tree, file) => {
    const fileData = /** @type {Record<string, unknown>} */ (file.data || {});
    const potentialSources = [
      fileData.matter,
      fileData.frontmatter,
      fileData.mdxFrontmatter,
    ];

    let author;
    for (const source of potentialSources) {
      if (source && typeof source === 'object' && 'author' in source) {
        author = /** @type {Record<string, unknown>} */ (source).author;
        break;
      }
    }

    if (author === undefined) {
      try {
        const parsed = matter(String(file.value ?? ''));
        author = parsed.data?.author;
      } catch {
        // ignore parse errors and fall back to unified
      }
    }

    const voice = normaliseVoice(author);
    fileData.voiceAuthor = voice;
    file.data = fileData;

    const existingIndex = tree.children.findIndex(
      (node) => node.type === 'mdxjsEsm' && typeof node.value === 'string' && node.value.includes('voiceAuthor'),
    );

    if (existingIndex >= 0) {
      tree.children.splice(existingIndex, 1);
    }

    tree.children.unshift(createVoiceExportNode(voice));
  };
}

export default withVoiceFrontmatter;
