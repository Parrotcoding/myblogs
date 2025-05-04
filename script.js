/* ---------- CONFIG ---------- */
const supabaseUrl = 'https://eizwfyfindxzdzijbgxf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpendmeWZpbmR4emR6aWpiZ3hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYzNzEzMjYsImV4cCI6MjA2MTk0NzMyNn0.whdzYdVHDVoZVvbLYkpTc48yP5tt6kNBw0F842Q38vw';
const supa = supabase.createClient(supabaseUrl, supabaseAnonKey);

/* ---------- HELPERS ---------- */
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => [...document.querySelectorAll(sel)];
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

/* ---------- UI ROOTS ---------- */
const authSection = qs('#auth-section');
const dashSection = qs('#dash-section');
const postsPanel  = qs('#posts-panel');
const authMsg     = qs('#auth-msg');
const blogsList   = qs('#blogs-list');
const postsList   = qs('#posts-list');
const userEmailEl = qs('#user-email');

/* ---------- TABS ---------- */
qsa('.tabs button').forEach(btn => btn.onclick = () => {
  qsa('.tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  qsa('.auth-form').forEach(f => hide(f));
  show(qs(`#${btn.dataset.tab}-form`));
});

/* ---------- SIGN‑IN / SIGN‑UP ---------- */
qs('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const [email, password] = [...e.target.elements].map(i => i.value.trim());
  const { error } = await supa.auth.signInWithPassword({ email, password });
  authMsg.textContent = error?.message ?? '';
});

qs('#signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const [email, password] = [...e.target.elements].map(i => i.value.trim());

  // 1️⃣ Create auth user
  const { data, error } = await supa.auth.signUp({ email, password });
  if (error) return authMsg.textContent = error.message;

  // 2️⃣ Insert profile + starter blog (runs _after_ email is confirmed)
  //    – wrapped in an RPC so anon key can write safely
  await supa.rpc('setup_new_user', {
    new_user_id: data.user.id,
    new_email: email
  });

  authMsg.textContent = 'Check your inbox to confirm.';
});

/* MAGIC LINK */
qs('#magic-btn').onclick = async () => {
  const email = qs('#login-form input[type=email]').value.trim();
  if (!email) return authMsg.textContent = 'Enter your email first.';
  const { error } = await supa.auth.signInWithOtp({ email });
  authMsg.textContent = error?.message ?? 'Magic link sent!';
};

/* RESET PASSWORD */
qs('#reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = e.target.elements[0].value.trim();
  const { error } = await supa.auth.resetPasswordForEmail(email);
  authMsg.textContent = error?.message ?? 'Reset link sent!';
});
qs('#newpw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = e.target.elements[0].value.trim();
  const { error } = await supa.auth.updateUser({ password: pw });
  authMsg.textContent = error?.message ?? 'Password updated – log in.';
  if (!error) supa.auth.signOut();
});

/* LOG‑OUT */
qs('#logout-btn').onclick = () => supa.auth.signOut();

/* ---------- AUTH STATE ---------- */
supa.auth.onAuthStateChange(async (_event, session) => {
  const user = session?.user;
  authSection.hidden = !!user;
  dashSection.hidden = !user;
  if (!user) return;

  // Fetch display name
  const { data: profile } = await supa.from('profiles').select('display_name').eq('id', user.id).single();
  userEmailEl.textContent = profile?.display_name || user.email;
  qs('#logout-btn').hidden = false;
  await loadBlogs();
});

/* HANDLE RECOVERY LINK */
window.addEventListener('load', () => {
  const params = new URLSearchParams(location.hash.replace('#', '?'));
  if (params.get('type') === 'recovery') {
    authMsg.textContent = 'Enter a new password';
    qsa('.auth-form').forEach(f => hide(f));
    show(qs('#newpw-form'));
    qs('.tabs').style.display = 'none';
  }
});

/* ---------- BLOG CRUD ---------- */
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
  const [title, description] = [...e.target.elements].map(i => i.value.trim());
  await supa.from('blogs').insert({ title, description });
  e.target.reset();
  loadBlogs();
});

/* ---------- POSTS ---------- */
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
