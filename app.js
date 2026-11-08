(() => {
  const labels = { daily: '日常', date: '约会', trip: '旅行', milestone: '纪念日' };
  const colors = { daily: '#e6e8dd', date: '#f2dfd4', trip: '#dce7e3', milestone: '#eee3cc' };
  const grid = document.querySelector('#memoryGrid');
  const dialog = document.querySelector('#memoryDialog');
  const authDialog = document.querySelector('#authDialog');
  const dateDialog = document.querySelector('#dateDialog');
  const form = document.querySelector('#memoryForm');
  const authForm = document.querySelector('#authForm');
  const dateForm = document.querySelector('#dateForm');
  const authError = document.querySelector('#authError');
  const gate = document.querySelector('#authGate');
  const appMain = document.querySelector('#appMain');
  let memories = [];
  let anniversary = '';
  let currentFilter = 'all';
  let supabase = null;
  let session = null;

  function getSupabase() {
    const config = window.OURS_CONFIG || {};
    if (!window.supabase?.createClient || !config.url || !config.anonKey || config.url.includes('YOUR_')) return null;
    try { return window.supabase.createClient(config.url, config.anonKey); } catch { return null; }
  }
  function dateLabel(value) { if (!value) return ''; return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
  function today() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }
  function setSignedIn(isIn) {
    gate.hidden = isIn;
    appMain.hidden = !isIn;
    document.querySelector('#privateNav').hidden = !isIn;
    document.querySelector('#settingsButton').hidden = !isIn;
    document.querySelector('#loginButton').textContent = isIn ? '退出登录' : '登录';
    if (!isIn) { memories = []; anniversary = ''; render(); }
  }
  function updateStats() {
    document.querySelector('#memoryCount').textContent = memories.length;
    document.querySelector('#allCount').textContent = memories.length;
    const days = anniversary ? Math.max(1, Math.floor((new Date(`${today()}T12:00:00`) - new Date(`${anniversary}T12:00:00`)) / 86400000) + 1) : null;
    document.querySelector('#daysTogether').textContent = days ? days.toLocaleString('zh-CN') : '—';
    document.querySelector('#anniversaryText').textContent = anniversary ? dateLabel(anniversary) : '等你来填写';
    document.querySelector('#sinceYear').textContent = anniversary ? anniversary.slice(0, 4) : '20——';
  }
  function render() {
    updateStats();
    const items = memories.filter(m => currentFilter === 'all' || m.category === currentFilter).slice().sort((a,b) => b.date.localeCompare(a.date));
    grid.innerHTML = '';
    document.querySelector('#emptyState').style.display = items.length ? 'none' : 'block';
    items.forEach(m => {
      const card = document.createElement('article'); card.className = 'memory-card';
      if (m.photo) { const photo = document.createElement('div'); photo.className = 'card-photo'; photo.style.backgroundImage = `url("${m.photo}")`; card.append(photo); }
      const actions = document.createElement('div'); actions.className = 'card-actions';
      const edit = document.createElement('button'); edit.className = 'card-action'; edit.type = 'button'; edit.textContent = '编辑'; edit.addEventListener('click', () => openMemory(m));
      const remove = document.createElement('button'); remove.className = 'card-action'; remove.type = 'button'; remove.textContent = '删除'; remove.addEventListener('click', async () => { if (!confirm('确定删除这条回忆吗？')) return; memories = memories.filter(x => x.id !== m.id); await saveCloud(); });
      actions.append(edit, remove); card.append(actions);
      const content = document.createElement('div'); content.className = 'card-content';
      const meta = document.createElement('div'); meta.className = 'card-meta';
      const tag = document.createElement('span'); tag.className = 'category-tag'; tag.textContent = labels[m.category] || labels.daily; tag.style.background = colors[m.category] || colors.daily;
      const date = document.createElement('span'); date.textContent = dateLabel(m.date); meta.append(tag,date);
      const title = document.createElement('h3'); title.textContent = m.title;
      content.append(meta,title);
      if (m.note) { const note = document.createElement('p'); note.textContent = m.note; content.append(note); }
      card.append(content); grid.append(card);
    });
  }
  async function loadCloud() {
    const { data, error } = await supabase.from('shared_memory').select('memories, anniversary').eq('id','main').maybeSingle();
    if (error) throw error;
    if (!data) {
      const { error: createError } = await supabase.from('shared_memory').insert({ id: 'main', memories: [], anniversary: null });
      if (createError && createError.code !== '23505') throw createError;
      memories = []; anniversary = '';
    } else { memories = Array.isArray(data.memories) ? data.memories : []; anniversary = data.anniversary || ''; }
    render();
  }
  async function saveCloud() {
    render();
    const { error } = await supabase.from('shared_memory').upsert({ id: 'main', memories, anniversary: anniversary || null, updated_at: new Date().toISOString() });
    if (error) { alert('同步没有成功，请检查网络后再试。你当前页面的修改暂时没有同步。'); await loadCloud().catch(() => {}); }
  }
  function openMemory(memory) {
    form.reset(); form.elements.id.value = memory?.id || ''; form.elements.title.value = memory?.title || ''; form.elements.date.value = memory?.date || today(); form.elements.category.value = memory?.category || 'daily'; form.elements.note.value = memory?.note || '';
    document.querySelector('#formTitle').textContent = memory ? '修改这件小事' : '记下一件小事';
    dialog.showModal();
  }
  function showLogin() { authError.textContent = ''; authDialog.showModal(); }
  document.querySelectorAll('#addMemoryTop,#addMemoryBottom,#emptyAdd').forEach(button => button.addEventListener('click', () => openMemory()));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  document.querySelector('[data-auth-close]').addEventListener('click', () => authDialog.close());
  document.querySelector('#gateLogin').addEventListener('click', showLogin);
  document.querySelector('#loginButton').addEventListener('click', async () => {
    if (session) { await supabase.auth.signOut(); return; }
    showLogin();
  });
  authForm.addEventListener('submit', async event => {
    event.preventDefault(); authError.textContent = '';
    supabase = getSupabase();
    if (!supabase) { authError.textContent = '网站还没有连接云端账号服务，请先完成发布设置。'; return; }
    const button = authForm.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = '正在登录…';
    const { data, error } = await supabase.auth.signInWithPassword({ email: authForm.elements.email.value.trim(), password: authForm.elements.password.value });
    button.disabled = false; button.innerHTML = '登录 <span>♡</span>';
    if (error) { authError.textContent = '账号或密码不正确，请再试一次。'; return; }
    session = data.session; authDialog.close(); setSignedIn(true);
    try { await loadCloud(); } catch { authError.textContent = '账号已登录，但云端记录服务尚未完成设置。'; setSignedIn(false); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form); const id = data.get('id'); const existing = memories.find(m => m.id === id);
    let photo = existing?.photo || '';
    const file = data.get('photo');
    if (file?.size) {
      if (file.size > 220000) { alert('为保证同步顺畅，请选一张小于 220 KB 的照片。'); return; }
      photo = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    }
    const memory = { id: id || (crypto.randomUUID?.() || String(Date.now())), title: String(data.get('title')).trim(), date: data.get('date'), category: data.get('category'), note: String(data.get('note') || '').trim(), photo };
    if (existing) memories = memories.map(m => m.id === id ? memory : m); else memories.push(memory);
    dialog.close(); await saveCloud();
  });
  function openDate() { dateForm.elements.anniversary.value = anniversary; dateDialog.showModal(); }
  document.querySelector('#settingsButton').addEventListener('click', openDate);
  document.querySelector('#setDateInline').addEventListener('click', openDate);
  document.querySelector('[data-date-close]').addEventListener('click', () => dateDialog.close());
  dateForm.addEventListener('submit', async event => { event.preventDefault(); anniversary = dateForm.elements.anniversary.value; dateDialog.close(); await saveCloud(); });
  document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => { currentFilter = button.dataset.filter; document.querySelectorAll('.filter').forEach(item => item.classList.toggle('active', item === button)); render(); }));

  setSignedIn(false);
  supabase = getSupabase();
  if (supabase) {
    supabase.auth.getSession().then(async ({ data }) => {
      session = data.session;
      if (!session) return;
      setSignedIn(true);
      try { await loadCloud(); } catch { session = null; setSignedIn(false); }
    });
    supabase.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      if (!session) setSignedIn(false);
    });
  }
})();

