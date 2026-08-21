(() => {
  'use strict';
  const SUPABASE_URL = 'https://tqeplwfkhhcdzxxczkxu.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_l4xNm-mEvxiHnuQNAXs7IA_Oh6xjsP3';
  const GAME_KEY = 'dopatouch-a1-state-v1';
  const gate = document.getElementById('authGate');
  const form = document.getElementById('authForm');
  const title = document.getElementById('authTitle');
  const lead = document.getElementById('authLead');
  const message = document.getElementById('authMessage');
  const submit = document.getElementById('authSubmit');
  const switchButton = document.getElementById('authSwitch');
  const nameField = document.getElementById('displayNameField');
  const nameInput = document.getElementById('authName');
  const emailInput = document.getElementById('authEmail');
  const passwordInput = document.getElementById('authPassword');
  const accountButton = document.getElementById('accountButton');
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  let signupMode = false;
  let currentUser = null;
  let syncTimer = null;
  const originalSetItem = Storage.prototype.setItem;

  function setMode(signup) {
    signupMode = signup;
    title.textContent = signup ? 'アカウントを作る' : 'ログイン';
    lead.textContent = signup ? '学習データを安全に保存できます' : 'メールアドレスとパスワードを入力してください';
    submit.textContent = signup ? 'アカウントを作成' : 'ログイン';
    switchButton.textContent = signup ? 'すでにアカウントがある方：ログイン' : 'はじめての方：アカウントを作る';
    nameField.hidden = !signup;
    passwordInput.autocomplete = signup ? 'new-password' : 'current-password';
    message.textContent = '';
  }

  function localGameState() {
    try { return JSON.parse(localStorage.getItem(GAME_KEY) || 'null'); } catch (_) { return null; }
  }
  async function uploadProgress() {
    if (!currentUser) return;
    const game = localGameState();
    if (game) await client.auth.updateUser({ data: { dopatouch_state: game } });
  }
  Storage.prototype.setItem = function(key, value) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && key === GAME_KEY && currentUser) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(uploadProgress, 900);
    }
  };
  async function enter(user) {
    currentUser = user;
    const { data: accessProfile } = await client.from('profiles').select('status,expires_at').eq('id', user.id).maybeSingle();
    const expired = accessProfile?.expires_at && new Date(accessProfile.expires_at) < new Date();
    if (accessProfile && (accessProfile.status !== 'active' || expired)) {
      await client.auth.signOut();
      leave();
      message.textContent = expired ? 'このアカウントの利用期限が終了しています' : 'このアカウントは現在利用できません';
      return;
    }
    const remote = user.user_metadata?.dopatouch_state;
    const local = localGameState();
    if (remote && typeof remote === 'object') {
      const remoteText = JSON.stringify(remote);
      const localText = local ? JSON.stringify(local) : '';
      originalSetItem.call(localStorage, GAME_KEY, remoteText);
      const hydrationKey = `dopa-hydrated-${user.id}`;
      if (remoteText !== localText && !sessionStorage.getItem(hydrationKey)) {
        sessionStorage.setItem(hydrationKey, '1');
        location.reload();
        return;
      }
    }
    else if (local) await uploadProgress();
    const displayName = String(user.user_metadata?.display_name || '').trim().slice(0, 12);
    const latestGame = localGameState() || {};
    if (displayName && latestGame.name !== displayName) {
      latestGame.name = displayName;
      originalSetItem.call(localStorage, GAME_KEY, JSON.stringify(latestGame));
      await uploadProgress();
      location.reload();
      return;
    }
    gate.hidden = true;
    accountButton.hidden = false;
    accountButton.textContent = `${user.email?.split('@')[0] || 'アカウント'}｜ログアウト`;
  }
  function leave() {
    currentUser = null;
    accountButton.hidden = true;
    gate.hidden = false;
    passwordInput.value = '';
    setMode(false);
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '確認中…';
    submit.disabled = true;
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    try {
      if (signupMode) {
        const displayName = nameInput.value.trim().slice(0, 12);
        if (!displayName) throw new Error('ユーザーネームを入力してください');
        const { data, error } = await client.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
        if (error) throw error;
        if (data.session) { await enter(data.user); location.reload(); }
        else message.textContent = '確認メールを送りました。メール内のリンクを押してからログインしてください。';
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await enter(data.user);
        location.reload();
      }
    } catch (error) {
      const known = {'Invalid login credentials':'メールアドレスかパスワードが違います','User already registered':'このメールアドレスは登録済みです','Password should be at least 6 characters.':'パスワードは6文字以上にしてください'};
      message.textContent = known[error.message] || error.message || 'エラーが発生しました';
    } finally { submit.disabled = false; }
  });
  switchButton.addEventListener('click', () => setMode(!signupMode));
  accountButton.addEventListener('click', async () => {
    if (!confirm('ログアウトしますか？')) return;
    await uploadProgress();
    await client.auth.signOut();
    leave();
  });
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') leave();
    if (session?.user && !currentUser) enter(session.user);
  });
  client.auth.getSession().then(({ data }) => data.session?.user ? enter(data.session.user) : leave());
  window.dopaAuth = { client, uploadProgress };
})();
