/**
 * RustDesk client server-configuration codec.
 *
 * Every rule below was taken from the RustDesk client source
 * (github.com/rustdesk/rustdesk):
 *
 * - src/custom_server.rs   `CustomServer`, `get_custom_server_from_config_string`,
 *                          `get_custom_server_from_string` (+ its unit-test vectors)
 * - src/core_main.rs       `rustdesk --config <string>` (sets the options
 *                          `key`, `custom-rendezvous-server`, `api-server`,
 *                          `relay-server`; needs an installed client and admin/root)
 * - flutter/lib/common.dart `ServerConfig.encode/decode` (the string the GUI
 *                          "Import server config" button and `rustdesk://config/<string>` use)
 *
 * Config string = reverse( base64url( JSON{key,host,api,relay} ) ).
 * The Rust client accepts padded and unpadded base64url; Flutter's decoder
 * normalises padding; Flutter's encoder emits padded output. We emit UNPADDED
 * (what the Rust naming tool does) because `=` adds nothing and is awkward in
 * shells and file names. Both decoders accept it.
 *
 * NOTE: the open-source client treats `relay` as ONE host[:port]. There is no
 * comma-list parsing anywhere in the client (see docs/relay-servers.md).
 */

export interface ClientServerConfig {
  key: string;
  host: string;
  api: string;
  relay: string;
}

/** Same field order as the Rust `CustomServer` struct (serde serialises in this order). */
export function toWireObject(c: ClientServerConfig): ClientServerConfig {
  return { key: c.key, host: c.host, api: c.api, relay: c.relay };
}

/** Reverse a string by Unicode code points (Rust `chars().rev()`). */
const reverse = (s: string) => Array.from(s).reverse().join('');

export function encodeConfigString(c: ClientServerConfig): string {
  const json = JSON.stringify(toWireObject(c));
  const b64 = Buffer.from(json, 'utf8').toString('base64url'); // unpadded
  return reverse(b64);
}

/**
 * Strict base64url decode with the semantics of the Rust client:
 * `URL_SAFE_NO_PAD.decode(x).or_else(|_| URL_SAFE.decode(x))`.
 * Node's decoder is lenient, so verify by re-encoding.
 */
function strictBase64UrlDecode(input: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(input)) return null;
  const unpadded = input.replace(/=+$/, '');
  const buf = Buffer.from(unpadded, 'base64url');
  if (buf.toString('base64url') !== unpadded) return null;
  // NO_PAD accepts only unpadded input; PAD accepts only correctly padded input.
  const pad = input.length - unpadded.length;
  if (pad === 0) return buf;
  const expectedPad = (4 - (unpadded.length % 4)) % 4;
  return pad === expectedPad ? buf : null;
}

function parseWireObject(data: Buffer): ClientServerConfig | null {
  try {
    const j = JSON.parse(data.toString('utf8')) as Record<string, unknown>;
    if (j === null || typeof j !== 'object' || Array.isArray(j)) return null;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    return {
      key: str(j.key),
      host: str(j.host),
      api: str(j.api),
      relay: str(j.relay),
    };
  } catch {
    return null;
  }
}

/** Port of `get_custom_server_from_config_string` (unsigned payloads only). */
export function decodeConfigString(s: string): ClientServerConfig | null {
  const data = strictBase64UrlDecode(reverse(s));
  return data ? parseWireObject(data) : null;
}

/**
 * Port of `get_custom_server_from_string` (src/custom_server.rs), used for the
 * executable file name (`rustdesk-...exe`) and for `--config`.
 * Returns null where the client would bail ("Failed to parse").
 * The signed-payload branch (RustDesk's own licence key) is not supported.
 */
export function decodeFromFileName(input: string): ClientServerConfig | null {
  let s = input;
  const lower = s.toLowerCase();
  if (lower.endsWith('.exe.exe')) s = s.slice(0, s.length - 8);
  else if (lower.endsWith('.exe')) s = s.slice(0, s.length - 4);

  const idx = s.toLowerCase().indexOf('host=');
  if (idx >= 0) {
    let host = '';
    let key = '';
    let api = '';
    let relay = '';
    for (const el of s.slice(idx).split(',')) {
      const l = el.toLowerCase();
      if (l.startsWith('host=')) host = el.slice(5);
      if (l.startsWith('key=')) key = el.slice(4);
      if (l.startsWith('api=')) api = el.slice(4);
      if (l.startsWith('relay=')) relay = el.slice(6);
    }
    return { key, host, api, relay };
  }

  s = s
    .replaceAll('-licensed---', '--')
    .replaceAll('-licensed--', '--')
    .replaceAll('-licensed-', '--');
  for (const part of s.split('--')) {
    const direct = decodeConfigString(part.trim());
    if (direct) return direct;
    if (part.includes('(')) {
      for (const sub of part.split('(')) {
        const r = decodeConfigString(sub.trim());
        if (r) return r;
      }
    }
  }
  return null;
}

export interface FileNameResult {
  filename: string;
  /** true when the client parser recovers exactly the intended config from it */
  verified: boolean;
  /** why it is not usable, when verified is false */
  reason?: string;
}

const WINDOWS_FILENAME_BAD = /[\\/:*?"<>|]/;

function sameConfig(a: ClientServerConfig | null, b: ClientServerConfig) {
  return (
    !!a &&
    a.key === b.key &&
    a.host === b.host &&
    a.api === b.api &&
    a.relay === b.relay
  );
}

/**
 * `rustdesk-licensed-<config string>.exe`. The client splits on `--`, so a
 * string containing `--` or `-licensed-` would be corrupted; such a string is
 * reported unverified rather than silently emitted.
 */
export function buildLicensedFileName(c: ClientServerConfig): FileNameResult {
  const filename = `rustdesk-licensed-${encodeConfigString(c)}.exe`;
  const ok = sameConfig(decodeFromFileName(filename), c);
  return ok
    ? { filename, verified: true }
    : {
        filename,
        verified: false,
        reason:
          'The encoded string contains a sequence the client splits on (--). Change any setting slightly (for example add a port) and regenerate.',
      };
}

/**
 * `rustdesk-host=<h>,key=<k>,api=<a>,relay=<r>.exe`. Fields are comma
 * delimited and a trailing comma is allowed; values containing a comma or a
 * character invalid in Windows file names (notably `/` and `:` in the api URL
 * and in base64 keys) cannot be represented.
 */
export function buildPlainFileName(c: ClientServerConfig): FileNameResult {
  const parts = [`host=${c.host}`];
  if (c.key) parts.push(`key=${c.key}`);
  if (c.api) parts.push(`api=${c.api}`);
  if (c.relay) parts.push(`relay=${c.relay}`);
  const filename = `rustdesk-${parts.join(',')},.exe`;
  const bad = [c.host, c.key, c.api, c.relay].find(
    (v) => v.includes(',') || WINDOWS_FILENAME_BAD.test(v),
  );
  if (bad !== undefined) {
    return {
      filename,
      verified: false,
      reason:
        'A value contains a character that is not allowed in a Windows file name (for example "/" or ":"), so the readable file-name form cannot be used. Use the licensed form.',
    };
  }
  const ok = sameConfig(decodeFromFileName(filename), c);
  return ok
    ? { filename, verified: true }
    : { filename, verified: false, reason: 'Round-trip verification failed.' };
}

/* ---------------------------- validation ---------------------------- */

const HOSTNAME =
  /^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** host, IPv4, or [IPv6], each with an optional :port (1-65535). */
export function isValidHostPort(value: string): boolean {
  if (!value || value !== value.trim()) return false;
  let host = value;
  let port: string | undefined;
  if (value.startsWith('[')) {
    const m = /^\[([0-9A-Fa-f:.]+)\](?::(\d+))?$/.exec(value);
    if (!m || !m[1].includes(':')) return false;
    port = m[2];
    host = '';
  } else {
    const i = value.lastIndexOf(':');
    if (i >= 0) {
      host = value.slice(0, i);
      port = value.slice(i + 1);
      if (!/^\d+$/.test(port)) return false;
    }
  }
  if (port !== undefined) {
    const p = Number(port);
    if (!(p >= 1 && p <= 65535)) return false;
  }
  if (host === '') return value.startsWith('[');
  if (IPV4.test(host)) return true;
  // a hostname whose last label is all digits is a malformed IP, not a name
  return HOSTNAME.test(host) && !/(^|\.)\d+$/.test(host);
}

/** http(s)://host[:port][/path] with no query, fragment or trailing slash needed. */
export function normalizeApiUrl(value: string): string | null {
  const v = value.trim().replace(/\/+$/, '');
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.search || u.hash || u.username || u.password) return null;
    if (v.includes(',')) return null;
    return v;
  } catch {
    return null;
  }
}

/** A hbbs public key: standard base64 of exactly 32 bytes (ed25519 public key). */
export function isValidPublicKey(value: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return false;
  return Buffer.from(value, 'base64').length === 32;
}

/* --------------------------- install commands --------------------------- */

const shSingle = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;
const psSingle = (s: string) => `'${s.replaceAll("'", "''")}'`;

export interface InstallCommands {
  windowsPowerShell: string;
  windowsCmd: string;
  macos: string;
  linux: string;
}

/**
 * `--config` only works on an INSTALLED client and only as admin/root
 * (core_main.rs: `is_installed() && is_root()`); it overwrites key, host,
 * api and relay together (an empty relay clears a previously set one).
 */
export function buildInstallCommands(configString: string): InstallCommands {
  return {
    windowsPowerShell: `& "$env:ProgramFiles\\RustDesk\\rustdesk.exe" --config ${psSingle(configString)}`,
    windowsCmd: `"%ProgramFiles%\\RustDesk\\rustdesk.exe" --config "${configString}"`,
    macos: `sudo /Applications/RustDesk.app/Contents/MacOS/RustDesk --config ${shSingle(configString)}`,
    linux: `sudo rustdesk --config ${shSingle(configString)}`,
  };
}

/** `rustdesk://config/<string>` - mobile only and opt-in in the client. */
export function buildDeepLink(configString: string): string {
  return `rustdesk://config/${configString}`;
}
