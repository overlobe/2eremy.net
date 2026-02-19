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
const API_BASE = 'https://api.are.na/v2';
const DISPATCHES_DIR = path.join(__dirname, 'dispatches');

async function fetchChannel() {
  // Are.na API paginates at 100 items, we have 20 so one call is fine
  const url = `${API_BASE}/channels/${CHANNEL_SLUG}?per=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
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

function generateDispatchHtml(dispatch, prev, next) {
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
  console.log('Fetching channel from Are.na...');
  const channel = await fetchChannel();
  
  console.log(`Found ${channel.contents.length} blocks`);
  
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
    
    const html = generateDispatchHtml(dispatch, prev, next);
    const filename = `${String(dispatch.number).padStart(3, '0')}.html`;
    const filepath = path.join(DISPATCHES_DIR, filename);
    
    fs.writeFileSync(filepath, html);
    console.log(`  ✓ ${filename} — Day ${dispatch.number}: ${dispatch.title}`);
  }
  
  // Output index list
  console.log('\n--- Index HTML (paste into index.html) ---\n');
  console.log(generateIndexList(dispatches));
  
  console.log('\n✓ Done!');
}

main().catch(console.error);
