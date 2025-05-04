/* ---------- CONFIG ---------- */
const supabaseUrl = 'https://YOUR-PROJECT.supabase.co';
const supabaseAnonKey = 'YOUR-SUPABASE-ANON-KEY';
const supa = supabase.createClient(supabaseUrl, supabaseAnonKey);

/* ---------- SHORTCUTS ---------- */
const qs = (sel) => document.querySelector(sel);
const authSection = qs('#auth-section');
const dashSection = qs('#dash-section');
const postsPanel  = qs('#posts-panel');
const authMsg     = qs('#auth-msg');
const blogsList   = qs('#blogs-list');
const postsList   = qs('#posts-list');

/* ---------- AUTH ---------- */
qs('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = qs('#email').value.trim();
  const pass  = qs('#password').value;
  let { error } = await supa.auth.signInWithPassword({ email, password: pass });
  if (error && error.status === 400) {
    ({ error } = await supa.auth.signUp({ email, password: pass }));
  }
  authMsg.textContent = error ? error.message : 'Check your inbox if signing up for the first time.';
});

qs('#logout-btn').addEventListener('click', () => supa.auth.signOut());

/* ---------- REAL‑TIME AUTH UI ---------- */
supa.auth.onAuthStateChange((_evt, session) => {
  const user = session?.user;
  authSection.hidden = !!user;
  dashSection.hidden = !user;
  if (!user) return;

  qs('#user-email').textContent = user.email;
  qs('#logout-btn').hidden = false;
  loadBlogs();
});

/* ---------- BLOG CRUD ---------- */
async function loadBlogs() {
  const { data, error } = await supa.from('blogs')
    .select('id,title,description')
    .order('created_at', { ascending: true });

  blogsList.innerHTML = error ? `<li>${error.message}</li>` :
    data.map(b => `<li><button data-id="${b.id}" class="blog-btn">${b.title}</button></li>`).join('');

  // Attach click handlers after render
  blogsList.querySelectorAll('.blog-btn').forEach(btn =>
    btn.onclick = () => openBlog(btn.dataset.id, btn.textContent)
  );
}

qs('#new-blog-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = qs('#blog-title').value.trim();
  const description = qs('#blog-desc').value.trim();
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
  const { data, error } = await supa.from('posts')
    .select('id,title,content,created_at')
    .eq('blog_id', blogId)
    .order('created_at', { ascending: false });

  postsList.innerHTML = error ? `<li>${error.message}</li>` :
    data.map(p => `<li><strong>${p.title}</strong> <em>${new Date(p.created_at).toLocaleString()}</em><p>${p.content}</p></li>`).join('');
}

qs('#new-post-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const blogId = e.target.dataset.blogId;
  const title = qs('#post-title').value.trim();
  const content = qs('#post-content').value.trim();
  await supa.from('posts').insert({ blog_id: blogId, title, content });
  e.target.reset();
  loadPosts(blogId);
});
