import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { imageCaptions } from './src/utils/plugins'
export default defineConfig({
  site: 'https://espr.ai',
  base: '/',
  markdown: {
    shikiConfig: { theme: 'github-dark-dimmed' },
    processor: satteri({
      hastPlugins: [
        imageCaptions
      ]
    })
  },
});
