// supabase/functions/admin-update-password/index.ts
// Deployed with: npx supabase functions deploy admin-update-password
//
// This Edge Function runs server-side with the SERVICE ROLE key.
// It verifies the caller is an authenticated admin before changing any password.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Parse request body
    const { target_user_id, new_password } = await req.json();

    if (!target_user_id || !new_password) {
      return new Response(JSON.stringify({ error: 'target_user_id and new_password are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (new_password.length < 8) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Verify the caller is an authenticated admin using the ANON client + their JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get the calling user's identity from their JWT
    const { data: { user: callerUser }, error: callerErr } = await anonClient.auth.getUser();
    if (callerErr || !callerUser) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check the caller has admin role in profiles table
    const { data: profile, error: profileErr } = await anonClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single();

    if (profileErr || !profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Access denied — admin role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Now use SERVICE ROLE client to update the target user's password
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: updateErr } = await adminClient.auth.admin.updateUserById(
      target_user_id,
      { password: new_password }
    );

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
