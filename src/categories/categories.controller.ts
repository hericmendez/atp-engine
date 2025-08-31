import { Controller, Post, Get, Param, Body, Req, UseGuards, Delete } from '@nestjs/common';
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
  const {userId} = req.user; // ou req.user.id dependendo do seu JWT
  return this.categoriesService.createCategory(createCategoryDto, userId);
}


  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Req() req: any) {
      console.log("req.user ==> ", req.user);
      const {userId} = req.user;
    return this.categoriesService.findAll(userId); // ou req.user.userId
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
        const {userId} = req.user;

    return this.categoriesService.findOne(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: any) {
        const {userId} = req.user;
    return this.categoriesService.deleteCategory(id, userId);
  }

}
