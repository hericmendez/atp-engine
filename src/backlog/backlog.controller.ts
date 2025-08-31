import { Controller, Get, Post, Put, Delete, Param, Body, Req, UseGuards, Query } from '@nestjs/common';
import { BacklogService } from './backlog.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateBacklogDto } from './dto/create-backlog.dto';
import { UpdateBacklogDto } from './dto/update-backlog.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

@Controller('backlog')
@UseGuards(JwtAuthGuard)
export class BacklogController {
  constructor(private readonly service: BacklogService) {}
@Get()
@UseGuards(JwtAuthGuard)
async findAll(@Req() req: any, @Query('categoryId') categoryId?: string) {
  const {userId} = req.user;
  const filter: any = { userId };
  if (categoryId) filter.categories = categoryId; // categoryId já é string aqui
  return this.service.findAll(userId, categoryId);
}



@Post()
@UseGuards(JwtAuthGuard)
create(@Req() req: any, @Body() dto: CreateBacklogDto) {
  return this.service.create(req.user.userId, dto);
}


  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateBacklogDto) {
    return this.service.update(req.user.userId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.userId, id);
  }
}
