/* ============================================================
   ZY-Invest · Others Transaction — Admin logic
   Reads/writes transaction_others + fy_settings tables
   ============================================================ */
(function(){
  var ALL = [], FY_LIST = [];
  var otQ = '', otFY = '', otDir = '', otEditId = null;

  function fmt(n){ return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function parseNum(s){ return parseFloat((s||'').toString().replace(/,/g,''))||0; }
  function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }

  function dirTag(d){
    return d==='Inflow'
      ? '<span class="tag-green">Inflow</span>'
      : '<span class="tag-red">Outflow</span>';
  }

  // ── FY date filter helper ──
  function inFY(r){
    if(!otFY) return true;
    var fy = FY_LIST.filter(function(f){ return f.id===otFY; })[0];
    if(!fy) return true;
    return r.date >= fy.start_date && r.date <= fy.end_date;
  }

  function filtered(){
    return ALL.filter(function(r){
      if(otDir && r.direction !== otDir) return false;
      if(otFY && !inFY(r)) return false;
      if(otQ && (r.description+' '+r.category).toLowerCase().indexOf(otQ) === -1) return false;
      return true;
    });
  }

  // ── load FY dropdown ──
  async function loadFY(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('fy_settings').select('*').order('start_date',{ascending:false});
    if(res.error||!res.data) return;
    FY_LIST = res.data;
    var sel = document.getElementById('ot-fy');
    FY_LIST.forEach(function(fy){
      var o = document.createElement('option'); o.value=fy.id; o.textContent=fy.label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function(){ otFY=this.value; renderTable(); updateMetrics(); });
  }

  // ── load records ──
  async function load(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('transaction_others').select('*').order('date',{ascending:false});
    if(res.error){ if(window.zyToast) zyToast('Load failed: '+res.error.message); return; }
    ALL = res.data||[];
    renderTable();
    updateMetrics();
  }

  // ── render table ──
  function renderTable(){
    var rows = filtered();
    var tbody = document.getElementById('otBody');
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="5" style="padding:24px;color:var(--fg-3);">No transactions match.</td></tr>';
      document.getElementById('otListCount').textContent='0 of '+ALL.length;
      return;
    }
    tbody.innerHTML='';
    rows.forEach(function(r){
      var tr = document.createElement('tr'); tr.className='clickable';
      tr.innerHTML=
        '<td>'+fmtDate(r.date)+'</td>'+
        '<td>'+(r.category||'—')+'</td>'+
        '<td class="td-sub">'+(r.description||'—')+'</td>'+
        '<td class="r">'+fmt(r.amount)+'</td>'+
        '<td>'+dirTag(r.direction)+'</td>';
      tr.addEventListener('click', function(){ openEdit(r); });
      tbody.appendChild(tr);
    });
    document.getElementById('otListCount').textContent=rows.length+' of '+ALL.length;
  }

  // ── update metrics from FY-filtered data ──
  function updateMetrics(){
    var fyRows = ALL.filter(inFY);
    var outflow=0, inflow=0;
    fyRows.forEach(function(r){
      if(r.direction==='Outflow') outflow+=parseFloat(r.amount)||0;
      else inflow+=parseFloat(r.amount)||0;
    });
    var net = inflow - outflow;
    document.getElementById('otCount').textContent=fyRows.length;
    document.getElementById('otOutflow').textContent='RM '+fmt(outflow);
    document.getElementById('otInflow').textContent='RM '+fmt(inflow);
    var netEl=document.getElementById('otNet');
    netEl.textContent=(net>=0?'RM ':'−RM ')+fmt(Math.abs(net));
    netEl.style.color=net>=0?'var(--green)':'var(--red)';
  }

  // ── open modal ──
  function openEdit(r){
    otEditId = r ? r.id : null;
    document.getElementById('otTitle').textContent = r ? 'Edit Transaction' : 'Add Other Transaction';
    document.getElementById('ot-date').value  = r ? r.date : new Date().toISOString().slice(0,10);
    document.getElementById('ot-cat').value   = r ? r.category : 'Management Fee';
    document.getElementById('ot-desc').value  = r ? (r.description||'') : '';
    document.getElementById('ot-amt').value   = r ? r.amount : '';
    document.getElementById('ot-dir').value   = r ? r.direction : 'Outflow';
    document.getElementById('ot-save').textContent = r ? 'Save Changes' : 'Add Transaction';
    document.getElementById('ot-delete').style.display = r ? 'inline-flex' : 'none';
    zyModalOpen('otModal');
  }

  document.getElementById('openOtModal').addEventListener('click', function(){ openEdit(null); });

  // ── save ──
  document.getElementById('ot-save').addEventListener('click', async function(){
    var date  = document.getElementById('ot-date').value;
    var cat   = document.getElementById('ot-cat').value;
    var desc  = document.getElementById('ot-desc').value.trim();
    var amt   = parseNum(document.getElementById('ot-amt').value);
    var dir   = document.getElementById('ot-dir').value;
    if(!date){ if(window.zyToast) zyToast('Select a date'); return; }
    if(amt<=0){ if(window.zyToast) zyToast('Enter a valid amount'); return; }
    var payload = {date:date, category:cat, description:desc||null, amount:amt, direction:dir};
    var res;
    if(otEditId){
      res = await sb.from('transaction_others').update(payload).eq('id',otEditId);
    } else {
      res = await sb.from('transaction_others').insert(payload);
    }
    if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
    zyModalClose();
    await load();
    if(window.zyToast) zyToast((otEditId?'Updated':'Added')+' — '+cat);
  });

  // ── delete ──
  document.getElementById('ot-delete').addEventListener('click', async function(){
    if(!otEditId) return;
    var cat = document.getElementById('ot-cat').value;
    if(!confirm('Delete this transaction? This cannot be undone.')) return;
    var res = await sb.from('transaction_others').delete().eq('id',otEditId);
    if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
    zyModalClose();
    await load();
    if(window.zyToast) zyToast('Deleted — '+cat);
  });

  // ── search & filters ──
  document.getElementById('ot-search').addEventListener('input', function(){ otQ=this.value.toLowerCase(); renderTable(); });
  document.querySelectorAll('.filter-bar .chip').forEach(function(c){
    c.addEventListener('click',function(){
      document.querySelectorAll('.filter-bar .chip').forEach(function(x){x.classList.remove('active');});
      c.classList.add('active'); otDir=c.dataset.dir||''; renderTable(); updateMetrics();
    });
  });

  // ── init ──
  window.addEventListener('DOMContentLoaded',function(){
    document.getElementById('ot-date').value = new Date().toISOString().slice(0,10);
    setTimeout(function(){
      if(typeof sb!=='undefined'&&sb){ loadFY(); load(); }
    }, 600);
  });
})();
