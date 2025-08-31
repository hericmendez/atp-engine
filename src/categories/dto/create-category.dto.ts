// src/categories/dto/create-category.dto.ts
import { IsString } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  readonly name: any;
}
