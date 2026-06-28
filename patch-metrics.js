#!/usr/bin/env node
// node patch-metrics.js  (run from repo root)

const fs = require('fs'), path = require('path');
const BASE = path.join(__dirname, '..', 'assets', 'js');

const patches = [
  {
    file: 'instruments-admin.js',
    changes: [
      // Metric boxes count `list` (filtered) not `ALL`
      [
        "    document.getElementById('inCount').textContent=ALL.length;",
        "    document.getElementById('inCount').textContent=list.length;"
      ],
      [
        "    document.getElementById('inSec').textContent=ALL.filter(function(x){return x.product==='Securities';}).length;",
        "    document.getElementById('inSec').textContent=list.filter(function(x){return x.product==='Securities';}).length;"
      ],
      [
        "    document.getElementById('inAlt').textContent=ALL.filter(function(x){\n      return ['Private Equity','Collectibles','Derivatives'].indexOf(x.product)>-1;\n    }).length;",
        "    document.getElementById('inAlt').textContent=list.filter(function(x){\n      return ['Private Equity','Collectibles','Derivatives'].indexOf(x.product)>-1;\n    }).length;"
      ],
      [
        "    document.getElementById('inCash').textContent=ALL.filter(function(x){\n      return ['Cash Funds','Cash on Hand'].indexOf(x.product)>-1;\n    }).length;",
        "    document.getElementById('inCash').textContent=list.filter(function(x){\n      return ['Cash Funds','Cash on Hand'].indexOf(x.product)>-1;\n    }).length;"
      ],
    ]
  },
  {
    file: 'settlement-admin.js',
    changes: [
      // updateMetrics: use filtered rows (respects both FY and search)
      [
        "  function updateMetrics(){\n    var fyRows=ALL.filter(inFY);",
        "  function updateMetrics(){\n    var fyRows=ALL.filter(function(r){\n      if(stlFY&&!inFY(r)) return false;\n      if(stlQ&&(r.instrument_name||'').toLowerCase().indexOf(stlQ)===-1) return false;\n      return true;\n    });"
      ],
      // search listener: add updateMetrics()
      [
        "document.getElementById('stl-search').addEventListener('input',function(){ stlQ=this.value.toLowerCase(); renderTable(); });",
        "document.getElementById('stl-search').addEventListener('input',function(){ stlQ=this.value.toLowerCase(); renderTable(); updateMetrics(); });"
      ],
    ]
  },
  {
    file: 'others-admin.js',
    changes: [
      // updateMetrics: use filtered() which already respects both FY + search
      [
        "  function updateMetrics(){\n    var fyRows=ALL.filter(inFY);",
        "  function updateMetrics(){\n    var fyRows=filtered();"
      ],
      // search listener: add updateMetrics()
      [
        "document.getElementById('ot-search').addEventListener('input',function(){ otQ=this.value.toLowerCase(); renderTable(); });",
        "document.getElementById('ot-search').addEventListener('input',function(){ otQ=this.value.toLowerCase(); renderTable(); updateMetrics(); });"
      ],
    ]
  },
  {
    file: 'trades-admin.js',
    changes: [
      // search listener: add updateMetrics() if missing (may already be there)
      [
        "document.getElementById('tt-search').addEventListener('input', function(){ ttQ=this.value.toLowerCase(); renderTable(); });",
        "document.getElementById('tt-search').addEventListener('input', function(){ ttQ=this.value.toLowerCase(); renderTable(); updateMetrics(); });"
      ],
    ]
  },
];

let patched = 0, skipped = 0;
for (const {file, changes} of patches) {
  const fp = path.join(BASE, file);
  if (!fs.existsSync(fp)) { console.log('SKIP (not found): ' + file); continue; }
  let src = fs.readFileSync(fp, 'utf8');
  let changed = false;
  for (const [from, to] of changes) {
    if (!src.includes(from)) {
      console.log('  SKIP (not found or already patched): ' + from.replace(/\n/g,' ').slice(0,80));
      skipped++;
    } else {
      src = src.replace(from, to);
      console.log('  OK: ' + from.replace(/\n/g,' ').slice(0,80));
      patched++; changed = true;
    }
  }
  if (changed) { fs.writeFileSync(fp, src); console.log('Saved: ' + file); }
  console.log('');
}
console.log('Done — ' + patched + ' patched, ' + skipped + ' skipped.');
