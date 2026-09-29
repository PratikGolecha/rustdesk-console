import { Injectable } from '@nestjs/common';
import { User } from '../../user/entities/user.entity';
import { LoginResponse } from '../../../common/interfaces';

/** User payload type in the login response (optionality removed to guarantee complete fields) */
export type UserPayload = NonNullable<LoginResponse['user']>;

/**
 * Auth response builder helper
 * Builds the user info payload in login responses in one place, eliminating duplicated implementations
 */
@Injectable()
export class AuthResponseHelper {
  /**
   * Builds the user info payload in the login response
   * Used by all login flows: login / TFA / email verification code / Passkey, etc.
   *
   * tfaSecret / password are select:false fields on the entity:
   * the corresponding status is returned only when the query actually loaded the field,
   * to avoid reporting "not queried" as "not enabled".
   */
  buildUserPayload(user: User): UserPayload {
    const secretFields = user as unknown as {
      tfaSecret?: string | null;
      password?: string | null;
    };

    return {
      guid: user.guid,
      name: user.username,
      display_name: user.displayName || undefined,
      email: user.email || undefined,
      note: user.note || undefined,
      status: user.status,
      info: user.getUserInfo(),
      is_admin: user.isAdmin,
      third_auth_type: user.thirdAuthType || undefined,
      ...(user.avatar ? { avatar: user.avatar } : {}),
      ...(secretFields.tfaSecret !== undefined
        ? { tfa_enabled: !!secretFields.tfaSecret }
        : {}),
      ...(secretFields.password !== undefined
        ? { has_password: !!secretFields.password }
        : {}),
    };
  }

  /**
   * Build the response payload for the currentUser endpoint
   * Extends buildUserPayload with an additional verifier field
   *
   * The caller must load the tfaSecret / password fields
   * to ensure the frontend security settings page gets accurate 2FA status.
   */
  buildCurrentUserPayload(user: User): Record<string, unknown> {
    return {
      ...this.buildUserPayload(user),
      tfa_enabled: !!user.tfaSecret,
      has_password: !!user.password,
      verifier: user.verifier || undefined,
    };
  }
}
