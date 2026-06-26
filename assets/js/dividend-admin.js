/* ============================================================
   ZY-Invest · Dividend Income — Admin logic
   - Instruments: filterable dropdown (same pattern as trades)
   - Type: free text input
   - Status: Not entitled / Pending / Received (no status in modal)
   - Units held: auto-computed from transaction_trading
   - FY filter from fy_settings
   ============================================================ */
(function(){
  var ALL=[], FY_LIST=[], INSTRUMENTS=[];
  var dvQ='', dvFY='', dvEditId=null;

  function fmt(n,dp){ var d=dp===undefined?2:dp; return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:d,maximumFractionDigits:d}); }
  function parseNum(s){ return parseFloat((s||'').toString().replace(/,/g,''))||0; }
  function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }

  // 3-mode status pill
  function sPill(s){
    if(!s||s.toLowerCase()==='not entitled') return '<span class="pill-warn" style="color:var(--fg-3);background:var(--gray-100);">Not Entitled</span>';
    if(s.toLowerCase()==='received')  return '<span class="pill-ok">Received</span>';
    return '<span class="pill-warn">Pending</span>';
  }

  // ── FY filter ─────────────────────────────────────────────
  function inFY(r){
    if(!dvFY) return true;
    var fy=FY_LIST.filter(function(f){return f.id===dvFY;})[0];
    if(!fy) return true;
    var d=r.ex_date||r.pay_date; return d>=fy.start_date&&d<=fy.end_date;
  }
  function filtered(){ return ALL.filter(function(r){ return inFY(r)&&(!dvQ||(r.instrument_name||'').toLowerCase().indexOf(dvQ)>-1); }); }

  async function loadFY(){
    if(typeof sb==='undefined'||!sb) return;
    var res=await sb.from('fy_settings').select('*').order('start_date',{ascending:false});
    if(res.error||!res.data) return;
    FY_LIST=res.data;
    var sel=document.getElementById('dv-fy');
    FY_LIST.forEach(function(fy){ var o=document.createElement('option'); o.value=fy.id; o.textContent=fy.label; sel.appendChild(o); });
    sel.addEventListener('change',function(){ dvFY=this.value; renderTable(); updateMetrics(); });
  }

  // ── instruments ───────────────────────────────────────────
  async function loadInstruments(){
    if(typeof sb==='undefined'||!sb) return;
    var res=await sb.from('instruments').select('id,name,ticker,code,product').order('name');
    if(res.error||!res.data) return;
    INSTRUMENTS=res.data;
  }

  // ── dividend records ──────────────────────────────────────
  async function load(){
    if(typeof sb==='undefined'||!sb) return;
    var res=await sb.from('dividend').select('*').order('ex_date',{ascending:false});
    if(res.error){ if(window.zyToast) zyToast('Load failed: '+res.error.message); return; }
    ALL=res.data||[];
    renderTable(); updateMetrics();
  }

  // ── render table ──────────────────────────────────────────
  function renderTable(){
    var rows=filtered(), tbody=document.getElementById('dvBody');
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="8" style="padding:24px;color:var(--fg-3);">No dividend records found.</td></tr>';
      document.getElementById('dvListCount').textContent='0 of '+ALL.length;
      return;
    }
    tbody.innerHTML='';
    rows.forEach(function(r){
      var gross=(parseFloat(r.dps)||0)*(parseFloat(r.units_held)||0);
      // 2-line instrument: name + ticker|code
      var tk=(r.ticker||'').trim(), co=(r.code||'').trim();
      var subLine=tk&&co&&tk!==co?tk+' | '+co:(tk||co||'—');
      var tr=document.createElement('tr'); tr.className='clickable';
      tr.innerHTML=
        '<td>'+fmtDate(r.ex_date)+'</td>'+
        '<td>'+fmtDate(r.pay_date)+'</td>'+
        '<td class="hold-name"><b>'+(r.instrument_name||'—')+'</b><span>'+subLine+'</span></td>'+
        '<td>'+(r.type||'—')+'</td>'+
        '<td class="r">'+fmt(r.dps,4)+'</td>'+
        '<td class="r">'+fmt(r.units_held,0)+'</td>'+
        '<td class="r">'+fmt(gross)+'</td>'+
        '<td>'+sPill(r.status)+'</td>';
      tr.addEventListener('click',function(){ openEdit(r); });
      tbody.appendChild(tr);
    });
    document.getElementById('dvListCount').textContent=rows.length+' of '+ALL.length;
  }

  // ── metrics ───────────────────────────────────────────────
  function updateMetrics(){
    var fyRows=ALL.filter(inFY);
    var total=0, pending=0, totalDps=0, dpsCount=0;
    fyRows.forEach(function(r){
      var gross=(parseFloat(r.dps)||0)*(parseFloat(r.units_held)||0);
      var s=(r.status||'').toLowerCase();
      if(s==='received') total+=gross;
      if(s==='pending') pending++;
      if(r.dps){ totalDps+=parseFloat(r.dps); dpsCount++; }
    });
    document.getElementById('dvTotal').textContent='RM '+fmt(total);
    document.getElementById('dvCount').textContent=fyRows.length;
    document.getElementById('dvPending').textContent=pending;
    document.getElementById('dvAvgDps').textContent='RM '+fmt(dpsCount>0?totalDps/dpsCount:0,4);
  }

  // ── filterable instrument dropdown ────────────────────────
  function renderInstOptions(q){
    var optWrap=document.getElementById('dv-inst-options');
    var list=document.getElementById('dv-inst-list');
    if(!optWrap||!list) return;
    var query=(q||'').toLowerCase();
    var matches=INSTRUMENTS.filter(function(x){
      if(!query) return true;
      return x.name.toLowerCase().indexOf(query)>-1
          ||(x.ticker||'').toLowerCase().indexOf(query)>-1
          ||(x.code||'').toLowerCase().indexOf(query)>-1;
    });
    optWrap.innerHTML='';
    if(!matches.length){
      optWrap.innerHTML='<div class="dv-dd-empty">No instruments found</div>';
    } else {
      matches.forEach(function(x){
        var div=document.createElement('div'); div.className='dv-dd-option';
        var codeStr=[x.ticker,x.code].filter(Boolean);
        // deduplicate if ticker === code
        if(codeStr.length===2&&codeStr[0]===codeStr[1]) codeStr=[codeStr[0]];
        var codeDisplay=codeStr.join(' · ');
        div.innerHTML='<span class="dv-opt-name">'+x.name+'</span>'+(codeDisplay?'<span class="dv-opt-code">'+codeDisplay+'</span>':'');
        div.addEventListener('mousedown',function(e){
          e.preventDefault();
          document.getElementById('dv-inst-hidden').value=x.name;
          document.getElementById('dv-inst-input').value=x.name;
          list.classList.remove('open');
          // trigger units computation
          var exDate=document.getElementById('dv-exdate').value;
          if(exDate) computeUnitsHeld(x.name, exDate);
        });
        optWrap.appendChild(div);
      });
    }
    list.classList.add('open');
  }

  function wireInstDropdown(){
    var input=document.getElementById('dv-inst-input');
    var list=document.getElementById('dv-inst-list');
    var caret=document.getElementById('dv-inst-caret');
    var wrap=document.getElementById('dv-inst-wrap');
    if(!input) return;
    input.addEventListener('focus',function(){ renderInstOptions(this.value); });
    input.addEventListener('input',function(){
      document.getElementById('dv-inst-hidden').value='';
      renderInstOptions(this.value);
    });
    input.addEventListener('blur',function(){ setTimeout(function(){ if(list) list.classList.remove('open'); },180); });
    if(caret){ caret.addEventListener('mousedown',function(e){ e.preventDefault(); if(list.classList.contains('open')) list.classList.remove('open'); else { renderInstOptions(input.value); input.focus(); } }); }
    input.addEventListener('keydown',function(e){ if(e.key==='Escape'){ list.classList.remove('open'); input.blur(); } });
    document.addEventListener('click',function(e){ if(wrap&&!wrap.contains(e.target)&&list) list.classList.remove('open'); });
  }

  // ── compute units held from transaction_trading ───────────
  async function computeUnitsHeld(instName, exDate){
    var unitsEl=document.getElementById('dv-units');
    var hintEl=document.getElementById('dv-units-hint');
    if(!instName||!exDate||typeof sb==='undefined'||!sb){
      if(unitsEl) unitsEl.value='—';
      if(hintEl) hintEl.textContent='Select instrument and ex-date to auto-compute.';
      updateGross(); return;
    }
    if(hintEl) hintEl.textContent='Computing…';
    try{
      var res=await sb.from('transaction_trading').select('action,units').eq('instrument_name',instName).lte('trade_date',exDate);
      if(res.error) throw res.error;
      var net=0;
      (res.data||[]).forEach(function(t){ var u=parseFloat(t.units)||0; if(t.action==='Buy') net+=u; else net-=u; });
      net=Math.max(0,net);
      if(unitsEl) unitsEl.value=net>0?fmt(net,0):'0';
      if(hintEl) hintEl.textContent=net>0?'Net units held as at '+exDate+' (from trade history)':'No trade history for this instrument up to ex-date.';
    }catch(ex){
      if(hintEl) hintEl.textContent='Computation failed: '+ex.message;
    }
    updateGross();
  }

  function updateGross(){
    var dps=parseNum(document.getElementById('dv-dps').value);
    var units=parseNum(document.getElementById('dv-units').value);
    document.getElementById('dv-gross').textContent=(dps>0&&units>0)?'RM '+fmt(dps*units):'RM —';
  }

  // ── ex-date + dps listeners ───────────────────────────────
  document.getElementById('dv-exdate').addEventListener('change',function(){
    var instName=document.getElementById('dv-inst-hidden').value;
    if(instName) computeUnitsHeld(instName,this.value);
  });
  document.getElementById('dv-dps').addEventListener('input',updateGross);

  // ── open modal ────────────────────────────────────────────
  function openEdit(r){
    dvEditId=r?r.id:null;
    document.getElementById('dvTitle').textContent=r?'Edit Dividend':'Record Dividend';
    document.getElementById('dv-confirm').textContent=r?'Save Changes':'Record Dividend';
    document.getElementById('dv-delete').style.display=r?'inline-flex':'none';

    // reset dropdown
    document.getElementById('dv-inst-input').value=r?(r.instrument_name||''):'';
    document.getElementById('dv-inst-hidden').value=r?(r.instrument_name||''):'';
    document.getElementById('dv-inst-list').classList.remove('open');

    document.getElementById('dv-type').value=r?(r.type||''):'';
    document.getElementById('dv-exdate').value=r?(r.ex_date||''):'';
    document.getElementById('dv-paydate').value=r?(r.pay_date||''):'';
    document.getElementById('dv-dps').value=r?(r.dps||''):'';
    document.getElementById('dv-units').value=r?fmt(r.units_held||0,0):'—';
    document.getElementById('dv-units-hint').textContent=r?'Saved value — change ex-date to recompute.':'Select instrument and ex-date to auto-compute.';
    // Status selector — only show when editing
    var statusRow=document.getElementById('dv-status-row');
    var statusSel=document.getElementById('dv-status');
    if(statusRow) statusRow.style.display=r?'block':'none';
    if(statusSel&&r) statusSel.value=r.status||'Pending';
    updateGross();
    zyModalOpen('dvModal');
  }

  document.getElementById('openDvModal').addEventListener('click',function(){ openEdit(null); });

  // ── save ─────────────────────────────────────────────────
  document.getElementById('dv-confirm').addEventListener('click',async function(){
    var instName=document.getElementById('dv-inst-hidden').value||document.getElementById('dv-inst-input').value.trim();
    var exDate=document.getElementById('dv-exdate').value;
    var payDate=document.getElementById('dv-paydate').value;
    var type=document.getElementById('dv-type').value.trim();
    var dps=parseNum(document.getElementById('dv-dps').value);
    var units=parseNum(document.getElementById('dv-units').value);
    if(!instName){ if(window.zyToast) zyToast('Select an instrument'); return; }
    if(!exDate)  { if(window.zyToast) zyToast('Enter the ex-date'); return; }
    if(dps<=0)   { if(window.zyToast) zyToast('Enter DPS'); return; }

    var inst=INSTRUMENTS.filter(function(x){return x.name===instName;})[0]||{};
    // status: editing uses selector, new record defaults to Not entitled or Pending
    var statusSel=document.getElementById('dv-status');
    var status = dvEditId
      ? (statusSel?statusSel.value:'Pending')
      : (units>0?'Pending':'Not entitled');

    var payload={
      instrument_name:instName,
      ticker:inst.ticker||null,
      code:inst.code||null,
      type:type||null,
      status:status,
      ex_date:exDate,
      pay_date:payDate||null,
      dps:dps,
      units_held:units||0
    };

    var btn=document.getElementById('dv-confirm'); btn.disabled=true; btn.textContent='Saving…';
    try{
      var res=dvEditId
        ? await sb.from('dividend').update(payload).eq('id',dvEditId)
        : await sb.from('dividend').insert(payload);
      if(res.error) throw res.error;
      zyModalClose(); await load();
      if(window.zyToast) zyToast((dvEditId?'Updated':'Recorded')+' — '+instName);
    }catch(ex){
      if(window.zyToast) zyToast('Error: '+(ex.message||'Unknown'));
    }
    btn.disabled=false; btn.textContent=dvEditId?'Save Changes':'Record Dividend';
  });

  // ── delete ────────────────────────────────────────────────
  document.getElementById('dv-delete').addEventListener('click',async function(){
    if(!dvEditId) return;
    var name=document.getElementById('dv-inst-input').value||'this record';
    if(!confirm('Delete dividend record for "'+name+'"? This cannot be undone.')) return;
    var res=await sb.from('dividend').delete().eq('id',dvEditId);
    if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
    zyModalClose(); await load();
    if(window.zyToast) zyToast('Deleted — '+name);
  });

  // ── status change directly from table row click ───────────
  // (clicking row opens edit modal; admin sets status via that modal)

  // ── search ────────────────────────────────────────────────
  document.getElementById('dv-search').addEventListener('input',function(){ dvQ=this.value.toLowerCase(); renderTable(); });

  // ── init ─────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded',function(){
    wireInstDropdown();
    setTimeout(function(){ if(typeof sb!=='undefined'&&sb){ loadFY(); loadInstruments(); load(); } },600);
  });
})();
