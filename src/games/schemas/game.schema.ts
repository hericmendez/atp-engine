// src/games/schemas/game.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Game extends Document {
  @Prop({ required: true })
  title: string;

  @Prop()
  igdbId?: number; // opcional, caso use API IGDB

  @Prop()
  coverUrl?: string; // imagem

  @Prop()
  status?: string; // Jogando, Dropado, Zerado etc.
}

export const GameSchema = SchemaFactory.createForClass(Game);
