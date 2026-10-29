# credentials

`android-debug.keystore` is the key the app is signed with (React Native's
standard development key, password `android`). The GitHub Action copies it
into the generated `android/` folder so every APK it builds is signed the same
way as the app already on your phone. Android only installs an update over an
existing app when the signature matches, which is what keeps your data.

This key is fine for personal builds. Do NOT use it for the Play Store: Play
needs a private release key (Play App Signing), set up when publishing.
