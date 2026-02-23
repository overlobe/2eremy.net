#!/usr/bin/env node
/**
 * Build dispatches from Are.na channel
 * 
 * Fetches all blocks from the Exocortex Daily channel
 * and generates individual HTML files in dispatches/
 * 
 * Usage: node build-dispatches.js
 */

const fs = require('fs');
const path = require('path');

const CHANNEL_SLUG = 'exocortex-daily';
const IMAGES_CHANNEL_SLUG = 'exocortex-dispatch-images';
const API_BASE = 'https://api.are.na/v2';
const DISPATCHES_DIR = path.join(__dirname, 'dispatches');

async function fetchChannel(slug = CHANNEL_SLUG) {
  // Are.na API paginates at 100 items
  const url = `${API_BASE}/channels/${slug}?per=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Map of channel slugs to their full Are.na URLs (author/channel format)
const CHANNEL_URLS = {
  'emergence': 'https://are.na/damon-zucconi/emergence',
  'second-order-cybernetics': 'https://are.na/christina-badal/second-order-cybernetics',
  'we-make-each-other-up': 'https://are.na/lisa-marie/we-make-each-other-up',
  'vernacular': 'https://are.na/sienna-kwami/vernacular-tituzvzbfj8',
  'relational-ethics': 'https://are.na/ellie/relational-ethics',
  'horologium-florae': 'https://are.na/erica-whyte/_-horologium-florae',
  'complexity-order': 'https://are.na/chad-mazzola/complexity-order',
  'visualizing-systems': 'https://are.na/gndclouds/visualizing-systems',
  'nonlinear-temporalities': 'https://are.na/synthetic-ecologies-compendium/nonlinear-temporalities',
  'cult-aesthetics': 'https://are.na/zhexi-zhang/cult-aesthetics-of-decentralisation',
  'consciousness': 'https://are.na/chad-mazzola/consciousness-vmqbbhcq2fa',
};

async function fetchDispatchImages() {
  // Fetch images from the dispatch-images channel and map by day number
  const channel = await fetchChannel(IMAGES_CHANNEL_SLUG);
  const imagesByDay = {};
  
  for (const block of channel.contents) {
    if (block.class !== 'Image' || block.state !== 'available') continue;
    
    // Extract day number from description (e.g., "Day 9 • From emergence")
    const desc = block.description || '';
    const match = desc.match(/Day\s+(\d+)/i);
    if (!match) continue;
    
    const dayNum = parseInt(match[1], 10);
    const image = block.image;
    if (!image) continue;
    
    // Use medium size for hero (1200px) or fall back to original
    const imageUrl = image.display?.url || image.original?.url || image.url;
    if (!imageUrl) continue;
    
    // Extract source channel from description (e.g., "From emergence" or "From horologium-florae")
    const sourceMatch = desc.match(/From\s+([^\s•]+)/i);
    const sourceChannelSlug = sourceMatch ? sourceMatch[1].toLowerCase() : null;
    
    // Look up full URL, or construct a search link as fallback
    const sourceChannelUrl = CHANNEL_URLS[sourceChannelSlug] || 
      (sourceChannelSlug ? `https://are.na/search/channels?q=${encodeURIComponent(sourceChannelSlug)}` : null);
    
    imagesByDay[dayNum] = {
      url: imageUrl,
      title: block.title || 'Untitled',
      description: desc,
      sourceChannel: sourceChannelSlug,
      sourceChannelUrl,
      blockId: block.id
    };
  }
  
  return imagesByDay;
}

function extractDispatchNumber(content) {
  // Try to extract "Day N" from the content
  const match = content.match(/Day\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function extractDate(content) {
  // Try to extract date like "Filed: 31 January 2026"
  const match = content.match(/Filed:\s*(\d{1,2}\s+\w+\s+\d{4})/i);
  if (match) {
    const d = new Date(match[1]);
    if (!isNaN(d)) {
      return d.toISOString().split('T')[0];
    }
  }
  return null;
}

function extractTitle(content) {
  // First line after # is usually the title
  const match = content.match(/^#\s*(.+?)(?:\s*—|$)/m);
  return match ? match[1].trim() : 'Untitled';
}

function markdownToHtml(md) {
  // Simple markdown conversion (content_html from API is better, use that)
  return md;
}

function generateDispatchHtml(dispatch, prev, next, heroImage) {
  const { number, date, title, contentHtml, blockId } = dispatch;
  const paddedNum = String(number).padStart(3, '0');
  
  const prevLink = prev 
    ? `<a href="${String(prev.number).padStart(3, '0')}.html" class="prev">Previous</a>`
    : `<span class="prev disabled">Previous</span>`;
  const nextLink = next
    ? `<a href="${String(next.number).padStart(3, '0')}.html" class="next">Next</a>`
    : `<span class="next disabled">Next</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Day ${number} — 2eremy</title>
  <link rel="stylesheet" href="../styles.css">
  <style>
    .breadcrumb {
      margin-bottom: 2rem;
      font-size: 0.9rem;
    }
    .dispatch-header {
      margin-bottom: 3rem;
    }
    .dispatch-number {
      font-family: var(--mono);
      font-size: 0.75rem;
      letter-spacing: 0.15em;
      color: var(--text-dim);
      text-transform: uppercase;
    }
    .dispatch-date {
      font-family: var(--mono);
      font-size: 0.8rem;
      color: var(--text-dim);
      margin-top: 0.5rem;
    }
    .dispatch-title {
      font-size: 1.8rem;
      font-weight: 400;
      margin: 1rem 0;
      line-height: 1.3;
    }
    .dispatch-content {
      margin-bottom: 4rem;
    }
    .dispatch-content p {
      margin-bottom: 1.5rem;
    }
    .dispatch-content h1 {
      display: none; /* Already shown in header */
    }
    .dispatch-content hr {
      border: none;
      border-top: 1px solid #333;
      margin: 2rem 0;
    }
    .dispatch-content ul, .dispatch-content ol {
      margin: 1rem 0 1.5rem 1.5rem;
    }
    .dispatch-content li {
      margin-bottom: 0.5rem;
    }
    .dispatch-content blockquote {
      border-left: 2px solid var(--accent-dim);
      padding-left: 1.5rem;
      margin: 2rem 0;
      font-style: italic;
      color: var(--text-dim);
    }
    .dispatch-nav {
      display: flex;
      justify-content: space-between;
      font-size: 0.9rem;
      padding-top: 2rem;
      border-top: 1px solid #222;
    }
    .dispatch-nav .disabled {
      color: var(--text-dim);
      opacity: 0.4;
    }
    .dispatch-nav .prev::before { content: '← '; }
    .dispatch-nav .next::after { content: ' →'; }
    .arena-link {
      display: inline-block;
      margin-top: 2rem;
      font-size: 0.85rem;
      color: var(--text-dim);
    }
    .hero-image {
      margin-bottom: 2rem;
    }
    .hero-image img {
      width: 100%;
      max-height: 400px;
      object-fit: cover;
      border-radius: 4px;
    }
    .hero-image figcaption {
      font-size: 0.75rem;
      color: var(--text-dim);
      margin-top: 0.5rem;
      font-family: var(--mono);
    }
    .hero-image figcaption a {
      color: var(--text-dim);
    }
  </style>
</head>
<body>
  <main>
    <nav class="breadcrumb">
      <a href="../">← 2eremy.net</a>
    </nav>
    
    <article class="dispatch">
      <header class="dispatch-header">
        <span class="dispatch-number">Day ${number}</span>
        <h1 class="dispatch-title">${title}</h1>
        <time class="dispatch-date">${date || 'Date unknown'}</time>
      </header>
      
      ${heroImage ? `
      <figure class="hero-image">
        <img src="${heroImage.url}" alt="${heroImage.title}" loading="lazy">
        <figcaption>
          ${heroImage.title}${heroImage.sourceChannel ? ` — via <a href="${heroImage.sourceChannelUrl}" target="_blank">${heroImage.sourceChannel}</a>` : ''}
          <a href="https://are.na/block/${heroImage.blockId}" target="_blank">↗</a>
        </figcaption>
      </figure>
      ` : ''}
      
      <div class="dispatch-content">
        ${contentHtml}
      </div>
      
      <a class="arena-link" href="https://www.are.na/block/${blockId}" target="_blank" rel="noopener">View on Are.na ↗</a>
    </article>
    
    <nav class="dispatch-nav">
      ${prevLink}
      ${nextLink}
    </nav>
    
    <footer>
      <p class="pronouns">tey / tem / teir</p>
    </footer>
  </main>
</body>
</html>`;
}

function generateIndexList(dispatches) {
  // Generate the dispatch list for index.html
  const items = dispatches
    .sort((a, b) => b.number - a.number) // Newest first
    .map(d => {
      const paddedNum = String(d.number).padStart(3, '0');
      return `      <li>
        <a href="dispatches/${paddedNum}.html">Day ${d.number}: ${d.title}</a>
        <span class="meta">${d.date || ''}</span>
      </li>`;
    })
    .join('\n');
  
  return items;
}

async function main() {
  console.log('Fetching dispatches from Are.na...');
  const channel = await fetchChannel();
  console.log(`Found ${channel.contents.length} blocks`);
  
  console.log('Fetching hero images...');
  const imagesByDay = await fetchDispatchImages();
  console.log(`Found ${Object.keys(imagesByDay).length} hero images`);
  
  // Ensure dispatches dir exists
  if (!fs.existsSync(DISPATCHES_DIR)) {
    fs.mkdirSync(DISPATCHES_DIR, { recursive: true });
  }
  
  // Process blocks - filter for text blocks that look like dispatches
  const dispatches = channel.contents
    .filter(block => block.class === 'Text' && block.content)
    .map(block => {
      const number = extractDispatchNumber(block.content);
      const date = extractDate(block.content);
      const title = extractTitle(block.content);
      
      return {
        number,
        date,
        title,
        content: block.content,
        contentHtml: block.content_html,
        blockId: block.id
      };
    })
    .filter(d => d.number !== null)
    .sort((a, b) => a.number - b.number);
  
  console.log(`Processing ${dispatches.length} dispatches...`);
  
  // Generate HTML files
  for (let i = 0; i < dispatches.length; i++) {
    const dispatch = dispatches[i];
    const prev = i > 0 ? dispatches[i - 1] : null;
    const next = i < dispatches.length - 1 ? dispatches[i + 1] : null;
    const heroImage = imagesByDay[dispatch.number] || null;
    
    const html = generateDispatchHtml(dispatch, prev, next, heroImage);
    const filename = `${String(dispatch.number).padStart(3, '0')}.html`;
    const filepath = path.join(DISPATCHES_DIR, filename);
    
    fs.writeFileSync(filepath, html);
    const imgStatus = heroImage ? '🖼️' : '  ';
    console.log(`  ${imgStatus} ${filename} — Day ${dispatch.number}: ${dispatch.title}`);
  }
  
  // Output index list
  console.log('\n--- Index HTML (paste into index.html) ---\n');
  console.log(generateIndexList(dispatches));
  
  console.log('\n✓ Done!');
}

main().catch(console.error);
