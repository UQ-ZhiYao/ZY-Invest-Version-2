/* ============================================================
   ZY-Invest · Capital Injection — Member submit logic
   Hooks into the existing subscribe/redeem modals on dashboard.html
   Writes to capital_injection table + uploads document to storage
   ============================================================ */
(function(){
  var BUCKET = 'capital-injection-docs';
  var NTA = 1.0245; // fallback; ideally fetched from fund_overview

  function fmt(n){ return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function parseNum(s){ return parseFloat((s||'').toString().replace(/,/g,''))||0; }

  function notify(m){
    var toast=document.getElementById('srToast'), msg=document.getElementById('srToastMsg');
    if(toast&&msg){ msg.textContent=m; toast.classList.add('show'); setTimeout(function(){toast.classList.remove('show');},3500); }
  }
  function closeModals(){
    document.querySelectorAll('.sr-modal').forEach(function(m){m.classList.remove('open');});
    var sc=document.getElementById('srScrim'); if(sc) sc.classList.remove('open');
  }

  async function getSession(){
    if(typeof sb==='undefined'||!sb) return null;
    var s = await sb.auth.getSession();
    return s.data&&s.data.session ? s.data.session : null;
  }

  async function uploadDoc(file, txId){
    if(!file||typeof sb==='undefined'||!sb) return null;
    var ext = file.name.split('.').pop().toLowerCase();
    var path = txId+'/document.'+ext;
    var up = await sb.storage.from(BUCKET).upload(path, file, { upsert:true, contentType:file.type });
    if(up.error) throw new Error('Upload failed: '+up.error.message);
    var url = sb.storage.from(BUCKET).getPublicUrl(path);
    return url.data.publicUrl;
  }

  // ── Wire Subscribe submit ────────────────────────────────
  var subSubmit = document.getElementById('sub-submit');
  if(subSubmit){
    // Replace the existing click listener by cloning the button
    var newSubSubmit = subSubmit.cloneNode(true);
    subSubmit.parentNode.replaceChild(newSubSubmit, subSubmit);

    // Re-attach the original validation UI behaviour first, then add Supabase logic
    newSubSubmit.addEventListener('click', async function(){
      var subAmt = document.getElementById('sub-amt');
      var subDrop = document.getElementById('sub-drop');
      var subFile = document.getElementById('sub-file-input'); // real file input if wired, else null
      var a = parseNum(subAmt ? subAmt.value : '0');

      // Basic validation (mirrors existing)
      var ok = true;
      var fa = subAmt ? subAmt.closest('.sr-field') : null;
      var ff = subDrop ? subDrop.closest('.sr-field') : null;
      if(a <= 0){
        if(fa) fa.classList.add('show-err');
        if(subAmt) subAmt.classList.add('bad');
        ok = false;
      } else {
        if(fa) fa.classList.remove('show-err');
        if(subAmt) subAmt.classList.remove('bad');
      }

      // Check file — look for a real file input in the drop zone
      var fileInput = document.querySelector('#subModal input[type="file"]');
      var file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      var dropFilled = subDrop && subDrop.classList.contains('filled');

      if(!file && !dropFilled){
        if(ff) ff.classList.add('show-err');
        ok = false;
      } else {
        if(ff) ff.classList.remove('show-err');
      }

      if(!ok) return;

      this.disabled = true; this.textContent = 'Submitting…';

      try{
        var session = await getSession();
        if(!session) throw new Error('Not logged in');

        var profile = await sb.from('profiles').select('full_name,email').eq('id',session.user.id).single();
        var fullName = profile.data ? profile.data.full_name : (session.user.email||'');

        // Insert record
        var ins = await sb.from('capital_injection').insert({
          uid: session.user.id,
          full_name: fullName,
          date: new Date().toISOString().slice(0,10),
          type: 'Subscription',
          amount: a,
          nta: NTA,
          units: a / NTA,
          status: 'Pending',
          document: null
        }).select().single();

        if(ins.error) throw ins.error;

        // Upload file
        if(file){
          var docUrl = await uploadDoc(file, ins.data.id);
          await sb.from('capital_injection').update({ document: docUrl }).eq('id', ins.data.id);
        }

        closeModals();
        notify('Subscription of RM '+fmt(a)+' submitted — pending admin review');

      }catch(ex){
        notify('Submission failed: '+((ex&&ex.message)||'Please try again'));
      }

      this.disabled = false; this.textContent = 'Submit Subscription';
    });
  }

  // ── Wire Redeem submit ───────────────────────────────────
  var redSubmit = document.getElementById('red-submit');
  if(redSubmit){
    var newRedSubmit = redSubmit.cloneNode(true);
    redSubmit.parentNode.replaceChild(newRedSubmit, redSubmit);

    newRedSubmit.addEventListener('click', async function(){
      var redAmt    = document.getElementById('red-amt');
      var redUnits  = document.getElementById('red-unitsin');
      var MAXVAL    = 61228; // fallback; ideally from live holdings
      var UNITS_HELD= 59763.79;

      var a = parseNum(redAmt ? redAmt.value : '0');
      var u = parseNum(redUnits ? redUnits.value : '0');
      if(u > 0){ a = u * NTA; }

      var f = redAmt ? redAmt.closest('.sr-field') : null;
      if(a <= 0 || a > MAXVAL || u > UNITS_HELD){
        if(f) f.classList.add('show-err');
        if(redAmt) redAmt.classList.add('bad');
        return;
      }
      if(f) f.classList.remove('show-err');
      if(redAmt) redAmt.classList.remove('bad');

      this.disabled = true; this.textContent = 'Submitting…';

      try{
        var session = await getSession();
        if(!session) throw new Error('Not logged in');

        var profile = await sb.from('profiles').select('full_name').eq('id',session.user.id).single();
        var fullName = profile.data ? profile.data.full_name : (session.user.email||'');

        var ins = await sb.from('capital_injection').insert({
          uid: session.user.id,
          full_name: fullName,
          date: new Date().toISOString().slice(0,10),
          type: 'Redemption',
          amount: a,
          nta: NTA,
          units: a / NTA,
          status: 'Pending',
          document: null
        }).select().single();

        if(ins.error) throw ins.error;

        closeModals();
        notify('Redemption of RM '+fmt(a)+' submitted — pending admin review');

      }catch(ex){
        notify('Submission failed: '+((ex&&ex.message)||'Please try again'));
      }

      this.disabled = false; this.textContent = 'Submit Redemption';
    });
  }

  // ── Also wire a real file input inside the sub-drop zone ─
  // The existing drop zone is a pure click-to-simulate; we inject a real <input>
  var subDrop = document.getElementById('sub-drop');
  if(subDrop && !document.querySelector('#subModal input[type="file"]')){
    var fi = document.createElement('input');
    fi.type='file'; fi.id='sub-file-input'; fi.accept='.pdf,.jpg,.jpeg,.png';
    fi.style.display='none';
    subDrop.appendChild(fi);

    subDrop.addEventListener('click', function(e){
      if(e.target!==fi) fi.click();
    });
    fi.addEventListener('change', function(){
      if(fi.files && fi.files[0]){
        var fname = document.getElementById('sub-fname');
        if(fname) fname.textContent = fi.files[0].name+' · attached';
        subDrop.classList.add('filled');
        var ferr = document.getElementById('sub-file-err');
        if(ferr) ferr.parentNode.classList.remove('show-err');
      }
    });
  }

})();
