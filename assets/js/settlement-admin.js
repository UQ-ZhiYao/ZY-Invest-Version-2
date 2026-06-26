/* ============================================================
   ZY-Invest · Settlement — Admin logic
   Table: settlement (date, instrument_name, ticker, code,
          product, units, vwap_cost, sale_price, pnl, return_pct)
   ============================================================ */
(function(){
  var ALL=[], INSTRUMENTS=[], FY_LIST=[];
  var stlQ='', stlFY='', stlEditId=null;

  function fmt(n,dp){ return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:dp===undefined?2:dp,maximumFractionDigits:dp===undefined?2:dp}); }
  function parseNum(s){ return parseFloat((s||'').toString().replace(/,/g,''))||0; }
  function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }

  // product colour pill — consistent with instruments and trades pages
  var PROD_CLASS={
    'Securities':'prod-securities','Derivatives':'prod-derivatives','Cash Funds':'prod-cash-funds',
    'Collectibles':'prod-collectibles','Private Equity':'prod-private-eq','Cash on Hand':'prod-cash-hand'
  };
  function prodPill(p){ var cls=PROD_CLASS[p]||'prod-securities'; return '<span class="prod-pill '+cls+'">'+(p||'Securities')+'</span>'; }

  function pnlCell(v){
    var n=parseFloat(v)||0;
    return n>=0
      ? '<span class="pnl-pos">'+fmt(n)+'</span>'
      : '<span class="pnl-neg">'+fmt(n)+'</span>';
  }

  // ── FY filter ────────────────────────────────────────────────
  function inFY(r){
    if(!stlFY) return true;
    var fy=FY_LIST.filter(function(f){return f.id===stlFY;})[0];
    if(!fy) return true;
    return r.date>=fy.start_date&&r.date<=fy.end_date;
  }

  async function loadFY(){
    if(typeof sb==='undefined'||!sb) return;
    var res=await sb.from('fy_settings').select('*').order('start_date',{ascending:false});
    if(res.error||!res.data) return;
    FY_LIST=res.data;
    var sel=document.getElementById('stl-fy');
    FY_LIST.forEach(function(fy){ var o=document.createElement('option'); o.value=fy.id; o.textContent=fy.label; sel.appendChild(o); });
    sel.addEventListener('change',function(){ stlFY=this.value; render(); updateMetrics(); });
  }

  // ── instruments ──────────────────────────────────────────────
  async function loadInstruments(){
    if(typeof sb==='undefined'||!sb) return;
    var res=await sb.from('instruments').select('id,name,ticker,code,product').order('name');
    if(res.error||!res.data) return;
    INSTRUMENTS=res.data;
  }

  // ── settlement records ───────────────────────────────────────
  async function load(){
    if(typeof sb==='undefined'||!sb) return;
    var res=await sb.from('settlement').select('*').order('date',{ascending:false});
    if(res.error){ if(window.zyToast) zyToast('Load failed: '+res.error.message); return; }
    ALL=res.data||[];
    render(); updateMetrics();
  }

  // ── render table ─────────────────────────────────────────────
  function render(){
    var rows=ALL.filter(function(r){
      if(stlFY&&!inFY(r)) return false;
      if(stlQ&&(r.instrument_name||'').toLowerCase().indexOf(stlQ)===-1) return false;
      return true;
    });
    var tbody=document.getElementById('stlBody');
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="8" style="padding:24px;color:var(--fg-3);">No settlement records found.</td></tr>';
      document.getElementById('stlListCount').textContent='0 of '+ALL.length;
      return;
    }
    tbody.innerHTML='';
    rows.forEach(function(r){
      var retPct=r.return_pct!=null?fmt(parseFloat(r.return_pct),2)+'%':'—';
      var retClass=parseFloat(r.return_pct||0)>=0?'pnl-pos':'pnl-neg';
      var tk=(r.ticker||'').trim(), co=(r.code||'').trim();
      var subLine=tk&&co&&tk!==co?tk+' | '+co:(tk||co||'—');
      var tr=document.createElement('tr'); tr.className='clickable';
      tr.innerHTML=
        '<td>'+fmtDate(r.date)+'</td>'+
        '<td class="hold-name"><b>'+(r.instrument_name||'—')+'</b><span>'+subLine+'</span></td>'+
        '<td class="r">'+fmt(r.units,4)+'</td>'+
        '<td class="r">'+fmt(r.vwap_cost,4)+'</td>'+
        '<td class="r">'+fmt(r.sale_price,4)+'</td>'+
        '<td class="r">'+pnlCell(r.pnl)+'</td>'+
        '<td class="r"><span class="'+retClass+'">'+retPct+'</span></td>'+
        '<td>'+prodPill(r.product)+'</td>';
      tr.addEventListener('click',function(){ openEdit(r); });
      tbody.appendChild(tr);
    });
    document.getElementById('stlListCount').textContent=rows.length+' of '+ALL.length;
  }

  // ── metrics ──────────────────────────────────────────────────
  function updateMetrics(){
    var fyRows=ALL.filter(inFY);
    var netPnl=0, gains=0, losses=0, win=0, lose=0;
    fyRows.forEach(function(r){
      var p=parseFloat(r.pnl)||0;
      netPnl+=p;
      if(p>=0){ gains+=p; win++; } else { losses+=p; lose++; }
    });
    var wr=win+lose>0?Math.round(win/(win+lose)*100):0;
    var pnlEl=document.getElementById('stlPnl');
    pnlEl.textContent=(netPnl<0?'−':'')+'RM '+fmt(Math.abs(netPnl));
    pnlEl.style.color=netPnl>=0?'var(--green)':'var(--red)';
    document.getElementById('stlGain').textContent='RM '+fmt(gains);
    document.getElementById('stlGainN').textContent=win+' winning trade'+(win===1?'':'s');
    document.getElementById('stlLoss').textContent=(losses<0?'−':'')+'RM '+fmt(Math.abs(losses));
    document.getElementById('stlLossN').textContent=lose+' losing trade'+(lose===1?'':'s');
    document.getElementById('stlCount').textContent=fyRows.length;
    document.getElementById('stlWinRate').textContent=wr+'% win rate';
  }

  // ── instrument dropdown ──────────────────────────────────────
  function renderInstOpts(q){
    var optWrap=document.getElementById('stl-inst-options');
    var list=document.getElementById('stl-inst-list');
    if(!optWrap||!list) return;
    var query=(q||'').toLowerCase();
    var matches=INSTRUMENTS.filter(function(x){
      if(!query) return true;
      return x.name.toLowerCase().indexOf(query)>-1||(x.ticker||'').toLowerCase().indexOf(query)>-1||(x.code||'').toLowerCase().indexOf(query)>-1;
    });
    optWrap.innerHTML='';
    if(!matches.length){ optWrap.innerHTML='<div class="inst-dd-empty">No instruments found</div>'; }
    else {
      matches.forEach(function(x){
        var div=document.createElement('div'); div.className='inst-dd-option';
        var cs=[x.ticker,x.code].filter(Boolean); if(cs.length===2&&cs[0]===cs[1]) cs=[cs[0]]; var cd=cs.join(' \u00b7 ');
        div.innerHTML='<span class="inst-opt-name">'+x.name+'</span>'+(cd?'<span class="inst-opt-code">'+cd+'</span>':'');
        div.addEventListener('mousedown',function(e){ e.preventDefault(); document.getElementById('stl-inst-sel').value=x.name; document.getElementById('stl-inst-search').value=x.name; list.classList.remove('open'); });
        optWrap.appendChild(div);
      });
    }
    list.classList.add('open');
  }

  function wireInstDd(){
    var srch=document.getElementById('stl-inst-search');
    var list=document.getElementById('stl-inst-list');
    var caret=document.getElementById('stl-inst-caret');
    var wrap=document.getElementById('stl-inst-wrap');
    if(!srch) return;
    srch.addEventListener('focus',function(){ renderInstOpts(this.value); });
    srch.addEventListener('input',function(){ document.getElementById('stl-inst-sel').value=''; renderInstOpts(this.value); });
    srch.addEventListener('blur',function(){ setTimeout(function(){ if(list) list.classList.remove('open'); },180); });
    srch.addEventListener('keydown',function(e){ if(e.key==='Escape'){ list.classList.remove('open'); srch.blur(); } });
    if(caret){ caret.addEventListener('mousedown',function(e){ e.preventDefault(); if(list.classList.contains('open')) list.classList.remove('open'); else { renderInstOpts(srch.value); srch.focus(); } }); }
    document.addEventListener('click',function(e){ if(wrap&&!wrap.contains(e.target)&&list) list.classList.remove('open'); });
  }

  // ── P&L preview ──────────────────────────────────────────────
  function updatePreview(){
    var u=parseNum(document.getElementById('stl-units').value);
    var v=parseNum(document.getElementById('stl-vwap').value);
    var s=parseNum(document.getElementById('stl-sale').value);
    if(u>0&&v>0&&s>0){
      var pnl=(s-v)*u;
      var el=document.getElementById('stl-pnl-preview');
      el.textContent=(pnl<0?'−':'')+'RM '+fmt(Math.abs(pnl));
      el.style.color=pnl>=0?'var(--green)':'var(--red)';
    } else {
      document.getElementById('stl-pnl-preview').textContent='RM —';
      document.getElementById('stl-pnl-preview').style.color='var(--fg-1)';
    }
  }
  ['stl-units','stl-vwap','stl-sale'].forEach(function(id){ document.getElementById(id).addEventListener('input',updatePreview); });

  // ── open modal ────────────────────────────────────────────────
  function openEdit(r){
    stlEditId=r?r.id:null;
    document.getElementById('stlTitle').textContent=r?'Edit Settlement':'Add Settlement';
    document.getElementById('stl-save').textContent=r?'Save Changes':'Save';
    document.getElementById('stl-delete').style.display=r?'inline-flex':'none';
    document.getElementById('stl-date').value=r?(r.date||''):new Date().toISOString().slice(0,10);
    var srch=document.getElementById('stl-inst-search');
    document.getElementById('stl-inst-sel').value=r?(r.instrument_name||''):'';
    if(srch) srch.value=r?(r.instrument_name||''):'';
    document.getElementById('stl-units').value=r?(r.units||''):'';
    document.getElementById('stl-vwap').value=r?(r.vwap_cost||''):'';
    document.getElementById('stl-sale').value=r?(r.sale_price||''):'';
    updatePreview();
    zyModalOpen('stlModal');
  }

  document.getElementById('openStlModal').addEventListener('click',function(){ openEdit(null); });

  // ── save ─────────────────────────────────────────────────────
  document.getElementById('stl-save').addEventListener('click',async function(){
    var date=document.getElementById('stl-date').value;
    var instName=document.getElementById('stl-inst-sel').value||document.getElementById('stl-inst-search').value.trim();
    var units=parseNum(document.getElementById('stl-units').value);
    var vwap=parseNum(document.getElementById('stl-vwap').value);
    var sale=parseNum(document.getElementById('stl-sale').value);
    if(!date){ if(window.zyToast) zyToast('Select a date'); return; }
    if(!instName){ if(window.zyToast) zyToast('Select an instrument'); return; }
    if(units<=0||vwap<=0||sale<=0){ if(window.zyToast) zyToast('Enter units, VWAP cost and sale price'); return; }

    var inst=INSTRUMENTS.filter(function(x){return x.name===instName;})[0]||{};
    var pnl=(sale-vwap)*units;
    var retPct=vwap>0?((sale-vwap)/vwap)*100:0;

    var payload={
      date:date, instrument_name:instName,
      ticker:inst.ticker||null, code:inst.code||null, product:inst.product||'Securities',
      units:units, vwap_cost:vwap, sale_price:sale,
      pnl:pnl, return_pct:retPct
    };

    var btn=document.getElementById('stl-save'); btn.disabled=true; btn.textContent='Saving…';
    try{
      var res=stlEditId
        ? await sb.from('settlement').update(payload).eq('id',stlEditId)
        : await sb.from('settlement').insert(payload);
      if(res.error) throw res.error;
      zyModalClose(); await load();
      if(window.zyToast) zyToast((stlEditId?'Updated':'Added')+' — '+instName);
    }catch(ex){
      if(window.zyToast) zyToast('Error: '+(ex.message||'Unknown'));
    }
    btn.disabled=false; btn.textContent=stlEditId?'Save Changes':'Save';
  });

  // ── delete ────────────────────────────────────────────────────
  document.getElementById('stl-delete').addEventListener('click',async function(){
    if(!stlEditId) return;
    var name=document.getElementById('stl-inst-sel').value||'this record';
    if(!confirm('Delete settlement for "'+name+'"? This cannot be undone.')) return;
    var res=await sb.from('settlement').delete().eq('id',stlEditId);
    if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
    zyModalClose(); await load();
    if(window.zyToast) zyToast('Deleted — '+name);
  });

  // ── search ────────────────────────────────────────────────────
  document.getElementById('stlSearch').addEventListener('input',function(){ stlQ=this.value.toLowerCase(); render(); });

  // ── init ──────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded',function(){
    wireInstDd();
    setTimeout(function(){ if(typeof sb!=='undefined'&&sb){ loadFY(); loadInstruments(); load(); } },600);
  });
})();
