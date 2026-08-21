# Graham Paasch Homepage Concepts

These three prototypes are deliberately **standalone HTML documents**. Each uses the Tailwind CDN and contains all of its CSS and JavaScript inline, so it can be opened directly in a browser or moved into a Next.js App Router project as a prototype reference. The generated hero and favicon assets are included in `assets/`, making this folder portable as-is.

| Concept | Core Thesis | Mobile Behavior | Best Fit |
| --- | --- | --- | --- |
| [The Workbench Ledger](./workbench-ledger.html) | A personal working journal that gives technical and artistic practice equal editorial dignity. | The fixed folio becomes a compact sticky masthead; the two-column index becomes a single reading sequence. | Graham wants a site that leads with authorship, writing, and the human context behind the work. |
| [Signal / Craft](./signal-craft.html) | An operational system map that treats networks, local models, composition, and embodied practice as connected signals. | The utility rail condenses to a status bar, then system map and readout flow in one vertical order. | Graham wants to foreground capability, active experiments, and the coherence between technical and creative systems. |
| [A Page That Performs](./page-that-performs.html) | A playable visual score whose controls make the homepage itself an expression of the work. | The canvas remains the opening gesture while navigation collapses and the voice cards become a vertical score. | Graham wants to take creative risk and make local AI, generative music, and juggling immediately felt rather than merely described. |

The links point to known pages on the current site, while `mailto:hello@grahampaasch.com` is a visible placeholder for a confirmed contact route. All motion respects `prefers-reduced-motion`; the third concept also stops its generative animation when that preference is enabled.
