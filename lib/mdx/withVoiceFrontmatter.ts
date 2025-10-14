import type { Plugin } from 'unified';
import type { Root } from 'mdast';
import matter from 'gray-matter';

type VoiceAuthor = 'ai' | 'human' | 'unified';

type FrontmatterShape = {
  author?: string;
};

interface MdxjsEsmNode {
  type: 'mdxjsEsm';
  value: string;
  data?: {
    estree?: import('estree').Program;
  };
}

const VALID_AUTHORS: VoiceAuthor[] = ['ai', 'human', 'unified'];

function isVoiceAuthor(value: unknown): value is VoiceAuthor {
  return typeof value === 'string' && (VALID_AUTHORS as string[]).includes(value);
}

function normaliseVoice(value: unknown): VoiceAuthor {
  if (isVoiceAuthor(value)) return value;
  if (typeof value === 'string') {
    const candidate = value.trim().toLowerCase();
    if (isVoiceAuthor(candidate)) return candidate;
  }
  return 'unified';
}

function createVoiceExportNode(voice: VoiceAuthor): MdxjsEsmNode {
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

const withVoiceFrontmatter: Plugin<[], Root> = () => (tree, file) => {
  const fileData = file.data as Record<string, unknown>;
  const potentialSources: Array<Record<string, unknown> | undefined> = [
    fileData.matter as Record<string, unknown> | undefined,
    fileData.frontmatter as Record<string, unknown> | undefined,
    fileData.mdxFrontmatter as Record<string, unknown> | undefined,
  ];

  let author: unknown;

  for (const source of potentialSources) {
    if (source && typeof source === 'object' && 'author' in source) {
      author = (source as FrontmatterShape).author;
      break;
    }
  }

  if (author === undefined) {
    try {
      const parsed = matter(String(file.value ?? ''));
      author = (parsed.data as FrontmatterShape | undefined)?.author;
    } catch {
      // fall back silently
    }
  }

  const voice = normaliseVoice(author);

  fileData.voiceAuthor = voice;

  const existingIndex = tree.children.findIndex(
    (node) => node.type === 'mdxjsEsm' && typeof (node as MdxjsEsmNode).value === 'string' && (node as MdxjsEsmNode).value.includes('voiceAuthor'),
  );

  if (existingIndex >= 0) {
    tree.children.splice(existingIndex, 1);
  }

  tree.children.unshift(createVoiceExportNode(voice));
};

export default withVoiceFrontmatter;
