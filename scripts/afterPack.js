/**
 * afterPack hook for electron-builder
 * Removes extended attributes (resource forks, provenance) from the app bundle
 * so that codesign (both ad-hoc and identity-based) succeeds.
 * On macOS Sequoia+, com.apple.provenance attrs block signing.
 */
const { execSync } = require('child_process');
const path = require('path');

exports.default = async function(context) {
  // Only needed on macOS builds
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  console.log(`  • removing extended attributes from ${appPath}`);

  try {
    // Remove all extended attributes recursively — this is what causes
    // "resource fork, Finder information, or similar detritus not allowed"
    execSync(`xattr -cr "${appPath}" 2>/dev/null || true`, { encoding: 'utf8' });
    console.log('  • xattr cleanup complete ✓');
  } catch (e) {
    console.error('  • xattr cleanup failed:', e.message);
  }
};
