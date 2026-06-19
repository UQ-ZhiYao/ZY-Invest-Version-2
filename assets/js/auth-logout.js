/* ============================================================
   ZY-Invest · Shared logout handler
   Intercepts all logout / sign-out link clicks and properly
   clears the Supabase session before redirecting.
   ============================================================ */
(function(){
   async function doLogout(e){
     if(e) e.preventDefault();
     try{
       if(typeof sb !== 'undefined' && sb) await sb.auth.signOut();
     }catch(err){}
     try{
       ['zy_token','zy_role','zy_name','zy_investor_id'].forEach(function(k){
         localStorage.removeItem(k);
       });
     }catch(err){}
      var root = location.pathname.replace(/\/(members|admin)\/.*$/, '/');
      var isAdmin = location.pathname.indexOf('/admin/') !== -1;
      window.location.href = root + (isAdmin ? 'admin/admin-login.html' : 'login.html');
   }

  document.addEventListener('DOMContentLoaded', function(){
    // Target all logout/sign-out links by href or class
    document.querySelectorAll(
      'a.logout, a.btn-logout, a.um-item.danger, a.adm-signout, #admSignout'
    ).forEach(function(el){
      el.addEventListener('click', doLogout);
    });

    // Also expose globally so inline onclick= can call it
    window.doLogout = doLogout;
  });
})();
