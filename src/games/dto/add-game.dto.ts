// src/categories/dto/add-game.dto.ts
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class AddGameDto {
  @IsString()
  readonly title: string;

  @IsOptional()
  @IsNumber()
  readonly igdbId?: number;

  @IsOptional()
  @IsString()
  readonly coverUrl?: string;

  @IsOptional()
  @IsString()
  readonly status?: string;
}
