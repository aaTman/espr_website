# espr.ai — nebula redesign, merge notes

Complete Astro 5 project, built & verified (8 pages). To merge into
/Users/taylor/code/espr_website:

1. Copy everything here over the repo (same structure as HANDOFF.md).
2. Carry over from your existing repo (intentionally not included here):
   - public/Thesis.pdf
   - public/demos/water-balance.html  (a placeholder is in this zip)
   - public/images/ (if you still want any)
   - your real src/content/about.md, blog posts, and experiment writeups
     (frontmatter schemas are unchanged from HANDOFF.md)
3. `npm install --cache /tmp/espr-npm-cache && npm run build` — expect 8 pages.
4. Deploy is unchanged: .github/workflows/deploy.yml → GitHub Pages, CNAME=espr.ai.

Design notes:
- All tokens live in src/styles/global.css :root (black/rose/ember/hairline).
- The hero art is src/components/NebulaHero.astro — pure static SVG.
  The cloud is layered ellipses run through feTurbulence+feDisplacementMap
  ("wispy" = big soft masses, "billow" = crisper highlights). To repaint,
  edit the ellipse layers: purple base → blue wisps (left) → green wisps
  (right) → mauve/rose → cream billows → bright core → crimson pocket → speck.
- The starfield is generated at build time (seeded RNG in frontmatter);
  the site ships no JS except Astro's ClientRouter.
- Fonts are system (Helvetica Neue / ui-monospace) — no font loading at all.
