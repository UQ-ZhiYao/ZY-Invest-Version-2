/* ============================================================
   ZY-Invest · Distributions — Admin logic
   - FY auto-computed from ex-date vs fy_settings table
   - Units auto-computed from capital_injection (net fund units on ex-date)
   - Status: Pending / Paid
   - No source of funds, no notes
   ============================================================ */
(function(){
  var ALL=[], FY_LIST=[];
  var distEditId=null;

  function fmt(n,dp){ var d=dp===undefined?2:dp; return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:d,maximumFractionDigits:d}); }
  function parseNum(s){ return parseFloat((s||'').toString().replace(/,/g,''))||0; }
  function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }

  function sPill(s){
    return s==='Paid'
      ? '<span class="pill-ok">Paid</span>'
      : '<span class="pill-warn">Pending</span>';
  }

  // ── detect FY from ex-date ────────────────────────────────
  function detectFY(exDate){
    if(!exDate||!FY_LIST.length) return '';
    var match=FY_LIST.filter(function(fy){ return exDate>=fy.start_date&&exDate<=fy.end_date; })[0];
    return match?match.label:'';
  }

  // ── compute fund units in issue on ex-date ────────────────
  // Logic: sum all Subscription units - sum all Redemption units
  // from capital_injection where status='Approved' and date <= ex-date
  async function computeFundUnits(exDate){
    var unitsEl=document.getElementById('d-units');
    var hintEl=document.getElementById('d-units-hint');
    if(!exDate||typeof sb==='undefined'||!sb){
      if(unitsEl) unitsEl.value='—';
      if(hintEl) hintEl.textContent='Auto-computed from capital injection records up to ex-date.';
      updatePayout(); return;
    }
    if(hintEl) hintEl.textContent='Computing…';
    try{
      var res=await sb.from('capital_injection')
        .select('type,units')
        .eq('status','Approved')
        .lte('date',exDate);
      if(res.error) throw res.error;
      var net=0;
      (res.data||[]).forEach(function(r){
        var u=parseFloat(r.units)||0;
        if(r.type==='Subscription') net+=u; else net-=u;
      });
      net=Math.max(0,net);
      if(unitsEl) unitsEl.value=net>0?fmt(net,0):'0';
      if(hintEl) hintEl.textContent='Net approved units as at '+exDate+'.';
    }catch(ex){
      if(hintEl) hintEl.textContent='Failed: '+ex.message;
    }
    updatePayout();
  }

  function updatePayout(){
    var dps=parseNum(document.getElementById('d-dps').value);    // in sen
    var units=parseNum(document.getElementById('d-units').value);
    var gross=dps>0&&units>0?(dps/100)*units:0;
    document.getElementById('d-payout').textContent=gross>0?'RM '+fmt(gross):'RM —';
    return gross;
  }

  // ── load FY list ─────────────────────────────────────────
  async function loadFY(){
    if(typeof sb==='undefined'||!sb) return;
    var res=await sb.from('fy_settings').select('*').order('start_date',{ascending:false});
    if(res.error||!res.data) return;
    FY_LIST=res.data;
  }

  // ── load distributions ────────────────────────────────────
  async function load(){
    if(typeof sb==='undefined'||!sb) return;
    var res=await sb.from('distributions').select('*').order('ex_date',{ascending:false});
    if(res.error){ if(window.zyToast) zyToast('Load failed: '+res.error.message); return; }
    ALL=res.data||[];
    renderTable(); updateMetrics();
  }

  // ── render table ──────────────────────────────────────────
  function renderTable(){
    var tbody=document.getElementById('dBody');
    if(!ALL.length){
      tbody.innerHTML='<tr><td colspan="8" style="padding:24px;color:var(--fg-3);">No distributions recorded.</td></tr>';
      return;
    }
    tbody.innerHTML='';
    ALL.forEach(function(r){
      var dps=parseFloat(r.dps)||0;
      var units=parseFloat(r.units)||0;
      var gross=r.amount!=null?parseFloat(r.amount):(units>0?(dps/100)*units:0);
      var tr=document.createElement('tr'); tr.className='clickable';
      tr.innerHTML=
        '<td>'+(r.fy||'—')+'</td>'+
        '<td>'+(r.type||'—')+'</td>'+
        '<td>'+fmtDate(r.ex_date)+'</td>'+
        '<td>'+fmtDate(r.pay_date)+'</td>'+
        '<td class="r">'+fmt(dps,2)+'</td>'+
        '<td class="r">'+fmt(units,0)+'</td>'+
        '<td class="r">'+fmt(gross)+'</td>'+
        '<td class="r">'+sPill(r.status)+'</td>';
      tr.addEventListener('click',function(){ openEdit(r); });
      tbody.appendChild(tr);
    });
  }

  // ── metrics ───────────────────────────────────────────────
  function updateMetrics(){
    var totalPaid=0, pending=0;
    ALL.forEach(function(r){
      var g=r.amount!=null?parseFloat(r.amount):(parseFloat(r.dps)||0)/100*(parseFloat(r.units)||0);
      if(r.status==='Paid') totalPaid+=g; else pending++;
    });
    var latest=ALL[0]||{};
    document.getElementById('distCount').textContent=ALL.length;
    document.getElementById('distPaid').textContent='RM '+fmt(totalPaid);
    document.getElementById('distPending').textContent=pending;
    document.getElementById('distLatestDps').textContent=latest.dps?fmt(parseFloat(latest.dps),2)+' sen':'—';
    document.getElementById('distLatestFy').textContent=latest.fy||'—';
  }

  // ── ex-date change: auto FY + auto units ─────────────────
  document.getElementById('d-ex').addEventListener('change',function(){
    var exDate=this.value;
    // Auto FY
    var fy=detectFY(exDate);
    var fyEl=document.getElementById('d-fy');
    fyEl.value=fy;
    document.getElementById('d-fy-hint').textContent=fy?'Matched to '+fy+' from FY Settings.':'No matching FY — check FY Settings.';
    // Auto units
    computeFundUnits(exDate);
  });

  document.getElementById('d-dps').addEventListener('input',updatePayout);

  // ── open modal ────────────────────────────────────────────
  function openEdit(r){
    distEditId=r?r.id:null;
    document.getElementById('distTitle').textContent=r?'Edit Distribution':'Declare Distribution';
    document.getElementById('d-save').textContent=r?'Save Changes':'Save';
    document.getElementById('d-delete').style.display=r?'inline-flex':'none';

    document.getElementById('d-type').value=r?(r.type||''):'';
    document.getElementById('d-ex').value=r?(r.ex_date||''):'';
    document.getElementById('d-pay').value=r?(r.pay_date||''):'';
    document.getElementById('d-fy').value=r?(r.fy||''):'';
    document.getElementById('d-fy-hint').textContent=r?'Matched from FY Settings.':'Set ex-date to auto-detect FY.';
    document.getElementById('d-dps').value=r?(r.dps||''):'';
    document.getElementById('d-units').value=r?fmt(r.units||0,0):'—';
    document.getElementById('d-units-hint').textContent=r?'Saved value. Change ex-date to recompute.':'Auto-computed from capital injection records up to ex-date.';
    document.getElementById('d-status').value=r?(r.status||'Pending'):'Pending';
    updatePayout();
    zyModalOpen('distModal');
  }

  document.getElementById('openDistModal').addEventListener('click',function(){ openEdit(null); });

  // ── save ─────────────────────────────────────────────────
  document.getElementById('d-save').addEventListener('click',async function(){
    var type=document.getElementById('d-type').value.trim();
    var exDate=document.getElementById('d-ex').value;
    var payDate=document.getElementById('d-pay').value;
    var fy=document.getElementById('d-fy').value.trim();
    var dps=parseNum(document.getElementById('d-dps').value);
    var units=parseNum(document.getElementById('d-units').value);
    var status=document.getElementById('d-status').value;

    if(!type)  { if(window.zyToast) zyToast('Enter distribution type'); return; }
    if(!exDate){ if(window.zyToast) zyToast('Enter the ex-date'); return; }
    if(dps<=0) { if(window.zyToast) zyToast('Enter DPS in sen'); return; }

    var amount=dps>0&&units>0?(dps/100)*units:null;
    var payload={
      type:type, ex_date:exDate, pay_date:payDate||null,
      fy:fy||null, dps:dps, units:units||0, status:status,
      amount:amount
    };

    var btn=document.getElementById('d-save'); btn.disabled=true; btn.textContent='Saving…';
    try{
      var res=distEditId
        ? await sb.from('distributions').update(payload).eq('id',distEditId)
        : await sb.from('distributions').insert(payload);
      if(res.error) throw res.error;
      zyModalClose(); await load();
      if(window.zyToast) zyToast((distEditId?'Updated':'Declared')+' — '+(fy||type));
    }catch(ex){
      if(window.zyToast) zyToast('Error: '+(ex.message||'Unknown'));
    }
    btn.disabled=false; btn.textContent=distEditId?'Save Changes':'Save';
  });

  // ── delete ────────────────────────────────────────────────
  document.getElementById('d-delete').addEventListener('click',async function(){
    if(!distEditId) return;
    var label=(document.getElementById('d-fy').value||'')+(document.getElementById('d-type').value?' '+document.getElementById('d-type').value:'');
    if(!confirm('Delete "'+label+'"? This cannot be undone.')) return;
    var res=await sb.from('distributions').delete().eq('id',distEditId);
    if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
    zyModalClose(); await load();
    if(window.zyToast) zyToast('Deleted — '+label);
  });

  // ── init ─────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded',function(){
    document.getElementById('d-ex').value=new Date().toISOString().slice(0,10);
    setTimeout(function(){ if(typeof sb!=='undefined'&&sb){ loadFY(); load(); } },600);
  });
})();
