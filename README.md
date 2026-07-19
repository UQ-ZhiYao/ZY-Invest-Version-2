# ZY-Invest Admin Console

Static admin console for **ZY-Invest** (private investment fund, Malaysia). Plain HTML/CSS/JS — no build step. Deployable to GitHub Pages, Netlify, Vercel, or any static host.

## Structure

```
.
├── index.html               Login page (site entry point)
│
├── admin/                   Admin console (installable PWA)
│   ├── admin.html · overview.html
│   ├── portfolio.html · instruments.html · trades.html · settlement.html · dividend.html
│   ├── investors.html · principal.html · distributions.html · others.html · remuneration.html · compute-nta.html
│   ├── documents.html · fy-settings.html
│   ├── fund-overview.html · fund-view.html · shareholder-list.html
│   ├── reports/            Read-only fund reports embedded by fund-view.html via iframe
│   │   ├── factsheet.html · shareholder-list.html
│   │   └── financial-result.html · performance-analysis.html · nta-history.html · statement-download.html
│   └── manifest.webmanifest · sw.js
│
└── assets/                  Shared css / js / img (referenced as assets/, ../assets/, or ../../assets/ depending on depth)
```

## Deploy (GitHub Pages)
1. Push to a repo.
2. Settings → Pages → Source: `main`, `/ (root)`.
3. Serves at `https://<user>.github.io/<repo>/` (opens `index.html`, the login page). `.nojekyll` keeps asset folders intact.

## Flow
- Login at the site root (**index.html**) → `admin/admin.html` (demo: `admin@zy-invest.com` / `admin123`).
- The admin console's Fund pages (`admin/fund-view.html`) embed read-only reports from `admin/reports/` via iframe.
- Every admin page (and the login page's install prompt) links back to `index.html` on logout / when no valid admin session is found.

## Supabase
Set your project URL + anon key in `assets/js/supabase-auth.js` before going live (runs in safe demo mode until then).
