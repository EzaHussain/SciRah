import { BadRequestException, Controller, Get, type OnApplicationBootstrap, Query } from '@nestjs/common';
import { CacheService } from '../common/cache.service.js';
import * as openalex from '../papers/sources/openalex.js';

/** Data for the browse pages in the main menu: Authors, Pakistan, Topics and Journals. */
@Controller('explore')
export class ExploreController implements OnApplicationBootstrap {
  constructor(private readonly cache: CacheService) {}

  /** Fill the caches shortly after start-up so the first visitor doesn't wait (the researcher list takes ~15 s). */
  onApplicationBootstrap() {
    setTimeout(() => {
      void Promise.allSettled([this.researchers(), this.country(), this.fields()]);
    }, 5000).unref();
  }

  /** Most-cited researchers currently working in a country (default Pakistan). */
  @Get('researchers')
  researchers(@Query('country') country?: string) {
    const cc = /^[a-z]{2}$/i.test(country ?? '') ? country!.toLowerCase() : 'pk';
    return this.cache.wrap(`explore:researchers:v1:${cc}`, 24 * 3600, () => openalex.topAuthorsInCountry(cc));
  }

  /** A country's research at a glance (default Pakistan). */
  @Get('country')
  country(@Query('code') code?: string) {
    const cc = /^[a-z]{2}$/i.test(code ?? '') ? code!.toLowerCase() : 'pk';
    return this.cache.wrap(`explore:country:v2:${cc}`, 12 * 3600, () => openalex.countryOverview(cc));
  }

  /** All research fields with their subfields. */
  @Get('fields')
  fields() {
    return this.cache.wrap('explore:fields:v1', 7 * 86_400, () => openalex.allFields());
  }

  /** Journal and publisher type-ahead. */
  @Get('venues')
  venues(@Query('q') q?: string) {
    const query = (q ?? '').trim();
    if (query.length < 2) throw new BadRequestException('Please enter at least 2 characters');
    return this.cache.wrap(`explore:venues:v1:${query.toLowerCase().slice(0, 100)}`, 24 * 3600, () => openalex.autocompleteVenues(query.slice(0, 100)));
  }
}
