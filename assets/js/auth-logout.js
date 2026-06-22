/* ZY-Invest · shared logout for member pages (admin pages handle their own) */
(function(){
  async function doLogout(e){
    if(e) e.preventDefault();
    try{ if(typeof sb!=='undefined' && sb) await sb.auth.signOut(); }catch(err){}
    try{ ['zy_token','zy_role','zy_name','zy_investor_id'].forEach(function(k){ localStorage.removeItem(k); }); }catch(err){}
    var root=location.pathname.replace(/\/(members|admin)\/.*$/, '/');
    var isAdmin=location.pathname.indexOf('/admin/')!==-1;
    window.location.href = root + (isAdmin ? 'admin/admin-login.html' : 'login.html');
  }
  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('a.logout, a.btn-logout, a.um-item.danger, a.adm-signout').forEach(function(el){ el.addEventListener('click', doLogout); });
    window.doLogout = doLogout;
  });
})();
