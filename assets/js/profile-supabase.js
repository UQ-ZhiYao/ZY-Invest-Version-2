/* ============================================================
   ZY-Invest · Profile page — Supabase read / write
   Loads the member's profile from the "profiles" table and
   saves changes back. Drop this after supabase-auth.js on
   members/profile.html
   ============================================================ */
(function () {

  /* ── helpers ────────────────────────────────────────────── */
  function val(id) { return (document.getElementById(id) || {}).value || ''; }
  function setVal(id, v) { var el = document.getElementById(id); if (el) el.value = v || ''; }
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v || ''; }

  function toast(msg, ok) {
    var t = document.getElementById('profileToast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'profile-toast show ' + (ok === false ? 'error' : 'ok');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.className = 'profile-toast'; }, 3200);
  }

  /* ── on page ready ──────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async function () {

    /* 1. Guard — must be logged in */
    if (typeof sb === 'undefined' || !sb) return;
    var sessionRes = await sb.auth.getSession();
    var session = sessionRes.data.session;
    if (!session) { window.location.href = '../login.html'; return; }

    var userId = session.user.id;
    var userEmail = session.user.email;

    /* 2. Load profile row */
    var { data: profile, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      toast('Could not load your profile. Please refresh.', false);
      return;
    }

    /* 3. Populate the hero section */
    var initials = (profile.preferred_name || profile.full_name || 'U')
      .split(' ').map(function (w) { return w[0]; }).join('').toUpperCase().slice(0, 3);
    setText('profAvatar', initials);
    setText('profName', profile.full_name || '—');

    /* 4. Populate Personal Details fields */
    setVal('prof-fullname', profile.full_name);
    setVal('prof-preferred', profile.preferred_name);
    setVal('prof-email', userEmail);          // read from auth, not profiles
    setVal('prof-phone', profile.phone);
    setVal('prof-address', profile.address);
    setVal('prof-nationality', profile.nationality);

    /* NRIC — show masked if already set, otherwise blank */
    var nricEl = document.getElementById('prof-nric');
    if (nricEl) {
      if (profile.nric_passport) {
        nricEl.value = '······-··-····';
        nricEl.disabled = true;
      } else {
        nricEl.disabled = false;
      }
    }

    /* 5. Populate Bank Details fields */
    setVal('prof-bank', profile.bank_name);
    setVal('prof-bankacct', profile.bank_account_no);
    setVal('prof-bankHolder', profile.bank_account_holder);

    /* 6. Save — Personal Details */
    var savePersonal = document.getElementById('savePersonal');
    if (savePersonal) {
      savePersonal.addEventListener('click', async function () {
        savePersonal.disabled = true;
        savePersonal.textContent = 'Saving…';

        var updates = {
          full_name:      val('prof-fullname'),
          preferred_name: val('prof-preferred'),
          phone:          val('prof-phone'),
          address:        val('prof-address'),
          nationality:    val('prof-nationality'),
        };

        /* Only save NRIC if the field is not disabled (i.e. first time entry) */
        var nricInput = document.getElementById('prof-nric');
        if (nricInput && !nricInput.disabled && nricInput.value.trim()) {
          updates.nric_passport = nricInput.value.trim();
        }

        var { error: saveErr } = await sb
          .from('profiles')
          .update(updates)
          .eq('id', userId);

        if (saveErr) {
          toast('Save failed: ' + saveErr.message, false);
        } else {
          toast('Personal details saved ✓');
          /* Lock NRIC now that it has been saved */
          if (updates.nric_passport && nricInput) {
            nricInput.value = '······-··-····';
            nricInput.disabled = true;
          }
          /* Update hero name */
          setText('profName', updates.full_name);
          var newInitials = (updates.preferred_name || updates.full_name || 'U')
            .split(' ').map(function (w) { return w[0]; }).join('').toUpperCase().slice(0, 3);
          setText('profAvatar', newInitials);
        }

        savePersonal.disabled = false;
        savePersonal.textContent = 'Save Changes';
      });
    }

    /* 7. Save — Bank Details */
    var saveBank = document.getElementById('saveBank');
    if (saveBank) {
      saveBank.addEventListener('click', async function () {
        saveBank.disabled = true;
        saveBank.textContent = 'Saving…';

        var { error: bankErr } = await sb
          .from('profiles')
          .update({
            bank_name:           val('prof-bank'),
            bank_account_no:     val('prof-bankacct'),
            bank_account_holder: val('prof-bankHolder'),
          })
          .eq('id', userId);

        if (bankErr) {
          toast('Save failed: ' + bankErr.message, false);
        } else {
          toast('Bank details saved ✓');
        }

        saveBank.disabled = false;
        saveBank.textContent = 'Save Changes';
      });
    }

    /* 8. Cancel buttons — reload page to reset fields */
    document.querySelectorAll('.prof-cancel').forEach(function (btn) {
      btn.addEventListener('click', function () { location.reload(); });
    });

  });
})();
