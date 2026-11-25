import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'requiredFeature';
/** Refuses the route (403 FEATURE_DISABLED) while the administrator has switched the module off. */
export const RequireFeature = (feature: string) => SetMetadata(FEATURE_KEY, feature);
