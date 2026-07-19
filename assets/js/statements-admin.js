/* ============================================================
   ZY-Invest · Statement generation — shared admin helper
   Calls the generate-statement Edge Function (supabase/functions/
   generate-statement/) and opens the resulting PDF in a new tab.
   ============================================================ */
(function(){
  async function zyGenerateStatement(payload, opts){
    opts = opts || {};
    var btn = opts.button;
    var origText = btn ? btn.textContent : '';
    if(btn){ btn.disabled = true; btn.textContent = 'Generating…'; }
    try{
      if(typeof sb === 'undefined' || !sb) throw new Error('Supabase not ready');
      var session = await sb.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : '';
      if(!token) throw new Error('No active session');

      var res = await fetch(SUPABASE_URL + '/functions/v1/generate-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if(!res.ok || data.error) throw new Error(data.error || ('Request failed (' + res.status + ')'));

      var signed = await sb.storage.from('statements').createSignedUrl(data.storage_path, 300);
      if(signed.error) throw new Error('Generated, but could not open it: ' + signed.error.message);

      if(window.zyToast) zyToast('Statement generated — ' + data.file_name);
      window.open(signed.data.signedUrl, '_blank');
      return data;
    }catch(ex){
      if(window.zyToast) zyToast('Error: ' + ((ex && ex.message) || 'Unknown error'));
      throw ex;
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = origText; }
    }
  }

  window.zyGenerateStatement = zyGenerateStatement;
})();
