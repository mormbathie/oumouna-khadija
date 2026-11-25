import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FeaturesController } from './features.controller';
import { FeaturesService } from './features.service';
import { FeatureGuard } from './feature.guard';

@Global()
@Module({
  controllers: [FeaturesController],
  providers: [FeaturesService, { provide: APP_GUARD, useClass: FeatureGuard }],
  exports: [FeaturesService],
})
export class FeaturesModule {}
