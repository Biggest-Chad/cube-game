# THE CUBE — agent notes

## APK naming (required)

When building or copying a playtest APK, **always include the version number in the filename**.

- Version source: `package.json` `version` (keep `android/app/build.gradle` `versionName` in sync).
- Pattern: `thecube-<version>-debug.apk`
- Timestamped archive (optional extra): `thecube-<version>-YYYYMMDD-HHmmss.apk`
- Examples: `thecube-1.0.0-debug.apk`, `thecube-1.0.0-20260813-130122.apk`
- Do **not** ship a playtest copy named only `thecube-debug.apk` or `thecube-YYYYMMDD-HHmmss.apk` with no version.

Gradle still emits `android/app/build/outputs/apk/debug/app-debug.apk`. After `npm run android:apk`, copy/rename into `release/` and `releases/` using the pattern above.

This was requested 2026-08-13 after a build that used `thecube-debug.apk` / `thecube-20260813-130122.apk` with no version.
