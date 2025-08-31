import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '@/auth/auth.module';
import { BacklogModule } from '@/backlog/backlog.module';
import { GamesModule } from '@/games/games.module';
import { CollectionsModule } from '@/collections/collections.module';
import { CategoriesModule } from '@/categories/categories.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGO_URI || 'mongodb://localhost:27017/savestate'),
    AuthModule,
    BacklogModule,
    GamesModule,
    CollectionsModule,
    CategoriesModule,
  ],
})
export class AppModule {}
