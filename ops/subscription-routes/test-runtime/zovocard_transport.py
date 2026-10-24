"""Server-side HTTPS transport, disabled for writes by default.

Uses a direct connection with TLS validation, no environment proxies, redirects
or automatic retries. No API key is sent to public CDK endpoints. A successful
owner plans probe is required before any CDK/session can leave this process.
This module is not imported by the running Pulse service.
"""
import json
import re


class TransportBlocked(RuntimeError):
    def __init__(self, reason):
        # Only internal constant reasons, never remote text/URLs/exceptions.
        self.reason = reason
        super().__init__('ZovoCard transport blocked: ' + reason)


class HTTPS:
    ORIGIN = 'https://zovocard.com'
    PUBLIC_POSTS = {'/api/v1/cdk/preview', '/api/v1/cdk/preflight'}
    OWNER_REDEEM = '/openapi/v1/gpt-direct/cdks/redeem'
    PLANS = '/openapi/v1/gpt-direct/plans'

    def __init__(self, api_key, *, writes_enabled=False, session=None):
        if not isinstance(api_key, str) or not api_key.startswith('sk_') or any(c in api_key for c in '\r\n'):
            raise TransportBlocked('invalid_api_key')
        self._api_key = api_key
        self.writes_enabled = writes_enabled is True
        self._ready = False
        self._region_blocked = False
        if session is None:
            from curl_cffi import requests
            from curl_cffi.const import CurlOpt
            # Keep the actual egress equal to the approved IPv4 allowlist.
            # Some hosts also have IPv6, which would otherwise be preferred.
            session = requests.Session(trust_env=False,
                                       curl_options={CurlOpt.IPRESOLVE: 1})
        self._session = session

    def close(self):
        self._api_key = ''
        self._ready = False
        self._session.close()

    def _request(self, method, path, payload, device=None, owner=False, idempotency_key=None):
        headers = {'Accept': 'application/json'}
        if owner:
            headers['X-API-Key'] = self._api_key
        if device:
            headers['X-Redemption-Device'] = device
        if idempotency_key:
            if not re.fullmatch(r'[A-Za-z0-9._:-]{1,80}', idempotency_key):
                raise TransportBlocked('invalid_idempotency_key')
            headers['Idempotency-Key'] = idempotency_key
        try:
            options = dict(headers=headers, impersonate='chrome', timeout=20,
                           allow_redirects=False, verify=True, proxies={})
            if method in ('POST', 'PUT'):
                options['json'] = payload
                headers['Content-Type'] = 'application/json'
            response = self._session.request(method, self.ORIGIN + path, **options)
            status = response.status_code
            if 300 <= status < 400:
                raise TransportBlocked('redirect_refused')
            content = response.content
            if len(content) > 2 * 1024 * 1024:
                raise TransportBlocked('response_too_large')
            body = json.loads(content)
            if not isinstance(body, dict):
                raise TransportBlocked('invalid_json')
        except TransportBlocked:
            raise
        except Exception:
            raise TransportBlocked('network_or_response_error') from None
        if body.get('error_code') == 'region_unavailable':
            self._region_blocked = True
            self._ready = False
            raise TransportBlocked('region_unavailable')
        return status, body

    def probe(self):
        """Read-only: no CDK, customer session or purchase is transmitted."""
        if self._region_blocked:
            raise TransportBlocked('region_unavailable')
        self._ready = False
        status, body = self._request('GET', self.PLANS, None, owner=True)
        if status != 200 or type(body.get('code')) is not int or body['code'] != 0 or not isinstance(body.get('data'), dict):
            raise TransportBlocked('probe_not_ready')
        self._ready = True
        return body['data']

    def __call__(self, method, path, payload, headers, owner=False):
        if self._region_blocked:
            raise TransportBlocked('region_unavailable')
        if method not in ('GET', 'POST') or not isinstance(path, str):
            raise TransportBlocked('route_refused')
        public_post = method == 'POST' and path in self.PUBLIC_POSTS and owner is False
        owner_post = method == 'POST' and path == self.OWNER_REDEEM and owner is True
        public_get = (method == 'GET' and owner is False
                      and re.fullmatch(r'/api/v1/cdk/result\?token=[A-Za-z0-9%._~-]+', path))
        owner_get = (method == 'GET' and owner is True
                     and re.fullmatch(r'/openapi/v1/gpt-direct/cdk-orders/[0-9]+', path))
        if not any((public_post, owner_post, public_get, owner_get)):
            raise TransportBlocked('route_refused')
        if method == 'GET' and payload is not None:
            raise TransportBlocked('unexpected_payload')
        if method == 'POST' and not isinstance(payload, dict):
            raise TransportBlocked('invalid_payload')
        if method == 'POST' and (not self.writes_enabled or not self._ready):
            raise TransportBlocked('writes_not_ready')
        if set(headers) != {'X-Redemption-Device'}:
            raise TransportBlocked('unexpected_headers')
        device = headers['X-Redemption-Device']
        if not isinstance(device, str) or not re.fullmatch(r'[A-Za-z0-9._:-]{1,80}', device):
            raise TransportBlocked('invalid_device')
        if owner_post:
            required = {'redemption_token', 'preflight_token', 'client_request_id',
                        'card_id', 'strict_card_preference', 'no_auto_card_switch'}
            if (set(payload) != required or type(payload['card_id']) is not int
                    or payload['card_id'] <= 0 or payload['strict_card_preference'] is not True
                    or payload['no_auto_card_switch'] is not True):
                raise TransportBlocked('fixed_card_required')
        return self._request(method, path, payload, device, owner)
