# ZY-Invest

Static website for **ZY-Invest** (private investment fund, Malaysia). Plain HTML/CSS/JS — no build step. Deployable to GitHub Pages, Netlify, Vercel, or any static host.

## Structure

```
.
├── index.html / about.html / team.html        Public marketing
├── login.html / register.html / verify.html   Auth (Supabase-ready)
│
├── members/                Member portal
│   ├── dashboard.html · holdings.html · transactions.html
│   ├── distributions.html · documents.html · profile.html
│   ├── fund-overview.html · factsheet.html · shareholder-list.html
│   └── financial-result.html · performance-analysis.html · nta-history.html · statement-download.html
│
├── admin/                  Admin console (installable PWA)
│   ├── admin-login.html · admin.html
│   └── manifest.webmanifest · sw.js
│
└── assets/                 Shared css / js / img (referenced as ../assets from subfolders)
```

## Deploy (GitHub Pages)
1. Push to a repo.
2. Settings → Pages → Source: `main`, `/ (root)`.
3. Serves at `https://<user>.github.io/<repo>/` (opens `index.html`). `.nojekyll` keeps asset folders intact.

## Flow
- Public **login.html** → on success goes to `members/dashboard.html`.
- Admin login at **admin/admin-login.html** → `admin/admin.html` (demo: `admin@zy-invest.com` / `admin123`). The admin console embeds the member Fund/Performance/Documents pages from `../members/`.

## Supabase
Set your project URL + anon key in `assets/js/supabase-auth.js` before going live (runs in safe demo mode until then). Add the deployed `verify.html` URL to Supabase → Authentication → Redirect URLs.
