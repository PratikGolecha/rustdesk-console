import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsBoolean,
  IsNumber,
  Min,
  IsInt,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStrategyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsObject()
  @IsOptional()
  config_options?: Record<string, string>;

  /**
   * Accept option keys that are not in the strategy options catalog.
   * Blocked keys are rejected regardless.
   */
  @IsBoolean()
  @IsOptional()
  allow_custom?: boolean;
}

export class UpdateStrategyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsObject()
  @IsOptional()
  config_options?: Record<string, string>;

  /**
   * Accept option keys that are not in the strategy options catalog.
   * Blocked keys are rejected regardless.
   */
  @IsBoolean()
  @IsOptional()
  allow_custom?: boolean;
}

export class AssignStrategyDto {
  @IsString()
  @IsIn(['device', 'user', 'device_group'])
  target_type: 'device' | 'user' | 'device_group';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  target_guids: string[];
}

export class StrategyQueryDto {
  @IsNumber()
  @Min(1)
  @Max(100000)
  @IsInt()
  @Type(() => Number)
  current: number;

  @IsNumber()
  @Min(1)
  @Max(200)
  @IsInt()
  @Type(() => Number)
  pageSize: number;

  @IsString()
  @IsOptional()
  name?: string;
}

export class StrategyCandidateDto {
  guid: string;
  name: string;
  note: string;
}

export class StrategyTargetCandidateQueryDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['device', 'user'])
  target_type: 'device' | 'user';

  @IsNumber()
  @Min(1)
  @Max(100000)
  @IsInt()
  @Type(() => Number)
  current: number;

  @IsNumber()
  @Min(1)
  @Max(200)
  @IsInt()
  @Type(() => Number)
  pageSize: number;
}

export class AssignmentQueryDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['device', 'user', 'device_group'])
  target_type: 'device' | 'user' | 'device_group';

  @IsNumber()
  @Min(1)
  @Max(100000)
  @IsInt()
  @Type(() => Number)
  current: number;

  @IsNumber()
  @Min(1)
  @Max(200)
  @IsInt()
  @Type(() => Number)
  pageSize: number;
}
