/**
 * SQL fragments shared by the client-facing "accessible users / devices /
 * device groups" queries. Every fragment is a boolean expression using the
 * named parameter `:userGuid` (the viewer) and uses EXISTS so it stays a
 * single query with no N+1.
 *
 * Rules honoured on top of ownership and the per-user tables
 * (user_user_permissions, device_group_user_permissions):
 *  - user group A -> user group B   (user_group_user_group_permissions;
 *    A -> A means "members can see each other")
 *  - user group A -> device group G (user_group_device_group_permissions)
 */

/** True when the user row aliased `userAlias` belongs to a group the viewer's group can access. */
export const userVisibleViaGroupRule = (userAlias: string): string => `EXISTS (
  SELECT 1 FROM users ag_me
  INNER JOIN user_group_user_group_permissions ag_ugp
    ON ag_ugp.userGroupGuid = ag_me.userGroupGuid
  WHERE ag_me.guid = :userGuid
    AND ag_me.userGroupGuid IS NOT NULL
    AND ag_ugp.targetUserGroupGuid = ${userAlias}.userGroupGuid
)`;

/** True when the peer aliased `peerAlias` is owned by a user of an accessible user group. */
export const peerVisibleViaGroupRule = (peerAlias: string): string => `EXISTS (
  SELECT 1 FROM users ag_me
  INNER JOIN user_group_user_group_permissions ag_ugp
    ON ag_ugp.userGroupGuid = ag_me.userGroupGuid
  INNER JOIN users ag_owner
    ON ag_owner.userGroupGuid = ag_ugp.targetUserGroupGuid
  WHERE ag_me.guid = :userGuid
    AND ag_me.userGroupGuid IS NOT NULL
    AND ag_owner.guid = ${peerAlias}.userGuid
)`;

/** True when the device group column `deviceGroupExpr` is granted to the viewer's user group. */
export const deviceGroupVisibleViaGroupRule = (
  deviceGroupExpr: string,
): string => `EXISTS (
  SELECT 1 FROM users ag_me
  INNER JOIN user_group_device_group_permissions ag_udg
    ON ag_udg.userGroupGuid = ag_me.userGroupGuid
  WHERE ag_me.guid = :userGuid
    AND ag_me.userGroupGuid IS NOT NULL
    AND ag_udg.deviceGroupGuid = ${deviceGroupExpr}
)`;

/** True when user `userAlias` owns a peer inside a device group granted to the viewer's user group. */
export const userVisibleViaDeviceGroupRule = (
  userAlias: string,
): string => `EXISTS (
  SELECT 1 FROM peers ag_p
  INNER JOIN user_group_device_group_permissions ag_udg
    ON ag_udg.deviceGroupGuid = ag_p.deviceGroupGuid
  INNER JOIN users ag_me
    ON ag_me.userGroupGuid = ag_udg.userGroupGuid
  WHERE ag_me.guid = :userGuid
    AND ag_p.userGuid = ${userAlias}.guid
)`;
