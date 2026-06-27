#!/usr/bin/env node
// Run from repo root: node patch-financial-result.js
// Replaces the hardcoded income statement in members/financial-result.html
// with a live-computed table driven by financial-result.js

const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'members', 'financial-result.html');
if(!fs.existsSync(FILE)){ console.error('✗ Not found:', FILE); process.exit(1); }

let src = fs.readFileSync(FILE, 'utf8');

// ── 1. Replace the entire hardcoded income statement section ──────────────────
// Find from the income psec-head to the balance sheet psec-head (exclusive)
const INCOME_START = '<div class="psec-head psec" id="income">';
const INCOME_END   = '<div class="psec-head psec" id="bs">';

const iStart = src.indexOf(INCOME_START);
const iEnd   = src.indexOf(INCOME_END);

if(iStart === -1 || iEnd === -1){
  console.error('✗ Could not locate income statement section in HTML. Already patched?');
  process.exit(1);
}

const NEW_INCOME = `<div class="psec-head psec" id="income"><div><span class="pe">Statement 1</span><h2 class="pt">Income Statement</h2><p class="ps">Statement of comprehensive income for the financial year (RM).</p></div></div>
      <div class="panel" style="overflow-x:auto;">
        <table class="tbl" style="table-layout:auto;min-width:640px;">
          <thead id="isThead">
            <tr><th>ITEM (RM)</th><th class="td-right">Loading…</th></tr>
          </thead>
          <tbody id="isBody">
            <tr><td colspan="6" style="padding:24px;color:var(--fg-3);">Loading financial data…</td></tr>
          </tbody>
        </table>
        <p id="isNote" style="font-size:0.74rem;color:var(--fg-3);padding:10px 18px 14px;margin:0;border-top:1px solid var(--border);"></p>
      </div>
      `;

src = src.slice(0, iStart) + NEW_INCOME + src.slice(iEnd);
console.log('✓ Replaced income statement section');

// ── 2. Add <script> tag for financial-result.js before </body> ────────────────
const SCRIPT_TAG = '<script src="../assets/js/financial-result.js"></script>';

if(src.includes(SCRIPT_TAG)){
  console.log('  (financial-result.js already linked — skipping)');
} else {
  src = src.replace('</body>', SCRIPT_TAG + '\n</body>');
  console.log('✓ Added financial-result.js script tag');
}

fs.writeFileSync(FILE, src, 'utf8');
console.log('\nDone. Open members/financial-result.html to verify.');
