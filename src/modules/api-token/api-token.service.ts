import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { User, UserStatus } from '../user/entities/user.entity';
import { ApiToken } from './entities/api-token.entity';
import { CreateApiTokenDto } from './dto/api-token.dto';
import {
  API_TOKEN_PREFIX,
  API_TOKEN_SCOPES,
  ApiTokenScope,
  IMPLIED_SCOPES,
} from './decorators/allow-api-token.decorator';

/** Identity attached to `request.user` for token-authenticated requests. */
export interface ApiTokenPrincipal {
  id: string;
  username: string;
  email: string | null;
  isAdmin: boolean;
  apiTokenGuid: string;
  apiTokenName: string;
  apiTokenScopes: ApiTokenScope[];
}

const TOKEN_ID_HEX_LENGTH = 16;
const FAIL_WINDOW_MS = 60_000;
const MAX_FAILURES_PER_WINDOW = 10;
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

@Injectable()
export class ApiTokenService {
  /** ip -> timestamps of recent failed token authentications */
  private readonly failures = new Map<string, number[]>();

  constructor(
    @InjectRepository(ApiToken)
    private readonly tokenRepository: Repository<ApiToken>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  static looksLikeApiToken(value: string | undefined | null): boolean {
    return !!value && value.startsWith(API_TOKEN_PREFIX);
  }

  /** Return `expandedScopes` = declared scopes plus the ones they imply. */
  static expandScopes(scopes: string[]): ApiTokenScope[] {
    const result = new Set<ApiTokenScope>();
    for (const scope of scopes as ApiTokenScope[]) {
      if (!API_TOKEN_SCOPES.includes(scope)) continue;
      result.add(scope);
      for (const implied of IMPLIED_SCOPES[scope]) result.add(implied);
    }
    return [...result];
  }

  async create(ownerGuid: string, dto: CreateApiTokenDto) {
    let expiresAt: Date | null = null;
    if (dto.expires_at) {
      expiresAt = new Date(dto.expires_at);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
        throw new BadRequestException('expires_at must be in the future');
      }
    }
    const scopes = [...new Set(dto.scopes)];
    const tokenId = randomBytes(TOKEN_ID_HEX_LENGTH / 2).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const token = `${API_TOKEN_PREFIX}${tokenId}_${secret}`;
    const entity = this.tokenRepository.create({
      guid: uuidv4(),
      userGuid: ownerGuid,
      name: dto.name.trim(),
      tokenId,
      tokenHash: this.hash(token),
      scopes: scopes.join(','),
      expiresAt,
      revokedAt: null,
      lastUsedAt: null,
      lastUsedIp: null,
    });
    await this.tokenRepository.save(entity);
    return { ...(await this.present(entity)), token };
  }

  async list() {
    const rows = await this.tokenRepository.find({
      order: { createdAt: 'DESC' },
    });
    const owners = new Map<string, string>();
    for (const guid of new Set(rows.map((row) => row.userGuid))) {
      const user = await this.userRepository.findOne({ where: { guid } });
      if (user) owners.set(guid, user.username);
    }
    return {
      data: rows.map((row) => this.toView(row, owners.get(row.userGuid))),
      total: rows.length,
    };
  }

  async revoke(guid: string) {
    const token = await this.tokenRepository.findOne({ where: { guid } });
    if (!token) throw new NotFoundException('API token does not exist');
    if (!token.revokedAt) {
      token.revokedAt = new Date();
      await this.tokenRepository.save(token);
    }
    return { message: 'API token revoked' };
  }

  private async present(row: ApiToken) {
    const owner = await this.userRepository.findOne({
      where: { guid: row.userGuid },
    });
    return this.toView(row, owner?.username);
  }

  private toView(row: ApiToken, ownerName?: string) {
    const now = new Date();
    const status = row.revokedAt
      ? 'revoked'
      : row.expiresAt && row.expiresAt <= now
        ? 'expired'
        : 'active';
    return {
      guid: row.guid,
      name: row.name,
      token_prefix: `${API_TOKEN_PREFIX}${row.tokenId}`,
      scopes: row.scopes.split(',').filter(Boolean),
      owner_guid: row.userGuid,
      owner_name: ownerName ?? null,
      status,
      expires_at: row.expiresAt,
      revoked_at: row.revokedAt,
      last_used_at: row.lastUsedAt,
      last_used_ip: row.lastUsedIp,
      created_at: row.createdAt,
    };
  }

  private registerFailure(ip: string): void {
    const now = Date.now();
    const recent = (this.failures.get(ip) || []).filter(
      (time) => now - time < FAIL_WINDOW_MS,
    );
    recent.push(now);
    this.failures.set(ip, recent);
    if (this.failures.size > 10_000) this.failures.clear();
  }

  /**
   * Record a failed attempt; once an IP exceeds the budget its failures are
   * answered with 429. Valid tokens are never blocked by this limiter, so a
   * noisy client behind a shared proxy IP cannot lock legitimate assigns out.
   */
  private failedAttempt(ip: string): never {
    this.registerFailure(ip);
    const recent = this.failures.get(ip) || [];
    if (recent.length > MAX_FAILURES_PER_WINDOW) {
      throw new HttpException(
        'Too many failed API token attempts, try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    throw new UnauthorizedException('Invalid API token');
  }

  /**
   * Authenticate a presented token for a route requiring `requiredScope`.
   * All failure modes return the same generic 401 to avoid an oracle for
   * which part was wrong (revoked / expired are distinguishable only to the
   * owner via the token list).
   */
  async authenticate(
    presented: string,
    requiredScope: ApiTokenScope,
    ip: string,
  ): Promise<ApiTokenPrincipal> {
    const fail = (): never => this.failedAttempt(ip);

    const body = presented.slice(API_TOKEN_PREFIX.length);
    const tokenId = body.slice(0, TOKEN_ID_HEX_LENGTH);
    if (
      !/^[0-9a-f]+$/.test(tokenId) ||
      tokenId.length !== TOKEN_ID_HEX_LENGTH ||
      body.charAt(TOKEN_ID_HEX_LENGTH) !== '_' ||
      presented.length > 256
    ) {
      return fail();
    }
    const row = await this.tokenRepository.findOne({ where: { tokenId } });
    // Hash even on miss so timing does not reveal whether the id exists.
    const presentedHash = Buffer.from(this.hash(presented), 'hex');
    const storedHash = Buffer.from(row?.tokenHash ?? '0'.repeat(64), 'hex');
    const matches =
      presentedHash.length === storedHash.length &&
      timingSafeEqual(presentedHash, storedHash);
    if (!row || !matches) return fail();
    if (row.revokedAt) return fail();
    if (row.expiresAt && row.expiresAt <= new Date()) return fail();

    const owner = await this.userRepository.findOne({
      where: { guid: row.userGuid },
    });
    if (!owner || owner.status !== UserStatus.ACTIVE) return fail();

    const scopes = ApiTokenService.expandScopes(row.scopes.split(','));
    if (!scopes.includes(requiredScope)) {
      // Authentic token, wrong scope: 403 rather than a failure count.
      throw new HttpException(
        `API token lacks the required scope: ${requiredScope}`,
        HttpStatus.FORBIDDEN,
      );
    }

    const now = new Date();
    if (
      !row.lastUsedAt ||
      now.getTime() - row.lastUsedAt.getTime() > LAST_USED_WRITE_INTERVAL_MS ||
      row.lastUsedIp !== ip
    ) {
      await this.tokenRepository.update(
        { guid: row.guid },
        { lastUsedAt: now, lastUsedIp: ip },
      );
    }

    return {
      id: owner.guid,
      username: owner.username,
      email: owner.email,
      isAdmin: owner.isAdmin,
      apiTokenGuid: row.guid,
      apiTokenName: row.name,
      apiTokenScopes: scopes,
    };
  }
}
