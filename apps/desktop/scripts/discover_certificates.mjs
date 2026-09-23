#!/usr/bin/env node
/**
 * WINDOWS CERTIFICATE AUDIT & DISCOVERY
 *
 * Inspects all Windows Certificate Stores (CurrentUser and LocalMachine)
 * to locate authentic Code Signing certificates (EKU 1.3.6.1.5.5.7.3.3).
 */

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

function auditCertificates() {
  const psScript = `
    $stores = @(
      "Cert:\\CurrentUser\\My",
      "Cert:\\CurrentUser\\TrustedPublisher",
      "Cert:\\LocalMachine\\My",
      "Cert:\\LocalMachine\\TrustedPublisher"
    )
    $results = @()
    foreach ($store in $stores) {
      if (Test-Path $store) {
        $certs = Get-ChildItem -Path $store -ErrorAction SilentlyContinue
        foreach ($cert in $certs) {
          $ekus = @()
          if ($cert.EnhancedKeyUsageList) {
            foreach ($eku in $cert.EnhancedKeyUsageList) {
              $ekus += $eku.ObjectId
            }
          }
          $isCodeSigning = $ekus -contains "1.3.6.1.5.5.7.3.3"
          $isSelfSigned = ($cert.Subject -eq $cert.Issuer)
          $results += [PSCustomObject]@{
            Store = $store
            Subject = $cert.Subject
            Issuer = $cert.Issuer
            Thumbprint = $cert.Thumbprint
            NotBefore = $cert.NotBefore.ToString("yyyy-MM-dd HH:mm:ss")
            NotAfter = $cert.NotAfter.ToString("yyyy-MM-dd HH:mm:ss")
            HasPrivateKey = $cert.HasPrivateKey
            IsCodeSigning = $isCodeSigning
            IsSelfSigned = $isSelfSigned
            EKUs = ($ekus -join ", ")
            IsValid = ($cert.NotAfter -gt (Get-Date)) -and ($cert.NotBefore -lt (Get-Date))
          }
        }
      }
    }
    $results | ConvertTo-Json -Depth 5
  `;

  const tmpFile = join(os.tmpdir(), 'audit_certs.ps1');
  try {
    writeFileSync(tmpFile, psScript, 'utf8');
    const output = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    try { unlinkSync(tmpFile); } catch {}
    const parsed = JSON.parse(output.trim() || '[]');
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    try { unlinkSync(tmpFile); } catch {}
    console.error('Failed to query certificate store:', err.message);
    return [];
  }
}

const certs = auditCertificates();
console.log('======================================================================');
console.log('  WINDOWS CERTIFICATE AUDIT REPORT');
console.log('======================================================================');
console.log(`Total Certificates Inspected: ${certs.length}\n`);

let codeSigningCerts = [];

for (const c of certs) {
  console.log(`Store:          ${c.Store}`);
  console.log(`Subject:        ${c.Subject}`);
  console.log(`Issuer:         ${c.Issuer}`);
  console.log(`Thumbprint:     ${c.Thumbprint}`);
  console.log(`Validity:       ${c.NotBefore} -> ${c.NotAfter} (Active: ${c.IsValid})`);
  console.log(`HasPrivateKey:  ${c.HasPrivateKey}`);
  console.log(`Self-Signed:    ${c.IsSelfSigned}`);
  console.log(`CodeSigningEKU: ${c.IsCodeSigning ? 'YES (1.3.6.1.5.5.7.3.3)' : 'NO'}`);
  console.log(`All EKUs:       ${c.EKUs || 'None'}`);
  console.log('----------------------------------------------------------------------');

  if (c.IsCodeSigning && !c.IsSelfSigned && c.HasPrivateKey && c.IsValid) {
    codeSigningCerts.push(c);
  }
}

console.log(`\nGenuine Production Code Signing Certificates Found: ${codeSigningCerts.length}`);

if (codeSigningCerts.length === 0) {
  console.log('\n>>> RESULT: SIGNING BLOCKED — CERTIFICATE REQUIRED <<<\n');
} else {
  console.log('\n>>> RESULT: VALID CERTIFICATE FOUND <<<\n');
}
