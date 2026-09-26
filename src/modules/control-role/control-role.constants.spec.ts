import {
  decodeControlPermissions,
  encodeControlPermissions,
} from './control-role.constants';

describe('control permission bitmap', () => {
  it('encodes 2 bits per permission index (1=deny, 2=allow)', () => {
    // keyboard=index0, file=index3, terminal=index6
    expect(encodeControlPermissions({ keyboard: 'deny' })).toBe(1);
    expect(encodeControlPermissions({ keyboard: 'allow' })).toBe(2);
    expect(encodeControlPermissions({ file: 'deny' })).toBe(1 << 6);
    expect(encodeControlPermissions({ terminal: 'deny', file: 'deny' })).toBe(
      (1 << 12) + (1 << 6),
    );
    expect(encodeControlPermissions({ clipboard: 'default' })).toBe(0);
  });

  it('round-trips', () => {
    const map = {
      file: 'deny',
      privacy_mode: 'allow',
      tunnel: 'deny',
    } as const;
    expect(decodeControlPermissions(encodeControlPermissions(map))).toEqual(
      map,
    );
  });
});
