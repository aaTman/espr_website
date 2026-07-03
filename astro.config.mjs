import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://espr.ai',
  base: '/',
  markdown: {
    shikiConfig: { theme: 'github-dark-dimmed' },
  },
});
