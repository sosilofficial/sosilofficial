import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if ([".git", "node_modules", "content", "scripts"].includes(entry.name)) return [];
    return entry.isDirectory() ? walk(full) : entry.name === "index.html" ? [full] : [];
  });
}

function localTarget(url) {
  const clean = url.split(/[?#]/, 1)[0];
  if (!clean.startsWith("/") || clean.startsWith("//")) return null;
  const relative = clean.replace(/^\//, "");
  if (!relative) return path.join(ROOT, "index.html");
  if (path.extname(relative)) return path.join(ROOT, relative);
  return path.join(ROOT, relative, "index.html");
}

for (const file of walk(ROOT)) {
  const html = fs.readFileSync(file, "utf8");
  const label = path.relative(ROOT, file);
  if (!/<title>[^<]+<\/title>/.test(html)) failures.push(`${label}: title 없음`);
  if (!/<meta name="description" content="[^"]+">/.test(html)) failures.push(`${label}: meta description 없음`);
  if (!/<link rel="canonical" href="https:\/\/sosilofficial\.github\.io\/[^"]*">/.test(html)) failures.push(`${label}: canonical 없음`);
  if (!/<meta name="robots" content="index,follow,max-image-preview:large">/.test(html) || /noindex/i.test(html)) failures.push(`${label}: robots 설정 오류`);
  if (!/<meta property="og:title"/.test(html) || !/<meta property="og:url"/.test(html)) failures.push(`${label}: Open Graph 없음`);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = localTarget(match[1]);
    if (target && !fs.existsSync(target)) failures.push(`${label}: 경로 없음 ${match[1]}`);
  }
}

for (const file of ["index.html", "robots.txt", "sitemap.xml", "favicon-sosil.svg"]) {
  if (!fs.existsSync(path.join(ROOT, file))) failures.push(`${file}: 필수 파일 없음`);
}

if (failures.length) throw new Error(`SITE VALIDATION ERROR:\n${[...new Set(failures)].join("\n")}`);
console.log(`Validated ${walk(ROOT).length} HTML pages, SEO metadata, and local asset paths.`);
