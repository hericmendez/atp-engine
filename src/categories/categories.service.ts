//categories/categories.service.ts
import { Injectable, NotFoundException, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category } from './schemas/category.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { BacklogService } from '@/backlog/backlog.service';
import { DeleteResult } from 'mongodb';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    @Inject(forwardRef(() => BacklogService))
    private readonly backlogService: BacklogService,
  ) {}

  async createCategory(dto: CreateCategoryDto, userId: string): Promise<Category> {
    const category = new this.categoryModel({ ...dto, userId });
    return category.save();
  }

  async updateCategory(id: string, dto: CreateCategoryDto, userId: string): Promise<Category> {
    const category = await this.categoryModel.findOneAndUpdate(
      { _id: id, userId },
      { name: dto.name },
      { new: true },
    );
    if (!category) throw new NotFoundException('Categoria não encontrada');
    return category;
  }

  async deleteCategory(id: string, userId: string): Promise<DeleteResult> {
    const category = await this.categoryModel.findOne({ _id: id, userId });
    if (!category) throw new NotFoundException('Categoria não encontrada');

    // Remove a categoria de todos os jogos
    await this.backlogService.removeCategoryFromGames(id, userId);

    return this.categoryModel.deleteOne({ _id: id, userId });
  }

  async findAll(userId: string) {
    const categories = await this.categoryModel.find({ userId }).lean();

    const result = await Promise.all(
      categories.map(async (cat) => {
        const countGames = await this.backlogService.countGamesByCategory(cat._id.toString(), userId);
        return { ...cat, countGames };
      }),
    );

    return result;
  }

  async findOne(id: string, userId: string) {
    const category = await this.categoryModel.findOne({ _id: id, userId });
    if (!category) throw new NotFoundException('Categoria não encontrada');
    return category;
  }
}
