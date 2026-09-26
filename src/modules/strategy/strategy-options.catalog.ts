/**
 * Strategy options catalog.
 *
 * The RustDesk client applies a strategy by merging `config_options` verbatim
 * into its persistent `Config2.options` map (rustdesk `src/hbbs_http/sync.rs`
 * `handle_config_options`). An empty value removes the option, so it falls
 * back to the built-in default. The client does not validate anything, so a
 * typo silently does nothing and a wrong value can lock users out. This
 * catalog is the console's own allow-list.
 *
 * Every key below was verified to exist as a literal in the client source:
 * rustdesk/rustdesk tag 1.4.9 (`src/`, `flutter/lib/consts.dart`) and
 * rustdesk/hbb_common master (`src/config.rs`, `src/password_security.rs`).
 * Only keys the client reads from the global `Config` options are listed;
 * per-peer keys (e.g. `force-always-relay`) and keys stored in `LocalConfig` /
 * `UserDefaultConfig` (view style, image quality, ...) are NOT settable by a
 * strategy, so they are deliberately absent (they need `allow_custom`).
 */

export const STRATEGY_OPTIONS_CATALOG_VERSION = 1;
export const STRATEGY_OPTIONS_CLIENT_VERSION =
  'rustdesk 1.4.9 + hbb_common master';

export type StrategyOptionType = 'bool' | 'enum' | 'int' | 'string';
export type StrategyOptionCategory =
  'permissions' | 'security' | 'network' | 'ui';

export interface StrategyOptionDef {
  key: string;
  category: StrategyOptionCategory;
  label: string;
  description: string;
  type: StrategyOptionType;
  /** enum only: accepted values (the empty string is always accepted). */
  values?: string[];
  /** int only. */
  min?: number;
  max?: number;
  /** Client behaviour when the option is unset/empty. */
  default: string;
  /** Where in the client the option takes effect. */
  feature: string;
}

const B = 'bool' as const;
const opt = (d: StrategyOptionDef): StrategyOptionDef => d;

export const STRATEGY_OPTIONS: StrategyOptionDef[] = [
  // ---- Permissions (controlled side; `enable-*` are on unless set to N) ----
  opt({
    key: 'access-mode',
    category: 'permissions',
    label: 'Access mode',
    description:
      'Desktop client: "full" grants every permission, "view" grants none (view only), "custom" uses the individual toggles.',
    type: 'enum',
    values: ['custom', 'full', 'view'],
    default: 'custom',
    feature: 'Incoming-session permissions (overrides the toggles below)',
  }),
  ...(
    [
      ['enable-keyboard', 'Keyboard and mouse', 'Remote keyboard/mouse input.'],
      ['enable-clipboard', 'Clipboard', 'Clipboard sync.'],
      ['enable-file-transfer', 'File transfer', 'File transfer sessions.'],
      ['enable-audio', 'Audio', 'Audio streaming.'],
      ['enable-camera', 'Camera', 'Remote camera viewing.'],
      ['enable-terminal', 'Terminal', 'Remote terminal sessions.'],
      ['enable-remote-printer', 'Remote printer', 'Remote printing.'],
      ['enable-tunnel', 'TCP tunneling', 'Port forwarding / tunnels.'],
      [
        'enable-remote-restart',
        'Remote restart',
        'Restarting the device remotely.',
      ],
      ['enable-record-session', 'Session recording', 'Recording sessions.'],
      ['enable-block-input', 'Block user input', 'Blocking local input.'],
    ] as const
  ).map(([key, label, description]) =>
    opt({
      key,
      category: 'permissions',
      label,
      description: `${description} On unless set to N.`,
      type: B,
      default: 'Y',
      feature: 'Incoming-session permission',
    }),
  ),
  opt({
    key: 'allow-remote-config-modification',
    category: 'permissions',
    label: 'Allow remote config modification',
    description:
      'Let a remote controller change this device settings during a session. Off unless set to Y.',
    type: B,
    default: 'N',
    feature: 'Remote settings modification',
  }),
  opt({
    key: 'allow-remove-wallpaper',
    category: 'permissions',
    label: 'Remove wallpaper during session',
    description: 'Hide the desktop wallpaper while a session is active.',
    type: B,
    default: 'N',
    feature: 'Incoming session',
  }),

  // ---- Security ----
  opt({
    key: 'approve-mode',
    category: 'security',
    label: 'Approve mode',
    description:
      '"password": a valid password is enough. "click": a person must accept every incoming session. "password-click" (or empty): either.',
    type: 'enum',
    values: ['password', 'click', 'password-click'],
    default: 'password-click',
    feature: 'Incoming-session approval',
  }),
  opt({
    key: 'verification-method',
    category: 'security',
    label: 'Verification method',
    description:
      'Which password types are accepted: one-time (temporary), permanent or both.',
    type: 'enum',
    values: [
      'use-temporary-password',
      'use-permanent-password',
      'use-both-passwords',
    ],
    default: 'use-both-passwords',
    feature: 'Password verification',
  }),
  opt({
    key: 'temporary-password-length',
    category: 'security',
    label: 'One-time password length',
    description: 'Length of the generated one-time password.',
    type: 'enum',
    values: ['6', '8', '10'],
    default: '6',
    feature: 'Password generation',
  }),
  opt({
    key: 'allow-numeric-one-time-password',
    category: 'security',
    label: 'Numeric one-time password',
    description: 'Generate digits-only one-time passwords.',
    type: B,
    default: 'N',
    feature: 'Password generation',
  }),
  opt({
    key: 'whitelist',
    category: 'security',
    label: 'Allowed IPs (whitelist)',
    description:
      'Comma-separated IPs or CIDR ranges allowed to connect directly. Empty or 0.0.0.0 allows all. Applies to direct connections only, not to relayed sessions.',
    type: 'string',
    default: '',
    feature: 'Incoming connection filter',
  }),
  opt({
    key: 'allow-auto-disconnect',
    category: 'security',
    label: 'Disconnect idle sessions',
    description: 'Close a session after a period without input.',
    type: B,
    default: 'N',
    feature: 'Session idle timeout',
  }),
  opt({
    key: 'auto-disconnect-timeout',
    category: 'security',
    label: 'Idle timeout (minutes)',
    description: 'Minutes of inactivity before disconnecting (0 means 10).',
    type: 'int',
    min: 1,
    max: 1440,
    default: '10',
    feature: 'Session idle timeout',
  }),
  opt({
    key: 'allow-only-conn-window-open',
    category: 'security',
    label: 'Accept only if the connection window is open',
    description:
      'Refuse incoming sessions unless the local RustDesk window is open.',
    type: B,
    default: 'N',
    feature: 'Incoming-session approval',
  }),
  opt({
    key: 'allow-hide-cm',
    category: 'security',
    label: 'Hide connection manager',
    description:
      'Hide the connection window. The client only honours it with approve-mode=password AND verification-method=use-permanent-password.',
    type: B,
    default: 'N',
    feature: 'Connection manager window',
  }),
  opt({
    key: 'enable-trusted-devices',
    category: 'security',
    label: 'Trusted devices (skip 2FA)',
    description: 'Allow remembering trusted devices for two-factor login.',
    type: B,
    default: 'Y',
    feature: '2FA',
  }),
  opt({
    key: 'allow-insecure-tls-fallback',
    category: 'security',
    label: 'Allow insecure TLS fallback',
    description:
      'Permit falling back to unverified TLS to the server. Leave off.',
    type: B,
    default: 'N',
    feature: 'Server TLS',
  }),
  opt({
    key: 'disable-change-permanent-password',
    category: 'security',
    label: 'Lock permanent password',
    description: 'Prevent users changing the permanent password in the UI.',
    type: B,
    default: 'N',
    feature: 'Settings UI lock',
  }),
  opt({
    key: 'disable-change-id',
    category: 'security',
    label: 'Lock device ID',
    description: 'Prevent users changing the device ID in the UI.',
    type: B,
    default: 'N',
    feature: 'Settings UI lock',
  }),
  opt({
    key: 'disable-unlock-pin',
    category: 'security',
    label: 'Disable unlock PIN',
    description: 'Disable the settings unlock PIN feature.',
    type: B,
    default: 'N',
    feature: 'Settings UI lock',
  }),

  // ---- Network ----
  opt({
    key: 'allow-websocket',
    category: 'network',
    label: 'Use WebSocket (always relayed)',
    description:
      'Client uses WebSocket to the server and relays every session, incoming and outgoing (client: use_ws() forces relay). The relay must expose the WebSocket ports.',
    type: B,
    default: 'N',
    feature: 'Transport / forced relay',
  }),
  opt({
    key: 'disable-udp',
    category: 'network',
    label: 'Disable UDP',
    description: 'Use TCP only for rendezvous. Does not force relaying.',
    type: B,
    default: 'N',
    feature: 'Transport',
  }),
  opt({
    key: 'direct-server',
    category: 'network',
    label: 'Enable direct IP access',
    description: 'Listen for direct IP connections.',
    type: B,
    default: 'N',
    feature: 'Direct server',
  }),
  opt({
    key: 'direct-access-port',
    category: 'network',
    label: 'Direct access port',
    description: 'TCP port for direct IP access.',
    type: 'int',
    min: 1,
    max: 65535,
    default: '21118',
    feature: 'Direct server',
  }),
  opt({
    key: 'enable-lan-discovery',
    category: 'network',
    label: 'LAN discovery',
    description: 'Answer LAN discovery broadcasts. On unless set to N.',
    type: B,
    default: 'Y',
    feature: 'LAN discovery',
  }),
  opt({
    key: 'enable-udp-punch',
    category: 'network',
    label: 'UDP hole punching',
    description: 'Attempt direct UDP hole punching.',
    type: B,
    default: 'Y',
    feature: 'NAT traversal',
  }),
  opt({
    key: 'enable-ipv6-punch',
    category: 'network',
    label: 'IPv6 hole punching',
    description: 'Attempt direct IPv6 hole punching.',
    type: B,
    default: 'Y',
    feature: 'NAT traversal',
  }),

  // ---- UI / behaviour ----
  opt({
    key: 'enable-check-update',
    category: 'ui',
    label: 'Check for updates',
    description: 'Show update notifications.',
    type: B,
    default: 'Y',
    feature: 'Updates',
  }),
  opt({
    key: 'allow-auto-update',
    category: 'ui',
    label: 'Automatic updates',
    description: 'Download and install updates automatically.',
    type: B,
    default: 'N',
    feature: 'Updates',
  }),
  opt({
    key: 'allow-auto-record-incoming',
    category: 'ui',
    label: 'Auto-record incoming sessions',
    description: 'Record every incoming session on this device.',
    type: B,
    default: 'N',
    feature: 'Recording',
  }),
  opt({
    key: 'allow-auto-record-outgoing',
    category: 'ui',
    label: 'Auto-record outgoing sessions',
    description: 'Record every outgoing session from this device.',
    type: B,
    default: 'N',
    feature: 'Recording',
  }),
  opt({
    key: 'keep-awake-during-incoming-sessions',
    category: 'ui',
    label: 'Keep awake during incoming sessions',
    description: 'Prevent the device sleeping while controlled.',
    type: B,
    default: 'Y',
    feature: 'Power',
  }),
  opt({
    key: 'allow-always-software-render',
    category: 'ui',
    label: 'Always software render',
    description: 'Disable GPU rendering in the client UI.',
    type: B,
    default: 'N',
    feature: 'Rendering',
  }),
];

/**
 * Keys that must never be pushed by a strategy, even with `allow_custom`:
 * they would re-point clients at another server, leak credentials or corrupt
 * the strategy sync itself.
 */
export const STRATEGY_BLOCKED_KEYS: Record<string, string> = {
  'custom-rendezvous-server':
    'would re-point clients away from this server and cut them off',
  'relay-server': 'would re-point clients away from this relay',
  'api-server': 'would re-point clients away from this console',
  key: 'server public key; wrong value breaks every connection',
  'proxy-url': 'proxy settings carry credentials; configure on the client',
  'proxy-username': 'proxy settings carry credentials; configure on the client',
  'proxy-password': 'proxy settings carry credentials; configure on the client',
  access_token: 'login credential of the client',
  user_info: 'login identity of the client',
  strategy_timestamp: 'internal strategy sync marker',
  password: 'credential',
  salt: 'credential',
};

export interface StrategyPresetDef {
  id: string;
  label: string;
  description: string;
  options: Record<string, string>;
}

export const STRATEGY_PRESETS: StrategyPresetDef[] = [
  {
    id: 'locked_down',
    label: 'Locked down',
    description:
      'Every session must be accepted by a person on the device; file transfer, terminal, tunnels, printing, camera, recording and remote restart off; idle sessions close after 10 minutes.',
    options: {
      'approve-mode': 'click',
      'enable-file-transfer': 'N',
      'enable-terminal': 'N',
      'enable-tunnel': 'N',
      'enable-remote-printer': 'N',
      'enable-camera': 'N',
      'enable-record-session': 'N',
      'enable-remote-restart': 'N',
      'allow-remote-config-modification': 'N',
      'allow-auto-disconnect': 'Y',
      'auto-disconnect-timeout': '10',
      'enable-lan-discovery': 'N',
      'direct-server': 'N',
      'allow-insecure-tls-fallback': 'N',
      'allow-hide-cm': 'N',
      'disable-change-permanent-password': 'Y',
      'disable-change-id': 'Y',
    },
  },
  {
    id: 'standard_office',
    label: 'Standard office',
    description:
      'Password or click approval, 8-character one-time passwords, no tunnels or remote config changes, LAN discovery and direct IP off, idle sessions close after 30 minutes.',
    options: {
      'approve-mode': 'password-click',
      'verification-method': 'use-both-passwords',
      'temporary-password-length': '8',
      'enable-tunnel': 'N',
      'allow-remote-config-modification': 'N',
      'enable-lan-discovery': 'N',
      'direct-server': 'N',
      'allow-auto-disconnect': 'Y',
      'auto-disconnect-timeout': '30',
      'disable-change-id': 'Y',
    },
  },
  {
    id: 'support_desk',
    label: 'Support desk',
    description:
      'Attended support: a person accepts each session, every permission is on (incl. terminal and remote restart), incoming sessions are recorded on the device, idle sessions close after 60 minutes.',
    options: {
      'approve-mode': 'click',
      'access-mode': 'full',
      'enable-file-transfer': 'Y',
      'enable-clipboard': 'Y',
      'enable-audio': 'Y',
      'enable-terminal': 'Y',
      'enable-remote-restart': 'Y',
      'enable-block-input': 'Y',
      'allow-auto-record-incoming': 'Y',
      'allow-auto-disconnect': 'Y',
      'auto-disconnect-timeout': '60',
    },
  },
];

const CATALOG_BY_KEY = new Map(STRATEGY_OPTIONS.map((o) => [o.key, o]));

export const CUSTOM_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_OPTIONS = 200;
const MAX_VALUE_LENGTH = 1024;
const CIDR_OR_IP =
  /^(\d{1,3}(\.\d{1,3}){3})(\/\d{1,2})?$|^[0-9a-fA-F:]+(\/\d{1,3})?$/;

export interface StrategyOptionIssue {
  key: string;
  reason: string;
}

function validateValue(def: StrategyOptionDef, value: string): string | null {
  // The empty string is meaningful to the client: it removes the option.
  if (value === '') return null;
  switch (def.type) {
    case 'bool':
      return value === 'Y' || value === 'N' ? null : 'must be "Y" or "N"';
    case 'enum':
      return def.values?.includes(value)
        ? null
        : `must be one of: ${def.values?.join(', ')}`;
    case 'int': {
      if (!/^\d+$/.test(value)) return 'must be a whole number';
      const n = Number(value);
      if (def.min !== undefined && n < def.min) return `must be >= ${def.min}`;
      if (def.max !== undefined && n > def.max) return `must be <= ${def.max}`;
      return null;
    }
    case 'string':
      if (value.length > MAX_VALUE_LENGTH) return 'too long';
      if (def.key === 'whitelist') {
        const bad = value
          .split(',')
          .filter((x) => x !== '')
          .find((x) => !CIDR_OR_IP.test(x.trim()) || x.trim() !== x);
        if (bad !== undefined)
          return `"${bad}" is not an IP or CIDR (comma-separated, no spaces)`;
      }
      return null;
  }
}

/**
 * Validate a strategy `config_options` map. Returns all problems found.
 * Unknown keys are only accepted when `allowCustom` is true (the key syntax
 * and the blocked list still apply). Values must always be strings.
 */
export function validateConfigOptions(
  options: Record<string, unknown> | undefined,
  allowCustom = false,
): StrategyOptionIssue[] {
  const issues: StrategyOptionIssue[] = [];
  if (!options) return issues;
  const entries = Object.entries(options);
  if (entries.length > MAX_OPTIONS) {
    return [{ key: '*', reason: `at most ${MAX_OPTIONS} options` }];
  }
  for (const [key, value] of entries) {
    if (typeof value !== 'string') {
      issues.push({ key, reason: 'value must be a string' });
      continue;
    }
    if (key in STRATEGY_BLOCKED_KEYS) {
      issues.push({
        key,
        reason: `not allowed: ${STRATEGY_BLOCKED_KEYS[key]}`,
      });
      continue;
    }
    const def = CATALOG_BY_KEY.get(key);
    if (!def) {
      if (!allowCustom) {
        issues.push({
          key,
          reason: 'unknown option (send allow_custom=true to push custom keys)',
        });
      } else if (!CUSTOM_KEY_PATTERN.test(key)) {
        issues.push({ key, reason: 'invalid key name' });
      } else if (value.length > MAX_VALUE_LENGTH) {
        issues.push({ key, reason: 'too long' });
      }
      continue;
    }
    const reason = validateValue(def, value);
    if (reason) issues.push({ key, reason });
  }
  return issues;
}

export function getStrategyOptionsCatalog() {
  return {
    version: STRATEGY_OPTIONS_CATALOG_VERSION,
    client_version: STRATEGY_OPTIONS_CLIENT_VERSION,
    categories: ['permissions', 'security', 'network', 'ui'],
    options: STRATEGY_OPTIONS,
    presets: STRATEGY_PRESETS,
    blocked_keys: Object.keys(STRATEGY_BLOCKED_KEYS),
  };
}
