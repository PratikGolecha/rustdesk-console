import {
  STRATEGY_BLOCKED_KEYS,
  STRATEGY_OPTIONS,
  STRATEGY_PRESETS,
  getStrategyOptionsCatalog,
  validateConfigOptions,
} from './strategy-options.catalog';

describe('strategy options catalog', () => {
  it('has unique keys and every enum has values', () => {
    const keys = STRATEGY_OPTIONS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const o of STRATEGY_OPTIONS) {
      if (o.type === 'enum') expect(o.values?.length).toBeGreaterThan(0);
      expect(o.key in STRATEGY_BLOCKED_KEYS).toBe(false);
    }
  });

  it('ships presets that pass validation without allow_custom', () => {
    expect(STRATEGY_PRESETS.map((p) => p.id)).toEqual([
      'locked_down',
      'standard_office',
      'support_desk',
    ]);
    for (const p of STRATEGY_PRESETS) {
      expect(validateConfigOptions(p.options, false)).toEqual([]);
    }
  });

  it('accepts valid values and the empty string (reset)', () => {
    expect(
      validateConfigOptions({
        'approve-mode': 'click',
        'enable-keyboard': 'N',
        'auto-disconnect-timeout': '15',
        whitelist: '10.0.0.0/8,192.168.1.5',
        'verification-method': '',
      }),
    ).toEqual([]);
  });

  it('rejects invalid values', () => {
    const issues = validateConfigOptions({
      'approve-mode': 'sometimes',
      'enable-keyboard': 'yes',
      'auto-disconnect-timeout': '0',
      'direct-access-port': '70000',
      whitelist: 'not an ip',
    });
    expect(issues.map((i) => i.key).sort()).toEqual([
      'approve-mode',
      'auto-disconnect-timeout',
      'direct-access-port',
      'enable-keyboard',
      'whitelist',
    ]);
  });

  it('rejects non-string values', () => {
    expect(
      validateConfigOptions({ 'enable-keyboard': true as unknown as string }),
    ).toHaveLength(1);
  });

  it('rejects unknown keys unless allow_custom, but never blocked keys', () => {
    expect(validateConfigOptions({ 'view-style': 'adaptive' })).toHaveLength(1);
    expect(
      validateConfigOptions({ 'view-style': 'adaptive' }, true),
    ).toHaveLength(0);
    expect(validateConfigOptions({ 'bad key!': 'x' }, true)[0]?.reason).toMatch(
      /invalid key/,
    );
    expect(
      validateConfigOptions({ 'custom-rendezvous-server': 'evil:21116' }, true),
    ).toHaveLength(1);
  });

  it('exposes a versioned catalog', () => {
    const c = getStrategyOptionsCatalog();
    expect(c.version).toBe(1);
    expect(c.options.length).toBe(STRATEGY_OPTIONS.length);
  });
});
