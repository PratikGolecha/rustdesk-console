import { IsString, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/**
 * User query DTO
 * Used to fetch the list of accessible users
 */
export class UserQueryDto extends PaginationQueryDto {
  @IsString()
  @IsOptional()
  accessible?: string; // an empty string means fetch accessible users

  @IsString()
  @IsOptional()
  status?: string; // '1' means only fetch users with normal status

  @IsString()
  @IsOptional()
  name?: string; // user name filter; supports fuzzy match

  @IsString()
  @IsOptional()
  group_name?: string; // group name filter; supports fuzzy match
}
