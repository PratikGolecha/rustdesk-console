import {
  buildInstallCommands,
  buildLicensedFileName,
  buildPlainFileName,
  decodeConfigString,
  decodeFromFileName,
  encodeConfigString,
  isValidHostPort,
  isValidPublicKey,
  normalizeApiUrl,
} from './client-config.codec';

// Vectors copied from the client's own unit test (rustdesk/src/custom_server.rs).
const LIC = {
  host: '1.1.1.1',
  key: '5Qbwsde3unUcJBtrx9ZkvUmwFNoExHzpryHuPUdqlWM=',
  api: '',
  relay: '',
};
const LIC_STR =
  '0nI900VsFHZVBVdIlncwpHS4V0bOZ0dtVldrpVO4JHdCp0YV5WdzUGZzdnYRVjI6ISeltmIsISMuEjLx4SMiojI0N3boJye';

describe('client config codec (client source vectors)', () => {
  it('decodes the client test vector (old two-field payload) and round-trips ours', () => {
    expect(decodeConfigString(LIC_STR)).toEqual(LIC);
    expect(decodeConfigString(encodeConfigString(LIC))).toEqual(LIC);
  });

  it.each([
    `rustdesk-licensed-${LIC_STR}.exe`,
    `rustdesk-licensed-${LIC_STR}(1).exe`,
    `rustdesk--${LIC_STR}(1).exe`,
    `rustdesk-licensed-${LIC_STR} (1) (2).exe`,
    `rustdesk-licensed-${LIC_STR}--abc.exe`,
    `rustdesk-licensed---${LIC_STR}--.exe`,
    `rustdesk-licensed-=${LIC_STR}.exe`,
    `=${LIC_STR}.exe`,
  ])('file-name parser accepts %s', (name) => {
    expect(decodeFromFileName(name)).toEqual(LIC);
  });

  it('rejects wrong padding and plain names like the client', () => {
    expect(decodeFromFileName(`rustdesk-licensed-==${LIC_STR}.exe`)).toBeNull();
    expect(decodeFromFileName('rustdesk.exe')).toBeNull();
  });

  it('host= form matches the client tests', () => {
    expect(
      decodeFromFileName(
        'rustdesk-host=server.example.net,api=abc,key=Zm9vYmFyLiwyCg==.exe',
      ),
    ).toEqual({
      host: 'server.example.net',
      key: 'Zm9vYmFyLiwyCg==',
      api: 'abc',
      relay: '',
    });
    expect(
      decodeFromFileName(
        'rustdesk-Host=server.example.net,Key=Zm9vYmFyLiwyCg==,RELAY=r.example.net.exe',
      ),
    ).toEqual({
      host: 'server.example.net',
      key: 'Zm9vYmFyLiwyCg==',
      api: '',
      relay: 'r.example.net',
    });
  });
});

describe('generated artifacts round-trip', () => {
  const cfg = {
    host: 'id.example.com:21116',
    key: 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/AbCde=',
    api: 'https://console.example.com',
    relay: 'relay1.example.com:21117',
  };

  it('config string round-trips', () => {
    const s = encodeConfigString(cfg);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeConfigString(s)).toEqual(cfg);
  });

  it('licensed file name is verified and parses back', () => {
    const r = buildLicensedFileName(cfg);
    expect(r.verified).toBe(true);
    expect(decodeFromFileName(r.filename)).toEqual(cfg);
  });

  it('plain file name is refused when the api url / key contain illegal chars', () => {
    const r = buildPlainFileName(cfg);
    expect(r.verified).toBe(false);
  });

  it('plain file name works for simple values', () => {
    const simple = { host: 'id.example.com', key: 'abc=', api: '', relay: '' };
    const r = buildPlainFileName(simple);
    expect(r.filename).toBe('rustdesk-host=id.example.com,key=abc=,.exe');
    expect(r.verified).toBe(true);
    expect(decodeFromFileName(r.filename)).toEqual(simple);
  });

  it('flags a licensed name whose string would be split on "--"', () => {
    // U+0BFE encodes to a base64url string containing "--" (found by search)
    const c = { host: '\u0bfe', key: '', api: '', relay: '' };
    expect(encodeConfigString(c)).toContain('--');
    expect(buildLicensedFileName(c).verified).toBe(false);
  });

  it('install commands embed the string verbatim and quote it', () => {
    const s = encodeConfigString(cfg);
    const c = buildInstallCommands(s);
    expect(c.linux).toBe(`sudo rustdesk --config '${s}'`);
    expect(c.macos).toContain(
      '/Applications/RustDesk.app/Contents/MacOS/RustDesk',
    );
    expect(c.windowsCmd).toContain(`--config "${s}"`);
    expect(c.windowsPowerShell).toContain(`--config '${s}'`);
  });
});

describe('validators', () => {
  it.each([
    'id.example.com',
    'id.example.com:21116',
    '10.0.0.5',
    '10.0.0.5:21117',
    '[2001:db8::1]:21117',
    'localhost',
  ])('accepts %s', (v) => expect(isValidHostPort(v)).toBe(true));
  it.each([
    '',
    'a b',
    'host:0',
    'host:70000',
    'host:',
    'http://host',
    'a,b',
    '-bad.example.com',
    '300.300.300.300',
    '2001:db8::1',
  ])('rejects %s', (v) => expect(isValidHostPort(v)).toBe(false));

  it('validates keys and api urls', () => {
    expect(isValidPublicKey(LIC.key)).toBe(true);
    expect(isValidPublicKey('short')).toBe(false);
    expect(normalizeApiUrl('https://a.example.com/')).toBe(
      'https://a.example.com',
    );
    expect(normalizeApiUrl('ftp://a')).toBeNull();
    expect(normalizeApiUrl('https://a.example.com?x=1')).toBeNull();
  });
});
