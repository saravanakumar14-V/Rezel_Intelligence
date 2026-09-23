#!/usr/bin/env node
/**
 * REZEL RELEASE ARTIFACT MANIFEST GENERATOR
 */

import { execSync } from 'node:child_process';
import { statSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const desktopRoot = resolve(__dirname, '..');

const artifacts = [
  resolve(desktopRoot, 'src-tauri/target/release/app.exe'),
  resolve(desktopRoot, 'src-tauri/target/release/bundle/nsis/Rezel_1.0.0_x64-setup.exe'),
  resolve(desktopRoot, 'src-tauri/target/release/bundle/msi/Rezel_1.0.0_x64_en-US.msi'),
];

const results = [];

for (const art of artifacts) {
  if (!existsSync(art)) {
    results.push({ path: art, exists: false });
    continue;
  }

  const stat = statSync(art);
  const psScript = `
    $hash = (Get-FileHash "${art}" -Algorithm SHA256).Hash
    $sig = Get-AuthenticodeSignature "${art}"
    [PSCustomObject]@{
      Path = "${art.replace(/\\/g, '\\\\')}"
      Size = ${stat.size}
      SHA256 = $hash
      Status = $sig.Status.ToString()
      Signer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { "None" }
      Issuer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Issuer } else { "None" }
      TimeStamper = if ($sig.TimeStamperCertificate) { $sig.TimeStamperCertificate.Subject } else { "None" }
    } | ConvertTo-Json -Compress
  `;

  const tmpFile = join(os.tmpdir(), 'manifest_item.ps1');
  try {
    writeFileSync(tmpFile, psScript, 'utf8');
    const out = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, {
      encoding: 'utf8',
      timeout: 10000,
    }).trim();
    try { unlinkSync(tmpFile); } catch {}
    results.push(JSON.parse(out));
  } catch (err) {
    try { unlinkSync(tmpFile); } catch {}
    results.push({ path: art, error: err.message });
  }
}

console.log(JSON.stringify(results, null, 2));
