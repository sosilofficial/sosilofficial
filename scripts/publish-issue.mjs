import fs from "node:fs";
import path from "node:path";

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const issue = event.issue;
if (!issue || !issue.title.startsWith("[Content]")) throw new Error("CONTENT ERROR: 콘텐츠 등록 양식으로 만든 Issue가 아닙니다.");

function fields(body) {
  const result = {};
  const labels = ["카테고리", "제목", "날짜", "본문", "설명", "썸네일 이미지", "본문 이미지", "외부 링크", "영상 링크", "slug", "추가 설명"];
  const alternatives = labels.join("|");
  const pattern = new RegExp(`^### (${alternatives})\\n\\n`, "gm");
  const headings = [...body.matchAll(pattern)];
  headings.forEach((match, index) => {
    const value = body.slice(match.index + match[0].length, headings[index + 1]?.index ?? body.length).trim();
    result[match[1]] = value === "_No response_" ? "" : value;
  });
  return result;
}

const form = fields(issue.body || "");
const categoryMap = {
  "News": ["news", "", "content/news"],
  "Notes": ["notes", "", "content/notes"],
  "Archive Photo": ["archive", "photo", "content/archive/photo"],
  "Archive Video": ["archive", "video", "content/archive/video"],
  "Archive Links": ["archive", "links", "content/archive/links"],
  "Works Discography": ["works", "discography", "content/works/discography"],
  "Works Video": ["works", "video", "content/works/video"],
  "Works Live": ["works", "live", "content/works/live"],
  "Works Others": ["works", "others", "content/works/others"],
  "Merch": ["merch", "", "content/merch"],
};

const selected = categoryMap[form["카테고리"]];
if (!selected) throw new Error("CONTENT ERROR: 카테고리를 선택해 주세요.");
const title = form["제목"]?.trim();
if (!title) throw new Error("CONTENT ERROR: 제목을 입력해 주세요.");
const date = form["날짜"]?.trim();
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("CONTENT ERROR: 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.");

const [category, subcategory, folder] = selected;
const requestedSlug = form["slug"]?.trim();
const slug = requestedSlug || `${date}-${issue.number}`;
if (!/^[\p{L}\p{N}][\p{L}\p{N}-]*$/u.test(slug)) throw new Error("CONTENT ERROR: slug에는 글자, 숫자, 하이픈만 사용할 수 있습니다.");
const output = path.join(process.cwd(), folder, `${slug}.md`);
if (fs.existsSync(output)) throw new Error(`CONTENT ERROR: 같은 slug가 이미 존재합니다: ${slug}`);
if (category === "archive" && ["photo", "video"].includes(subcategory)) {
  const peer = path.join(process.cwd(), `content/archive/${subcategory === "photo" ? "video" : "photo"}`, `${slug}.md`);
  if (fs.existsSync(peer)) throw new Error(`CONTENT ERROR: Archive Photo/Video에 같은 slug가 이미 존재합니다: ${slug}`);
}

const urls = (value = "") => [...new Set([...value.matchAll(/https?:\/\/[^\s<>"')\]]+|\/[\w./-]+\.(?:jpg|jpeg|png|webp|gif)/gi)].map((match) => match[0].replace(/[.,;:]+$/, "")))];
function youtubeThumbnail(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const id = host === "youtu.be" ? parsed.pathname.split("/").filter(Boolean)[0] : ["youtube.com", "m.youtube.com"].includes(host) ? parsed.searchParams.get("v") || parsed.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] : "";
    return id && /^[\w-]{6,}$/.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : "";
  } catch { return ""; }
}
const linkLines = (form["외부 링크"] || "").split("\n").map((line) => line.trim()).filter(Boolean);
const links = linkLines.map((line) => {
  const divider = line.indexOf("|");
  const label = divider >= 0 ? line.slice(0, divider).trim() : "link";
  const url = divider >= 0 ? line.slice(divider + 1).trim() : line;
  if (!/^https?:\/\//.test(url)) throw new Error(`CONTENT ERROR: 외부 링크가 올바르지 않습니다: ${line}`);
  return { label: label || "link", url };
});
const images = urls(form["본문 이미지"] || "");
const video = urls(form["영상 링크"] || "")[0] || "";
const thumbnail = urls(form["썸네일 이미지"] || "")[0] || youtubeThumbnail(video);
const extra = form["추가 설명"]?.trim() || "";
const meta = category === "news" ? "NOTICE" : subcategory === "video" ? "video" : subcategory === "photo" ? "image" : extra;

const data = {
  type: "content", category, subcategory, title, date, slug,
  url: category === "notes" ? `/notes/${slug}` : category === "archive" && ["photo", "video"].includes(subcategory) ? `/archive/photo-video/${slug}` : category === "works" && subcategory === "video" ? video : category === "archive" && subcategory === "links" ? links[0]?.url || "" : category === "merch" ? `/merch/${slug}` : `/${category}${subcategory ? `/${subcategory}` : ""}/${slug}`,
  description: form["설명"]?.trim() || "", thumbnail, images, video, links, meta,
  media_type: subcategory === "video" ? "video" : subcategory === "photo" ? "image" : "",
  subtitle: "", creator: "", tracklist: [], credits: "", published: true, body_format: "markdown",
};
const frontmatter = Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `---\n${frontmatter}\n---\n\n${form["본문"]?.trim() || ""}\n`);
console.log(`Created ${path.relative(process.cwd(), output)}`);
