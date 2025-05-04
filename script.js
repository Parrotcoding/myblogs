/* ---------- CONFIG ---------- */
const supabaseUrl = 'https://eizwfyfindxzdzijbgxf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpendmeWZpbmR4emR6aWpiZ3hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYzNzEzMjYsImV4cCI6MjA2MTk0NzMyNn0.whdzYdVHDVoZVvbLYkpTc48yP5tt6kNBw0F842Q38vw';
const supa = supabase.createClient(supabaseUrl, supabaseAnonKey);

/* ---------- DOM helpers ---------- */
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
const hide=e=>e.hidden=true,show=e=>e.hidden=false;

/* ---------- elements ---------- */
const authSec=q('#auth-section'),dashSec=q('#dash-section'),postsPan=q('#posts-panel');
const authMsg=q('#auth-msg'),blogsUl=q('#blogs-list'),postsUl=q('#posts-list');
const userLbl=q('#user-email'),status=q('#status-badge'),blogErr=q('#blog-err'),postErr=q('#post-err');

/* creds check */
if(supabaseUrl.includes('YOUR')||supabaseAnonKey.includes('YOUR')){
  status.hidden=false;console.warn('Replace Supabase creds');
}

/* ---------- tab UI ---------- */
qa('.tabs button').forEach(btn=>btn.onclick=()=>{
  qa('.tabs button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  qa('form[id$="-form"]').forEach(hide);
  show(q(`#${btn.dataset.tab}-form`));
});

/* ---------- AUTH (handlers unchanged) ---------- */
q('#login-form').onsubmit   = async e=>{ /* …same… */ };
q('#signup-form').onsubmit  = async e=>{ /* …same… */ };
q('#reset-form').onsubmit   = async e=>{ /* …same… */ };
q('#newpw-form').onsubmit   = async e=>{ /* …same… */ };
q('#logout-btn').onclick    = () => supa.auth.signOut();

/* ---------- FORCE initial logged‑out UI ---------- */
// NEW
onSignOut();

/* ---------- session bootstrap ---------- */
(async()=>{
  const { data:{session} } = await supa.auth.getSession();
  if(session) await onSignIn(session.user);

  supa.auth.onAuthStateChange((_e,sess)=>{
    if(sess?.user) onSignIn(sess.user);
    else           onSignOut();
  });
})();

/* ---------- sign‑in / sign‑out UI ---------- */
async function onSignIn(user){
  const { data } = await supa
    .from('profiles').select('display_name').eq('id',user.id).single();
  userLbl.textContent = data?.display_name || user.email;

  hide(authSec); show(dashSec);
  await loadBlogs();

  /* realtime blog updates */
  supa.channel(`blogs_${user.id}`)
      .on('postgres_changes',
          { event:'*', schema:'public', table:'blogs',
            filter:`owner_id=eq.${user.id}` },
          loadBlogs)
      .subscribe();
}

function onSignOut(){
  show(authSec); hide(dashSec); hide(postsPan);
  userLbl.textContent = '';
  blogsUl.innerHTML  = '';
  postsUl.innerHTML  = '';
}

/* ---------- blogs ---------- */
async function loadBlogs(){
  // NEW — gate‑keep
  const { data:{user} } = await supa.auth.getUser();
  if(!user) return;

  const { data,error } = await supa
    .from('blogs').select('id,title').order('created_at');
  blogsUl.innerHTML = error
    ? `<li class="err">${error.message}</li>`
    : data.map(b=>`<li><button class="btn link blog-btn"
                     data-id="${b.id}">${b.title}</button></li>`).join('');

  blogsUl.querySelectorAll('.blog-btn')
         .forEach(btn=>btn.onclick=() => openBlog(btn.dataset.id, btn.textContent));
}

/* create blog (unchanged except final refresh still present) */
q('#new-blog-form').onsubmit = async e => { /* …same… */ };

/* ---------- posts ---------- */
async function openBlog(id,title){
  // NEW — block if not signed in
  const { data:{user} } = await supa.auth.getUser();
  if(!user) return;

  show(postsPan);
  q('#posts-heading').textContent = `Posts for “${title}”`;
  q('#new-post-form').dataset.blogId = id;
  await loadPosts(id);

  /* realtime for this blog */
  supa.channel(`posts_${id}`)
      .on('postgres_changes',
          { event:'*', schema:'public', table:'posts',
            filter:`blog_id=eq.${id}` },
          () => loadPosts(id))
      .subscribe();
}

async function loadPosts(blogId){
  const { data:{user} } = await supa.auth.getUser();
  if(!user) return;           // NEW

  const { data,error } = await supa
    .from('posts')
    .select('id,title,content,image_url,created_at')
    .eq('blog_id',blogId)
    .order('created_at',{ascending:false});

  postsUl.innerHTML = error
    ? `<li class="err">${error.message}</li>`
    : data.map(p=>`
        <li class="post">
          <div class="post-head">
            <strong>${p.title}</strong>
            <button class="del" onclick="deletePost('${p.id}','${blogId}')">🗑</button>
          </div>
          <span class="date">${new Date(p.created_at).toLocaleString()}</span>
          ${p.image_url ? `<img src="${p.image_url}" onclick="window.open('${p.image_url}','_blank')">` : ''}
          <p>${p.content}</p>
        </li>`).join('');
}

/* delete & new‑post handlers unchanged */
window.deletePost = async(id,blogId)=>{ /* …same… */ };
q('#new-post-form').onsubmit = async e => { /* …same… */ };
