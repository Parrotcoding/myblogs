/* ---------- CONFIG ---------- */
const supabaseUrl = 'https://eizwfyfindxzdzijbgxf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpendmeWZpbmR4emR6aWpiZ3hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYzNzEzMjYsImV4cCI6MjA2MTk0NzMyNn0.whdzYdVHDVoZVvbLYkpTc48yP5tt6kNBw0F842Q38vw';
const supa = supabase.createClient(supabaseUrl, supabaseAnonKey);

/* ------------------------------------------------------------------
   DOM READY
------------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  /* ---------- helpers ---------- */
  const q  = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const hide = (el) => (el.hidden = true);
  const show = (el) => (el.hidden = false);

  /* ---------- elements ---------- */
  const authSec  = q('#auth-section');
  const dashSec  = q('#dash-section');
  const postsPan = q('#posts-panel');

  const authMsg  = q('#auth-msg');
  const blogsUl  = q('#blogs-list');
  const postsUl  = q('#posts-list');

  const userLbl  = q('#user-email');
  const status   = q('#status-badge');
  const blogErr  = q('#blog-err');
  const postErr  = q('#post-err');

  /* ---------- creds sanity ---------- */
  if (SUPABASE_URL.includes('YOUR') || SUPABASE_KEY.includes('YOUR')) {
    status.hidden = false;
    console.warn('⚠️  Replace Supabase URL & anon key in script.js');
  }

  /* ---------- tab UI ---------- */
  qa('.tabs button').forEach(btn => {
    btn.onclick = () => {
      qa('.tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      qa('form[id$="-form"]').forEach(hide);
      show(q(`#${btn.dataset.tab}-form`));
    };
  });

  /* ----------------------------------------------------------------
     AUTH HANDLERS
  ---------------------------------------------------------------- */
  q('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    authMsg.textContent = '';
    const [email, pw] = [...e.target.elements].map(i => i.value.trim());
    const { error } = await supa.auth.signInWithPassword({ email, password: pw });
    if (error) authMsg.textContent = error.message;
  };

  q('#signup-form').onsubmit = async (e) => {
    e.preventDefault();
    authMsg.textContent = '';
    const [email, pw] = [...e.target.elements].map(i => i.value.trim());
    const { data, error } = await supa.auth.signUp({ email, password: pw });
    if (error) return (authMsg.textContent = error.message);
    await supa.rpc('setup_new_user', { new_user_id: data.user.id, new_email: email });
    authMsg.textContent = 'Confirm your email, then log in.';
  };

  q('#reset-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = e.target.elements[0].value.trim();
    const { error } = await supa.auth.resetPasswordForEmail(email);
    authMsg.textContent = error ? error.message : 'Reset link sent!';
  };

  q('#newpw-form').onsubmit = async (e) => {
    e.preventDefault();
    const pw = e.target.elements[0].value.trim();
    const { error } = await supa.auth.updateUser({ password: pw });
    authMsg.textContent = error ? error.message : 'Password updated – log in.';
    if (!error) supa.auth.signOut();
  };

  q('#logout-btn').onclick = () => supa.auth.signOut();

  /* ----------------------------------------------------------------
     SESSION BOOTSTRAP
  ---------------------------------------------------------------- */
  onSignOut(); // start locked

  (async () => {
    const { data: { session } } = await supa.auth.getSession();
    if (session) await onSignIn(session.user);

    supa.auth.onAuthStateChange((_evt, sess) => {
      if (sess?.user) onSignIn(sess.user);
      else             onSignOut();
    });
  })();

  /* ----------------------------------------------------------------
     SIGN‑IN / SIGN‑OUT UI
  ---------------------------------------------------------------- */
  async function onSignIn(user) {
    const { data } = await supa.from('profiles')
                               .select('display_name')
                               .eq('id', user.id)
                               .single();
    userLbl.textContent = data?.display_name || user.email;

    hide(authSec);
    show(dashSec);
    await loadBlogs();

    supa.channel(`blogs_${user.id}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'blogs',
              filter: `owner_id=eq.${user.id}` },
            loadBlogs)
        .subscribe();
  }

  function onSignOut() {
    show(authSec);
    hide(dashSec);
    hide(postsPan);
    userLbl.textContent = '';
    blogsUl.innerHTML  = '';
    postsUl.innerHTML  = '';
  }

  /* ----------------------------------------------------------------
     BLOGS
  ---------------------------------------------------------------- */
  async function loadBlogs() {
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return;

    const { data, error } = await supa.from('blogs')
                                      .select('id,title')
                                      .order('created_at');
    blogsUl.innerHTML = error
      ? `<li class="err">${error.message}</li>`
      : data.map(b => `<li><button class="btn link blog-btn"
                           data-id="${b.id}">${b.title}</button></li>`).join('');

    blogsUl.querySelectorAll('.blog-btn')
           .forEach(btn => btn.onclick =
               () => openBlog(btn.dataset.id, btn.textContent));
  }

  q('#new-blog-form').onsubmit = async (e) => {
    e.preventDefault();
    blogErr.textContent = '';
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return (blogErr.textContent = 'Not signed in');

    const [title, desc] = [...e.target.elements].map(i => i.value.trim());
    const { error } = await supa.from('blogs')
                                .insert({ owner_id: user.id, title, description: desc });

    if (error) blogErr.textContent = error.message;
    else { e.target.reset(); await loadBlogs(); }
  };

  /* ----------------------------------------------------------------
     POSTS
  ---------------------------------------------------------------- */
  async function openBlog(id, title) {
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return;

    show(postsPan);
    q('#posts-heading').textContent = `Posts for “${title}”`;
    q('#new-post-form').dataset.blogId = id;
    await loadPosts(id);

    supa.channel(`posts_${id}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'posts',
              filter: `blog_id=eq.${id}` },
            () => loadPosts(id))
        .subscribe();
  }

  async function loadPosts(blogId) {
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return;

    const { data, error } = await supa.from('posts')
      .select('id,title,content,image_url,created_at')
      .eq('blog_id', blogId)
      .order('created_at', { ascending: false });

    postsUl.innerHTML = error
      ? `<li class="err">${error.message}</li>`
      : data.map(p => `
        <li class="post">
          <div class="post-head">
            <strong>${p.title}</strong>
            <button class="del" onclick="deletePost('${p.id}','${blogId}')">🗑</button>
          </div>
          <span class="date">${new Date(p.created_at).toLocaleString()}</span>
          ${p.image_url ? `<img src="${p.image_url}" alt="" onclick="window.open('${p.image_url}','_blank')">` : ''}
          <p>${p.content}</p>
        </li>`).join('');
  }

  /* exposed globally for inline onclick */
  window.deletePost = async (id, blogId) => {
    if (!confirm('Delete this post?')) return;
    await supa.from('posts').delete().eq('id', id);
    loadPosts(blogId);
  };

  /* ---------- new post + image ---------- */
  q('#new-post-form').onsubmit = async (e) => {
    e.preventDefault();
    postErr.textContent = '';

    const blogId = e.target.dataset.blogId;
    const title   = q('#post-title').value.trim();
    const content = q('#post-content').value.trim();
    const file    = q('#post-image').files[0];

    let imgUrl = null;
    if (file) {
      const ext      = file.name.split('.').pop();
      const path     = `${crypto.randomUUID()}.${ext}`;
      const upRes    = await supa.storage.from('post-images').upload(path, file);
      if (upRes.error) return postErr.textContent = `Upload error: ${upRes.error.message}`;
      imgUrl = supa.storage.from('post-images').getPublicUrl(path).data.publicUrl;
    }

    const { error } =
      await supa.from('posts').insert({ blog_id: blogId, title, content, image_url: imgUrl });
    if (error) postErr.textContent = error.message;
    else { e.target.reset(); loadPosts(blogId); }
  };
});
