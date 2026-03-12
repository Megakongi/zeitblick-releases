/**
 * afterPack hook for electron-builder
 * Ad-hoc signs the macOS app bundle so auto-updates pass code signature validation
 */
const { execSync } = require('child_process');
const path = require('path');

exports.default = async function(context) {
  // Only sign on macOS builds
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  console.log(`  • ad-hoc signing  ${appPath}`);

  try {
    // On macOS Sequoia+, com.apple.provenance attrs can't be removed.
    // Workaround: copy the app to /tmp (no provenance there), sign it, copy back.
    const tmpDir = path.join('/tmp', `zeitblick-sign-${Date.now()}`);
    const tmpAppPath = path.join(tmpDir, `${context.packager.appInfo.productFilename}.app`);
    
    execSync(`mkdir -p "${tmpDir}"`, { encoding: 'utf8' });
    execSync(`cp -R "${appPath}" "${tmpAppPath}"`, { encoding: 'utf8' });
    
    // Remove any remaining xattrs in /tmp copy
    execSync(`xattr -cr "${tmpAppPath}" 2>/dev/null || true`, { encoding: 'utf8' });

    // Ad-hoc sign the clean copy
    const result = execSync(`codesign --force --deep --sign - "${tmpAppPath}" 2>&1`, { encoding: 'utf8' });
    if (result) console.log(`    ${result.trim()}`);
    
    // Verify signature
    execSync(`codesign --verify --deep --strict "${tmpAppPath}" 2>&1`, { encoding: 'utf8' });
    
    // Copy signed app back
    execSync(`rm -rf "${appPath}"`, { encoding: 'utf8' });
    execSync(`cp -R "${tmpAppPath}" "${appPath}"`, { encoding: 'utf8' });
    execSync(`rm -rf "${tmpDir}"`, { encoding: 'utf8' });
    
    console.log('  • ad-hoc signing complete ✓');
  } catch (e) {
    console.error('  • ad-hoc signing failed:', e.stderr || e.stdout || e.message);
    // Don't fail the build — unsigned app still works for manual install
  }
};
