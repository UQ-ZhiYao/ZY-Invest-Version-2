/* ============================================================
   ZY-Invest · Member portal notifications
   Self-contained: injects styles + panel, wires the top-bar
   🔔 button. Add with:
   <script src="assets/js/member-notifications.js"></script>
   ============================================================ */
(function(){
  if (window.__zyNotifLoaded) return; window.__zyNotifLoaded = true;

  // ---- seed notifications (newest first) ----
  var SEED = [
    { id:'n7', type:'dist',   icon:'💰', title:'Distribution paid', body:'FY25 Final dividend of RM 752.20 credited to Maybank ····2048.', time:'2h ago', unread:true,  href:'distributions.html' },
    { id:'n6', type:'nta',    icon:'📈', title:'Daily NTA updated', body:'NTA per unit is RM 1.0245 (+0.42% today).', time:'5h ago', unread:true,  href:'nta-history.html' },
    { id:'n5', type:'doc',    icon:'📄', title:'New statement ready', body:'Your March 2026 account statement is available to download.', time:'1d ago', unread:true,  href:'documents.html' },
    { id:'n4', type:'sub',    icon:'✓',  title:'Subscription confirmed', body:'RM 25,000.00 subscription processed at NTA 1.0245 — 24,402.15 units issued.', time:'3d ago', unread:false, href:'transactions.html' },
    { id:'n3', type:'fund',   icon:'📊', title:'Monthly factsheet published', body:'The February 2026 fund factsheet is now available.', time:'5d ago', unread:false, href:'factsheet.html' },
    { id:'n2', type:'security',icon:'🔒', title:'New sign-in', body:'Your account was accessed from Kuala Lumpur, Malaysia.', time:'1w ago', unread:false, href:'profile.html#security' },
    { id:'n1', type:'doc',    icon:'📄', title:'Tax voucher YA2025', body:'Your tax voucher for e-filing is ready.', time:'2w ago', unread:false, href:'documents.html' }
  ];

  // load read-state overrides from localStorage
  var READ = {};
  try { READ = JSON.parse(localStorage.getItem('zy_notif_read') || '{}'); } catch(e){}
  SEED.forEach(function(n){ if (READ[n.id]) n.unread = false; });
  function persist(){ try { localStorage.setItem('zy_notif_read', JSON.stringify(READ)); } catch(e){} }

  // ---- styles ----
  var css = document.createElement('style');
  css.textContent = ''
    + '.zyn-scrim{position:fixed;inset:0;z-index:290;display:none;}'
    + '.zyn-scrim.open{display:block;}'
    + '.zyn-pop{position:fixed;top:60px;width:380px;max-width:94vw;background:#fff;border:1px solid var(--border);'
    + 'border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);z-index:291;overflow:hidden;opacity:0;visibility:hidden;transform:translateY(-6px);transition:.16s;}'
    + '.zyn-pop.open{opacity:1;visibility:visible;transform:translateY(0);}'
    + '.zyn-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border);}'
    + '.zyn-head h4{margin:0;font-size:0.96rem;font-weight:600;color:var(--fg-1);display:flex;align-items:center;gap:8px;}'
    + '.zyn-count{font-size:0.68rem;font-weight:700;color:#fff;background:var(--blue);border-radius:999px;padding:1px 7px;}'
    + '.zyn-mark{font:inherit;font-size:0.78rem;font-weight:600;color:var(--blue);background:none;border:none;cursor:pointer;}'
    + '.zyn-mark:disabled{color:var(--fg-3);cursor:default;}'
    + '.zyn-list{max-height:62vh;overflow-y:auto;}'
    + '.zyn-item{display:flex;gap:11px;padding:13px 16px;border-bottom:1px solid var(--gray-100);text-decoration:none;cursor:pointer;position:relative;transition:background .15s;}'
    + '.zyn-item:hover{background:var(--gray-50);}'
    + '.zyn-item.unread{background:var(--blue-bg);}'
    + '.zyn-item.unread:hover{background:#e3effb;}'
    + '.zyn-ic{width:36px;height:36px;flex:none;border-radius:9px;background:#fff;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:1rem;}'
    + '.zyn-tx{flex:1;min-width:0;}'
    + '.zyn-tt{font-size:0.86rem;font-weight:600;color:var(--fg-1);line-height:1.25;}'
    + '.zyn-bd{font-size:0.78rem;color:var(--fg-2);line-height:1.4;margin-top:2px;}'
    + '.zyn-tm{font-size:0.72rem;color:var(--fg-3);margin-top:4px;}'
    + '.zyn-dot{width:8px;height:8px;border-radius:50%;background:var(--blue);flex:none;margin-top:6px;}'
    + '.zyn-item:not(.unread) .zyn-dot{visibility:hidden;}'
    + '.zyn-empty{padding:40px 20px;text-align:center;color:var(--fg-3);font-size:0.88rem;}'
    + '.zyn-foot{padding:11px 16px;text-align:center;border-top:1px solid var(--border);background:var(--gray-50);}'
    + '.zyn-foot a{font-size:0.82rem;font-weight:600;color:var(--blue);text-decoration:none;}'
    + '.icon-btn .badge-dot{display:none;}'                       /* hide static dot; we manage our own */
    + '.icon-btn .zyn-badge{position:absolute;top:3px;right:3px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--red);'
    + 'color:#fff;font-size:0.62rem;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1;}'
    + '.icon-btn{position:relative;}';
  document.head.appendChild(css);

  // ---- DOM ----
  var scrim = document.createElement('div'); scrim.className = 'zyn-scrim';
  var pop = document.createElement('div'); pop.className = 'zyn-pop'; pop.setAttribute('role','dialog');
  pop.innerHTML = ''
    + '<div class="zyn-head"><h4>Notifications <span class="zyn-count" id="zynCount">0</span></h4>'
    + '<button class="zyn-mark" id="zynMark">Mark all read</button></div>'
    + '<div class="zyn-list" id="zynList"></div>'
    + '<div class="zyn-foot"><a href="#" id="zynAll">View all activity</a></div>';
  document.body.appendChild(scrim); document.body.appendChild(pop);

  var listEl = pop.querySelector('#zynList'), countEl = pop.querySelector('#zynCount'), markBtn = pop.querySelector('#zynMark');
  var btn = document.querySelector('.icon-btn[title="Notifications"]');

  function unreadCount(){ return SEED.filter(function(n){ return n.unread; }).length; }

  function syncBadge(){
    if (!btn) return;
    var c = unreadCount(), b = btn.querySelector('.zyn-badge');
    if (c > 0){ if(!b){ b=document.createElement('span'); b.className='zyn-badge'; btn.appendChild(b); } b.textContent = c>9?'9+':c; }
    else if (b){ b.remove(); }
    countEl.textContent = c; markBtn.disabled = c === 0;
  }

  function render(){
    if (!SEED.length){ listEl.innerHTML = '<div class="zyn-empty">You\u2019re all caught up.</div>'; syncBadge(); return; }
    listEl.innerHTML = SEED.map(function(n){
      return '<a class="zyn-item'+(n.unread?' unread':'')+'" href="'+n.href+'" data-id="'+n.id+'">'
        + '<span class="zyn-ic">'+n.icon+'</span>'
        + '<span class="zyn-tx"><span class="zyn-tt">'+n.title+'</span><span class="zyn-bd">'+n.body+'</span><span class="zyn-tm">'+n.time+'</span></span>'
        + '<span class="zyn-dot"></span></a>';
    }).join('');
    listEl.querySelectorAll('.zyn-item').forEach(function(el){
      el.addEventListener('click', function(){
        var n = SEED.filter(function(x){ return x.id===el.dataset.id; })[0];
        if (n){ n.unread=false; READ[n.id]=1; persist(); }
        // allow navigation to proceed
      });
    });
    syncBadge();
  }

  function open(){ render(); positionPop(); scrim.classList.add('open'); pop.classList.add('open'); }
  function close(){ scrim.classList.remove('open'); pop.classList.remove('open'); }
  function positionPop(){
    if (!btn){ pop.style.right='16px'; return; }
    var r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom + 10) + 'px';
    var right = window.innerWidth - r.right;
    pop.style.right = Math.max(12, right) + 'px';
    pop.style.left = 'auto';
  }

  if (btn){ btn.addEventListener('click', function(e){ e.stopPropagation(); pop.classList.contains('open') ? close() : open(); }); }
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') close(); });
  window.addEventListener('resize', function(){ if(pop.classList.contains('open')) positionPop(); });

  markBtn.addEventListener('click', function(){ SEED.forEach(function(n){ n.unread=false; READ[n.id]=1; }); persist(); render(); });
  pop.querySelector('#zynAll').addEventListener('click', function(e){ e.preventDefault(); close(); location.href='documents.html'; });

  syncBadge();
})();
