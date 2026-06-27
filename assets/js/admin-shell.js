/* ===== ZY-Invest Admin — shared chrome behaviour (all pages) ===== */
(function(){
  // inject table-fixed CSS on every admin page
  (function(){
    var id='zy-tbl-fix';
    if(!document.getElementById(id)){
      var lnk=document.createElement('link');
      lnk.id=id; lnk.rel='stylesheet';
      lnk.href='../assets/css/admin-table-fixed.css';
      document.head.appendChild(lnk);
    }
  })();

  // sidebar collapse (persisted)
  var admShell=document.getElementById('admShell');
  var tg=document.getElementById('admToggle');
  if(tg && admShell){ tg.addEventListener('click',function(){ var c=admShell.classList.toggle('collapsed'); try{ localStorage.setItem('zy_admin_sb', c?'1':'0'); }catch(e){} }); }

  // clock
  var clk=document.getElementById('clock');
  function tick(){ if(!clk) return; var d=new Date(); clk.textContent=d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})+' \u00b7 '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+' MYT'; }
  tick(); setInterval(tick,30000);

  // logout buttons (also handled by admin-supabase.js, but keep a fallback)
  function fallbackLogout(){ try{ localStorage.removeItem('zy_admin_session'); }catch(e){} location.replace('admin-login.html'); }
  var lo=document.getElementById('logout');
  if(lo && !lo._wired){ lo.addEventListener('click',function(e){ if(typeof sb==='undefined'){ e.preventDefault(); fallbackLogout(); } }); }

  // click-to-sort on any admin table
  function parseCell(td){ var s=(td?td.textContent:'').trim(); if(/^\d{1,2}\s\w{3}\s\d{4}$/.test(s)){ var d=Date.parse(s); if(!isNaN(d)) return {t:'n',v:d}; } if(s==='\u2014'||s==='-'||s===''){ return {t:'n',v:-Infinity}; } var c=s.replace(/RM/gi,'').replace(/sen/gi,'').replace(/,/g,'').replace(/%/g,'').replace(/\+/g,'').replace(/\u2212/g,'-').trim(); if(/^-?\d*\.?\d+$/.test(c)){ return {t:'n',v:parseFloat(c)}; } return {t:'s',v:s.toLowerCase()}; }
  window.sortTable=function(table, idx, dir){ if(!table) return; var tb=table.tBodies[0]; if(!tb) return; var rows=Array.prototype.slice.call(tb.rows).filter(function(r){ return r.cells.length>1; }); var pinned=rows.filter(function(r){ return r.dataset.pin==='last'; }); var rest=rows.filter(function(r){ return r.dataset.pin!=='last'; }); rest.sort(function(a,b){ var av=parseCell(a.cells[idx]), bv=parseCell(b.cells[idx]), r; if(av.t==='n'&&bv.t==='n') r=av.v-bv.v; else r=String(av.v).localeCompare(String(bv.v)); return dir==='asc'?r:-r; }); rest.concat(pinned).forEach(function(r){ tb.appendChild(r); }); var ths=table.tHead?table.tHead.rows[0].cells:[]; for(var i=0;i<ths.length;i++){ ths[i].classList.remove('sorted-asc','sorted-desc'); } if(ths[idx]) ths[idx].classList.add(dir==='asc'?'sorted-asc':'sorted-desc'); table.setAttribute('data-sort-col',idx); table.setAttribute('data-sort-dir',dir); };
  document.addEventListener('click',function(e){ var th=e.target.closest('.adm-main .tbl thead th'); if(!th) return; var table=th.closest('table'); var cells=th.parentNode.cells; var idx=Array.prototype.indexOf.call(cells,th); var dir=(table.getAttribute('data-sort-col')==String(idx) && table.getAttribute('data-sort-dir')==='asc') ? 'desc' : 'asc'; sortTable(table, idx, dir); });

  // shared helpers exposed globally
  window.zyToast=function(msg){ var t=document.getElementById('toast'); if(!t) return; document.getElementById('toastMsg').textContent=msg; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(function(){ t.classList.remove('show'); },2600); };
  window.zyParseNum=function(s){ return parseFloat((s||'').replace(/,/g,''))||0; };
  window.zyFmt=function(n){ return n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); };
  window.zyModalOpen=function(id){ var m=document.getElementById(id); if(m){ m.classList.add('open'); var sc=document.getElementById('modalScrim'); if(sc) sc.classList.add('open'); } };
  window.zyModalClose=function(){ document.querySelectorAll('.modal').forEach(function(m){ m.classList.remove('open'); }); var sc=document.getElementById('modalScrim'); if(sc) sc.classList.remove('open'); };
  document.addEventListener('DOMContentLoaded',function(){
    var sc=document.getElementById('modalScrim'); if(sc) sc.addEventListener('click',zyModalClose);
    document.querySelectorAll('[data-close]').forEach(function(b){ b.addEventListener('click',zyModalClose); });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape') zyModalClose(); });
  });
})();
