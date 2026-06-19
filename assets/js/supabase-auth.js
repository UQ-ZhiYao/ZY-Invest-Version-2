// ============================================================
// In assets/js/supabase-auth.js
// Find this line inside zySignUp():
//
//   options: {
//     data: { full_name: name, phone: phone || null },
//
// It should already say full_name. If yours says just "name",
// change it to "full_name". The correct version is:
// ============================================================

async function zySignUp({ name, email, password }) {
  if (ZY_DEMO || !sb) {
    await new Promise(r => setTimeout(r, 700));
    try { localStorage.setItem('zy_pending_email', email); } catch (e) {}
    return { demo: true, needsVerification: true, email };
  }
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: {
      data: { full_name: name },   // key must be full_name to match trigger
      emailRedirectTo: zyVerifyRedirect()
    }
  });
  if (error) throw error;
  try { localStorage.setItem('zy_pending_email', email); } catch (e) {}
  return { needsVerification: !data.session, email, session: data.session };
}
