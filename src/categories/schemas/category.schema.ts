// src/categories/schemas/category.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Game, GameSchema } from '@/games/schemas/game.schema';

@Schema()
export class Category extends Document {
  @Prop({ required: true})
  name: string; // Ex: Favoritos, Jogando, Dropados...
  
  @Prop({ required: true })
  userId: string;

  @Prop({ type: [GameSchema], default: [] })
  games: Game[];
}

export const CategorySchema = SchemaFactory.createForClass(Category);
