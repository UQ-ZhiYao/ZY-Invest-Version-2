/* ============================================================
   ZY-Invest · Member Nav — shared nav population
   Reads Supabase session + profiles table and populates:
   navName, navRole, navAvatar, menuAvatar, menuName, menuEmail
   Call after supabase-auth.js loads.
   ============================================================ */
(function(){
  function initials(n){
    return (n||'?').split(' ').filter(Boolean).slice(0,2).map(function(w){return w[0];}).join('').toUpperCase();
  }
  function setText(id, v){
    var el=document.getElementById(id); if(el) el.textContent=v||'';
  }

  window.addEventListener('DOMContentLoaded', async function(){
    if(typeof sb==='undefined'||!sb) return;

    // ── session guard ──
    var sres = await sb.auth.getSession();
    if(!sres.data||!sres.data.session){
      window.location.href='../login.html'; return;
    }
    var session  = sres.data.session;
    var userId   = session.user.id;
    var email    = session.user.email||'';

    // ── load profile ──
    var pres = await sb.from('profiles').select('full_name,preferred_name').eq('id',userId).single();
    var name = email;
    if(pres.data) name = pres.data.preferred_name || pres.data.full_name || email;

    var av = initials(name);
    setText('navName',    name);
    setText('navRole',    email);
    setText('navAvatar',  av);
    setText('menuAvatar', av);
    setText('menuName',   name);
    setText('menuEmail',  email);
  });
})();
