/* ============================================================
   ZY-Invest · Fee Schedule — Admin logic
   Table: fee_schedule
   Columns: id, fy_id, type, basis, rate, hurdle_rate, notes
   FY filter: dropdown preset to current Active FY
   Table columns: Type | Financial Year | Basis | Rate | Hurdle Rate
   ============================================================ */
(function(){
  var ALL = [], FY_LIST = [];
  var selectedFY = '';   // fy_id of currently selected FY
  var editId = null;

  function fmt(n, dp){ var d = dp === undefined ? 4 : dp; return parseFloat(n||0).toLocaleString('en-MY', {minimumFractionDigits:d, maximumFractionDigits:d}); }
  function parseNum(s){ return parseFloat((s||'').toString().replace(/,/g,'')) || 0; }

  // ── pill helpers ─────────────────────────────────────────
  function typePill(t){
    return t === 'base'
      ? '<span class="fee-pill base">Base Fee</span>'
      : '<span class="fee-pill perf">Performance Fee</span>';
  }

  // ── load FY list ──────────────────────────────────────────
  async function loadFY(){
    if(typeof sb === 'undefined' || !sb) return;
    var res = await sb.from('fy_settings').select('*').order('start_date', {ascending: false});
    if(res.error || !res.data) return;
    FY_LIST = res.data;

    var sel = document.getElementById('fee-fy-filter');
    FY_LIST.forEach(function(fy){
      var o = document.createElement('option');
      o.value = fy.id; o.textContent = fy.label; sel.appendChild(o);
    });

    // Pre-select current Active FY
    var active = FY_LIST.filter(function(f){ return f.status === 'Active'; })[0];
    if(active){ sel.value = active.id; selectedFY = active.id; }
    else if(FY_LIST.length){ sel.value = FY_LIST[0].id; selectedFY = FY_LIST[0].id; }

    sel.addEventListener('change', function(){
      selectedFY = this.value;
      renderTable();
    });

    // Also populate modal FY dropdown
    populateModalFY();
  }

  function populateModalFY(){
    var sel = document.getElementById('fs-fy');
    // clear existing except placeholder
    while(sel.options.length > 1) sel.remove(1);
    FY_LIST.forEach(function(fy){
      var o = document.createElement('option');
      o.value = fy.id; o.textContent = fy.label; sel.appendChild(o);
    });
  }

  // ── load fee schedules ────────────────────────────────────
  async function load(){
    if(typeof sb === 'undefined' || !sb) return;
    var res = await sb.from('fee_schedule').select('*').order('type');
    if(res.error){ if(window.zyToast) zyToast('Load failed: ' + res.error.message); return; }
    ALL = res.data || [];
    renderTable();
  }

  // ── render table ─────────────────────────────────────────
  function renderTable(){
    var rows = ALL.filter(function(r){ return !selectedFY || r.fy_id === selectedFY; });
    var tbody = document.getElementById('feeBody');

    if(!rows.length){
      tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;color:var(--fg-3);">No fee schedules for this financial year.</td></tr>';
      document.getElementById('feeListCount').textContent = '0 records';
      return;
    }

    tbody.innerHTML = '';
    rows.forEach(function(r){
      var fy = FY_LIST.filter(function(f){ return f.id === r.fy_id; })[0];
      var fyLabel = fy ? fy.label : '—';
      var rate    = parseFloat(r.rate) || 0;
      var hurdle  = r.hurdle_rate != null ? fmt(parseFloat(r.hurdle_rate), 2) + '% p.a.' : '—';
      var basis   = r.basis || 'Daily';

      var tr = document.createElement('tr');
      tr.className = 'clickable';
      tr.innerHTML =
        '<td>' + typePill(r.type) + '</td>' +
        '<td><b>' + fyLabel + '</b></td>' +
        '<td>' + basis + '</td>' +
        '<td class="r"><b>' + fmt(rate, 2) + '% p.a.</b></td>' +
        '<td class="r">' + hurdle + '</td>';
      tr.addEventListener('click', function(){ openEdit(r); });
      tbody.appendChild(tr);
    });

    document.getElementById('feeListCount').textContent = rows.length + ' record' + (rows.length === 1 ? '' : 's');
  }

  // ── open modal ────────────────────────────────────────────
  function openEdit(r){
    editId = r ? r.id : null;
    document.getElementById('fsTitle').textContent = r ? 'Edit Fee Schedule' : 'Add Fee Schedule';
    document.getElementById('fs-confirm').textContent = r ? 'Save Changes' : 'Add Fee Schedule';
    document.getElementById('fs-delete').style.display = r ? 'inline-flex' : 'none';

    // Reset fields
    var typeSel = document.getElementById('fs-type');
    typeSel.value = r ? r.type : 'base';
    document.getElementById('fs-fy').value = r ? r.fy_id : (selectedFY || '');
    document.getElementById('fs-basis').value = r ? (r.basis || 'Daily') : 'Daily';
    document.getElementById('fs-rate').value = r ? fmt(r.rate, 2) : '';
    document.getElementById('fs-hurdle').value = r && r.hurdle_rate != null ? fmt(r.hurdle_rate, 2) : '';
    document.getElementById('fs-notes').value = r ? (r.notes || '') : '';

    toggleHurdle(typeSel.value);
    zyModalOpen('feeModal');
  }

  function toggleHurdle(type){
    var wrap = document.getElementById('fs-hurdle-wrap');
    wrap.style.display = type === 'performance' ? '' : 'none';
  }

  document.getElementById('fs-type').addEventListener('change', function(){
    toggleHurdle(this.value);
  });

  document.getElementById('openFeeModal').addEventListener('click', function(){
    openEdit(null);
  });

  // ── save ─────────────────────────────────────────────────
  document.getElementById('fs-confirm').addEventListener('click', async function(){
    var type   = document.getElementById('fs-type').value;
    var fyId   = document.getElementById('fs-fy').value;
    var basis  = document.getElementById('fs-basis').value;
    var rate   = parseNum(document.getElementById('fs-rate').value);
    var hurdle = type === 'performance' ? parseNum(document.getElementById('fs-hurdle').value) : null;
    var notes  = document.getElementById('fs-notes').value.trim() || null;

    if(!fyId)    { if(window.zyToast) zyToast('Select a financial year'); return; }
    if(rate <= 0){ if(window.zyToast) zyToast('Enter a valid rate'); return; }
    if(type === 'performance' && (!hurdle || hurdle <= 0)){
      if(window.zyToast) zyToast('Enter a hurdle rate for performance fee'); return;
    }

    var payload = { type: type, fy_id: fyId, basis: basis, rate: rate, hurdle_rate: hurdle, notes: notes };

    var btn = this; btn.disabled = true; btn.textContent = 'Saving…';
    try{
      var res = editId
        ? await sb.from('fee_schedule').update(payload).eq('id', editId)
        : await sb.from('fee_schedule').insert(payload);
      if(res.error) throw res.error;
      zyModalClose();
      await load();
      if(window.zyToast) zyToast((editId ? 'Updated' : 'Added') + ' — ' + (type === 'base' ? 'Base' : 'Performance') + ' Fee');
    }catch(ex){
      if(window.zyToast) zyToast('Error: ' + (ex.message || 'Unknown'));
    }
    btn.disabled = false;
    btn.textContent = editId ? 'Save Changes' : 'Add Fee Schedule';
  });

  // ── delete ────────────────────────────────────────────────
  document.getElementById('fs-delete').addEventListener('click', async function(){
    if(!editId) return;
    var type = document.getElementById('fs-type').value;
    if(!confirm('Delete this ' + type + ' fee schedule? This cannot be undone.')) return;
    var res = await sb.from('fee_schedule').delete().eq('id', editId);
    if(res.error){ if(window.zyToast) zyToast('Error: ' + res.error.message); return; }
    zyModalClose();
    await load();
    if(window.zyToast) zyToast('Deleted — ' + (type === 'base' ? 'Base' : 'Performance') + ' Fee');
  });

  // ── init ─────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', function(){
    setTimeout(async function(){
      if(typeof sb === 'undefined' || !sb) return;
      await loadFY();
      await load();
    }, 600);
  });
})();
