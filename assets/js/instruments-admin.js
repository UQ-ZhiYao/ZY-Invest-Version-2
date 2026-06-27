/* ============================================================
   ZY-Invest · Instruments — Admin logic
   ============================================================ */
(function(){
  var ALL = [], inFilter = '', inEditId = null;

  // ── product type colours from DB ─────────────────────────
  var PRODUCT_TYPES = {};
  async function loadProductTypes(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('product_types').select('name,color,bg_color');
    if(!res.error && res.data){
      res.data.forEach(function(p){ PRODUCT_TYPES[p.name]={color:p.color,bg:p.bg_color}; });
    }
  }
  function prodPill(p){
    var pt=PRODUCT_TYPES[p];
    if(pt) return '<span style="display:inline-block;padding:2px 9px;border-radius:99px;font-size:0.75rem;font-weight:500;white-space:nowrap;letter-spacing:0.01em;background:'+pt.bg+';color:'+pt.color+'">'+p+'</span>';
    return '<span class="prod-pill">'+p+'</span>';
  }
  function resetProdMap(){}

  // ── load from Supabase ───────────────────────────────────
  async function load(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('instruments').select('*').order('name');
    if(res.error){ if(window.zyToast) zyToast('Load failed: '+res.error.message); return; }
    ALL = res.data||[];
    // Populate filter dropdown from unique product values in DB
    var sel = document.getElementById('inProdFilter');
    var currentVal = sel.value;
    var unique = [...new Set(ALL.map(function(x){ return x.product; }).filter(Boolean))].sort();
    // Remove all options except "All Products"
    while(sel.options.length > 1) sel.remove(1);
    unique.forEach(function(p){
      var o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o);
    });
    if(currentVal) sel.value = currentVal;
    render();
  }

  // ── render table ─────────────────────────────────────────
  function render(){
    resetProdMap(); // reassign colours fresh each render for consistency
    var q = (document.getElementById('inSearch').value||'').toLowerCase();
    var list = ALL.filter(function(x){
      return (!inFilter || x.product===inFilter) &&
             (!q || (x.name+' '+(x.ticker||'')).toLowerCase().indexOf(q) > -1);
    });

    var tbody = document.getElementById('inBody');
    tbody.innerHTML='';
    if(!list.length){
      tbody.innerHTML='<tr><td colspan="5" style="padding:24px;color:var(--fg-3);">No instruments found.</td></tr>';
    } else {
      list.forEach(function(x){
        var tr=document.createElement('tr'); tr.className='clickable';
        tr.innerHTML=
          '<td class="hold-name"><b>'+x.name+'</b>'+(function(){ var tk=(x.ticker||'').trim(),co=(x.code||'').trim(); var sub=tk&&co&&tk!==co?tk+' | '+co:(tk||co||''); return sub?'<span>'+sub+'</span>':''; })()+'</td>'+
          '<td>'+prodPill(x.product)+'</td>'+
          '<td class="td-sub">'+(x.ticker||'—')+'</td>'+
          '<td class="td-sub">'+(x.code||'—')+'</td>'+
          '<td class="td-sub">'+(x.sector||'—')+'</td>'+
          '<td>'+(x.currency||x.ccy||'MYR')+'</td>';
        tr.addEventListener('click', function(){ openEdit(x); });
        tbody.appendChild(tr);
      });
    }

    document.getElementById('inListCount').textContent=list.length+' of '+ALL.length;
    document.getElementById('inCount').textContent=ALL.length;
    document.getElementById('inSec').textContent=ALL.filter(function(x){return x.product==='Securities';}).length;
    document.getElementById('inAlt').textContent=ALL.filter(function(x){
      return ['Private Equity','Collectibles','Derivatives'].indexOf(x.product)>-1;
    }).length;
    document.getElementById('inCash').textContent=ALL.filter(function(x){
      return ['Cash Funds','Cash on Hand'].indexOf(x.product)>-1;
    }).length;
  }

  // ── open add/edit modal ──────────────────────────────────
  function openEdit(x){
    inEditId = x ? x.id : null;
    document.getElementById('instTitle').textContent = x ? 'Edit Instrument' : 'Add Instrument';
    document.getElementById('in-name').value    = x ? x.name   : '';
    document.getElementById('in-ticker').value  = x ? (x.ticker||'') : '';
    document.getElementById('in-code').value    = x ? (x.code||'')   : '';
    document.getElementById('in-product').value = x ? (x.product||'Securities') : '';
    document.getElementById('in-sector').value  = x ? (x.sector||'')  : '';
    document.getElementById('in-ccy').value     = x ? (x.currency||x.ccy||'MYR') : 'MYR';
    document.getElementById('in-delete').style.display = x ? 'inline-flex' : 'none';
    zyModalOpen('instModal');
  }

  document.getElementById('openInstModal').addEventListener('click', function(){ openEdit(null); });

  // ── save ─────────────────────────────────────────────────
  document.getElementById('in-save').addEventListener('click', async function(){
    var name     = document.getElementById('in-name').value.trim();
    var ticker   = document.getElementById('in-ticker').value.trim()||null;
    var product  = document.getElementById('in-product').value;
    var sector   = document.getElementById('in-sector').value;
    var currency = document.getElementById('in-ccy').value;
    if(!name){ if(window.zyToast) zyToast('Enter instrument name'); return; }
    var code     = document.getElementById('in-code').value.trim()||null;
    var payload = {name:name, ticker:ticker, code:code, product:product, sector:sector, currency:currency};
    var res = inEditId
      ? await sb.from('instruments').update(payload).eq('id',inEditId)
      : await sb.from('instruments').insert(payload);
    if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
    zyModalClose();
    await load();
    if(window.zyToast) zyToast((inEditId?'Updated':'Added')+' — '+name);
  });

  // ── delete ────────────────────────────────────────────────
  document.getElementById('in-delete').addEventListener('click', async function(){
    if(!inEditId) return;
    var name = document.getElementById('in-name').value;
    if(!confirm('Delete "'+name+'"? This cannot be undone.')) return;
    var res = await sb.from('instruments').delete().eq('id',inEditId);
    if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
    zyModalClose();
    await load();
    if(window.zyToast) zyToast('Deleted — '+name);
  });

  // ── search + product dropdown filter ─────────────────────
  document.getElementById('inSearch').addEventListener('input', render);
  document.getElementById('inProdFilter').addEventListener('change', function(){
    inFilter = this.value; render();
  });

  // ── product/sector combobox helpers ──────────────────────
  function makeCombo(inputId, listId, getValues){
    var input = document.getElementById(inputId);
    var list  = document.getElementById(listId);
    if(!input || !list) return;

    function show(q){
      var vals = getValues();
      var filtered = vals.filter(function(v){ return !q || v.toLowerCase().indexOf(q.toLowerCase()) > -1; });
      list.innerHTML = '';
      if(!filtered.length){ list.classList.remove('open'); return; }
      filtered.forEach(function(v){
        var div = document.createElement('div'); div.className = 'cb-opt'; div.textContent = v;
        div.addEventListener('mousedown', function(e){ e.preventDefault(); input.value = v; list.classList.remove('open'); });
        list.appendChild(div);
      });
      list.classList.add('open');
    }

    input.addEventListener('focus', function(){ show(this.value); });
    input.addEventListener('input', function(){ show(this.value); });
    input.addEventListener('blur',  function(){ setTimeout(function(){ list.classList.remove('open'); }, 150); });
  }

  function uniqueProducts(){ return [...new Set(ALL.map(function(x){ return x.product; }).filter(Boolean))].sort(); }
  function uniqueSectors(){  return [...new Set(ALL.map(function(x){ return x.sector; }).filter(Boolean))].sort(); }

  makeCombo('in-product', 'cb-product-list', uniqueProducts);
  makeCombo('in-sector',  'cb-sector-list',  uniqueSectors);

  // ── init ─────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded',function(){
    setTimeout(function(){ if(typeof sb!=='undefined'&&sb){ loadProductTypes(); load(); } }, 600);
  });
})();
