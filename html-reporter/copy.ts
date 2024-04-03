import fs from 'fs';
import path from 'path';
import type { Plugin, UserConfig } from 'vite';

export function copy(): Plugin {
  let config: UserConfig;
  return {
    name: 'copy',
    config(c) {
      config = c;
    },
    closeBundle: () => {
      fs.mkdirSync('../public', { recursive: true });
      fs.copyFileSync(
          path.join(config.build!.outDir!, 'index.html'),
          path.join('../public/', 'index.html'));
    },
  };
}
