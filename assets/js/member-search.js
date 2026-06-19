/* ============================================================
   ZY-Invest · Member portal search (command palette)
   Self-contained: injects its own styles + popup, wires the
   top-bar ⌕ button and Ctrl/Cmd-K. Add with:
   <script src="assets/js/member-search.js"></script>
   ============================================================ */
(function(){
  if (window.__zySearchLoaded) return; window.__zySearchLoaded = true;

  // ---- destination index ----
  var IDX = [
    { t:'Account Summary',        s:'Your portfolio snapshot & value',     g:'Account', h:'dashboard.html' },
    { t:'Subscribe — Add Funds',  s:'Top up your investment',              g:'Action',  h:'dashboard.html', act:'subscribe' },
    { t:'Redeem — Withdraw',      s:'Withdraw from your account',          g:'Action',  h:'dashboard.html', act:'redeem' },
    { t:'Holdings',               s:'Your units & allocation',             g:'Account', h:'holdings.html' },
    { t:'Principal Transactions', s:'Subscriptions & redemptions',         g:'Account', h:'transactions.html' },
    { t:'Distributions',          s:'Dividend & distribution history',     g:'Account', h:'distributions.html' },
    { t:'Statements',             s:'Account statements & documents',      g:'Records', h:'documents.html' },
    { t:'Profile',                s:'Personal & account details',          g:'Account', h:'profile.html' },
    { t:'Password & Security',    s:'Sign-in & 2FA',                       g:'Account', h:'profile.html#security' },
    { t:'Nominee',                s:'Beneficiary nomination',              g:'Account', h:'profile.html#nominee' },
    { t:'Fund Overview',          s:'Mandate, objective & key facts',      g:'Fund',    h:'fund-overview.html' },
    { t:'Factsheet',              s:'Holdings allocation by year',         g:'Fund',    h:'factsheet.html' },
    { t:'Shareholder List',       s:'Unitholders & ownership',             g:'Fund',    h:'shareholder-list.html' },
    { t:'Financial Result',       s:'Income, balance sheet, cash flow',    g:'Performance', h:'financial-result.html' },
    { t:'Performance Analysis',   s:'Returns vs FBM KLCI',                 g:'Performance', h:'performance-analysis.html' },
    { t:'NTA History',            s:'Daily NTA / NAV chart',               g:'Performance', h:'nta-history.html' },
    { t:'Statement Download',     s:'Factsheets & annual reports',         g:'Documents',   h:'statement-download.html' }
  ];

  // ---- styles ----
  var css = document.createElement('style');
  css.textContent = ''
    + '.zys-scrim{position:fixed;inset:0;background:rgba(15,23,42,.4);z-index:300;opacity:0;visibility:hidden;transition:.16s;}'
    + '.zys-scrim.open{opacity:1;visibility:visible;}'
    + '.zys-box{position:fixed;top:84px;left:50%;transform:translateX(-50%) translateY(-8px);width:560px;max-width:92vw;background:#fff;'
    + 'border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);z-index:301;opacity:0;visibility:hidden;transition:.16s;overflow:hidden;}'
    + '.zys-box.open{opacity:1;visibility:visible;transform:translateX(-50%) translateY(0);}'
    + '.zys-in{display:flex;align-items:center;gap:11px;padding:14px 18px;border-bottom:1px solid var(--border);}'
    + '.zys-in .ic{color:var(--fg-3);font-size:1.05rem;}'
    + '.zys-in input{flex:1;border:none;outline:none;font:inherit;font-size:1rem;color:var(--fg-1);background:transparent;}'
    + '.zys-in kbd{font-family:var(--font-mono);font-size:0.7rem;color:var(--fg-3);background:var(--gray-100);border:1px solid var(--border);border-radius:5px;padding:2px 6px;}'
    + '.zys-list{max-height:50vh;overflow-y:auto;padding:6px;}'
    + '.zys-grp{font-size:0.66rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--fg-3);padding:10px 12px 5px;}'
    + '.zys-item{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:var(--radius-md);cursor:pointer;text-decoration:none;}'
    + '.zys-item:hover,.zys-item.on{background:var(--blue-bg);}'
    + '.zys-item .zi-ic{width:30px;height:30px;flex:none;border-radius:8px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;color:var(--blue);}'
    + '.zys-item.on .zi-ic{background:#fff;}'
    + '.zys-item .zi-t{font-size:0.9rem;font-weight:600;color:var(--fg-1);line-height:1.2;}'
    + '.zys-item .zi-s{font-size:0.76rem;color:var(--fg-3);}'
    + '.zys-item .zi-arr{margin-left:auto;color:var(--fg-3);font-size:0.85rem;}'
    + '.zys-empty{padding:26px;text-align:center;color:var(--fg-3);font-size:0.88rem;}'
    + '.zys-foot{display:flex;gap:16px;padding:9px 16px;border-top:1px solid var(--border);background:var(--gray-50);font-size:0.72rem;color:var(--fg-3);}'
    + '.zys-foot kbd{font-family:var(--font-mono);background:#fff;border:1px solid var(--border);border-radius:4px;padding:1px 5px;}';
  document.head.appendChild(css);

  // ---- DOM ----
  var scrim = document.createElement('div'); scrim.className = 'zys-scrim';
  var box = document.createElement('div'); box.className = 'zys-box'; box.setAttribute('role','dialog');
  box.innerHTML = ''
    + '<div class="zys-in"><span class="ic">⌕</span><input type="text" id="zysInput" placeholder="Search the portal — pages, statements, actions…" autocomplete="off"><kbd>Esc</kbd></div>'
    + '<div class="zys-list" id="zysList"></div>'
    + '<div class="zys-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>Esc</kbd> close</span></div>';
  document.body.appendChild(scrim); document.body.appendChild(box);

  var input = box.querySelector('#zysInput'), list = box.querySelector('#zysList');
  var sel = 0, results = [];

  function glyph(g){ return {Account:'◴',Action:'＋',Records:'▤',Fund:'◆',Performance:'▲',Documents:'▤'}[g] || '›'; }

  function render(){
    var q = input.value.trim().toLowerCase();
    results = IDX.filter(function(d){ return !q || (d.t+' '+d.s+' '+d.g).toLowerCase().indexOf(q) > -1; });
    sel = 0;
    if (!results.length){ list.innerHTML = '<div class="zys-empty">No matches for “'+input.value+'”.</div>'; return; }
    var groups = {}, order = [];
    results.forEach(function(d){ if(!groups[d.g]){ groups[d.g]=[]; order.push(d.g); } groups[d.g].push(d); });
    var html = '', gi = 0;
    order.forEach(function(g){
      html += '<div class="zys-grp">'+g+'</div>';
      groups[g].forEach(function(d){
        var i = results.indexOf(d);
        html += '<a class="zys-item'+(i===0?' on':'')+'" data-i="'+i+'" href="'+d.h+'">'
          + '<span class="zi-ic">'+glyph(d.g)+'</span>'
          + '<span><span class="zi-t">'+d.t+'</span><br><span class="zi-s">'+d.s+'</span></span>'
          + '<span class="zi-arr">↵</span></a>';
      });
    });
    list.innerHTML = html;
    list.querySelectorAll('.zys-item').forEach(function(el){
      el.addEventListener('mousemove', function(){ setSel(+el.dataset.i); });
      el.addEventListener('click', function(e){ e.preventDefault(); go(results[+el.dataset.i]); });
    });
  }
  function setSel(i){ sel=i; list.querySelectorAll('.zys-item').forEach(function(el){ el.classList.toggle('on', +el.dataset.i===i); }); }
  function go(d){
    if(!d) return;
    close();
    var here = location.pathname.split('/').pop();
    if(d.act && here === d.h){ // same page action (subscribe/redeem)
      var b = document.getElementById(d.act==='subscribe'?'btnSubscribe':'btnRedeem'); if(b){ b.click(); return; }
    }
    if(d.act){ try{ sessionStorage.setItem('zy_open_action', d.act); }catch(e){} }
    location.href = d.h;
  }
  function open(){ scrim.classList.add('open'); box.classList.add('open'); input.value=''; render(); setTimeout(function(){ input.focus(); }, 30); }
  function close(){ scrim.classList.remove('open'); box.classList.remove('open'); }

  input.addEventListener('input', render);
  input.addEventListener('keydown', function(e){
    if(e.key==='ArrowDown'){ e.preventDefault(); setSel(Math.min(sel+1, results.length-1)); ensure(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); setSel(Math.max(sel-1, 0)); ensure(); }
    else if(e.key==='Enter'){ e.preventDefault(); go(results[sel]); }
    else if(e.key==='Escape'){ close(); }
  });
  function ensure(){ var el=list.querySelector('.zys-item.on'); if(el) el.scrollIntoViewIfNeeded ? el.scrollIntoViewIfNeeded() : el.scrollIntoView({block:'nearest'}); }
  scrim.addEventListener('click', close);

  // wire the top-bar search button(s)
  document.querySelectorAll('.icon-btn[title="Search"]').forEach(function(b){ b.addEventListener('click', open); });
  document.addEventListener('keydown', function(e){
    if((e.metaKey||e.ctrlKey) && (e.key==='k'||e.key==='K')){ e.preventDefault(); open(); }
  });

  // if a deferred action was requested from another page, run it on load
  try{
    var pending = sessionStorage.getItem('zy_open_action');
    if(pending){ sessionStorage.removeItem('zy_open_action');
      window.addEventListener('load', function(){ var b=document.getElementById(pending==='subscribe'?'btnSubscribe':'btnRedeem'); if(b) setTimeout(function(){ b.click(); }, 350); });
    }
  }catch(e){}
})();
