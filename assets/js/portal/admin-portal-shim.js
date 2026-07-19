/* ===== assets/js/portal/admin-portal-shim.js =====
   Small compatibility layer so ported pgXxx() renderers (written for the
   member portal's topnav/notification/toast chrome) work unmodified inside
   the admin console, which has its own equivalents (or none) for these.
   ============================================================ */
// The member portal's showToast(msg, type) -> the admin console's single-arg
// zyToast(msg), when a #toast element exists on the page; otherwise a no-op.
function showToast(msg){ if(typeof zyToast==='function') zyToast(msg); }
// Report pages don't have a notification bell (#nlist) — no-op instead of
// the member portal's version, which assumes that element always exists.
function renderNotifs(){}

// ── Pie/donut chart tooltips — ported verbatim from
// assets/js/portal/shell-widgets.js (self-contained, no member-only deps) ──
function ensurePieTip(){
  var t=document.getElementById('pieTip');
  if(!t){
    t=document.createElement('div');
    t.id='pieTip';
    t.style.cssText='position:fixed;opacity:0;transition:opacity .12s;pointer-events:none;background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:7px 11px;font-size:.78rem;font-weight:400;color:#0F172A;box-shadow:0 6px 20px rgba(0,0,0,.13);z-index:999;white-space:nowrap';
    document.body.appendChild(t);
  }
  return t;
}
function showPieTip(e,txt){var t=ensurePieTip();t.textContent=txt;t.style.opacity='1';t.style.left=(e.clientX+14)+'px';t.style.top=(e.clientY-36)+'px';}
function hidePieTip(){var t=document.getElementById('pieTip');if(t)t.style.opacity='0';}
document.addEventListener('mousemove',function(e){var t=document.getElementById('pieTip');if(t&&t.style.opacity!=='0'){t.style.left=(e.clientX+14)+'px';t.style.top=(e.clientY-36)+'px';}});
function ensureGroupPieTip(){
  var t=document.getElementById('groupPieTip');
  if(!t){
    t=document.createElement('div');
    t.id='groupPieTip';
    t.style.cssText='position:fixed;opacity:0;transition:opacity .12s;pointer-events:none;background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:8px 12px;font-size:.78rem;font-weight:400;color:#0F172A;box-shadow:0 6px 20px rgba(0,0,0,.13);z-index:999;line-height:1.5;white-space:nowrap';
    document.body.appendChild(t);
  }
  return t;
}
function showGroupPieTip(e,raw){
  var t=ensureGroupPieTip();
  var parts=(raw||'').split('|');
  var header=parts[0]||'';
  var lines=parts.slice(1);
  t.innerHTML='<div style="color:#64748B;margin-bottom:5px">'+header+'</div>'
    +lines.map(function(l){return '<div style="margin-bottom:2px">'+l+'</div>';}).join('');
  t.style.opacity='1';
  t.style.left=(e.clientX+14)+'px';
  t.style.top=(e.clientY-46)+'px';
}
function hideGroupPieTip(){var t=document.getElementById('groupPieTip');if(t)t.style.opacity='0';}
document.addEventListener('mousemove',function(e){var t=document.getElementById('groupPieTip');if(t&&t.style.opacity!=='0'){t.style.left=(e.clientX+14)+'px';t.style.top=(e.clientY-46)+'px';}});

// ── Chart hover helpers used by pgFundOverview()/pgFactsheet()/pgFinancialResults()
// — these live in OTHER member-portal page scripts (pages-portfolio.js,
// pages-subscribe-redeem.js, pages-account.js) that aren't part of this admin
// console's shared infra, so they're consolidated here instead of duplicated
// per report page. Verbatim from those source files. ──
function pieGradientColor(idx, total){
  var stops=[[13,71,161],[21,101,192],[30,136,229],[66,165,245],[144,202,249],[176,190,197],[156,163,175]];
  if(total<=1) return 'rgb('+stops[0].join(',')+')';
  var t=idx/(total-1), pos=t*(stops.length-1);
  var i0=Math.floor(pos), i1=Math.min(stops.length-1,i0+1), f=pos-i0;
  var c0=stops[i0], c1=stops[i1];
  var r=Math.round(c0[0]+(c1[0]-c0[0])*f), g=Math.round(c0[1]+(c1[1]-c0[1])*f), b=Math.round(c0[2]+(c1[2]-c0[2])*f);
  return 'rgb('+r+','+g+','+b+')';
}
function frTip(e,txt,cxStr,tipId){
  var el=document.getElementById(tipId||'frTipEl');
  if(!el)return;
  var parts=txt.split('|');
  var fy=parts[0].replace('FY:','');
  var lines=parts.slice(1);
  el.innerHTML='<div style="font-size:.76rem;font-weight:400;color:#64748B;margin-bottom:7px;letter-spacing:.04em">'+fy+'</div>'
    +lines.map(function(l){
      var cc=l.split('::');
      var color=cc[0]; var rest=cc[1]||l;
      var kv=rest.split(': ');
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        +'<span style="width:8px;height:8px;border-radius:50%;background:'+color+';flex-shrink:0"></span>'
        +'<span style="font-size:.8rem;color:#374151;flex:1">'+kv[0]+'</span>'
        +'<span style="font-size:.8rem;font-weight:400;color:#0F172A;margin-left:14px">'+kv[1]+'</span>'
        +'</div>';
    }).join('');
  var tipW=240;
  el.style.width=tipW+'px';
  el.style.display='block';
  var svg=e.target.closest('svg');
  var svgRendW=svg ? svg.getBoundingClientRect().width : 400;
  var cx=cxStr ? parseFloat(cxStr) : 0.5;
  var colCenterCss=cx*svgRendW;
  el.style.top='10px';
  el.style.left=Math.max(4, colCenterCss - tipW/2)+'px';
}
function frHide(tipId){var el=document.getElementById(tipId||'frTipEl');if(el)el.style.display='none';}
function getTip(el){return el.getAttribute('data-tip');}
function candleInfoHtml(tip){
  if(!tip) return '';
  var p=tip.split('|');
  var label=p[0],o=p[1],h=p[2],l=p[3],c=p[4],chg=p[5],chgPct=p[6],up=p[7]==='1';
  var col=up?'#2E7D32':'#DC2626';
  return '<span style="color:#0F172A;font-weight:400;margin-right:12px">'+label+'</span>'
    +'<span style="color:#0F172A;font-weight:400;margin-right:10px">O'+o+'</span>'
    +'<span style="color:#0F172A;font-weight:400;margin-right:10px">H'+h+'</span>'
    +'<span style="color:#0F172A;font-weight:400;margin-right:10px">L'+l+'</span>'
    +'<span style="color:#0F172A;font-weight:400;margin-right:10px">C'+c+'</span>'
    +'<span style="color:'+col+';font-weight:400">'+chg+' ('+chgPct+')</span>';
}
function candleInfo(tip,infoId){
  var el=document.getElementById(infoId);
  if(!el)return;
  el.innerHTML=candleInfoHtml(tip);
}

// The member portal's cross-page nav helper (navigate('holdings') etc.) —
// admin report pages live under a different routing scheme
// (fund-view.html?src=...), so any ported "Details →" style link should be
// rewired per-page rather than relying on this; kept only so an unported
// leftover onclick="navigate(...)" fails soft instead of throwing.
function navigate(pg){ console.warn('navigate() called in admin report context, no-op:', pg); }
