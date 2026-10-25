"""Ordinary storefront UI, isolated as an unprivileged sandboxed Chrome child.

Only the pay click can buy. No request interception, CAPTCHA solver, stealth,
security overrides, cookie export from a desktop browser, or POST replay.
Private input/output travels over pipes to the owner-only broker.
"""
import json,re,sys

ORIGIN='https://ai-buy.vip'
PRICES={0:13400,250:7500,500:14500,1000:27600}


def cookies(rows):
    result=[]
    for r in rows:
        if r['domain'].lstrip('.')!='ai-buy.vip':raise ValueError('supplier_session_origin')
        c={k:r[k] for k in ('name','value','domain','path','secure')}
        c['httpOnly']='HttpOnly' in r.get('rest',{}) or r.get('httpOnly',False)
        if r.get('expires') and r['expires']>0:c['expires']=r['expires']
        result.append(c)
    return result


def history(context,filters=None):
    r=context.request.post(ORIGIN+'/user/api/purchaseRecord/data',form={'page':1,'limit':100,**(filters or {})},
        headers={'Referer':ORIGIN+'/user/personal/purchaseRecord','Origin':ORIGIN,'X-Requested-With':'XMLHttpRequest'},timeout=30000)
    d=r.json()
    if r.status!=200 or d.get('code')!=200 or not isinstance(d.get('data',{}).get('list'),list):
        raise ValueError('supplier_history_unconfirmed')
    return d['data']['list']


def reference_history(context,reference):
    if not re.fullmatch(r'ab-[a-f0-9]{40}',reference):raise ValueError('supplier_request_invalid')
    # The authenticated shop replaces contact with a random value. Its own
    # purchase-history search supports equal-* fields, including request_no.
    # A negative control rejects an ignored/unsupported filter before trusting
    # the result. The server still scopes both reads to this merchant account.
    control='ab-'+('0'*40 if reference!='ab-'+'0'*40 else '1'*40)
    if history(context,{'equal-request_no':control}):raise ValueError('supplier_correlation_unconfirmed')
    return history(context,{'equal-request_no':reference})


def select_purchase_ui(page,n):
    # Payment methods are populated asynchronously, after the variant handlers
    # have been registered. DOMContentLoaded alone does not mean they exist.
    pay=page.locator('.pay-list .pay[data-id="1"]')
    try:pay.wait_for(state='visible',timeout=45000)
    except Exception:raise ValueError('supplier_checkout_not_ready') from None
    race='' if n==0 else str(n)+'点数额度'
    variant=None
    if n==0:
        # Item 29 has no variants. A new variant must be reviewed explicitly,
        # never implicitly selected by its position or a similar title.
        if page.locator('.switch-race').count():raise ValueError('supplier_variant_unconfirmed')
    else:
        variant=page.locator('.switch-race').filter(has_text=race)
        if variant.count()!=1 or variant.get_attribute('data-sku')!=race:
            raise ValueError('supplier_variant_unconfirmed')
        variant.click()
        try:page.wait_for_function("race => document.querySelector('.switch-race.is-primary')?.dataset.sku === race",arg=race,timeout=10000)
        except Exception:raise ValueError('supplier_variant_unconfirmed') from None
    num=page.locator('.vstack input[name=num]');num.fill('1');num.dispatch_event('change')
    return race,variant,num,pay


def topup(page,data,dispatch):
    dispatch['phase']='form'
    amount=data['amount_minor']
    if type(amount) is not int or not 100<=amount<=1000000:raise ValueError('supplier_topup_amount')
    networks={'BEP20':('14','USDT-BEP20'),'POLYGON':('15','USDT-POLYGON'),'TRC20':('17','USDT-TRC20')}
    if data.get('network') not in networks:raise ValueError('supplier_topup_network')
    pay_id,label=networks[data['network']]
    page.goto(ORIGIN+'/user/recharge/index',wait_until='domcontentloaded',timeout=45000)
    field=page.locator('input[name=amount]');field.fill(format(amount/100,'.2f'))
    method=page.locator('.btn-pay[data-id="'+pay_id+'"]')
    method.wait_for(state='visible',timeout=30000)
    if method.inner_text().strip()!=label:raise ValueError('supplier_topup_network')
    method.click()
    try:page.wait_for_function("id => document.querySelector('.btn-pay.checked')?.dataset.id === id",arg=pay_id,timeout=10000)
    except Exception:raise ValueError('supplier_topup_network') from None
    button=page.locator('.payButton')
    if not button.is_enabled() or minor_text(field.input_value())!=amount:raise ValueError('supplier_topup_amount')
    # Creates an unpaid invoice only. No wallet, transfer or checkout payment
    # is performed here. Never repeat after a lost invoice-creation response.
    from urllib.parse import urlparse
    def gateway(url):
        parsed=urlparse(url)
        return parsed.scheme=='https' and parsed.netloc=='pay.ai-buy.vip' and not parsed.query and not parsed.fragment and bool(re.fullmatch(r'/pay/checkout-counter/[A-Za-z0-9_-]{8,80}',parsed.path))
    observed=[]
    page.on('request',lambda r:observed.append(urlparse(r.url).path) if r.url.startswith(ORIGIN+'/user/api/') else None)
    try:
        with page.expect_response(lambda r:r.url.split('?')[0].rstrip('/')==ORIGIN+'/user/api/recharge/trade' and r.request.method=='POST',timeout=50000) as event:
            dispatch['started']=True
            dispatch['phase']='submit'
            button.click(no_wait_after=True,timeout=10000)
        dispatch['phase']='response'
        response=event.value;receipt=response.json()
    except Exception as e:
        # A successful ordinary form may navigate before its response body is
        # readable. The new, strict public gateway URL is itself recoverable;
        # never click again merely because the response observer timed out.
        if gateway(page.url):
            return {'invoice_url':page.url,'amount_minor':amount,'network':data['network'],'paid':False}
        return {'error':'supplier_topup_unconfirmed','dispatch_state':'sent_or_uncertain',
            'phase':dispatch['phase'],'exception':type(e).__name__,
            'observed_paths':observed[-10:],'verification_required':page.locator('#fv-mask:visible,input[name=captcha]:visible').count()>0}
    if response.status!=200 or receipt.get('code')!=200:
        # Keep the first provider result encrypted in the root journal. A
        # rejection is different from waiting for a still-running provider.
        return {'error':'supplier_topup_rejected','dispatch_state':'sent_or_uncertain',
            'http_status':response.status,'provider_code':receipt.get('code')}
    url=receipt.get('data',{}).get('url','')
    if not gateway(url):
        raise ValueError('supplier_topup_gateway_changed')
    return {'invoice_url':url,'amount_minor':amount,'network':data['network'],'trade_no':str(receipt['data'].get('tradeNo','')),'paid':False}


def minor_text(v):
    from decimal import Decimal
    n=Decimal(v)*100
    return int(n) if n.is_finite() and n==n.to_integral_value() else None


def balance_snapshot(page):
    # The account/profile layout has no storefront dropdown. Read the same
    # authenticated header already used by procurement, without touching pay.
    page.goto(ORIGIN+'/item/75',wait_until='domcontentloaded',timeout=45000)
    dropdown=page.locator('#tokyoUserDropdown')
    try:dropdown.wait_for(state='attached',timeout=15000)
    except Exception:raise ValueError('supplier_balance_unconfirmed') from None
    values=re.findall(r'[¥￥]\s*([\d,]+(?:\.\d{1,2})?)',dropdown.inner_text())
    if len(values)!=1:raise ValueError('supplier_balance_unconfirmed')
    return {'balance_minor':minor_text(values[0].replace(',','')),'owner_verified':True}


def _main(data,dispatch):
    from playwright.sync_api import sync_playwright
    n=data['credits']
    if type(n) is not int or n not in PRICES or data['mode'] not in ('prepare','buy','history','topup','balance'):
        raise ValueError('supplier_request_invalid')
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,
            chromium_sandbox=True,args=['--disable-dev-shm-usage','--disable-crash-reporter'])
        try:
            context=browser.new_context()
            context.add_cookies(cookies(data['cookies']))
            def result(value):
                value['_cookies']=[c for c in context.cookies() if c['domain'].lstrip('.')=='ai-buy.vip']
                return value
            page=context.new_page()
            page.goto(ORIGIN+'/user/security/personal',wait_until='domcontentloaded',timeout=45000)
            # Profile labels are used only to confirm the account, never returned.
            from html import unescape
            html=page.content();ids=[]
            for m in re.finditer(r'<div\b[^>]*class=["\'][^"\']*uc-info__k[^"\']*["\'][^>]*>(.*?)</div>\s*<div\b[^>]*class=["\'][^"\']*uc-info__v[^"\']*["\'][^>]*>(.*?)</div>',html,re.S|re.I):
                label=unescape(re.sub('<[^>]+>','',m[1])).strip().lower().replace(' ','')
                if label in ('merchantid','商户id'):
                    v=unescape(re.sub('<[^>]+>','',m[2])).strip()
                    if v.isdigit():ids.append(int(v))
            if ids!=[data['merchantId']]:raise ValueError('supplier_login_required')
            if data['mode']=='topup':return result(topup(page,data,dispatch))
            if data['mode']=='balance':
                return result(balance_snapshot(page))
            before=history(context)
            if data['mode']=='history':
                out={'history':before}
                if data.get('request_no'):out['reference_history']=reference_history(context,data['request_no'])
                return result(out)
            item=29 if n==0 else 75
            page.goto(ORIGIN+'/item/'+str(item),wait_until='domcontentloaded',timeout=45000)
            race,variant,num,pay=select_purchase_ui(page,n)
            fields={'item_id':item,'race':race,'num':1,'card_id':0,'coupon':''}
            reads={}
            for action in ('valuation','stock'):
                response=context.request.post(ORIGIN+'/user/api/index/'+action,form=fields,
                    headers={'Referer':ORIGIN+'/item/'+str(item),'Origin':ORIGIN,'X-Requested-With':'XMLHttpRequest'},timeout=30000)
                reads[action]=response.json()
                if response.status!=200 or reads[action].get('code')!=200:
                    raise ValueError('supplier_quote_unconfirmed')
            from decimal import Decimal
            price=Decimal(str(reads['valuation']['data']['price']))*100
            if price!=price.to_integral_value() or not 0<price<=PRICES[n]:raise ValueError('supplier_price_hold')
            stock=reads['stock']['data']
            if int(stock.get('stock',0))<1 or int(stock.get('stock_state',0))<1:
                raise ValueError('supplier_out_of_stock')
            if page.locator('input[name=captcha]:visible').count() or page.locator('iframe[src*="challenges.cloudflare.com"]:visible').count():
                raise ValueError('supplier_human_verification_required')
            if pay.count()!=1 or not pay.is_visible():raise ValueError('supplier_balance_payment_unconfirmed')
            if data['mode']=='prepare':
                balance=page.locator('#tokyoUserDropdown').inner_text()
                values=re.findall(r'[¥￥]\s*([\d,]+(?:\.\d{1,2})?)',balance)
                if len(values)!=1:raise ValueError('supplier_balance_unconfirmed')
                return result({'amount_minor':int(price),'balance_minor':int(Decimal(values[0].replace(',',''))*100),
                    'history':before,'stock':int(stock['stock']),'owner_verified':True})
            request_no=data.get('request_no','')
            if not re.fullmatch(r'ab-[a-f0-9]{40}',request_no):raise ValueError('supplier_request_invalid')
            # These are documented optional order fields, unrelated to security
            # challenges. Ordinary storefront JS serializes them itself. This
            # request_no gives the owner's history an exact search binding and
            # upstream duplicate guard. Logged-in contact is overwritten by
            # the shop and is deliberately not used for reconciliation.
            page.locator('.vstack').evaluate('''(form,reference)=>{
                for(const name of ['request_no','contact']){
                    let input=form.querySelector('input[name="'+name+'"]');
                    if(!input){input=document.createElement('input');input.type='hidden';input.name=name;form.appendChild(input)}
                    input.value=reference;
                }
            }''',request_no)
            # The broker has already durably claimed this order. Recheck all
            # bindings immediately before the one irreversible UI click.
            variant_valid=(page.locator('.switch-race').count()==0 if n==0 else variant.get_attribute('data-sku')==race and 'is-primary' in variant.get_attribute('class'))
            if int(price)!=data['amount_minor'] or num.input_value()!='1' or not variant_valid:
                raise ValueError('supplier_quote_changed')
            if sorted(str(x['trade_no']) for x in before)!=sorted(data['baseline']):
                raise ValueError('supplier_account_history_changed')
            receipt=None
            try:
                with page.expect_response(lambda r:r.url==ORIGIN+'/user/api/order/trade',timeout=50000) as event:
                    dispatch['started']=True
                    pay.click(no_wait_after=True,timeout=10000)
                response=event.value
                try:receipt={'http_status':response.status,'json':response.json()}
                except Exception:receipt={'http_status':response.status}
            except Exception:
                # No second click, even when the first response was lost.
                pass
            out={'receipt':receipt,'dispatch_state':'sent_or_uncertain'}
            # Retain the captured financial response even if later reads fail.
            try:out['history']=history(context)
            except Exception:out['history']=[];out['history_error']='supplier_history_unconfirmed'
            receipt_data=((receipt or {}).get('json') or {}).get('data') or {}
            trade=str(receipt_data.get('tradeNo') or '')
            if not trade:
                try:out['reference_history']=reference_history(context,request_no)
                except Exception:out['history_error']='supplier_correlation_unconfirmed'
            return result(out)
        finally:browser.close()


def main(data):
    dispatch={'started':False}
    try:return _main(data,dispatch)
    except Exception as e:
        if data.get('mode') in ('buy','topup') and not dispatch['started']:
            reason=str(e)
            return {'error':reason if re.fullmatch(r'supplier_[a-z_]{1,70}',reason) else 'supplier_checkout_not_ready',
                'dispatch_state':'not_sent'}
        if data.get('mode')=='topup':
            reason=str(e)
            return {'error':reason if re.fullmatch(r'supplier_[a-z_]{1,70}',reason) else 'supplier_topup_unconfirmed',
                'dispatch_state':'sent_or_uncertain','phase':dispatch.get('phase','owner'),
                'exception':type(e).__name__}
        raise


if __name__=='__main__':
    try:result=main(json.loads(sys.stdin.read(262144)))
    except Exception as e:
        reason=str(e)
        result={'error':reason if re.fullmatch('supplier_[a-z_]{1,70}',reason) else 'supplier_browser_unconfirmed'}
    # stdout may contain a delivered secret; only the local protected broker
    # consumes it. The service discards stderr and never logs response bodies.
    sys.stdout.write(json.dumps(result))
