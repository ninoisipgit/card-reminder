/**
 * Turns off R8 code shrinking for Android release builds.
 *
 * Expo's template enables it (android.enableMinifyInReleaseBuilds=true), and it
 * strips classes that libraries load by name at startup. In v1.0.0 that removed
 * WorkManager's database class and the app crashed on launch ("Failed to create
 * an instance of class androidx.work.impl.WorkDatabase"). Debug builds never
 * shrink, which is why the emulator was fine.
 *
 * The APK is a little larger without shrinking; for a personal app that is the
 * safer trade. Revisit (with keep rules) before a Play Store release.
 */
const { withGradleProperties } = require('expo/config-plugins');

const KEYS = {
  'android.enableMinifyInReleaseBuilds': 'false',
  'android.enableShrinkResourcesInReleaseBuilds': 'false',
};

module.exports = function withNoMinify(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && item.key in KEYS));
    for (const [key, value] of Object.entries(KEYS)) {
      cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
};
