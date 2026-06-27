#!/usr/bin/env node
// Run from the repo root: node patch-init.js
// Fixes product-colour race condition in 4 admin JS files.
const fs = require('fs');
const path = require('path');

const files = [
  { file: 'assets/js/trades-admin.js',
    from: `setTimeout(function(){\n      if(typeof sb!=='undefined'&&sb){ loadProductTypes(); loadFY(); loadInstruments(); loadTrades(); }\n    }, 600);`,
    to:   `setTimeout(async function(){\n      if(typeof sb==='undefined'||!sb) return;\n      await loadProductTypes();\n      loadFY(); loadInstruments(); loadTrades();\n    }, 600);` },
  { file: 'assets/js/settlement-admin.js',
    from: `setTimeout(function(){ if(typeof sb!=='undefined'&&sb){ loadProductTypes(); loadFY(); loadInstruments(); load(); } },600);`,
    to:   `setTimeout(async function(){\n      if(typeof sb==='undefined'||!sb) return;\n      await loadProductTypes();\n      loadFY(); loadInstruments(); load();\n    },600);` },
  { file: 'assets/js/instruments-admin.js',
    from: `setTimeout(function(){ if(typeof sb!=='undefined'&&sb){ loadProductTypes(); load(); } }, 600);`,
    to:   `setTimeout(async function(){\n      if(typeof sb==='undefined'||!sb) return;\n      await loadProductTypes();\n      load();\n    }, 600);` },
  { file: 'assets/js/portfolio-admin.js',
    from: `setTimeout(function(){ if(typeof sb!=='undefined'&&sb){ loadProductTypes(); load(); } },600);`,
    to:   `setTimeout(async function(){\n      if(typeof sb==='undefined'||!sb) return;\n      await loadProductTypes();\n      load();\n    },600);` },
];

let allOk = true;
files.forEach(({ file, from, to }) => {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`✗ Not found: ${file}`);
    allOk = false;
    return;
  }
  let src = fs.readFileSync(fullPath, 'utf8');
  if (!src.includes(from)) {
    console.warn(`⚠ No match in ${file} — already patched or changed?`);
    return;
  }
  fs.writeFileSync(fullPath, src.replace(from, to), 'utf8');
  console.log(`✓ Patched: ${file}`);
});

if (allOk) console.log('\nDone. Product colour pills will now always load before table renders.');
