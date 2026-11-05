import { Capacitor } from '@capacitor/core';
import type { RuntimeEnvironmentInfo } from '../domain/types';

export const APP_METADATA = {
  appName: 'MamaMin POS',
  appId: 'com.mamamin.pos',
  appVersion: '0.2.0-p1',
  timezone: 'Asia/Jakarta',
} as const;

export function bootstrapRuntimeEnvironment(): RuntimeEnvironmentInfo {
  return {
    appName: APP_METADATA.appName,
    appId: APP_METADATA.appId,
    appVersion: APP_METADATA.appVersion,
    platform: Capacitor.getPlatform(),
    isNativePlatform: Capacitor.isNativePlatform(),
    timezone: APP_METADATA.timezone,
  };
}
