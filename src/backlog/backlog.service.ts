import { Injectable, NotFoundException, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Backlog } from './backlog.schema';
import { CreateBacklogDto } from './dto/create-backlog.dto';
import { UpdateBacklogDto } from './dto/update-backlog.dto';
import { Category } from '@/categories/schemas/category.schema';
import { CategoriesService } from '@/categories/categories.service';

@Injectable()
export class BacklogService {
  constructor(
    @InjectModel(Backlog.name) private backlogModel: Model<Backlog>,
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    @Inject(forwardRef(() => CategoriesService))
    private readonly categoriesService: CategoriesService,
  ) {}

  async create(userId: string, dto: CreateBacklogDto) {
    if (!dto.categories || dto.categories.length === 0) {
      throw new BadRequestException('O jogo precisa ter pelo menos uma categoria');
    }

    const categories = await this.categoryModel.find({
      _id: { $in: dto.categories.map(c => new Types.ObjectId(c)) },
      userId,
    });

    if (categories.length !== dto.categories.length) {
      throw new NotFoundException('Uma ou mais categorias não existem para este usuário');
    }

    const game = new this.backlogModel({ ...dto, userId });
    return game.save();
  }

  async findAll(userId: string, categoryId?: string) {
    const filter: any = { userId };
    if (categoryId) filter.categories = categoryId;
    return this.backlogModel.find(filter).exec();
  }

  async update(userId: string, id: string, dto: UpdateBacklogDto) {
    if (dto.categories && dto.categories.length > 0) {
      const categories = await this.categoryModel.find({
        _id: { $in: dto.categories.map(c => new Types.ObjectId(c)) },
        userId,
      });
      if (categories.length !== dto.categories.length) {
        throw new NotFoundException('Uma ou mais categorias não existem para este usuário');
      }
    }

    const updated = await this.backlogModel.findOneAndUpdate({ _id: id, userId }, dto, { new: true });
    if (!updated) throw new NotFoundException('Jogo não encontrado');
    return updated;
  }

  async remove(userId: string, id: string) {
    const deleted = await this.backlogModel.findOneAndDelete({ _id: id, userId });
    if (!deleted) throw new NotFoundException('Jogo não encontrado');
    return { ok: true };
  }

  async removeCategoryFromGames(categoryId: string, userId: string) {
    const games = await this.backlogModel.find({ userId, categories: categoryId });

    for (const game of games) {
      game.categories = game.categories.filter(c => c.toString() !== categoryId);
      if (game.categories.length === 0) {
        await game.deleteOne();
      } else {
        await game.save();
      }
    }
  }

  async countGamesByCategory(categoryId: string, userId: string) {
    return this.backlogModel.countDocuments({ userId, categories: categoryId });
  }
}
