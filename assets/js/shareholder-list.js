/* ============================================================
   ZY-Invest · Shareholder List
   Works in both member (members/shareholder-list.html)
   and admin (admin/shareholder-list.html) context.

   Data source: capital_injection table (approved rows only)
   - Units = net Subscription - Redemption per uid
   - Holding Since = date of first approved Subscription
   - Name & position from profiles table

   Privacy rules (member mode only):
   - Own row: always fully visible + "You" badge
   - Directors (role='admin'): name always visible + "Director" badge
   - All others: name masked as "****"
   ============================================================ */
(function(){
  // Detect admin mode: URL path contains /admin/ OR admin session exists in localStorage
  var IS_ADMIN = window.location.pathname.toLowerCase().indexOf('/admin/') > -1;
  var HAS_ADMIN_SESSION = (function(){
    try{ var s=JSON.parse(localStorage.getItem('zy_admin_session')||'null'); return !!(s&&s.role==='admin'); }catch(e){ return false; }
  })();
  var isAdminPage = IS_ADMIN || HAS_ADMIN_SESSION;

  function fmt(n,dp){ var d=dp===undefined?0:dp; return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:d,maximumFractionDigits:d}); }
  function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }
  function initials(n){ return (n||'?').split(' ').filter(Boolean).slice(0,2).map(function(w){return w[0];}).join('').toUpperCase(); }
  function pct(u,total){ return total>0?((u/total)*100).toFixed(2)+'%':'—'; }

  // ── wire nav/sidebar/avatar on DOMContentLoaded (runs immediately, no async wait) ──
  document.addEventListener('DOMContentLoaded', function(){
    if(isAdminPage) return;
    // fund nav dropdowns
    document.querySelectorAll('.nav-group').forEach(function(g){
      var btn=g.querySelector('.nav-top'); if(!btn) return;
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        g.classList.toggle('open');
        document.querySelectorAll('.nav-group').forEach(function(x){ if(x!==g) x.classList.remove('open'); });
      });
    });
    document.addEventListener('click',function(){ document.querySelectorAll('.nav-group').forEach(function(g){ g.classList.remove('open'); }); });
    // sidebar
    var shell=document.getElementById('shell'), scrim=document.getElementById('scrim'), sbToggle=document.getElementById('sbToggle');
    if(sbToggle){ sbToggle.addEventListener('click',function(){ var col=shell.classList.toggle('collapsed'); try{localStorage.setItem('zy-sb-collapsed',col?'1':'0');}catch(e){} }); }
    if(scrim){ scrim.addEventListener('click',function(){ shell.classList.remove('collapsed'); }); }
    // avatar dropdown — toggle .open on .nav-user-wrap (matches dashboard CSS)
    var userBtn=document.getElementById('userBtn');
    if(userBtn){
      userBtn.addEventListener('click',function(e){
        e.stopPropagation();
        var wrap=document.querySelector('.nav-user-wrap');
        if(wrap) wrap.classList.toggle('open');
      });
    }
    document.addEventListener('click',function(e){
      var wrap=document.querySelector('.nav-user-wrap');
      if(wrap&&!wrap.contains(e.target)) wrap.classList.remove('open');
    });
  });

  // ── load data ───────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', async function(){
    if(typeof sb==='undefined'||!sb) return;

    // get current user
    var sres=await sb.auth.getSession();
    if(!sres.data||!sres.data.session){
      if(!isAdminPage) window.location.href='../login.html';
      return;
    }
    var myUid=sres.data.session.user.id;
    var myEmail=sres.data.session.user.email||'';

    // populate nav user info (member pages)
    if(!isAdminPage){
      var pres=await sb.from('profiles').select('full_name,preferred_name').eq('id',myUid).single();
      var myName=myEmail;
      if(pres.data) myName=pres.data.preferred_name||pres.data.full_name||myEmail;
      var av=initials(myName);
      var nn=document.getElementById('navName'); if(nn) nn.textContent=myName;
      var nr=document.getElementById('navRole'); if(nr) nr.textContent=myEmail;
      var na=document.getElementById('navAvatar'); if(na) na.textContent=av;
      var ma=document.getElementById('menuAvatar'); if(ma) ma.textContent=av;
      var mn=document.getElementById('menuName'); if(mn) mn.textContent=myName;
      var me=document.getElementById('menuEmail'); if(me) me.textContent=myEmail;
    }

    // 1. Load all profiles to get names, roles, UIDs
    var profRes=await sb.from('profiles').select('id,full_name,role');
    if(profRes.error){ console.error(profRes.error); return; }
    var profiles={};
    (profRes.data||[]).forEach(function(p){ profiles[p.id]={name:p.full_name||'—',role:p.role||'member'}; });

    // 2. Load all approved capital_injection rows
    var ciRes=await sb.from('capital_injection')
      .select('uid,type,units,date')
      .eq('status','Approved')
      .order('date',{ascending:true});
    if(ciRes.error){ console.error(ciRes.error); return; }

    // 3. Aggregate per uid: net units + holding since (first subscription date)
    var holders={};
    (ciRes.data||[]).forEach(function(r){
      if(!r.uid) return;
      var u=parseFloat(r.units)||0;
      if(!holders[r.uid]){ holders[r.uid]={units:0, since:null}; }
      // units column already signed: Subscription = positive, Redemption = negative
      holders[r.uid].units += u;
      // holding since = first subscription date
      if(r.type==='Subscription'){
        if(!holders[r.uid].since||r.date<holders[r.uid].since) holders[r.uid].since=r.date;
      }
    });

    // 4. Build shareholder rows, filter out zero/negative
    // Build rows — include ALL holders with positive net units
    // (fully redeemed holders with units<=0 are excluded as they are no longer shareholders)
    var rows=[];
    Object.keys(holders).forEach(function(uid){
      var h=holders[uid];
      if(h.units<=0.0001) return; // skip fully redeemed
      var prof=profiles[uid]||{name:'*',role:'member'};
      rows.push({
        uid:uid,
        name:prof.name,
        role:prof.role,
        units:h.units,
        since:h.since,
        isMe:uid.trim()===myUid.trim(),
        isDir:prof.role==='admin'
      });
    });

    // 5. Sort by units descending
    rows.sort(function(a,b){ return b.units-a.units; });

    // 6. Compute totals
    var totalUnits=rows.reduce(function(s,r){return s+r.units;},0);
    var myRow=rows.filter(function(r){return r.isMe;})[0];
    var myUnits=myRow?myRow.units:0;
    var myRank=myRow?rows.indexOf(myRow)+1:null;
    var dirCount=rows.filter(function(r){return r.isDir;}).length;

    // 7. Update metrics
    var shCount=document.getElementById('shCount'); if(shCount) shCount.textContent=rows.length;
    var shTU=document.getElementById('shTotalUnits'); if(shTU) shTU.textContent=fmt(totalUnits);
    if(isAdminPage){
      var top=rows[0]||{};
      var shTopPct=document.getElementById('shTopPct'); if(shTopPct) shTopPct.textContent=pct(top.units,totalUnits);
      var shTopName=document.getElementById('shTopName'); if(shTopName) shTopName.textContent=top.name||'—';
      var shDC=document.getElementById('shDirCount'); if(shDC) shDC.textContent=dirCount;
    } else {
      var shMyU=document.getElementById('shMyUnits'); if(shMyU) shMyU.textContent=myRow?fmt(myUnits):'—';
      var shMyP=document.getElementById('shMyPct'); if(shMyP) shMyP.textContent=myRow?pct(myUnits,totalUnits)+' of fund':'Not a unitholder';
      var shMyR=document.getElementById('shMyRank'); if(shMyR) shMyR.textContent=myRank?'#'+myRank+' of '+rows.length:'—';
    }
    // NOTE: metric cards (shCount/shTotalUnits/shMyUnits/etc, computed above) are
    // intentionally LIVE-SNAPSHOT-ONLY — they always reflect current holdings and do
    // NOT change when an FY tab below is selected. Only the "Unitholders" table (and
    // its shListCount caption) becomes FY-aware. This keeps the fund-level headline
    // numbers stable/authoritative while still letting admins browse historical,
    // cumulative-to-FY-end shareholder snapshots in the table.

    // 8. Render table for a given row-set (current snapshot OR a selected FY bucket).
    //    Re-derives totals/bar-scaling from whatever rows are passed in, so ownership
    //    % and bar widths are always relative to the row-set actually on screen.
    function renderTable(tblRows){
      var tblTotalUnits=tblRows.reduce(function(s,r){return s+r.units;},0);

      var shLC=document.getElementById('shListCount'); if(shLC) shLC.textContent=tblRows.length+' unitholders';

      var maxOwnPct = tblRows.length > 0
        ? Math.max.apply(null, tblRows.map(function(r){ return tblTotalUnits>0?(r.units/tblTotalUnits*100):0; }))
        : 100;
      if(maxOwnPct <= 0) maxOwnPct = 100;

      var tbody=document.getElementById('shBody');
      if(!tblRows.length){
        tbody.innerHTML='<tr><td colspan="6" style="padding:24px;color:var(--fg-3);">No unitholders found for this period.</td></tr>';
        return;
      }
      tbody.innerHTML='';
      tblRows.forEach(function(r,i){
        var rank=i+1;
        var ownPct=tblTotalUnits>0?(r.units/tblTotalUnits*100):0;
        // bar scaled: max holder fills bar to 100%, others proportional
        var barWidth=maxOwnPct>0?Math.min(100,(ownPct/maxOwnPct*100)).toFixed(1):'0';

        // Privacy masking for member pages
        var displayName;
        if(isAdminPage){
          displayName=r.name;
        } else if(r.isMe){
          displayName=r.name+'<span class="you-badge">You</span>';
        } else if(r.isDir){
          displayName=r.name+'<span class="dir-badge">Director</span>';
        } else {
          displayName='<span class="masked-name">****</span>';
        }

        var position = r.isDir ? 'Director' : 'Shareholder';

        var avClass=(isAdminPage||r.isMe||r.isDir)?'sh-av':'sh-av hidden-av';
        var avContent=(!isAdminPage&&!r.isMe&&!r.isDir)?'?':initials(r.name);

        var tr=document.createElement('tr');
        if(r.isMe) tr.style.background='var(--blue-bg)';
        tr.innerHTML=
          '<td style="font-weight:600;color:var(--fg-3);width:40px;">'+rank+'</td>'+
          '<td><div style="display:flex;align-items:center;gap:10px;"><div class="'+avClass+'">'+avContent+'</div><span>'+displayName+'</span></div></td>'+
          '<td>'+position+'</td>'+
          '<td>'+fmtDate(r.since)+'</td>'+
          '<td class="r">'+fmt(r.units)+'</td>'+
          '<td class="r"><div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;"><div class="own-bar-wrap"><div class="own-bar" style="width:'+barWidth+'%"></div></div>'+ownPct.toFixed(2)+'%</div></td>';
        tbody.appendChild(tr);
      });
    }

    // Render the current (live) snapshot by default — same as pre-FY-tab behavior.
    renderTable(rows);

    // 9. FY tabs — cumulative-to-FY-end shareholder snapshots, sourced from
    //    mpLoadShareholdersByFy() (assets/js/member-api.js: joins fy_settings +
    //    capital_injection, one bucket per FY with units_held as of that FY's end).
    //    Re-uses the SAME renderTable()/masking/avatar logic above — just swaps the
    //    row source, so the metric cards and privacy rules are untouched.
    var fyBuckets=[]; // [{fy:'FY2025', rows:[...]}, ...] oldest → newest
    if(typeof mpLoadShareholdersByFy==='function'){
      try{
        var byFy=await mpLoadShareholdersByFy();
        fyBuckets=(byFy||[]).map(function(b){
          var fyRows=(b.list||[]).map(function(s){
            var uid=s.investor_id;
            var prof=(uid&&profiles[uid])||{name:s.full_name||'—',role:'member'};
            return {
              uid:uid,
              name:prof.name||s.full_name||'—',
              role:prof.role,
              units:parseFloat(s.units_held)||0,
              since:s.joined_date,
              isMe:!!(uid&&myUid&&uid.trim()===myUid.trim()),
              isDir:prof.role==='admin'
            };
          }).filter(function(r){ return r.units>0.0001; }); // fully-redeemed by FY end
          fyRows.sort(function(a,b){ return b.units-a.units; });
          return {fy:b.fy, rows:fyRows};
        });
      }catch(e){
        console.error('Shareholders by FY load failed (FY tabs disabled, "Current" still works):', e);
      }
    }

    // 10. Build the FY tab bar (static "Current" button already in the HTML) and
    //     wire click-to-switch. Fails soft: if fyBuckets is empty (query error, no
    //     fy_settings rows, or member-api.js not loaded) only "Current" is shown.
    var fyTabsEl=document.getElementById('shFyTabs');
    if(fyTabsEl && fyBuckets.length){
      fyBuckets.forEach(function(b){
        var btn=document.createElement('button');
        btn.type='button';
        btn.textContent=b.fy;
        btn.setAttribute('data-fy',b.fy);
        fyTabsEl.appendChild(btn);
      });
    }
    if(fyTabsEl){
      fyTabsEl.addEventListener('click',function(e){
        var btn=e.target;
        while(btn&&btn!==fyTabsEl&&btn.tagName!=='BUTTON') btn=btn.parentNode;
        if(!btn||btn===fyTabsEl) return;
        var already=btn.classList.contains('on');
        if(already) return;
        var siblings=fyTabsEl.querySelectorAll('button');
        for(var i=0;i<siblings.length;i++) siblings[i].classList.remove('on');
        btn.classList.add('on');
        var fy=btn.getAttribute('data-fy');
        if(!fy){ renderTable(rows); return; } // "Current" = live snapshot
        var bucket=fyBuckets.filter(function(b){ return b.fy===fy; })[0];
        renderTable(bucket?bucket.rows:[]);
      });
    }
  });
})();
