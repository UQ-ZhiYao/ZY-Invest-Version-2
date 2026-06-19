/* ============================================================
   ZY-Invest · Admin Supabase Integration
   ============================================================ */
(function(){

  window.addEventListener('DOMContentLoaded', async function(){

    if(typeof sb === 'undefined' || !sb){ return; }

    /* ── Verify session ──────────────────────────────────────── */
    var sessionRes = await sb.auth.getSession();
    if(!sessionRes.data || !sessionRes.data.session){
      localStorage.removeItem('zy_admin_session');
      location.replace('admin-login.html');
      return;
    }

    var session = sessionRes.data.session;
    var userId  = session.user.id;

    var profileRes = await sb.from('profiles').select('role,full_name,preferred_name').eq('id', userId).single();
    if(!profileRes.data || profileRes.data.role !== 'admin'){
      await sb.auth.signOut();
      localStorage.removeItem('zy_admin_session');
      location.replace('admin-login.html');
      return;
    }

    /* ── Update top bar with real name ──────────────────────── */
    var adminName = profileRes.data.preferred_name || profileRes.data.full_name || session.user.email;
    var av = adminName.split(' ').map(function(w){ return w[0]||''; }).join('').toUpperCase().slice(0,3);
    var nmEl = document.querySelector('.adm-user .nm');
    var avEl = document.querySelector('.adm-user .av');
    if(nmEl) nmEl.textContent = adminName;
    if(avEl) avEl.textContent = av;

    /* ── Logout ─────────────────────────────────────────────── */
    async function doAdminLogout(){
      try{ await sb.auth.signOut(); }catch(e){}
      localStorage.removeItem('zy_admin_session');
      location.replace('admin-login.html');
    }
    var logoutBtn  = document.getElementById('logout');
    var signoutBtn = document.getElementById('admSignout');
    if(logoutBtn)  logoutBtn.onclick  = function(e){ e.preventDefault(); doAdminLogout(); };
    if(signoutBtn) signoutBtn.onclick = function(e){ e.preventDefault(); doAdminLogout(); };

    /* ── Load investors from Supabase ───────────────────────── */
    await loadProfiles();

    /* ── Override renderInvestors to show real profile data ─── */
    var origRender = typeof renderInvestors === 'function' ? renderInvestors : null;
    window.renderInvestors = function(){
      var invBody = document.getElementById('invBody');
      if(!invBody) return;
      invBody.innerHTML = '';
      var invMem = window._invMem || '';
      var invQ   = window._invQ   || '';
      var list = INVESTORS.filter(function(m){
        if(invMem && m.member !== invMem) return false;
        if(invQ && (m.name + ' ' + m.phone + ' ' + m.email).toLowerCase().indexOf(invQ) === -1) return false;
        return true;
      });
      list.forEach(function(m){
        var tr = document.createElement('tr'); tr.className = 'clickable';
        tr.innerHTML = '<td class="hold-name"><b>' + m.name + '</b><span>' + (m.phone || '—') + '</span></td>'
          + '<td>' + memPill(m.member) + '</td>'
          + '<td>' + (m.joined || '—') + '</td>'
          + '<td>' + (m.bank || '—') + '</td>'
          + '<td>' + pill(m.status) + '</td>';
        tr.addEventListener('click', function(){ openDrawer(m); });
        invBody.appendChild(tr);
      });
      var countEl = document.getElementById('invCount');
      if(countEl) countEl.textContent = list.length + ' of record';
    };

    /* ── Override openDrawer to populate real fields ─────────── */
    window.openDrawer = function(m){
      window.curInv = m;
      var dwAv   = document.getElementById('dwAv');
      var dwName = document.getElementById('dwName');
      var dwId   = document.getElementById('dwId');
      if(dwAv)   dwAv.textContent   = (m.name||'?').split(' ').filter(Boolean).slice(0,2).map(function(w){return w[0];}).join('').toUpperCase();
      if(dwName) dwName.textContent = m.name || 'New Investor';
      if(dwId)   dwId.textContent   = m.status;

      var dwUnits = document.getElementById('dwUnits');
      var dwPct   = document.getElementById('dwPct');
      var dwVal   = document.getElementById('dwVal');
      var dwSince = document.getElementById('dwSince');
      if(dwUnits) dwUnits.textContent = m.units || '—';
      if(dwPct)   dwPct.textContent   = (m.pct||0).toFixed(1) + '%';
      if(dwVal)   dwVal.textContent   = 'RM ' + (m.val || '0.00');
      if(dwSince) dwSince.textContent = m.joined || '—';

      // Profile fields
      var fName   = document.getElementById('dw-name');
      var fPhone  = document.getElementById('dw-phone');
      var fBank   = document.getElementById('dw-bank');
      var fAcctno = document.getElementById('dw-acctno');
      var fHolder = document.getElementById('dw-bankHolder');
      var fMember = document.getElementById('dw-member');
      var fStatus = document.getElementById('dw-status');
      if(fName)   fName.value   = m.name   || '';
      if(fPhone)  fPhone.value  = m.phone  || '';
      if(fBank)   fBank.value   = m.bank   || '';
      if(fAcctno) fAcctno.value = m.acctno || '';
      if(fHolder) fHolder.value = m.bankHolder || '';
      if(fMember) fMember.value = m.member || 'Shareholder';
      if(fStatus) fStatus.value = m.status || 'Pending';

      var memhint = document.getElementById('dw-memhint');
      var MEMHINT = {
        'Shareholder': 'Family members and investors — eligible to subscribe for and hold units in the fund.',
        'Director':    'Admin / fund manager with indirect interest. Remuneration may be applied to subscribe for units.',
        'Non-member':  'Registered account holder, not permitted to invest or hold units.'
      };
      if(memhint) memhint.textContent = MEMHINT[m.member] || '';

      if(typeof openModal === 'function') openModal('invModal');
    };

    /* ── Re-wire search and filter to use new renderInvestors ── */
    var invSearch = document.getElementById('invSearch');
    if(invSearch){
      invSearch.oninput = function(){
        window._invQ = this.value.toLowerCase();
        renderInvestors();
      };
    }
    document.querySelectorAll('.filter-bar .chip').forEach(function(c){
      c.onclick = function(){
        document.querySelectorAll('.filter-bar .chip').forEach(function(x){ x.classList.remove('active'); });
        c.classList.add('active');
        window._invMem = c.dataset.mem || '';
        renderInvestors();
      };
    });

    /* ── Wire Save button ───────────────────────────────────── */
    var dwSave = document.getElementById('dwSave');
    if(dwSave){
      dwSave.onclick = null;
      dwSave.addEventListener('click', async function(){
        var m = window.curInv;
        if(!m) return;
        var nm = (document.getElementById('dw-name')||{}).value || '';
        nm = nm.trim();
        if(!nm){ if(typeof notify==='function') notify('Enter the investor name'); return; }

        m.name       = nm;
        m.phone      = (document.getElementById('dw-phone')||{}).value   || '';
        m.bank       = (document.getElementById('dw-bank')||{}).value    || '';
        m.acctno     = (document.getElementById('dw-acctno')||{}).value  || '';
        m.bankHolder = (document.getElementById('dw-bankHolder')||{}).value || '';
        m.member     = (document.getElementById('dw-member')||{}).value  || 'Shareholder';
        m.status     = (document.getElementById('dw-status')||{}).value  || 'Pending';

        if(m._sbId){
          var res = await sb.from('profiles').update({
            full_name:           m.name,
            phone:               m.phone   || null,
            bank_name:           m.bank    || null,
            bank_account_no:     m.acctno  || null,
            bank_account_holder: m.bankHolder || null,
            role:   m.member === 'Director' ? 'admin' : 'member',
            status: m.status === 'Active' ? 'active' : m.status === 'Suspended' ? 'suspended' : 'pending'
          }).eq('id', m._sbId);
          if(res.error){ if(typeof notify==='function') notify('Save failed: ' + res.error.message); return; }
        }

        renderInvestors();
        if(typeof fillInvestorSelect==='function') fillInvestorSelect();
        if(typeof closeModals==='function') closeModals();
        if(typeof notify==='function') notify('Profile saved — ' + nm);
      });
    }

    /* ── Wire Delete/Suspend button ─────────────────────────── */
    var dwDelete = document.getElementById('dwDelete');
    if(dwDelete){
      dwDelete.onclick = null;
      dwDelete.addEventListener('click', async function(){
        var m = window.curInv;
        if(!m) return;
        if(!confirm('Suspend ' + (m.name||'this investor') + '? Their account will be deactivated.')) return;
        if(m._sbId){
          var res = await sb.from('profiles').update({ status: 'suspended' }).eq('id', m._sbId);
          if(res.error){ if(typeof notify==='function') notify('Error: ' + res.error.message); return; }
        }
        INVESTORS = INVESTORS.filter(function(x){ return x !== m; });
        renderInvestors();
        if(typeof fillInvestorSelect==='function') fillInvestorSelect();
        if(typeof closeModals==='function') closeModals();
        if(typeof notify==='function') notify('Investor suspended — ' + (m.name||''));
      });
    }

  }); // end DOMContentLoaded

  /* ── Load all profiles from Supabase ───────────────────────── */
  async function loadProfiles(){
    var res = await sb.from('profiles').select('*').order('created_at', { ascending: true });
    if(res.error){ console.error('Failed to load profiles:', res.error.message); return; }

    var mapped = (res.data||[]).map(function(p){
      var joined = p.created_at
        ? new Date(p.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
        : '—';
      return {
        _sbId:       p.id,
        id:          p.investor_code || ('ZYI-' + p.id.slice(0,8).toUpperCase()),
        name:        p.full_name        || '—',
        phone:       p.phone            || '',
        address:     p.address          || '',
        bank:        p.bank_name        || '',
        acctno:      p.bank_account_no  || '',
        bankHolder:  p.bank_account_holder || '',
        nationality: p.nationality      || '',
        dob:         p.date_of_birth    || '',
        nric:        p.nric_passport    ? '······-··-····' : '',
        member:      p.role === 'admin' ? 'Director' : 'Shareholder',
        units:       '0.00',
        pct:         0.0,
        val:         '0.00',
        joined:      joined,
        status:      p.status === 'active' ? 'Active' : p.status === 'suspended' ? 'Suspended' : 'Pending',
        pw:          ''
      };
    });

    if(typeof INVESTORS !== 'undefined'){
      INVESTORS.length = 0;
      mapped.forEach(function(m){ INVESTORS.push(m); });
    }

    renderInvestors();
    if(typeof fillInvestorSelect==='function') fillInvestorSelect();
  }

})();
