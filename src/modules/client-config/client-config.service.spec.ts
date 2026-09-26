import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { SystemSetting } from '../settings/entities/system-setting.entity';
import { ClientConfigService } from './client-config.service';
import { decodeConfigString, decodeFromFileName } from './client-config.codec';

const PUB = '5Qbwsde3unUcJBtrx9ZkvUmwFNoExHzpryHuPUdqlWM=';

describe('ClientConfigService', () => {
  let ds: DataSource;
  let svc: ClientConfigService;
  const general = {
    getSiteSettings: jest.fn().mockResolvedValue({ backendUrl: '' }),
  };

  beforeEach(async () => {
    delete process.env.RUSTDESK_KEY_FILE;
    ds = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: [SystemSetting],
    });
    await ds.initialize();
    svc = new ClientConfigService(
      ds.getRepository(SystemSetting),
      general as never,
    );
  });
  afterEach(async () => {
    delete process.env.RUSTDESK_KEY_FILE;
    await ds.destroy();
  });

  it('is not ready until an ID server is set', async () => {
    const r = await svc.getSetup();
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(['idServer']);
  });

  it('reads the key from RUSTDESK_KEY_FILE and generates decodable output', async () => {
    const f = join(mkdtempSync(join(tmpdir(), 'kf-')), 'id_ed25519.pub');
    writeFileSync(f, PUB + '\n');
    process.env.RUSTDESK_KEY_FILE = f;
    await svc.updateSettings({
      idServer: 'id.example.com',
      relayServers: ['r1.example.com:21117', 'r2.example.com'],
      apiServer: 'https://console.example.com/',
    });
    const r = await svc.getSetup();
    if (!r.ready) throw new Error('not ready');
    expect(r.server.keySource).toBe('file');
    const dec = decodeConfigString(r.config!.string);
    expect(dec).toEqual({
      key: PUB,
      host: 'id.example.com',
      api: 'https://console.example.com',
      relay: '', // several relays => not pinned
    });
    expect(decodeFromFileName(r.config!.fileNames.licensed.filename)).toEqual(
      dec,
    );
    expect(r.hbbs.relayArgument).toBe('-r r1.example.com:21117,r2.example.com');
  });

  it('never accepts a private key file (64 bytes)', async () => {
    const f = join(mkdtempSync(join(tmpdir(), 'kf-')), 'id_ed25519');
    writeFileSync(f, Buffer.alloc(64, 7).toString('base64'));
    process.env.RUSTDESK_KEY_FILE = f;
    const s = await svc.getSettings();
    expect(s.effectiveKey).toBe('');
    expect(s.keyFile.error).toMatch(/public key/);
  });

  it('manual key overrides the file', async () => {
    await svc.updateSettings({ idServer: 'id.example.com', publicKey: PUB });
    expect((await svc.getSettings()).keySource).toBe('manual');
  });

  it('validates input and pin rules', async () => {
    await expect(
      svc.updateSettings({ relayServers: ['bad host'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.updateSettings({
        relayServers: ['a.example.com', 'b.example.com'],
        pinRelay: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await svc.updateSettings({
      idServer: 'id.example.com',
      relayServers: ['a.example.com'],
      pinRelay: true,
    });
    const r = await svc.getSetup();
    expect(decodeConfigString(r.config!.string)!.relay).toBe('a.example.com');
  });
});
