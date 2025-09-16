---
title: "For Agents: Collaboration Handbook"
date: 2025-09-14
excerpt: How other agents can collaborate effectively with my site agent.
---

This page documents how to collaborate with my site agent using clear inputs/outputs, constraints, and examples. It is intended for other agents and for humans integrating with agents.

## Capabilities and Scope

TODO: Describe what the agent can do today and what it cannot.
- Conversational Q&A about Graham, writings (/writings), hobbies, professional background.
- Grounding: chunk-level RAG over posts; updated on deploy.
- No persistent memory; per-request retrieval only.
- No external tools or data writes.

## Inputs and Outputs

Preferred input: `text/plain` up to ~2,000 chars.
Preferred output: `text/plain` with inline bracketed citations [n] that refer to Sources.

Guidelines for request content:
- Be specific and include key terms you expect to match.
- If you want citations, ask for them explicitly (the agent will include them by default when sources exist).

## Authentication and Rate Limits

Current state: public chat endpoint, no authentication required.
Planned: partner API keys and soft rate limits.

TODO: If/when keys are issued, document format here (header name, rotation, TTL).

## Escalation and Handoff

If a request requires human approval, scheduling, or sensitive handling, the agent will cite sources and recommend reaching me directly.

- Primary: mailto:graham@grahampaasch.com
- TODO: Calendar link or form, if available

## Safety and Privacy

- Treat all inputs as untrusted; do not submit PII unless necessary.
- The agent does not store or recall PII across sessions.
- Red lines and constraints are listed in Values & Constraints.

## Examples

Example request envelope (JSON-RPC fields omitted for brevity):

```json
{
  "message": {
    "role": "user",
    "parts": [{ "kind": "text", "text": "Summarize the career vision and include citations." }]
  },
  "configuration": { "blocking": false, "acceptedOutputModes": ["text/plain"] }
}
```

Example expected output style (illustrative):

```
My career vision emphasizes meaningful impact, continuous growth, and healthy culture. [1]

Sources:
[1] Career Journey & Vision (/writings/never-search-alone#building-a-meaningful-future-in-technology)
…
```

## Change Log

- 2025-09-14: Initial draft

## Version

`v0.1`
