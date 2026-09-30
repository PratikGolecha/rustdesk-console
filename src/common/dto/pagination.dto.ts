import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const PAGINATION_DEFAULT_CURRENT = 1;
export const PAGINATION_DEFAULT_PAGE_SIZE = 20;
export const PAGINATION_MAX_CURRENT = 100000;
export const PAGINATION_MAX_PAGE_SIZE = 100;

/**
 * Pagination query base class
 * Unifies the definition, default values and constraints of current / pageSize for all list query DTOs to inherit.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_MAX_CURRENT)
  current?: number = PAGINATION_DEFAULT_CURRENT;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_MAX_PAGE_SIZE)
  pageSize?: number = PAGINATION_DEFAULT_PAGE_SIZE;
}

/**
 * Paginated response shape
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
}
