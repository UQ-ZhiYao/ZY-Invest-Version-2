/* ============================================================
   ZY-Invest · Remuneration — Admin logic
   Table: remuneration (id, date, fee_type, amount, status)
   ============================================================ */
(function(){
  var ALL=[], remEditId=null, remQ='';

  function fmt(n){ return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function parseNum(s){ return parseFloat((s||'').toString().replace(/,/g,''))||0; }
  function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }

  function sPill(s){
    return s==='Paid'
      ? '<span class="pill-ok">Paid</span>'
      : '<span class="pill-warn">Pending</span>';
  }

  // ── load ────────────────────────────────────────────────────
  async function load(){
    if(typeof sb==='undefined'||!sb) return;
    var res=await sb.from('remuneration').select('*').order('date',{ascending:false});
    if(res.error){ if(window.zyToast) zyToast('Load failed: '+res.error.message); return; }
    ALL=res.data||[];
    render(); updateMetrics();
  }

  // ── render ──────────────────────────────────────────────────
  function render(){
    var q=remQ.toLowerCase();
    var rows=ALL.filter(function(r){ return !q||(r.fee_type||'').toLowerCase().indexOf(q)>-1; });
    var tbody=document.getElementById('remBody');
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="4" style="padding:24px;color:var(--fg-3);">No entries found.</td></tr>';
      document.getElementById('remListCount').textContent='0 of '+ALL.length;
      return;
    }
    tbody.innerHTML='';
    rows.forEach(function(r){
      var tr=document.createElement('tr'); tr.className='clickable';
      tr.innerHTML=
        '<td>'+fmtDate(r.date)+'</td>'+
        '<td>'+(r.fee_type||'—')+'</td>'+
        '<td class="r">'+fmt(r.amount)+'</td>'+
        '<td class="r">'+sPill(r.status)+'</td>';
      tr.addEventListener('click',function(){ openEdit(r); });
      tbody.appendChild(tr);
    });
    document.getElementById('remListCount').textContent=rows.length+' of '+ALL.length;
  }

  // ── metrics ─────────────────────────────────────────────────
  function updateMetrics(){
    var total=0, paid=0, pending=0;
    ALL.forEach(function(r){
      var a=parseFloat(r.amount)||0;
      total+=a;
      if(r.status==='Paid') paid+=a; else pending++;
    });
    document.getElementById('remCount').textContent=ALL.length;
    document.getElementById('remTotal').textContent='RM '+fmt(total);
    document.getElementById('remPending').textContent=pending;
    document.getElementById('remPaid').textContent='RM '+fmt(paid);
  }

  // ── fee type combobox ────────────────────────────────────────
  function uniqueTypes(){ return [...new Set(ALL.map(function(x){return x.fee_type;}).filter(Boolean))].sort(); }

  function wireFeeTypeCombo(){
    var input=document.getElementById('rem-type');
    var list=document.getElementById('rem-type-list');
    if(!input||!list) return;
    function show(q){
      var vals=uniqueTypes();
      var filtered=vals.filter(function(v){ return !q||v.toLowerCase().indexOf(q.toLowerCase())>-1; });
      list.innerHTML='';
      if(!filtered.length){ list.classList.remove('open'); return; }
      filtered.forEach(function(v){
        var div=document.createElement('div'); div.className='rem-cb-opt'; div.textContent=v;
        div.addEventListener('mousedown',function(e){ e.preventDefault(); input.value=v; list.classList.remove('open'); });
        list.appendChild(div);
      });
      list.classList.add('open');
    }
    input.addEventListener('focus',function(){ show(this.value); });
    input.addEventListener('input',function(){ show(this.value); });
    input.addEventListener('blur',function(){ setTimeout(function(){ list.classList.remove('open'); },160); });
    input.addEventListener('keydown',function(e){ if(e.key==='Escape') list.classList.remove('open'); });
    document.addEventListener('click',function(e){
      var wrap=input.closest('.rem-cb-wrap');
      if(wrap&&!wrap.contains(e.target)) list.classList.remove('open');
    });
  }

  // ── open modal ───────────────────────────────────────────────
  function openEdit(r){
    remEditId=r?r.id:null;
    document.getElementById('remTitle').textContent=r?'Edit Entry':'Add Remuneration Entry';
    document.getElementById('rem-save').textContent=r?'Save Changes':'Save';
    document.getElementById('rem-delete').style.display=r?'inline-flex':'none';
    document.getElementById('rem-date').value=r?(r.date||''):new Date().toISOString().slice(0,10);
    document.getElementById('rem-type').value=r?(r.fee_type||''):'';
    document.getElementById('rem-amt').value=r?(r.amount||''):'';
    document.getElementById('rem-status').value=r?(r.status||'Pending'):'Pending';
    zyModalOpen('remModal');
  }

  document.getElementById('openRemModal').addEventListener('click',function(){ openEdit(null); });

  // ── save ─────────────────────────────────────────────────────
  document.getElementById('rem-save').addEventListener('click',async function(){
    var date=document.getElementById('rem-date').value;
    var feeType=document.getElementById('rem-type').value.trim();
    var amt=parseNum(document.getElementById('rem-amt').value);
    var status=document.getElementById('rem-status').value;
    if(!date){ if(window.zyToast) zyToast('Select a date'); return; }
    if(!feeType){ if(window.zyToast) zyToast('Enter a fee type'); return; }
    if(amt<=0){ if(window.zyToast) zyToast('Enter a valid amount'); return; }

    var payload={date:date, fee_type:feeType, amount:amt, status:status};
    var res=remEditId
      ? await sb.from('remuneration').update(payload).eq('id',remEditId)
      : await sb.from('remuneration').insert(payload);
    if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
    zyModalClose(); await load();
    if(window.zyToast) zyToast((remEditId?'Updated':'Added')+' — '+feeType);
  });

  // ── delete ────────────────────────────────────────────────────
  document.getElementById('rem-delete').addEventListener('click',async function(){
    if(!remEditId) return;
    var label=document.getElementById('rem-type').value||'this entry';
    if(!confirm('Delete "'+label+'"? This cannot be undone.')) return;
    var res=await sb.from('remuneration').delete().eq('id',remEditId);
    if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
    zyModalClose(); await load();
    if(window.zyToast) zyToast('Deleted — '+label);
  });

  // ── search ────────────────────────────────────────────────────
  document.getElementById('remSearch').addEventListener('input',function(){ remQ=this.value; render(); });

  // ── init ──────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded',function(){
    wireFeeTypeCombo();
    setTimeout(function(){ if(typeof sb!=='undefined'&&sb) load(); },600);
  });
})();
