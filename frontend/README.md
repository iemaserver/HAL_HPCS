# HAL Helicopter Performance System

Offline-first React Native (Expo managed, plain JavaScript) aviation calculator for HAL India.
No backend service, no internet — everything runs locally on-device using SQLite.

## Quick Start

```bash
cd frontend
yarn install
yarn start          # opens Expo DevTools
```

From the Expo DevTools terminal, press:
- **`a`** → open in Android emulator (requires Android Studio with an AVD running)
- **`i`** → open in iOS Simulator (macOS only, requires Xcode)
- **`w`** → open in web browser (limited: SQLite is replaced by localStorage on web)
- Or scan the QR code with the **Expo Go** app on a physical device

## Running on Android Emulator

1. Install Android Studio and create an AVD (API 33+ recommended).
2. Start the emulator (Android Studio → Device Manager → ▶).
3. `cd frontend && yarn start` then press **`a`**.
4. Metro will install Expo Go on the emulator automatically, then load the app.

## Running on iOS Simulator (macOS only)

1. Install Xcode from the App Store.
2. Open iOS Simulator (`open -a Simulator`) or let Expo launch it.
3. `cd frontend && yarn start` then press **`i`**.

## Running on a Physical Device (Expo Go)

1. Install **Expo Go** from the Play Store / App Store.
2. `cd frontend && yarn start`.
3. Scan the QR code with the Expo Go app (Android) or the built-in Camera app (iOS).

## Building a Standalone APK (for HAL offline deployment)

```bash
cd frontend
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
# APK at android/app/build/outputs/apk/release/app-release.apk
```

## Dev Client Build (needed for native voice/handwriting libs)

```bash
cd frontend
npx expo install expo-dev-client
npx expo prebuild
npx expo run:android      # or: npx expo run:ios
```

## Replacing the Logo

Drop your real PNG artwork into `frontend/assets/logos/hal-logo.png`
(recommended 512×512 transparent PNG). It's used on the splash screen.
No code changes needed — just overwrite the file and reload the app.

## Features

- 3 helicopter profiles: **Chetak, Cheetah, Cheetal**
- Splash → Select Airframe → step-by-step Operational Inputs wizard → Review Details → Performance Results flow
- 8 input fields (Elevation, QNH, Temperature, AC Weight, Crew Weight, Fuel, Additional Load, Load), one per wizard step — **all blank on start; user enters every value**
- 8 computed outputs (PA, ISA, Density Altitude, Air Density, AB Temp, AUW, Power Avail, Power Req)
- Multi-modal input per step: **on-screen numpad + voice dictation (web) / dev-build (native)**
- Unit toggles: ft/m, °C/°F, kg/lb, hPa/inHg
- **AUW vs Altitude** SVG chart with current-point indicator + Graph/Table view
- Save / Share professional HAL Report as PDF (offline via `expo-print` + `expo-sharing`)
- Persistent SQLite storage (`expo-sqlite`) for reports & configuration
- Live **Settings** screen — edit calculation formulas & default values during presentations; changes apply instantly, no code changes needed
- Fit-to-Fly logic with 0.01 precision threshold checks
- Toast notifications for errors & warnings
- Tablet + phone responsive

## Voice Input Notes
- **Web preview**: uses browser `SpeechRecognition` API (Chrome/Edge) — works offline once the browser has cached models.
- **Expo Go**: limited (Expo Go cannot bundle native voice libs). An inline error will ask the user to type.
- **Dev Build / Production APK**: add `expo-speech-recognition` (on-device via iOS Speech framework and Android SpeechRecognizer) — rebuild the dev client.

## Configuration Layer (Central Logic)
All default values and formulas live in:
- `src/config/logic.js` — ship defaults (ICAO ISA)
- **Settings screen** (`app/settings.js`) — edit live, persisted in SQLite via `src/db/database.js`

Formulas are plain JavaScript expressions. Available variables are listed under each field.

## Folder Structure

```
frontend/
├── app/                       # expo-router file-based routes
│   ├── _layout.js
│   ├── index.js               # Splash screen
│   ├── airframe.js            # Select Airframe
│   ├── wizard.js               # One-field-per-step Operational Inputs wizard
│   ├── review.js              # Review Details + Live Preview
│   ├── results.js              # Performance Results
│   ├── reports.js              # Saved reports list
│   └── settings.js             # Live config editor
├── assets/
│   └── logos/                 # hal-logo.png (replaceable)
├── src/
│   ├── config/logic.js
│   ├── db/database.js         # Platform re-export
│   ├── db/database.native.js  # SQLite impl
│   ├── db/database.web.js     # localStorage fallback
│   ├── store/AppState.js
│   ├── theme/theme.js
│   ├── components/
│   │   ├── AUWChart.js
│   │   └── HalLoader.js
│   └── utils/pdf.js
├── app.json
└── package.json
```

## Offline Deployment

No server is needed — the app is a self-contained Expo native bundle running on-device.

1. Build the APK using the commands above.
2. Distribute via USB / MDM to the tablets/phones.
3. The SQLite database file `hal_performance.db` is created automatically on first launch inside the app's private sandbox.
4. Reports and configuration persist across sessions and app restarts without any network.

No MongoDB, no Node server, no API calls. Zero-internet mode.
