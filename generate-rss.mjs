import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import fs from 'fs';

const FACILITY_ID   = 37135;
const FACILITY_NAME = 'かたちるベース';
const BASE_URL      = `https://snabi.jp/facility/${FACILITY_ID}/blog_articles`;
const OUTPUT_FILE   = 'feed.xml';

async function fetchPage(page = 1) {
  const url = page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;
// 変更後
const res = await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  },
});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const dom  = new JSDOM(html);
  const el   = dom.window.document.querySelector('[data-blog-articles]');
  if (!el) throw new Error('data-blog-articles not found');
  const articles   = JSON.parse(el.dataset.blogArticles);
  const pagination = JSON.parse(
    dom.window.document.querySelector('[data-pagination-attributes]')
      ?.dataset.paginationAttributes || '{}'
  );
  return { articles, pagination };
}

function extractText(contentState) {
  try {
    const obj = JSON.parse(contentState);
    return obj.blocks.map(b => b.text).filter(Boolean).join(' ').slice(0, 400).trim();
  } catch { return ''; }
}

function extractThumbnails(contentState) {
  try {
    const obj = JSON.parse(contentState);
    const images = Object.values(obj.entityMap || {})
      .filter(e => e.type === 'IMAGE' && e.data?.src)
      .map(e => e.data.src);
    return images.slice(0, 10);
  } catch { return []; }
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildRss(articles) {
  const items = articles.map(a => {
    const link      = `https://snabi.jp/facility/${a.facility_id}/blog_articles/${a.id}`;
    const pubDate   = new Date(a.formatted_open_at).toUTCString();
    const desc      = escapeXml(extractText(a.content_state));
    const thumbnails = extractThumbnails(a.content_state);
    const combinedUrl = thumbnails.join(',');
    const mediaTags = combinedUrl
  ? `\n      <media:content url="${combinedUrl}" medium="image"/>`
  : '';
    return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${desc}…</description>${mediaTags}
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(FACILITY_NAME)} ブログ</title>
    <link>${BASE_URL}</link>
    <description>${escapeXml(FACILITY_NAME)} の最新ブログ記事</description>
    <language>ja</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

(async () => {
  const { articles } = await fetchPage(1);
  const limited = articles.slice(0, 5);
  const rss = buildRss(limited);
  fs.writeFileSync(OUTPUT_FILE, rss, 'utf8');
  console.log(`✅ ${limited.length}件取得完了 → ${OUTPUT_FILE}`);
})();
