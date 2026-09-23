import type { PolicyEvaluationContext, ResourceScope } from './PolicyTypes';
import type { RiskLevel } from '../PermissionManager';
import { TrustedResourceInspector } from './TrustedResourceInspector';
import type { ResourceInfo } from './TrustedResourceInspector';
import { ScopeEvaluator } from './ScopeEvaluator';

export interface ClassifiedRisk {
  risk: RiskLevel;
  resourceInfo?: ResourceInfo;
  matchedScope?: ResourceScope;
  reason?: string;
}

export class RiskClassifier {
  static async classify(ctx: PolicyEvaluationContext): Promise<ClassifiedRisk> {
    if (ctx.toolGroup !== 'fs') {
      // For non-fs tools, fallback to static defaults or LOW
      return { risk: 'LOW' };
    }

    const path = ctx.args.path as string | undefined;
    const source = ctx.args.source as string | undefined;
    const dest = ctx.args.destination as string | undefined;

    // We only classify one primary target for simplicity, 
    // but for copy/move we must evaluate both.
    const primaryPath = path ?? source;

    if (!primaryPath) {
      return { risk: 'LOW', reason: 'No path specified.' };
    }

    // Determine access type
    let requiredAccess: 'READ' | 'WRITE' | 'DELETE' = 'READ';
    let baseRisk: RiskLevel = 'LOW';

    switch (ctx.capabilityId) {
      case 'fs.list':
      case 'fs.stat':
      case 'fs.search':
      case 'fs.read_text':
        requiredAccess = 'READ';
        baseRisk = 'LOW';
        break;
      case 'fs.create_folder':
      case 'fs.create_file':
        requiredAccess = 'WRITE';
        baseRisk = 'MEDIUM';
        break;
      case 'fs.copy':
      case 'fs.move':
        requiredAccess = 'WRITE';
        baseRisk = 'MEDIUM';
        break;
      case 'fs.delete':
        requiredAccess = 'DELETE';
        baseRisk = 'HIGH';
        break;
    }

    // Evaluate Scope
    const matchedScope = ScopeEvaluator.evaluatePath(primaryPath, requiredAccess, ctx);
    
    if (!matchedScope) {
      return {
        risk: 'CRITICAL', // Out of scope is critical risk (should be denied)
        reason: 'Path escapes authorized filesystem scope or access is denied.',
      };
    }

    if (dest) {
      const destScope = ScopeEvaluator.evaluatePath(dest, 'WRITE', ctx);
      if (!destScope) {
        return {
          risk: 'CRITICAL',
          reason: 'Destination path escapes authorized filesystem scope.',
        };
      }
    }

    // Inspect the resource
    const info = await TrustedResourceInspector.inspectFilesystem(primaryPath);

    // Contextual Risk Adjustments based on resource info
    let finalRisk: RiskLevel = baseRisk;
    let reason = 'Within allowed parameters.';

    if (requiredAccess === 'DELETE') {
      if (info.isDir) {
        // We already know fs.delete rejects directories in Rust, but policy can flag it here too
        finalRisk = 'CRITICAL';
        reason = 'Deleting directories is a critical risk operation.';
      } else {
        finalRisk = 'HIGH';
        reason = 'File deletion is a high risk operation.';
      }

      // Check bulk limits if it were a directory
      if (matchedScope.maxAffectedItems && info.itemCount > matchedScope.maxAffectedItems) {
        finalRisk = 'CRITICAL';
        reason = `Affected items (${info.itemCount}) exceeds threshold (${matchedScope.maxAffectedItems}).`;
      }
      
      if (matchedScope.maxAffectedBytes && info.size > matchedScope.maxAffectedBytes) {
        finalRisk = 'CRITICAL';
        reason = `Affected bytes (${info.size}) exceeds threshold (${matchedScope.maxAffectedBytes}).`;
      }
    }

    return { risk: finalRisk, resourceInfo: info, matchedScope, reason };
  }
}
