import { IsString, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/**
 * Device group query DTO
 * Used to fetch the list of accessible device groups
 */
export class DeviceGroupQueryDto extends PaginationQueryDto {
  @IsString()
  @IsOptional()
  name?: string;
}
