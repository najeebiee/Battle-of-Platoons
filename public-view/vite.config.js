import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const resolvePath = (...segments) =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ...segments);

const stripEmotionRequire = {
  name: 'strip-emotion-require',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('framer-motion') && !id.includes('motion-dom')) return null;
    if (!code.includes('require("@emotion/is-prop-valid").default')) return null;

    const importStatement = 'import emotionIsPropValid from "@emotion/is-prop-valid";\n';
    const hasImport = /from ["']@emotion\/is-prop-valid["']/.test(code);
    const patched = code.replace(
      /require\("@emotion\/is-prop-valid"\)\.default/g,
      'emotionIsPropValid'
    );

    return {
      code: (hasImport ? patched : importStatement + patched),
      map: null,
    };
  },
};

export default defineConfig({
  plugins: [stripEmotionRequire, react()],
  resolve: {
    alias: {
      // Point directly to the ESM build to avoid Rollup missing default export warnings from the wrapper helper.
      '@supabase/supabase-js': '@supabase/supabase-js/dist/module/index.js',
      // Provide a browser-safe stub for the optional @emotion/is-prop-valid peer used by Framer Motion.
      '@emotion/is-prop-valid': resolvePath('./src/shims/emotion-is-prop-valid.js'),
      // Strip Framer Motion's runtime require() fallback by pointing to an ESM-safe shim.
      'framer-motion/dist/es/render/dom/utils/filter-props.mjs': resolvePath(
        './src/shims/framer-filter-props.mjs'
      ),
    },
  },
  optimizeDeps: {
    // Ensure mixed ESM/CJS dependencies pre-bundle cleanly to avoid runtime require() in the browser.
    include: ['framer-motion', '@emotion/is-prop-valid'],
  },
  build: {
    commonjsOptions: {
      // Transform mixed modules so CommonJS bits don't leak require() into the browser bundle.
      transformMixedEsModules: true,
    },
  },
});
