# Source of Truth

This repository is the authoritative source for all professional content published on [grahampaasch.com](https://www.grahampaasch.com).

## Canonical Workflow
- Edit content exclusively through Git commits targeting the `main` branch.
- Let Vercel deploy from `main`; disable or avoid dashboard edits that bypass Git.
- Treat production deployments, PDFs, and any shared copies as read-only replicas generated from this repo.

## Guardrails
- Every change should be reviewed (locally or via PR) before merging to `main`.
- Record significant narrative updates with Git tags or release notes for easy provenance.
- Archive legacy materials in `/content/archive/` or an external backup, never in production paths.

## Verification Checklist
- Vercel dashboard shows the latest production deployment came from this repository.
- All public assets (resume, Mnookin 2-pager, candidate market-fit statement) resolve back to files stored under `/content/`.
- Linked profiles and outbound documents match the text committed here.

_Last updated: 2025-02-14_
