# www.grahampaasch.com — Personal Website

This is a Next.js site for Graham Paasch (pen name: Vigil Pathfinder), with sections for hobbies, writings with public comments, and professional info. Built to deploy on Vercel.

## Quick Start

1. Install deps:

   ```bash
   npm install
   npm run dev
   ```

2. Visit `http://localhost:3000`.

## Content Structure

- Writings (Markdown): place posts in `content/writings/*.md` with frontmatter:

  ```md
  ---
  title: My Post Title
  date: 2025-09-01
  excerpt: Optional short description.
  ---
  
  Markdown content here.
  ```

- Hobbies: edit pages under `app/hobbies/*`.
- Professional: edit `app/professional/page.tsx`.

## Comments (Giscus)

This site embeds [Giscus](https://giscus.app) for public comments on each post via GitHub Discussions.

Steps to enable:

1. Create or pick a GitHub repo and enable Discussions.
2. Go to giscus.app and configure your preferences. Copy the `repo`, `repoId`, `category`, and `categoryId` values.
3. Set the following env vars in Vercel Project Settings (or `.env.local` for local dev):

   - `NEXT_PUBLIC_GISCUS_REPO` (e.g., `yourusername/yourrepo`)
   - `NEXT_PUBLIC_GISCUS_REPO_ID`
   - `NEXT_PUBLIC_GISCUS_CATEGORY` (e.g., `General`)
   - `NEXT_PUBLIC_GISCUS_CATEGORY_ID`

That’s it—each post page will show a comments section.

## SEO

- Metadata: configured in `app/layout.tsx`.
- Sitemap: `app/sitemap.ts` includes static pages + posts.
- Robots: `public/robots.txt`.

## Deploy on Vercel

1. Import this repo into Vercel as a Next.js project.
2. Build & output settings: defaults are fine (`npm run build`).
3. Environment variables: add the Giscus vars if using comments.
   - For the A2A chat agent, optionally add `GOOGLE_API_KEY` to enable Gemini responses. Without it, the agent returns a basic deterministic reply.
4. Connect custom domain `www.grahampaasch.com` in Vercel → Domains.
   - Add/verify the domain and follow DNS prompts (CNAME to `cname.vercel-dns.com`).
5. Redeploy to ensure `sitemap.xml` includes your posts.

## Notes

- No database required. Posts are Markdown files; comments use Giscus.
- Styling is minimal and clean using vanilla CSS in `app/globals.css`.
- If you want MDX, we can add it later with `@next/mdx`.

## A2A Chat Agent

This site exposes a minimal Agent2Agent (A2A) server and an on-site chat UI:

- Agent Card: `/api/a2a/.well-known/agent-card.json`
- JSON-RPC endpoint: `POST /api/a2a`
- Chat page: `/agent`

Implementation details:
- Server built with `@a2a-js/sdk` directly inside Next Route Handlers.
- Non-streaming replies; streaming can be enabled later.
- If `GOOGLE_API_KEY` is present, the agent uses Gemini 1.5 Flash for answers; otherwise it provides a basic canned response.

Local development:
1. `npm install` (requires symlink support; if on Windows WSL/drive you may need to run as admin or adjust permissions)
2. `npm run dev`
3. Visit `http://localhost:3000/agent`
