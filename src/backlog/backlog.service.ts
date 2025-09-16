//src/backlog/backlog.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  forwardRef,
  Inject,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Backlog } from './backlog.schema'
import { CreateBacklogDto } from './dto/create-backlog.dto'
import { UpdateBacklogDto } from './dto/update-backlog.dto'
import { Category } from '@/categories/schemas/category.schema'
import { CategoriesService } from '@/categories/categories.service'


@Injectable()
export class BacklogService {
  constructor (
    @InjectModel(Backlog.name) private backlogModel: Model<Backlog>,
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    @Inject(forwardRef(() => CategoriesService))
    private readonly categoriesService: CategoriesService,
  ) {}

async create(dto: CreateBacklogDto, userId: string) {
  const categories = dto.category_ids.map((id) => new Types.ObjectId(id));

  const igdbData = {
    ...dto.igdb_data,
    genres: dto.igdb_data?.genres || [],
    platforms: dto.igdb_data?.platforms || [],
    cover: dto.igdb_data?.cover || null,
  };

  const backlog = new this.backlogModel({
    userId,
    categories,
    igdb_data: igdbData,
    player_data: dto.player_data || {},
  });

  return backlog.save();
}



  async findAll (userId: string, categoryId?: string) {
    const filter: any = { userId }
    if (categoryId) filter.categories = new Types.ObjectId(categoryId)

    return this.backlogModel
      .find(filter)
      .populate('categories', 'name slug') // o campo `id` não existe, é `_id`
      .exec()
  }
async findAllShort(userId: string, categoryId?: string) {
 const filter: any = { userId };

  if (categoryId) {
    const category = await this.categoryModel.findOne({ userId, id: categoryId });
    if (category) {
      filter.categories = category._id;
    }
  }

  const backlogs = await this.backlogModel
    .find(filter)
    .populate('categories', 'name slug')
    .exec();

  return backlogs.map((b) => ({
    id: b._id,
    name: b.igdb_data?.name,
    genres: (b.igdb_data?.genres || []).map((g: any) =>
      typeof g === 'string' ? g : g.name
    ),
    categories: b.categories.map((c: any) => c.name),
    platforms: (b.igdb_data?.platforms || []).map((p: any) =>
      typeof p === 'string' ? p : p.name
    ),
    cover: b.igdb_data?.cover,
  }));
}

  // Mantém esse para o front (objeto plain)
  async findOne(userId: string, id: string) {
    const game = await this.backlogModel
      .findOne({ _id: id, userId })
      .populate('categories', 'name')
      .exec();

    if (!game) throw new NotFoundException('Jogo não encontrado');

    return {
      ...game.toObject(),
      categories: game.categories.map((c: any) => ({
        id: c._id,
        name: c.name,
      })),
    };
  }

  // Novo: retorna documento Mongoose (com .save disponível)
  async findOneDoc(userId: string, id: string) {
    const game = await this.backlogModel
      .findOne({ _id: id, userId })
      .populate('categories', 'name')
      .exec();

    if (!game) throw new NotFoundException('Jogo não encontrado');

    return game;
  }


  async update (userId: string, id: string, dto: UpdateBacklogDto) {
    if (dto.categories && dto.categories.length > 0) {
      const categories = await this.categoryModel.find({
        _id: { $in: dto.categories.map(c => new Types.ObjectId(c)) },
        userId,
      })
      if (categories.length !== dto.categories.length) {
throw new NotFoundException(
  'Uma ou mais categorias não existem para este usuário',
)

      }
    }

const updated = await this.backlogModel.findOneAndUpdate(
  { _id: id, userId },
  { $set: dto },
  { new: true },
)

if (!updated) throw new NotFoundException('Jogo não encontrado')
return updated

  }

  async remove (userId: string, id: string) {
    const deleted = await this.backlogModel.findOneAndDelete({
      _id: id,
      userId,
    })
    if (!deleted) throw new NotFoundException('Jogo não encontrado')
    return { ok: true }
  }

  async removeCategoryFromGames (categoryId: string, userId: string) {
    const games = await this.backlogModel.find({
      userId,
      categories: categoryId,
    })

    for (const game of games) {
game.categories = game.categories.filter(c => c.toString() !== categoryId)

      if (game.categories.length === 0) {
await game.deleteOne()

      } else {
await game.save()

      }
    }
  }

  async countGamesByCategory (categoryId: string, userId: string) {
    return this.backlogModel.countDocuments({
      userId,
      categories: new Types.ObjectId(categoryId),
    })
  }
}
