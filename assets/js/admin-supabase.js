/* ============================================================
   ZY-Invest · Admin Supabase Integration (per-page safe)
   - Verifies admin session on every admin page
   - Wires the two logout buttons to Supabase signOut
   - On investors.html: loads, renders, edits investors live
   ============================================================ */
(function(){

  function initials(n){ return (n||'?').split(' ').filter(Boolean).slice(0,2).map(function(w){return w[0];}).join('').toUpperCase(); }
  function pill(s){ return s==='Active'?'<span class="pill-ok">Active</span>':s==='Suspended'?'<span class="pill-rej">Suspended</span>':'<span class="pill-warn">Pending</span>'; }
  function memPill(t){ if(t==='Director')return '<span class="mem-pill dir">Director</span>'; if(t==='Non-member')return '<span class="mem-pill non">Non-member</span>'; return '<span class="mem-pill sh">Shareholder</span>'; }

  var INVESTORS=[];   // populated from Supabase
  var curInv=null;

  window.addEventListener('DOMContentLoaded', async function(){
    if(typeof sb==='undefined' || !sb) return;

    // ---- session guard ----
    var sres=await sb.auth.getSession();
    if(!sres.data || !sres.data.session){ localStorage.removeItem('zy_admin_session'); location.replace('admin-login.html'); return; }
    var userId=sres.data.session.user.id;

    var pres=await sb.from('profiles').select('role,full_name,preferred_name').eq('id',userId).single();
    if(!pres.data || pres.data.role!=='admin'){ await sb.auth.signOut(); localStorage.removeItem('zy_admin_session'); location.replace('admin-login.html'); return; }

    // ---- top bar name ----
    var adminName=pres.data.preferred_name||pres.data.full_name||sres.data.session.user.email;
    var av=initials(adminName);
    var nmEl=document.querySelector('.adm-user .nm'); if(nmEl) nmEl.textContent=adminName;
    var avEl=document.querySelector('.adm-user .av'); if(avEl) avEl.textContent=av;

    // ---- logout (both buttons) ----
    async function doAdminLogout(e){ if(e) e.preventDefault(); try{ await sb.auth.signOut(); }catch(x){} localStorage.removeItem('zy_admin_session'); location.replace('admin-login.html'); }
    var lo=document.getElementById('logout'); if(lo){ lo.onclick=doAdminLogout; }
    var so=document.getElementById('admSignout'); if(so){ so.onclick=doAdminLogout; }

    // ---- investors page only ----
    if(document.getElementById('invBody')){
      await loadInvestors();
      wireInvestors(userId);
    }
  });

  async function loadInvestors(){
    var res=await sb.from('profiles').select('*').order('created_at',{ascending:true});
    if(res.error){ if(window.zyToast) zyToast('Load failed: '+res.error.message); return; }
    if(!res.data || res.data.length===0){
      if(window.zyToast) zyToast('No rows returned from profiles. Check the table read policy and that is_admin() returns true for your account.');
    }
    INVESTORS=(res.data||[]).map(function(p){
      var joined=p.created_at?new Date(p.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
      return {
        _sbId:p.id,
        _email:p.email||'',
        name:p.full_name||'—',
        phone:p.phone||'',
        email:p.email||'',
        address:p.address||'',
        bank:p.bank_name||'',
        acctno:p.bank_account_no||'',
        bankHolder:p.bank_account_holder||'',
        member:p.role==='admin'?'Director':'Shareholder',
        units:'0.00', pct:0.0, val:'0.00',
        joined:joined,
        status:p.status==='active'?'Active':p.status==='suspended'?'Suspended':'Pending'
      };
    });
    renderInvestors();
  }

  var invMem='', invQ='';
  function renderInvestors(){
    var invBody=document.getElementById('invBody'); if(!invBody) return;
    invBody.innerHTML='';
    var list=INVESTORS.filter(function(m){
      if(invMem && m.member!==invMem) return false;
      if(invQ && (m.name+' '+(m.phone||'')+' '+(m.bank||'')).toLowerCase().indexOf(invQ)===-1) return false;
      return true;
    });
    list.forEach(function(m){
      var tr=document.createElement('tr'); tr.className='clickable';
      tr.innerHTML='<td class="hold-name"><b>'+m.name+'</b><span>'+(m.phone||'—')+'</span></td>'
        +'<td>'+memPill(m.member)+'</td>'
        +'<td class="td-sub">'+(m.joined||'—')+'</td>'
        +'<td class="td-sub">'+(m.bank||'—')+'</td>'
        +'<td>'+pill(m.status)+'</td>';
      tr.addEventListener('click',function(){ openDrawer(m); });
      invBody.appendChild(tr);
    });
    var c=document.getElementById('invCount'); if(c) c.textContent=list.length+' of record';
  }

  var MEMHINT={
    'Shareholder':'Family members and investors — eligible to subscribe for and hold units in the fund.',
    'Director':'Admin / fund manager with indirect interest. Remuneration may be applied to subscribe for units.',
    'Non-member':'Registered account holder, not permitted to invest or hold units.'
  };
  function refreshMemHint(){ var h=document.getElementById('dw-memhint'); if(h) h.textContent=MEMHINT[document.getElementById('dw-member').value]||''; }

  function openDrawer(m){
    curInv=m;
    document.getElementById('dwAv').textContent=initials(m.name||'? ?');
    document.getElementById('dwName').textContent=m.name||'New Investor';
    document.getElementById('dwId').textContent=m.status||'—';
    document.getElementById('dwUnits').textContent=m.units||'—';
    document.getElementById('dwPct').textContent=(m.pct||0).toFixed(1)+'%';
    document.getElementById('dwVal').textContent='RM '+(m.val||'0.00');
    document.getElementById('dwSince').textContent=m.joined||'—';
    document.getElementById('dw-name').value=m.name||'';
    document.getElementById('dw-phone').value=m.phone||'';
    document.getElementById('dw-email').value=m.email||'';
    document.getElementById('dw-address').value=m.address||'';
    document.getElementById('dw-bank').value=m.bank||'';
    document.getElementById('dw-acctno').value=m.acctno||'';
    document.getElementById('dw-bankHolder').value=m.bankHolder||'';
    document.getElementById('dw-member').value=m.member||'Shareholder';
    document.getElementById('dw-status').value=m.status||'Pending';
    // Reset password fields
    document.getElementById('dw-pw-new').value='';
    document.getElementById('dw-pw-new').type='password';
    document.getElementById('dw-pwNewToggle').textContent='Show';
    document.getElementById('dw-pw-confirm').value='';
    document.getElementById('dw-pw-confirm').type='password';
    document.getElementById('dw-pwConfirmToggle').textContent='Show';
    document.getElementById('dw-pw-hint').textContent='Leave blank to keep existing password unchanged.';
    document.getElementById('dw-pw-hint').style.color='var(--fg-3)';
    refreshMemHint();
    zyModalOpen('invModal');
  }

  function wireInvestors(userId){
    var _is=document.getElementById('invSearch');
    function _clearSearch(){ if(_is && _is.value){ _is.value=''; invQ=''; renderInvestors(); } }
    _is.value=''; invQ='';
    // Chrome can refill after load; clear repeatedly over the first second
    [50,200,500,1000].forEach(function(ms){ setTimeout(_clearSearch, ms); });
    _is.addEventListener('input',function(){ invQ=this.value.toLowerCase(); renderInvestors(); });
    document.querySelectorAll('.filter-bar .chip').forEach(function(c){ c.addEventListener('click',function(){ document.querySelectorAll('.filter-bar .chip').forEach(function(x){x.classList.remove('active');}); c.classList.add('active'); invMem=c.dataset.mem||''; renderInvestors(); }); });
    document.getElementById('dw-member').addEventListener('change',refreshMemHint);
    document.getElementById('dw-2fa').addEventListener('click',function(){ this.classList.toggle('on'); });
    document.getElementById('dw-notif').addEventListener('click',function(){ this.classList.toggle('on'); });

    // Show/Hide toggles for password fields
    document.getElementById('dw-pwNewToggle').addEventListener('click',function(){
      var f=document.getElementById('dw-pw-new');
      if(f.type==='password'){ f.type='text'; this.textContent='Hide'; } else { f.type='password'; this.textContent='Show'; }
    });
    document.getElementById('dw-pwConfirmToggle').addEventListener('click',function(){
      var f=document.getElementById('dw-pw-confirm');
      if(f.type==='password'){ f.type='text'; this.textContent='Hide'; } else { f.type='password'; this.textContent='Show'; }
    });

    // Update Password button
    document.getElementById('dw-pwUpdate').addEventListener('click', async function(){
      var hintEl=document.getElementById('dw-pw-hint');
      var pw1=document.getElementById('dw-pw-new').value;
      var pw2=document.getElementById('dw-pw-confirm').value;
      if(!pw1){ hintEl.textContent='Enter a new password first.'; hintEl.style.color='var(--red)'; return; }
      if(pw1.length < 8){ hintEl.textContent='Password must be at least 8 characters.'; hintEl.style.color='var(--red)'; return; }
      if(pw1!==pw2){ hintEl.textContent='Passwords do not match.'; hintEl.style.color='var(--red)'; return; }
      if(!curInv || !curInv._sbId){ hintEl.textContent='No investor selected.'; hintEl.style.color='var(--red)'; return; }

      this.disabled=true; this.textContent='Updating…';
      try{
        var res;
        if(!ZY_DEMO){
          // Use Supabase admin API to update the user's password
          res=await sb.auth.admin.updateUserById(curInv._sbId,{ password: pw1 });
          if(res.error) throw res.error;
        }
        document.getElementById('dw-pw-new').value='';
        document.getElementById('dw-pw-confirm').value='';
        hintEl.textContent='Password updated successfully ✓';
        hintEl.style.color='var(--green,#2E7D32)';
        if(window.zyToast) zyToast('Password updated for '+(curInv.name||'investor'));
      }catch(ex){
        hintEl.textContent='Update failed: '+((ex&&ex.message)||'Unknown error');
        hintEl.style.color='var(--red)';
      }
      this.disabled=false; this.textContent='Update Password';
    });

    document.getElementById('dw-revoke').addEventListener('click',function(){ if(window.zyToast) zyToast('Session revoke is managed in Supabase Auth.'); });

    // New investor — info only (real accounts come from member registration)
    document.getElementById('newInvestor').addEventListener('click',function(){
      if(window.zyToast) zyToast('New investors register via the member sign-up page; set their role/status here once created.');
    });

    // SAVE
    document.getElementById('dwSave').addEventListener('click', async function(){
      if(!curInv) return;
      var nm=document.getElementById('dw-name').value.trim();
      if(!nm){ if(window.zyToast) zyToast('Enter the investor name'); return; }
      curInv.name=nm;
      curInv.phone=document.getElementById('dw-phone').value.trim();
      curInv.email=document.getElementById('dw-email').value.trim();
      curInv.address=document.getElementById('dw-address').value.trim();
      curInv.bank=document.getElementById('dw-bank').value.trim();
      curInv.acctno=document.getElementById('dw-acctno').value.trim();
      curInv.bankHolder=document.getElementById('dw-bankHolder').value.trim();
      curInv.member=document.getElementById('dw-member').value;
      curInv.status=document.getElementById('dw-status').value;
      if(curInv._sbId){
        var res=await sb.from('profiles').update({
          full_name:curInv.name,
          phone:curInv.phone||null,
          address:curInv.address||null,
          bank_name:curInv.bank||null,
          bank_account_no:curInv.acctno||null,
          bank_account_holder:curInv.bankHolder||null,
          role:curInv.member==='Director'?'admin':'member',
          status:curInv.status==='Active'?'active':curInv.status==='Suspended'?'suspended':'pending'
        }).eq('id',curInv._sbId);
        if(res.error){ if(window.zyToast) zyToast('Save failed: '+res.error.message); return; }
      }
      renderInvestors(); zyModalClose(); if(window.zyToast) zyToast('Profile saved — '+nm);
    });

    // SUSPEND
    document.getElementById('dwDelete').addEventListener('click', async function(){
      if(!curInv) return;
      if(!confirm('Suspend '+(curInv.name||'this investor')+'? Their account will be deactivated.')) return;
      if(curInv._sbId){
        var res=await sb.from('profiles').update({status:'suspended'}).eq('id',curInv._sbId);
        if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
      }
      curInv.status='Suspended';
      renderInvestors(); zyModalClose(); if(window.zyToast) zyToast('Investor suspended — '+(curInv.name||''));
    });
  }

})();
