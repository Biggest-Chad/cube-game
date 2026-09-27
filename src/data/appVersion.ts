/**
 * Single source of truth for the Settings version label: package.json "version".
 * android/app/build.gradle versionName must stay in sync with package.json.
 */
import { version } from '../../package.json';

export const APP_VERSION: string = version;
