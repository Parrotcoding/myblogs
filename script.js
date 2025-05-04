/* ---------- CONFIG ---------- */
const supabaseUrl = 'https://eizwfyfindxzdzijbgxf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpendmeWZpbmR4emR6aWpiZ3hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYzNzEzMjYsImV4cCI6MjA2MTk0NzMyNn0.whdzYdVHDVoZVvbLYkpTc48yP5tt6kNBw0F842Q38vw';
const supa = supabase.createClient(supabaseUrl, supabaseAnonKey);

/* ------------------------------------------------------------------
   1.  DOM SHORTCUTS
------------------------------------------------------------------ */
const qs  = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];
const hide = (el) => el.classList.add('hidden');
const show = (el) => el.classList.remove('hidden');

/* UI roots */
const authSection = qs('#auth-section');
const dashSection = qs('#dash-section');
const postsPanel  = qs('#posts-panel');
const authMsg     = qs('#auth-msg');
const blogsList   = qs('#blogs-list');
const postsList   = qs('#posts-list');
const userEmailEl = qs('#user-email');

/* ------------------------------------------------------------------
   2.  TABS
------------------------------------------------------------------ */
qsa('.tabs button').forEach(btn => btn.onclick = () => {
  qsa('.tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  qsa('.auth-form').forEach(hide);
  show(qs(`#${btn.dataset.tab}-form`));
});

/* ------------------------------------------------------------------
   3.  AUTH – EMAIL / PASSWORD
------------------------------------------------------------------ */
qs('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const [email, pw] = [...e.target.elements].map(i => i.value.trim());
  const { error } = await supa.auth.signInWithPassword({ email, password: pw });
  authMsg.textContent = error ? error.message : '';
});

qs('#signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const [email, pw] = [...e.target.elements].map(i => i.value.trim());
  const { data, error } = await supa.auth.signUp({ email, password: pw });
  if (error) return authMsg.textContent = error.message;

  /* after successful sign‑up, inject profile + starter blog (RPC) */
  await supa.rpc('setup_new_user', {
    new_user_id: data.user.id,
    new_email: email
  });
  authMsg.textContent = 'Confirm your email, then log in.';
});

/* RESET PASSWORD */
qs('#reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = e.target.elements[0].value.trim();
  const { error } = await supa.auth.resetPasswordForEmail(email);
  authMsg.textContent = error ? error.message : 'Reset link sent!';
});

/* NEW PASSWORD (after recovery link) */
qs('#newpw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = e.target.elements[0].value.trim();
  const { error } = await supa.auth.updateUser({ password: pw });
  authMsg.textContent = error ? error.message : 'Password updated – log in.';
  if (!error) supa.auth.signOut();
});

/* LOG‑OUT */
qs('#logout-btn').onclick = () => supa.auth.signOut();

/* ------------------------------------------------------------------
   4.  INITIAL SESSION CHECK  (fixes “nothing happens” on refresh)
------------------------------------------------------------------ */
init();
async function init() {
  const { data: { session } } = await supa.auth.getSession();
  if (session) await onSignIn(session.user);

  /* listen for future changes */
  supa.auth.onAuthStateChange((_ev, sess) => {
    if (sess?.user)  onSignIn(sess.user);
    else             onSignOut();
  });

  /* Handle #access_token in recovery / magic‑link URLs */
  const params = new URLSearchParams(location.hash.replace('#', '?'));
  if (params.get('type') === 'recovery') {
    authMsg.textContent = 'Enter a new password';
    qsa('.auth-form').forEach(hide);
    show(qs('#newpw-form'));
    qs('.tabs').style.display = 'none';
  }
}

/* ------------------------------------------------------------------
   5.  SIGN‑IN / SIGN‑OUT  UI HANDLERS
------------------------------------------------------------------ */
async function onSignIn(user) {
  /* fetch display name from profiles */
  const { data: prof } = await supa
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  userEmailEl.textContent = prof?.display_name || user.email;

  authSection.hidden = true;
  dashSection.hidden = false;
  qs('#logout-btn').hidden = false;
  await loadBlogs();
}

function onSignOut() {
  authSection.hidden = false;
  dashSection.hidden = true;
  postsPanel.hidden  = true;
  userEmailEl.textContent = '';
  blogsList.innerHTML = '';
  postsList.innerHTML = '';
}

/* ------------------------------------------------------------------
   6.  BLOGS
------------------------------------------------------------------ */
async function loadBlogs() {
  const { data, error } = await supa
    .from('blogs')
    .select('id,title,description,created_at')
    .order('created_at');
  blogsList.innerHTML = error
    ? `<li>${error.message}</li>`
    : data.map(b =>
        `<li><button data-id="${b.id}" class="blog-btn">${b.title}</button></li>`
      ).join('');
  blogsList.querySelectorAll('.blog-btn').forEach(btn =>
    btn.onclick = () => openBlog(btn.dataset.id, btn.textContent)
  );
}

qs('#new-blog-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const [title, desc] = [...e.target.elements].map(i => i.value.trim());
  await supa.from('blogs').insert({ title, description: desc });
  e.target.reset();
  loadBlogs();
});

/* ------------------------------------------------------------------
   7.  POSTS
------------------------------------------------------------------ */
async function openBlog(id, title) {
  postsPanel.hidden = false;
  qs('#posts-heading').textContent = `Posts for “${title}”`;
  qs('#new-post-form').dataset.blogId = id;
  await loadPosts(id);
}

async function loadPosts(blogId) {
  const { data, error } = await supa
    .from('posts')
    .select('id,title,content,created_at')
    .eq('blog_id', blogId)
    .order('created_at', { ascending:false });
  postsList.innerHTML = error
    ? `<li>${error.message}</li>`
    : data.map(p => `
        <li>
          <strong>${p.title}</strong>
          <em>${new Date(p.created_at).toLocaleString()}</em>
          <p>${p.content}</p>
        </li>`).join('');
}

qs('#new-post-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const blogId = e.target.dataset.blogId;
  const [title, content] = [...e.target.elements].map(i => i.value.trim());
  await supa.from('posts').insert({ blog_id: blogId, title, content });
  e.target.reset();
  loadPosts(blogId);
});
