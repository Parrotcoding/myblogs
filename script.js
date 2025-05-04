/* ---------- CONFIG ---------- */
const supabaseUrl = 'https://eizwfyfindxzdzijbgxf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpendmeWZpbmR4emR6aWpiZ3hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYzNzEzMjYsImV4cCI6MjA2MTk0NzMyNn0.whdzYdVHDVoZVvbLYkpTc48yP5tt6kNBw0F842Q38vw';
const supa = supabase.createClient(supabaseUrl, supabaseAnonKey);

/* ---------- DOM helpers ---------- */
const q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
const hide=e=>e.hidden=true, show=e=>e.hidden=false;

/* ---------- elements ---------- */
const authSec=q('#auth-section'),dashSec=q('#dash-section'),postsPan=q('#posts-panel');
const authMsg=q('#auth-msg'),blogsUl=q('#blogs-list'),postsUl=q('#posts-list');
const userLbl=q('#user-email'),status=q('#status-badge'),blogErr=q('#blog-err'),postErr=q('#post-err');

/* missing creds warning */
if(supabaseUrl.includes('YOUR')||supabaseAnonKey.includes('YOUR')){
  status.hidden=false;console.warn('Replace Supabase URL & key in script.js');
}

/* ---------- tabs ---------- */
qa('.tabs button').forEach(btn=>btn.onclick=()=>{
  qa('.tabs button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  qa('form[id$="-form"]').forEach(hide);
  show(q(`#${btn.dataset.tab}-form`));
});

/* ---------- auth flows ---------- */
q('#login-form').onsubmit=async e=>{
  e.preventDefault();authMsg.textContent='';
  const [email,pw]=[...e.target.elements].map(i=>i.value.trim());
  const{error}=await supa.auth.signInWithPassword({email,password:pw});
  if(error)authMsg.textContent=error.message;
};

q('#signup-form').onsubmit=async e=>{
  e.preventDefault();authMsg.textContent='';
  const [email,pw]=[...e.target.elements].map(i=>i.value.trim());
  const{data,error}=await supa.auth.signUp({email,password:pw});
  if(error)return authMsg.textContent=error.message;
  await supa.rpc('setup_new_user',{new_user_id:data.user.id,new_email:email});
  authMsg.textContent='Confirm your email, then log in.';
};

q('#reset-form').onsubmit=async e=>{
  e.preventDefault();
  const email=e.target.elements[0].value.trim();
  const{error}=await supa.auth.resetPasswordForEmail(email);
  authMsg.textContent=error?error.message:'Reset link sent!';
};

q('#newpw-form').onsubmit=async e=>{
  e.preventDefault();
  const pw=e.target.elements[0].value.trim();
  const{error}=await supa.auth.updateUser({password:pw});
  authMsg.textContent=error?error.message:'Password updated – log in.';if(!error)supa.auth.signOut();
};

q('#logout-btn').onclick=()=>supa.auth.signOut();

/* ---------- session bootstrap ---------- */
(async()=>{
  const{data:{session}}=await supa.auth.getSession();
  if(session)await onSignIn(session.user);
  supa.auth.onAuthStateChange((_ev,s)=>s?.user?onSignIn(s.user):onSignOut());

  /* recovery link */
  const p=new URLSearchParams(location.hash.replace('#','?'));
  if(p.get('type')==='recovery'){authMsg.textContent='Enter new password';qa('form[id$="-form"]').forEach(hide);show(q('#newpw-form'));q('.tabs').style.display='none';}
})();

/* ---------- sign‑in & out ---------- */
async function onSignIn(user){
  const {data}=await supa.from('profiles').select('display_name').eq('id',user.id).single();
  userLbl.textContent=data?.display_name||user.email;
  hide(authSec);show(dashSec);
  await loadBlogs();

  /* realtime blogs */
  supa.channel('blogs')
      .on('postgres_changes',{event:'*',schema:'public',table:'blogs',filter:`owner_id=eq.${user.id}`},loadBlogs)
      .subscribe();
}
function onSignOut(){show(authSec);hide(dashSec);hide(postsPan);userLbl.textContent='';blogsUl.innerHTML='';postsUl.innerHTML='';}

/* ---------- blogs ---------- */
async function loadBlogs(){
  const {data,error}=await supa.from('blogs').select('id,title').order('created_at');
  blogsUl.innerHTML=error?`<li class="err">${error.message}</li>`:data.map(b=>`<li><button class="btn link blog-btn" data-id="${b.id}">${b.title}</button></li>`).join('');
  blogsUl.querySelectorAll('.blog-btn').forEach(btn=>btn.onclick=()=>openBlog(btn.dataset.id,btn.textContent));
}
q('#new-blog-form').onsubmit=async e=>{
  e.preventDefault();blogErr.textContent='';
  const {data:{user}}=await supa.auth.getUser();if(!user)return blogErr.textContent='Not signed in';
  const [title,desc]=[...e.target.elements].map(i=>i.value.trim());
  const{error}=await supa.from('blogs').insert({owner_id:user.id,title,description:desc});
  if(error)blogErr.textContent=error.message;else e.target.reset();
};

/* ---------- posts ---------- */
async function openBlog(id,title){
  show(postsPan);
  q('#posts-heading').textContent=`Posts for “${title}”`;
  q('#new-post-form').dataset.blogId=id;
  await loadPosts(id);

  /* realtime posts for this blog */
  supa.channel(`posts_${id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'posts',filter:`blog_id=eq.${id}`},()=>loadPosts(id))
      .subscribe();
}

async function loadPosts(blogId){
  const {data,error}=await supa.from('posts').select('id,title,content,created_at').eq('blog_id',blogId).order('created_at',{ascending:false});
  postsUl.innerHTML=error?`<li class="err">${error.message}</li>`:data.map(p=>`
    <li class="post">
      <div class="post-head">
        <strong>${p.title}</strong>
        <button class="del" title="Delete" onclick="deletePost('${p.id}', '${blogId}')">🗑</button>
      </div>
      <span class="date">${new Date(p.created_at).toLocaleString()}</span>
      <p>${p.content}</p>
    </li>`).join('');
}

/* expose delete to global scope */
window.deletePost=async(id,blogId)=>{
  if(!confirm('Delete this post?'))return;
  await supa.from('posts').delete().eq('id',id);
  loadPosts(blogId);
};

q('#new-post-form').onsubmit=async e=>{
  e.preventDefault();postErr.textContent='';
  const blogId=e.target.dataset.blogId;
  const [title,content]=[...e.target.elements].map(i=>i.value.trim());
  const{error}=await supa.from('posts').insert({blog_id:blogId,title,content});
  if(error)postErr.textContent=error.message;else{e.target.reset();loadPosts(blogId);}
};
