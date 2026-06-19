/* ============================================================
   ZY-Invest · Profile page — Supabase read / write
   ============================================================ */
(function () {

  /* ── helpers ─────────────────────────────────────────────── */
  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  function setVal(id, v) {
    var el = document.getElementById(id);
    if (el) el.value = v || '';
  }
  function setText(id, v) {
    var el = document.getElementById(id);
    if (el) el.textContent = v || '';
  }
  function toast(msg, isError) {
    var t = document.getElementById('profileToast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'profile-toast show ' + (isError ? 'error' : 'ok');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.className = 'profile-toast'; }, 3200);
  }
  function initials(name) {
    return (name || 'U').split(' ')
      .map(function (w) { return w[0] || ''; })
      .join('').toUpperCase().slice(0, 3);
  }

  /* ── run after DOM ready ─────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async function () {

    /* 1. Wait for sb to be available (supabase-auth.js must load first) */
    if (typeof sb === 'undefined' || !sb) {
      console.warn('Supabase client (sb) not ready — check script order.');
      return;
    }

    /* 2. Guard — must be logged in */
    var sessionRes = await sb.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    if (!session) {
      window.location.href = '../login.html';
      return;
    }

    var userId    = session.user.id;
    var userEmail = session.user.email;

    /* 3. Load profile row from Supabase */
    var result = await sb.from('profiles').select('*').eq('id', userId).single();
    var profile = result.data;
    var loadErr = result.error;

    if (loadErr || !profile) {
      toast('Could not load profile. Please refresh.', true);
      return;
    }

    /* 4. Populate nav / hero */
    var displayName = profile.preferred_name || profile.full_name || userEmail;
    var av = initials(displayName);

    setText('navName',    profile.full_name || userEmail);
    setText('navRole',    userEmail);
    setText('navAvatar',  av);
    setText('menuAvatar', av);
    setText('menuName',   profile.full_name || '—');
    setText('menuEmail',  userEmail);
    setText('profAvatar', av);
    setText('profName',   profile.full_name || '—');

    /* 5. Populate Personal Details */
    setVal('prof-fullname',    profile.full_name);
    setVal('prof-preferred',   profile.preferred_name);
    setVal('prof-email',       userEmail);   // from auth, never from profiles
    setVal('prof-phone',       profile.phone);
    setVal('prof-address',     profile.address);
    setVal('prof-dob',         profile.date_of_birth || '');

    /* Nationality select */
    var natEl = document.getElementById('prof-nationality');
    if (natEl && profile.nationality) {
      for (var i = 0; i < natEl.options.length; i++) {
        if (natEl.options[i].value === profile.nationality) {
          natEl.selectedIndex = i;
          break;
        }
      }
    }

    /* NRIC — lock if already saved */
    var nricEl   = document.getElementById('prof-nric');
    var nricLock = document.getElementById('prof-nric-lock');
    if (nricEl) {
      if (profile.nric_passport) {
        nricEl.value    = '······-··-····';
        nricEl.disabled = true;
        if (nricLock) nricLock.style.display = '';
      } else {
        nricEl.disabled = false;
        if (nricLock) nricLock.style.display = 'none';
      }
    }

    /* 6. Populate Bank Details — each field maps to its own column */
    setVal('prof-bank',        profile.bank_name);
    setVal('prof-bankacct',    profile.bank_account_no);
    setVal('prof-bankHolder',  profile.bank_account_holder);  // NOT email

    /* 7. Security pane — hint with masked email / phone */
    setText('sec-email-hint', 'Send a code to ' + userEmail);
    if (profile.phone) {
      setText('sec-sms-hint', profile.phone.replace(/\d(?=\d{4})/g, '·'));
    }

    /* ── SAVE: Personal Details ─────────────────────────────── */
    var savePersonalBtn = document.getElementById('savePersonal');
    if (savePersonalBtn) {
      savePersonalBtn.addEventListener('click', async function () {
        savePersonalBtn.disabled = true;
        savePersonalBtn.textContent = 'Saving…';

        var updates = {
          full_name:      val('prof-fullname'),
          preferred_name: val('prof-preferred'),
          phone:          val('prof-phone'),
          address:        val('prof-address'),
          nationality:    val('prof-nationality'),
          date_of_birth:  val('prof-dob') || null
        };

        /* Only save NRIC if field is unlocked and has content */
        if (nricEl && !nricEl.disabled && nricEl.value.trim()) {
          updates.nric_passport = nricEl.value.trim();
        }

        var res = await sb.from('profiles').update(updates).eq('id', userId);
        if (res.error) {
          toast('Save failed: ' + res.error.message, true);
        } else {
          toast('Personal details saved ✓');
          /* Update hero with new name */
          setText('profName',   updates.full_name || profile.full_name);
          setText('navName',    updates.full_name || profile.full_name);
          var newAv = initials(updates.preferred_name || updates.full_name);
          setText('profAvatar', newAv);
          setText('navAvatar',  newAv);
          setText('menuAvatar', newAv);
          setText('menuName',   updates.full_name || profile.full_name);
          /* Lock NRIC after first save */
          if (updates.nric_passport && nricEl) {
            nricEl.value    = '······-··-····';
            nricEl.disabled = true;
            if (nricLock) nricLock.style.display = '';
          }
        }

        savePersonalBtn.disabled = false;
        savePersonalBtn.textContent = 'Save Changes';
      });
    }

    /* ── SAVE: Bank Details ─────────────────────────────────── */
    var saveBankBtn = document.getElementById('saveBank');
    if (saveBankBtn) {
      saveBankBtn.addEventListener('click', async function () {
        saveBankBtn.disabled = true;
        saveBankBtn.textContent = 'Saving…';

        var res = await sb.from('profiles').update({
          bank_name:           val('prof-bank'),
          bank_account_no:     val('prof-bankacct'),
          bank_account_holder: val('prof-bankHolder')   // correct column
        }).eq('id', userId);

        if (res.error) {
          toast('Save failed: ' + res.error.message, true);
        } else {
          toast('Bank details saved ✓');
        }

        saveBankBtn.disabled = false;
        saveBankBtn.textContent = 'Save Changes';
      });
    }

    /* ── CANCEL buttons — reload to reset ───────────────────── */
    document.querySelectorAll('.prof-cancel').forEach(function (btn) {
      btn.addEventListener('click', function () { location.reload(); });
    });

  });
})();
