/**
 * Control permissions understood by the RustDesk client
 * (hbb_common `rendezvous.proto`, `ControlPermissions.Permission`).
 *
 * The relay (hbbs) forwards a `ControlPermissions { permissions: uint64 }` to the
 * CONTROLLED device when a connection is set up. The controlled client stores two
 * bits per permission (client `get_control_permission`):
 *   0 = not set (device's own local setting applies)
 *   1 = disabled for this connection
 *   2 = enabled for this connection (overrides a locally disabled option!)
 * The enum value is the permission index; bits are at (index * 2).
 */
export const CONTROL_PERMISSION_KEYS = [
  'keyboard',
  'remote_printer',
  'clipboard',
  'file',
  'audio',
  'camera',
  'terminal',
  'tunnel',
  'restart',
  'recording',
  'block_input',
  'remote_modify',
  'privacy_mode',
] as const;

export type ControlPermissionKey = (typeof CONTROL_PERMISSION_KEYS)[number];

/** default = leave to the device's own setting, allow = force on, deny = force off */
export const CONTROL_PERMISSION_VALUES = ['default', 'allow', 'deny'] as const;
export type ControlPermissionValue = (typeof CONTROL_PERMISSION_VALUES)[number];

export type ControlPermissionMap = Partial<
  Record<ControlPermissionKey, ControlPermissionValue>
>;

/** Encode a role's permission map into the client's u64 bitmap (safe as a JS number: max 26 bits). */
export function encodeControlPermissions(map: ControlPermissionMap): number {
  let bits = 0;
  CONTROL_PERMISSION_KEYS.forEach((key, index) => {
    const value = map[key];
    const code = value === 'deny' ? 1 : value === 'allow' ? 2 : 0;
    bits += code * 2 ** (index * 2);
  });
  return bits;
}

export function decodeControlPermissions(bits: number): ControlPermissionMap {
  const map: ControlPermissionMap = {};
  CONTROL_PERMISSION_KEYS.forEach((key, index) => {
    const code = Math.floor(bits / 2 ** (index * 2)) % 4;
    if (code === 1) map[key] = 'deny';
    else if (code === 2) map[key] = 'allow';
  });
  return map;
}
