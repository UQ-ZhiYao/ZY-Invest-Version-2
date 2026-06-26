/* ============================================================
   ZY-Invest · Portfolio — Admin logic
   Reads from `portfolio` table.
   Cash (product='Cash on Hand' or 'Cash Funds') always last.
   Weight bar: scaled to max holding weight (min=0, max=max weight).
   Price fetch: Yahoo Finance via allorigins.win proxy.
   ============================================================ */
(function(){
  var ALL = [];

  var PROD_CLASS = {
    'Securities':'prod-securities','Derivatives':'prod-derivatives',
    'Cash Funds':'prod-cash-funds','Collectibles':'prod-collectibles',
    'Private Equity':'prod-private-eq','Cash on Hand':'prod-cash-hand'
  };
  function prodPill(p){ var c=PROD_CLASS[p]||'prod-securities'; return '<span class="prod-pill '+c+'">'+(p||'Securities')+'</span>'; }
  function fmt(n,dp){ var d=dp===undefined?2:dp; return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:d,maximumFractionDigits:d}); }

  function isCash(r){ return r.product==='Cash on Hand'||r.product==='Cash Funds'; }

  // ── load portfolio ─────────────────────────────────────────
  async function load(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('portfolio').select('*').order('instrument_name');
    if(res.error){ if(window.zyToast) zyToast('Load failed: '+res.error.message); return; }
    ALL = res.data||[];
    render();
  }

  // ── render table ───────────────────────────────────────────
  function render(){
    var nonCash = ALL.filter(function(r){ return !isCash(r); });
    var cash    = ALL.filter(function(r){ return  isCash(r); });
    var rows    = nonCash.concat(cash);  // cash always last

    // Total market value for weight denominator
    var totalMV = rows.reduce(function(s,r){ return s+(parseFloat(r.market_value)||0); },0);

    // Max weight for bar scaling (relative to largest holding)
    var maxWt = rows.reduce(function(s,r){
      var w = totalMV>0?(parseFloat(r.market_value)||0)/totalMV*100:0;
      return Math.max(s,w);
    },0);
    if(maxWt<=0) maxWt=100;

    var tbody = document.getElementById('pfBody');
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="8" style="padding:24px;color:var(--fg-3);">No portfolio records. Add holdings to the portfolio table.</td></tr>';
      document.getElementById('pfListCount').textContent='0 holdings';
      return;
    }

    tbody.innerHTML='';
    rows.forEach(function(r){
      var units     = parseFloat(r.units)||0;
      var totalCost = parseFloat(r.total_cost)||0;
      var vwap      = parseFloat(r.vwap_cost)||0;
      var price     = parseFloat(r.latest_price)||0;
      var mv        = parseFloat(r.market_value)||0;
      var upnl      = parseFloat(r.unrealised_pnl)||0;
      var retPct    = vwap>0?(price-vwap)/vwap*100:0;
      var weight    = totalMV>0?mv/totalMV*100:0;
      // bar width = weight / maxWt * 100, clamped 0–100
      var barW      = maxWt>0?Math.min(100,weight/maxWt*100).toFixed(1):'0';

      var tk=(r.ticker||'').trim(), co=(r.code||'').trim();
      var subLine=tk&&co&&tk!==co?tk+' | '+co:(tk||co||'—');

      var pnlClass  = upnl>=0?'pos':'neg';
      var retClass  = retPct>=0?'pos':'neg';
      var cashClass = isCash(r)?'cash-row':'';

      var tr=document.createElement('tr'); if(cashClass) tr.className=cashClass;
      tr.innerHTML=
        '<td class="hold-name"><b>'+r.instrument_name+'</b><span>'+subLine+'</span></td>'+
        '<td>'+prodPill(r.product)+'</td>'+
        '<td class="r">'+fmt(units,4)+'</td>'+
        '<td class="r">'+
          '<span>'+fmt(totalCost)+'</span>'+
          '<span class="cell-sub">'+fmt(vwap,4)+' / unit</span>'+
        '</td>'+
        '<td class="r">'+
          '<span>'+(mv>0?fmt(mv):'—')+'</span>'+
          '<span class="cell-sub">'+(price>0?fmt(price,4):'—')+'</span>'+
        '</td>'+
        '<td class="r"><span class="'+pnlClass+'">'+(upnl!==0?(upnl>=0?'+':'')+fmt(upnl):'—')+'</span></td>'+
        '<td class="r"><span class="'+retClass+'">'+(price>0?(retPct>=0?'+':'')+retPct.toFixed(2)+'%':'—')+'</span></td>'+
        '<td class="r">'+
          '<div class="wt-wrap">'+
            '<div class="wt-bar"><span class="wt-fill" style="width:'+barW+'%"></span></div>'+
            weight.toFixed(2)+'%'+
          '</div>'+
        '</td>';
      tbody.appendChild(tr);
    });

    var equityRows = nonCash;
    var equityMV   = equityRows.reduce(function(s,r){return s+(parseFloat(r.market_value)||0);},0);
    var totalPnl   = equityRows.reduce(function(s,r){return s+(parseFloat(r.unrealised_pnl)||0);},0);
    var totalCostAll=equityRows.reduce(function(s,r){return s+(parseFloat(r.total_cost)||0);},0);
    var retPctAll  = totalCostAll>0?totalPnl/totalCostAll*100:0;

    document.getElementById('pfCount').textContent=nonCash.length;
    document.getElementById('pfMV').textContent='RM '+fmt(equityMV);
    var pnlEl=document.getElementById('pfPnl');
    pnlEl.textContent=(totalPnl>=0?'+':'')+'RM '+fmt(totalPnl);
    pnlEl.style.color=totalPnl>=0?'var(--green)':'var(--red)';
    document.getElementById('pfPnlPct').textContent=(retPctAll>=0?'+':'')+retPctAll.toFixed(2)+'% on cost';
    document.getElementById('pfListCount').textContent=rows.length+' holdings';
  }


  // ══════════════════════════════════════════════════════════
  //  COMPUTE PORTFOLIO FROM TRADES (AVCO)
  //  - Same algorithm as settlement but outputs CURRENT positions
  //  - Every buy/sell updates the running portfolio state
  //  - Result = all instruments with net units > 0
  //  - Cash rows (product='Cash on Hand'/'Cash Funds') preserved
  //    from existing portfolio table — not touched by this compute
  // ══════════════════════════════════════════════════════════

  var computedPortfolio = [];

  document.getElementById('btnComputePortfolio').addEventListener('click', async function(){
    if(typeof sb==='undefined'||!sb) return;
    var btn=this; btn.disabled=true; btn.textContent='Computing…';

    try{
      // 1. Fetch all trades, sort by date then Buy before Sell on same day
      var res = await sb.from('transaction_trading').select('*').order('trade_date',{ascending:true});
      if(res.error) throw res.error;

      var trades = (res.data||[]).slice().sort(function(a,b){
        if(a.trade_date < b.trade_date) return -1;
        if(a.trade_date > b.trade_date) return 1;
        return (a.action==='Buy'?0:1)-(b.action==='Buy'?0:1);
      });

      // 2. AVCO loop — track running portfolio per instrument
      // portfolio[name] = {totalUnits, totalCost, ticker, code, product}
      var port = {};

      trades.forEach(function(t){
        var name  = t.instrument_name;
        var units = Math.abs(parseFloat(t.units)||0);
        var cf    = parseFloat(t.cashflow)||0;

        if(!port[name]){
          port[name] = {totalUnits:0, totalCost:0,
            ticker:t.ticker||'', code:t.code||'', product:t.product||'Securities'};
        }
        var pos = port[name];
        // always keep latest metadata
        if(t.ticker)  pos.ticker  = t.ticker;
        if(t.code)    pos.code    = t.code;
        if(t.product) pos.product = t.product;

        if(t.action === 'Buy'){
          // Expand AVCO pool — NO rounding
          pos.totalCost  += Math.abs(cf);
          pos.totalUnits += units;

        } else { // Sell — reduce pool
          if(pos.totalUnits > 0){
            var avgCost = pos.totalCost / pos.totalUnits;  // NO rounding
            pos.totalUnits -= units;
            pos.totalCost   = pos.totalUnits > 0 ? avgCost * pos.totalUnits : 0;
          }
        }
      });

      // 3. Build result — only positions with units remaining
      var positions = [];
      Object.keys(port).forEach(function(name){
        var pos = port[name];
        if(pos.totalUnits < 0.0001) return; // fully sold
        var vwap = pos.totalUnits > 0 ? pos.totalCost / pos.totalUnits : 0;
        positions.push({
          instrument_name: name,
          ticker:          pos.ticker || null,
          code:            pos.code   || null,
          product:         pos.product || 'Securities',
          units:           pos.totalUnits,
          total_cost:      pos.totalCost,
          vwap_cost:       vwap,
          latest_price:    0,
          market_value:    0,
          unrealised_pnl:  0,
          return_pct:      0,
          weight:          0
        });
      });

      // Sort: non-cash by name, cash last
      positions.sort(function(a,b){
        var ac = a.product==='Cash on Hand'||a.product==='Cash Funds';
        var bc = b.product==='Cash on Hand'||b.product==='Cash Funds';
        if(ac && !bc) return 1;
        if(!ac && bc) return -1;
        return a.instrument_name.localeCompare(b.instrument_name);
      });

      if(!positions.length){
        if(window.zyToast) zyToast('No open positions found in trade history');
        btn.disabled=false; btn.textContent='⟳ Compute from Trades'; return;
      }

      computedPortfolio = positions;

      // 4. Show preview
      var tbody = document.getElementById('pfComputeBody');
      tbody.innerHTML = '';
      positions.forEach(function(r){
        var tk=(r.ticker||'').trim(), co=(r.code||'').trim();
        var sub=tk&&co&&tk!==co?tk+' | '+co:(tk||co||'—');
        var tr=document.createElement('tr');
        tr.innerHTML=
          '<td class="hold-name"><b>'+r.instrument_name+'</b><span>'+sub+'</span></td>'+
          '<td>'+prodPill(r.product)+'</td>'+
          '<td class="r">'+fmt(r.units,4)+'</td>'+
          '<td class="r">'+fmt(r.total_cost)+'</td>'+
          '<td class="r">'+fmt(r.vwap_cost,6)+'</td>';
        tbody.appendChild(tr);
      });

      document.getElementById('pfComputeNote').textContent =
        positions.length+' open position'+(positions.length===1?'':'s');
      zyModalOpen('pfComputeModal');

    }catch(ex){ if(window.zyToast) zyToast('Error: '+(ex.message||'Unknown')); }
    btn.disabled=false; btn.textContent='⟳ Compute from Trades';
  });

  // 5. Confirm: preserve existing latest_price for matching instruments,
  //    wipe non-cash rows, insert fresh computed positions
  document.getElementById('btnConfirmPortfolio').addEventListener('click', async function(){
    if(!computedPortfolio.length) return;
    var btn=this; btn.disabled=true; btn.textContent='Saving…';
    try{
      // Preserve prices from existing portfolio rows
      var existing = {};
      ALL.forEach(function(r){
        if(parseFloat(r.latest_price)>0){
          existing[r.instrument_name] = {
            latest_price:  parseFloat(r.latest_price)||0,
            market_value:  0,
            unrealised_pnl:0
          };
        }
      });

      // Apply existing prices to new positions
      computedPortfolio.forEach(function(r){
        var ex = existing[r.instrument_name];
        if(ex && ex.latest_price>0){
          r.latest_price   = ex.latest_price;
          r.market_value   = ex.latest_price * r.units;
          r.unrealised_pnl = r.market_value - r.total_cost;
          r.return_pct     = r.vwap_cost>0?(ex.latest_price-r.vwap_cost)/r.vwap_cost*100:0;
        }
      });

      // Recompute weights after price application
      var totalMV = computedPortfolio.reduce(function(s,r){return s+(r.market_value||0);},0)||
                    computedPortfolio.reduce(function(s,r){return s+r.total_cost;},0);
      computedPortfolio.forEach(function(r){
        var base = r.market_value>0?r.market_value:r.total_cost;
        r.weight = totalMV>0?base/totalMV*100:0;
      });

      // Clear entire portfolio table then insert fresh computed positions
      var del = await sb.from('portfolio')
        .delete()
        .neq('id','00000000-0000-0000-0000-000000000000');
      if(del.error) throw del.error;

      var ins = await sb.from('portfolio').insert(computedPortfolio);
      if(ins.error) throw ins.error;

      zyModalClose();
      await load();
      if(window.zyToast) zyToast('Portfolio updated — '+computedPortfolio.length+' positions saved');
      computedPortfolio = [];
    }catch(ex){ if(window.zyToast) zyToast('Save error: '+(ex.message||'Unknown')); }
    btn.disabled=false; btn.textContent='Save to Portfolio';
  });
  // ══════════════════════════════════════════════════════════

  // ── refresh prices via Yahoo Finance ──────────────────────
  document.getElementById('btnRefreshPrices').addEventListener('click', async function(){
    if(!ALL.length){ if(window.zyToast) zyToast('No holdings loaded — reload page first'); return; }
    var btn=this; btn.disabled=true; btn.textContent='Fetching…';

    var updates = [];
    var skipped = 0;
    for(var i=0;i<ALL.length;i++){
      var r=ALL[i];
      var sym=(r.code||'').trim();
      if(!sym||isCash(r)){ skipped++; continue; }
      var price=null;
      try{
        // Attempt 1: direct Yahoo Finance v8 chart (works from HTTPS pages)
        var url1='https://query2.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(sym)+'?interval=1d&range=5d';
        var res1=await fetch(url1,{headers:{'Accept':'application/json'}});
        if(res1.ok){
          var d1=await res1.json();
          price=d1.chart&&d1.chart.result&&d1.chart.result[0]
            ?d1.chart.result[0].meta.regularMarketPrice:null;
        }
      }catch(e1){ console.warn('Attempt 1 failed for',sym,e1.message); }

      if(!price){
        try{
          // Attempt 2: corsproxy.io + v11
          var url2='https://query2.finance.yahoo.com/v11/finance/quoteSummary/'+encodeURIComponent(sym)+'?modules=price';
          var proxy='https://corsproxy.io/?'+encodeURIComponent(url2);
          var res2=await fetch(proxy);
          if(res2.ok){
            var d2=await res2.json();
            price=d2.quoteSummary&&d2.quoteSummary.result&&d2.quoteSummary.result[0]
              ?d2.quoteSummary.result[0].price.regularMarketPrice.raw:null;
          }
        }catch(e2){ console.warn('Attempt 2 failed for',sym,e2.message); }
      }

      if(!price){
        try{
          // Attempt 3: allorigins proxy + v8
          var url3='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(sym)+'?interval=1d&range=5d';
          var proxy3='https://api.allorigins.win/raw?url='+encodeURIComponent(url3);
          var res3=await fetch(proxy3);
          if(res3.ok){
            var d3=await res3.json();
            price=d3.chart&&d3.chart.result&&d3.chart.result[0]
              ?d3.chart.result[0].meta.regularMarketPrice:null;
          }
        }catch(e3){ console.warn('Attempt 3 failed for',sym,e3.message); }
      }

      console.log(sym,'→ price:',price);
      if(price){
        var units=parseFloat(r.units)||0;
        var mv=price*units;
        var upnl=mv-(parseFloat(r.total_cost)||0);
        updates.push({id:r.id, latest_price:price, market_value:mv, unrealised_pnl:upnl});
      }
    }

    if(!updates.length){
      if(window.zyToast) zyToast('No prices fetched ('+ALL.length+' rows, '+skipped+' skipped). Check console for details.');
      btn.disabled=false; btn.textContent='↻ Refresh Prices'; return;
    }

    // Batch update
    for(var j=0;j<updates.length;j++){
      var u=updates[j];
      await sb.from('portfolio').update({
        latest_price:u.latest_price, market_value:u.market_value, unrealised_pnl:u.unrealised_pnl
      }).eq('id',u.id);
    }

    var now=new Date(); document.getElementById('pfUpdated').textContent=now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    if(window.zyToast) zyToast('Prices updated — '+updates.length+' holdings');
    await load();
    btn.disabled=false; btn.textContent='↻ Refresh Prices';
  });

  // ── init ──────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded',function(){
    setTimeout(function(){ if(typeof sb!=='undefined'&&sb) load(); },600);
  });
})();
