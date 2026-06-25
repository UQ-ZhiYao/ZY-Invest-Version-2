/* ============================================================
   ZY-Invest · Trade Transactions — Admin logic
   Reads/writes transaction_trading + fy_settings tables
   ============================================================ */
(function(){
  var ALL_TX = [];
  var INSTRUMENTS = [];
  var FY_LIST = [];
  var ttFilter = '', ttQ = '', ttFY = '';
  var tradeAction = 'Buy';

  function fmt(n,dp){ return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:dp||2,maximumFractionDigits:dp||2}); }
  function parseNum(s){ return parseFloat((s||'').toString().replace(/,/g,''))||0; }
  function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }
  function tag(a){ return a==='Buy'?'<span class="tag-green">Buy</span>':'<span class="tag-red">Sell</span>'; }
  function prodPill(p){ return '<span class="tag-blue">'+(p||'Securities')+'</span>'; }

  // ── default date ──
  var trDateEl = document.getElementById('tr-date');
  if(trDateEl) trDateEl.value = new Date().toISOString().slice(0,10);

  // ── load FY list into dropdown ──
  async function loadFY(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('fy_settings').select('*').order('start_date',{ascending:false});
    if(res.error||!res.data) return;
    FY_LIST = res.data;
    var sel = document.getElementById('tt-fy');
    FY_LIST.forEach(function(fy){
      var o = document.createElement('option'); o.value=fy.id; o.textContent=fy.label; sel.appendChild(o);
    });
    sel.addEventListener('change',function(){ ttFY=this.value; renderTable(); updateMetrics(); });
  }

  // ── load instruments into trade modal select ──
  async function loadInstruments(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('instruments').select('id,name,ticker,product,sector').order('name');
    if(res.error||!res.data) return;
    INSTRUMENTS = res.data;
    populateInstSelect();
  }

  function populateInstSelect(){
    var sel = document.getElementById('tr-inst');
    sel.innerHTML = '';
    var src = tradeAction==='Sell'
      ? INSTRUMENTS.filter(function(x){ return ALL_TX.some(function(t){ return t.instrument_name===x.name && t.action==='Buy'; }); })
      : INSTRUMENTS;
    if(!src.length) src = INSTRUMENTS;
    src.forEach(function(x){
      var o=document.createElement('option'); o.value=x.name;
      o.textContent=x.name+(x.ticker&&x.ticker!=='—'?' ('+x.ticker+')':'');
      sel.appendChild(o);
    });
  }

  // ── load trades ──
  async function loadTrades(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('transaction_trading').select('*').order('trade_date',{ascending:false});
    if(res.error){ if(window.zyToast) zyToast('Load failed: '+res.error.message); return; }
    ALL_TX = res.data||[];
    renderTable();
    updateMetrics();
  }

  // ── FY date filter helper ──
  function inFY(trade){
    if(!ttFY) return true;
    var fy = FY_LIST.filter(function(f){ return f.id===ttFY; })[0];
    if(!fy) return true;
    var d = trade.trade_date;
    return d >= fy.start_date && d <= fy.end_date;
  }

  // ── filtered rows ──
  function filtered(){
    return ALL_TX.filter(function(r){
      if(ttFilter && r.action!==ttFilter) return false;
      if(ttQ && (r.instrument_name+' '+(r.ticker||'')).toLowerCase().indexOf(ttQ)===-1) return false;
      if(ttFY && !inFY(r)) return false;
      return true;
    });
  }

  // ── render table ──
  function renderTable(){
    var rows = filtered();
    var tbody = document.getElementById('ttBody');
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:26px;color:var(--fg-3);">No trades match.</td></tr>';
      document.getElementById('ttListCount').textContent='0 of '+ALL_TX.length;
      return;
    }
    tbody.innerHTML='';
    rows.forEach(function(r){
      var isBuy=r.action==='Buy';
      var value=(r.units||0)*(r.price||0);
      var flow=(isBuy?'−':'+')+fmt(value);
      var tr=document.createElement('tr');
      tr.innerHTML=
        '<td>'+fmtDate(r.trade_date)+'</td>'+
        '<td>'+tag(r.action)+'</td>'+
        '<td class="hold-name"><b>'+(r.instrument_name||'—')+'</b><span>'+(r.ticker||'—')+'</span></td>'+
        '<td>'+prodPill(r.product)+'</td>'+
        '<td class="r">'+fmt(r.units,0)+'</td>'+
        '<td class="r">'+fmt(r.price,4)+'</td>'+
        '<td class="r">'+(r.fee?fmt(r.fee):'—')+'</td>'+
        '<td class="r '+(isBuy?'cf-out':'cf-in')+'">'+flow+'</td>';
      tbody.appendChild(tr);
    });
    document.getElementById('ttListCount').textContent=rows.length+' of '+ALL_TX.length;
  }

  // ── update metric boxes from ALL data (not filtered) ──
  function updateMetrics(){
    var rows = filtered(); // metrics reflect current FY filter but not buy/sell chip
    var allInFY = ALL_TX.filter(inFY);
    var totalTrades=allInFY.length, buys=0, sells=0, totalAmt=0, totalUnits=0, totalFees=0;
    allInFY.forEach(function(r){
      if(r.action==='Buy') buys++; else sells++;
      totalAmt += (r.units||0)*(r.price||0);
      totalUnits += parseFloat(r.units)||0;
      totalFees += parseFloat(r.fee)||0;
    });

    // Turnover ratio = total amount / avg NAV (approx: totalAmt / fund_nav, here use buy amount as proxy)
    var buyAmt=0, sellAmt=0;
    allInFY.forEach(function(r){ var v=(r.units||0)*(r.price||0); if(r.action==='Buy') buyAmt+=v; else sellAmt+=v; });
    var ratio = buyAmt>0 ? (totalAmt/buyAmt).toFixed(2) : '—';
    var density = totalUnits>0 ? fmt(totalAmt/totalUnits,4) : '—';

    document.getElementById('ttCount').textContent=totalTrades;
    document.getElementById('ttBuySell').textContent=buys+' : '+sells;
    document.getElementById('ttTurnover').textContent='RM '+fmt(totalAmt,0);
    document.getElementById('ttRatio').textContent=ratio;
    document.getElementById('ttTurnoverUnits').textContent=fmt(totalUnits,0);
    document.getElementById('ttDensity').textContent=density;
    document.getElementById('ttFees').textContent='RM '+fmt(totalFees);
  }

  // ── trade action toggle ──
  function setAction(a){
    tradeAction=a;
    document.querySelector('.tt-buy').classList.toggle('active',a==='Buy');
    document.querySelector('.tt-sell').classList.toggle('active',a==='Sell');
    var cf=document.getElementById('tr-confirm');
    cf.textContent='Confirm '+a;
    cf.classList.toggle('sell',a==='Sell');
    cf.classList.toggle('buy',a==='Buy');
    populateInstSelect();
    recalcCons();
  }

  document.querySelectorAll('.trade-toggle button').forEach(function(b){
    b.addEventListener('click',function(){ setAction(b.dataset.act); });
  });

  // ── consideration calc ──
  function recalcCons(){
    var u=parseNum(document.getElementById('tr-units').value);
    var p=parseNum(document.getElementById('tr-price').value);
    var f=parseNum(document.getElementById('tr-fee').value);
    var cons=tradeAction==='Buy'?u*p+f:u*p-f;
    document.getElementById('tr-cons-lbl').textContent=tradeAction==='Buy'?'(units × price + fee)':'(units × price − fee)';
    document.getElementById('tr-cons').textContent=(u>0&&p>0)?'RM '+fmt(cons):'RM —';
  }
  ['tr-fee','tr-units','tr-price'].forEach(function(id){
    document.getElementById(id).addEventListener('input',recalcCons);
  });

  // ── open trade modal ──
  document.getElementById('btnTrade').addEventListener('click',function(){
    document.getElementById('tr-units').value='';
    document.getElementById('tr-price').value='';
    document.getElementById('tr-fee').value='';
    document.getElementById('tr-note').value='';
    trDateEl.value=new Date().toISOString().slice(0,10);
    setAction('Buy');
    recalcCons();
    zyModalOpen('tradeModal');
  });

  // ── confirm trade ──
  document.getElementById('tr-confirm').addEventListener('click',async function(){
    var instName=document.getElementById('tr-inst').value;
    var date=document.getElementById('tr-date').value;
    var units=parseNum(document.getElementById('tr-units').value);
    var price=parseNum(document.getElementById('tr-price').value);
    var fee=parseNum(document.getElementById('tr-fee').value)||0;
    var note=document.getElementById('tr-note').value.trim();

    if(!instName){ if(window.zyToast) zyToast('Select an instrument'); return; }
    if(units<=0||price<=0){ if(window.zyToast) zyToast('Enter units and price'); return; }
    if(!date){ if(window.zyToast) zyToast('Select a trade date'); return; }

    // Find instrument details
    var inst=INSTRUMENTS.filter(function(x){return x.name===instName;})[0]||{};

    var btn=document.getElementById('tr-confirm'); btn.disabled=true; btn.textContent='Saving…';
    try{
      var res=await sb.from('transaction_trading').insert({
        action: tradeAction,
        instrument_name: instName,
        ticker: inst.ticker||null,
        product: inst.product||'Securities',
        sector: inst.sector||null,
        trade_date: date,
        units: units,
        price: price,
        fee: fee||null,
        note: note||null
      });
      if(res.error) throw res.error;
      await loadTrades();
      zyModalClose();
      if(window.zyToast) zyToast(tradeAction+' '+fmt(units,0)+' '+instName+' @ RM '+fmt(price,4));
    }catch(ex){
      if(window.zyToast) zyToast('Error: '+((ex&&ex.message)||'Unknown'));
    }
    btn.disabled=false; btn.textContent='Confirm '+tradeAction;
  });

  // ── search + chip filters ──
  document.getElementById('tt-search').addEventListener('input',function(){ ttQ=this.value.toLowerCase(); renderTable(); updateMetrics(); });
  document.querySelectorAll('.filter-bar .chip').forEach(function(c){
    c.addEventListener('click',function(){
      document.querySelectorAll('.filter-bar .chip').forEach(function(x){x.classList.remove('active');});
      c.classList.add('active'); ttFilter=c.dataset.tt; renderTable(); updateMetrics();
    });
  });

  // ── init ──
  window.addEventListener('DOMContentLoaded',function(){
    setAction('Buy'); recalcCons();
    setTimeout(function(){
      if(typeof sb!=='undefined'&&sb){ loadFY(); loadInstruments(); loadTrades(); }
    },600);
  });
})();
