/* ============================================================
   ZY-Invest · Portfolio — Admin logic

   Key rules:
   - Non-Securities: price = VWAP cost, market value = total cost,
     unrealised P&L = 0, return % = 0 (no mark-to-market)
   - Securities: marked to market via latest_price
   - "MYR Cash Account": always the last row, computed from ALL
     cashflow sources when "Compute from Trades" is run:
       + Capital Injection Subscriptions (Approved)
       - Capital Injection Redemptions (Approved)
       + Trade cashflows (signed: buys negative, sells positive)
       + Others transactions (already signed)
       - Remuneration Paid amounts
       - Distributions Paid (dps/100 × total fund units per record)
       + Dividend Received amounts
   ============================================================ */
(function(){
  var ALL = [];

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
  function fmt(n,dp){ var d=dp===undefined?2:dp; return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:d,maximumFractionDigits:d}); }

  var CASH_NAME = 'MYR Cash Account';
  function isCash(r){ return r.product==='Cash on Hand'||r.product==='Cash Funds'||r.instrument_name===CASH_NAME; }
  function isSecurity(r){ return r.product==='Securities'; }

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
    // Non-Securities: force price = VWAP, MV = total_cost, uPnL = 0
    ALL.forEach(function(r){
      if(!isSecurity(r) && !isCash(r)){
        var vwap = parseFloat(r.vwap_cost)||0;
        var cost = parseFloat(r.total_cost)||0;
        r.latest_price   = vwap;
        r.market_value   = cost;
        r.unrealised_pnl = 0;
        r.return_pct     = 0;
      }
    });

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
      var upnl      = isCash(r) ? 0 : (parseFloat(r.unrealised_pnl)||0);
      var retPct    = isSecurity(r) && vwap>0 ? (price-vwap)/vwap*100 : 0;
      var weight    = totalMV>0?mv/totalMV*100:0;
      var barW      = maxWt>0?Math.min(100,weight/maxWt*100).toFixed(1):'0';

      var tk=(r.ticker||'').trim(), co=(r.code||'').trim();
      var subLine = r.instrument_name===CASH_NAME ? 'MYR' :
                    (tk&&co&&tk!==co?tk+' | '+co:(tk||co||'—'));

      var pnlClass  = upnl>=0?'pos':'neg';
      var retClass  = retPct>=0?'pos':'neg';
      var cashClass = isCash(r)?'cash-row':'';

      // For cash row and non-securities: show "—" for P&L and return
      var showPnl = !isCash(r) && isSecurity(r);
      var priceDisplay = isCash(r) ? '—' : (price>0?fmt(price,4):'—');
      var mvDisplay    = mv>0 ? fmt(mv) : (isCash(r) ? fmt(totalCost) : '—');

      var tr=document.createElement('tr'); if(cashClass) tr.className=cashClass;
      tr.innerHTML=
        '<td class="hold-name"><b>'+r.instrument_name+'</b><span>'+subLine+'</span></td>'+
        '<td>'+(isCash(r)?'<span class="prod-pill" style="background:#F1F5F9;color:#475569;">Cash</span>':prodPill(r.product))+'</td>'+
        '<td class="r">'+(isCash(r)?'—':fmt(units,4))+'</td>'+
        '<td class="r">'+
          '<span>'+fmt(totalCost)+'</span>'+
          (isCash(r)?'':'<span class="cell-sub">'+fmt(vwap,4)+' / unit</span>')+
        '</td>'+
        '<td class="r">'+
          '<span>'+mvDisplay+'</span>'+
          (isCash(r)?'':'<span class="cell-sub">'+priceDisplay+'</span>')+
        '</td>'+
        '<td class="r"><span class="'+(showPnl?pnlClass:'')+'">'+
          (showPnl?(upnl!==0?(upnl>=0?'+':'')+fmt(upnl):'—'):'—')+
        '</span></td>'+
        '<td class="r"><span class="'+(showPnl?retClass:'')+'">'+
          (showPnl?(price>0?(retPct>=0?'+':'')+retPct.toFixed(2)+'%':'—'):'—')+
        '</span></td>'+
        '<td class="r">'+
          '<div class="wt-wrap">'+
            '<div class="wt-bar"><span class="wt-fill" style="width:'+barW+'%"></span></div>'+
            weight.toFixed(2)+'%'+
          '</div>'+
        '</td>';
      tbody.appendChild(tr);
    });

    var equityRows = nonCash.filter(isSecurity);
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
  //  COMPUTE PORTFOLIO FROM TRADES + ALL CASHFLOW SOURCES
  //
  //  Holdings (AVCO):
  //    - Securities: marked to market
  //    - Non-Securities: price = VWAP, no P&L
  //  Cash row "MYR Cash Account":
  //    + Capital Injections Subscriptions (Approved)
  //    - Capital Injections Redemptions  (Approved)
  //    + Trade cashflows (signed column)
  //    + Others transactions (signed amount)
  //    - Remuneration Paid amounts
  //    - Distributions Paid (dps/100 × fund units)
  //    + Dividend Received amounts
  // ══════════════════════════════════════════════════════════

  var computedPortfolio = [];

  document.getElementById('btnComputePortfolio').addEventListener('click', async function(){
    if(typeof sb==='undefined'||!sb) return;
    var btn=this; btn.disabled=true; btn.textContent='Computing…';

    try{
      // ── 1. Fetch all data sources in parallel ─────────────
      var [
        tradesRes, ciRes, othersRes, remRes, distRes, divRes
      ] = await Promise.all([
        sb.from('transaction_trading').select('*').order('trade_date',{ascending:true}),
        sb.from('capital_injection').select('type,amount,units,date,status').eq('status','Approved'),
        sb.from('transaction_others').select('amount,date'),
        sb.from('remuneration').select('amount,status,date'),
        sb.from('distributions').select('dps,units,amount,status,pay_date'),
        sb.from('dividend').select('amount,status,pay_date')
      ]);

      if(tradesRes.error) throw tradesRes.error;

      var trades = (tradesRes.data||[]).slice().sort(function(a,b){
        if(a.trade_date < b.trade_date) return -1;
        if(a.trade_date > b.trade_date) return 1;
        return (a.action==='Buy'?0:1)-(b.action==='Buy'?0:1);
      });

      // ── 2. AVCO loop — build open positions ───────────────
      var port = {};
      trades.forEach(function(t){
        var name  = t.instrument_name;
        var units = Math.abs(parseFloat(t.units)||0);

        if(!port[name]){
          port[name] = {totalUnits:0, totalCost:0,
            ticker:t.ticker||'', code:t.code||'', product:t.product||'Securities'};
        }
        var pos = port[name];
        if(t.ticker)  pos.ticker  = t.ticker;
        if(t.code)    pos.code    = t.code;
        if(t.product) pos.product = t.product;

        if(t.action === 'Buy'){
          pos.totalCost  += Math.abs(parseFloat(t.cashflow)||0);
          pos.totalUnits += units;
        } else {
          if(pos.totalUnits > 0){
            var avgCost = pos.totalCost / pos.totalUnits;
            pos.totalUnits -= units;
            pos.totalCost   = pos.totalUnits > 0 ? avgCost * pos.totalUnits : 0;
          }
        }
      });

      // ── 3. Build positions — non-securities get price = VWAP
      var positions = [];
      Object.keys(port).forEach(function(name){
        var pos = port[name];
        if(pos.totalUnits < 0.0001) return;
        var vwap = pos.totalUnits > 0 ? pos.totalCost / pos.totalUnits : 0;
        var isSec = pos.product === 'Securities';
        positions.push({
          instrument_name: name,
          ticker:          pos.ticker || null,
          code:            pos.code   || null,
          product:         pos.product || 'Securities',
          units:           pos.totalUnits,
          total_cost:      pos.totalCost,
          vwap_cost:       vwap,
          // Non-securities: price = vwap, MV = cost, no P&L
          latest_price:    isSec ? 0       : vwap,
          market_value:    isSec ? 0       : pos.totalCost,
          unrealised_pnl:  isSec ? 0       : 0,
          return_pct:      0,
          weight:          0
        });
      });

      // ── 4. Compute MYR Cash Balance ───────────────────────
      var cash = 0;

      // + Capital Injections (Approved)
      (ciRes.data||[]).forEach(function(r){
        var a = parseFloat(r.amount)||0;
        if(r.type === 'Subscription') cash += a;
        else if(r.type === 'Redemption') cash -= a;
      });

      // + Trade cashflows (already signed: buy = negative, sell = positive)
      trades.forEach(function(t){
        cash += parseFloat(t.cashflow)||0;
      });

      // + Others transactions (signed amounts, e.g. interest income positive, expenses negative)
      (othersRes.data||[]).forEach(function(r){
        cash += parseFloat(r.amount)||0;
      });

      // - Remuneration Paid
      (remRes.data||[]).forEach(function(r){
        if(r.status === 'Paid') cash -= parseFloat(r.amount)||0;
      });

      // - Distributions Paid (gross payout = dps/100 × fund units)
      (distRes.data||[]).forEach(function(r){
        if(r.status === 'Paid'){
          var gross = r.amount != null
            ? parseFloat(r.amount)||0
            : (parseFloat(r.dps)||0)/100 * (parseFloat(r.units)||0);
          cash -= gross;
        }
      });

      // + Dividend Received
      (divRes.data||[]).forEach(function(r){
        if(r.status === 'Received') cash += parseFloat(r.amount)||0;
      });

      // ── 5. Add MYR Cash Account row ──────────────────────
      positions.push({
        instrument_name: CASH_NAME,
        ticker:          null,
        code:            null,
        product:         'Cash on Hand',
        units:           1,
        total_cost:      cash,
        vwap_cost:       cash,
        latest_price:    cash,
        market_value:    cash,
        unrealised_pnl:  0,
        return_pct:      0,
        weight:          0
      });

      // ── 6. Sort: non-cash by name, cash last ─────────────
      positions.sort(function(a,b){
        var ac = a.instrument_name === CASH_NAME;
        var bc = b.instrument_name === CASH_NAME;
        if(ac && !bc) return 1;
        if(!ac && bc) return -1;
        return a.instrument_name.localeCompare(b.instrument_name);
      });

      if(positions.length <= 1){
        if(window.zyToast) zyToast('No open positions found in trade history');
        btn.disabled=false; btn.textContent='⟳ Compute from Trades'; return;
      }

      computedPortfolio = positions;

      // ── 7. Show preview ───────────────────────────────────
      var tbody = document.getElementById('pfComputeBody');
      tbody.innerHTML = '';
      positions.forEach(function(r){
        var tk=(r.ticker||'').trim(), co=(r.code||'').trim();
        var sub = r.instrument_name===CASH_NAME ? 'MYR' :
                  (tk&&co&&tk!==co?tk+' | '+co:(tk||co||'—'));
        var isSec = r.product === 'Securities';
        var tr=document.createElement('tr');
        tr.innerHTML=
          '<td class="hold-name"><b>'+r.instrument_name+'</b><span>'+sub+'</span></td>'+
          '<td>'+(r.instrument_name===CASH_NAME
            ? '<span class="prod-pill" style="background:#F1F5F9;color:#475569;">Cash</span>'
            : prodPill(r.product))+'</td>'+
          '<td class="r">'+(r.instrument_name===CASH_NAME?'—':fmt(r.units,4))+'</td>'+
          '<td class="r">'+fmt(r.total_cost)+'</td>'+
          '<td class="r">'+(isSec?fmt(r.vwap_cost,6):'= cost / unit')+'</td>';
        tbody.appendChild(tr);
      });

      document.getElementById('pfComputeNote').textContent =
        (positions.length-1)+' open position'+(positions.length-1===1?'':'s')+' + MYR Cash Account';
      zyModalOpen('pfComputeModal');

    }catch(ex){ if(window.zyToast) zyToast('Error: '+(ex.message||'Unknown')); }
    btn.disabled=false; btn.textContent='⟳ Compute from Trades';
  });

  // ── Confirm: save computed portfolio to DB ────────────────
  document.getElementById('btnConfirmPortfolio').addEventListener('click', async function(){
    if(!computedPortfolio.length) return;
    var btn=this; btn.disabled=true; btn.textContent='Saving…';
    try{
      // Preserve existing latest_price for securities (from price refresh)
      var existing = {};
      ALL.forEach(function(r){
        if(parseFloat(r.latest_price)>0 && r.product==='Securities'){
          existing[r.instrument_name] = parseFloat(r.latest_price);
        }
      });

      // Apply saved prices back to securities, recompute MV and uPnL
      computedPortfolio.forEach(function(r){
        if(r.product !== 'Securities') return;
        var savedPrice = existing[r.instrument_name];
        if(savedPrice && savedPrice > 0){
          r.latest_price   = savedPrice;
          r.market_value   = savedPrice * r.units;
          r.unrealised_pnl = r.market_value - r.total_cost;
          r.return_pct     = r.vwap_cost>0?(savedPrice-r.vwap_cost)/r.vwap_cost*100:0;
        }
      });

      // Recompute weights
      var totalMV = computedPortfolio.reduce(function(s,r){return s+(parseFloat(r.market_value)||0);},0)||
                    computedPortfolio.reduce(function(s,r){return s+r.total_cost;},0);
      computedPortfolio.forEach(function(r){
        var base = r.market_value>0?r.market_value:r.total_cost;
        r.weight = totalMV>0?base/totalMV*100:0;
      });

      // Wipe and replace
      var del = await sb.from('portfolio').delete().neq('id','00000000-0000-0000-0000-000000000000');
      if(del.error) throw del.error;

      var ins = await sb.from('portfolio').insert(computedPortfolio);
      if(ins.error) throw ins.error;

      zyModalClose();
      await load();
      if(window.zyToast) zyToast('Portfolio updated — '+(computedPortfolio.length-1)+' holdings + MYR Cash Account');
      computedPortfolio = [];
    }catch(ex){ if(window.zyToast) zyToast('Save error: '+(ex.message||'Unknown')); }
    btn.disabled=false; btn.textContent='Save to Portfolio';
  });

  // ── Refresh prices (Securities only) ─────────────────────
  document.getElementById('btnRefreshPrices').addEventListener('click', async function(){
    if(!ALL.length){ if(window.zyToast) zyToast('No holdings loaded — reload page first'); return; }
    var btn=this; btn.disabled=true; btn.textContent='Fetching…';

    // Only fetch prices for securities with a code
    var toFetch=ALL.filter(function(r){ return r.product==='Securities'&&(r.code||'').trim(); });
    if(!toFetch.length){
      if(window.zyToast) zyToast('No securities to fetch — ensure portfolio rows have a code');
      btn.disabled=false; btn.textContent='↻ Refresh Prices'; return;
    }

    var symbols=toFetch.map(function(r){ return r.code.trim(); });
    var updates=[];

    try{
      var fnUrl=SUPABASE_URL.replace(/\/$/,'')+'/functions/v1/fetch-prices';
      var res=await fetch(fnUrl,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':'Bearer '+SUPABASE_ANON,
          'apikey':SUPABASE_ANON
        },
        body:JSON.stringify({symbols:symbols})
      });
      if(!res.ok) throw new Error('Edge function HTTP '+res.status);
      var data=await res.json();
      var prices=data.prices||{};

      toFetch.forEach(function(r){
        var sym=r.code.trim();
        var price=prices[sym];
        console.log(sym,'→',price);
        if(price){
          var units=parseFloat(r.units)||0;
          var mv=price*units;
          var upnl=mv-(parseFloat(r.total_cost)||0);
          updates.push({id:r.id, latest_price:price, market_value:mv, unrealised_pnl:upnl});
        }
      });
    }catch(ex){
      if(window.zyToast) zyToast('Fetch error: '+ex.message);
      btn.disabled=false; btn.textContent='↻ Refresh Prices'; return;
    }

    if(!updates.length){
      if(window.zyToast) zyToast('No prices returned — check console (F12) for symbol details');
      btn.disabled=false; btn.textContent='↻ Refresh Prices'; return;
    }

    for(var j=0;j<updates.length;j++){
      var u=updates[j];
      await sb.from('portfolio').update({
        latest_price:u.latest_price, market_value:u.market_value, unrealised_pnl:u.unrealised_pnl
      }).eq('id',u.id);
    }

    var now=new Date();
    document.getElementById('pfUpdated').textContent=now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    if(window.zyToast) zyToast('Prices updated — '+updates.length+' securities');
    await load();
    btn.disabled=false; btn.textContent='↻ Refresh Prices';
  });

  // ── init ──────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', function(){
    setTimeout(async function(){
      if(typeof sb==='undefined'||!sb) return;
      await loadProductTypes();
      load();
    }, 600);
  });
})();
