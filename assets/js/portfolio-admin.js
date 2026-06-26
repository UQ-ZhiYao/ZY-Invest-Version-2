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

  // ── refresh prices via Yahoo Finance ──────────────────────
  document.getElementById('btnRefreshPrices').addEventListener('click', async function(){
    if(!ALL.length){ if(window.zyToast) zyToast('No holdings to refresh'); return; }
    var btn=this; btn.disabled=true; btn.textContent='Fetching…';

    var updates = [];
    for(var i=0;i<ALL.length;i++){
      var r=ALL[i];
      var sym=r.ticker||(r.code&&r.code.indexOf('.')>-1?r.code:null);
      if(!sym||isCash(r)){ continue; }
      try{
        var url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(sym)+'?interval=1d&range=5d';
        var proxy='https://api.allorigins.win/raw?url='+encodeURIComponent(url);
        var res=await fetch(proxy);
        var data=await res.json();
        var price=data.chart&&data.chart.result&&data.chart.result[0]?
          data.chart.result[0].meta.regularMarketPrice:null;
        if(price){
          var units=parseFloat(r.units)||0;
          var mv=price*units;
          var upnl=mv-(parseFloat(r.total_cost)||0);
          updates.push({id:r.id, latest_price:price, market_value:mv, unrealised_pnl:upnl});
        }
      }catch(e){ console.warn('Price fetch failed for',sym,e); }
    }

    if(!updates.length){ if(window.zyToast) zyToast('No prices fetched'); btn.disabled=false; btn.textContent='↻ Refresh Prices'; return; }

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
