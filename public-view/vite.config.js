import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

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

const stripEmotionRequireEsbuild = {
  name: 'strip-emotion-require-esbuild',
  setup(build) {
    build.onLoad({ filter: /framer-motion\/.*\.(mjs|js)$/ }, async (args) => {
      const source = await fs.readFile(args.path, 'utf8');
      if (!source.includes('require("@emotion/is-prop-valid").default')) return;

      const importStatement = 'import emotionIsPropValid from "@emotion/is-prop-valid";\n';
      const hasImport = /from ["']@emotion\/is-prop-valid["']/.test(source);
      const patched = source.replace(
        /require\("@emotion\/is-prop-valid"\)\.default/g,
        'emotionIsPropValid'
      );

      return {
        contents: hasImport ? patched : importStatement + patched,
        loader: 'js',
      };
    });
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
    esbuildOptions: {
      plugins: [stripEmotionRequireEsbuild],
    },
  },
  build: {
    commonjsOptions: {
      // Transform mixed modules so CommonJS bits don't leak require() into the browser bundle.
      transformMixedEsModules: true,
    },
  },
});
