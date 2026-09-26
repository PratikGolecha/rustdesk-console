import { WebClientService } from './web-client.service';

describe('WebClientService', () => {
  const service = new WebClientService();
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('derives host/api from the request when no env is set', () => {
    delete process.env.WEB_CLIENT_ID_SERVER;
    delete process.env.WEB_CLIENT_API_SERVER;
    const cfg = service.getConfig({
      host: 'rd.example.com:8443',
      protocol: 'https',
    });
    expect(cfg.id_server).toBe('rd.example.com');
    expect(cfg.api_server).toBe('https://rd.example.com:8443');
    expect(cfg.enabled).toBe(true);
  });

  it('prefers env values and reads the key', () => {
    process.env.WEB_CLIENT_ID_SERVER = 'id.example.com:21116';
    process.env.WEB_CLIENT_API_SERVER = 'https://console.example.com/';
    process.env.WEB_CLIENT_KEY = 'PUBKEY=';
    const cfg = service.getConfig({ host: 'ignored', protocol: 'http' });
    expect(cfg).toMatchObject({
      id_server: 'id.example.com:21116',
      relay_server: 'id.example.com:21116',
      api_server: 'https://console.example.com',
      key: 'PUBKEY=',
    });
  });

  it('rejects malformed hosts and escapes script output', () => {
    process.env.WEB_CLIENT_ID_SERVER = "x';alert(1);//";
    const cfg = service.getConfig({ host: 'good.host', protocol: 'http' });
    expect(cfg.id_server).toBe('good.host');
    const js = service.renderConfigScript({
      ...cfg,
      key: "</script>'\u2028",
    });
    expect(js).not.toContain('</script>');
    expect(js).toContain(
      "localStorage.setItem('key', \"\\u003c/script>'\\u2028\");",
    );
  });

  it('emits nothing when disabled', () => {
    process.env.WEB_CLIENT_ENABLED = 'false';
    const cfg = service.getConfig({ host: 'a.b', protocol: 'http' });
    expect(service.isEnabled()).toBe(false);
    expect(service.renderConfigScript(cfg)).not.toContain('localStorage');
  });
});
