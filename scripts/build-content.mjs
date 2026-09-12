import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content");
const ORIGIN = "https://sosilofficial.github.io";

const esc = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const uniq = (values = []) => [...new Set(values.filter(Boolean))];
function youtubeThumbnail(url = "") {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const id = host === "youtu.be" ? parsed.pathname.split("/").filter(Boolean)[0] : ["youtube.com", "m.youtube.com"].includes(host) ? parsed.searchParams.get("v") || parsed.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] : "";
    return id && /^[\w-]{6,}$/.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : "";
  } catch { return ""; }
}
const videoImage = (item) => item.thumbnail || youtubeThumbnail(item.video);
const firstImage = (item) => videoImage(item) || item.images?.[0] || "";
const linkUrl = (item, label) => item.links?.find((link) => !label || link.label === label)?.url || "";
const absolute = (url) => url?.startsWith("/") ? `${ORIGIN}${url}` : url;
const displayDate = (value = "") => value.includes("-") && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll("-", ".") : value;

function parseFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`CONTENT ERROR: front matter가 없습니다: ${path.relative(ROOT, file)}`);
  const data = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon < 1) throw new Error(`CONTENT ERROR: 잘못된 front matter: ${path.relative(ROOT, file)} / ${line}`);
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    try { data[key] = JSON.parse(value); }
    catch { throw new Error(`CONTENT ERROR: ${key} 값은 JSON 형식이어야 합니다: ${path.relative(ROOT, file)}`); }
  }
  data.body = match[2].replace(/^\n/, "").replace(/\n$/, "");
  data.source = path.relative(ROOT, file);
  validate(data);
  return data;
}

function validate(item) {
  for (const key of ["type", "category", "title", "slug"]) {
    if (!item[key]) throw new Error(`CONTENT ERROR: ${key} 값이 없습니다: ${item.source}`);
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N}-]*$/u.test(item.slug)) throw new Error(`CONTENT ERROR: slug에는 글자, 숫자, 하이픈만 사용할 수 있습니다: ${item.source}`);
  if (!Array.isArray(item.images) || !Array.isArray(item.links)) throw new Error(`CONTENT ERROR: images와 links는 배열이어야 합니다: ${item.source}`);
  const urls = [item.thumbnail, item.video, ...item.images, ...item.links.map((link) => link.url)].filter(Boolean);
  if (urls.some((url) => typeof url !== "string" || /[\s<>"']/.test(url))) throw new Error(`CONTENT ERROR: 이미지·영상·링크 URL에 잘못된 문자가 있습니다: ${item.source}`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith(".md") ? [full] : [];
  });
}

const all = walk(CONTENT).map(parseFile).filter((item) => item.published !== false);
const seen = new Set();
for (const item of all.filter((entry) => entry.type === "content")) {
  const routeSubcategory = item.category === "archive" && ["photo", "video"].includes(item.subcategory) ? "photo-video" : item.subcategory;
  const key = `${item.category}/${routeSubcategory}/${item.slug}`;
  if (seen.has(key)) throw new Error(`CONTENT ERROR: slug 충돌: ${key}`);
  seen.add(key);
}
const newestFirst = (a, b) => String(b.date).localeCompare(String(a.date)) || Number(a.order || 0) - Number(b.order || 0);
const by = (category, subcategory = "") => all.filter((item) => item.type === "content" && item.category === category && item.subcategory === subcategory).sort(newestFirst);
const site = (category) => all.find((item) => item.type === "site" && item.category === category);

function inlineMarkdown(text) {
  return esc(text)
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+|\/[^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|\/[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function bodyHtml(item, className = "prose") {
  const body = item.body || item.description || "";
  if (item.body_format === "plain") return `<div class="${className}">${esc(body)}</div>`;
  const blocks = body.split(/\n{2,}/).filter(Boolean).map((block) => {
    const lines = block.split("\n");
    if (lines.every((line) => /^[-*] /.test(line))) return `<ul>${lines.map((line) => `<li>${inlineMarkdown(line.slice(2))}</li>`).join("")}</ul>`;
    if (lines.every((line) => /^\d+[.)] /.test(line))) return `<ol>${lines.map((line) => `<li>${inlineMarkdown(line.replace(/^\d+[.)] /, ""))}</li>`).join("")}</ol>`;
    if (/^#{1,3} /.test(lines[0])) { const n = lines[0].match(/^#+/)[0].length; return `<h${n}>${inlineMarkdown(lines[0].slice(n + 1))}</h${n}>`; }
    return `<p>${inlineMarkdown(block).replaceAll("\n", "<br>")}</p>`;
  });
  return `<div class="${className}">${blocks.join("")}</div>`;
}

function titleFor(name) { return name === "소실 SOSIL" ? "소실 SOSIL — 김성빈의 slowcore / folk 음악 프로젝트" : `${name} | 소실 SOSIL`; }
function head(name, description, route, image = "", detail = false) {
  const title = titleFor(name);
  const canonical = `${ORIGIN}${route === "/" ? "/" : `${route.replace(/\/$/, "")}/`}`;
  return `<!DOCTYPE html><html lang="ko"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>${image?.startsWith("/") ? `<link rel="preload" href="${esc(image)}" as="image"/>` : ""}<link rel="stylesheet" href="/assets/index-yyXTcz5L.css"/><title>${esc(title)}</title><link rel="shortcut icon" href="/favicon-sosil.svg"/><link rel="icon" href="/favicon-sosil.svg"/>
<meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${canonical}"><meta property="og:locale" content="ko_KR"><meta property="og:type" content="${detail ? "article" : "website"}"><meta property="og:site_name" content="소실 SOSIL"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}">${image ? `<meta property="og:image" content="${esc(absolute(image))}">` : ""}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}">${route === "/" ? '<script type="application/ld+json">{"@context":"https://schema.org","@type":"MusicGroup","name":"소실","alternateName":"Sosil","member":{"@type":"Person","name":"김성빈"},"genre":["slowcore","folk"],"url":"https://sosilofficial.github.io/","sameAs":["https://sosil.bandcamp.com/","https://www.instagram.com/headlesssosil/"]}</script>' : ""}</head>`;
}

function shell(active, main) {
  const nav = [["info", "/info"], ["works", "/works/discography"], ["news", "/news"], ["archive", "/archive"], ["merch", "/merch"], ["notes", "/notes"], ["contact", "/contact"]]
    .map(([label, href]) => `<a href="${href}"${active === label ? ' class="is-active" aria-current="page"' : ""}>${label}</a>`).join("");
  return `<body><div class="site-frame"><a href="/" class="site-brand" aria-label="소실 홈페이지"><span class="brand-roman">sosil</span></a><aside class="side-rail"><nav class="rail-nav" aria-label="주요 메뉴">${nav}</nav></aside><main class="site-main">${main}</main></div></body></html>`;
}

function page(name, description, route, active, main, image = "", detail = false) {
  return `${head(name, description, route, image, detail)}${shell(active, main)}`;
}

function writeRoute(route, contents) {
  const dir = route === "/" ? ROOT : path.join(ROOT, route.replace(/^\//, ""));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), contents);
}

function clearDetails(route) {
  const dir = path.join(ROOT, route.replace(/^\//, ""));
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) fs.rmSync(path.join(dir, entry.name), { recursive: true });
}

const worksNav = '<nav class="subnav" aria-label="works 하위 메뉴"><a href="/works/discography">discography</a><a href="/works/videos">videos</a><a href="/works/live">live</a><a href="/works/others">others</a></nav>';
const archiveNav = '<nav class="subnav" aria-label="archive 하위 메뉴"><a href="/archive/photo-video">photo / video</a><a href="/archive/links">text</a></nav>';

function mediaMarkup(item, title) {
  const images = uniq(item.images || []);
  const imageGallery = images.length ? `<div class="${title === "merch" ? "merch-detail-gallery" : "post-gallery"}">${images.map((url, i) => `<img${title !== "merch" ? ' class="post-image"' : ""} src="${esc(url)}" alt="${esc(item.title)} — ${i + 1}" loading="${i ? "lazy" : "eager"}" decoding="async"/>`).join("")}</div>` : "";
  const provider = /youtu(?:be|\.be)/i.test(item.video || "") ? "youtube" : "video";
  const video = item.video ? `<div class="post-video"><a class="video-cover video-cover-youtube" href="${esc(item.video)}" target="_blank" rel="noreferrer" aria-label="${esc(item.title)} 영상 재생">${videoImage(item) ? `<img src="${esc(videoImage(item))}" alt="" loading="lazy" decoding="async"/>` : ""}<span class="video-cover-shade"></span><span class="video-play" aria-hidden="true">▶</span><span class="video-provider">${provider}<!-- --> / play</span></a></div>` : "";
  return `${imageGallery}${video}`;
}

// News
clearDetails("/news");
const news = by("news");
const newsList = news.length ? `<div class="post-list post-list-news">${news.map((item) => `<a class="list-row" href="/news/${esc(item.slug)}"><span class="row-meta">${esc(displayDate(item.date))}</span><span class="row-copy"><small class="row-label">${esc(item.meta || "NOTICE")}</small><span class="row-title">${esc(item.title)}</span></span><span class="row-arrow" aria-hidden="true">↗</span></a>`).join("")}</div>` : '<p class="empty-note">아직 남겨진 기록이 없습니다.</p>';
writeRoute("/news", page("news", "소실(Sosil)의 발매, 공연, 새로운 소식.", "/news", "news", `<article class="page-wrap"><p class="page-intro"></p>${newsList}</article>`));
for (const item of news) {
  const links = item.links.map((link) => `<a href="${esc(link.url)}" target="_blank" rel="noreferrer">${esc(link.label || "관련 링크")}</a>`).join("");
  const main = `<article class="page-wrap post-detail is-news"><p class="post-detail-date">${esc(displayDate(item.date))}</p><h1 class="post-title">${esc(item.title)}</h1>${item.description ? `<p class="post-summary">${esc(item.description)}</p>` : ""}${mediaMarkup(item, "news")}${bodyHtml(item, "post-body prose")}${links ? `<nav class="post-action-links" aria-label="관련 링크">${links}</nav>` : ""}<p class="back-link"><a href="/news">← news</a></p></article>`;
  writeRoute(`/news/${item.slug}`, page(item.title, item.description || item.body.slice(0, 150), `/news/${item.slug}`, "news", main, firstImage(item), true));
}

// Notes use /notes publicly; /gibberish remains a same-content compatibility alias.
clearDetails("/notes");
clearDetails("/gibberish");
const notes = by("notes");
const notesGrid = `<div class="discography-card-grid notes-catalog-grid">${notes.map((item) => `<article class="discography-style-card"><a href="/notes/${esc(item.slug)}" class="notes-catalog-thumb${firstImage(item) ? " has-image" : " is-text"}${item.video ? " has-video" : ""}" aria-label="${esc(item.title)} 읽기">${firstImage(item) ? `<img src="${esc(firstImage(item))}" alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"/>` : `<span>${esc(item.meta || "note")}</span>`}</a><div class="discography-style-meta"><p>${esc(item.meta || "note")} · ${esc(displayDate(item.date))}</p><h2><a href="/notes/${esc(item.slug)}">${esc(item.title)}</a></h2></div></article>`).join("")}</div>`;
const notesListPage = page("notes", "김성빈의 음악 프로젝트 소실(Sosil)의 작업 노트와 기록.", "/notes", "notes", `<article class="page-wrap notes-page"><p class="page-intro page-intro-preline"></p>${notesGrid}</article>`, firstImage(notes[0]));
writeRoute("/notes", notesListPage);
writeRoute("/gibberish", notesListPage);
for (const item of notes) {
  const main = `<article class="page-wrap post-detail"><p class="post-detail-date">${esc(displayDate(item.date))}</p><h1 class="post-title">${esc(item.title)}</h1>${item.description ? `<p class="post-summary">${esc(item.description)}</p>` : ""}${mediaMarkup(item, "notes")}<hr class="rule"/>${bodyHtml(item, "post-body prose")}${!item.video && item.links[0] ? `<a class="external-button" href="${esc(item.links[0].url)}" target="_blank" rel="noreferrer">관련 링크 열기 ↗</a>` : ""}<p class="back-link"><a href="/notes">← notes</a></p></article>`;
  const detailPage = page(item.title, item.seo_description || item.description || item.body.slice(0, 150), `/notes/${item.slug}`, "notes", main, firstImage(item), true);
  writeRoute(`/notes/${item.slug}`, detailPage);
  writeRoute(`/gibberish/${item.slug}`, detailPage);
}

// Archive photo + video are stored separately but remain in the existing combined view.
clearDetails("/archive/photo-video");
const archiveMedia = [...by("archive", "photo"), ...by("archive", "video")].sort(newestFirst);
const archiveGrid = `<div class="discography-card-grid archive-media-grid">${archiveMedia.map((item) => `<article class="discography-style-card"><a href="/archive/photo-video/${esc(item.slug)}" class="archive-media-thumb" aria-label="${esc(item.title)} 상세 보기">${firstImage(item) ? `<img src="${esc(firstImage(item))}" alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"/>` : `<span>${esc(item.subcategory)}</span>`}</a><div class="discography-style-meta"><p>${esc(displayDate(item.date))}${item.creator || item.meta ? ` · ${esc(item.creator || item.meta)}` : ""}</p><h2><a href="/archive/photo-video/${esc(item.slug)}">${esc(item.title)}</a></h2></div></article>`).join("")}</div>`;
const archiveMain = `<article class="page-wrap archive-catalog-page">${archiveNav}${archiveGrid}</article>`;
for (const route of ["/archive", "/archive/photo-video"]) writeRoute(route, page("archive / photo & video", "소실(Sosil)의 사진, 영상, 인터뷰, 리뷰 아카이브.", route, "archive", archiveMain, firstImage(archiveMedia[0]), route !== "/archive"));
for (const item of archiveMedia) {
  const images = item.subcategory === "video" ? uniq(item.images || []) : uniq([...(item.images || []), item.thumbnail]);
  const gallery = images.length ? `<div class="catalog-detail-gallery">${images.map((url, i) => `<figure class="catalog-detail-image"><img src="${esc(url)}" alt="${esc(item.title)} 이미지 ${i + 1}" loading="${i ? "lazy" : "eager"}" decoding="async"/></figure>`).join("")}</div>` : "";
  const video = item.video ? `<div class="catalog-detail-video"><a class="video-cover video-cover-youtube" href="${esc(item.video)}" target="_blank" rel="noreferrer" aria-label="${esc(item.title)} 영상 재생">${videoImage(item) ? `<img src="${esc(videoImage(item))}" alt=""/>` : ""}<span class="video-play">▶</span></a></div>` : "";
  const main = `<article class="page-wrap catalog-detail"><header class="catalog-detail-head"><p class="catalog-detail-date">${esc(displayDate(item.date))} · ${esc(item.media_type || item.meta || item.subcategory)}</p><h1>${esc(item.title)}</h1>${item.description ? `<p class="catalog-detail-summary">${esc(item.description)}</p>` : ""}</header>${video}${gallery}<div class="catalog-detail-columns"><div>${item.body ? `<section class="catalog-detail-section"><h2>about</h2><p class="prose">${esc(item.body)}</p></section>` : ""}</div><aside class="catalog-detail-aside"></aside></div><p class="back-link"><a href="/archive/photo-video">← photo-video</a></p></article>`;
  writeRoute(`/archive/photo-video/${item.slug}`, page(item.title, item.seo_description || item.description || item.body.slice(0, 150) || item.title, `/archive/photo-video/${item.slug}`, "archive", main, firstImage(item), true));
}

const archiveLinks = by("archive", "links");
const archiveLinkList = `<div class="archive-text-catalog">${archiveLinks.map((item) => `<a href="${esc(linkUrl(item) || item.video)}" target="_blank" rel="noreferrer"><span>${esc(item.title)}</span></a>`).join("")}</div>`;
writeRoute("/archive/links", page("archive / text", "소실(Sosil)의 사진, 영상, 인터뷰, 리뷰 아카이브.", "/archive/links", "archive", `<article class="page-wrap archive-text-page">${archiveNav}${archiveLinkList}</article>`, "", true));

// Works
clearDetails("/works/discography");
clearDetails("/works/others");
const discography = by("works", "discography");
const catalogCards = (items, sub) => `<div class="catalog-grid">${items.map((item) => `<article class="catalog-card"><a href="/works/${sub}/${esc(item.slug)}" class="catalog-cover">${firstImage(item) ? `<img src="${esc(firstImage(item))}" alt="" loading="lazy"/>` : `<span class="catalog-text-cover"><small>${esc(sub)}</small><strong>${esc(item.title)}</strong>${item.subtitle ? `<em>${esc(item.subtitle)}</em>` : ""}<small>SOSIL · ${esc(item.date?.slice(0, 4) || "UNDATED")}</small></span>`}</a><div class="catalog-meta"><p><span>${esc(displayDate(item.date))}</span><span>${esc(item.meta || "other")}</span></p><h2><a href="/works/${sub}/${esc(item.slug)}">${esc(item.title)}</a></h2>${item.subtitle ? `<p class="catalog-subtitle">${esc(item.subtitle)}</p>` : ""}${item.creator ? `<p class="catalog-byline">by ${esc(item.creator)}</p>` : ""}</div></article>`).join("")}</div>`;
writeRoute("/works/discography", page("works / discography", "소실(Sosil)의 slowcore·folk 음악, 음반, 영상과 공연 기록.", "/works/discography", "works", `<article class="page-wrap works-discography">${worksNav}${catalogCards(discography, "discography")}</article>`, firstImage(discography[0]), true));

function catalogDetail(item, sub) {
  const images = uniq([...(item.images || []), item.thumbnail]);
  const gallery = images.length ? `<div class="catalog-detail-gallery">${images.map((url, i) => `<figure class="catalog-detail-image"><img src="${esc(url)}" alt="${esc(item.title)} 이미지 ${i + 1}" loading="${i ? "lazy" : "eager"}" decoding="async"/></figure>`).join("")}</div>` : "";
  const tracks = item.tracklist?.length ? `<section class="catalog-detail-section"><h2>tracklist / setlist</h2><ol class="track-list">${item.tracklist.map((track, i) => `<li><span>${String(i + 1).padStart(2, "0")}</span><span>${esc(track)}</span></li>`).join("")}</ol></section>` : "";
  const links = item.links?.length ? `<div class="catalog-links">${item.links.map((link) => `<a href="${esc(link.url)}" target="_blank" rel="noreferrer">${esc(link.label)} <span aria-hidden="true">↗</span></a>`).join("")}</div>` : "";
  const main = `<article class="page-wrap catalog-detail"><header class="catalog-detail-head"><p class="catalog-detail-date">${esc(displayDate(item.date))} · ${esc(item.meta || "other")}</p><h1>${esc(item.title)}</h1>${item.subtitle ? `<p class="catalog-detail-subtitle">${esc(item.subtitle)}</p>` : ""}${item.description && item.description !== item.subtitle ? `<p class="catalog-detail-summary">${esc(item.description)}</p>` : ""}</header>${gallery}<div class="catalog-detail-columns"><div>${item.body ? `<section class="catalog-detail-section"><h2>notes</h2><p class="prose">${esc(item.body)}</p></section>` : ""}${tracks}${item.credits ? `<section class="catalog-detail-section"><h2>credits</h2><p class="catalog-credits">${esc(item.credits)}</p></section>` : ""}</div><aside class="catalog-detail-aside">${links}</aside></div><p class="back-link"><a href="/works/${sub}">← ${sub}</a></p></article>`;
  writeRoute(`/works/${sub}/${item.slug}`, page(item.title, item.seo_description || item.description || item.body.slice(0, 150) || item.title, `/works/${sub}/${item.slug}`, "works", main, firstImage(item), true));
}
for (const item of discography) catalogDetail(item, "discography");

const workVideos = by("works", "video");
const videos = `<div class="video-catalog-grid">${workVideos.map((item) => `<article class="video-catalog-card"><a class="video-catalog-thumb" href="${esc(item.video || linkUrl(item))}" target="_blank" rel="noreferrer" aria-label="${esc(item.title)} 영상 열기">${firstImage(item) ? `<img src="${esc(firstImage(item))}" alt="" loading="lazy" decoding="async"/>` : ""}</a><h2><a href="${esc(item.video || linkUrl(item))}" target="_blank" rel="noreferrer">${esc(item.title)}<span aria-hidden="true"> ↗</span></a></h2></article>`).join("")}</div>`;
writeRoute("/works/videos", page("works / videos", "소실(Sosil)의 slowcore·folk 음악, 음반, 영상과 공연 기록.", "/works/videos", "works", `<article class="page-wrap works-videos">${worksNav}${videos}</article>`, firstImage(workVideos[0]), true));

const live = by("works", "live");
writeRoute("/works/live", page("works / live", "소실(Sosil)의 slowcore·folk 음악, 음반, 영상과 공연 기록.", "/works/live", "works", `<article class="page-wrap works-live">${worksNav}<div class="live-log">${live.map((item) => esc(item.body || `${item.date} | ${item.title}`)).join("\n")}</div></article>`, "", true));

const others = by("works", "others");
writeRoute("/works/others", page("works / others", "소실(Sosil)의 slowcore·folk 음악, 음반, 영상과 공연 기록.", "/works/others", "works", `<article class="page-wrap">${worksNav}${others.length ? catalogCards(others, "others") : ""}</article>`, "", true));
for (const item of others) catalogDetail(item, "others");

// Merch
clearDetails("/merch");
const merch = by("merch");
const merchGrid = `<div class="discography-card-grid merch-catalog-grid">${merch.map((item) => `<article class="discography-style-card"><a href="/merch/${esc(item.slug)}" class="merch-catalog-thumb" aria-label="${esc(item.title)} 상세 보기">${firstImage(item) ? `<img src="${esc(firstImage(item))}" alt="" loading="lazy" decoding="async"/>` : "<span>merch</span>"}</a><div class="discography-style-meta">${item.meta ? `<p>${esc(item.meta)}</p>` : ""}<h2><a href="/merch/${esc(item.slug)}">${esc(item.title)}</a></h2></div></article>`).join("")}</div>`;
writeRoute("/merch", page("merch", "소실(Sosil)의 음반과 머천다이즈.", "/merch", "merch", `<article class="page-wrap merch-page">${merchGrid}</article>`, firstImage(merch[0])));
for (const item of merch) {
  const images = uniq([...(item.images || []), item.thumbnail]);
  const gallery = images.length ? `<div class="merch-detail-gallery">${images.map((url, i) => `<img src="${esc(url)}" alt="${esc(item.title)} — ${i + 1}" loading="${i ? "lazy" : "eager"}" decoding="async"/>`).join("")}</div>` : "";
  const links = item.links.length ? `<nav class="merch-purchase-links" aria-label="${esc(item.title)} 구매처">${item.links.map((link) => `<a href="${esc(link.url)}" target="_blank" rel="noreferrer">${esc(link.label || "purchase")}</a>`).join("")}</nav>` : "";
  const main = `<article class="page-wrap merch-detail-page"><header class="merch-detail-head"><h1>${esc(item.title)}</h1>${item.meta ? `<p>${esc(item.meta)}</p>` : ""}${item.description ? `<p class="merch-detail-summary">${esc(item.description)}</p>` : ""}</header>${gallery}${item.body ? bodyHtml(item, "merch-detail-body prose") : ""}${links}<p class="back-link"><a href="/merch">← merch</a></p></article>`;
  writeRoute(`/merch/${item.slug}`, page(item.title, item.seo_description || item.description || item.title, `/merch/${item.slug}`, "merch", main, firstImage(item), true));
}

// Info, Contact, Home
const info = site("info");
const socials = info.links.map((link) => `<a href="${esc(link.url)}" target="_blank" rel="noreferrer">${esc(link.label)}</a>`).join("");
writeRoute("/info", page("info", info.description, "/info", "info", `<article class="page-wrap info-page"><p class="page-intro">${esc(info.subtitle)}</p><div class="info-grid info-body"><div class="prose">${esc(info.body)}</div><div class="info-links-block"><nav class="social-links social-links-info" aria-label="소실 외부 링크"><div>${socials}</div></nav></div></div></article>`));

const contact = site("contact");
const instagram = contact.links[0] || { label: "@headlesssosil", url: "https://www.instagram.com/headlesssosil/" };
writeRoute("/contact", page("contact", contact.description, "/contact", "contact", `<article class="page-wrap contact-page"><div class="contact-grid"><div class="contact-addresses">${contact.meta ? `<a class="contact-email" href="mailto:${esc(contact.meta)}">${esc(contact.meta)}</a>` : ""}<a class="contact-instagram" href="${esc(instagram.url)}" target="_blank" rel="noreferrer">${esc(instagram.label)}</a></div><p class="contact-plea">${esc(contact.subtitle)}</p></div></article>`));

const home = site("home");
const featured = discography.find((item) => firstImage(item)) || discography[0];
const homeNews = news.slice(0, 2);
const homeNewsMarkup = homeNews.length ? `<div>${homeNews.map((item) => `<a class="dispatch-row" href="/news/${esc(item.slug)}"><span class="dispatch-date">${esc(displayDate(item.date))}</span><span class="dispatch-copy"><small>${esc(item.meta || "NOTICE")}</small><strong>${esc(item.title)}</strong></span></a>`).join("")}</div>` : '<p class="panel-empty">다음 소식을 준비하고 있습니다.</p>';
const homeMain = `<div class="home-page"><div class="home-content"><div class="home-minimal-grid"><div class="home-cover-column">${featured ? `<a class="home-featured-release" href="${esc(linkUrl(home, "featured") || linkUrl(featured) || "/works/discography")}" target="_blank" rel="noreferrer" aria-label="${esc(featured.title)} Bandcamp에서 듣기"><img src="${esc(firstImage(featured))}" alt="${esc(featured.title)} 앨범 커버"/></a>` : ""}</div><div class="home-right-column"><section class="home-panel news-panel" aria-labelledby="now-heading"><div class="panel-head"><h2 id="now-heading">NEWS</h2><a href="/news">all news</a></div>${homeNewsMarkup}</section><section class="home-panel letters-panel" aria-labelledby="letters-heading"><div class="panel-head"><h2 id="letters-heading">${esc(home.meta)}</h2><span>occasional mail</span></div><p>${esc(home.subtitle)}</p><a class="letter-link" href="${esc(linkUrl(home, "newsletter"))}" target="_blank" rel="noreferrer">메일 남기기</a></section></div></div></div><footer class="home-footer"></footer></div>`;
writeRoute("/", page("소실 SOSIL", home.description, "/", "", homeMain, firstImage(featured)));

const routes = ["/", "/info", "/works/discography", "/works/videos", "/works/live", "/works/others", "/news", "/archive", "/archive/photo-video", "/archive/links", "/merch", "/notes", "/contact"];
for (const item of news) routes.push(`/news/${item.slug}`);
for (const item of notes) routes.push(`/notes/${item.slug}`);
for (const item of archiveMedia) routes.push(`/archive/photo-video/${item.slug}`);
for (const item of discography) routes.push(`/works/discography/${item.slug}`);
for (const item of others) routes.push(`/works/others/${item.slug}`);
for (const item of merch) routes.push(`/merch/${item.slug}`);
routes.sort((a, b) => a.localeCompare(b));
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map((route) => `  <url><loc>${ORIGIN}${route === "/" ? "/" : `${route}/`}</loc></url>`).join("\n")}\n</urlset>\n`;
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap);
console.log(`Built ${routes.length} routes from ${all.length} content files.`);
