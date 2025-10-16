# Career Materials

This folder houses the canonical versions of all job-search collateral. Each Markdown file includes YAML front matter for quick parsing by build scripts or export tooling.

## Authoring Rules
- Update the `version`, `last_updated`, and `status` fields whenever you make substantive edits.
- Keep narrative sections in Markdown so they can render to HTML and convert to PDF or DOCX automatically.
- Treat any PDFs, Google Docs, or emailed copies as read-only exports generated from these files.

## Export Ideas
- `scripts/export-career.sh` (future) can call `pandoc` to produce `public/resume.pdf` and other recruiter-ready assets.
- Git tags (for example `v2025.02-career-refresh`) provide an auditable record of narrative shifts.
