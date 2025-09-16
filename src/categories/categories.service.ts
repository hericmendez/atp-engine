//src/categories/categories.service.ts
import { Injectable, NotFoundException, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category } from './schemas/category.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { BacklogService } from '@/backlog/backlog.service';
import { DeleteResult } from 'mongodb';
import { Backlog } from '@/backlog/backlog.schema';



@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    @Inject(forwardRef(() => BacklogService))
    private readonly backlogService: BacklogService,

  ) {}

  async createCategory(dto: CreateCategoryDto, userId: string): Promise<Category> {
      console.log('DTO:', dto);
  console.log('userId:', userId);
    const category = new this.categoryModel({ ...dto, userId });
    return category.save();
  }


async addGameToCategory(categoryId: string, gameId: string, userId: string) {
  // Validação de ObjectId
  if (!Types.ObjectId.isValid(categoryId)) {
    throw new BadRequestException('ID de categoria inválido');
  }
  if (!Types.ObjectId.isValid(gameId)) {
    throw new BadRequestException('ID de jogo inválido');
  }
  const game = await this.backlogService.findOneDoc(userId, gameId);

  const category = await this.categoryModel.findById(categoryId);
  if (!category) {
    throw new NotFoundException('Categoria não encontrada');
  }

  const alreadyExists = game.categories.some(
    (c: any) =>
      c._id?.toString() === categoryId ||
      c.id?.toString() === categoryId ||
      c.toString() === categoryId,
  );
  if (alreadyExists) {
    throw new BadRequestException('O jogo já pertence a essa categoria');
  }

  game.categories.push(category._id);
  await game.save();

  return { message: 'Jogo adicionado à categoria com sucesso' };
}





async updateCategory(id: string, dto: CreateCategoryDto, userId: string): Promise<Category> {
  const category = await this.categoryModel.findOneAndUpdate(
    { _id: id, userId },            // só atualiza se for do usuário
    { name: dto.name },             // atualiza o nome
    { new: true },                  // retorna o doc atualizado
  );

  if (!category) {
    throw new NotFoundException('Categoria não encontrada');
  }

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
    console.log("cat ==> ", cat);
      const countGames = await this.backlogService.countGamesByCategory(cat._id.toString(), userId);
      const categorySlug = convertToSlug(cat.name)
      return { ...cat, slug: categorySlug, countGames };
    }),
  );

  return result;
}
async removeGameFromCategory(categoryId: string, gameId: string, userId: string) {
  const game = await this.backlogService.findOneDoc( userId,gameId);
  if (!game) {
    throw new NotFoundException('Jogo não encontrado');
  }

  // Verifica se o jogo pertence à categoria
  const index = game.categories.findIndex(
    (c: any) => (c._id?.toString?.() ?? c.id?.toString?.() ?? c.toString()) === categoryId,
  );
  if (index === -1) {
    throw new NotFoundException('Jogo não está nessa categoria');
  }

  // Remove a categoria do array
  game.categories.splice(index, 1);

  // Validação: não pode ficar sem categorias
  if (game.categories.length === 0) {
    throw new BadRequestException(
      'Um jogo precisa estar associado a pelo menos uma categoria',
    );
  }

  await game.save();

  return { message: 'Jogo removido da categoria com sucesso' };
}

  async findOne(id: string, userId: string) {
    const category = await this.categoryModel.findOne({ _id: id, userId });
    if (!category) throw new NotFoundException('Categoria não encontrada');
    return category;
  }
}

function convertToSlug(Text) {
  return Text?.toLowerCase()
    ?.replace(/ /g, "-")
    ?.replace(/[^\w-]+/g, "");
}