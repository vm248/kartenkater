// Run: node scripts/generate-icons.js
// Requires: npm install --save-dev sharp

const path = require('path');
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp not installed. Run: npm install --save-dev sharp');
  process.exit(1);
}

const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <filter id="shadow">
      <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <!-- Dark mono background -->
  <rect width="512" height="512" rx="88" fill="#111111"/>

  <!-- White playing card, slightly rotated -->
  <g transform="translate(256,256) rotate(-6)" filter="url(#shadow)">
    <rect x="-130" y="-178" width="260" height="356" rx="20" fill="#FFFFFF"/>

    <!-- Spade symbol (SVG path, no font dependency) -->
    <g transform="translate(0,18) scale(0.84)">
      <path fill="#111111" d="
        M 0 -100
        C 55 -100 100 -50 100 10
        C 100 55 70 75 30 65
        C 35 80 40 95 55 105
        L -55 105
        C -40 95 -35 80 -30 65
        C -70 75 -100 55 -100 10
        C -100 -50 -55 -100 0 -100
        Z
      "/>
    </g>

    <!-- Top-left corner: K -->
    <text
      x="-105" y="-118"
      font-family="Georgia, Times New Roman, serif"
      font-size="46"
      font-weight="bold"
      fill="#111111"
    >K</text>

    <!-- Bottom-right corner: K (rotated 180°) -->
    <g transform="rotate(180)">
      <text
        x="-105" y="-118"
        font-family="Georgia, Times New Roman, serif"
        font-size="46"
        font-weight="bold"
        fill="#111111"
      >K</text>
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
