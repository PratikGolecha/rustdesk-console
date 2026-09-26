import { HeartbeatService } from './heartbeat.service';

// StrategyService pulls in the ESM-only `uuid` package, which Jest cannot load; it is mocked here anyway.
jest.mock('../strategy/strategy.service', () => ({
  StrategyService: class {},
}));

describe('HeartbeatService sysinfo request', () => {
  const build = (sysinfoCount: number) => {
    const peerRepository = {
      findOne: jest.fn().mockResolvedValue({ uuid: 'u1' }),
      update: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const sysinfoRepository = {
      count: jest.fn().mockResolvedValue(sysinfoCount),
    };
    const disconnectStore = {
      getPendingDisconnects: jest.fn().mockReturnValue([]),
      removeDisconnected: jest.fn(),
    };
    const strategyService = {
      findStrategyForDevice: jest.fn().mockResolvedValue(null),
    };
    return new HeartbeatService(
      peerRepository as any,
      {} as any,
      sysinfoRepository as any,
      disconnectStore as any,
      strategyService as any,
    );
  };
  const dto = { id: '1', uuid: 'u1', ver: 1, modified_at: 0 } as any;

  it('asks the client to upload system info when none is stored', async () => {
    const res = await build(0).handleHeartbeat(dto);
    expect(res).toMatchObject({ sysinfo: true });
  });

  it('does not ask when system info already exists', async () => {
    const res = await build(1).handleHeartbeat(dto);
    expect(res).not.toHaveProperty('sysinfo');
  });
});
