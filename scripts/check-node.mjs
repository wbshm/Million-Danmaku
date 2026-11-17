/**
 * Runs before dev / build / test / sim. Vite 6 and vitest need Node 20.19+ (or 22.12+); on an
 * older Node they die with an unrelated-looking error, so say what is actually wrong.
 * Kept to syntax Node 14 understands.
 */
const [major, minor] = process.versions.node.split('.').map(Number);
const ok = major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19);
if (!ok) {
  console.error(
    '\n这个项目需要 Node 22（当前是 ' + process.versions.node + '）。\n' +
    '项目根目录有 .node-version，用 fnm 的话在这里执行：\n\n' +
    '    fnm use\n\n' +
    '然后重新运行刚才的命令。用 nvm 的话执行 nvm use 22。\n'
  );
  process.exit(1);
}
