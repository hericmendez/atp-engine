import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Category } from '@/categories/schemas/category.schema';

export type BacklogDocument = Backlog & Document;

@Schema({ timestamps: true })
export class Backlog {
  @Prop({ required: true })
  userId: string; // armazena o ID do usuário que criou o backlog

/*   @Prop({ type: Types.ObjectId, ref: 'Category', required: true })
  category: Category | string; // referência à categoria */

@Prop({ type: [String], required: true })
@Prop({ type: [{ type: Types.ObjectId, ref: 'Category' }], required: true })
categories: Types.ObjectId[];

  
  // Dados do jogo
  @Prop({ required: true })
  name: string;

  @Prop()
  igdbId?: number;

  @Prop()
  platform?: string;

  @Prop()
  release_date?: Date;

  @Prop()
  notes?: string;
}

export const BacklogSchema = SchemaFactory.createForClass(Backlog);
