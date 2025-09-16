//src/backlog/backlog.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BacklogService } from './backlog.service';
import { BacklogController } from './backlog.controller';
import { Backlog, BacklogSchema } from './backlog.schema';
import { Category } from '@/categories/schemas/category.schema';
import { CategoriesModule } from '@/categories/categories.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Backlog.name, schema: BacklogSchema }]),
    MongooseModule.forFeature([{ name: Category.name, schema: Category }]), // ⬅️ garante que CategoryModel está disponível
    forwardRef(() => CategoriesModule),
  ],
  controllers: [BacklogController],
  providers: [BacklogService],
  exports: [BacklogService],
})
export class BacklogModule {}
 