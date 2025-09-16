//src/backlog/create-backlog-dto.ts
import {
  IsString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsArray,
} from 'class-validator'


export class CreateBacklogDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  category_ids: string[]; 
  @IsObject()
  igdb_data: any;

  @IsOptional()
  @IsObject()
  player_data?: any;
}
