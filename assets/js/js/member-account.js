/* ============================================================
   ZY-Invest · Member Account Summary + Holdings — live DB
   Linked from: members/dashboard.html, members/holdings.html

   Data sources:
     capital_injection  → member's units (signed) + cost
     nta_daily          → latest NTA
     portfolio          → fund holdings (for holdings page)
   ============================================================ */
(function(){
  function fmt(n, dp){
    var d = dp === undefined ? 2 : dp;
    return parseFloat(n||0).toLocaleString('en-MY', {minimumFractionDigits:d, maximumFractionDigits:d});
  }
  function fmtDate(d){
    if(!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
  }

  async function getSession(){
    if(typeof sb === 'undefined' || !sb) return null;
    var s = await sb.auth.getSession();
    return (s.data && s.data.session) ? s.data.session : null;
  }

  // ── Core: load member's capital injection data ─────────────
  async function loadMemberData(userId){
    // All approved capital injections for this member
    var ciRes = await sb.from('capital_injection')
      .select('type, amount, units, nta, date, status')
      .eq('uid', userId)
      .eq('status', 'Approved')
      .order('date', {ascending: true});

    // Latest NTA from nta_daily
    var ntaRes = await sb.from('nta_daily')
      .select('date, nta, total_equity, total_units')
      .order('date', {ascending: false})
      .limit(1)
      .single();

    var txns     = ciRes.data  || [];
    var ntaRow   = ntaRes.data || null;
    var latestNTA = ntaRow ? parseFloat(ntaRow.nta) : 1.0;

    // Net units = direct sum (already signed: sub=positive, red=negative)
    var netUnits  = txns.reduce(function(s, r){ return s + parseFloat(r.units||0); }, 0);

    // Total cost = sum of subscription amounts (positive injections only)
    var totalCost = txns
      .filter(function(r){ return parseFloat(r.units||0) > 0; })
      .reduce(function(s, r){ return s + parseFloat(r.amount||0); }, 0);

    // Portfolio value = net units × latest NTA
    var portfolioValue = netUnits * latestNTA;

    // Unrealised P&L = portfolio value − total cost
    var unrealisedPnl = portfolioValue - totalCost;

    // Average cost per unit (from subscriptions only)
    var subUnits = txns
      .filter(function(r){ return parseFloat(r.units||0) > 0; })
      .reduce(function(s, r){ return s + parseFloat(r.units||0); }, 0);
    var avgCost = subUnits > 0 ? totalCost / subUnits : 0;

    return {
      netUnits:      netUnits,
      totalCost:     totalCost,
      latestNTA:     latestNTA,
      ntaDate:       ntaRow ? ntaRow.date : null,
      portfolioValue: portfolioValue,
      unrealisedPnl:  unrealisedPnl,
      avgCost:        avgCost,
    };
  }

  // ── Dashboard: update account summary metric boxes ─────────
  async function initDashboard(){
    var session = await getSession();
    if(!session) return;

    var data = await loadMemberData(session.user.id);

    // Units Held
    var unitsEl = document.querySelector('.metric-row .mc:nth-child(1) .value');
    var unitsSub = document.querySelector('.metric-row .mc:nth-child(1) .sub');
    if(unitsEl) unitsEl.textContent = fmt(data.netUnits, 4);
    if(unitsSub) unitsSub.textContent = 'Total cost RM ' + fmt(data.totalCost);

    // Current NTA
    var ntaEl  = document.querySelector('.metric-row .mc:nth-child(2) .value');
    var ntaSub = document.querySelector('.metric-row .mc:nth-child(2) .sub');
    if(ntaEl) ntaEl.textContent = 'RM ' + fmt(data.latestNTA, 4);
    if(ntaSub) ntaSub.textContent = 'Avg cost RM ' + fmt(data.avgCost, 4) + '/unit';

    // Unrealised P&L
    var pnlEl  = document.querySelector('.metric-row .mc:nth-child(3) .value');
    var pnlSub = document.querySelector('.metric-row .mc:nth-child(3) .sub');
    if(pnlEl){
      var sign = data.unrealisedPnl >= 0 ? '+' : '';
      pnlEl.textContent  = sign + 'RM ' + fmt(Math.abs(data.unrealisedPnl));
      pnlEl.style.color  = data.unrealisedPnl >= 0 ? 'var(--green)' : 'var(--red)';
    }
    if(pnlSub) pnlSub.textContent = 'Portfolio value RM ' + fmt(data.portfolioValue);

    // Total Portfolio Value (value card in rail)
    var vcVal = document.getElementById('vcValue');
    if(vcVal) vcVal.textContent = 'RM ' + fmt(data.portfolioValue);

    // Update greeting date
    var greetDate = document.querySelector('.ph-xl p');
    if(greetDate && data.ntaDate){
      var name = greetDate.textContent.split('.')[0];
      greetDate.textContent = name + '. Here\'s your investment with ZY-Invest as of ' +
        fmtDate(data.ntaDate) + '.';
    }
  }

  // ── Holdings page: load fund portfolio ─────────────────────
  async function initHoldings(){
    var session = await getSession();
    if(!session) return;

    var data = await loadMemberData(session.user.id);

    // Member's units + value metric boxes
    var elUnits = document.getElementById('hMyUnits');
    var elValue = document.getElementById('hMyValue');
    var elNTA   = document.getElementById('hNTA');
    var elCost  = document.getElementById('hAvgCost');
    if(elUnits) elUnits.textContent = fmt(data.netUnits, 4);
    if(elValue) elValue.textContent = 'RM ' + fmt(data.portfolioValue);
    if(elNTA)   elNTA.textContent   = 'RM ' + fmt(data.latestNTA, 4);
    if(elCost)  elCost.textContent  = 'RM ' + fmt(data.avgCost, 4);

    // Fund portfolio table
    var pfRes = await sb.from('portfolio')
      .select('instrument_name, product, units, total_cost, vwap_cost, market_value, latest_price, unrealised_pnl, weight')
      .order('instrument_name');

    var holdings = pfRes.data || [];
    var tbody    = document.getElementById('hBody');
    if(!tbody || !holdings.length) return;

    // Compute member's proportional ownership
    var totalFundUnits = 0;
    var tuRes = await sb.from('nta_daily').select('total_units').order('date', {ascending:false}).limit(1).single();
    if(tuRes.data) totalFundUnits = parseFloat(tuRes.data.total_units) || 0;
    var ownership = totalFundUnits > 0 ? data.netUnits / totalFundUnits : 0;

    tbody.innerHTML = '';
    holdings.forEach(function(r){
      var isCash = r.instrument_name === 'MYR Cash Account';
      var mv     = parseFloat(r.market_value || r.total_cost || 0);
      var weight = parseFloat(r.weight || 0);
      var myValue = mv * ownership;

      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="hold-name"><b>' + r.instrument_name + '</b></td>' +
        '<td>' + (r.product || '—') + '</td>' +
        '<td class="r">' + (isCash ? '—' : fmt(parseFloat(r.units||0), 4)) + '</td>' +
        '<td class="r">RM ' + fmt(mv) + '</td>' +
        '<td class="r">RM ' + fmt(myValue) + '</td>' +
        '<td class="r">' +
          '<div class="alloc-cell">' +
            '<div class="alloc-bar"><span style="width:' + Math.min(100, weight).toFixed(1) + '%"></span></div>' +
            '<span class="alloc-pct">' + fmt(weight, 2) + '%</span>' +
          '</div>' +
        '</td>';
      tbody.appendChild(tr);
    });
  }

  // ── Router ─────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', function(){
    if(typeof sb === 'undefined' || !sb) return;
    var page = window.location.pathname;
    if(page.indexOf('holdings') > -1){
      initHoldings();
    } else {
      initDashboard();
    }
  });
})();
