/* ============================================================
   ZY-Invest · Financial Result — Income Statement (live)

   INCOME STATEMENT STRUCTURE (matching image):
   ── REVENUE ────────────────────────────────────────────────
   Dividend Income        → dividend.amount WHERE status='Received', grouped by ex_date in FY
   Interest & Fixed Income→ transaction_others WHERE category ILIKE '%interest%' (amount)
                          + settlement WHERE product='Cash Funds' (pnl, i.e. fund distribution income)
   Total Revenue          → sum of above

   ── OPERATING COSTS ────────────────────────────────────────
   Management Fees        → remuneration WHERE fee_type ILIKE '%management%' AND status='Paid'
   Performance Fees       → remuneration WHERE fee_type ILIKE '%performance%' AND status='Paid'
   Total Costs            → sum (shown negative)
   Gross Profit           → Total Revenue − |Total Costs|

   ── OTHER INCOME / (LOSS) ──────────────────────────────────
   Realised P&L           → settlement.pnl WHERE product != 'Cash Funds'
   Unrealised Gains/(Loss)→ portfolio.unrealised_pnl (securities only, current snapshot)
                            Note: only applies to the CURRENT FY (last FY in list)
   Other Income           → transaction_others WHERE category NOT ILIKE '%interest%'
   Total Other Income     → sum
   Net Profit / (Loss)    → Gross Profit + Total Other Income

   ── PER SHARE ──────────────────────────────────────────────
   Outstanding Shares     → net capital_injection units (Approved) as at FY end_date
   GPS (sen)              → distributions dps for the FY (sum, in sen)
   EPS (sen)              → Net Profit / Outstanding Shares × 100
   ============================================================ */
(function(){

  function fmt2(n){ return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function fmt4(n){ return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:4,maximumFractionDigits:4}); }

  // Format number as income statement style:
  // positive → green, negative → red with brackets e.g. (1,234.56)
  function fmtIS(n, alwaysColour){
    var v = parseFloat(n)||0;
    if(v === 0) return '<span style="color:var(--fg-3);">—</span>';
    if(v > 0) return '<span style="color:var(--green);">'+fmt2(v)+'</span>';
    return '<span style="color:var(--red);">('+fmt2(Math.abs(v))+')</span>';
  }
  function fmtISBold(n){
    var v = parseFloat(n)||0;
    if(v === 0) return '<b style="color:var(--fg-3);">—</b>';
    if(v > 0) return '<b style="color:var(--green);">'+fmt2(v)+'</b>';
    return '<b style="color:var(--red);">('+fmt2(Math.abs(v))+')</b>';
  }
  function fmtPlain(n){
    var v = parseFloat(n)||0;
    if(v === 0) return '<span style="color:var(--fg-3);">—</span>';
    return '<span>'+fmt4(v)+'</span>';
  }

  // ── helper: is a date within an FY ──────────────────────
  function inFY(date, fy){ return date >= fy.start_date && date <= fy.end_date; }

  // ── build one <th> or <td> cell ─────────────────────────
  function th(content){ return '<th class="td-right">'+content+'</th>'; }
  function td(content){ return '<td class="td-right">'+content+'</td>'; }

  // ── section header row ───────────────────────────────────
  function sectionRow(label, colCount){
    return '<tr><td colspan="'+(colCount+1)+'" style="padding:14px 18px 6px;font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--fg-3);border-top:2px solid var(--border);">'+label+'</td></tr>';
  }

  // ── subtotal row ─────────────────────────────────────────
  function subtotalRow(label, values, formatter){
    var cells = values.map(function(v){ return td((formatter||fmtISBold)(v)); }).join('');
    return '<tr style="border-top:1px solid var(--border);"><td style="padding:10px 18px;font-weight:700;color:var(--fg-1);">'+label+'</td>'+cells+'</tr>';
  }

  // ── data row ─────────────────────────────────────────────
  function dataRow(label, values, formatter, indent){
    var pad = indent ? 'padding-left:32px;' : '';
    var cells = values.map(function(v){ return td((formatter||fmtIS)(v)); }).join('');
    return '<tr><td style="padding:9px 18px;'+pad+'color:var(--fg-2);">'+label+'</td>'+cells+'</tr>';
  }

  // ── main load & compute ──────────────────────────────────
  async function load(){
    if(typeof sb === 'undefined' || !sb) return;

    var tbody = document.getElementById('isBody');
    var thead = document.getElementById('isThead');
    if(tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;color:var(--fg-3);">Loading…</td></tr>';

    try{
      // ── 1. Fetch all data in parallel ─────────────────────
      var [fyRes, divRes, othersRes, remRes, settlRes, pfRes, distRes, ciRes] = await Promise.all([
        sb.from('fy_settings').select('*').order('start_date', {ascending:true}),
        sb.from('dividend').select('amount,ex_date,status'),
        sb.from('transaction_others').select('amount,date,category'),
        sb.from('remuneration').select('amount,date,fee_type,status'),
        sb.from('settlement').select('pnl,date,product'),
        sb.from('portfolio').select('unrealised_pnl,product,instrument_name'),
        sb.from('distributions').select('dps,ex_date,status'),
        sb.from('capital_injection').select('units,date,status').eq('status','Approved')
      ]);

      if(fyRes.error) throw fyRes.error;
      var FYS = fyRes.data || [];
      if(!FYS.length){
        if(tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;color:var(--fg-3);">No financial years defined.</td></tr>';
        return;
      }

      var divRows    = divRes.data    || [];
      var otherRows  = othersRes.data || [];
      var remRows    = remRes.data    || [];
      var settlRows  = settlRes.data  || [];
      var pfRows     = pfRes.data     || [];
      var distRows   = distRes.data   || [];
      var ciRows     = ciRes.data     || [];

      var N = FYS.length;

      // ── 2. Compute per-FY figures ─────────────────────────
      var dividendIncome     = [];
      var interestIncome     = [];
      var mgmtFees           = [];
      var perfFees           = [];
      var realisedPnl        = [];
      var unrealisedGains    = [];
      var otherIncome        = [];
      var outstandingShares  = [];
      var gps                = [];  // gross per share (sen)

      FYS.forEach(function(fy, i){
        var isCurrentFY = (i === N - 1);

        // REVENUE: Dividend Income — received dividends within FY (using ex_date)
        var div = divRows
          .filter(function(r){ return r.status==='Received' && r.ex_date && inFY(r.ex_date, fy); })
          .reduce(function(s,r){ return s + (parseFloat(r.amount)||0); }, 0);
        dividendIncome.push(div);

        // REVENUE: Interest & Fixed Income
        //   a) transaction_others where category contains 'interest'
        var interestOthers = otherRows
          .filter(function(r){ return r.date && inFY(r.date, fy) && (r.category||'').toLowerCase().indexOf('interest') > -1; })
          .reduce(function(s,r){ return s + (parseFloat(r.amount)||0); }, 0);
        //   b) settlement where product = 'Cash Funds' (fund distribution counted as interest)
        var interestCashFunds = settlRows
          .filter(function(r){ return r.date && inFY(r.date, fy) && r.product === 'Cash Funds'; })
          .reduce(function(s,r){ return s + (parseFloat(r.pnl)||0); }, 0);
        interestIncome.push(interestOthers + interestCashFunds);

        // OPERATING COSTS: Management Fees (Paid only)
        var mgmt = remRows
          .filter(function(r){ return r.status==='Paid' && r.date && inFY(r.date, fy) && (r.fee_type||'').toLowerCase().indexOf('management') > -1; })
          .reduce(function(s,r){ return s + (parseFloat(r.amount)||0); }, 0);
        mgmtFees.push(-mgmt);  // store as negative

        // OPERATING COSTS: Performance Fees (Paid only)
        var perf = remRows
          .filter(function(r){ return r.status==='Paid' && r.date && inFY(r.date, fy) && (r.fee_type||'').toLowerCase().indexOf('performance') > -1; })
          .reduce(function(s,r){ return s + (parseFloat(r.amount)||0); }, 0);
        perfFees.push(-perf);  // store as negative

        // OTHER INCOME: Realised P&L (exclude Cash Funds — already counted above)
        var realised = settlRows
          .filter(function(r){ return r.date && inFY(r.date, fy) && r.product !== 'Cash Funds'; })
          .reduce(function(s,r){ return s + (parseFloat(r.pnl)||0); }, 0);
        realisedPnl.push(realised);

        // OTHER INCOME: Unrealised Gains/(Loss)
        // Only meaningful for current FY (live snapshot from portfolio table)
        // For closed FYs this would need historical snapshots — show 0 unless current
        if(isCurrentFY){
          var unrealised = pfRows
            .filter(function(r){ return r.product==='Securities'; })
            .reduce(function(s,r){ return s + (parseFloat(r.unrealised_pnl)||0); }, 0);
          unrealisedGains.push(unrealised);
        } else {
          unrealisedGains.push(0);
        }

        // OTHER INCOME: Other Income (non-interest transaction_others)
        var other = otherRows
          .filter(function(r){ return r.date && inFY(r.date, fy) && (r.category||'').toLowerCase().indexOf('interest') === -1; })
          .reduce(function(s,r){ return s + (parseFloat(r.amount)||0); }, 0);
        otherIncome.push(other);

        // PER SHARE: Outstanding shares as at FY end_date
        var netUnits = ciRows
          .filter(function(r){ return r.date && r.date <= fy.end_date; })
          .reduce(function(s,r){ return s + (parseFloat(r.units)||0); }, 0);
        outstandingShares.push(Math.max(0, netUnits));

        // PER SHARE: GPS — sum of dps declared within FY (already in sen)
        var fyDps = distRows
          .filter(function(r){ return r.ex_date && inFY(r.ex_date, fy); })
          .reduce(function(s,r){ return s + (parseFloat(r.dps)||0); }, 0);
        gps.push(fyDps);
      });

      // ── 3. Derive totals ──────────────────────────────────
      var totalRevenue    = FYS.map(function(_,i){ return dividendIncome[i] + interestIncome[i]; });
      var totalCosts      = FYS.map(function(_,i){ return mgmtFees[i] + perfFees[i]; }); // already negative
      var grossProfit     = FYS.map(function(_,i){ return totalRevenue[i] + totalCosts[i]; });
      var totalOtherInc   = FYS.map(function(_,i){ return realisedPnl[i] + unrealisedGains[i] + otherIncome[i]; });
      var netProfit       = FYS.map(function(_,i){ return grossProfit[i] + totalOtherInc[i]; });
      var eps             = FYS.map(function(_,i){
        return outstandingShares[i] > 0 ? (netProfit[i] / outstandingShares[i]) * 100 : 0;
      });

      // ── 4. Build table header ─────────────────────────────
      if(thead){
        var isCurrentLast = true;
        thead.innerHTML = '<tr><th>ITEM (RM)</th>' +
          FYS.map(function(fy, i){
            var label = fy.label + (i === N-1 ? ' *' : '');
            return th(label);
          }).join('') + '</tr>';
      }

      // ── 5. Build table body ───────────────────────────────
      var html = '';
      var cols = N;

      // REVENUE section
      html += sectionRow('REVENUE', cols);
      html += dataRow('Dividend Income',          dividendIncome,  fmtIS, true);
      html += dataRow('Interest &amp; Fixed Income', interestIncome, fmtIS, true);
      html += subtotalRow('Total Revenue',        totalRevenue,    fmtISBold);

      // OPERATING COSTS section
      html += sectionRow('OPERATING COSTS', cols);
      html += dataRow('Management Fees',          mgmtFees,        fmtIS, true);
      html += dataRow('Performance Fees',         perfFees,        fmtIS, true);
      html += subtotalRow('Total Costs',          totalCosts,      fmtISBold);
      html += subtotalRow('Gross Profit',         grossProfit,     fmtISBold);

      // OTHER INCOME / (LOSS) section
      html += sectionRow('OTHER INCOME / (LOSS)', cols);
      html += dataRow('Realised P&amp;L',               realisedPnl,    fmtIS, true);
      html += dataRow('Unrealised Gains / (Loss)', unrealisedGains, fmtIS, true);
      html += dataRow('Other Income',             otherIncome,    fmtIS, true);
      html += subtotalRow('Total Other Income',   totalOtherInc,  fmtISBold);
      html += subtotalRow('Net Profit / (Loss)',  netProfit,      fmtISBold);

      // PER SHARE section
      html += sectionRow('PER SHARE', cols);
      html += dataRow('Outstanding Shares (units)', outstandingShares, function(v){
        var n = parseFloat(v)||0;
        return n > 0 ? '<span>'+n.toLocaleString('en-MY',{minimumFractionDigits:6,maximumFractionDigits:6})+'</span>' : '<span style="color:var(--fg-3);">—</span>';
      }, false);
      html += dataRow('GPS (sen)', gps, function(v){
        var n = parseFloat(v)||0;
        return n > 0 ? '<span>'+n.toLocaleString('en-MY',{minimumFractionDigits:4,maximumFractionDigits:4})+'</span>' : '<span style="color:var(--fg-3);">—</span>';
      }, false);
      html += dataRow('EPS (sen)', eps, function(v){
        var n = parseFloat(v)||0;
        if(n === 0) return '<span style="color:var(--fg-3);">—</span>';
        if(n > 0) return '<span>'+n.toLocaleString('en-MY',{minimumFractionDigits:4,maximumFractionDigits:4})+'</span>';
        return '<span style="color:var(--red);">('+Math.abs(n).toLocaleString('en-MY',{minimumFractionDigits:4,maximumFractionDigits:4})+')</span>';
      }, false);

      if(tbody) tbody.innerHTML = html;

      // ── 6. Current FY note ────────────────────────────────
      var note = document.getElementById('isNote');
      if(note && FYS.length){
        var lastFY = FYS[N-1];
        note.textContent = '* '+lastFY.label+' figures are year-to-date and unaudited. Unrealised gains reflect current portfolio snapshot.';
      }

    }catch(ex){
      console.error('Financial result load error:', ex);
      if(tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;color:var(--red);">Failed to load: '+(ex.message||'Unknown error')+'</td></tr>';
    }
  }

  window.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){
      if(typeof sb !== 'undefined' && sb) load();
    }, 600);
  });

})();
