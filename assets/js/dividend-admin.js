/* ============================================================
   ZY-Invest · Dividend Income — Admin logic
   - Reads/writes `dividend` table
   - Instruments from `instruments` table (searchable combobox)
   - Units held computed from `transaction_trading`:
       SUM(units) for Buy trades on that instrument up to ex-date
       minus SUM(units) for Sell trades on that instrument up to ex-date
   - FY filter from `fy_settings` table
   ============================================================ */
(function(){
  var ALL = [], FY_LIST = [], INSTRUMENTS = [];
  var dvQ = '', dvFY = '', dvEditId = null;
  var selectedInst = null; // {id, name, ticker, ...}

  function fmt(n, dp){
    var d = dp === undefined ? 2 : dp;
    return parseFloat(n||0).toLocaleString('en-MY', {minimumFractionDigits:d, maximumFractionDigits:d});
  }
  function parseNum(s){ return parseFloat((s||'').toString().replace(/,/g,''))||0; }
  function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }

  function statusPill(s){
    return s==='Received'
      ? '<span class="pill-ok">Received</span>'
      : '<span class="pill-warn">Pending</span>';
  }

  // ── FY date filter helper ──────────────────────────────────
  function inFY(r){
    if(!dvFY) return true;
    var fy = FY_LIST.filter(function(f){ return f.id===dvFY; })[0];
    if(!fy) return true;
    var d = r.ex_date || r.pay_date;
    return d >= fy.start_date && d <= fy.end_date;
  }

  function filtered(){
    return ALL.filter(function(r){
      if(dvFY && !inFY(r)) return false;
      if(dvQ && (r.instrument_name||'').toLowerCase().indexOf(dvQ) === -1) return false;
      return true;
    });
  }

  // ── load FY dropdown ──────────────────────────────────────
  async function loadFY(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('fy_settings').select('*').order('start_date',{ascending:false});
    if(res.error||!res.data) return;
    FY_LIST = res.data;
    var sel = document.getElementById('dv-fy');
    FY_LIST.forEach(function(fy){
      var o=document.createElement('option'); o.value=fy.id; o.textContent=fy.label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function(){ dvFY=this.value; renderTable(); updateMetrics(); });
  }

  // ── load instruments ──────────────────────────────────────
  async function loadInstruments(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('instruments').select('id,name,ticker,product').order('name');
    if(res.error||!res.data) return;
    INSTRUMENTS = res.data;
  }

  // ── load dividend records ─────────────────────────────────
  async function load(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('dividend').select('*').order('ex_date',{ascending:false});
    if(res.error){ if(window.zyToast) zyToast('Load failed: '+res.error.message); return; }
    ALL = res.data||[];
    renderTable();
    updateMetrics();
  }

  // ── render table ──────────────────────────────────────────
  function renderTable(){
    var rows = filtered();
    var tbody = document.getElementById('dvBody');
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="8" style="padding:24px;color:var(--fg-3);">No dividend records found.</td></tr>';
      document.getElementById('dvListCount').textContent='0 of '+ALL.length;
      return;
    }
    tbody.innerHTML='';
    rows.forEach(function(r){
      var gross = (parseFloat(r.dps)||0) * (parseFloat(r.units_held)||0);
      var tr=document.createElement('tr'); tr.className='clickable';
      tr.innerHTML=
        '<td>'+fmtDate(r.ex_date)+'</td>'+
        '<td>'+fmtDate(r.pay_date)+'</td>'+
        '<td class="hold-name"><b>'+(r.instrument_name||'—')+'</b><span>'+(r.ticker||'—')+'</span></td>'+
        '<td>'+(r.type||'—')+'</td>'+
        '<td class="r">'+fmt(r.dps, 4)+'</td>'+
        '<td class="r">'+fmt(r.units_held, 0)+'</td>'+
        '<td class="r">'+fmt(gross)+'</td>'+
        '<td>'+statusPill(r.status)+'</td>';
      tr.addEventListener('click', function(){ openEdit(r); });
      tbody.appendChild(tr);
    });
    document.getElementById('dvListCount').textContent=rows.length+' of '+ALL.length;
  }

  // ── update metric boxes ──────────────────────────────────
  function updateMetrics(){
    var fyRows = ALL.filter(inFY);
    var total=0, pending=0, totalDps=0, dpsCount=0;
    fyRows.forEach(function(r){
      var gross=(parseFloat(r.dps)||0)*(parseFloat(r.units_held)||0);
      if(r.status==='Received') total+=gross;
      else pending++;
      if(r.dps){ totalDps+=parseFloat(r.dps); dpsCount++; }
    });
    document.getElementById('dvTotal').textContent='RM '+fmt(total);
    document.getElementById('dvCount').textContent=fyRows.length;
    document.getElementById('dvPending').textContent=pending;
    document.getElementById('dvAvgDps').textContent='RM '+fmt(dpsCount>0?totalDps/dpsCount:0, 4);
  }

  // ── compute units held on ex-date from transaction_trading ─
  async function computeUnitsHeld(instName, exDate){
    if(!instName || !exDate || typeof sb==='undefined'||!sb){
      document.getElementById('dv-units').value='—';
      document.getElementById('dv-units-hint').textContent='Select instrument and ex-date to auto-compute.';
      updateGross(); return;
    }
    document.getElementById('dv-units-hint').textContent='Computing…';
    try{
      var res = await sb.from('transaction_trading')
        .select('action,units')
        .eq('instrument_name', instName)
        .lte('trade_date', exDate);
      if(res.error) throw res.error;
      var net = 0;
      (res.data||[]).forEach(function(t){
        var u = parseFloat(t.units)||0;
        if(t.action==='Buy') net+=u; else net-=u;
      });
      net = Math.max(0, net);
      document.getElementById('dv-units').value = net > 0 ? fmt(net, 0) : '0';
      document.getElementById('dv-units-hint').textContent =
        net > 0
          ? 'Net units held as at '+exDate+' (from trade history)'
          : 'No trade history for this instrument up to ex-date.';
    }catch(ex){
      document.getElementById('dv-units-hint').textContent='Computation failed: '+ex.message;
    }
    updateGross();
  }

  function updateGross(){
    var dps = parseNum(document.getElementById('dv-dps').value);
    var units = parseNum(document.getElementById('dv-units').value);
    var gross = dps * units;
    document.getElementById('dv-gross').textContent = (dps>0&&units>0) ? 'RM '+fmt(gross) : 'RM —';
  }

  // ── searchable instrument combobox ────────────────────────
  var comboInput  = document.getElementById('dv-inst-input');
  var comboList   = document.getElementById('dv-inst-list');
  var comboHidden = document.getElementById('dv-inst-hidden');

  function renderCombo(q){
    var val = (q||'').toLowerCase();
    var matches = INSTRUMENTS.filter(function(x){
      return !val || x.name.toLowerCase().indexOf(val)>-1 || (x.ticker||'').toLowerCase().indexOf(val)>-1;
    });
    comboList.innerHTML='';
    if(!matches.length){
      comboList.innerHTML='<div class="combo-empty">No instruments found</div>';
    } else {
      matches.forEach(function(x){
        var li=document.createElement('div'); li.className='combo-item';
        li.innerHTML='<span class="combo-name">'+x.name+'</span>'+(x.ticker?'<span class="combo-tick">'+x.ticker+'</span>':'');
        li.addEventListener('mousedown',function(e){
          e.preventDefault();
          selectedInst=x;
          comboInput.value=x.name+(x.ticker?' ('+x.ticker+')':'');
          comboHidden.value=x.name;
          comboList.style.display='none';
          // trigger units computation
          var exDate=document.getElementById('dv-exdate').value;
          if(exDate) computeUnitsHeld(x.name, exDate);
        });
        comboList.appendChild(li);
      });
    }
    comboList.style.display='block';
  }

  comboInput.addEventListener('focus',function(){ renderCombo(this.value); });
  comboInput.addEventListener('input',function(){
    selectedInst=null; comboHidden.value=''; renderCombo(this.value);
    document.getElementById('dv-units').value='—';
    document.getElementById('dv-units-hint').textContent='Select instrument and ex-date to auto-compute.';
    updateGross();
  });
  comboInput.addEventListener('blur',function(){ setTimeout(function(){ comboList.style.display='none'; },150); });
  document.addEventListener('click',function(e){ if(!e.target.closest('.combo-wrap')) comboList.style.display='none'; });

  // ── field change listeners ────────────────────────────────
  document.getElementById('dv-exdate').addEventListener('change',function(){
    var instName=comboHidden.value;
    if(instName) computeUnitsHeld(instName, this.value);
  });
  document.getElementById('dv-dps').addEventListener('input', updateGross);

  // ── open modal ────────────────────────────────────────────
  function openEdit(r){
    dvEditId = r ? r.id : null;
    document.getElementById('dvTitle').textContent = r ? 'Edit Dividend' : 'Record Dividend';
    document.getElementById('dv-confirm').textContent = r ? 'Save Changes' : 'Record Dividend';
    document.getElementById('dv-delete').style.display = r ? 'inline-flex' : 'none';

    // Reset combobox
    selectedInst = null;
    comboInput.value = r ? (r.instrument_name+(r.ticker?' ('+r.ticker+')':'')) : '';
    comboHidden.value = r ? r.instrument_name : '';

    document.getElementById('dv-type').value    = r ? (r.type||'Interim')   : 'Interim';
    document.getElementById('dv-status').value  = r ? (r.status||'Pending') : 'Received';
    document.getElementById('dv-exdate').value  = r ? (r.ex_date||'')  : '';
    document.getElementById('dv-paydate').value = r ? (r.pay_date||'') : '';
    document.getElementById('dv-dps').value     = r ? (r.dps||'')      : '';
    document.getElementById('dv-units').value   = r ? fmt(r.units_held||0, 0) : '—';
    document.getElementById('dv-units-hint').textContent = r
      ? 'Saved value — change ex-date to recompute.'
      : 'Select instrument and ex-date to auto-compute.';
    updateGross();
    zyModalOpen('dvModal');
  }

  document.getElementById('openDvModal').addEventListener('click',function(){ openEdit(null); });

  // ── save ─────────────────────────────────────────────────
  document.getElementById('dv-confirm').addEventListener('click', async function(){
    var instName = comboHidden.value || comboInput.value.trim();
    var exDate   = document.getElementById('dv-exdate').value;
    var payDate  = document.getElementById('dv-paydate').value;
    var type     = document.getElementById('dv-type').value;
    var status   = document.getElementById('dv-status').value;
    var dps      = parseNum(document.getElementById('dv-dps').value);
    var units    = parseNum(document.getElementById('dv-units').value);

    if(!instName){ if(window.zyToast) zyToast('Select an instrument'); return; }
    if(!exDate)  { if(window.zyToast) zyToast('Enter the ex-date'); return; }
    if(dps<=0)   { if(window.zyToast) zyToast('Enter DPS'); return; }

    var inst = INSTRUMENTS.filter(function(x){ return x.name===instName; })[0]||{};
    var payload = {
      instrument_name: instName,
      ticker: inst.ticker||null,
      type: type,
      status: status,
      ex_date: exDate,
      pay_date: payDate||null,
      dps: dps,
      units_held: units||0
    };

    var btn=document.getElementById('dv-confirm'); btn.disabled=true; btn.textContent='Saving…';
    var res;
    try{
      if(dvEditId){
        res = await sb.from('dividend').update(payload).eq('id',dvEditId);
      } else {
        res = await sb.from('dividend').insert(payload);
      }
      if(res.error) throw res.error;
      zyModalClose();
      await load();
      if(window.zyToast) zyToast((dvEditId?'Updated':'Recorded')+' — '+instName);
    }catch(ex){
      if(window.zyToast) zyToast('Error: '+(ex.message||'Unknown'));
    }
    btn.disabled=false; btn.textContent=dvEditId?'Save Changes':'Record Dividend';
  });

  // ── delete ────────────────────────────────────────────────
  document.getElementById('dv-delete').addEventListener('click', async function(){
    if(!dvEditId) return;
    var name = comboInput.value || 'this record';
    if(!confirm('Delete dividend record for "'+name+'"? This cannot be undone.')) return;
    var res = await sb.from('dividend').delete().eq('id',dvEditId);
    if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
    zyModalClose();
    await load();
    if(window.zyToast) zyToast('Deleted — '+name);
  });

  // ── search ────────────────────────────────────────────────
  document.getElementById('dv-search').addEventListener('input',function(){
    dvQ=this.value.toLowerCase(); renderTable();
  });

  // ── init ─────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded',function(){
    setTimeout(function(){
      if(typeof sb!=='undefined'&&sb){ loadFY(); loadInstruments(); load(); }
    }, 600);
  });
})();
