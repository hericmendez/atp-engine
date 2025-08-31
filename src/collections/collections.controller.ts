import { Controller, Get } from '@nestjs/common';
import { CollectionsService } from './collections.service';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly service: CollectionsService) {}

  @Get('platforms')
  platforms() { return this.service.platforms(); }

  @Get('genres')
  genres() { return this.service.genres(); }

  @Get('goty')
  goty() { return this.service.goty(); }
}
