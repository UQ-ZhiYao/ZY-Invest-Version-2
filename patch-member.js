#!/usr/bin/env node
// node patch-member.js  (run from repo root)
const fs = require('fs'), path = require('path');

const patches = [
  {
    file: 'members/dashboard.html',
    // Add member-account.js before closing body, after capital-injection-member.js
    from: '<script src="../assets/js/capital-injection-member.js"></script>\n</body>',
    to:   '<script src="../assets/js/capital-injection-member.js"></script>\n<script src="../assets/js/member-account.js"></script>\n</body>',
  },
  {
    file: 'members/holdings.html',
    // Add after supabase and auth scripts
    from: '</body>\n</html>',
    to:   '<script src="../assets/js/member-account.js"></script>\n</body>\n</html>',
    onlyIfMissing: 'member-account.js',
  },
  {
    file: 'members/transactions.html',
    // Replace the inline script block with the new JS file
    from: '</body>\n</html>',
    to:   '<script src="../assets/js/member-transactions.js"></script>\n</body>\n</html>',
    onlyIfMissing: 'member-transactions.js',
  },
];

for (const p of patches) {
  const fp = path.join(__dirname, p.file);
  if (!fs.existsSync(fp)) { console.log('SKIP (not found): ' + p.file); continue; }
  let src = fs.readFileSync(fp, 'utf8');
  if (p.onlyIfMissing && src.includes(p.onlyIfMissing)) {
    console.log('SKIP (already patched): ' + p.file); continue;
  }
  if (!src.includes(p.from)) {
    console.warn('WARN: pattern not found in ' + p.file);
    console.warn('  Looking for: ' + JSON.stringify(p.from.slice(0, 60)));
    continue;
  }
  src = src.replace(p.from, p.to);
  fs.writeFileSync(fp, src);
  console.log('OK: ' + p.file);
}
console.log('Done.');
