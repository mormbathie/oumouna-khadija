import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

export function schoolPwa(): Plugin {
  return {
    name: 'oumouna-khadija-pwa',
    apply: 'build',
    generateBundle(_, bundle) {
      const offline = readFileSync(new URL('../public/offline.html', import.meta.url), 'utf8');
      const template = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8');
      const hash = createHash('sha256').update(template).update(offline);
      for (const name of Object.keys(bundle).sort()) {
        const item = bundle[name];
        hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: template.replace('__BUILD_VERSION__', hash.digest('hex').slice(0, 20)) });
    },
  };
}
