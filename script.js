/* ---------- CONFIG ---------- */
const supabaseUrl = 'https://eizwfyfindxzdzijbgxf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpendmeWZpbmR4emR6aWpiZ3hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYzNzEzMjYsImV4cCI6MjA2MTk0NzMyNn0.whdzYdVHDVoZVvbLYkpTc48yP5tt6kNBw0F842Q38vw';
const supa = supabase.createClient(supabaseUrl, supabaseAnonKey);

/* ---------- DOM helpers ---------- */
const q = s => document.querySelector(s);
const qa = s => [...document.querySelectorAll(s)];
const hide = el => (el.hidden = true);
const show = el => (el.hidden = false);

/* ---------- Elements ---------- */
const authSec=q('#auth-section'), dashSec=q('#dash-section'), postsPan=q('#posts-panel');
const authMsg=q('#auth-msg'), blogsUl=q('#blogs-list'), postsUl=q('#posts-list');
const userLbl=q('#user-email'), status=q('#status-badge');
const blogErr=q('#blog-err'), postErr=q('#post-err');

/* keys check */
if(supabaseUrl.includes('YOUR')||supabaseKey.includes('YOUR')){status.hidden=false;console.warn('Replace Supabase creds');}

/* ---------- Tabs ---------- */
qa('.tabs button').forEach(b=>b.onclick=()=>{qa('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');qa('form[id$="-form"]').forEach(hide);show(q(`#${b.dataset.tab}-form`));});

/* ---------- Auth ---------- */
q('#login-form').onsubmit=async e=>{e.preventDefault();authMsg.textContent='';
  const [email,pw]=[...e.target.elements].map(i=>i.value.trim());
  const {error}=await supa.auth.signInWithPassword({email,password:pw});
  if(error) authMsg.textContent=error.message;
};
q('#signup-form').onsubmit=async e=>{e.preventDefault();authMsg.textContent='';
  const [email,pw]=[...e.target.elements].map(i=>i.value.trim());
  const {data,error}=await supa.auth.signUp({email,password:pw});
  if(error){authMsg.textContent=error.message;return;}
  await supa.rpc('setup_new_user',{new_user_id:data.user.id,new_email:email});
  authMsg.textContent='Confirm your email, then log in.';
};
q('#reset-form').onsubmit=async e=>{e.preventDefault();
  const email=e.target.elements[0].value.trim();
  const {error}=await supa.auth.resetPasswordForEmail(email);
  authMsg.textContent=error?error.message:'Reset link sent!';
};
q('#newpw-form').onsubmit=async e=>{e.preventDefault();
  const pw=e.target.elements[0].value.trim();
  const {error}=await supa.auth.updateUser({password:pw});
  authMsg.textContent=error?error.message:'Password updated—log in.';if(!error)supa.auth.signOut();
};
q('#logout-btn').onclick=()=>supa.auth.signOut();

/* ---------- Session bootstrap ---------- */
(async()=>{
  const {data:{session}}=await supa.auth.getSession();
  if(session) await onSignIn(session.user);
  supa.auth.onAuthStateChange((_e,s)=>s?.user?onSignIn(s.user):onSignOut());

  /* recovery hash */
  const p=new URLSearchParams(location.hash.replace('#','?'));
  if(p.get('type')==='recovery'){authMsg.textContent='Enter a new password';qa('form[id$="-form"]').forEach(hide);show(q('#newpw-form'));q('.tabs').style.display='none';}
})();

/* ---------- Sign‑in/out UI ---------- */
async function onSignIn(user){
  const {data}=await supa.from('profiles').select('display_name').eq('id',user.id).single();
  userLbl.textContent=data?.display_name||user.email;
  hide(authSec);show(dashSec);
  await loadBlogs();
  supa.channel('blogs').on('postgres_changes',{event:'*',schema:'public',table:'blogs',filter:`owner_id=eq.${user.id}`},loadBlogs).subscribe();
}
function onSignOut(){show(authSec);hide(dashSec);hide(postsPan);userLbl.textContent='';blogsUl.innerHTML='';postsUl.innerHTML='';}

/* ---------- Blogs ---------- */
async function loadBlogs(){
  const {data,error}=await supa.from('blogs').select('id,title').order('created_at');
  blogsUl.innerHTML=error?`<li>${error.message}</li>`:data.map(b=>`<li><button class="blog-btn" data-id="${b.id}">${b.title}</button></li>`).join('');
  blogsUl.querySelectorAll('.blog-btn').forEach(btn=>btn.onclick=()=>openBlog(btn.dataset.id,btn.textContent));
}
q('#new-blog-form').onsubmit=async e=>{
  e.preventDefault();blogErr.textContent='';
  const [title,desc]=[...e.target.elements].map(i=>i.value.trim());
  const uid=supa.auth.user().id;
  const {error}=await supa.from('blogs').insert({owner_id:uid,title,description:desc});
  if(error) blogErr.textContent=error.message; else e.target.reset();
};

/* ---------- Posts ---------- */
async function openBlog(id,title){show(postsPan);q('#posts-heading').textContent=`Posts for “${title}”`;q('#new-post-form').dataset.blogId=id;await loadPosts(id);}
async function loadPosts(blogId){
  const {data,error}=await supa.from('posts').select('id,title,content,created_at').eq('blog_id',blogId).order('created_at',{ascending:false});
  postsUl.innerHTML=error?`<li>${error.message}</li>`:data.map(p=>`<li><strong>${p.title}</strong><em>${new Date(p.created_at).toLocaleString()}</em><p>${p.content}</p></li>`).join('');
}
q('#new-post-form').onsubmit=async e=>{
  e.preventDefault();postErr.textContent='';
  const blogId=e.target.dataset.blogId;
  const [title,content]=[...e.target.elements].map(i=>i.value.trim());
  const {error}=await supa.from('posts').insert({blog_id:blogId,title,content});
  if(error) postErr.textContent=error.message; else{e.target.reset();loadPosts(blogId);}
};
