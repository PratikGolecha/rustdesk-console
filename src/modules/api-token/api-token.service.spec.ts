import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ApiTokenService } from './api-token.service';
import { ApiToken } from './entities/api-token.entity';
import { User, UserStatus } from '../user/entities/user.entity';

jest.mock('uuid', () => ({ v4: () => 'guid-1' }));

describe('ApiTokenService', () => {
  let rows: ApiToken[];
  let owner: Partial<User>;
  let service: ApiTokenService;

  beforeEach(() => {
    rows = [];
    owner = {
      guid: 'u1',
      username: 'admin',
      email: null,
      isAdmin: true,
      status: UserStatus.ACTIVE,
    };
    const tokenRepo = {
      create: (value: Partial<ApiToken>) => value as ApiToken,
      save: (row: ApiToken) => {
        rows.push(row);
        return Promise.resolve(row);
      },
      findOne: ({ where }: { where: Partial<ApiToken> }) =>
        Promise.resolve(rows.find((r) => r.tokenId === where.tokenId) ?? null),
      update: () => Promise.resolve(),
    };
    const userRepo = { findOne: () => Promise.resolve(owner) };
    service = new ApiTokenService(tokenRepo as never, userRepo as never);
  });

  const create = (extra: object = {}) =>
    service.create('u1', { name: 't', scopes: ['assign'], ...extra });

  it('stores only a hash and returns the plaintext once', async () => {
    const created = await create();
    expect(created.token.startsWith('rdc_')).toBe(true);
    expect(rows[0].tokenHash).not.toContain(created.token);
    expect(JSON.stringify(rows[0])).not.toContain(created.token);
  });

  it('authenticates a valid token and expands implied scopes', async () => {
    const { token } = await service.create('u1', {
      name: 'm',
      scopes: ['manage'],
    });
    const principal = await service.authenticate(token, 'assign', '1.1.1.1');
    expect(principal.id).toBe('u1');
    expect(principal.apiTokenScopes).toEqual(
      expect.arrayContaining(['manage', 'read', 'assign']),
    );
  });

  it('rejects wrong secret, revoked, expired, disabled owner', async () => {
    const { token } = await create();
    await expect(
      service.authenticate(token.slice(0, -1) + 'x', 'assign', 'ip'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    rows[0].revokedAt = new Date();
    await expect(
      service.authenticate(token, 'assign', 'ip2'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    rows[0].revokedAt = null;
    rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(
      service.authenticate(token, 'assign', 'ip3'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    rows[0].expiresAt = null;
    owner.status = UserStatus.DISABLED;
    await expect(
      service.authenticate(token, 'assign', 'ip4'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects insufficient scope with 403', async () => {
    const { token } = await create();
    await expect(
      service.authenticate(token, 'read', 'ip'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('answers 429 after repeated failures but never blocks valid tokens', async () => {
    const { token } = await create();
    let last: unknown;
    for (let i = 0; i < 12; i++) {
      last = await service
        .authenticate('rdc_' + '0'.repeat(16) + '_bad', 'assign', 'ipX')
        .catch((e: unknown) => e);
    }
    expect(last).toBeInstanceOf(HttpException);
    expect((last as HttpException).getStatus()).toBe(429);
    await expect(
      service.authenticate(token, 'assign', 'ipX'),
    ).resolves.toBeDefined();
  });

  it('rejects past expiry on create', async () => {
    await expect(
      create({ expires_at: '2020-01-01T00:00:00Z' }),
    ).rejects.toThrow('future');
  });
});
