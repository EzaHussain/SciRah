import { BadRequestException, Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CacheService } from '../common/cache.service.js';
import * as openalex from '../papers/sources/openalex.js';

/** Journal / repository (S…) and publisher (P…) profiles from OpenAlex. */
@Controller('venues')
export class VenuesController {
  constructor(private readonly cache: CacheService) {}

  @Get(':id')
  async get(@Param('id') raw: string) {
    const id = raw.trim().toUpperCase();
    if (!/^[SP]\d{3,12}$/.test(id)) throw new BadRequestException('Unrecognised journal or publisher id');
    const venue = await this.cache.wrap(`venue:v1:${id}`, 12 * 3600, () => openalex.getVenue(id));
    if (!venue) throw new NotFoundException('Journal or publisher not found');
    return venue;
  }
}
