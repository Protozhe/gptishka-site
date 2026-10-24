"""Direct Plus API; separate from CDK transport and disabled by default.

This interface cannot issue CDKs, open/fund cards or change card rules.
The caller persists client_request_id and dispatch state before create_order.
"""
import re
import json
from urllib.parse import quote
from zovocard_transport import HTTPS, TransportBlocked


class DirectHTTPS(HTTPS):
    PREFIX = '/openapi/v1/gpt-direct'

    @staticmethod
    def _validate_session(full_session):
        try:
            data = json.loads(full_session)
        except (ValueError, TypeError):
            raise TransportBlocked('full_session_required') from None
        if (not isinstance(data, dict) or not isinstance(data.get('sessionToken'), str)
                or not data['sessionToken'].strip()):
            raise TransportBlocked('full_session_required')

    def _owner(self, method, path, payload=None):
        if self._region_blocked:
            raise TransportBlocked('region_unavailable')
        return self._request(method, path, payload, owner=True)

    def preflight(self, full_session):
        if not self._ready:
            raise TransportBlocked('probe_not_ready')
        self._validate_session(full_session)
        return self._owner('POST', self.PREFIX + '/preflight', {
            'product': 'gpt', 'plan': 'plus',
            'payment_country': 'PH', 'payment_currency': 'PHP',
            'credential': {'mode': 'session', 'session': full_session}})

    def create_order(self, *, full_session, preflight_token, request_id, card_id):
        if not self.writes_enabled or not self._ready:
            raise TransportBlocked('writes_not_ready')
        self._validate_session(full_session)
        if (type(card_id) is not int or card_id <= 0
                or not isinstance(request_id, str)
                or not re.fullmatch(r'[A-Za-z0-9._:-]{1,80}', request_id)
                or not isinstance(preflight_token, str) or not preflight_token
                or not isinstance(full_session, str) or not full_session):
            raise TransportBlocked('invalid_direct_order')
        return self._owner('POST', self.PREFIX + '/orders', {
            'product': 'gpt', 'plan': 'plus',
            'payment_country': 'PH', 'payment_currency': 'PHP',
            'credential': {'mode': 'session', 'session': full_session},
            'preflight_token': preflight_token, 'client_request_id': request_id,
            'card_id': card_id, 'no_auto_card_switch': True})

    def order(self, order_id):
        if not isinstance(order_id, (int, str)) or isinstance(order_id, bool) or not re.fullmatch(r'[1-9][0-9]*', str(order_id)):
            raise TransportBlocked('invalid_order_id')
        return self._owner('GET', self.PREFIX + '/orders/' + str(order_id))

    def card_usage(self, card_id):
        if type(card_id) is not int or card_id <= 0:
            raise TransportBlocked('invalid_card_id')
        return self._owner('GET', self.PREFIX + '/cards/' + str(card_id) + '/usage?product=gpt')

    def card_balance(self, card_id):
        if type(card_id) is not int or card_id <= 0:
            raise TransportBlocked('invalid_card_id')
        status, body = self._owner('GET', '/openapi/v1/cards/' + str(card_id))
        data = body.get('data', {})
        # Card details include PAN/CVV. Expose only fields needed by the worker.
        safe = {k: data.get(k) for k in ('id', 'status', 'available_amount',
                'channel_payable', 'delete_pending_at', 'restricted_merchants',
                'min_recharge', 'product_code', 'issuer', 'balance_stale', 'remark',
                'google_chatgpt_blocked', 'refund_keep_min')}
        safe['last_four'] = str(data.get('card_number') or '')[-4:]
        return status, {'code': body.get('code'), 'data': safe}

    def account_orders(self, cursor=''):
        path = self.PREFIX + '/account-orders?page_size=100'
        if cursor:
            path += '&cursor=' + quote(cursor, safe='')
        return self._owner('GET', path)

    def card_transactions(self, card_id, page=1):
        if type(card_id) is not int or card_id<=0 or type(page) is not int or not 1<=page<=100:
            raise TransportBlocked('invalid_transaction_query')
        return self._owner('GET', f'/openapi/v1/cards/{card_id}/transactions?page={page}&page_size=100&sync=1')

    def sync_card_balances(self, bin_prefix):
        if not isinstance(bin_prefix,str) or not re.fullmatch(r'[0-9]{6}',bin_prefix):
            raise TransportBlocked('invalid_card_bin')
        status,body=self._owner('GET','/openapi/v1/cards?page=1&page_size=100&issuer=four&status=ACTIVE&q='+bin_prefix+'&sync=1')
        rows=body.get('data',{}).get('list',[]) if isinstance(body.get('data'),dict) else []
        return status,{'code':body.get('code'),'data':{'synced_card_ids':[x.get('id') for x in rows]}}

    def products(self):
        return self._owner('GET', '/openapi/v1/products')

    def balance(self):
        return self._owner('GET', '/openapi/v1/balance')

    def recharge(self, card_id, amount_minor, request_id):
        if not self.writes_enabled or not self._ready:
            raise TransportBlocked('writes_not_ready')
        if type(card_id) is not int or card_id <= 0 or type(amount_minor) is not int or not 0 < amount_minor <= 2200:
            raise TransportBlocked('invalid_funding')
        return self._request('POST','/openapi/v1/cards/recharge',
            {'card_id':card_id,'amount':amount_minor/100},owner=True,idempotency_key=request_id)

    def bin_rates(self, bin_prefix, currency):
        if bin_prefix!='537872' or currency not in ('PHP','USD'):raise TransportBlocked('invalid_rate_query')
        return self._owner('GET','/openapi/v1/fx/card-bins?bin='+bin_prefix+'&currency='+currency)

    def find_cards(self, marker):
        if not isinstance(marker,str) or not re.fullmatch(r'GPTishka auto pulse-open-[a-f0-9]{44}',marker):raise TransportBlocked('invalid_card_query')
        status,body=self._owner('GET','/openapi/v1/cards?page_size=100&issuer=four&q='+quote(marker,safe='')+'&sync=1')
        data=body.get('data',{});rows=data.get('list',[]) if isinstance(data,dict) else []
        safe=[{k:x.get(k) for k in ('id','status','product_code','issuer','remark')} for x in rows]
        return status,{'code':body.get('code'),'data':{'list':safe}}

    def open_card(self, product, initial_minor, request_id, remark):
        if not self._ready or not self.writes_enabled:raise TransportBlocked('writes_not_ready')
        if product!='XL537872' or type(initial_minor) is not int or not 1000<=initial_minor<=10500:raise TransportBlocked('invalid_card_open')
        status,body=self._request('POST','/openapi/v1/cards/open',{'product_code':product,'first_name':'GPTishka','last_name':'Operations','init_amount':initial_minor/100,'remark':remark},owner=True,idempotency_key=request_id)
        data=body.get('data',{});safe={k:data.get(k) for k in ('id','status','product_code','issuer','remark')} if isinstance(data,dict) else {}
        return status,{'code':body.get('code'),'data':safe}

    def return_balance(self, card_id, amount_minor, request_id):
        if not self._ready or not self.writes_enabled:raise TransportBlocked('writes_not_ready')
        if type(card_id) is not int or card_id<=0 or type(amount_minor) is not int or not 0<amount_minor<=2200:raise TransportBlocked('invalid_card_refund')
        return self._request('POST','/openapi/v1/cards/refund',{'card_id':card_id,'amount':amount_minor/100},owner=True,idempotency_key=request_id)

    def refund_ledger(self,card_id):
        if type(card_id) is not int or card_id<=0:raise TransportBlocked('invalid_card_id')
        return self._owner('GET','/openapi/v1/balance-logs?ref_id='+str(card_id)+'&page_size=100')

    def remark(self, card_id, text):
        if type(card_id) is not int or card_id <= 0 or not isinstance(text,str) or len(text)>1200:
            raise TransportBlocked('invalid_remark')
        return self._request('PUT',f'/openapi/v1/cards/{card_id}/remark',{'remark':text},owner=True)

    def __call__(self, *args, **kwargs):
        # No generic route through inherited CDK interface.
        raise TransportBlocked('use_direct_methods')
