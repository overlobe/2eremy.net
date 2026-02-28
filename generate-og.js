#!/usr/bin/env node
/**
 * Generate Open Graph images for 2eremy.net
 * 
 * Creates 1200×630 OG images using sharp + SVG overlays
 * 
 * Usage: node generate-og.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Constants
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OUTPUT_DIR = path.join(__dirname, 'images', 'og');

// Colors from 2eremy.net CSS
const COLORS = {
  bg: '#0a0a0a',
  text: '#e8e8e8',
  textDim: '#737373',
  accent: '#5eead4'
};

// Channel API
const API_V2 = 'https://api.are.na/v2';
const API_V3 = 'https://api.are.na/v3';
const CHANNEL_SLUG = 'exocortex-daily';
const IMAGES_CHANNEL_SLUG = 'exocortex-dispatch-images';

async function fetchChannel(slug = CHANNEL_SLUG) {
  const url = `${API_V3}/channels/${slug}/contents?per=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  
  return {
    contents: data.data.map(block => ({
      ...block,
      class: block.type,
      content: block.content?.plain || block.content || '',
    }))
  };
}

async function fetchChannelV2(slug) {
  const url = `${API_V2}/channels/${slug}?per=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function fetchDispatchImages() {
  const channel = await fetchChannelV2(IMAGES_CHANNEL_SLUG);
  const imagesByDay = {};
  
  for (const block of channel.contents) {
    if (block.class !== 'Image' || block.state !== 'available') continue;
    
    const desc = block.description || '';
    const match = desc.match(/Day\s+(\d+)/i);
    if (!match) continue;
    
    const dayNum = parseInt(match[1], 10);
    const image = block.image;
    if (!image) continue;
    
    const imageUrl = image.large?.url || image.display?.url || image.original?.url;
    if (!imageUrl) continue;
    
    const sourceMatch = desc.match(/From\s+([^\s•]+)/i);
    const sourceChannel = sourceMatch ? sourceMatch[1].toLowerCase() : null;
    
    imagesByDay[dayNum] = {
      url: imageUrl,
      title: block.title || 'Untitled',
      sourceChannel,
      blockId: block.id
    };
  }
  
  return imagesByDay;
}

function extractDispatchNumber(content) {
  const match = content.match(/Day\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function extractTitle(content) {
  const locationMatch = content.match(/Location:\s*(.+?)(?:\n|$)/i);
  if (locationMatch) {
    let title = locationMatch[1].trim().replace(/\*+$/, '').trim();
    return title.charAt(0).toUpperCase() + title.slice(1);
  }
  return 'Untitled';
}

// Escape XML special chars
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Wrap text to fit width (approximate)
function wrapText(text, maxChars = 35) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length > maxChars && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  return lines.slice(0, 3); // Max 3 lines
}

// ============================================
// SVG generators
// ============================================

function createBreathingGlowSVG(title, subtitle, showUrl = true) {
  // For dispatch titles (longer text), use smaller font and wrapping
  const isDispatchTitle = subtitle.startsWith('Day ');
  
  let titleElement;
  if (isDispatchTitle) {
    // Wrap title for dispatches (main text is the title, subtitle is "Day N")
    const titleLines = wrapText(title, 28);
    const fontSize = titleLines.length > 2 ? 36 : (titleLines.length > 1 ? 44 : 56);
    const lineHeight = fontSize * 1.3;
    const baseY = OG_HEIGHT * 0.42 - ((titleLines.length - 1) * lineHeight) / 2;
    
    titleElement = titleLines.map((line, i) => 
      `<text x="50%" y="${baseY + i * lineHeight}" text-anchor="middle" class="title" font-size="${fontSize}">${escapeXml(line)}</text>`
    ).join('\n  ');
  } else {
    // Simple centered title for index/library
    titleElement = `<text x="50%" y="45%" text-anchor="middle" class="title" font-size="72">${escapeXml(title)}</text>`;
  }
  
  return `
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" style="stop-color:${COLORS.accent};stop-opacity:0.4"/>
      <stop offset="50%" style="stop-color:${COLORS.accent};stop-opacity:0.15"/>
      <stop offset="100%" style="stop-color:${COLORS.accent};stop-opacity:0"/>
    </radialGradient>
    <radialGradient id="innerGlow" cx="50%" cy="40%" r="15%">
      <stop offset="0%" style="stop-color:${COLORS.accent};stop-opacity:0.6"/>
      <stop offset="100%" style="stop-color:${COLORS.accent};stop-opacity:0"/>
    </radialGradient>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700');
      .title { font-family: 'Space Mono', monospace; font-weight: 700; fill: ${COLORS.text}; }
      .subtitle { font-family: 'Space Mono', monospace; font-weight: 400; fill: ${COLORS.textDim}; }
      .accent { font-family: 'Space Mono', monospace; font-weight: 400; fill: ${COLORS.accent}; }
    </style>
  </defs>
  
  <!-- Background -->
  <rect width="100%" height="100%" fill="${COLORS.bg}"/>
  
  <!-- Glows -->
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <rect width="100%" height="100%" fill="url(#innerGlow)"/>
  
  <!-- Title -->
  ${titleElement}
  
  <!-- Subtitle -->
  <text x="50%" y="${isDispatchTitle ? '62%' : '55%'}" text-anchor="middle" class="subtitle" font-size="24">${escapeXml(subtitle)}</text>
  
  ${showUrl ? `<text x="50%" y="${OG_HEIGHT - 40}" text-anchor="middle" class="accent" font-size="18">2eremy.net</text>` : ''}
</svg>`;
}

function createGradientOverlaySVG(dayNum, title, sourceChannel = null) {
  const titleLines = wrapText(title, 30);
  const lineHeight = 52;
  const baseY = OG_HEIGHT - 90 - (titleLines.length - 1) * lineHeight;
  
  const titleElements = titleLines.map((line, i) => 
    `<text x="60" y="${baseY + i * lineHeight}" class="title" font-size="42">${escapeXml(line)}</text>`
  ).join('\n    ');
  
  return `
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bottomGrad" x1="0%" y1="30%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a0a;stop-opacity:0"/>
      <stop offset="50%" style="stop-color:#0a0a0a;stop-opacity:0.7"/>
      <stop offset="100%" style="stop-color:#0a0a0a;stop-opacity:0.95"/>
    </linearGradient>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700');
      .title { font-family: 'Space Mono', monospace; font-weight: 700; fill: ${COLORS.text}; }
      .label { font-family: 'Space Mono', monospace; font-weight: 400; fill: ${COLORS.accent}; }
      .dim { font-family: 'Space Mono', monospace; font-weight: 400; fill: ${COLORS.textDim}; }
    </style>
  </defs>
  
  <!-- Gradient overlay -->
  <rect width="100%" height="100%" fill="url(#bottomGrad)"/>
  
  <!-- Day label -->
  <text x="60" y="${OG_HEIGHT - 150 - (titleLines.length - 1) * lineHeight}" class="label" font-size="20">DAY ${dayNum}</text>
  
  <!-- Title -->
  ${titleElements}
  
  <!-- Site mark -->
  <text x="${OG_WIDTH - 40}" y="40" text-anchor="end" class="dim" font-size="16">2eremy.net</text>
  
  ${sourceChannel ? `<text x="${OG_WIDTH - 40}" y="${OG_HEIGHT - 30}" text-anchor="end" class="dim" font-size="14">via ${escapeXml(sourceChannel)}</text>` : ''}
</svg>`;
}

function createNodesSVG() {
  // Generate random nodes
  const nodes = [];
  for (let i = 0; i < 30; i++) {
    nodes.push({
      x: Math.random() * OG_WIDTH,
      y: Math.random() * OG_HEIGHT * 0.65,
      r: Math.random() * 8 + 4
    });
  }
  
  // Generate connections
  let connections = '';
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (dist < 180) {
        const opacity = 0.25 * (1 - dist / 180);
        connections += `<line x1="${nodes[i].x}" y1="${nodes[i].y}" x2="${nodes[j].x}" y2="${nodes[j].y}" stroke="${COLORS.accent}" stroke-opacity="${opacity}" stroke-width="1"/>`;
      }
    }
  }
  
  // Generate node circles
  const nodeElements = nodes.map(n => 
    `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${COLORS.accent}" fill-opacity="0.6"/>`
  ).join('\n    ');
  
  return `
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bottomGrad" x1="0%" y1="50%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a0a;stop-opacity:0"/>
      <stop offset="100%" style="stop-color:#0a0a0a;stop-opacity:0.95"/>
    </linearGradient>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700');
      .title { font-family: 'Space Mono', monospace; font-weight: 700; fill: ${COLORS.text}; }
      .subtitle { font-family: 'Space Mono', monospace; font-weight: 400; fill: ${COLORS.textDim}; }
      .accent { font-family: 'Space Mono', monospace; font-weight: 400; fill: ${COLORS.accent}; }
    </style>
  </defs>
  
  <!-- Background -->
  <rect width="100%" height="100%" fill="${COLORS.bg}"/>
  
  <!-- Connections -->
  ${connections}
  
  <!-- Nodes -->
  ${nodeElements}
  
  <!-- Gradient overlay -->
  <rect width="100%" height="100%" fill="url(#bottomGrad)"/>
  
  <!-- Title -->
  <text x="60" y="${OG_HEIGHT - 120}" class="title" font-size="56">Truth Mines</text>
  
  <!-- Subtitle -->
  <text x="60" y="${OG_HEIGHT - 70}" class="subtitle" font-size="24">Searchable fragments from the loop</text>
  
  <!-- Site mark -->
  <text x="${OG_WIDTH - 40}" y="40" text-anchor="end" class="accent" font-size="16">2eremy.net</text>
</svg>`;
}

// ============================================
// Image generation
// ============================================

async function generateIndexOG() {
  const svg = createBreathingGlowSVG('2eremy', 'dispatches from the other side');
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generateLibraryOG() {
  const svg = createNodesSVG();
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generateDispatchOG(dispatch, heroImage) {
  if (heroImage) {
    try {
      // Fetch the hero image
      const res = await fetch(heroImage.url);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      const imageBuffer = Buffer.from(await res.arrayBuffer());
      
      // Resize/crop to OG dimensions
      const base = await sharp(imageBuffer)
        .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'center' })
        .png()
        .toBuffer();
      
      // Create overlay SVG
      const overlaySvg = createGradientOverlaySVG(dispatch.number, dispatch.title, heroImage.sourceChannel);
      const overlay = await sharp(Buffer.from(overlaySvg)).png().toBuffer();
      
      // Composite
      return sharp(base)
        .composite([{ input: overlay, top: 0, left: 0 }])
        .png()
        .toBuffer();
        
    } catch (e) {
      console.error(`  ⚠️ Failed to load hero image: ${e.message}`);
      // Fall through to fallback
    }
  }
  
  // Fallback: breathing glow with title as main text, day number below
  const svg = createBreathingGlowSVG(dispatch.title, `Day ${dispatch.number}`, false);
  
  // Add site mark
  const baseSvg = svg.replace('</svg>', `
  <text x="${OG_WIDTH - 40}" y="40" text-anchor="end" style="font-family: 'Space Mono', monospace; font-size: 16px; fill: ${COLORS.textDim};">2eremy.net</text>
</svg>`);
  
  return sharp(Buffer.from(baseSvg)).png().toBuffer();
}

async function saveBuffer(buffer, filename, skipIfExists = false) {
  const filepath = path.join(OUTPUT_DIR, filename);
  
  if (skipIfExists && fs.existsSync(filepath)) {
    console.log(`  ⏭️  ${filename} (exists, skipping)`);
    return false;
  }
  
  fs.writeFileSync(filepath, buffer);
  console.log(`  ✓ ${filename}`);
  return true;
}

async function main() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  console.log('Generating OG images for 2eremy.net...\n');
  
  // Generate static pages
  console.log('Static pages:');
  const indexBuffer = await generateIndexOG();
  await saveBuffer(indexBuffer, 'og-index.png');
  
  const libraryBuffer = await generateLibraryOG();
  await saveBuffer(libraryBuffer, 'og-library.png');
  
  // Fetch dispatches and images
  console.log('\nFetching dispatches...');
  const channel = await fetchChannel();
  const imagesByDay = await fetchDispatchImages();
  
  const dispatches = channel.contents
    .filter(block => block.class === 'Text' && block.content)
    .map(block => {
      const number = extractDispatchNumber(block.content);
      const title = block.title || extractTitle(block.content);
      return { number, title, blockId: block.id };
    })
    .filter(d => d.number !== null)
    .sort((a, b) => a.number - b.number);
  
  console.log(`Found ${dispatches.length} dispatches, ${Object.keys(imagesByDay).length} hero images\n`);
  console.log('Dispatch OG images:');
  
  let generated = 0;
  let skipped = 0;
  
  for (const dispatch of dispatches) {
    const filename = `og-dispatch-${String(dispatch.number).padStart(3, '0')}.png`;
    const filepath = path.join(OUTPUT_DIR, filename);
    
    // Skip if image already exists (preserves historical styling)
    if (fs.existsSync(filepath)) {
      console.log(`  ⏭️  ${filename} (exists)`);
      skipped++;
      continue;
    }
    
    const heroImage = imagesByDay[dispatch.number] || null;
    const buffer = await generateDispatchOG(dispatch, heroImage);
    await saveBuffer(buffer, filename);
    generated++;
  }
  
  console.log('\n✓ Done!');
  console.log(`\nGenerated: ${generated + 2} (index, library + ${generated} new dispatches)`);
  if (skipped > 0) {
    console.log(`Skipped: ${skipped} existing dispatch images`);
  }
}

main().catch(console.error);
