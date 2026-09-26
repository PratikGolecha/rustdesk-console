import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/** One control role per controlling user. */
@Entity('control_role_assignments')
export class ControlRoleAssignment {
  @PrimaryColumn()
  userGuid: string;

  @Column()
  roleGuid: string;

  @CreateDateColumn()
  createdAt: Date;
}
