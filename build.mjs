/** Bundles the editor page (src/editor/main.js and the drawing code it uses) into public/Editor.js. */
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BUNDLE = path.join(__dirname, 'public', 'Editor.js');

/** What a bundle is called: the commit it was built from (in a git checkout) and when, to the minute (UTC). */
function buildId() {
  let commit = '';
  try { commit = execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a checkout */ }
  const at = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  return commit ? `${commit}-${at}` : at;
}

/** Builds the bundle; returns its id. */
export async function build() {
  const id = buildId();
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/editor/main.js')],
    bundle: true,
    minify: true,
    sourcemap: false,
    outfile: BUNDLE,
    define: { __VOYAGE_BUILD__: JSON.stringify(id) },
  });
  console.log(`Editor built (${(fs.statSync(BUNDLE).size / 1024).toFixed(2)} KB), build ${id}.`);
  return id;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((err) => { console.error('BUILD ERROR:', err); process.exit(1); });
}
