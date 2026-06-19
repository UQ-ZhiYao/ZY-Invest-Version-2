/* ============================================================
   ZY-Invest · Supabase client + auth helpers
   ------------------------------------------------------------
   Fill in your project's URL + anon key below (Supabase
   Dashboard → Project Settings → API). Until then the pages
   run in DEMO mode and simulate the email-verification flow.
   ============================================================ */

const SUPABASE_URL  = 'https://YOUR-PROJECT.supabase.co';   // ← replace
const SUPABASE_ANON = 'YOUR-PUBLIC-ANON-KEY';               // ← replace

// DEMO mode is on until real credentials are provided.
const ZY_DEMO = SUPABASE_URL.indexOf('YOUR-PROJECT') !== -1;

// Create the client if the Supabase SDK is present and configured.
let sb = null;
if (!ZY_DEMO && window.supabase && window.supabase.createClient) {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });
}

/* Where Supabase sends the confirmation link. Must be added to
   Supabase → Authentication → URL Configuration → Redirect URLs. */
function zyVerifyRedirect() {
  return location.origin + location.pathname.replace(/[^/]*$/, '') + 'verify.html';
}

/* ── Sign up a new member ─────────────────────────────────── */
// phone parameter removed — collected later in profile page
async function zySignUp({ name, email, password }) {
  if (ZY_DEMO || !sb) {
    await new Promise(r => setTimeout(r, 700));
    try { localStorage.setItem('zy_pending_email', email); } catch (e) {}
    return { demo: true, needsVerification: true, email };
  }
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: {
      data: { full_name: name },   // key must match SQL trigger: raw_user_meta_data->>'full_name'
      emailRedirectTo: zyVerifyRedirect()
    }
  });
  if (error) throw error;
  try { localStorage.setItem('zy_pending_email', email); } catch (e) {}
  // When email confirmations are ON, session is null until verified.
  return { needsVerification: !data.session, email, session: data.session };
}

/* ── Verify the email confirmation token from the URL ─────── */
async function zyVerifyFromUrl() {
  // New Supabase flow: ?token_hash=...&type=signup|email|recovery
  const q = new URLSearchParams(location.search);
  const token_hash = q.get('token_hash');
  const type = q.get('type') || 'signup';
  // Older flow leaves tokens in the URL hash (#access_token=...).
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const hashAccess = hash.get('access_token');
  const hashErr = q.get('error_description') || hash.get('error_description');

  if (hashErr) return { status: 'error', message: hashErr };

  if (ZY_DEMO || !sb) {
    await new Promise(r => setTimeout(r, 1100));
    // Demo: treat a present token (or ?demo=ok) as success, else "pending".
    if (token_hash || hashAccess || q.get('demo') === 'ok') return { status: 'success', demo: true };
    return { status: 'pending', demo: true };
  }

  if (hashAccess) {
    // detectSessionInUrl already set the session.
    const { data } = await sb.auth.getSession();
    return data.session ? { status: 'success' } : { status: 'error', message: 'No active session' };
  }
  if (!token_hash) return { status: 'pending' };

  const { error } = await sb.auth.verifyOtp({ token_hash, type });
  if (error) {
    return { status: /expired/i.test(error.message) ? 'expired' : 'error', message: error.message };
  }
  return { status: 'success' };
}

/* ── Resend the confirmation email ────────────────────────── */
async function zyResend(email) {
  if (ZY_DEMO || !sb) { await new Promise(r => setTimeout(r, 600)); return { demo: true }; }
  const { error } = await sb.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: zyVerifyRedirect() }
  });
  if (error) throw error;
  return {};
}
