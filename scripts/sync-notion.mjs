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

// Token formats — every token is a single paragraph block:
//   {{img:file.jpg}}                               full-bleed image, 0 horizontal margin (optional |caption)
//   {{img-inline:file.jpg}}                        boxed image inside the body column (optional |caption)
//   {{video:clip.mp4}}                             muted+looping video, full-bleed (optional |caption)
//   {{slider:a.jpg|b.jpg|c.jpg|autoplay=true}}     scroll-snap carousel (options: caption=, autoplay=true, style=marquee)
//   {{letter:Nū}}                                  oversized display letter (typographic break)
//   {{polaroids:a.jpg@-12,b.jpg@0,c.jpg@8}}        rotated photo cluster (rotation in degrees after @)
//   {{polaroids:a.jpg@-6|Behind the scenes,b.jpg|Studio shot,c.jpg@3}}
//                                                   each card may carry an optional |caption
//                                                   (captions may contain commas — cards are
//                                                    split only at the next filename.ext boundary)
//   {{pair:a.jpg|b.jpg}}                           two large mockups side by side, slight right overflow
//   {{stack:a.jpg|b.jpg|c.jpg|d.jpg|indent=1,2}}   full-bleed vertical stack; indent= lists 0-based
//                                                   frame indices that should sit inset 40px each side
const TOKEN_RE      = /^\s*\{\{(img|video):([^|}]+?)(?:\|([^}]+))?\}\}\s*$/;
const IMG_INLINE_RE = /^\s*\{\{img-inline:([^|}]+?)(?:\|([^}]+))?\}\}\s*$/;
const SLIDER_RE     = /^\s*\{\{slider:([^}]+)\}\}\s*$/;
const LETTER_RE     = /^\s*\{\{letter:([^}]+)\}\}\s*$/;
const POLAROIDS_RE  = /^\s*\{\{polaroids:([^}]+)\}\}\s*$/;
const PAIR_RE       = /^\s*\{\{pair:([^}]+)\}\}\s*$/;
const STACK_RE      = /^\s*\{\{stack:([^}]+)\}\}\s*$/;

function parseToken(text, slug) {
  // Inline (boxed) image — checked before {{img:}} so the prefix doesn't conflict
  const ii = text.match(IMG_INLINE_RE);
  if (ii) {
    return {
      type: 'image',
      src: `images/projects/${slug}/${ii[1].trim()}`,
      caption: ii[2]?.trim() || '',
      inline: true
    };
  }

  // Slider — pipe-separated frames + optional key=value options.
  // Each frame may optionally end in @<degrees> for per-frame rotation
  // (used by style=polaroid; ignored by other styles).
  const sm = text.match(SLIDER_RE);
  if (sm) {
    const parts = sm[1].split('|').map(s => s.trim()).filter(Boolean);
    const frames = [];
    const opts = {};
    for (const p of parts) {
      const eq = p.indexOf('=');
      if (eq > 0 && !p.includes('/') && !/\.[a-z0-9]+$/i.test(p)) {
        opts[p.slice(0, eq).trim()] = p.slice(eq + 1).trim();
      } else {
        const at = p.lastIndexOf('@');
        if (at > 0) {
          const rot = parseFloat(p.slice(at + 1));
          if (!Number.isNaN(rot)) {
            frames.push({ src: `images/projects/${slug}/${p.slice(0, at).trim()}`, rotation: rot });
            continue;
          }
        }
        frames.push({ src: `images/projects/${slug}/${p}` });
      }
    }
    if (!frames.length) return null;
    return {
      type: 'slider',
      frames,
      caption: opts.caption || '',
      autoplay: opts.autoplay === 'true',
      style: opts.style || 'slide'
    };
  }

  // Letter — oversized display letterform
  const lt = text.match(LETTER_RE);
  if (lt) return { type: 'letter', text: lt[1].trim() };

  // Polaroids — comma-separated cards. Each card can carry:
  //   • a rotation     →  filename@<deg>     e.g. a.jpg@-6
  //   • a caption      →  filename|<text>    e.g. a.jpg|Behind the scenes
  //   • both, any order:  a.jpg@-6|caption  /  a.jpg|caption@-6
  //
  // The card separator is a comma, but captions routinely contain commas
  // ("Long before air conditioning, Korea met the summer heat…"). Splitting
  // naively on every comma tears such captions apart and turns the tail into a
  // bogus filename. So we split on a comma ONLY when it begins a NEW card —
  // i.e. the next non-space text is a filename ending in an image extension
  // (optionally followed by @rotation, then end / | / ,). A comma inside a
  // caption is followed by prose, never that pattern, so it stays put.
  const pl = text.match(POLAROIDS_RE);
  if (pl) {
    const CARD_START = /,\s*(?=[^,|]+?\.(?:jpe?g|png|webp|gif|avif)(?:@-?\d+(?:\.\d+)?)?\s*(?:\||,|$))/i;
    const items = pl[1].split(CARD_START).map(s => s.trim()).filter(Boolean).map(item => {
      let filename = item;
      let rotation = 0;
      let caption = '';

      // Pull off |caption if present (caption may itself contain @ or commas,
      // so split on the first pipe before touching anything else)
      const pipe = filename.indexOf('|');
      if (pipe >= 0) {
        caption = filename.slice(pipe + 1).trim();
        filename = filename.slice(0, pipe).trim();
      }
      // Then peel off @rotation from the (now caption-free) filename portion
      const at = filename.lastIndexOf('@');
      if (at > 0) {
        const rot = parseFloat(filename.slice(at + 1));
        if (!Number.isNaN(rot)) {
          rotation = rot;
          filename = filename.slice(0, at).trim();
        }
      }
      return {
        src: `images/projects/${slug}/${filename}`,
        rotation,
        caption
      };
    });
    if (!items.length) return null;
    return { type: 'polaroids', items };
  }

  // Pair — exactly two pipe-separated images
  const pr = text.match(PAIR_RE);
  if (pr) {
    const images = pr[1].split('|').map(s => s.trim()).filter(Boolean)
      .map(name => `images/projects/${slug}/${name}`);
    if (images.length !== 2) return null;
    return { type: 'pair', images };
  }

  // Stack — pipe-separated images + optional indent=0,1,…
  const st = text.match(STACK_RE);
  if (st) {
    const parts = st[1].split('|').map(s => s.trim()).filter(Boolean);
    const images = [];
    let indent = [];
    for (const p of parts) {
      if (p.startsWith('indent=')) {
        indent = p.slice(7).split(',').map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n));
      } else {
        images.push(`images/projects/${slug}/${p}`);
      }
    }
    if (!images.length) return null;
    return { type: 'stack', images, indent };
  }

  // Single image / video
  const m = text.match(TOKEN_RE);
  if (!m) return null;
  const [, kind, filename, caption] = m;
  const src = `images/projects/${slug}/${filename.trim()}`;
  if (kind === 'img') {
    return { type: 'image', src, caption: caption?.trim() || '' };
  }
  return { type: 'video', src, loop: true, muted: true, caption: caption?.trim() || '' };
}

// Tone — optional hex color set in Notion DB (rich_text property "Tone").
// When present, the project detail page tints body bg + denim to this color.
function getTone(props) {
  return readHexProp(props, 'Tone');
}

// Tone Text — optional hex applied to every piece of text on the project
// detail page (title, body, meta, headings). Defaults to the site palette
// when empty. Lets each project carry its own text color against its tone.
function getToneText(props) {
  return readHexProp(props, 'Tone Text');
}

function readHexProp(props, name) {
  const raw = getRichText(props, name).trim();
  if (!raw) return null;
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
  console.warn(`  invalid ${name} "${raw}" — must be hex like #906e47, skipping`);
  return null;
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
    tone: getTone(props),
    toneText: getToneText(props),
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
