#!/usr/bin/env python3
"""Envoquee static site generator. Output -> public/. No third-party deps."""
import json, os, re, shutil, hashlib, html, datetime as dt
from pathlib import Path
from xml.sax.saxutils import escape as xesc

ROOT = Path(__file__).parent
OUT = ROOT / "public"
S = json.loads((ROOT / "data/settings.json").read_text())
P = json.loads((ROOT / "data/product.json").read_text())
SITE = os.environ.get("SITE_URL", "https://envoquee.pages.dev").rstrip("/")
BRAND = S.get("site_name") or "Envoquee"
PKT = dt.timezone(dt.timedelta(hours=5))
NOW = dt.datetime.now(PKT)
BUILD_ID = os.environ.get("GITHUB_SHA", "local")
E = lambda s: html.escape(str(s if s is not None else ""), quote=True)
PRODUCT_URL = f"/shop/{P['slug']}/"
pct = round((1 - P["sale_price"] / P["price"]) * 100) if P["price"] else 0
rs = lambda n: "Rs " + f"{int(n):,}"
CITIES = ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta", "Hyderabad", "Sialkot", "Gujranwala", "Bahawalpur", "Sargodha", "Sukkur", "Abbottabad", "Mardan", "Gujrat", "Sahiwal", "Larkana", "Mirpur (AJK)", "Muzaffarabad", "Gilgit", "Rahim Yar Khan", "Okara", "Sheikhupura", "Jhelum", "Dera Ghazi Khan", "Nawabshah", "Chiniot", "Kasur"]

IMG = {
    "kit-beige": "Envoquee Hair Regrowth Serum Kit: black and gold gift box with serum dropper bottles, Anti Septic prep spray and derma roller",
    "kit-garden": "Envoquee Hair Serum Kit with gift box, two black dropper bottles, prep spray and derma roller, photographed outdoors",
    "serum-duo": "Two Envoquee Hair Regrowth Serum bottles in matte black glass with gold collars",
    "serum-bottle": "Envoquee Hair Regrowth Serum square black glass dropper bottle with gold collar",
    "serum-dropper": "Open Envoquee serum bottle with glass dropper",
    "derma-roller": "Envoquee derma roller with 540 stainless steel needles and non-slip handle, for scalp and beard",
}
GALLERY = P.get("images") or [{"src": k, "alt": v} for k, v in IMG.items()]

def pic(key, alt=None, cls="", lazy=True, sizes="(max-width:800px) 100vw, 50vw"):
    if key.startswith("/"):  # uploaded image path
        return f'<img src="{E(key)}" alt="{E(alt or BRAND)}" class="{cls}" {"loading=lazy" if lazy else "fetchpriority=high"} decoding="async" width="1200" height="1200">'
    alt = alt or IMG.get(key, BRAND)
    load = 'loading="lazy"' if lazy else 'fetchpriority="high"'
    return (f'<img src="/img/{key}-1200.webp" srcset="/img/{key}-600.webp 600w, /img/{key}-1200.webp 1200w" sizes="{sizes}" '
            f'alt="{E(alt)}" class="{cls}" width="1200" height="1200" {load} decoding="async">')
def img_url(key):
    return key if key.startswith("/") else f"/img/{key}-1200.webp"

def pending(field, label="Details coming soon"):
    v = (P.get("details") or {}).get(field, "")
    return E(v).replace("\n", "<br>") if v.strip() else f'<span class="tbc">{label}</span>'
def setting(v, label="Coming soon"):
    return E(v) if str(v or "").strip() else f'<span class="tbc">{label}</span>'

# ---------------- markdown (small, safe subset) ----------------
def inline(t):
    t = E(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<!\*)\*(?!\s)(.+?)\*", r"<em>\1</em>", t)
    t = re.sub(r"`(.+?)`", r"<code>\1</code>", t)
    def link(m):
        u = html.unescape(m.group(2))
        if not re.match(r"^(/|https?://|mailto:|tel:)", u): u = "#"
        ext = u.startswith("http") and not u.startswith(SITE)
        return f'<a href="{E(u)}"{" rel=noopener target=_blank" if ext else ""}>{m.group(1)}</a>'
    return re.sub(r"\[(.+?)\]\((.+?)\)", link, t)
def md(src):
    out, para, lst = [], [], None
    def fl():
        nonlocal para, lst
        if para: out.append("<p>" + inline(" ".join(para)) + "</p>"); para = []
        if lst: out.append(f"<{lst[0]}>" + "".join(f"<li>{inline(i)}</li>" for i in lst[1]) + f"</{lst[0]}>"); lst = None
    for line in src.splitlines():
        s = line.strip()
        m = re.match(r"^(#{2,4})\s+(.*)", s)
        if not s: fl(); continue
        if m: fl(); n = len(m.group(1)); out.append(f"<h{n} id=\"{slugify(m.group(2))}\">{inline(m.group(2))}</h{n}>"); continue
        mu, mo = re.match(r"^[-*]\s+(.*)", s), re.match(r"^\d+\.\s+(.*)", s)
        if mu or mo:
            kind = "ul" if mu else "ol"
            if para: fl()
            if lst and lst[0] != kind: fl()
            if not lst: lst = (kind, [])
            lst[1].append((mu or mo).group(1)); continue
        if lst: fl()
        para.append(s)
    fl(); return "\n".join(out)
def slugify(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:70]

# ---------------- posts ----------------
def parse_post(p):
    t = p.read_text(encoding="utf-8")
    m = re.match(r"^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$", t)
    meta = {}
    for line in m.group(1).splitlines():
        if ":" not in line: continue
        k, v = line.split(":", 1); v = v.strip()
        if v.startswith('"'):
            try: v = json.loads(v)
            except Exception: pass
        meta[k.strip()] = v
    meta["slug"] = p.stem; meta["body_md"] = m.group(2)
    try: meta["dt"] = dt.datetime.fromisoformat(str(meta.get("date")).replace("Z", "+00:00"))
    except Exception: meta["dt"] = NOW
    if meta["dt"].tzinfo is None: meta["dt"] = meta["dt"].replace(tzinfo=PKT)
    return meta
ALL_POSTS = [parse_post(p) for p in sorted((ROOT / "content/blog").glob("*.md"))]
POSTS = sorted([p for p in ALL_POSTS if p.get("status") == "published" and p["dt"] <= NOW], key=lambda p: p["dt"], reverse=True)
CATS = ["Derma Rolling", "Scalp Care", "Hair Fall", "Beard Care"]
for p in POSTS:
    if p.get("category") not in CATS: CATS.append(p.get("category") or "Hair Care")
cat_url = lambda c: f"/blog/category/{slugify(c)}/"
def words(p): return len(re.findall(r"\w+", p["body_md"]))
fmt_date = lambda d: d.astimezone(PKT).strftime("%d %b %Y")

# ---------------- layout ----------------
LOGO_MARK = ('<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">'
             '<path d="M32 58C32 40 30 26 20 10"/><path d="M32 58c0-18 2-32 12-48"/><path d="M32 58V6"/>'
             '<path d="M20 10c-6 10-6 22 4 30" /><path d="M44 10c6 10 6 22-4 30"/></g>'
             '<path d="M32 34c-8-4-12-12-10-20 8 3 12 11 10 20z" fill="currentColor" opacity=".9"/></svg>')
LOGO = f'<a class="logo" href="/" aria-label="{E(BRAND)} home">{LOGO_MARK}<span class="wm">ENVOQUEE</span></a>'
NAV = [("Shop", PRODUCT_URL), ("The Kit", "/the-kit/"), ("How to Use", "/how-to-use/"), ("Ingredients", "/ingredients/"), ("Q&amp;A", "/faq/"), ("Blog", "/blog/"), ("Contact", "/contact/")]

def price_html(big=False):
    return (f'<div class="price{" big" if big else ""}"><span class="now">{rs(P["sale_price"])}</span>'
            f'<s class="was" aria-label="Regular price">{rs(P["price"])}</s><span class="off">{pct}% OFF</span></div>')

def cod_button(label="Order Now – Cash on Delivery", cls="btn gold"):
    return f'<button type="button" class="{cls}" data-cod>{label}</button>'

def order_form(fid):
    qopts = "".join(f'<option value="{i}">{i}</option>' for i in range(1, int(P.get("max_qty", 5)) + 1))
    dc = S["shipping"].get("delivery_charge", "")
    return f'''<form class="cod-form" id="{fid}" action="/api/order" method="post" novalidate data-price="{P['sale_price']}" data-dc="{E(dc)}" data-free="{E(S['shipping'].get('free_delivery_over',''))}">
<div class="cod-prod">{pic("kit-beige", lazy=True, sizes="96px")}<div><b>{E(P['name'])}</b>{price_html()}</div></div>
<div class="f2"><label>Full name<input name="name" autocomplete="name" required minlength="2" maxlength="80"></label>
<label>Phone (Pakistan)<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="03XX XXXXXXX" pattern="^(\\+92|0092|92|0)?[\\s-]*3[0-9]{{2}}[\\s-]*[0-9]{{7}}$"></label>
<label>City<input name="city" list="pk-cities" autocomplete="address-level2" required maxlength="60"></label>
<label>Quantity<select name="quantity">{qopts}</select></label></div>
<label>Full address<textarea name="address" rows="2" autocomplete="street-address" required minlength="8" maxlength="400" placeholder="House / street, area, landmark"></textarea></label>
<label>Email (optional, for order updates)<input name="email" type="email" autocomplete="email" maxlength="200" placeholder="you@example.com"></label>
<label class="cbx"><input type="checkbox" name="remind" value="1"> Email me a one-time reminder if I don't finish this order (optional)</label>
<label>Notes (optional)<input name="notes" maxlength="500" placeholder="Best time to call, etc."></label>
<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><input type="hidden" name="page" value="">
<div class="total"><span>Total payable on delivery</span><b data-total>{rs(P['sale_price'])}</b><small data-dnote></small></div>
<p class="err" role="alert" hidden></p>
<button class="btn gold wide" type="submit">Confirm Order – Pay Cash on Delivery</button>
<p class="fine">No advance payment. Our team will call to confirm your order before dispatch.</p></form>'''

def ld(obj): return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False).replace("</", "<\\/") + "</script>"
ORG = {"@context": "https://schema.org", "@type": "Organization", "@id": SITE + "/#org", "name": BRAND, "url": SITE + "/", "logo": SITE + "/logo.png",
       "areaServed": {"@type": "Country", "name": "Pakistan"}}
if S.get("contact_email"): ORG["email"] = S["contact_email"]
if S.get("contact_phone"): ORG["telephone"] = S["contact_phone"]
_soc = [v for v in (S.get("social") or {}).values() if v]
if _soc: ORG["sameAs"] = _soc

def crumbs(items):
    if not items: return "", None
    full = [("Home", "/")] + items
    h = '<nav class="crumbs" aria-label="Breadcrumb"><ol>' + "".join(
        (f'<li><a href="{u}">{n}</a></li>' if i < len(full) - 1 else f'<li aria-current="page">{n}</li>') for i, (n, u) in enumerate(full)) + "</ol></nav>"
    sch = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": html.unescape(n), "item": SITE + u} for i, (n, u) in enumerate(full)]}
    return h, sch

PAGES = []  # (path, lastmod) for sitemap
def gsc_meta():
    out = []
    v = (S["seo"].get("google_site_verification") or "").strip()
    m = re.search(r'content="([^"]+)"', v); v = m.group(1) if m else v
    if v: out.append(f'<meta name="google-site-verification" content="{E(v)}">')
    b = (S["seo"].get("bing_site_verification") or "").strip(); m = re.search(r'content="([^"]+)"', b); b = m.group(1) if m else b
    if b: out.append(f'<meta name="msvalidate.01" content="{E(b)}">')
    return "".join(out)
def analytics():
    gtm, ga = (S["seo"].get("gtm_id") or "").strip(), (S["seo"].get("ga4_id") or "").strip()
    if re.fullmatch(r"GTM-[A-Z0-9]+", gtm):
        return f"<script>(function(w,d,s,l,i){{w[l]=w[l]||[];w[l].push({{'gtm.start':new Date().getTime(),event:'gtm.js'}});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f);}})(window,document,'script','dataLayer','{gtm}');</script>"
    if re.fullmatch(r"G-[A-Z0-9]+", ga):
        return f'<script async src="https://www.googletagmanager.com/gtag/js?id={ga}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag("js",new Date());gtag("config","{ga}");</script>'
    return ""

def page(path, title, desc, body, *, h1=None, crumb=None, og=None, schema=(), noindex=False, kind="website", cls="", lastmod=None):
    ch, cs = crumbs(crumb or [])
    url = SITE + path
    sc = [ORG] + ([cs] if cs else []) + list(schema)
    full_title = title if BRAND in title else f"{title} | {BRAND}"
    og_img = SITE + (og or "/img/kit-beige-og.jpg")
    nav = "".join(f'<a href="{u}"{" aria-current=page" if path.startswith(u) and u != "/" else ""}>{n}</a>' for n, u in NAV)
    ann = f'<div class="ann">{E(S.get("announcement",""))}</div>' if S.get("announcement") else ""
    soc = "".join(f'<a href="{E(v)}" rel="noopener" target="_blank">{k.title()}</a>' for k, v in (S.get("social") or {}).items() if v)
    doc = f'''<!doctype html><html lang="en-PK"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(full_title)}</title><meta name="description" content="{E(desc)}"><link rel="canonical" href="{url}">
{'<meta name="robots" content="noindex,follow">' if noindex else '<meta name="robots" content="index,follow,max-image-preview:large">'}
<meta property="og:type" content="{kind}"><meta property="og:site_name" content="{E(BRAND)}"><meta property="og:title" content="{E(full_title)}"><meta property="og:description" content="{E(desc)}"><meta property="og:url" content="{url}"><meta property="og:image" content="{og_img}"><meta property="og:locale" content="en_PK">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#0b0b0b">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon-32.png" sizes="32x32"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="/style.css?v={BUILD_ID[:8]}">{gsc_meta()}{analytics()}{"".join(ld(x) for x in sc)}</head>
<body class="{cls}"><a class="skip" href="#main">Skip to content</a>{ann}
<header class="hdr"><div class="hdr-in">{LOGO}<nav class="nav" id="nav" aria-label="Main">{nav}</nav>
<div class="hdr-cta">{cod_button("Order Now – COD", "btn gold sm")}<button class="burger" type="button" aria-label="Menu" aria-controls="nav" aria-expanded="false"><span></span><span></span><span></span></button></div></div></header>
<main id="main">{ch}{body}</main>
<footer class="ftr"><div class="ftr-top"><div class="fcol brand">{LOGO}<p>{E(S.get("tagline",""))}. Premium at-home scalp care, delivered with cash on delivery across Pakistan.</p>{cod_button("Order Now – Cash on Delivery","btn gold")}</div>
<div class="fcol"><h2>Shop</h2><a href="{PRODUCT_URL}">Hair Serum Kit</a><a href="/the-kit/">What's in the Kit</a><a href="/ingredients/">Ingredients</a><a href="/how-to-use/">How to Use</a><a href="/derma-roller-safety/">Derma Roller Safety &amp; Care</a></div>
<div class="fcol"><h2>Learn</h2><a href="/blog/">Blog</a>{"".join(f'<a href="{cat_url(c)}">{E(c)}</a>' for c in CATS)}<a href="/faq/">Questions &amp; Answers</a></div>
<div class="fcol"><h2>Help</h2><a href="/track-order/">Track Your Order</a><a href="/shipping/">Shipping &amp; Delivery</a><a href="/returns/">Returns &amp; Refunds</a><a href="/contact/">Contact Us</a><a href="/about/">About {E(BRAND)}</a></div></div>
<div class="nl"><div><h2>Scalp care tips, made for Pakistan</h2><p>New guides from our blog. No spam, unsubscribe anytime.</p></div><form action="/api/form" method="post" class="nlf"><input type="hidden" name="form-name" value="newsletter"><input type="hidden" name="page" value="{path}"><label class="hp" aria-hidden="true">Company<input name="company" tabindex="-1" autocomplete="off"></label><label class="sr">Email<input name="email" type="email" required placeholder="Your email address" autocomplete="email"></label><button class="btn gold">Subscribe</button></form></div>
<div class="ftr-bot"><span>© {NOW.year} {E(BRAND)}. All rights reserved.</span><span class="soc">{soc}</span><span><a href="/privacy-policy/">Privacy Policy</a> · <a href="/terms/">Terms</a> · <a href="/blog/">Blog</a></span></div>
<p class="disc">Cosmetic product designed to support healthier, fuller-looking hair. Not intended to diagnose, treat, cure or prevent any disease. Results vary. If you have a scalp condition, consult a dermatologist.</p></footer>
<div class="mbar"><div>{price_html()}</div>{cod_button("Order Now – COD","btn gold")}</div>
<dialog id="cod" aria-labelledby="cod-t"><div class="dlg"><button class="x" type="button" data-close aria-label="Close">×</button><h2 id="cod-t">Cash on Delivery Order</h2>{order_form("cod-modal")}</div></dialog>
<datalist id="pk-cities">{"".join(f"<option value='{c}'>" for c in CITIES)}</datalist>
<script src="/site.js?v={BUILD_ID[:8]}" defer></script></body></html>'''
    dest = OUT / path.lstrip("/") / "index.html" if path.endswith("/") else OUT / path.lstrip("/")
    dest.parent.mkdir(parents=True, exist_ok=True); dest.write_text(doc, encoding="utf-8")
    if not noindex: PAGES.append((path, lastmod or NOW))
    return doc

def section(cls, inner, id_=""):
    return f'<section class="sec {cls}"{f" id={id_}" if id_ else ""}><div class="in">{inner}</div></section>'

def post_card(p, lazy=True):
    return (f'<article class="card"><a href="/blog/{p["slug"]}/" class="ci">{pic(p["image"].replace("/img/","").replace("-1200.webp",""), alt=p["title"], sizes="(max-width:800px) 100vw, 33vw") if p.get("image","").startswith("/img/") and p["image"].endswith("-1200.webp") else pic(p.get("image") or "kit-beige", alt=p["title"])}</a>'
            f'<div class="cb"><a class="cat" href="{cat_url(p["category"])}">{E(p["category"])}</a><h3><a href="/blog/{p["slug"]}/">{E(p["title"])}</a></h3><p>{E(p.get("description",""))}</p>'
            f'<span class="meta">{fmt_date(p["dt"])} · {max(1, round(words(p)/200))} min read</span></div></article>')

KIT_ITEMS = [
    ("serum-bottle", "Hair Regrowth Serum", "Square matte-black glass bottle with a gold collar and glass dropper for precise application. The kit photos show two dropper bottles.", "serum_size"),
    ("kit-beige", "Anti Septic for Prep", "A spray bottle labelled “Anti Septic for Prep”, used to prep the skin and the roller before rolling.", "spray_size"),
    ("derma-roller", "Derma Roller with Case", "540 stainless steel needles and a non-slip handle. Made for the scalp and the beard. Comes with a protective case.", "needle_length"),
]
SIZE_LABEL = {"serum_size": "Bottle size", "spray_size": "Spray size", "needle_length": "Needle length"}
def kit_cards():
    return '<div class="kit">' + "".join(
        f'<article class="kcard">{pic(k, sizes="(max-width:800px) 100vw, 33vw")}<div><span class="num">0{i+1}</span><h3>{t}</h3><p>{d}</p><p class="spec"><b>{SIZE_LABEL[f]}:</b> {pending(f, "To be confirmed")}</p></div></article>'
        for i, (k, t, d, f) in enumerate(KIT_ITEMS)) + "</div>"
STEPS = [("Prep", "Start with a clean, dry scalp. Spray the Anti Septic prep on the area and on the roller."),
         ("Roll", "Part your hair and roll gently in short strokes: up and down, side to side, then diagonally. Light pressure only."),
         ("Apply serum", "Use the dropper to apply serum to the rolled area and massage in with your fingertips.")]
def steps_html():
    return '<ol class="steps">' + "".join(f'<li><span>{i+1}</span><h3>{t}</h3><p>{d}</p></li>' for i, (t, d) in enumerate(STEPS)) + "</ol>"

FAQ = [
    ("What is included in the Envoquee Hair Serum Kit?", "The black-and-gold gift box contains Envoquee Hair Regrowth Serum in black glass dropper bottles, an “Anti Septic for Prep” spray and a derma roller with 540 stainless steel needles and a protective case."),
    ("What is the price of the Envoquee kit in Pakistan?", f"The kit's regular price is {rs(P['price'])}. It is currently on sale for {rs(P['sale_price'])}, which is {pct}% off."),
    ("Can I pay cash on delivery?", "Yes. Every order is cash on delivery. Fill in the order form on any page and our team will call you to confirm before dispatch. No advance payment is needed."),
    ("Do you deliver all over Pakistan?", "We take cash-on-delivery orders from cities across Pakistan, including Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad, Multan and Peshawar. Delivery times and charges are shown on our Shipping & Delivery page."),
    ("How many needles does the Envoquee derma roller have?", "The roller has 540 stainless steel needles and a non-slip handle."),
    ("Can I use the derma roller on my beard?", "Yes. The Envoquee derma roller is made for both the scalp and the beard. Use lighter pressure on the face and never roll on freshly shaved, irritated or broken skin."),
    ("In what order should I use the kit?", "Prep first with the Anti Septic spray, then roll gently with the derma roller, then apply the serum. Always follow the directions printed in your kit for how often to use it."),
    ("What is the Anti Septic prep spray for?", "It is used to prep the skin and the roller before rolling, because hygiene is the most important part of any derma rolling routine."),
    ("What are the serum's ingredients?", "The full ingredient list will be published on our Ingredients page. Until then, please check the label on your bottle and patch test before first use."),
    ("Does scalp derma rolling hurt?", "Most people describe a light prickling feeling when rolling gently. If it is painful, you are pressing too hard. Stop if you see bleeding, irritation or broken skin."),
    ("Can I share my derma roller with family?", "No. A derma roller should only ever be used by one person, to avoid passing on bacteria or infections."),
    ("Who should avoid using a derma roller?", "Don't roll over cuts, acne, sunburn, eczema, psoriasis or any scalp infection. If you are pregnant, breastfeeding, diabetic, take blood thinners or have a skin condition, speak to a doctor first."),
    ("How do I track my Envoquee order?", "Use the Track Your Order page with your order number (shown after ordering, starting with ENV-) and the phone number you ordered with."),
]
def faq_html(items):
    return '<div class="faq">' + "".join(f'<details><summary>{E(q)}</summary><p>{E(a)}</p></details>' for q, a in items) + "</div>"
FAQ_LD = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQ]}

def reviews_html():
    rv = [r for r in P.get("reviews", []) if r.get("text") and r.get("name")]
    if not rv: return ""
    cards = "".join(f'<figure class="rev"><div class="stars" aria-label="{int(r.get("rating",5))} out of 5">{"★"*int(r.get("rating",5))}{"☆"*(5-int(r.get("rating",5)))}</div><blockquote>{E(r["text"])}</blockquote><figcaption>{E(r["name"])}{", " + E(r["city"]) if r.get("city") else ""}{" · " + E(r["date"]) if r.get("date") else ""}</figcaption></figure>' for r in rv)
    return section("reviews", f'<h2 class="h2">From our customers</h2><div class="revs">{cards}</div>')

PRODUCT_LD = {"@context": "https://schema.org", "@type": "Product", "name": P["name"], "brand": {"@type": "Brand", "name": BRAND},
              "image": [SITE + img_url(g["src"]) for g in GALLERY], "description": P["summary"], "url": SITE + PRODUCT_URL, "sku": "ENV-KIT-01",
              "offers": {"@type": "Offer", "price": str(P["sale_price"]), "priceCurrency": "PKR", "availability": "https://schema.org/" + ("InStock" if P.get("in_stock") else "OutOfStock"),
                         "url": SITE + PRODUCT_URL, "itemCondition": "https://schema.org/NewCondition", "areaServed": "PK"}}

def build_pages():
    # ---------- HOME
    latest = POSTS[:3]
    blog_secs = section("blog-sec dark", f'<div class="sh"><h2 class="h2">The Envoquee Journal</h2><a href="/blog/" class="more">All articles →</a></div><div class="cards">{"".join(post_card(p) for p in latest)}</div>')
    for c in ["Hair Fall", "Scalp Care", "Derma Rolling"]:
        ps = [p for p in POSTS if p["category"] == c and p not in latest][:3] or [p for p in POSTS if p["category"] == c][:3]
        if ps: blog_secs += section("blog-sec", f'<div class="sh"><h2 class="h2">{E(c)}</h2><a href="{cat_url(c)}" class="more">More on {E(c.lower())} →</a></div><div class="cards">{"".join(post_card(p) for p in ps)}</div>')
    home = f'''<section class="hero"><div class="hero-in"><div class="hero-copy"><p class="eyebrow">The Envoquee scalp ritual</p>
<h1>Hair Regrowth Serum Kit, designed to support healthier, fuller-looking hair</h1>
<p class="lead">Serum, Anti Septic prep spray and a 540-needle derma roller in one black-and-gold gift box. Three steps, done at home. Delivered across Pakistan with cash on delivery.</p>
{price_html(True)}<div class="cta-row">{cod_button()}<a class="btn line" href="{PRODUCT_URL}">View the Kit</a></div>
<ul class="ticks"><li>Cash on Delivery</li><li>Nationwide delivery</li><li>Confirmation call before dispatch</li></ul></div>
<div class="hero-img">{pic("kit-garden", lazy=False, sizes="(max-width:900px) 100vw, 50vw")}</div></div></section>
<section class="strip"><div class="in"><span>Prep</span><i></i><span>Roll</span><i></i><span>Serum</span><i></i><span>Pay on Delivery</span></div></section>
{section("", f'<p class="eyebrow">Inside the box</p><h2 class="h2">Everything for the routine, in one kit</h2>{kit_cards()}<p class="c"><a class="btn line" href="/the-kit/">Explore the Kit</a></p>')}
{section("dark", f'<p class="eyebrow">How it works</p><h2 class="h2">Three simple steps</h2>{steps_html()}<p class="c"><a href="/how-to-use/" class="btn line">Full how-to guide</a> <a href="/derma-roller-safety/" class="btn line">Safety &amp; care</a></p>')}
{section("split-sec", f'<div class="split"><div>{pic("serum-duo")}</div><div><p class="eyebrow">Made for Pakistan</p><h2 class="h2">Heat, humidity, hard water: a routine for real life</h2><p>From Karachi humidity to Lahore summers and hard borewell water, our scalps go through a lot. Envoquee keeps the routine simple: a clean prep, gentle rolling and a serum you apply where you need it.</p><p>Order with cash on delivery from anywhere in Pakistan. We call to confirm, then dispatch.</p>{cod_button()}</div></div>')}
{section("order-sec", f'<div class="split"><div><p class="eyebrow">Limited launch price</p><h2 class="h2">Order your kit, pay when it arrives</h2>{price_html(True)}<ul class="ticks"><li>No advance payment</li><li>Delivery across Pakistan</li><li>Confirmation call before dispatch</li></ul></div><div class="panel">{order_form("cod-home")}</div></div>', "order")}
{reviews_html()}
{blog_secs}
{section("", f'<p class="eyebrow">Questions &amp; answers</p><h2 class="h2">What people ask before ordering</h2>{faq_html(FAQ[:7])}<p class="c"><a href="/faq/" class="btn line">See all questions</a></p>')}'''
    page("/", f"{BRAND} Hair Regrowth Serum Kit Pakistan | Cash on Delivery", f"Envoquee Hair Serum Kit with serum, Anti Septic prep spray and 540-needle derma roller. Now {rs(P['sale_price'])} (was {rs(P['price'])}). Cash on delivery across Pakistan.",
         home, schema=[PRODUCT_LD, {"@context": "https://schema.org", "@type": "WebSite", "name": BRAND, "url": SITE + "/", "inLanguage": "en-PK"}], cls="home")

    # ---------- SHOP list + PRODUCT
    page("/shop/", "Shop Envoquee Hair Care", "Shop the Envoquee Hair Regrowth Serum Kit in Pakistan with cash on delivery.",
         section("", f'<h1 class="h1">Shop</h1><div class="shop"><a href="{PRODUCT_URL}" class="pcard">{pic("kit-beige", sizes="(max-width:800px) 100vw, 40vw")}<div><h2>{E(P["name"])}</h2>{price_html()}<p>{E(P["summary"])}</p><span class="btn line">View product</span></div></a></div>'), crumb=[("Shop", "/shop/")])
    thumbs = "".join(f'<button type="button" class="th{" on" if i==0 else ""}" data-src="{img_url(g["src"])}" data-alt="{E(g["alt"])}" aria-label="Show image {i+1}">{pic(g["src"], g["alt"], sizes="96px")}</button>' for i, g in enumerate(GALLERY))
    stock = '<p class="stock in">In stock · ready to dispatch</p>' if P.get("in_stock") else '<p class="stock out">Currently out of stock</p>'
    specs = [("Contents", "Hair Regrowth Serum (black glass dropper bottles), Anti Septic for Prep spray, derma roller with case"), ("Derma roller", "540 stainless steel needles, non-slip handle, for scalp and beard")]
    spec_rows = "".join(f"<tr><th>{a}</th><td>{E(b)}</td></tr>" for a, b in specs) + "".join(f"<tr><th>{l}</th><td>{pending(f,'To be confirmed')}</td></tr>" for l, f in [("Serum size", "serum_size"), ("Spray size", "spray_size"), ("Needle length", "needle_length"), ("Ingredients", "ingredients"), ("How often to use", "frequency")])
    pq = [FAQ[0], FAQ[1], FAQ[2], FAQ[4], FAQ[5], FAQ[6], FAQ[10], FAQ[11]]
    prod = f'''<section class="pdp"><div class="in pdp-in"><div class="gallery"><div class="main-img">{pic(GALLERY[0]["src"], GALLERY[0]["alt"], lazy=False, sizes="(max-width:900px) 100vw, 55vw")}</div><div class="thumbs">{thumbs}</div></div>
<div class="buy"><p class="eyebrow">{E(BRAND)}</p><h1 class="h1">{E(P["name"])}</h1>{price_html(True)}<p class="save">You save {rs(P["price"]-P["sale_price"])}</p>{stock}
<p>{E(P["summary"])}</p><ul class="ticks"><li>Serum + Anti Septic prep spray + 540-needle derma roller</li><li>For scalp and beard</li><li>Cash on Delivery across Pakistan</li></ul>
{cod_button("Order Now – Cash on Delivery", "btn gold wide")}<p class="fine">Pay in cash when your parcel arrives. We call to confirm first.</p></div></div></section>
{section("dark", f'<h2 class="h2">The three-step ritual</h2>{steps_html()}')}
{section("", f'<div class="split"><div><h2 class="h2">What\'s inside</h2>{kit_cards()}</div></div>')}
{section("", f'<h2 class="h2">Product details</h2><table class="spec">{spec_rows}</table><p class="small">Details marked “to be confirmed” will be added soon. Always read the label and directions in your kit.</p>')}
{section("order-sec", f'<div class="split"><div><h2 class="h2">Order with Cash on Delivery</h2>{price_html(True)}<ul class="ticks"><li>No advance payment</li><li>Confirmation call before dispatch</li></ul><p><a href="/shipping/">Shipping &amp; delivery</a> · <a href="/returns/">Returns</a></p></div><div class="panel">{order_form("cod-pdp")}</div></div>', "order")}
{reviews_html()}
{section("", f'<h2 class="h2">Questions about this kit</h2>{faq_html(pq)}')}
{section("dark blog-sec", f'<div class="sh"><h2 class="h2">Read before you roll</h2><a href="/blog/" class="more">Blog →</a></div><div class="cards">{"".join(post_card(p) for p in POSTS[:3])}</div>')}'''
    pfaq = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in pq]}
    page(PRODUCT_URL, f"{P['name']} – {rs(P['sale_price'])} COD Pakistan", f"Buy the {P['name']} in Pakistan: serum, Anti Septic prep spray and 540-needle derma roller. {rs(P['sale_price'])} (was {rs(P['price'])}, {pct}% off). Cash on delivery.",
         prod, crumb=[("Shop", "/shop/"), (E(P["short_name"]), PRODUCT_URL)], schema=[PRODUCT_LD, pfaq], kind="product")

    # ---------- THE KIT
    page("/the-kit/", "What's Inside the Envoquee Hair Serum Kit", "Inside the Envoquee kit: Hair Regrowth Serum, Anti Septic for Prep spray and a 540-needle stainless steel derma roller with case.",
         section("", f'<h1 class="h1">What\'s inside the kit</h1><p class="lead">A matte-black gift box with gold geometric line art, holding everything for the three-step routine.</p>{kit_cards()}') +
         section("split-sec", f'<div class="split"><div>{pic("kit-garden")}</div><div><h2 class="h2">Designed as a gift box</h2><p>The kit comes in a black box with gold foil detailing and the Envoquee leaf-and-hair emblem. Each item has its own place, so the roller stays protected in its case between uses.</p>{cod_button()}<p><a href="/how-to-use/">How to use the kit →</a></p></div></div>') +
         section("", f'<h2 class="h2">Derma roller features</h2><div class="split"><div>{pic("derma-roller")}</div><div><ul class="ticks"><li>540 stainless steel needles</li><li>Non-slip handle</li><li>For scalp and beard</li><li>Needle length: {pending("needle_length","to be confirmed")}</li></ul><p><a href="/derma-roller-safety/">Safety &amp; care guide →</a></p></div></div>'),
         crumb=[("The Kit", "/the-kit/")])
    # ---------- HOW TO USE
    page("/how-to-use/", "How to Use the Envoquee Hair Serum Kit (3 Steps)", "Step-by-step: prep with the Anti Septic spray, roll gently with the 540-needle derma roller, then apply Envoquee serum.",
         section("", f'<h1 class="h1">How to use the kit</h1><p class="lead">Three steps: prep, roll, serum. Always follow the directions printed in your kit.</p>{steps_html()}') +
         section("", f'<h2 class="h2">Directions &amp; frequency</h2><table class="spec"><tr><th>Directions from Envoquee</th><td>{pending("directions","Full directions coming soon. Follow the leaflet in your kit.")}</td></tr><tr><th>How often</th><td>{pending("frequency","To be confirmed. Follow the leaflet in your kit.")}</td></tr><tr><th>What to expect</th><td>{pending("results_timeline","Timeline coming soon. Hair grows slowly, so give any routine time.")}</td></tr></table>'
                 '<h2 class="h2">Good habits</h2><ul class="list"><li>Wash and fully dry your hair first, ideally in the evening.</li><li>Use light pressure. Never roll hard enough to bleed.</li><li>Don\'t roll on cuts, pimples, sunburn or irritated skin.</li><li>Clean the roller before and after every use and keep it in its case.</li><li>Never share your roller.</li><li>Patch test the serum on a small area first.</li></ul>'
                 f'<p>{cod_button()} <a class="btn line" href="/derma-roller-safety/">Safety &amp; care</a></p>'),
         crumb=[("How to Use", "/how-to-use/")], schema=[{"@context": "https://schema.org", "@type": "HowTo", "name": "How to use the Envoquee Hair Serum Kit", "step": [{"@type": "HowToStep", "name": t, "text": d} for t, d in STEPS]}])
    # ---------- SAFETY
    page("/derma-roller-safety/", "Derma Roller Safety & Care Guide", "How to clean, store and safely use a scalp and beard derma roller: hygiene, pressure, who should avoid it and when to replace it.",
         section("", '<h1 class="h1">Derma roller safety &amp; care</h1><p class="lead">Hygiene is the most important part of derma rolling. These general guidelines apply to any roller.</p>'
                 '<div class="cols"><div><h2>Before rolling</h2><ul class="list"><li>Wash your hands, scalp or beard area.</li><li>Spray the Anti Septic prep on the skin and the roller.</li><li>Check the needles. Don\'t use a roller with bent or blunt needles.</li></ul></div>'
                 '<div><h2>While rolling</h2><ul class="list"><li>Light pressure, short strokes, a few passes in each direction.</li><li>Lift the roller to change direction instead of dragging it.</li><li>Stop if you see bleeding or feel sharp pain.</li></ul></div>'
                 '<div><h2>After rolling</h2><ul class="list"><li>Apply the serum, then avoid sun, sweat, swimming and heavy products for the rest of the day.</li><li>Rinse and disinfect the roller, let it air dry and store it in its case.</li><li>Never share your roller.</li></ul></div></div>'
                 '<h2 class="h2">Who should not use a derma roller</h2><ul class="list"><li>Anyone with cuts, acne, cold sores, sunburn, eczema, psoriasis or a scalp infection in the area.</li><li>People on blood thinners, with diabetes or bleeding disorders, or who are pregnant or breastfeeding, unless a doctor approves.</li><li>Anyone whose skin is irritated after shaving or waxing.</li></ul>'
                 f'<h2 class="h2">Envoquee roller specifications</h2><table class="spec"><tr><th>Needles</th><td>540, stainless steel</td></tr><tr><th>Handle</th><td>Non-slip</td></tr><tr><th>Use on</th><td>Scalp and beard</td></tr><tr><th>Needle length</th><td>{pending("needle_length","To be confirmed")}</td></tr><tr><th>Warnings</th><td>{pending("warnings","See the label in your kit")}</td></tr></table>'
                 '<p class="small">This is general information, not medical advice. Speak to a dermatologist if you have a skin or scalp condition.</p>'),
         crumb=[("Derma Roller Safety & Care", "/derma-roller-safety/")])
    # ---------- INGREDIENTS
    ing = P["details"].get("ingredients", "").strip()
    page("/ingredients/", "Envoquee Hair Serum Ingredients", "Envoquee Hair Regrowth Serum ingredient list and how to patch test before first use.",
         section("", f'<h1 class="h1">Ingredients</h1><div class="split"><div>{pic("serum-dropper")}</div><div>' +
                 (f'<h2 class="h2">Hair Regrowth Serum</h2><p class="inci">{E(ing)}</p>' if ing else '<p class="lead">We will publish the full ingredient list here soon.</p><p>Until then, please read the label on your bottle. If you have known allergies, check every ingredient before use.</p>') +
                 '<h2>Patch test first</h2><p>Apply a small amount to the inside of your forearm or behind the ear and wait 24 hours. If you see redness, itching or swelling, don\'t use it.</p>' + cod_button() + '</div></div>'),
         crumb=[("Ingredients", "/ingredients/")])
    # ---------- FAQ
    page("/faq/", "Envoquee Questions & Answers", "Answers about the Envoquee Hair Serum Kit: price in Pakistan, cash on delivery, what's included, derma roller use on scalp and beard, and safety.",
         section("", f'<h1 class="h1">Questions &amp; answers</h1><p class="lead">Real questions people ask about the kit, derma rolling and ordering in Pakistan. For more, read the <a href="/blog/">blog</a>.</p>{faq_html(FAQ)}') +
         section("dark blog-sec", f'<div class="sh"><h2 class="h2">In-depth answers on the blog</h2></div><div class="cards">{"".join(post_card(p) for p in POSTS[:3])}</div>'),
         crumb=[("Q&amp;A", "/faq/")], schema=[FAQ_LD])
    # ---------- ABOUT
    page("/about/", f"About {BRAND}", "Envoquee is a Pakistani scalp and hair care brand behind the black-and-gold Hair Regrowth Serum Kit.",
         section("", f'<div class="split"><div><h1 class="h1">About {E(BRAND)}</h1><p class="lead">Envoquee makes an at-home scalp ritual that feels premium and stays simple.</p><p>Our Hair Regrowth Serum Kit brings the three things the routine needs into one box: a serum, an Anti Septic prep spray and a 540-needle derma roller with its own case. It is designed to support healthier, fuller-looking hair as part of a consistent routine.</p><p>We sell directly to customers across Pakistan with cash on delivery, so you only pay when your kit arrives.</p><p><a href="/contact/">Contact us</a> · <a href="/blog/">Read our blog</a></p></div><div>{pic("serum-bottle")}</div></div>'),
         crumb=[("About", "/about/")])
    # ---------- CONTACT
    c = S
    contact = f'''<h1 class="h1">Contact us</h1><div class="split"><div><form class="cform" action="/api/form" method="post"><input type="hidden" name="form-name" value="contact">
<label class="hp" aria-hidden="true">Leave empty<input name="bot-field" tabindex="-1" autocomplete="off"></label>
<label>Your name<input name="name" required maxlength="100" autocomplete="name"></label><label>Phone<input name="phone" type="tel" placeholder="03XX XXXXXXX" autocomplete="tel"></label>
<label>Email<input name="email" type="email" autocomplete="email"></label><label>Message<textarea name="message" rows="5" required minlength="5"></textarea></label><button class="btn gold">Send message</button><p class="fine">Give us a phone number or email so we can reply.</p></form></div>
<div class="panel"><h2>Get in touch</h2><table class="spec"><tr><th>Phone</th><td>{setting(c.get("contact_phone"))}</td></tr><tr><th>WhatsApp</th><td>{setting(c.get("whatsapp"))}</td></tr><tr><th>Email</th><td>{setting(c.get("contact_email"))}</td></tr><tr><th>Address</th><td>{setting(c.get("address"))}</td></tr><tr><th>Hours</th><td>{setting(c.get("hours"))}</td></tr></table>
<p>Want to order? {cod_button("Order with Cash on Delivery", "btn line")}</p><p><a href="/track-order/">Track an existing order →</a></p></div></div>'''
    page("/contact/", f"Contact {BRAND}", "Contact Envoquee about your order, delivery or the Hair Serum Kit.", section("", contact), crumb=[("Contact", "/contact/")],
         schema=[{"@context": "https://schema.org", "@type": "ContactPage", "name": f"Contact {BRAND}", "url": SITE + "/contact/"}])
    page("/contact/thanks/", "Message sent", "Thanks for contacting Envoquee.", section("", '<h1 class="h1">Thank you</h1><p class="lead">Your message has been received. We\'ll get back to you soon.</p><p><a class="btn line" href="/">Back to home</a></p>'), noindex=True)
    # ---------- SHIPPING
    sh = S["shipping"]
    page("/shipping/", "Shipping & Delivery in Pakistan", "Envoquee delivers across Pakistan with cash on delivery. Delivery times, charges and how order confirmation works.",
         section("", f'<h1 class="h1">Shipping &amp; delivery</h1><p class="lead">We deliver to cities across Pakistan, and every order is Cash on Delivery.</p>'
                 f'<table class="spec"><tr><th>Payment</th><td>Cash on Delivery (pay the courier when your parcel arrives)</td></tr><tr><th>Coverage</th><td>Cities across Pakistan, including Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad, Multan, Peshawar, Quetta, Hyderabad and Sialkot</td></tr>'
                 f'<tr><th>Delivery time</th><td>{setting(sh.get("delivery_time"))}</td></tr><tr><th>Delivery charges</th><td>{(rs(sh["delivery_charge"]) if str(sh.get("delivery_charge","")).strip().isdigit() else setting(sh.get("delivery_charge"),"Confirmed on your order call"))}</td></tr>'
                 f'<tr><th>Free delivery</th><td>{(("On orders of " + rs(sh["free_delivery_over"]) + " or more") if str(sh.get("free_delivery_over","")).strip().isdigit() else setting("", "Coming soon"))}</td></tr><tr><th>Notes</th><td>{setting(sh.get("notes"), "—")}</td></tr></table>'
                 '<h2 class="h2">How it works</h2><ol class="list"><li>Place your order with the form on any page.</li><li>Our team calls you to confirm your order and address.</li><li>Your kit is dispatched by courier.</li><li>Pay in cash when it arrives.</li></ol>' + f'<p>{cod_button()} <a class="btn line" href="/track-order/">Track your order</a></p>'),
         crumb=[("Shipping & Delivery", "/shipping/")])
    rp = S.get("returns_policy", "").strip()
    page("/returns/", "Returns & Refunds", "Envoquee returns and refunds policy for orders in Pakistan.",
         section("", '<h1 class="h1">Returns &amp; refunds</h1>' + ("".join(f"<p>{E(x)}</p>" for x in rp.split("\n") if x.strip()) if rp else '<p class="lead"><span class="tbc">Our full returns policy will be published here soon.</span></p>') +
                 '<h2 class="h2">Damaged or wrong item?</h2><p>Please check your parcel on delivery. If something is damaged or wrong, <a href="/contact/">contact us</a> with your order number and a photo as soon as possible.</p><p>For hygiene reasons, opened or used derma rollers and serums may not be returnable unless faulty.</p>'),
         crumb=[("Returns & Refunds", "/returns/")])
    page("/privacy-policy/", "Privacy Policy", "How Envoquee collects, uses and protects personal information from orders and the contact form.",
         section("legal", f'''<h1 class="h1">Privacy policy</h1><p>Last updated: {NOW.strftime("%d %B %Y")}</p>
<h2>What we collect</h2><p>When you place a cash-on-delivery order we collect your name, phone number, city, delivery address, quantity, optional email and any notes you add. If you subscribe to our newsletter we store your email address until you unsubscribe (every newsletter has an unsubscribe link). Order reminder emails are only sent if you tick the reminder box. When you use the contact form we collect your name, phone and/or email and your message. We also log your approximate country and basic technical data needed to prevent spam and abuse.</p>
<h2>How we use it</h2><p>Only to confirm, deliver and support your order, send order status emails, reply to your messages, and protect the site from abuse. We share delivery details with our courier partner only to deliver your parcel. We do not sell your data.</p>
<h2>Analytics &amp; cookies</h2><p>We may use Google Analytics to understand how visitors use the site, which sets cookies. The admin area uses a strictly necessary security cookie. You can block cookies in your browser settings.</p>
<h2>Storage &amp; retention</h2><p>Orders and messages are stored securely on Cloudflare infrastructure and kept only as long as needed for orders, support and legal record keeping.</p>
<h2>Your choices</h2><p>You can ask us to view, correct or delete your personal data through our <a href="/contact/">contact page</a>.</p>'''),
         crumb=[("Privacy Policy", "/privacy-policy/")])
    page("/terms/", "Terms & Conditions", "Terms for using the Envoquee website and placing cash-on-delivery orders.",
         section("legal", f'''<h1 class="h1">Terms &amp; conditions</h1><p>Last updated: {NOW.strftime("%d %B %Y")}</p>
<h2>Orders</h2><p>Submitting the order form is a request to buy. An order is confirmed only after our team confirms it with you by phone. We may decline orders we cannot verify or deliver.</p>
<h2>Prices &amp; payment</h2><p>Prices are in Pakistani Rupees (PKR). Payment is cash on delivery. Any delivery charges are shown on the <a href="/shipping/">Shipping page</a> or confirmed on your order call.</p>
<h2>Product use</h2><p>Envoquee products are cosmetic. They are designed to support healthier, fuller-looking hair and are not intended to diagnose, treat, cure or prevent any disease. Results vary. Follow the directions and safety guidance, patch test before use, and consult a doctor if you have a medical condition.</p>
<h2>Returns</h2><p>See our <a href="/returns/">Returns &amp; Refunds</a> page.</p>
<h2>Content</h2><p>Blog articles are general information, not medical advice.</p>
<h2>Contact</h2><p>Questions about these terms? <a href="/contact/">Contact us</a>.</p>'''),
         crumb=[("Terms", "/terms/")])
    page("/thanks/", "You're subscribed", "Thanks for subscribing to Envoquee.", section("", '<div class="ty"><h1 class="h1">You\'re subscribed</h1><p class="lead">Thank you for joining. Our scalp care guides will reach your inbox.</p><p><a class="btn line" href="/blog/">Read the blog</a></p></div>'), noindex=True)
    page("/unsubscribe/", "Unsubscribe", "Unsubscribe from Envoquee emails.", section("", '<div class="ty"><h1 class="h1">Unsubscribe</h1><p class="lead" id="unsub-msg">Click below to stop receiving Envoquee newsletters.</p><p><button class="btn gold" id="unsub-btn" type="button">Unsubscribe</button></p></div>'), noindex=True)
    page("/order/thank-you/", "Thank you for your order", "Your Envoquee order has been received.",
         section("", '<div class="ty"><h1 class="h1">Thank you, your order is placed</h1><p class="lead">Your order number is</p><p class="oid" id="oid">—</p><p>Please keep this number. Our team will call you on the number you provided to confirm your order before dispatch. Pay in cash when your parcel arrives.</p><p><a class="btn gold" href="/track-order/" id="trk">Track your order</a> <a class="btn line" href="/blog/">Read our scalp care tips</a></p></div>'), noindex=True)
    page("/track-order/", "Track Your Order", "Check the status of your Envoquee cash-on-delivery order with your order number and phone.",
         section("", '<h1 class="h1">Track your order</h1><form id="track" class="cform narrow"><label>Order number<input name="id" required placeholder="ENV-261015-1A2B3C" autocapitalize="characters"></label><label>Phone used on the order<input name="phone" type="tel" required placeholder="03XX XXXXXXX"></label><button class="btn gold">Check status</button><div id="tres" role="status"></div></form>'),
         crumb=[("Track Your Order", "/track-order/")], noindex=True)

def build_blog():
    for p in POSTS:
        body = md(p["body_md"])
        rel = [x for x in POSTS if x["category"] == p["category"] and x is not p][:3] or [x for x in POSTS if x is not p][:3]
        key = p["image"].replace("/img/", "").replace("-1200.webp", "") if p.get("image", "").endswith("-1200.webp") else "kit-beige"
        art = f'''<article class="post"><header class="ph"><div class="in narrow"><a class="cat" href="{cat_url(p["category"])}">{E(p["category"])}</a><h1 class="h1">{E(p["title"])}</h1>
{f'<p class="q">Question: {E(p["question"])}</p>' if p.get("question") else ""}<p class="meta">By the {E(BRAND)} team · <time datetime="{p["dt"].isoformat()}">{fmt_date(p["dt"])}</time> · {max(1, round(words(p)/200))} min read</p></div></header>
<div class="in narrow">{pic(key, alt=p["title"], lazy=False, cls="hero-pic", sizes="(max-width:800px) 100vw, 760px")}<div class="prose">{body}</div>
<aside class="pbox">{pic("kit-beige", sizes="160px")}<div><b>{E(P["name"])}</b>{price_html()}<p>Serum, Anti Septic prep spray and 540-needle derma roller. Cash on delivery across Pakistan.</p>{cod_button("Order Now – COD", "btn gold")} <a href="{PRODUCT_URL}" class="btn line">View kit</a></div></aside>
<p class="small">General information only, not medical advice. See a dermatologist for hair loss or scalp conditions.</p></div></article>
{section("blog-sec dark", f'<div class="sh"><h2 class="h2">Related articles</h2><a class="more" href="/blog/">All articles →</a></div><div class="cards">{"".join(post_card(x) for x in rel)}</div>')}'''
        page(f"/blog/{p['slug']}/", p["title"], p.get("description", ""), art, crumb=[("Blog", "/blog/"), (E(p["category"]), cat_url(p["category"])), (E(p["title"]), f"/blog/{p['slug']}/")],
             og=f"/img/{key}-og.jpg" if not key.startswith("/") else None, kind="article", lastmod=p["dt"],
             schema=[{"@context": "https://schema.org", "@type": "BlogPosting", "headline": p["title"], "description": p.get("description", ""), "datePublished": p["dt"].isoformat(), "dateModified": p["dt"].isoformat(),
                      "image": SITE + f"/img/{key}-1200.webp", "author": {"@type": "Organization", "name": BRAND, "url": SITE + "/"}, "publisher": {"@id": SITE + "/#org"}, "mainEntityOfPage": SITE + f"/blog/{p['slug']}/", "inLanguage": "en-PK"}])
    chips = '<nav class="chips">' + '<a href="/blog/" class="on">All</a>' + "".join(f'<a href="{cat_url(c)}">{E(c)}</a>' for c in CATS if any(p["category"] == c for p in POSTS)) + "</nav>"
    feat = POSTS[0] if POSTS else None
    head = f'<h1 class="h1">The Envoquee Blog</h1><p class="lead">Scalp care, derma rolling, beard care and hair fall, written for life in Pakistan.</p>{chips}'
    page("/blog/", "Hair & Scalp Care Blog for Pakistan", "Practical guides on hair fall, scalp care, derma rolling and beard care for Pakistan's climate and water.",
         section("", head + f'<div class="cards">{"".join(post_card(p) for p in POSTS)}</div>'), crumb=[("Blog", "/blog/")])
    for c in CATS:
        ps = [p for p in POSTS if p["category"] == c]
        if not ps: continue
        cu = cat_url(c)
        cchips = chips.replace(' class="on"', "").replace(f'href="{cu}"', f'href="{cu}" class="on"')
        page(cat_url(c), f"{c} Articles", f"Envoquee blog articles about {c.lower()}: practical, Pakistan-focused guides.",
             section("", f'<h1 class="h1">{E(c)}</h1>{cchips}<div class="cards">{"".join(post_card(p) for p in ps)}</div>'),
             crumb=[("Blog", "/blog/"), (E(c), cat_url(c))])

def build_misc():
    nf = page("/404.html", "Page not found", "This page could not be found.", section("", f'<div class="ty"><h1 class="h1">Page not found</h1><p class="lead">The page you are looking for has moved or doesn\'t exist.</p><p><a class="btn gold" href="/">Go to home</a> <a class="btn line" href="{PRODUCT_URL}">Shop the kit</a> <a class="btn line" href="/blog/">Read the blog</a></p></div>'), noindex=True)
    # sitemap + indexnow manifest
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    man = {}
    for path, lm in PAGES:
        sm.append(f"<url><loc>{SITE}{path}</loc><lastmod>{lm.astimezone(dt.timezone.utc).strftime('%Y-%m-%d')}</lastmod></url>")
        f = OUT / path.lstrip("/") / "index.html"
        man[SITE + path] = hashlib.sha1(re.sub(r"\?v=[0-9a-z]+", "", f.read_text()).encode()).hexdigest()[:16]
    sm.append("</urlset>")
    (OUT / "sitemap.xml").write_text("\n".join(sm))
    key = S["seo"].get("indexnow_key", "")
    if key: (OUT / f"{key}.txt").write_text(key)
    (OUT / "indexnow-urls.json").write_text(json.dumps({"indexnow_key": key, "urls": man}))
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /order/\n\nSitemap: {SITE}/sitemap.xml\n")
    (OUT / "build-id.txt").write_text(BUILD_ID)
    # merchant feed
    if S["seo"].get("merchant_feed_enabled"):
        cat = S["seo"].get("google_product_category") or ""
        (OUT / "merchant-feed.xml").write_text(f'''<?xml version="1.0"?><rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel><title>{xesc(BRAND)}</title><link>{SITE}/</link><description>{xesc(BRAND)} products</description>
<item><g:id>ENV-KIT-01</g:id><g:title>{xesc(P["name"])}</g:title><g:description>{xesc(P["summary"])}</g:description><g:link>{SITE}{PRODUCT_URL}</g:link><g:image_link>{SITE}/img/kit-beige-og.jpg</g:image_link>
{"".join(f"<g:additional_image_link>{SITE}{img_url(g['src'])}</g:additional_image_link>" for g in GALLERY[1:])}<g:availability>{"in_stock" if P.get("in_stock") else "out_of_stock"}</g:availability><g:price>{P["price"]}.00 PKR</g:price><g:sale_price>{P["sale_price"]}.00 PKR</g:sale_price><g:brand>{xesc(BRAND)}</g:brand><g:condition>new</g:condition><g:identifier_exists>no</g:identifier_exists>{f"<g:google_product_category>{xesc(cat)}</g:google_product_category>" if cat else ""}</item></channel></rss>''')
    # redirects (301) + headers
    (OUT / "_redirects").write_text(f"""/index.html / 301
/home / 301
/shop/index.html /shop/ 301
/product {PRODUCT_URL} 301
/product/ {PRODUCT_URL} 301
/kit /the-kit/ 301
/hair-serum-kit {PRODUCT_URL} 301
/order {PRODUCT_URL}#order 301
/faqs /faq/ 301
/qa /faq/ 301
/privacy /privacy-policy/ 301
/terms-and-conditions /terms/ 301
/refund-policy /returns/ 301
/shipping-policy /shipping/ 301
/track /track-order/ 301
/admin /admin/ 301
/*/index.html /:splat/ 301
""")
    (OUT / "_headers").write_text("""/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/img/*
  Cache-Control: public, max-age=31536000, immutable
/style.css
  Cache-Control: public, max-age=31536000, immutable
/site.js
  Cache-Control: public, max-age=31536000, immutable
/admin/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
/order/*
  X-Robots-Tag: noindex
""")
    (OUT / "site.webmanifest").write_text(json.dumps({"name": BRAND, "short_name": BRAND, "icons": [{"src": "/apple-touch-icon.png", "sizes": "180x180", "type": "image/png"}, {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"}], "theme_color": "#0b0b0b", "background_color": "#0b0b0b", "display": "standalone"}))
    # admin
    shutil.copytree(ROOT / "admin", OUT / "admin", dirs_exist_ok=True)
    (OUT / "admin/meta.json").write_text(json.dumps({"categories": CATS, "images": list(IMG.keys()), "alts": IMG, "all_posts": [{"slug": p["slug"], "status": p.get("status"), "date": str(p.get("date")), "live": p in POSTS} for p in ALL_POSTS]}))
    # server-side pricing for the order function (generated; never trust client price)
    dc = str(S["shipping"].get("delivery_charge", "")).strip(); fr = str(S["shipping"].get("free_delivery_over", "")).strip()
    (ROOT / "functions/_lib/pricing.js").write_text("// GENERATED by build.py from data/product.json + data/settings.json\nexport const PRICING = " + json.dumps({
        "name": P["name"], "price": P["price"], "sale_price": P["sale_price"], "in_stock": bool(P.get("in_stock")), "max_qty": int(P.get("max_qty", 5)),
        "delivery_charge": int(dc) if dc.isdigit() else None, "free_delivery_over": int(fr) if fr.isdigit() else None}) + ";\n")

if __name__ == "__main__":
    if OUT.exists(): shutil.rmtree(OUT)
    shutil.copytree(ROOT / "static", OUT)
    build_pages(); build_blog(); build_misc()
    print(f"Built {len(PAGES)} indexable pages, {len(POSTS)} live posts ({len(ALL_POSTS)-len(POSTS)} scheduled/draft) -> {OUT}")
