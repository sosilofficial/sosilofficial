import fs from "node:fs";
import path from "node:path";

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const issue = event.issue;
if (!issue || !issue.title.startsWith("[Edit]")) throw new Error("CONTENT ERROR: 콘텐츠 수정 양식으로 만든 Issue가 아닙니다.");

function fields(body) {
  const result = {};
  const labels = ["카테고리", "기존 콘텐츠 slug 또는 현재 URL", "새 제목", "새 날짜", "새 본문", "새 설명", "새 썸네일 이미지", "새 본문 이미지", "새 외부 링크", "새 영상 링크", "추가 설명"];
  const pattern = new RegExp(`^### (${labels.join("|")})\\n\\n`, "gm");
  const headings = [...body.matchAll(pattern)];
  headings.forEach((match, index) => {
    const value = body.slice(match.index + match[0].length, headings[index + 1]?.index ?? body.length).trim();
    result[match[1]] = value === "_No response_" ? "" : value;
  });
  return result;
}

const categoryFolders = {
  "News": "content/news", "Notes": "content/notes", "Archive Photo": "content/archive/photo",
  "Archive Video": "content/archive/video", "Archive Links": "content/archive/links",
  "Works Discography": "content/works/discography", "Works Video": "content/works/video",
  "Works Live": "content/works/live", "Works Others": "content/works/others", "Merch": "content/merch",
};

function parseContent(file) {
  const raw = fs.readFileSync(file, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`CONTENT ERROR: front matter가 없습니다: ${file}`);
  const data = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    data[line.slice(0, colon).trim()] = JSON.parse(line.slice(colon + 1).trim());
  }
  return { data, body: match[2].replace(/^\n/, "").replace(/\n$/, "") };
}

const mediaUrls = (value = "") => [...new Set([...value.matchAll(/https?:\/\/[^\s<>"')\]]+|\/[\w./-]+\.(?:jpg|jpeg|png|webp|gif)/gi)].map((match) => match[0].replace(/[.,;:]+$/, "")))];
function youtubeThumbnail(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const id = host === "youtu.be" ? parsed.pathname.split("/").filter(Boolean)[0] : ["youtube.com", "m.youtube.com"].includes(host) ? parsed.searchParams.get("v") || parsed.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] : "";
    return id && /^[\w-]{6,}$/.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : "";
  } catch { return ""; }
}
function parseLinks(value) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const divider = line.indexOf("|");
    const label = divider >= 0 ? line.slice(0, divider).trim() : "link";
    const url = divider >= 0 ? line.slice(divider + 1).trim() : line;
    if (!/^https?:\/\/[^\s<>"']+$/.test(url)) throw new Error(`CONTENT ERROR: 외부 링크가 올바르지 않습니다: ${line}`);
    return { label: label || "link", url };
  });
}

const form = fields(issue.body || "");
const folder = categoryFolders[form["카테고리"]];
if (!folder) throw new Error("CONTENT ERROR: 카테고리를 선택해 주세요.");
const identifier = form["기존 콘텐츠 slug 또는 현재 URL"]?.trim();
if (!identifier) throw new Error("CONTENT ERROR: 기존 콘텐츠 slug 또는 현재 URL을 입력해 주세요.");

let pathname = identifier;
try { pathname = new URL(identifier).pathname; } catch {}
pathname = pathname.replace(/\/$/, "");
const requestedSlug = pathname.split("/").filter(Boolean).at(-1) || identifier;
const directory = path.join(process.cwd(), folder);
const candidates = fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => name.endsWith(".md")).map((name) => path.join(directory, name)) : [];
const matches = candidates.filter((file) => {
  const { data } = parseContent(file);
  const aliases = [data.slug, data.url, data.category === "notes" ? `/notes/${data.slug}` : "", data.category === "notes" ? `/gibberish/${data.slug}` : ""];
  return aliases.includes(identifier.replace(/\/$/, "")) || aliases.includes(pathname) || data.slug === requestedSlug;
});
if (matches.length !== 1) throw new Error(matches.length ? "CONTENT ERROR: 대상 콘텐츠가 여러 개입니다. 카테고리와 URL을 확인해 주세요." : "CONTENT ERROR: 대상 콘텐츠를 찾을 수 없습니다. 카테고리와 slug 또는 URL을 확인해 주세요.");

const target = matches[0];
const { data, body } = parseContent(target);
const next = { ...data };
const value = (label) => form[label]?.trim() || "";
if (value("새 제목")) next.title = value("새 제목");
if (value("새 날짜")) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value("새 날짜"))) throw new Error("CONTENT ERROR: 새 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.");
  next.date = value("새 날짜");
}
let nextBody = body;
if (value("새 본문")) nextBody = value("새 본문");
if (value("새 설명")) { next.description = value("새 설명"); next.seo_description = value("새 설명"); }
if (value("새 썸네일 이미지")) {
  const thumbnail = mediaUrls(value("새 썸네일 이미지"))[0];
  if (!thumbnail) throw new Error("CONTENT ERROR: 새 썸네일 이미지에서 유효한 URL을 찾을 수 없습니다.");
  next.thumbnail = thumbnail;
}
if (value("새 본문 이미지")) {
  const images = mediaUrls(value("새 본문 이미지"));
  if (!images.length) throw new Error("CONTENT ERROR: 새 본문 이미지에서 유효한 URL을 찾을 수 없습니다.");
  next.images = images;
}
if (value("새 외부 링크")) next.links = parseLinks(value("새 외부 링크"));
if (value("새 영상 링크")) {
  const video = mediaUrls(value("새 영상 링크"))[0];
  if (!video) throw new Error("CONTENT ERROR: 새 영상 링크가 올바르지 않습니다.");
  const oldAutomaticThumbnail = youtubeThumbnail(next.video);
  next.video = video;
  if (!next.thumbnail || next.thumbnail === oldAutomaticThumbnail) next.thumbnail = youtubeThumbnail(video);
  if (next.category === "works" && next.subcategory === "video") next.url = video;
}
if (value("추가 설명")) next.meta = value("추가 설명");
if (next.category === "archive" && next.subcategory === "links" && value("새 외부 링크")) next.url = next.links[0]?.url || next.url;

const frontmatter = Object.entries(next).map(([key, entry]) => `${key}: ${JSON.stringify(entry)}`).join("\n");
fs.writeFileSync(target, `---\n${frontmatter}\n---\n\n${nextBody}\n`);
console.log(`Updated ${path.relative(process.cwd(), target)} without changing slug ${next.slug}`);
