//games/dto/igdb-query.dto.ts
import { IsDateString, IsNumberString, IsOptional, IsString, IsIn } from 'class-validator';

export class igdbQueryDto {
  @IsOptional() @IsString() id?: string;       // consulta direta por id (Games)
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() platform?: string;  // nome (match aproximado)
  @IsOptional() @IsString() genre?: string;     // nome (match aproximado)
  @IsOptional() @IsDateString() releaseDate?: string;
  @IsOptional() @IsNumberString() short?: string;
  @IsOptional() @IsNumberString() limit?: number;
  @IsOptional() @IsNumberString() page?: number;
  

    @IsOptional() @IsNumberString() lastRating?: string;
  @IsOptional() @IsNumberString() offset?: number;
  @IsOptional() @IsString() sortBy?: string;    // first_release_date | name | id
  @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc';

}
