import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authorization = req.headers.get('Authorization') || ''
    const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } })
    const admin = createClient(url, service)
    const { data: { user } } = await caller.auth.getUser()
    if (!user) throw new Error('ログインが必要です')
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') throw new Error('管理者権限がありません')
    const body = await req.json()
    if (body.action === 'invite') {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(body.email, {
        data: { display_name: body.displayName },
        redirectTo: 'https://ykamaya0811-lang.github.io/soro-board/dopa-touch-a1/'
      })
      if (error) throw error
      await admin.from('profiles').upsert({ id: data.user.id, email: body.email, display_name: body.displayName, status: 'active', expires_at: body.expiresAt })
    } else if (body.action === 'status') {
      if (!['active','suspended'].includes(body.status)) throw new Error('不正な状態です')
      const { error } = await admin.from('profiles').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', body.userId).neq('role','admin')
      if (error) throw error
    } else throw new Error('不正な操作です')
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type':'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...cors, 'Content-Type':'application/json' } })
  }
})
