/**
 * Checks dist/ against the Toy upload rules before it is zipped:
 *  - index.html at the root of the package, and under 1 MB (the platform rejects a larger entry file)
 *  - every asset referenced with a relative path (an absolute /assets/... path is a blank page on Toy)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const problems = [];
if (statSync(join(dist, 'index.html')).size > 1024 * 1024) problems.push('index.html 超过 1 MB');
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = m[1];
  if (url.startsWith('/') && !url.startsWith('//')) problems.push(`绝对路径：${url}`);
}
if (!/<title>[^<]+<\/title>/.test(html)) problems.push('缺少 <title>');
if (!html.includes('toy-sdk.js')) problems.push('没有引入 toy-sdk.js');

let total = 0, files = 0;
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name !== 'play.html' && !name.startsWith('.')) { total += st.size; files++; }
  }
};
walk(dist);
const zip = statSync(new URL('../million-danmaku.zip', import.meta.url).pathname).size;
console.log(`million-danmaku.zip  ${Math.round(zip / 1024)} KB（${files} 个文件，解压后 ${Math.round(total / 1024)} KB，入口 index.html ${statSync(join(dist, 'index.html')).size} 字节）`);
if (problems.length) { console.error('不符合 Toy 上传要求：\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('符合 Toy 上传要求：index.html 在包的根目录且小于 1 MB，资源全部是相对路径。');
