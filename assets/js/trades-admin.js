/* ============================================================
   ZY-Invest · Trade Transactions — Admin logic
   - Native <select> for instrument (keyboard-jumpable)
   - Multi-lot rows (units + price per lot)
   - Single-column modal layout
   ============================================================ */
(function(){
  var ALL_TX=[], INSTRUMENTS=[], FY_LIST=[];
  var ttFilter='', ttQ='', ttFY='';
  var tradeAction='Buy';

  function fmt(n,dp){ return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:dp===undefined?2:dp,maximumFractionDigits:dp===undefined?2:dp}); }
  function parseNum(s){ return parseFloat((s||'').toString().replace(/,/g,''))||0; }
  function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }
  function tag(a){ return a==='Buy'?'<span class="tag-green">Buy</span>':'<span class="tag-red">Sell</span>'; }
  function prodPill(p){ return '<span class="tag-blue">'+(p||'Securities')+'</span>'; }

  // ── default date ──────────────────────────────────────────
  var trDateEl = document.getElementById('tr-date');
  if(trDateEl) trDateEl.value = new Date().toISOString().slice(0,10);

  // ── custom instrument dropdown ────────────────────────────
  var instDdOpen = false;
  var instDdFilter = '';

  function renderInstOptions(){
    var wrap = document.getElementById('tr-inst-options');
    if(!wrap) return;
    var q = instDdFilter.toLowerCase();
    var matches = INSTRUMENTS.filter(function(x){
      return !q || x.name.toLowerCase().indexOf(q) > -1
                || (x.ticker||'').toLowerCase().indexOf(q) > -1
                || (x.code||'').toLowerCase().indexOf(q) > -1;
    });
    wrap.innerHTML = '';
    if(!matches.length){
      wrap.innerHTML = '<div class="inst-dd-empty">No instruments found</div>';
      return;
    }
    matches.forEach(function(x){
      var div = document.createElement('div');
      div.className = 'inst-dd-option';
      var codeStr = [x.ticker, x.code].filter(Boolean).join(' · ');
      div.innerHTML = '<span class="inst-opt-name">' + x.name + '</span>'
                    + (codeStr ? '<span class="inst-opt-code">' + codeStr + '</span>' : '');
      div.addEventListener('mousedown', function(e){
        e.preventDefault();
        selectInst(x);
      });
      wrap.appendChild(div);
    });
  }

  function selectInst(x){
    document.getElementById('tr-inst-sel').value = x.name;
    document.getElementById('tr-inst-label').textContent = x.name;
    document.getElementById('tr-inst-label').classList.remove('inst-placeholder');
    var codeStr = [x.ticker, x.code].filter(Boolean).join(' · ');
    if(codeStr){
      document.getElementById('tr-inst-label').textContent = x.name;
    }
    closeInstDd();
  }

  function openInstDd(){
    document.getElementById('tr-inst-list').classList.add('open');
    instDdFilter = '';
    document.getElementById('tr-inst-search').value = '';
    renderInstOptions();
    setTimeout(function(){ document.getElementById('tr-inst-search').focus(); }, 50);
    instDdOpen = true;
  }

  function closeInstDd(){
    document.getElementById('tr-inst-list').classList.remove('open');
    instDdOpen = false;
  }

  function populateInstSelect(){
    renderInstOptions(); // initial render
    var display = document.getElementById('tr-inst-display');
    var search  = document.getElementById('tr-inst-search');
    var listEl  = document.getElementById('tr-inst-list');
    if(!display) return;
    display.addEventListener('click', function(){ instDdOpen ? closeInstDd() : openInstDd(); });
    display.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openInstDd(); } });
    if(search){
      search.addEventListener('input', function(){ instDdFilter = this.value; renderInstOptions(); });
      search.addEventListener('keydown', function(e){
        if(e.key==='Escape'){ closeInstDd(); display.focus(); }
      });
    }
    document.addEventListener('click', function(e){
      var wrap = document.getElementById('tr-inst-wrap');
      if(wrap && !wrap.contains(e.target)) closeInstDd();
    });
  }

  // ── multi-lot rows ────────────────────────────────────────
  var ordersWrap = document.getElementById('tr-orders');

  function addLotRow(units, price){
    var row = document.createElement('div'); row.className = 'lot-row';
    row.innerHTML =
      '<div class="field" style="margin:0;"><label>Units / Qty</label><input type="text" class="ord-units" placeholder="1,000" value="'+(units||'')+'"></div>'+
      '<div class="field" style="margin:0;"><label>Price (RM)</label><input type="text" class="ord-price" placeholder="4.32" value="'+(price||'')+'"></div>'+
      '<button type="button" class="lot-del" title="Remove lot">✕</button>';
    row.querySelector('.lot-del').addEventListener('click', function(){
      if(ordersWrap.children.length > 1){ row.remove(); updateConsideration(); }
    });
    row.querySelector('.ord-units').addEventListener('input', updateConsideration);
    row.querySelector('.ord-price').addEventListener('input', updateConsideration);
    ordersWrap.appendChild(row);
  }

  document.getElementById('tr-add-order').addEventListener('click', function(){ addLotRow(); });

  function getLots(){
    var lots = [];
    ordersWrap.querySelectorAll('.lot-row').forEach(function(row){
      var u = parseNum(row.querySelector('.ord-units').value);
      var p = parseNum(row.querySelector('.ord-price').value);
      if(u > 0 && p > 0) lots.push({units:u, price:p});
    });
    return lots;
  }

  function updateConsideration(){
    var lots = getLots();
    var f = parseNum(document.getElementById('tr-fee').value);
    var totalUnits = 0, totalAmt = 0;
    lots.forEach(function(o){ totalUnits += o.units; totalAmt += o.units * o.price; });
    var cons = tradeAction === 'Buy' ? totalAmt + f : totalAmt - f;
    document.getElementById('tr-cons').textContent = totalUnits > 0 ? 'MYR ' + fmt(cons) : 'MYR —';
    var vwap = totalUnits > 0 ? totalAmt / totalUnits : 0;
    document.getElementById('tr-vwap').textContent = totalUnits > 0 ? 'VWAP: RM ' + fmt(vwap, 4) : '';
  }

  document.getElementById('tr-fee').addEventListener('input', updateConsideration);

  // ── FY dropdown ───────────────────────────────────────────
  async function loadFY(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('fy_settings').select('*').order('start_date',{ascending:false});
    if(res.error||!res.data) return;
    FY_LIST = res.data;
    var sel = document.getElementById('tt-fy');
    FY_LIST.forEach(function(fy){
      var o = document.createElement('option'); o.value = fy.id; o.textContent = fy.label; sel.appendChild(o);
    });
    sel.addEventListener('change', function(){ ttFY = this.value; renderTable(); updateMetrics(); });
  }

  // ── load instruments ──────────────────────────────────────
  async function loadInstruments(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('instruments').select('id,name,ticker,code,product,sector').order('name');
    if(res.error||!res.data) return;
    INSTRUMENTS = res.data;
    populateInstSelect();
  }

  // ── load trades ───────────────────────────────────────────
  async function loadTrades(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('transaction_trading').select('*').order('trade_date',{ascending:false});
    if(res.error){ if(window.zyToast) zyToast('Load failed: '+res.error.message); return; }
    ALL_TX = res.data||[];
    renderTable(); updateMetrics();
  }

  function inFY(r){
    if(!ttFY) return true;
    var fy = FY_LIST.filter(function(f){ return f.id===ttFY; })[0];
    if(!fy) return true;
    return r.trade_date >= fy.start_date && r.trade_date <= fy.end_date;
  }

  function filtered(){
    return ALL_TX.filter(function(r){
      if(ttFilter && r.action !== ttFilter) return false;
      if(ttQ && (r.instrument_name+' '+(r.ticker||'')+' '+(r.code||'')).toLowerCase().indexOf(ttQ) === -1) return false;
      if(ttFY && !inFY(r)) return false;
      return true;
    });
  }

  function renderTable(){
    var rows = filtered(), tbody = document.getElementById('ttBody');
    if(!rows.length){
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:26px;color:var(--fg-3);">No trades match.</td></tr>';
      document.getElementById('ttListCount').textContent = '0 of '+ALL_TX.length;
      return;
    }
    tbody.innerHTML = '';
    rows.forEach(function(r){
      var isBuy = r.action === 'Buy';
      var value = (r.units||0) * (r.price||0);
      var flow = (isBuy ? '−' : '+') + fmt(value);
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>'+fmtDate(r.trade_date)+'</td>'+
        '<td>'+tag(r.action)+'</td>'+
        '<td class="hold-name"><b>'+(r.instrument_name||'—')+'</b><span>'+(r.ticker||'—')+'</span></td>'+
        '<td>'+prodPill(r.product)+'</td>'+
        '<td class="r">'+fmt(r.units,0)+'</td>'+
        '<td class="r">'+fmt(r.price,4)+'</td>'+
        '<td class="r">'+(r.fee ? fmt(r.fee) : '—')+'</td>'+
        '<td class="r '+(isBuy?'cf-out':'cf-in')+'">'+flow+'</td>';
      tbody.appendChild(tr);
    });
    document.getElementById('ttListCount').textContent = rows.length+' of '+ALL_TX.length;
  }

  function updateMetrics(){
    var allInFY = ALL_TX.filter(inFY);
    var totalTrades=allInFY.length, buys=0, sells=0, totalAmt=0, totalUnits=0, totalFees=0, buyAmt=0;
    allInFY.forEach(function(r){
      if(r.action==='Buy') buys++; else sells++;
      var v=(r.units||0)*(r.price||0);
      totalAmt+=v; totalUnits+=parseFloat(r.units)||0; totalFees+=parseFloat(r.fee)||0;
      if(r.action==='Buy') buyAmt+=v;
    });
    var ratio = buyAmt > 0 ? fmt(totalAmt/buyAmt,2) : '—';
    var density = totalUnits > 0 ? fmt(totalAmt/totalUnits,4) : '—';
    document.getElementById('ttCount').textContent = totalTrades;
    document.getElementById('ttBuySell').textContent = buys+' : '+sells;
    document.getElementById('ttTurnover').textContent = 'RM '+fmt(totalAmt,0);
    document.getElementById('ttRatio').textContent = ratio;
    document.getElementById('ttTurnoverUnits').textContent = fmt(totalUnits,0);
    document.getElementById('ttDensity').textContent = density;
    document.getElementById('ttFees').textContent = 'RM '+fmt(totalFees);
  }

  // ── trade action toggle ───────────────────────────────────
  function setAction(a){
    tradeAction = a;
    document.querySelector('.tt-buy').classList.toggle('active', a==='Buy');
    document.querySelector('.tt-sell').classList.toggle('active', a==='Sell');
    var cf = document.getElementById('tr-confirm');
    cf.textContent = 'Confirm '+a;
    cf.className = 'btn-fill btn-sm '+(a==='Buy'?'buy':'sell');
    updateConsideration();
  }

  document.querySelectorAll('.trade-toggle button').forEach(function(b){
    b.addEventListener('click', function(){ setAction(b.dataset.act); });
  });

  // ── open trade modal ──────────────────────────────────────
  document.getElementById('btnTrade').addEventListener('click', function(){
    document.getElementById('tr-inst-sel').value = '';
    var search = document.getElementById('tr-inst-search');
    if(search){ search.value = ''; }
    var list = document.getElementById('tr-inst-list');
    if(list){ list.classList.remove('open'); }
    ordersWrap.innerHTML = ''; addLotRow();
    document.getElementById('tr-fee').value = '';
    document.getElementById('tr-date').value = new Date().toISOString().slice(0,10);
    setAction('Buy');
    updateConsideration();
    zyModalOpen('tradeModal');
  });

  // ── confirm & save ────────────────────────────────────────
  document.getElementById('tr-confirm').addEventListener('click', async function(){
    var instName = document.getElementById('tr-inst-sel').value;
    var date = document.getElementById('tr-date').value;
    var fee = parseNum(document.getElementById('tr-fee').value)||0;
    var lots = getLots();

    if(!instName){ if(window.zyToast) zyToast('Select an instrument'); return; }
    if(!lots.length){ if(window.zyToast) zyToast('Enter at least one units + price row'); return; }
    if(!date){ if(window.zyToast) zyToast('Select a trade date'); return; }

    var inst = INSTRUMENTS.filter(function(x){ return x.name===instName; })[0]||{};
    var btn = document.getElementById('tr-confirm'); btn.disabled=true; btn.textContent='Saving…';

    try{
      var rows = lots.map(function(o, i){
        return {
          action: tradeAction,
          instrument_name: instName,
          ticker: inst.ticker||null,
          code: inst.code||null,
          product: inst.product||'Securities',
          sector: inst.sector||null,
          trade_date: date,
          units: o.units,
          price: o.price,
          fee: lots.length===1 ? fee : (i===0 ? fee : 0)
        };
      });

      var res = await sb.from('transaction_trading').insert(rows);
      if(res.error) throw res.error;

      await loadTrades();
      zyModalClose();
      var totalUnits = lots.reduce(function(s,o){ return s+o.units; }, 0);
      if(window.zyToast) zyToast(tradeAction+' '+fmt(totalUnits,0)+' '+instName+(lots.length>1?' ('+lots.length+' lots)':''));
    }catch(ex){
      if(window.zyToast) zyToast('Error: '+((ex&&ex.message)||'Unknown'));
    }
    btn.disabled=false; btn.textContent='Confirm '+tradeAction;
  });

  // ── table filters ─────────────────────────────────────────
  document.getElementById('tt-search').addEventListener('input', function(){ ttQ=this.value.toLowerCase(); renderTable(); updateMetrics(); });
  document.querySelectorAll('.filter-bar .chip').forEach(function(c){
    c.addEventListener('click', function(){
      document.querySelectorAll('.filter-bar .chip').forEach(function(x){ x.classList.remove('active'); });
      c.classList.add('active'); ttFilter=c.dataset.tt; renderTable(); updateMetrics();
    });
  });

  // ── init ──────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', function(){
    setAction('Buy'); updateConsideration();
    setTimeout(function(){
      if(typeof sb!=='undefined'&&sb){ loadFY(); loadInstruments(); loadTrades(); }
    }, 600);
  });
})();
