(() => {
  'use strict';
  const URL = 'https://tqeplwfkhhcdzxxczkxu.supabase.co';
  const KEY = 'sb_publishable_l4xNm-mEvxiHnuQNAXs7IA_Oh6xjsP3';
  const client = window.supabase.createClient(URL, KEY);
  const loginPanel = document.getElementById('loginPanel');
  const adminArea = document.getElementById('adminArea');
  const logoutButton = document.getElementById('logoutButton');
  const userRows = document.getElementById('userRows');
  const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  async function isAdmin(userId) {
    const { data } = await client.from('profiles').select('role').eq('id', userId).maybeSingle();
    return data?.role === 'admin';
  }
  async function enter(session) {
    if (!session || !(await isAdmin(session.user.id))) {
      loginPanel.hidden = false; adminArea.hidden = true; logoutButton.hidden = true;
      if (session) document.getElementById('loginMessage').textContent = 'このアカウントには管理者権限がありません';
      return;
    }
    loginPanel.hidden = true; adminArea.hidden = false; logoutButton.hidden = false; await loadUsers();
  }
  async function loadUsers() {
    const message = document.getElementById('listMessage'); message.textContent = '読み込み中…';
    const { data, error } = await client.from('profiles').select('id,email,display_name,status,expires_at,role,created_at').neq('role','admin').order('created_at',{ascending:false});
    if (error) { message.textContent = error.message; return; }
    const users = data || [];
    document.getElementById('totalUsers').textContent = users.length;
    document.getElementById('activeUsers').textContent = users.filter(x=>x.status==='active').length;
    document.getElementById('stoppedUsers').textContent = users.filter(x=>x.status!=='active').length;
    userRows.innerHTML = users.map(user => `<tr><td>${escapeHTML(user.display_name||'未設定')}</td><td>${escapeHTML(user.email)}</td><td><span class="status ${user.status==='active'?'':'stopped'}">${user.status==='active'?'利用中':'停止中'}</span></td><td>${user.expires_at?escapeHTML(user.expires_at.slice(0,10)):'なし'}</td><td><button class="action-button" data-user="${user.id}" data-status="${user.status==='active'?'suspended':'active'}">${user.status==='active'?'停止':'再開'}</button></td></tr>`).join('') || '<tr><td colspan="5">まだ利用者はいません</td></tr>';
    message.textContent = '';
  }
  document.getElementById('loginForm').addEventListener('submit',async event=>{
    event.preventDefault(); const message=document.getElementById('loginMessage'); message.textContent='確認中…';
    const {data,error}=await client.auth.signInWithPassword({email:document.getElementById('loginEmail').value.trim(),password:document.getElementById('loginPassword').value});
    if(error){message.textContent='ログインできませんでした';return;} await enter(data.session);
  });
  document.getElementById('inviteForm').addEventListener('submit',async event=>{
    event.preventDefault(); const message=document.getElementById('inviteMessage'); message.textContent='送信中…';
    const {data,error}=await client.functions.invoke('admin-users',{body:{action:'invite',email:document.getElementById('inviteEmail').value.trim(),displayName:document.getElementById('inviteName').value.trim(),expiresAt:document.getElementById('inviteExpiry').value||null}});
    message.textContent=error?(error.message||'招待できませんでした'):'招待メールを送りました'; if(!error){event.target.reset();await loadUsers();}
  });
  userRows.addEventListener('click',async event=>{
    const button=event.target.closest('[data-user]'); if(!button)return; button.disabled=true;
    const {error}=await client.functions.invoke('admin-users',{body:{action:'status',userId:button.dataset.user,status:button.dataset.status}});
    if(error)document.getElementById('listMessage').textContent=error.message; await loadUsers();
  });
  document.getElementById('reloadButton').addEventListener('click',loadUsers);
  logoutButton.addEventListener('click',async()=>{await client.auth.signOut();location.reload();});
  client.auth.getSession().then(({data})=>enter(data.session));
})();
