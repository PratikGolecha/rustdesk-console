import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { RelayVerifyController } from './relay-verify.controller';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

describe('RelayVerifyController', () => {
  const validate = jest.fn();
  const controller = new RelayVerifyController({
    validateToken: validate,
  } as never);
  const original = process.env.RELAY_VERIFY_SECRET;

  afterEach(() => {
    validate.mockReset();
    if (original === undefined) delete process.env.RELAY_VERIFY_SECRET;
    else process.env.RELAY_VERIFY_SECRET = original;
  });

  it('is disabled without RELAY_VERIFY_SECRET', async () => {
    delete process.env.RELAY_VERIFY_SECRET;
    await expect(controller.verify({ token: 't' }, 'x')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a wrong or missing secret', async () => {
    process.env.RELAY_VERIFY_SECRET = 'relay-secret';
    await expect(controller.verify({ token: 't' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      controller.verify({ token: 't' }, 'nope'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(validate).not.toHaveBeenCalled();
  });

  it('returns valid=false for a bad token and claims for a good one', async () => {
    process.env.RELAY_VERIFY_SECRET = 'relay-secret';
    validate.mockResolvedValueOnce(null);
    await expect(
      controller.verify({ token: 'bad' }, 'relay-secret'),
    ).resolves.toEqual({ valid: false });
    validate.mockResolvedValueOnce({ sub: 'g1', username: 'alice' });
    await expect(
      controller.verify({ token: 'ok' }, 'relay-secret'),
    ).resolves.toEqual({
      valid: true,
      user_guid: 'g1',
      username: 'alice',
      device_id: null,
    });
  });
});
