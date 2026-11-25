import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from './feature.decorator';
import { FeaturesService } from './features.service';

/** Global guard: routes tagged with @RequireFeature are refused while the module is switched off. */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly features: FeaturesService) {}

  canActivate(context: ExecutionContext) {
    const keys = [this.reflector.get<string>(FEATURE_KEY, context.getClass()), this.reflector.get<string>(FEATURE_KEY, context.getHandler())].filter(Boolean);
    const disabled = keys.find(key => !this.features.isEnabled(key));
    if (disabled) throw new ForbiddenException({ code: 'FEATURE_DISABLED', feature: disabled, message: 'Cette fonctionnalité est désactivée par l’administrateur.' });
    return true;
  }
}
