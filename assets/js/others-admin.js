/* ============================================================
   ZY-Invest · Others Transaction — Admin logic
   - No direction field
   - Category: combobox from unique DB values + free type
   - Amount: colour pill (green = positive, red = negative)
   - FY filter from fy_settings
   ============================================================ */
(function(){
  var ALL=[], FY_LIST=[];
  var otQ='', otFY='', otEditId=null;

  function fmt(n){ return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function parseNum(s){ return parseFloat((s||'').toString().replace(/,/g,''))||0; }
  function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }

  // Amount pill — positive green, negative red
  function amtPill(v){
    var n = parseFloat(v)||0;
    if(n < 0) return '<span class="amt-pill-neg">'+fmt(n)+'</span>';
    return '<span class="amt-pill-pos">'+fmt(n)+'</span>';
  }

  // ── FY filter ──────────────────────────────────────────────
  function inFY(r){
    if(!otFY) return true;
    var fy=FY_LIST.filter(function(f){return f.id===otFY;})[0];
    if(!fy) return true;
    return r.date>=fy.start_date&&r.date<=fy.end_date;
  }
  function filtered(){
    return ALL.filter(function(r){
      if(otFY&&!inFY(r)) return false;
      if(otQ&&(r.description+' '+r.category).toLowerCase().indexOf(otQ)===-1) return false;
      return true;
    });
  }

  async function loadFY(){
    if(typeof sb==='undefined'||!sb) return;
    var res=await sb.from('fy_settings').select('*').order('start_date',{ascending:false});
    if(res.error||!res.data) return;
    FY_LIST=res.data;
    var sel=document.getElementById('ot-fy');
    FY_LIST.forEach(function(fy){
      var o=document.createElement('option'); o.value=fy.id; o.textContent=fy.label; sel.appendChild(o);
    });
    sel.addEventListener('change',function(){ otFY=this.value; renderTable(); updateMetrics(); });
  }

  async function load(){
    if(typeof sb==='undefined'||!sb) return;
    var res=await sb.from('transaction_others').select('*').order('date',{ascending:false});
    if(res.error){ if(window.zyToast) zyToast('Load failed: '+res.error.message); return; }
    ALL=res.data||[];
    renderTable(); updateMetrics();
  }

  // ── render table ───────────────────────────────────────────
  function renderTable(){
    var rows=filtered(), tbody=document.getElementById('otBody');
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="4" style="padding:24px;color:var(--fg-3);">No transactions match.</td></tr>';
      document.getElementById('otListCount').textContent='0 of '+ALL.length;
      return;
    }
    tbody.innerHTML='';
    rows.forEach(function(r){
      var tr=document.createElement('tr'); tr.className='clickable';
      tr.innerHTML=
        '<td>'+fmtDate(r.date)+'</td>'+
        '<td>'+(r.category||'—')+'</td>'+
        '<td class="td-sub">'+(r.description||'—')+'</td>'+
        '<td class="r">'+amtPill(r.amount)+'</td>';
      tr.addEventListener('click',function(){ openEdit(r); });
      tbody.appendChild(tr);
    });
    document.getElementById('otListCount').textContent=rows.length+' of '+ALL.length;
  }

  // ── update metrics ─────────────────────────────────────────
  function updateMetrics(){
    var fyRows=ALL.filter(inFY);
    var total=0, maxAmt=0, maxCat='—';
    var cats={};
    fyRows.forEach(function(r){
      var a=Math.abs(parseFloat(r.amount)||0);
      total+=parseFloat(r.amount)||0;
      if(a>maxAmt){ maxAmt=a; maxCat=r.category||'—'; }
      if(r.category) cats[r.category]=(cats[r.category]||0)+1;
    });
    document.getElementById('otCount').textContent=fyRows.length;
    document.getElementById('otTotal').textContent=(total<0?'−':'')+'RM '+fmt(Math.abs(total));
    document.getElementById('otTotal').style.color=total<0?'var(--red)':'var(--green)';
    document.getElementById('otMax').textContent='RM '+fmt(maxAmt);
    document.getElementById('otMaxCat').textContent=maxCat;
    document.getElementById('otCatCount').textContent=Object.keys(cats).length;
  }

  // ── category combobox ──────────────────────────────────────
  function uniqueCategories(){
    return [...new Set(ALL.map(function(x){return x.category;}).filter(Boolean))].sort();
  }

  function wireCategoryCombo(){
    var input=document.getElementById('ot-cat');
    var list=document.getElementById('ot-cat-list');
    if(!input||!list) return;

    function showList(q){
      var vals=uniqueCategories();
      var filtered=vals.filter(function(v){ return !q||v.toLowerCase().indexOf(q.toLowerCase())>-1; });
      list.innerHTML='';
      if(!filtered.length){ list.classList.remove('open'); return; }
      filtered.forEach(function(v){
        var div=document.createElement('div'); div.className='ot-cb-opt'; div.textContent=v;
        div.addEventListener('mousedown',function(e){ e.preventDefault(); input.value=v; list.classList.remove('open'); });
        list.appendChild(div);
      });
      list.classList.add('open');
    }

    input.addEventListener('focus', function(){ showList(this.value); });
    input.addEventListener('input', function(){ showList(this.value); });
    input.addEventListener('blur',  function(){ setTimeout(function(){ list.classList.remove('open'); },160); });
    input.addEventListener('keydown',function(e){ if(e.key==='Escape') list.classList.remove('open'); });
    document.addEventListener('click',function(e){
      var wrap=document.getElementById('ot-cat')&&document.getElementById('ot-cat').closest('.ot-cb-wrap');
      if(wrap&&!wrap.contains(e.target)) list.classList.remove('open');
    });
  }

  // ── open modal ─────────────────────────────────────────────
  function openEdit(r){
    otEditId=r?r.id:null;
    document.getElementById('otTitle').textContent=r?'Edit Transaction':'Add Other Transaction';
    document.getElementById('ot-save').textContent=r?'Save Changes':'Add Transaction';
    document.getElementById('ot-delete').style.display=r?'inline-flex':'none';
    document.getElementById('ot-date').value=r?r.date:new Date().toISOString().slice(0,10);
    document.getElementById('ot-cat').value=r?(r.category||''):'';
    document.getElementById('ot-desc').value=r?(r.description||''):'';
    document.getElementById('ot-amt').value=r?r.amount:'';
    zyModalOpen('otModal');
  }

  document.getElementById('openOtModal').addEventListener('click',function(){ openEdit(null); });

  // ── save ───────────────────────────────────────────────────
  document.getElementById('ot-save').addEventListener('click',async function(){
    var date=document.getElementById('ot-date').value;
    var cat=document.getElementById('ot-cat').value.trim();
    var desc=document.getElementById('ot-desc').value.trim();
    var amt=parseNum(document.getElementById('ot-amt').value);
    if(!date){ if(window.zyToast) zyToast('Select a date'); return; }
    if(!cat){  if(window.zyToast) zyToast('Enter a category'); return; }
    if(amt===0){ if(window.zyToast) zyToast('Enter a valid amount'); return; }

    var payload={date:date, category:cat, description:desc||null, amount:amt};
    var res=otEditId
      ? await sb.from('transaction_others').update(payload).eq('id',otEditId)
      : await sb.from('transaction_others').insert(payload);
    if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
    zyModalClose(); await load();
    if(window.zyToast) zyToast((otEditId?'Updated':'Added')+' — '+cat);
  });

  // ── delete ─────────────────────────────────────────────────
  document.getElementById('ot-delete').addEventListener('click',async function(){
    if(!otEditId) return;
    var cat=document.getElementById('ot-cat').value||'this entry';
    if(!confirm('Delete "'+cat+'"? This cannot be undone.')) return;
    var res=await sb.from('transaction_others').delete().eq('id',otEditId);
    if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
    zyModalClose(); await load();
    if(window.zyToast) zyToast('Deleted — '+cat);
  });

  // ── search ─────────────────────────────────────────────────
  document.getElementById('ot-search').addEventListener('input',function(){ otQ=this.value.toLowerCase(); renderTable(); });

  // ── init ───────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded',function(){
    document.getElementById('ot-date').value=new Date().toISOString().slice(0,10);
    wireCategoryCombo();
    setTimeout(function(){ if(typeof sb!=='undefined'&&sb){ loadFY(); load(); } },600);
  });
})();
