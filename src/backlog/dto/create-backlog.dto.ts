// create-backlog.dto.ts
import { IsString, IsArray, ArrayNotEmpty, IsOptional } from 'class-validator';

export class CreateBacklogDto {
  @IsString()
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  categories: string[]; 
}

// update-backlog.dto.ts
'class-validator';

export class UpdateBacklogDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}
