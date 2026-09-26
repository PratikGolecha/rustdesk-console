import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * Console API token.
 *
 * Only a SHA-256 hash of the token is stored; the plaintext is shown once at
 * creation. A token acts on behalf of its owner (`userGuid`): every action is
 * still authorized against the owner's RBAC permissions, and `scopes` can only
 * narrow what the token may reach.
 */
@Entity('api_tokens')
export class ApiToken {
  @PrimaryColumn()
  guid: string;

  /** Owner (creator) of the token; requests act as this user. */
  @Column({ type: 'varchar' })
  @Index()
  userGuid: string;

  @Column({ type: 'varchar' })
  name: string;

  /** Public, non-secret lookup part of the token. */
  @Column({ type: 'varchar' })
  @Index({ unique: true })
  tokenId: string;

  /** SHA-256 (hex) of the full token string. */
  @Column({ type: 'varchar' })
  tokenHash: string;

  /** Comma separated scopes: assign, read, manage. */
  @Column({ type: 'varchar' })
  scopes: string;

  @Column({ type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  lastUsedIp: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
