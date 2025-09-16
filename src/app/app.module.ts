import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '@/auth/auth.module';
import { BacklogModule } from '@/backlog/backlog.module';
import { GamesModule } from '@/games/games.module';
import { CollectionsModule } from '@/collections/collections.module';
import { CategoriesModule } from '@/categories/categories.module';
import { PaginationAuthMiddleware } from '@/common/middleware/pagination-auth.middleware';


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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(PaginationAuthMiddleware)
      .exclude(
        { path: 'games', method: RequestMethod.GET },
        { path: 'collections', method: RequestMethod.GET },
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/register', method: RequestMethod.POST },
      )
      .forRoutes('*');
  }
}
