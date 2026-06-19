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

    /* ── Logout — sign out then redirect ────────────────────── */
    async function doAdminLogout(){
      try{ await sb.auth.signOut(); }catch(e){}
      localStorage.removeItem('zy_admin_session');
      /* Use replace so browser history doesn't loop back */
      location.replace('admin-login.html');
    }

    var logoutBtn  = document.getElementById('logout');
    var signoutBtn = document.getElementById('admSignout');
    if(logoutBtn)  logoutBtn.onclick  = function(e){ e.preventDefault(); doAdminLogout(); };
    if(signoutBtn) signoutBtn.onclick = function(e){ e.preventDefault(); doAdminLogout(); };

    /* ── Load investors from Supabase ───────────────────────── */
    await loadProfiles();

    /* ── Wire Save button ───────────────────────────────────── */
    var dwSave = document.getElementById('dwSave');
    if(dwSave){
      dwSave.onclick = null;
      dwSave.addEventListener('click', async function(){
        if(typeof curInv === 'undefined' || !curInv) return;
        var nm = document.getElementById('dw-name').value.trim();
        if(!nm){ if(typeof notify==='function') notify('Enter the investor name'); return; }
        curInv.name   = nm;
        curInv.acct   = document.getElementById('dw-acct').value.trim();
        curInv.bank   = document.getElementById('dw-bank').value.trim();
        curInv.acctno = document.getElementById('dw-acctno').value.trim();
        curInv.member = document.getElementById('dw-member').value;
        curInv.status = document.getElementById('dw-status').value;

        if(curInv._sbId){
          var res = await sb.from('profiles').update({
            full_name:       curInv.name,
            bank_name:       curInv.bank,
            bank_account_no: curInv.acctno,
            role:   curInv.member === 'Director' ? 'admin' : 'member',
            status: curInv.status === 'Active' ? 'active' : curInv.status === 'Suspended' ? 'suspended' : 'pending'
          }).eq('id', curInv._sbId);
          if(res.error){ if(typeof notify==='function') notify('Save failed: '+res.error.message); return; }
        }
        if(typeof renderInvestors==='function') renderInvestors();
        if(typeof fillInvestorSelect==='function') fillInvestorSelect();
        if(typeof closeModals==='function') closeModals();
        if(typeof notify==='function') notify('Profile saved — '+nm);
      });
    }

    /* ── Wire Delete button ─────────────────────────────────── */
    var dwDelete = document.getElementById('dwDelete');
    if(dwDelete){
      dwDelete.onclick = null;
      dwDelete.addEventListener('click', async function(){
        if(typeof curInv === 'undefined' || !curInv) return;
        if(!confirm('Suspend '+(curInv.name||'this investor')+'? Their account will be deactivated.')) return;
        if(curInv._sbId){
          var res = await sb.from('profiles').update({ status:'suspended' }).eq('id', curInv._sbId);
          if(res.error){ if(typeof notify==='function') notify('Error: '+res.error.message); return; }
        }
        if(typeof INVESTORS !== 'undefined') INVESTORS = INVESTORS.filter(function(x){ return x !== curInv; });
        if(typeof renderInvestors==='function') renderInvestors();
        if(typeof fillInvestorSelect==='function') fillInvestorSelect();
        if(typeof closeModals==='function') closeModals();
        if(typeof notify==='function') notify('Investor suspended — '+(curInv.name||''));
      });
    }
  });

  /* ── Load all profiles ──────────────────────────────────── */
  async function loadProfiles(){
    var res = await sb.from('profiles').select('*').order('created_at', { ascending:true });
    if(res.error){ console.error('Failed to load profiles:', res.error.message); return; }

    var mapped = (res.data||[]).map(function(p){
      var joined = p.created_at
        ? new Date(p.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
        : '—';
      return {
        _sbId:      p.id,
        id:         p.investor_code || ('ZYI-'+p.id.slice(0,8).toUpperCase()),
        acct:       'ACC-'+p.id.slice(0,8).toUpperCase(),
        name:       p.full_name || '—',
        email:      '',
        nric:       p.nric_passport ? '······-··-····' : '',
        phone:      p.phone || '',
        address:    p.address || '',
        bank:       p.bank_name || '',
        acctno:     p.bank_account_no || '',
        bankHolder: p.bank_account_holder || '',
        member:     p.role === 'admin' ? 'Director' : 'Shareholder',
        units:      '0.00',
        pct:        0.0,
        val:        '0.00',
        joined:     joined,
        status:     p.status === 'active' ? 'Active' : p.status === 'suspended' ? 'Suspended' : 'Pending',
        pw:         ''
      };
    });

    if(typeof INVESTORS !== 'undefined'){
      INVESTORS.length = 0;
      mapped.forEach(function(m){ INVESTORS.push(m); });
    }
    if(typeof renderInvestors==='function') renderInvestors();
    if(typeof fillInvestorSelect==='function') fillInvestorSelect();
  }

})();
