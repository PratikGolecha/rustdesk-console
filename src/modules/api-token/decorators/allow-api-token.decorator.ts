import { SetMetadata } from '@nestjs/common';

/**
 * Token scopes.
 * - assign: run the device assign endpoint (`rustdesk --assign`)
 * - read:   read-only listing endpoints
 * - manage: implies read + assign, plus the admin endpoints the CLI tools use
 */
export type ApiTokenScope = 'assign' | 'read' | 'manage';
export const API_TOKEN_SCOPES: readonly ApiTokenScope[] = [
  'assign',
  'read',
  'manage',
];

/** Scopes implied by another scope. */
export const IMPLIED_SCOPES: Record<ApiTokenScope, readonly ApiTokenScope[]> = {
  assign: [],
  read: [],
  manage: ['read', 'assign'],
};

export const ALLOW_API_TOKEN_KEY = 'allowApiToken';

/**
 * Opt a route in to `Authorization: Bearer <console API token>`
 * authentication. Routes without this decorator only accept the normal JWT
 * flows; an API token presented there is rejected. The token must carry the
 * given scope (or a scope that implies it).
 */
export const AllowApiToken = (scope: ApiTokenScope) =>
  SetMetadata(ALLOW_API_TOKEN_KEY, scope);

export const API_TOKEN_PREFIX = 'rdc_';
