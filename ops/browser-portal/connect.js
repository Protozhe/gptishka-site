// This marker is not a credential. Nginx supplies the private token after login.
if (['https://gptishka.shop', 'https://www.gptishka.shop'].includes(location.origin)) {
  localStorage.setItem('pulse_chat_token', 'browser-proxy');
  localStorage.setItem('connection_token', 'browser-proxy');
  localStorage.setItem('pulse_chat_api', '/worker-api');
  localStorage.setItem('vps_api_url', location.origin + '/worker-api');
  localStorage.setItem('pulse_auth_generation', '20261023-browser');
}
