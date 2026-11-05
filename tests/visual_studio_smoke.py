"""Standalone browser smoke test using fake financial data. No API/network required."""
import base64
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / 'public'
DATA = {
 'auth/me': {'user': {'id': 'test-user', 'email': 'gestao@example.com', 'role': 'admin'}},
 'dashboard': {'contacts': {'total': 24, 'atacado': 8}, 'orders': {'vendas_confirmadas': 1465000, 'novos': 3}, 'products': {'low': 2}, 'finance': {'received': 805000, 'spent': 225000, 'receivable': 560000, 'payable': 68000}, 'deals': [], 'recent': []},
 'finance': {'items': [{'id': 'example', 'title': 'Pedido em aberto', 'type': 'receita', 'category': 'vendas', 'amount_cents': 99000, 'status': 'pendente', 'method': 'pix', 'due_date': '2026-11-20'}]},
 'reports/financial': {'months': [{'month':'2026-08','income_cents':80000,'expense_cents':29000},{'month':'2026-09','income_cents':120000,'expense_cents':40000},{'month':'2026-10','income_cents':220000,'expense_cents':75000},{'month':'2026-11','income_cents':95000,'expense_cents':20000}], 'expense_categories': [{'category':'Fornecedores','amount_cents':100000},{'category':'Entrega','amount_cents':45000},{'category':'Operação','amount_cents':19000}], 'margin_cents':200000,'stock_value_cents':350000,'period_balance_cents':351000},
 'alerts': {'items': []}
}

def data_url(text):
    return 'data:text/javascript;base64,' + base64.b64encode(text.encode()).decode()

app = (ROOT/'app.js').read_text()
app = app.replace("'./finance-analytics.js'", repr(data_url((ROOT/'finance-analytics.js').read_text())))
app = app.replace("'./experience.js'", repr(data_url((ROOT/'experience.js').read_text())))
html = (ROOT/'index.html').read_text()
html = html.replace('<link rel="stylesheet" href="/app.css">','<style>'+(ROOT/'app.css').read_text()+'</style>')
html = html.replace('<link rel="stylesheet" href="/studio.css">','<style>'+(ROOT/'studio.css').read_text()+'</style>')
html = html.replace('<script type="module" src="/app.js"></script>',f'<script type="module" src="{data_url(app)}"></script>')
mock = """window.__DATA = %s;
window.fetch = async function(url) {
 const key=String(url).replace(/^\\/api\\//,'').split('?')[0];
 return {ok:true,status:200,json:async()=>window.__DATA[key]||{items:[]}};
};""" % json.dumps(DATA)

with sync_playwright() as engine:
    browser=engine.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-web-security'])
    for label,viewport,agent in [('desktop',{'width':1440,'height':980},None),('mobile',{'width':390,'height':844},'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')]:
        context=browser.new_context(viewport=viewport,user_agent=agent) if agent else browser.new_context(viewport=viewport)
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('about:blank')
        page.evaluate(mock)
        page.set_content(html,wait_until='domcontentloaded')
        page.locator('.stats-grid').wait_for(timeout=12000)
        page.locator('button[data-experience="theme"]').first.click()
        assert page.evaluate('document.documentElement.dataset.theme')=='dark'
        if label=='mobile':page.locator('#menu-toggle').click()
        page.locator('button[data-nav="finance"]').click()
        page.locator('#finance-period').wait_for(timeout=12000)
        assert page.locator('.cash-month').count()==6
        page.locator('#finance-period').select_option('12')
        page.locator('.cash-month').first.wait_for(timeout=12000)
        assert page.locator('.cash-month').count()==12
        assert page.locator('.expense-chart').count()==1
        page.wait_for_timeout(550)
        page.screenshot(path=str(ROOT.parent/f'studio-{label}.png'),full_page=True)
        if label=='mobile':
            page.wait_for_timeout(1650)
            assert page.locator('#crm-install-banner').count()==1
            page.locator('#crm-install-banner [data-experience="install"]').click()
            assert 'Compartilhar' in page.locator('.install-app-text p').inner_text()
            page.locator('#crm-install-banner [data-experience="dismiss"]').click()
            assert page.locator('#crm-install-banner').count()==0
        assert not errors, errors
        print(label,'visual smoke passed')
        context.close()
    browser.close()
