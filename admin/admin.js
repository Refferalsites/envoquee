(function(){
const $=s=>document.querySelector(s),api="/api/admin-api",msg=t=>{$("#msg").textContent=t||""};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function call(action,body){const get=body&&body.qs!==undefined;const r=await fetch(api+"?action="+action+(get?body.qs:""),get?{credentials:"same-origin"}:{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body||{})});
 const d=await r.json().catch(()=>({error:"Bad response"}));if(r.status===401){show(false);throw new Error("Session expired, please sign in")}if(!r.ok)throw new Error(d.error||("Error "+r.status));return d}
function show(app){$("#login").hidden=app;$("#app").hidden=!app}
$("#lf").onsubmit=async e=>{e.preventDefault();$("#lerr").textContent="";const f=new FormData(e.target);
 const r=await fetch("/api/admin-login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:f.get("username"),password:f.get("password")})});
 const d=await r.json().catch(()=>({}));if(r.ok){e.target.reset();start()}else $("#lerr").textContent=d.error||"Login failed"};
$("#logout").onclick=async()=>{await fetch("/api/admin-login",{method:"DELETE"});show(false)};
const TABS=["orders","posts","product","settings","seo","idx","msgs","emails"];
document.querySelectorAll("header nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll("header nav button").forEach(x=>x.classList.toggle("on",x===b));TABS.forEach(t=>$("#t-"+t).hidden=t!==b.dataset.tab);msg("");if(b.dataset.tab==="msgs")loadMsgs();if(b.dataset.tab==="orders")loadOrders();if(b.dataset.tab==="idx")loadIdx();if(b.dataset.tab==="emails")loadEmails()});
const get=(o,k)=>k.split(".").reduce((a,x)=>a&&a[x],o),put=(o,k,v)=>{const ks=k.split(".");let a=o;ks.slice(0,-1).forEach(x=>a=a[x]=a[x]||{});a[ks.at(-1)]=v};
let META={categories:[],images:[]},SET=null,SETSHA=null,PROD=null,PSHA=null,CUR=null,ORD=[];
// ---- orders
const ST=["new","confirmed","shipped","delivered","cancelled"],rs=n=>n==null?"—":"Rs "+Number(n).toLocaleString("en-PK");
async function loadOrders(){const L=$("#olist");L.textContent="Loading…";try{const d=await call("orders",{qs:""});if(!d.kv){L.textContent="KV binding STORE is not configured.";return}ORD=d.items;renderOrders()}catch(e){L.textContent=e.message}}
function renderOrders(){const L=$("#olist"),f=$("#ofilter").value,q=$("#osearch").value.toLowerCase();
 const c={};ORD.forEach(o=>c[o.status]=(c[o.status]||0)+1);$("#ocount").innerHTML=`<span>Total: ${ORD.length}</span>`+ST.map(s=>`<span class="st-${s}">${s}: ${c[s]||0}</span>`).join("");
 const items=ORD.filter(o=>(!f||o.status===f)&&(!q||[o.id,o.name,o.phone,o.city,o.address].join(" ").toLowerCase().includes(q)));
 if(!items.length){L.textContent=ORD.length?"No orders match.":"No orders yet.";return}
 L.innerHTML="<table class='ord'><tr><th>Order</th><th>Date (PKT)</th><th>Customer</th><th>Address</th><th>Qty</th><th>Total</th><th>Notes</th><th>Status</th><th></th></tr>"+items.map(o=>`<tr><td><b>${esc(o.id)}</b></td><td>${esc(new Date(o.at).toLocaleString("en-PK",{timeZone:"Asia/Karachi"}))}</td><td>${esc(o.name)}${o.email?"<br>"+esc(o.email):""}<br><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a> · <a target="_blank" href="https://wa.me/92${esc(String(o.phone).replace(/^0/,""))}">WhatsApp</a></td><td>${esc(o.city)}<br>${esc(o.address)}</td><td>${esc(o.qty)}</td><td>${rs(o.total)}${o.delivery==null?"<br><small>+ delivery tbc</small>":""}</td><td>${esc(o.notes)}${o.admin_note?"<br><i>"+esc(o.admin_note)+"</i>":""}${o.courier||o.tracking?"<br>🚚 "+esc(o.courier)+" "+esc(o.tracking):""}</td><td><select data-st="${esc(o.id)}" class="st-${esc(o.status)}">${ST.map(s=>`<option ${s===o.status?"selected":""}>${s}</option>`).join("")}</select></td><td><button type="button" class="ghost" data-note="${esc(o.id)}">Note</button> <button type="button" class="ghost" data-ship="${esc(o.id)}">Courier</button> <button type="button" class="danger" data-del="${esc(o.id)}">Delete</button></td></tr>`).join("")+"</table>";
 L.querySelectorAll("[data-st]").forEach(s=>s.onchange=async()=>{const o=ORD.find(x=>x.id===s.dataset.st);let extra={};
  if(s.value==="shipped"&&!o.tracking){const c=prompt("Courier (e.g. TCS, Leopards, M&P, PostEx)",o.courier||"");if(c===null){renderOrders();return}const t=prompt("Tracking number",o.tracking||"");if(t===null){renderOrders();return}extra={courier:c,tracking:t}}
  const notify=o.email?confirm("Email the customer about this status change?"):false;msg("Updating…");
  try{const d=await call("order-status",{id:s.dataset.st,status:s.value,notify,...extra});Object.assign(o,d.order);renderOrders();msg("Order "+o.id+" → "+s.value+(d.email?" · email: "+(d.email.skipped||d.email.status):""))}catch(e){msg(e.message)}});
 L.querySelectorAll("[data-ship]").forEach(b=>b.onclick=async()=>{const o=ORD.find(x=>x.id===b.dataset.ship);const c=prompt("Courier",o.courier||"");if(c===null)return;const t=prompt("Tracking number",o.tracking||"");if(t===null)return;try{const d=await call("order-status",{id:o.id,status:o.status,courier:c,tracking:t});Object.assign(o,d.order);renderOrders()}catch(e){msg(e.message)}});
 L.querySelectorAll("[data-note]").forEach(b=>b.onclick=async()=>{const o=ORD.find(x=>x.id===b.dataset.note);const n=prompt("Internal note for "+o.id,o.admin_note||"");if(n===null)return;try{const d=await call("order-status",{id:o.id,status:o.status,admin_note:n});Object.assign(o,d.order);renderOrders()}catch(e){msg(e.message)}});
 L.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete order "+b.dataset.del+" permanently?"))return;try{await call("delete-order",{id:b.dataset.del});ORD=ORD.filter(o=>o.id!==b.dataset.del);renderOrders()}catch(e){msg(e.message)}})}
$("#oreload").onclick=loadOrders;$("#ofilter").onchange=renderOrders;$("#osearch").oninput=renderOrders;
// ---- posts
const pf=$("#pf");
function toLocal(iso){const d=new Date(iso);if(isNaN(d))return"";const p=n=>String(n).padStart(2,"0");return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes())}
function toIso(local){const d=new Date(local),o=-d.getTimezoneOffset(),p=n=>String(Math.floor(Math.abs(n))).padStart(2,"0");return local+":00"+(o>=0?"+":"-")+p(o/60)+":"+p(o%60)}
async function loadPosts(){const l=await call("posts",{qs:""});const live=Object.fromEntries((META.all_posts||[]).map(p=>[p.slug,p]));$("#plist").innerHTML="";l.sort().forEach(s=>{const li=document.createElement("li");const m=live[s];li.textContent=s+(m?(m.status!=="published"?" (draft)":m.live?"":" (scheduled)"):"");li.onclick=()=>openPost(s,li);$("#plist").appendChild(li)})}
async function openPost(slug,li){document.querySelectorAll("#plist li").forEach(x=>x.classList.toggle("on",x===li));msg("Loading…");const p=await call("post",{qs:"&slug="+encodeURIComponent(slug)});CUR=p;fill(p);$("#ptitle").textContent="Edit post";pf.slug.readOnly=true;$("#delpost").hidden=false;pf.hidden=false;msg("")}
function fill(p){pf.title.value=p.title||"";pf.slug.value=p.slug||"";pf.date.value=toLocal(p.date||new Date().toISOString());pf.status.value=p.status==="published"?"published":"draft";pf.category.value=p.category||META.categories[0]||"";pf.image.value=p.image||"/img/kit-beige-1200.webp";pf.question.value=p.question||"";pf.description.value=p.description||"";pf.body.value=(p.body||"").trim()}
$("#newpost").onclick=()=>{CUR={};fill({status:"draft",body:"**Short answer:** \n\n## Details\n"});$("#ptitle").textContent="New post";pf.slug.readOnly=false;$("#delpost").hidden=true;pf.hidden=false};
pf.title.oninput=()=>{if(!pf.slug.readOnly)pf.slug.value=pf.title.value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70)};
pf.onsubmit=async e=>{e.preventDefault();msg("Saving…");try{const d=await call("save-post",{slug:pf.slug.value,sha:CUR&&CUR.sha,title:pf.title.value,date:toIso(pf.date.value),status:pf.status.value,category:pf.category.value,image:pf.image.value,question:pf.question.value,description:pf.description.value,body:pf.body.value});
 CUR.sha=d.sha;CUR.slug=pf.slug.value;pf.slug.readOnly=true;msg("Saved. The site rebuilds automatically (about 1–2 minutes).");loadPosts()}catch(err){msg(err.message)}};
$("#delpost").onclick=async()=>{if(!CUR||!CUR.sha||!confirm("Delete this post permanently?"))return;try{await call("delete-post",{slug:CUR.slug,sha:CUR.sha});pf.hidden=true;msg("Deleted.");loadPosts()}catch(err){msg(err.message)}};
// ---- product
const prf=$("#prf");
function renderImgs(){const box=$("#imgs");box.innerHTML="";(PROD.images||[]).forEach((g,i)=>{const f=document.createElement("figure");const src=g.src.startsWith("/")?g.src:"/img/"+g.src+"-600.webp";
 f.innerHTML=`<img src="${esc(src)}" alt=""><input value="${esc(g.alt)}" placeholder="Alt text"><div class="row"><button type="button" class="ghost" data-a="up">←</button><button type="button" class="ghost" data-a="dn">→</button><button type="button" class="danger" data-a="rm">✕</button></div>`;
 f.querySelector("input").onchange=e=>g.alt=e.target.value;f.querySelectorAll("button").forEach(b=>b.onclick=()=>{const L=PROD.images;if(b.dataset.a==="rm"){if(L.length>1)L.splice(i,1)}else{const j=b.dataset.a==="up"?i-1:i+1;if(j>=0&&j<L.length)[L[i],L[j]]=[L[j],L[i]]}renderImgs()});box.appendChild(f)})}
async function loadProduct(){const d=await call("product",{qs:""});PROD=d.product;PSHA=d.sha;if(!PROD.images)PROD.images=(META.images_default||[]);
 [...prf.elements].forEach(el=>{if(!el.name)return;const v=get(PROD,el.name);if(el.type==="checkbox")el.checked=!!v;else el.value=v??""});
 $("#revs").value=(PROD.reviews||[]).map(r=>[r.name,r.city,r.rating,r.text,r.date].map(x=>String(x??"").replace(/\|/g,"/")).join(" | ")).join("\n");renderImgs()}
$("#imgup").onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>3e6){msg("Image too large (max 3 MB)");return}msg("Uploading…");
 const data=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(file)});
 try{const d=await call("upload-image",{name:Date.now()+"-"+file.name,data});PROD.images.push({src:d.src,alt:PROD.name});renderImgs();msg("Uploaded. Add alt text, then Save product.")}catch(err){msg(err.message)}e.target.value=""};
prf.onsubmit=async e=>{e.preventDefault();[...prf.elements].forEach(el=>{if(el.name)put(PROD,el.name,el.type==="checkbox"?el.checked:el.type==="number"?Number(el.value):el.value.trim())});
 PROD.reviews=$("#revs").value.split("\n").map(l=>l.split("|").map(x=>x.trim())).filter(a=>a[0]&&a[3]).map(([name,city,rating,text,date])=>({name,city,rating:Math.min(5,Math.max(1,parseInt(rating)||5)),text,date:date||""}));
 msg("Saving…");try{const d=await call("save-product",{sha:PSHA,product:PROD});PSHA=d.sha;msg("Product saved. Site rebuilding (about 1–2 minutes).")}catch(err){msg(err.message)}};
// ---- settings
function fillForm(f){[...f.elements].forEach(el=>{if(!el.name)return;const v=get(SET,el.name);if(el.type==="checkbox")el.checked=!!v;else el.value=v??""})}
async function saveForm(f){[...f.elements].forEach(el=>{if(el.name)put(SET,el.name,el.type==="checkbox"?el.checked:el.value.trim())});msg("Saving…");try{const d=await call("save-settings",{sha:SETSHA,settings:SET});SETSHA=d.sha;msg("Saved. Site rebuilding (about 1–2 minutes).")}catch(e){msg(e.message)}}
$("#sf").onsubmit=e=>{e.preventDefault();saveForm(e.target)};$("#seof").onsubmit=e=>{e.preventDefault();saveForm(e.target)};
async function loadSettings(){const d=await call("settings",{qs:""});SET=d.settings;SETSHA=d.sha;fillForm($("#sf"));fillForm($("#seof"));
 const st=await call("status",{qs:""});$("#smurl").href=$("#smurl").textContent=st.sitemap;$("#mfurl").href=$("#mfurl").textContent=st.merchantFeed;
 $("#gstat").textContent=st.secrets.GOOGLE_INDEXING_SA_JSON?"configured":"not set";$("#gstat").className=st.secrets.GOOGLE_INDEXING_SA_JSON?"ok":"no";
 $("#secrets").innerHTML=Object.entries(st.secrets).map(([k,v])=>`<li><code>${k}</code><span class="${v?"ok":"no"}">${v?"✓ configured":"✗ not set"}</span></li>`).join("")}
$("#gscsubmit").onclick=async()=>{msg("Submitting…");try{const d=await call("gsc-submit-sitemap",{});msg(d.detail)}catch(e){msg(e.message)}};
$("#mcstatus").onclick=async()=>{msg("Checking…");try{const d=await call("merchant-status",{merchantId:get(SET,"seo.merchant_center_id")});msg("Merchant API: "+d.status+" "+d.detail.slice(0,200))}catch(e){msg(e.message)}};
// ---- indexing
function logHtml(a){return (a&&a.length)?"<table><tr><th>When</th><th>Trigger</th><th>Result</th><th>URLs</th><th>Detail</th></tr>"+a.map(e=>`<tr><td>${esc(new Date(e.at).toLocaleString())}</td><td>${esc(e.trigger)}</td><td class="${e.ok?"ok":"no"}">${e.ok?"OK":"Failed"}${e.status?" ("+esc(e.status)+")":""}</td><td>${esc(e.count??"")}</td><td>${esc(e.detail)}</td></tr>`).join("")+"</table>":"<p class='small'>No runs yet.</p>"}
async function loadIdx(){try{const l=await call("indexing-log",{qs:""});$("#inlog").innerHTML=logHtml(l.indexnow);$("#glog").innerHTML=logHtml(l.google);const k=get(SET||{},"seo.indexnow_key");if(k){$("#ikurl").href=$("#ikurl").textContent=location.origin+"/"+k+".txt"}}catch(e){msg(e.message)}}
$("#inall").onclick=async()=>{msg("Submitting all URLs to IndexNow…");try{const d=await call("indexnow-submit-all",{});msg("IndexNow: "+d.indexnow.detail);loadIdx()}catch(e){msg(e.message)}};
$("#gnow").onclick=async()=>{msg("Sending to Google…");try{const d=await call("google-index-now",{});msg("Google: "+d.detail);loadIdx()}catch(e){msg(e.message)}};
// ---- messages
async function loadMsgs(){const L=$("#msglist");L.textContent="Loading…";try{const d=await call("messages",{qs:""});
 if(!d.kv){L.textContent="KV binding STORE is not configured.";return}if(!d.items.length){L.textContent="No messages yet.";return}
 L.innerHTML="<table><tr><th>When</th><th>Name</th><th>Phone</th><th>Email</th><th>Message</th><th></th></tr>"+d.items.map(m=>`<tr><td>${esc(new Date(m.at).toLocaleString("en-PK",{timeZone:"Asia/Karachi"}))}</td><td>${esc(m.name)}</td><td>${esc(m.phone)}</td><td>${m.email?`<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>`:""}</td><td style="white-space:pre-wrap">${esc(m.message)}</td><td><button type="button" class="danger" data-del="${esc(m.id)}">Delete</button></td></tr>`).join("")+"</table>";
 L.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this message?"))return;try{await call("delete-message",{id:b.dataset.del});loadMsgs()}catch(e){msg(e.message)}})}catch(e){L.textContent=e.message}}
$("#msgreload").onclick=loadMsgs;
// ---- emails
let ECFG=null;
async function loadEmails(){try{const d=await call("email-config",{qs:""});ECFG=d;$("#eprov").textContent=d.provider?d.provider+" (sending live)":"none (log only)";$("#eprov").className=d.provider?"ok":"no";$("#efrom").textContent=d.from||"not set";$("#eadmin").textContent=d.admin||"not set";
 const f=$("#ecf");f.review_days.value=d.cfg.review_days;f.abandoned_hours.value=d.cfg.abandoned_hours;f.sms_enabled.checked=d.cfg.sms_enabled;f.whatsapp_enabled.checked=d.cfg.whatsapp_enabled;
 $("#etestt").innerHTML=Object.entries(d.templates).map(([k,t])=>`<option value="${k}">${esc(t.label)}</option>`).join("");
 $("#etpls").innerHTML=Object.entries(d.templates).map(([k,t])=>`<details class="help" data-k="${k}"><summary>${t.enabled?"🟢":"⚪"} ${esc(t.label)}</summary><label class="cb"><input type="checkbox" data-f="enabled" ${t.enabled?"checked":""}> Enabled</label><label>Subject<input data-f="subject" value="${esc(t.subject)}"></label><label>Body<textarea data-f="body" rows="8">${esc(t.body)}</textarea></label><button type="button" class="ghost" data-reset="${k}">Reset to default</button></details>`).join("");
 $("#etpls").querySelectorAll("[data-reset]").forEach(b=>b.onclick=()=>{const k=b.dataset.reset,t=d.defaults[k],box=b.closest("details");box.querySelector("[data-f=subject]").value=t.subject;box.querySelector("[data-f=body]").value=t.body;box.querySelector("[data-f=enabled]").checked=t.enabled});
 loadElog();loadSubs(false)}catch(e){msg(e.message)}}
$("#ecf").onsubmit=async e=>{e.preventDefault();const f=e.target,templates={};f.querySelectorAll("#etpls details").forEach(x=>{templates[x.dataset.k]={enabled:x.querySelector("[data-f=enabled]").checked,subject:x.querySelector("[data-f=subject]").value,body:x.querySelector("[data-f=body]").value}});
 msg("Saving…");try{await call("save-email-config",{cfg:{review_days:f.review_days.value,abandoned_hours:f.abandoned_hours.value,sms_enabled:f.sms_enabled.checked,whatsapp_enabled:f.whatsapp_enabled.checked,templates}});msg("Email settings saved (live immediately).");loadEmails()}catch(err){msg(err.message)}};
$("#etest").onclick=async()=>{msg("Sending test…");try{const d=await call("email-test",{template:$("#etestt").value,to:$("#etestto").value});msg("Test: "+(d.skipped||d.status)+" "+(d.detail||""));loadElog()}catch(e){msg(e.message)}};
async function loadElog(){const d=await call("email-log",{qs:""});$("#elog").innerHTML=d.items.length?"<table><tr><th>When</th><th>Template</th><th>To</th><th>Subject</th><th>Status</th><th>Detail</th></tr>"+d.items.map(x=>`<tr><td>${esc(new Date(x.at).toLocaleString("en-PK",{timeZone:"Asia/Karachi"}))}</td><td>${esc(x.template)}</td><td>${esc(x.to)}</td><td>${esc(x.subject)}</td><td class="${x.status==="failed"?"no":"ok"}">${esc(x.status)}</td><td>${esc(x.detail)}</td></tr>`).join("")+"</table>":"<p class='small'>No emails yet.</p>"}
$("#elogr").onclick=loadElog;
async function loadSubs(show){const d=await call("subscribers",{qs:""});const act=d.items.filter(s=>!s.unsubscribed);$("#subcount").textContent=act.length;
 if(show)$("#sublist").innerHTML=d.items.length?"<table><tr><th>Email</th><th>Since</th><th>Status</th><th></th></tr>"+d.items.map(s=>`<tr><td>${esc(s.email)}</td><td>${esc(new Date(s.at).toLocaleDateString())}</td><td>${s.unsubscribed?"unsubscribed":"active"}</td><td><button type="button" class="danger" data-sd="${esc(s.email)}">Delete</button></td></tr>`).join("")+"</table>":"No subscribers yet.";
 $("#sublist").querySelectorAll("[data-sd]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete subscriber "+b.dataset.sd+"?"))return;await call("delete-subscriber",{email:b.dataset.sd});loadSubs(true)})}
$("#subshow").onclick=()=>loadSubs(true);
async function bc(test){const subject=$("#bsub").value,body=$("#bbody").value;if(!test&&!confirm("Send this email to all active subscribers?"))return;msg("Sending…");try{const d=await call("broadcast",{subject,body,test});msg((test?"Test":"Broadcast")+": "+d.status+(d.recipients!=null?" · "+d.recipients+" recipients":"")+" · "+d.sent+" ok, "+d.failed+" failed");loadElog()}catch(e){msg(e.message)}}
$("#btest").onclick=()=>bc(true);$("#bsend").onclick=()=>bc(false);
async function start(){try{await call("me",{qs:""})}catch(e){show(false);return}show(true);
 META=await fetch("/admin/meta.json",{cache:"no-store"}).then(r=>r.json()).catch(()=>META);
 $("#pcat").innerHTML=META.categories.map(c=>`<option value="${esc(c)}">`).join("");
 $("#pimg").innerHTML=META.images.map(k=>`<option value="/img/${k}-1200.webp">${k}</option>`).join("");
 META.images_default=META.images.map(k=>({src:k,alt:(META.alts||{})[k]||""}));
 loadOrders();try{await Promise.all([loadPosts(),loadProduct(),loadSettings()])}catch(e){msg(e.message)}}
start();
})();
