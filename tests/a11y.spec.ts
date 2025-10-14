import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AxeResults } from 'axe-core';

const ROUTES = ['/', '/voice-specimen', '/writings/values-and-constraints', '/career-vision'];

test.describe('accessibility', () => {
  for (const route of ROUTES) {
    test(`page ${route} has no detectable WCAG A/AA violations`, async ({ page }) => {
      await page.goto(route);
      const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
      const { violations } = (await axe.analyze()) as AxeResults;
      expect(violations, formatViolations(route, violations)).toEqual([]);
    });
  }
});

function formatViolations(route: string, violations: AxeResults['violations']) {
  if (!violations.length) return `No violations for ${route}`;
  return `Accessibility violations on ${route}:\n${violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => `  • ${node.html}\n    ${node.failureSummary}`)
        .join('\n');
      return `${violation.id} (${violation.impact})\n${violation.help}\n${nodes}`;
    })
    .join('\n\n')}`;
}
