import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { readFileSync } from 'fs';
import { SystemSetting } from '../settings/entities/system-setting.entity';
import { GeneralSettingsService } from '../settings/services/general-settings.service';
import { UpdateClientConfigDto } from './dto/client-config.dto';
import {
  ClientServerConfig,
  buildDeepLink,
  buildInstallCommands,
  buildLicensedFileName,
  buildPlainFileName,
  decodeConfigString,
  encodeConfigString,
  isValidHostPort,
  isValidPublicKey,
  normalizeApiUrl,
} from './client-config.codec';

const CATEGORY = 'client-config';
const K_ID = 'clientConfig.idServer';
const K_RELAYS = 'clientConfig.relayServers'; // JSON string[]
const K_PIN = 'clientConfig.pinRelay';
const K_API = 'clientConfig.apiServer';
const K_KEY = 'clientConfig.publicKey';
const ALL_KEYS = [K_ID, K_RELAYS, K_PIN, K_API, K_KEY];

const DEFAULT_RELAY_PORT = 21117;

export type KeySource = 'manual' | 'file' | 'none';

export interface ClientConfigSettings {
  idServer: string;
  relayServers: string[];
  pinRelay: boolean;
  apiServer: string;
  /** manual override only ('' when unset) */
  publicKey: string;
}

@Injectable()
export class ClientConfigService {
  private readonly logger = new Logger(ClientConfigService.name);

  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingRepository: Repository<SystemSetting>,
    private readonly generalSettings: GeneralSettingsService,
  ) {}

  /** Admin view of the stored settings plus where the effective key comes from. */
  async getSettings() {
    const s = await this.readSettings();
    const key = this.resolveKey(s.publicKey);
    return {
      ...s,
      effectiveKey: key.publicKey,
      keySource: key.source,
      keyFile: {
        configured: !!process.env.RUSTDESK_KEY_FILE,
        error: key.fileError,
      },
    };
  }

  async updateSettings(dto: UpdateClientConfigDto) {
    const cur = await this.readSettings();
    const next: ClientConfigSettings = { ...cur };
    const errors: string[] = [];

    if (dto.idServer !== undefined) {
      const v = dto.idServer.trim();
      if (v && !isValidHostPort(v))
        errors.push('idServer must be host[:port] (hostname, IPv4 or [IPv6])');
      next.idServer = v;
    }
    if (dto.relayServers !== undefined) {
      const seen = new Set<string>();
      for (const raw of dto.relayServers) {
        const v = raw.trim();
        if (!v) continue;
        if (!isValidHostPort(v)) {
          errors.push(`relay server "${raw}" must be host[:port]`);
          continue;
        }
        seen.add(v);
      }
      next.relayServers = [...seen];
    }
    if (dto.pinRelay !== undefined) next.pinRelay = dto.pinRelay;
    if (dto.apiServer !== undefined) {
      const v = dto.apiServer.trim();
      if (v) {
        const n = normalizeApiUrl(v);
        if (!n) errors.push('apiServer must be an http(s) URL');
        else next.apiServer = n;
      } else next.apiServer = '';
    }
    if (dto.publicKey !== undefined) {
      const v = dto.publicKey.trim();
      if (v && !isValidPublicKey(v))
        errors.push(
          'publicKey must be the base64 ed25519 public key (44 characters, id_ed25519.pub)',
        );
      next.publicKey = v;
    }
    if (next.pinRelay && next.relayServers.length !== 1) {
      errors.push(
        'pinRelay requires exactly one relay server: the client accepts a single relay host, so with several relays leave pinRelay off and let hbbs distribute them',
      );
    }
    if (errors.length) throw new BadRequestException(errors);

    const values: [string, string][] = [
      [K_ID, next.idServer],
      [K_RELAYS, JSON.stringify(next.relayServers)],
      [K_PIN, String(next.pinRelay)],
      [K_API, next.apiServer],
      [K_KEY, next.publicKey],
    ];
    const existing = await this.settingRepository.find({
      where: { key: In(ALL_KEYS) },
    });
    const byKey = new Map(existing.map((e) => [e.key, e]));
    await this.settingRepository.save(
      values.map(([key, value]) => {
        const row = byKey.get(key) || this.settingRepository.create({ key });
        row.value = value;
        row.category = CATEGORY;
        row.isSensitive = false;
        return row;
      }),
    );
    return this.getSettings();
  }

  /** Read-only artifacts for any logged-in user. Contains only public data. */
  async getSetup() {
    const s = await this.readSettings();
    const site = await this.generalSettings.getSiteSettings();
    const apiServer = s.apiServer || site.backendUrl || '';
    const key = this.resolveKey(s.publicKey);

    const missing: string[] = [];
    if (!s.idServer) missing.push('idServer');

    const relayPinned = s.pinRelay && s.relayServers.length === 1;
    const relayForClient = relayPinned ? s.relayServers[0] : '';

    const hbbsRelayArg = s.relayServers.length
      ? `-r ${s.relayServers.join(',')}`
      : '';
    const server = {
      idServer: s.idServer,
      relayServers: s.relayServers,
      relayPinned,
      apiServer,
      publicKey: key.publicKey,
      keySource: key.source,
    };
    const hbbs = {
      relayArgument: hbbsRelayArg,
      defaultRelayPort: DEFAULT_RELAY_PORT,
    };
    if (missing.length) {
      return { ready: false, missing, server, hbbs };
    }

    const cfg: ClientServerConfig = {
      key: key.publicKey,
      host: s.idServer,
      api: apiServer,
      relay: relayForClient,
    };
    const configString = encodeConfigString(cfg);
    // never hand out an artifact the client parser would not read back as intended
    const roundTrip = decodeConfigString(configString);
    if (!roundTrip || JSON.stringify(roundTrip) !== JSON.stringify(cfg)) {
      this.logger.error('config string failed round-trip verification');
      throw new BadRequestException('Generated config failed verification');
    }
    const warnings: string[] = [];
    if (!key.publicKey)
      warnings.push(
        'No public key is configured: clients will connect without encryption verification. Set RUSTDESK_KEY_FILE or enter the key manually.',
      );
    if (!apiServer)
      warnings.push(
        'No API server URL is set: clients will not register with the console (address book, strategies, audit).',
      );
    if (s.relayServers.length > 1)
      warnings.push(
        'Several relay servers: the relay is chosen by hbbs (-r list), not by the client config.',
      );
    const licensed = buildLicensedFileName(cfg);
    const plain = buildPlainFileName(cfg);
    return {
      ready: true,
      missing,
      warnings,
      server,
      hbbs,
      config: {
        string: configString,
        json: cfg,
        fileNames: { licensed, plain },
        deepLink: {
          url: buildDeepLink(configString),
          note: 'Mobile only. The client ignores it unless it was built with allow-deep-link-server-settings enabled.',
        },
        commands: buildInstallCommands(configString),
      },
    };
  }

  private async readSettings(): Promise<ClientConfigSettings> {
    const rows = await this.settingRepository.find({
      where: { key: In(ALL_KEYS) },
    });
    const m = new Map(rows.map((r) => [r.key, r.value]));
    let relayServers: string[] = [];
    try {
      const parsed: unknown = JSON.parse(m.get(K_RELAYS) || '[]');
      if (Array.isArray(parsed))
        relayServers = parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      relayServers = [];
    }
    return {
      idServer: m.get(K_ID) ?? '',
      relayServers,
      pinRelay: m.get(K_PIN) === 'true',
      apiServer: m.get(K_API) ?? '',
      publicKey: m.get(K_KEY) ?? '',
    };
  }

  /**
   * Manual override wins; otherwise the file named by RUSTDESK_KEY_FILE.
   * Only a value that is exactly a 32-byte ed25519 PUBLIC key is accepted, so
   * pointing the variable at the private key (64 bytes) is rejected and the
   * private key can never be echoed.
   */
  private resolveKey(manual: string): {
    publicKey: string;
    source: KeySource;
    fileError?: string;
  } {
    if (manual) return { publicKey: manual, source: 'manual' };
    const path = process.env.RUSTDESK_KEY_FILE;
    if (!path) return { publicKey: '', source: 'none' };
    try {
      const v = readFileSync(path, 'utf8').trim();
      if (!isValidPublicKey(v)) {
        return {
          publicKey: '',
          source: 'none',
          fileError:
            'RUSTDESK_KEY_FILE does not contain a 32-byte base64 public key (point it at id_ed25519.pub, never the private key)',
        };
      }
      return { publicKey: v, source: 'file' };
    } catch (e) {
      return {
        publicKey: '',
        source: 'none',
        fileError: `Cannot read RUSTDESK_KEY_FILE: ${(e as NodeJS.ErrnoException).code ?? 'error'}`,
      };
    }
  }
}
