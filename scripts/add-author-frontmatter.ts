#!/usr/bin/env ts-node
/**
 * Batch helper to ensure every MDX file has an `author` frontmatter value.
 *
 * Usage:
 *   ts-node scripts/add-author-frontmatter.ts           # dry run
 *   ts-node scripts/add-author-frontmatter.ts --write  # apply changes
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import matter from 'gray-matter';

type VoiceAuthor = 'ai' | 'human' | 'unified';

const ROOT = path.resolve(process.cwd(), 'content');

const WRITE_FLAG = process.argv.includes('--write');
const DRY_RUN = !WRITE_FLAG;

function inferAuthor(filePath: string): VoiceAuthor {
  if (filePath.includes(`${path.sep}agents${path.sep}`)) return 'ai';
  if (filePath.includes(`${path.sep}writings${path.sep}`)) return 'human';
  return 'unified';
}

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const resolved = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectFiles(resolved);
      if (entry.isFile() && (resolved.endsWith('.mdx') || resolved.endsWith('.md'))) return [resolved];
      return [];
    }),
  );
  return files.flat();
}

async function ensureAuthor(filePath: string): Promise<void> {
  const original = await fs.readFile(filePath, 'utf8');
  const parsed = matter(original);

  if (typeof parsed.data.author === 'string') {
    console.log(`✔️  ${path.relative(ROOT, filePath)} already has author "${parsed.data.author}"`);
    return;
  }

  const author = inferAuthor(filePath);
  const updated = matter.stringify(parsed.content, { ...parsed.data, author });

  if (DRY_RUN) {
    console.log(`ℹ️  Would set author="${author}" for ${path.relative(ROOT, filePath)}`);
    return;
  }

  await fs.writeFile(filePath, `${updated.trim()}\n`, 'utf8');
  console.log(`✅ Set author="${author}" for ${path.relative(ROOT, filePath)}`);
}

async function run(): Promise<void> {
  try {
    const stats = await fs.stat(ROOT);
    if (!stats.isDirectory()) {
      console.error(`No content directory found at ${ROOT}`);
      process.exitCode = 1;
      return;
    }
  } catch {
    console.error(`No content directory found at ${ROOT}`);
    process.exitCode = 1;
    return;
  }

  const files = await collectFiles(ROOT);
  if (files.length === 0) {
    console.log('No MDX/MD files found under content/.');
    return;
  }

  for (const filePath of files) {
    await ensureAuthor(filePath);
  }

  if (DRY_RUN) {
    console.log('Dry run complete. Re-run with --write to apply changes.');
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
