// Run: node scripts/generate-icons.js  (or: npm run generate-icons)
// Requires: npm install --save-dev sharp

const path = require('path');
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp not installed. Run: npm install --save-dev sharp');
  process.exit(1);
}

// Two overlapping playing cards – outline/stroke style matching the logo
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <!-- Dark mono background -->
  <rect width="512" height="512" rx="88" fill="#111111"/>

  <!-- Back card: slightly right, rotated clockwise -->
  <g transform="translate(292,250) rotate(13)">
    <rect x="-97" y="-133" width="194" height="266" rx="16"
          fill="white" stroke="#111111" stroke-width="11"/>
    <!-- Spade symbol (filled) -->
    <g transform="translate(0,12) scale(0.58)">
      <path fill="#111111"
            d="M0-95 C52-95 92-45 92 8 C92 50 62 68 26 58
               C32 72 36 86 50 95 L-50 95
               C-36 86-32 72-26 58
               C-62 68-92 50-92 8
               C-92-45-52-95 0-95 Z"/>
    </g>
    <!-- A corner top-left -->
    <text x="-78" y="-86" font-family="Georgia,serif" font-size="40" font-weight="bold" fill="#111111">A</text>
    <!-- A corner bottom-right -->
    <g transform="rotate(180)">
      <text x="-78" y="-86" font-family="Georgia,serif" font-size="40" font-weight="bold" fill="#111111">A</text>
    </g>
  </g>

  <!-- Front card: slightly left, rotated counter-clockwise (Ace of Hearts) -->
  <g transform="translate(212,262) rotate(-9)">
    <rect x="-97" y="-133" width="194" height="266" rx="16"
          fill="white" stroke="#111111" stroke-width="11"/>
    <!-- Heart symbol (outline only, matching reference style) -->
    <path d="M0 52 C-5 44-68 8-68-26 C-68-65-42-83 0-54 C42-83 68-65 68-26 C68 8 5 44 0 52 Z"
          fill="none" stroke="#111111" stroke-width="12" stroke-linejoin="round"/>
    <!-- A corner top-left -->
    <text x="-78" y="-86" font-family="Georgia,serif" font-size="40" font-weight="bold" fill="#111111">A</text>
    <!-- A corner bottom-right -->
    <g transform="rotate(180)">
      <text x="-78" y="-86" font-family="Georgia,serif" font-size="40" font-weight="bold" fill="#111111">A</text>
    </g>
  </g>
</svg>`;

async function main() {
  const svg = Buffer.from(svgIcon);
  const outDir = path.join(__dirname, '..', 'public');

  await sharp(svg).resize(512, 512).png().toFile(path.join(outDir, 'icon-512.png'));
  console.log('Generated icon-512.png');

  await sharp(svg).resize(192, 192).png().toFile(path.join(outDir, 'icon-192.png'));
  console.log('Generated icon-192.png');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
