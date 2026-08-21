# Graham Paasch Homepage Concepts

## Delivery Summary

Three complete, responsive homepage studies have been implemented as independent HTML documents. Each file uses the Tailwind CDN and holds its own CSS and JavaScript, allowing it to open directly in a browser or to serve as a clean design-and-interaction reference inside a Next.js App Router project. The concepts use the current site’s actual themes and destinations—network engineering, local AI, voice work, generative music, juggling, writing, and professional profile—as their source material.[1]

| Concept | Open in Preview | Repository File | Primary Thesis |
| --- | --- | --- | --- |
| **The Workbench Ledger** | [/concepts/workbench-ledger.html](/concepts/workbench-ledger.html) | `public/homepage-concepts/workbench-ledger.html` | An authored working journal whose technical and artistic practices carry equal editorial weight. |
| **Signal / Craft** | [/concepts/signal-craft.html](/concepts/signal-craft.html) | `public/homepage-concepts/signal-craft.html` | An operating console where network systems, local models, instruments, and physical practice are all connected signals. |
| **A Page That Performs** | [/concepts/page-that-performs.html](/concepts/page-that-performs.html) | `public/homepage-concepts/page-that-performs.html` | A playable visual score that makes the site itself an expression of the creative work. |

## 01 — The Workbench Ledger

**Thesis.** The Workbench Ledger argues that Graham’s strongest differentiator is neither “engineer” nor “artist,” but the unusual way both are practiced: patiently, visibly, and with an authored point of view. The page therefore behaves like an independent journal rather than a portfolio. A fixed folio carries identity and navigation, the hero leads with a sentence rather than a credential stack, and the work appears as staggered ledger entries with penciled margin notes. Technical work is not visually separated from composing, juggling, or local AI; all are treated as entries in the same ongoing field notebook.

The built page uses bone paper, walnut imagery, ink-black type, a paper-green note, and Ledger Vermilion as the sole high-chroma accent. Its GP mark is a red compass-stroke monogram that appears in the persistent folio and inside the first hero image. The lower index rejects a symmetrical card grid in favor of staggered spans and handwritten side annotations, giving the page a working-document feel rather than a polished magazine template.

> **Mobile behavior:** The desktop folio becomes a compact sticky masthead. The split hero becomes a reading-first stack, while the irregular ledger index resolves into one continuous sequence without losing its numbered notes or marginalia.

This is the right choice when the primary goal is to make visitors feel they have met **a person with a durable practice**, especially visitors arriving through writing, music, community, or a warm professional introduction. It requires that Graham embrace a front page that spends less time on immediate tool access and more time on voice, narrative pacing, and an evolving “now” index. The payoff is a site that feels lasting rather than merely current.

## 02 — Signal / Craft

**Thesis.** Signal / Craft treats the site as a system status page for a multi-disciplinary maker. Its claim is that networks, a local GPU studio, generative instruments, juggling patterns, and composition all arise from a shared operating model: inputs, routes, feedback, practice, and useful constraints. Instead of separating “professional” and “personal” content into distant buckets, the page represents them as live nodes on one routing map and lets visitors tune the display by infrastructure, creative, or physical practice.

The built page uses a charcoal equipment-field image, utility rail, white-on-dark operational hierarchy, Route Chartreuse for active paths, and signal orange for human-made work. Its packet-route GP mark is visible in the rail at the first viewport. The map is interactive: filters update the visible project readout and route emphasis, while creative and physical nodes use the same route language as the technical infrastructure. A local Austin time readout and health indicators give the document a live-console character without turning it into a generic cyberpunk dashboard.

> **Mobile behavior:** The desktop utility rail condenses to a compact status header; the central map, explainer, clock, filters, and project readout then flow as one intentionally ordered vertical system. The map retains visual legibility and touch-friendly controls at the phone breakpoint.

This is the right choice when the homepage needs to lead with **capability and active experimentation**—for example, when prospective collaborators, employers, and technically fluent peers are core audiences. It requires regularly maintaining a small “current state” layer: project status, current local lab emphasis, perhaps a meaningful availability indicator. In exchange, it makes a credible argument that the creative work is not a side hobby but another mode of systems practice.

## 03 — A Page That Performs

**Thesis.** A Page That Performs is the deliberate creative-risk option. It takes seriously the idea that Graham’s homepage can be a small composition: a visitor’s pointer influences the visual score, a low-volume tone can be played, tempo and voice settings modify the field, and the lower portfolio is discovered by selecting orbital movements rather than scanning a normal card deck. The experience connects the compositional and physical work to local AI and infrastructure not by explanation alone, but by making rhythm, pattern, and feedback tangible on the page.

The built page uses a blue-black score field with Peach, Lake, and paper-white instrumentation. Its three-orbit GP symbol—suggesting a juggling pattern, modulation paths, and an atomic model—sits prominently in the hero. The canvas is responsive to pointer movement and the three “voice” filters alter the palette; tempo buttons alter visual cadence; a safe, opt-in tone control uses the browser’s Web Audio API. Below the hero, the portfolio stays within the score metaphor by using a selectable orbital movement system, notation staves, and a movement panel instead of reverting to a conventional portfolio grid. The interactive system freezes for visitors who prefer reduced motion.

> **Mobile behavior:** The visual score stays as the opening gesture, while the navigation simplifies, controls wrap in a dedicated deck, and the four movements sit around an enlarged score field. The active movement’s panel moves to the bottom of the field, providing a readable touch target and preventing overlays from concealing the score.

This is the right choice when Graham wants the site to make an immediate **memorable creative statement**, and is willing to let an unconventional experience lead over a conventional professional summary. It requires careful performance budgeting, stable accessible fallbacks, and a commitment to treat the score as a maintained creative medium rather than a one-off visual effect. It will appeal most to creative technologists, collaborators, and people who should feel the work before categorizing it.

## Build and Integration Notes

The portable package is committed to the selected repository at commit `ffaf3df` under `public/homepage-concepts/`. It includes a Markdown guide, the three HTML documents, three generated hero assets, and a generated PNG brand mark used as the favicon. The documents retain their Tailwind CDN dependency by design, but all custom behavior is inline and requires no React runtime, build step, or local server.

| Concern | Implementation |
| --- | --- |
| **Accessibility** | Semantic landmarks, labelled controls, keyboard-native buttons, visible focus treatments where interactive, and reduced-motion handling in all three studies. |
| **Responsive design** | Verified at 1280px desktop and 390px phone viewports. Each concept uses a distinct mobile reduction rather than a generic scaled-down grid. |
| **Interactivity** | Ledger uses subtle hover and navigation behavior; Signal / Craft provides category filters and a local time readout; A Page That Performs adds pointer-responsive canvas marks, movement selection, tempo changes, and opt-in audio. |
| **Assets** | Repository copies use local `assets/` paths, keeping the concept directory portable. The preview copies use managed storage URLs because the preview project does not package media inside its source tree. |
| **Validation** | TypeScript validation and production build completed successfully in the preview project; desktop and mobile visual checks were completed across all three pages. |

## Recommendation

The strongest **default** is **Signal / Craft**. It gives Graham a credible, differentiated professional front door while making the creative work structurally equal to the engineering work. **The Workbench Ledger** is the better choice if the site’s job is to build affinity and encourage reading. **A Page That Performs** is the best choice if the homepage’s job is to be remembered and if Graham is prepared to treat the site as part of the art practice, not only its index.

## Reference

[1] [Graham Paasch — current personal site](https://www.grahampaasch.com/)
