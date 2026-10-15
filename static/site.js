(function(){
var $=function(s,r){return(r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var b=$(".burger"),n=$("#nav");if(b)b.onclick=function(){var o=n.classList.toggle("open");b.setAttribute("aria-expanded",o)};
var d=$("#cod");
$$("[data-cod]").forEach(function(x){x.addEventListener("click",function(){if(n)n.classList.remove("open");if(d&&d.showModal){d.showModal();var f=$("input[name=name]",d);f&&f.focus()}else location.href="/shop/envoquee-hair-serum-kit/#order"})});
$$("[data-close]").forEach(function(x){x.onclick=function(){d.close()}});
if(d)d.addEventListener("click",function(e){if(e.target===d)d.close()});
var rs=function(v){return"Rs "+Number(v).toLocaleString("en-PK")};
var PH=/^(\+92|0092|92|0)?3\d{9}$/;
$$(".cod-form").forEach(function(f){
 f.page.value=location.pathname;
 var price=+f.dataset.price,dc=f.dataset.dc,free=f.dataset.free;
 function upd(){var q=+f.quantity.value||1,sub=q*price,t=$("[data-total]",f),nt=$("[data-dnote]",f);
  if(/^\d+$/.test(dc)){var del=(/^\d+$/.test(free)&&sub>=+free)?0:+dc;t.textContent=rs(sub+del);nt.textContent=del?("Includes delivery "+rs(del)):"Free delivery"}
  else{t.textContent=rs(sub);nt.textContent="Delivery charges, if any, are confirmed on your order call."}}
 f.quantity.onchange=upd;upd();
 f.addEventListener("submit",function(e){e.preventDefault();var er=$(".err",f);er.hidden=true;
  var ph=f.phone.value.replace(/[\s\-().]/g,"");
  var msg=f.name.value.trim().length<2?"Please enter your full name.":!PH.test(ph)?"Please enter a valid Pakistani mobile number, e.g. 0300 1234567.":f.city.value.trim().length<2?"Please enter your city.":f.address.value.trim().length<8?"Please enter your full delivery address.":"";
  if(msg){er.textContent=msg;er.hidden=false;return}
  var btn=$("button[type=submit]",f);btn.disabled=true;btn.textContent="Placing your order…";
  var data={};new FormData(f).forEach(function(v,k){data[k]=v});
  fetch("/api/order",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(r){
   if(r.ok&&r.j.redirect){try{gtag&&gtag("event","purchase",{currency:"PKR",value:data.quantity*price})}catch(_){}location.href=r.j.redirect}else throw new Error(r.j.error||"Something went wrong")})
  .catch(function(x){er.textContent=x.message||"Network error, please try again.";er.hidden=false;btn.disabled=false;btn.textContent="Confirm Order – Pay Cash on Delivery"})})});
// gallery
var mi=$(".main-img img");$$(".th").forEach(function(t){t.onclick=function(){mi.removeAttribute("srcset");mi.src=t.dataset.src;mi.alt=t.dataset.alt;$$(".th").forEach(function(x){x.classList.toggle("on",x===t)})}});
// thank-you
var oid=$("#oid");if(oid){var id=new URLSearchParams(location.search).get("id")||"";if(/^ENV-\d{6}-[0-9A-F]{6}$/.test(id)){oid.textContent=id;$("#trk").href="/track-order/?id="+id}}
// tracking
var tr=$("#track");if(tr){var qid=new URLSearchParams(location.search).get("id");if(qid)tr.id.value=qid;
 var L={new:"Received, awaiting confirmation call",confirmed:"Confirmed, preparing for dispatch",shipped:"Shipped, on its way",delivered:"Delivered",cancelled:"Cancelled"};
 tr.onsubmit=function(e){e.preventDefault();var o=$("#tres");o.textContent="Checking…";
  fetch("/api/track?id="+encodeURIComponent(tr.id.value.trim())+"&phone="+encodeURIComponent(tr.phone.value)).then(function(r){return r.json()}).then(function(j){
   if(j.error){o.textContent=j.error;return}o.innerHTML="";var p=document.createElement("p");p.innerHTML="<b>"+j.id+"</b>: "+(L[j.status]||j.status)+"<br>Ordered "+new Date(j.at).toLocaleDateString("en-PK")+" · Qty "+j.qty+" · Total "+rs(j.total);o.appendChild(p)})}}
})();
