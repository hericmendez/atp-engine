//src/backlog/backlog.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type BacklogDocument = Backlog & Document;

@Schema({ timestamps: true })
export class Backlog {
  @Prop({ required: true })
  userId: string;

  // Referência para várias categorias (ObjectId)
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Category' }], required: true })
  categories: Types.ObjectId[];

  // Dados vindos da IGDB
  @Prop({
    type: {
      id: { type: Number, required: true },
      name: { type: String, required: true },
      genres: [
        {
          id: Number,
          name: String,
        },
      ],
      platforms: [
        {
          id: Number,
          name: String,
          platform_logo: {
            id: Number,
            url: String,
          },
        },
      ],
      first_release_date: Number,
      summary: String,
      cover: {
        url: String,
      },
      total_rating: Number,
    },
    required: true,
  })
  igdb_data: {
    id: number;
    name: string;
    genres?: { id: number; name: string }[];
    platforms?: {
      id: number;
      name: string;
      platform_logo?: { id: number; url: string };
    }[];
    first_release_date?: number;
    summary?: string;
    cover?: { url: string };
    total_rating?: number;
  };

  // Dados do jogador
  @Prop({
    type: {
      status: {
        type: String,
        enum: ['Zerado', 'Jogando', 'Dropado', 'Wishlist'],
        default: 'Wishlist',
      },
      hours_played: { type: Number, default: 0 },
      rating: { type: Number, min: 0, max: 10 },
      review: String,
    },
    default: {},
  })
  player_data: {
    status?: string;
    hours_played?: number;
    rating?: number;
    review?: string;
  };
}

export const BacklogSchema = SchemaFactory.createForClass(Backlog);
