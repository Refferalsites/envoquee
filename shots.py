import sys
from playwright.sync_api import sync_playwright
base = sys.argv[1]; out = "/workspace/sites/envoquee/screens"
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", args=["--no-sandbox"])
    for name, w, h, mob in [("desktop", 1440, 900, False), ("mobile", 390, 844, True)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1 if not mob else 2, is_mobile=mob, has_touch=mob)
        pg = ctx.new_page()
        for slug, path in [("home", "/"), ("product", "/shop/envoquee-hair-serum-kit/")]:
            pg.goto(base + path, wait_until="networkidle")
            pg.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i=>i.loading='eager')"); pg.wait_for_timeout(1500)
            pg.screenshot(path=f"{out}/{slug}-{name}.png", full_page=True)
            pg.screenshot(path=f"{out}/{slug}-{name}-fold.png")
        if not mob:
            pg.goto(base + "/"); pg.click("header [data-cod]"); pg.wait_for_timeout(500); pg.screenshot(path=f"{out}/cod-modal-desktop.png")
        ctx.close()
    b.close()
print("ok")
