/**
 * Platform-aware re-export. Metro resolves `.web.js` for web bundling and
 * `.native.js` for iOS/Android, so expo-sqlite never ends up in the web bundle.
 */
export * from './database.native';
