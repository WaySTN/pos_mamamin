export type AppRouteId = 'cashier' | 'transactions' | 'reports' | 'more';

export type ReadinessStatus = 'ready' | 'planned' | 'unverified';

export interface RuntimeEnvironmentInfo {
  readonly appName: string;
  readonly appId: string;
  readonly appVersion: string;
  readonly platform: string;
  readonly isNativePlatform: boolean;
  readonly timezone: 'Asia/Jakarta';
}

