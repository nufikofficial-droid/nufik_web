#!/usr/bin/env node
// Fetch Portfolio DB from Notion and write data/projects.json
// Usage: NOTION_TOKEN=secret_xxx node scripts/sync-notion.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const OUTPUT_PATH = join(REPO_ROOT, 'data', 'projects.json');

const TOKEN = process.env.NOTION_TOKEN;
const DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID || '9fa758d7-5156-4de5-adc7-c67305572514';
const NOTION_VERSION = '2025-09-03';

if (!TOKEN) {
  console.error('ERROR: NOTION_TOKEN is required');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Notion-Version': NOTION_VERSION,
  'Content-Type': 'application/json',
};

async function notionFetch(path, options = {}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API ${res.status} on ${path}: ${body}`);
  }
  return res.json();
}

async function queryDataSource(dataSourceId) {
  const results = [];
  let cursor;
  do {
    const body = {
      filter: { property: 'Published', checkbox: { equals: true } },
      sorts: [{ property: 'Order', direction: 'ascending' }],
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    const data = await notionFetch(`/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return results;
}

async function fetchBlocks(blockId) {
  const blocks = [];
  let cursor;
  do {
    const qs = cursor ? `?start_cursor=${cursor}&page_size=100` : '?page_size=100';
    const data = await notionFetch(`/blocks/${blockId}/children${qs}`);
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return blocks;
}

// Property accessors

function readProp(props, name) {
  return props?.[name];
}

function getTitle(props, name) {
  const p = readProp(props, name);
  return p?.title?.map(t => t.plain_text).join('') ?? '';
}

function getRichText(props, name) {
  const p = readProp(props, name);
  return p?.rich_text?.map(t => t.plain_text).join('') ?? '';
}

function getSelect(props, name) {
  return readProp(props, name)?.select?.name ?? '';
}

function getMultiSelect(props, name) {
  return readProp(props, name)?.multi_select?.map(s => s.name) ?? [];
}

function getNumber(props, name) {
  return readProp(props, name)?.number ?? null;
}

// Rich text → plain text (concat)
function richToText(rich) {
  return (rich ?? []).map(t => t.plain_text).join('');
}

// Token regex: {{img:filename}} or {{video:filename}} or {{img:filename|caption}}
const TOKEN_RE = /^\s*\{\{(img|video):([^|}]+?)(?:\|([^}]+))?\}\}\s*$/;

function parseToken(text, slug) {
  const m = text.match(TOKEN_RE);
  if (!m) return null;
  const [, kind, filename, caption] = m;
  const src = `images/projects/${slug}/${filename.trim()}`;
  if (kind === 'img') {
    return { type: 'image', src, caption: caption?.trim() || '' };
  }
  return { type: 'video', src, loop: true, muted: true, caption: caption?.trim() || '' };
}

// Convert Notion blocks to portable JSON content blocks
function blocksToContent(blocks, slug) {
  const out = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'heading_1':
      case 'heading_2':
      case 'heading_3': {
        const level = Number(b.type.slice(-1));
        out.push({ type: 'heading', level, text: richToText(b[b.type].rich_text) });
        break;
      }
      case 'paragraph': {
        const text = richToText(b.paragraph.rich_text);
        if (!text.trim()) break; // skip blank paragraphs
        const token = parseToken(text, slug);
        if (token) out.push(token);
        else out.push({ type: 'paragraph', text });
        break;
      }
      case 'bulleted_list_item':
      case 'numbered_list_item': {
        const style = b.type === 'bulleted_list_item' ? 'bulleted' : 'numbered';
        const text = richToText(b[b.type].rich_text);
        // group consecutive list items
        const last = out[out.length - 1];
        if (last && last.type === 'list' && last.style === style) {
          last.items.push(text);
        } else {
          out.push({ type: 'list', style, items: [text] });
        }
        break;
      }
      case 'quote':
        out.push({ type: 'quote', text: richToText(b.quote.rich_text) });
        break;
      case 'divider':
        out.push({ type: 'divider' });
        break;
      case 'image': {
        // Direct Notion image upload (will expire — warn the designer to use tokens)
        const src = b.image.type === 'external' ? b.image.external.url : b.image.file.url;
        out.push({ type: 'image', src, caption: richToText(b.image.caption ?? []), warning: 'Notion-hosted URL expires in 1h. Use {{img:filename}} token instead.' });
        break;
      }
      case 'video': {
        const src = b.video.type === 'external' ? b.video.external.url : b.video.file.url;
        out.push({ type: 'video', src, loop: true, muted: true, warning: 'Notion-hosted URL expires in 1h. Use {{video:filename}} token instead.' });
        break;
      }
      default:
        // ignore unsupported block types silently
        break;
    }
  }
  return out;
}

function pageToProject(page, content) {
  const props = page.properties;
  const slug = getRichText(props, 'Slug').trim();
  const cover = getRichText(props, 'Cover').trim();
  return {
    slug,
    name: getTitle(props, 'Name'),
    category: getSelect(props, 'Category'),
    year: getRichText(props, 'Year'),
    client: getRichText(props, 'Client'),
    description: getRichText(props, 'Description'),
    cover: cover ? `images/projects/${slug}/${cover}` : '',
    tags: getMultiSelect(props, 'Tags'),
    order: getNumber(props, 'Order') ?? 9999,
    content,
  };
}

async function main() {
  console.log(`Querying Notion data source ${DATA_SOURCE_ID}...`);
  const pages = await queryDataSource(DATA_SOURCE_ID);
  console.log(`Found ${pages.length} published projects`);

  const projects = [];
  for (const page of pages) {
    const slug = getRichText(page.properties, 'Slug').trim();
    if (!slug) {
      console.warn(`  skipping page ${page.id} — no Slug`);
      continue;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      console.warn(`  skipping ${slug} — invalid slug (use lowercase letters, digits, hyphens only)`);
      continue;
    }
    console.log(`  fetching blocks: ${slug}`);
    const blocks = await fetchBlocks(page.id);
    const content = blocksToContent(blocks, slug);
    projects.push(pageToProject(page, content));
  }

  projects.sort((a, b) => a.order - b.order);

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(projects, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${projects.length} projects to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
