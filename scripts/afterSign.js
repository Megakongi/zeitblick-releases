/**
 * afterSign hook for electron-builder
 *
 * When APPLE_ID, APPLE_APP_PASSWORD and APPLE_TEAM_ID are set,
 * notarizes the macOS app via Apple's notary service.
 *
 * Without those env vars the hook is a no-op — local builds work as before.
 */
const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  if (!process.env.APPLE_ID || !process.env.APPLE_APP_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.log('  • Notarization skipped — APPLE_ID / APPLE_APP_PASSWORD / APPLE_TEAM_ID not set');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`  • Notarizing ${appPath} …`);

  await notarize({
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });

  console.log('  • Notarization complete ✓');
};
