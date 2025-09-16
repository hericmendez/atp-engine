//src/categories/categories.controller.ts
import { Controller, Post, Get, Param, Body, Req, UseGuards, Delete, Put } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) { }

  @UseGuards(JwtAuthGuard)
  @Post()
  @Post()
  @UseGuards(JwtAuthGuard)


  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
    @Req() req: any,
  ) {
    console.log("req.user ==> ", req.user);
    const userId = req.user.userId; // <--- pega do payload correto

    return this.categoriesService.createCategory(createCategoryDto, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateCategoryDto: CreateCategoryDto,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.categoriesService.updateCategory(id, updateCategoryDto, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Req() req: any) {
    const userId = req.user.userId;
    return this.categoriesService.findAll(userId);
  }


  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    const { userId } = req.user;

    return this.categoriesService.findOne(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: any) {
    const { userId } = req.user;
    return this.categoriesService.deleteCategory(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':categoryId/game/:gameId')
  async addGameToCategory(
    @Param('categoryId') categoryId: string,
    @Param('gameId') gameId: string,
    @Req() req: any
  ) {
    console.log("req.user ==> ", req);
    const { userId } = req.user;

    return this.categoriesService.addGameToCategory(categoryId, gameId, userId);
  }



  @UseGuards(JwtAuthGuard)
  @Delete(':categoryId/game/:gameId')
  async removeGameFromCategory(
    @Param('categoryId') categoryId: string,

    @Param('gameId') gameId: string,

    @Req() req: any
  ) {
    const userId = req.user.userId;
    console.log("userId ==> ", userId);
    console.log("gameId ==> ", gameId);
    console.log("categoryId ==> ", categoryId);

    /* userId ==>  68b893d06af0e6672de8fbec
    gameId ==>  68c386dceae7784b339ad0f9
    categoryId ==>  68c380dcd016a2d96acb4e8c */
        return this.categoriesService.removeGameFromCategory(categoryId, gameId, userId);
  }

}
