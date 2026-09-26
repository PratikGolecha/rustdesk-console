import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * A named bundle of control permissions applied to the CONTROLLED device when
 * the assigned user connects to it (see control-role.constants.ts).
 */
@Entity('control_roles')
export class ControlRole {
  @PrimaryColumn()
  guid: string;

  @Column()
  @Index({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  note: string;

  /** JSON object: { [permission]: 'allow' | 'deny' }, missing key = default */
  @Column({ type: 'text', nullable: true })
  permissions: string;

  /** Applied to controllers that have no assignment (and to non-logged-in controllers). At most one. */
  @Column({ default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
