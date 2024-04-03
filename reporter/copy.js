import fs from 'fs';
import path from 'path';

export function copy() {
  return {
    name: 'copy',
    writeBundle(outputOptions) {
      const outDir = path.dirname(outputOptions.file);
      fs.copyFileSync(outputOptions.file, path.join(outDir, '../../', 'summary-html.js'));
    },
  };
}
