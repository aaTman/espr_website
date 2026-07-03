# espr.ai — Project Handoff / Context

A rebuild of **espr.ai** into a markdown-driven personal portfolio for Taylor
Mandelbaum, blending **atmospheric science + software engineering + AI/ML**.
This file captures the full context so work can continue in a new chat.

## Status: built & verified locally, not yet committed or deployed

The site builds cleanly (`npm run build`, 8 pages) and every page was visually
verified. Nothing has been committed to git yet.

---

## Stack & key decisions

- **Framework:** Astro 5 (static site generator, build step).
- **Content:** Astro content collections; blog & About Me are plain markdown.
- **Transitions:** Astro View Transitions (`<ClientRouter />`) for smooth
  cross-fades; the nav bar persists across navigations.
- **Fonts:** Titles/headings = **JetBrains Mono**; body = **Zalando Sans**;
  mono labels = JetBrains Mono. All from Google Fonts (loaded in `BaseLayout`).
- **Design concept:** "Atmospheric instrument" — deep dusk→night gradient,
  drifting aurora mesh, fine meteorological contour line-work, and a warm
  "thermal" bloom as the AI/ML accent. Respects `prefers-reduced-motion`.
- **Deploy target:** public repo → GitHub Actions → GitHub Pages, keeping the
  **espr.ai** custom domain via `public/CNAME`.

Color tokens & type vars live in `src/styles/global.css` (`:root`).

---

## Project structure

```
astro.config.mjs          # site: https://espr.ai, base: /, shiki code theme
tsconfig.json
package.json              # astro ^5.7
.github/workflows/deploy.yml   # withastro/action -> actions/deploy-pages
public/
  CNAME                   # "espr.ai"
  favicon.ico
  Thesis.pdf              # linked from About
  images/                 # migrated legacy images (mostly unused)
  demos/water-balance.html  # ported Probable Futures Mapbox demo (see caveats)
src/
  content/
    config.ts             # blog + experiments collection schemas
    about.md              # About Me (editable markdown)
    blog/                 # one .md per post
      2026-06-20-hello-world.md
    experiments/          # one .md per experiment card
      water-balance.md          # featured, has demoEmbed (iframe)
      climate-emulator.md       # SEED PLACEHOLDER
      data-pipeline.md          # SEED PLACEHOLDER
  layouts/
    BaseLayout.astro      # head, fonts, atmosphere bg, nav, footer, ClientRouter
    ProseLayout.astro     # wrapper for markdown pages (about, blog posts)
  components/
    AtmosphereBg.astro    # layered gradient + aurora + SVG contours + grain
    Nav.astro             # About / Blog / Experiments + mobile menu
    ProjectSnapshot.astro # landing-page featured-project tiles
    ExperimentCard.astro  # experiment grid card
  pages/
    index.astro           # landing (hero + project snapshot)
    about.astro           # renders src/content/about.md
    blog/index.astro      # post list (sorted by date desc)
    blog/[...slug].astro  # individual post
    experiments/index.astro    # card grid
    experiments/[...slug].astro # detail page; embeds live demo iframe
  styles/global.css       # design tokens, base styles, .prose markdown styles
```

---

## How to add / edit content

### Blog posts — `src/content/blog/`
One `.md` per post. Filename = URL slug (`my-post.md` → `/blog/my-post`).

```markdown
---
title: "My new post"
date: 2026-07-01
description: "One-line summary for the list."
tags: ["Climate", "ML"]
draft: false
---

Body in **markdown**.
```

Required: `title`, `date`. Optional: `description`, `tags`, `draft`
(`draft: true` hides it). Commit to `master`/`main` → Action rebuilds → post
appears on `/blog`. Post images go in `public/` and are referenced as
`/images/foo.png`.

### About Me — `src/content/about.md`
Plain markdown with frontmatter `title`, `description`, `tags`. Edit and rebuild.

### Experiments — `src/content/experiments/`
One `.md` per card. Frontmatter schema (`src/content/config.ts`):

- `title` (req), `description` (req), `tags[]`, `year`
- `repoUrl` — external repo/writeup link
- `demoUrl` — external live-demo link
- `demoEmbed` — path under /public for an embedded iframe demo, e.g.
  `/demos/water-balance.html`
- `featured` (bool) — surfaces on the landing-page snapshot
- `order` (number) — sort order in the grid & snapshot

Card link logic: if it has `demoEmbed` or body notes → its own detail page;
else `demoUrl` → external demo; else `repoUrl` → repo.

---

## Local commands

```bash
npm install          # uses local cache: npm install --cache /tmp/espr-npm-cache
                     #   (the global ~/.npm cache has root-owned files; a one-time
                     #    `sudo chown -R 501:20 ~/.npm` fixes it permanently)
npm run dev          # dev server at http://localhost:4321
npm run build        # static output to dist/
npm run preview      # serve the built dist/
```

Visual verification was done via headless Chrome screenshots. Note: WebGL demos
(the Mapbox map) render blank in headless unless you pass
`--headless=new --use-gl=angle --use-angle=swiftshader`.

---

## Open items / caveats

1. **Not committed yet.** Old static files (about.html, core.html, index.html,
   nav.html, css/, images/, assets/, the original .htm) were deleted and staged;
   new Astro files are untracked. Needs a commit.
2. **Water-balance demo is third-party.** `public/demos/water-balance.html` is a
   saved **Probable Futures** Mapbox map using *their* access token & hosted
   style. It works only while that token stays live, and it isn't Taylor's own
   code — consider replacing or clearly re-attributing it.
3. **Two seed placeholder experiments** (`climate-emulator.md`,
   `data-pipeline.md`) exist so the grid/snapshot look populated. Replace with
   real projects or delete.
4. **GitHub / DNS manual steps (do in the GitHub UI):**
   - Make the repo public.
   - Settings → Pages → source = **GitHub Actions**.
   - Point espr.ai DNS at GitHub Pages; retire the Netlify deploy.
5. **Legacy images** in `public/images/` are mostly unused; prune if desired.

---

## Design notes for future edits

- All colors/fonts are CSS variables in `src/styles/global.css` `:root`.
  Cool "atmosphere" palette (`--abyss`, `--night`, `--signal` cyan) + warm
  "thermal" AI accent (`--thermal` coral, `--ember` amber).
- Markdown rendering styles live under `.prose` in `global.css` (headings,
  code blocks via Shiki `github-dark-dimmed`, tables, blockquotes, etc.).
- Entrance animations use the `.rise` utility class with staggered
  `animation-delay` inline styles.
