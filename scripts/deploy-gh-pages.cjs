#!/usr/bin/env node
/* deploy-gh-pages.cjs — publish the verified site/ build to GitHub Pages.
 * -----------------------------------------------------------------------------
 * vercel.app is intermittently unreachable from OFAC-sanctioned regions
 * (Iran): the Vercel edge answers 403 to those IPs — nothing in the repo can
 * change that. The public mirror repo (karanrzn-crypto/western_game) therefore
 * also serves the EXACT SAME build from its gh-pages branch, which is
 * reachable where vercel.app is not. One deploy = one command:
 *
 *     npm run build && node scripts/deploy-gh-pages.cjs
 *
 * Contract: the branch carries the byte-identical artifact Vercel serves
 * (same sha256 for game/playable-map.js) — never a divergent copy. Run this
 * ONLY after a successful `npm run build`.
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const SITE_DIR = path.join(REPO_ROOT, 'site');
const WORK_DIR = '/tmp/wg-gh-pages';
const BRANCH = 'gh-pages';

if (!fs.existsSync(path.join(SITE_DIR, 'index.html'))) {
  console.error('site/ has no index.html — run `npm run build` first.');
  process.exit(1);
}

const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'pipe' }).toString().trim();
const remoteUrl = sh('git remote get-url western', REPO_ROOT); // token-bearing URL, never printed

// Reuse or create the shallow work clone.
if (!fs.existsSync(path.join(WORK_DIR, '.git'))) {
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  sh(`git clone --depth 1 "${remoteUrl}" "${WORK_DIR}"`);
}
// --depth 1 implies --single-branch, so fetch the branch with an EXPLICIT
// refspec — otherwise origin/gh-pages never materializes as a tracking ref.
sh(`git fetch origin +refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH} --depth 1 || true`, WORK_DIR);
const branchExists = sh(`git ls-remote --heads origin ${BRANCH}`, WORK_DIR).length > 0;
if (branchExists) sh(`git checkout -B ${BRANCH} origin/${BRANCH}`, WORK_DIR);
else sh(`git checkout --orphan ${BRANCH}`, WORK_DIR);

// Wipe tracked content, then copy the fresh build in (hidden files included).
sh('git rm -rf --quiet . || true', WORK_DIR);
fs.cpSync(SITE_DIR, WORK_DIR, { recursive: true });
fs.writeFileSync(path.join(WORK_DIR, '.nojekyll'), '');

const bundleHash = sh(`sha256sum ${path.join(SITE_DIR, 'game', 'playable-map.js')}`).split(' ')[0];
sh('git add -A', WORK_DIR);
const staged = sh('git status --porcelain', WORK_DIR);
if (!staged) {
  console.log(`gh-pages already up to date (bundle ${bundleHash.slice(0, 12)}…). Nothing to push.`);
  process.exit(0);
}
sh(`git -c user.name="karanrzn-crypto" -c user.email="karanrzn-crypto@users.noreply.github.com" commit -m "Deploy: verified production build to GitHub Pages (bundle ${bundleHash.slice(0, 12)})"`, WORK_DIR);
sh('git push origin gh-pages', WORK_DIR);
console.log(`gh-pages deployed · playable-map.js sha256 ${bundleHash}`);
console.log('live at https://karanrzn-crypto.github.io/western_game/ once Pages serves the branch');
