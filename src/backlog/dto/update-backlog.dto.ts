//src/backlog/update-backlog-dto.ts
import { IsString, IsOptional, IsObject, IsArray } from 'class-validator';

export class UpdateBacklogDto {
  @IsOptional()
  @IsArray()
  categories?: string[];

  @IsOptional()
  @IsObject()
  igdb_data?: any;

  @IsOptional()
  @IsObject()
  player_data?: any;
}
