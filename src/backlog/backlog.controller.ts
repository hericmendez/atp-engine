//src/backlog/backlog.controller.ts
import { Controller, Get, Post, Put, Delete, Param, Body, Req, UseGuards, Query } from '@nestjs/common';
import { BacklogService } from './backlog.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateBacklogDto } from './dto/create-backlog.dto';
import { UpdateBacklogDto } from './dto/update-backlog.dto';


@Controller('backlog')
@UseGuards(JwtAuthGuard)
export class BacklogController {
  constructor(private readonly service: BacklogService) {}


@Get()
@UseGuards(JwtAuthGuard)
async findAll(@Req() req: any, @Query('categoryId') categoryId?: string) {
  const { page, limit, offset } = (req as any).pagination;
  const { userId } = req.user;

  const data = await this.service.findAll(userId, categoryId);

  return {
    data,
    meta: { page, limit, offset },
  };
}

@Get('short')
async findAllShort(
  @Req() req: any,
  @Query('categoryId') categoryId?: string
) {
  const { userId } = req.user;
  const data = await this.service.findAllShort(userId, categoryId);
  return { data };
}


@Get(':id')
async findOne(@Req() req: any, @Param('id') id: string) {
  const { userId } = req.user;
  return this.service.findOne(userId, id);
}


@Post()
@UseGuards(JwtAuthGuard)
@Post()
create(@Req() req: any, @Body() dto: CreateBacklogDto) {
  return this.service.create(dto, req.user.userId);
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
