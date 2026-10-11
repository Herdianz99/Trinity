import { Module } from '@nestjs/common';
import { SearchSynonymsController } from './search-synonyms.controller';
import { SearchSynonymsService } from './search-synonyms.service';

@Module({
  controllers: [SearchSynonymsController],
  providers: [SearchSynonymsService],
})
export class SearchSynonymsModule {}
