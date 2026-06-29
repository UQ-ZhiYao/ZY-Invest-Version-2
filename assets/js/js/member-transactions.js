/* ============================================================
   ZY-Invest · Principal Transactions — live DB
   Linked from: members/transactions.html

   Metric rules:
   - Units Subscribed : sum of positive units (Approved)
   - Units Redeemed   : sum of |negative units| (Approved) — absolute, shown in RED
   - Net Units        : direct sum of all signed units (Approved) — blue
   - Pending          : count of Pending transactions
   ============================================================ */
(function(){
  var ALL_TX = [];

  function fmt(n, dp){
    var d = dp === undefined ? 2 : dp;
    return parseFloat(n||0).toLocaleString('en-MY', {minimumFractionDigits:d, maximumFractionDigits:d});
  }
  function fmtDate(d){
    if(!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
  }
  function tTag(t){
    if(t === 'Subscription')
      return '<span class="tag-green" style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:0.76rem;font-weight:700;background:#D1FAE5;color:#065F46;">Subscription</span>';
    return '<span class="tag-red" style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:0.76rem;font-weight:700;background:#FEE2E2;color:#991B1B;">Redemption</span>';
  }
  function sPill(s){
    var v = (s||'pending').toLowerCase();
    if(v === 'approved') return '<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:0.74rem;font-weight:700;background:#D1FAE5;color:#065F46;">Approved</span>';
    if(v === 'rejected') return '<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:0.74rem;font-weight:700;background:#FEE2E2;color:#991B1B;">Rejected</span>';
    return '<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:0.74rem;font-weight:700;background:#FEF9C3;color:#854D0E;">Pending</span>';
  }

  // ── Metrics ────────────────────────────────────────────────
  function updateMetrics(txns){
    var approved = txns.filter(function(r){ return (r.status||'').toLowerCase() === 'approved'; });

    // Units Subscribed: sum of positive units
    var subUnits = approved.reduce(function(s, r){
      var u = parseFloat(r.units||0);
      return s + (u > 0 ? u : 0);
    }, 0);

    // Units Redeemed: sum of |negative units| — absolute value, red
    var redUnits = approved.reduce(function(s, r){
      var u = parseFloat(r.units||0);
      return s + (u < 0 ? Math.abs(u) : 0);
    }, 0);

    // Net Units: direct sum of all signed units
    var netUnits = approved.reduce(function(s, r){ return s + parseFloat(r.units||0); }, 0);

    // Pending count
    var pending = txns.filter(function(r){ return (r.status||'').toLowerCase() === 'pending'; }).length;

    // Subscription count
    var subCount = approved.filter(function(r){ return parseFloat(r.units||0) > 0; }).length;
    var redCount = approved.filter(function(r){ return parseFloat(r.units||0) < 0; }).length;

    // Units Subscribed box
    var elSub = document.getElementById('mcSubscribed');
    var elSubCount = document.getElementById('mcSubCount');
    if(elSub) elSub.textContent = fmt(subUnits, 4);
    if(elSubCount) elSubCount.textContent = subCount + ' subscription' + (subCount !== 1 ? 's' : '');

    // Units Redeemed box — absolute figure in red
    var elRed = document.getElementById('mcRedeemed');
    var elRedCount = document.getElementById('mcRedCount');
    if(elRed){
      elRed.textContent  = fmt(redUnits, 4);
      elRed.style.color  = redUnits > 0 ? 'var(--red)' : 'var(--fg-1)';
    }
    if(elRedCount) elRedCount.textContent = redCount + ' redemption' + (redCount !== 1 ? 's' : '');

    // Net Units box — blue
    var elNet = document.getElementById('mcNet');
    if(elNet){
      elNet.textContent = fmt(netUnits, 4);
      elNet.style.color = 'var(--blue)';
    }

    // Pending box
    var elPending = document.getElementById('mcPending');
    if(elPending) elPending.textContent = pending;
  }

  // ── Render table ───────────────────────────────────────────
  function renderTable(txns){
    var tbody = document.getElementById('txBody');
    if(!tbody) return;

    if(!txns.length){
      tbody.innerHTML = '<tr><td colspan="7" style="padding:24px;color:var(--fg-3);">No transactions found.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    txns.forEach(function(r){
      var units  = parseFloat(r.units||0);
      var amount = parseFloat(r.amount||0);
      var isRed  = units < 0;

      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + fmtDate(r.date) + '</td>' +
        '<td>' + tTag(r.type) + '</td>' +
        '<td>' + (r.reference_id || '—') + '</td>' +
        '<td class="r" style="' + (isRed ? 'color:var(--red);' : '') + '">' +
          (isRed ? '−' : '+') + fmt(Math.abs(units), 4) +
        '</td>' +
        '<td class="r">' + fmt(parseFloat(r.nta||0), 4) + '</td>' +
        '<td class="r">' + fmt(Math.abs(amount)) + '</td>' +
        '<td class="r">' + sPill(r.status) + '</td>';
      tbody.appendChild(tr);
    });
  }

  // ── Load ───────────────────────────────────────────────────
  async function loadAll(){
    if(typeof sb === 'undefined' || !sb) return;

    var sres = await sb.auth.getSession();
    if(!sres.data || !sres.data.session){
      window.location.href = '../login.html'; return;
    }
    var session = sres.data.session;
    var userId  = session.user.id;

    // Populate nav user info
    var pres = await sb.from('profiles').select('full_name, preferred_name').eq('id', userId).single();
    if(pres.data){
      var name = pres.data.preferred_name || pres.data.full_name || session.user.email;
      var navName = document.getElementById('navName');
      if(navName) navName.textContent = name;
    }

    // Load ALL transactions for this member (all statuses for pending count)
    var res = await sb.from('capital_injection')
      .select('*')
      .eq('uid', userId)
      .order('date', {ascending: false});

    if(res.error){
      var txBody = document.getElementById('txBody');
      if(txBody) txBody.innerHTML = '<tr><td colspan="7" style="padding:24px;color:var(--red);">Failed to load: ' + res.error.message + '</td></tr>';
      return;
    }

    ALL_TX = res.data || [];
    updateMetrics(ALL_TX);
    renderTable(ALL_TX);
  }

  window.addEventListener('DOMContentLoaded', loadAll);
})();
