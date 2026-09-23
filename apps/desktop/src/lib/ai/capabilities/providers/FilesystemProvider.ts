import type { CapabilityProvider, Capability } from '../types';
import { PathGuard } from './filesystem/PathGuard';
import { FileOperations } from './filesystem/FileOperations';

export class FilesystemProviderImpl implements CapabilityProvider {
  readonly id = 'filesystem';
  readonly type = 'filesystem';

  capabilities(): Capability<any, any>[] {
    return [
      {
        id: 'fs.list',
        description: 'List files and directories in a given path.',
        category: 'file',
        parameters: {
          path: { type: 'string', description: 'The absolute directory path to list.', required: true }
        },
        riskLevel: 'LOW', // READ_ONLY mapped to LOW for PermissionManager
        mutatesExternalState: false,
        isReversible: true,
        retryPolicy: 'AUTO',
        toolGroup: 'fs',
        validateScope: () => ({ allowed: true }), // PathGuard handles it dynamically in execute
        getRequiredLocks: async (args: { path: string }) => [{ uri: `fs:${args.path}`, access: 'READ' }],
        execute: async (args: { path: string }, context: import('../types').ExecutionContext) => {
          if (context.signal?.aborted) throw new Error('Aborted');
          await PathGuard.validate(args.path, 'READ');
          return await FileOperations.list(args.path);
        }
      },
      {
        id: 'fs.stat',
        description: 'Get file or directory metadata.',
        category: 'file',
        parameters: {
          path: { type: 'string', description: 'The absolute file or directory path.', required: true }
        },
        riskLevel: 'LOW',
        mutatesExternalState: false,
        isReversible: true,
        retryPolicy: 'AUTO',
        toolGroup: 'fs',
        validateScope: () => ({ allowed: true }),
        getRequiredLocks: async (args: { path: string }) => [{ uri: `fs:${args.path}`, access: 'READ' }],
        execute: async (args: { path: string }, context: import('../types').ExecutionContext) => {
          if (context.signal?.aborted) throw new Error('Aborted');
          await PathGuard.validate(args.path, 'READ');
          return await FileOperations.stat(args.path);
        }
      },
      {
        id: 'fs.search',
        description: 'Search for files or directories by name within a path.',
        category: 'file',
        parameters: {
          path: { type: 'string', description: 'The absolute directory path to search in.', required: true },
          pattern: { type: 'string', description: 'The pattern to search for.', required: true }
        },
        riskLevel: 'LOW',
        mutatesExternalState: false,
        isReversible: true,
        retryPolicy: 'AUTO',
        toolGroup: 'fs',
        validateScope: () => ({ allowed: true }),
        getRequiredLocks: async (args: { path: string; pattern: string }) => [{ uri: `fs:${args.path}`, access: 'READ' }],
        execute: async (args: { path: string; pattern: string }, context: import('../types').ExecutionContext) => {
          if (context.signal?.aborted) throw new Error('Aborted');
          await PathGuard.validate(args.path, 'READ');
          return await FileOperations.search(args.path, args.pattern);
        }
      },
      {
        id: 'fs.read_text',
        description: 'Read the contents of a text file.',
        category: 'file',
        parameters: {
          path: { type: 'string', description: 'The absolute file path.', required: true }
        },
        riskLevel: 'LOW',
        mutatesExternalState: false,
        isReversible: true,
        retryPolicy: 'AUTO',
        toolGroup: 'fs',
        validateScope: () => ({ allowed: true }),
        getRequiredLocks: async (args: { path: string }) => [{ uri: `fs:${args.path}`, access: 'READ' }],
        execute: async (args: { path: string }, context: import('../types').ExecutionContext) => {
          if (context.signal?.aborted) throw new Error('Aborted');
          await PathGuard.validate(args.path, 'READ');
          return await FileOperations.readText(args.path);
        }
      },
      {
        id: 'fs.create_folder',
        description: 'Create a new directory.',
        category: 'file',
        parameters: {
          path: { type: 'string', description: 'The absolute directory path to create.', required: true }
        },
        riskLevel: 'MEDIUM',
        mutatesExternalState: true,
        isReversible: true,
        retryPolicy: 'NEVER',
        toolGroup: 'fs',
        validateScope: () => ({ allowed: true }),
        getRequiredLocks: async (args: { path: string }) => [{ uri: `fs:${args.path}`, access: 'WRITE' }],
        execute: async (args: { path: string }, context: import('../types').ExecutionContext) => {
          if (context.signal?.aborted) throw new Error('Aborted');
          await PathGuard.validate(args.path, 'WRITE');
          await FileOperations.createFolder(args.path);
          return 'Success';
        },
        dryRun: async (args: { path: string }) => {
          const { TrustedResourceInspector } = await import('../../../security/policy/TrustedResourceInspector');
          const info = await TrustedResourceInspector.inspectFilesystem(args.path);
          return {
            affectedResources: [info],
            estimatedSize: 0,
            estimatedCount: 1,
            risk: 'MEDIUM',
            reversibility: 'REVERSIBLE',
            reason: info.exists ? 'Folder already exists' : 'Folder will be created'
          };
        },
        verify: async (args: { path: string }) => {
          try {
            const stat = await FileOperations.stat(args.path);
            return stat.isDir ? 'SUCCESS' : 'FAILED';
          } catch {
            return 'FAILED';
          }
        },
        getCompensationIntent: async (args: { path: string }) => {
          return {
            capabilityId: 'fs.delete',
            args: { path: args.path }
          };
        }
      },
      {
        id: 'fs.create_file',
        description: 'Create a new empty text file.',
        category: 'file',
        parameters: {
          path: { type: 'string', description: 'The absolute file path to create.', required: true }
        },
        riskLevel: 'MEDIUM',
        mutatesExternalState: true,
        isReversible: true,
        retryPolicy: 'NEVER',
        toolGroup: 'fs',
        validateScope: () => ({ allowed: true }),
        getRequiredLocks: async (args: { path: string }) => [{ uri: `fs:${args.path}`, access: 'WRITE' }],
        execute: async (args: { path: string }, context: import('../types').ExecutionContext) => {
          if (context.signal?.aborted) throw new Error('Aborted');
          await PathGuard.validate(args.path, 'WRITE');
          await FileOperations.createFile(args.path);
          return 'Success';
        },
        dryRun: async (args: { path: string }) => {
          const { TrustedResourceInspector } = await import('../../../security/policy/TrustedResourceInspector');
          const info = await TrustedResourceInspector.inspectFilesystem(args.path);
          return {
            affectedResources: [info],
            estimatedSize: 0,
            estimatedCount: 1,
            risk: 'MEDIUM',
            reversibility: 'REVERSIBLE',
            reason: info.exists ? 'File already exists' : 'File will be created'
          };
        },
        verify: async (args: { path: string }) => {
          try {
            const stat = await FileOperations.stat(args.path);
            return stat.isFile ? 'SUCCESS' : 'FAILED';
          } catch {
            return 'FAILED';
          }
        },
        getCompensationIntent: async (args: { path: string }) => {
          return {
            capabilityId: 'fs.delete',
            args: { path: args.path }
          };
        }
      },
      {
        id: 'fs.copy',
        description: 'Copy a file.',
        category: 'file',
        parameters: {
          source: { type: 'string', description: 'The absolute source file path.', required: true },
          destination: { type: 'string', description: 'The absolute destination file path.', required: true }
        },
        riskLevel: 'MEDIUM',
        mutatesExternalState: true,
        isReversible: true,
        retryPolicy: 'NEVER',
        toolGroup: 'fs',
        validateScope: () => ({ allowed: true }),
        getRequiredLocks: async (args: { source: string; destination: string }) => [
          { uri: `fs:${args.source}`, access: 'READ' },
          { uri: `fs:${args.destination}`, access: 'WRITE' }
        ],
        execute: async (args: { source: string; destination: string }, context: import('../types').ExecutionContext) => {
          if (context.signal?.aborted) throw new Error('Aborted');
          await PathGuard.validate(args.source, 'READ');
          await PathGuard.validate(args.destination, 'WRITE');
          await FileOperations.copy(args.source, args.destination);
          return 'Success';
        },
        dryRun: async (args: { source: string; destination: string }) => {
          const { TrustedResourceInspector } = await import('../../../security/policy/TrustedResourceInspector');
          const sourceInfo = await TrustedResourceInspector.inspectFilesystem(args.source);
          const destInfo = await TrustedResourceInspector.inspectFilesystem(args.destination);
          return {
            affectedResources: [sourceInfo, destInfo],
            estimatedSize: sourceInfo.size,
            estimatedCount: sourceInfo.itemCount,
            risk: 'MEDIUM',
            reversibility: 'REVERSIBLE',
            reason: destInfo.exists ? 'Destination will be overwritten' : 'File will be copied'
          };
        },
        verify: async (args: { destination: string }) => {
          try {
            const stat = await FileOperations.stat(args.destination);
            return stat.isFile || stat.isDir ? 'SUCCESS' : 'FAILED';
          } catch {
            return 'FAILED';
          }
        },
        getCompensationIntent: async (args: { destination: string }) => {
          return {
            capabilityId: 'fs.delete',
            args: { path: args.destination }
          };
        }
      },
      {
        id: 'fs.move',
        description: 'Move or rename a file.',
        category: 'file',
        parameters: {
          source: { type: 'string', description: 'The absolute source file path.', required: true },
          destination: { type: 'string', description: 'The absolute destination file path.', required: true }
        },
        riskLevel: 'MEDIUM',
        mutatesExternalState: true,
        isReversible: true,
        retryPolicy: 'NEVER',
        toolGroup: 'fs',
        validateScope: () => ({ allowed: true }),
        getRequiredLocks: async (args: { source: string; destination: string }) => [
          { uri: `fs:${args.source}`, access: 'WRITE' },
          { uri: `fs:${args.destination}`, access: 'WRITE' }
        ],
        execute: async (args: { source: string; destination: string }, context: import('../types').ExecutionContext) => {
          if (context.signal?.aborted) throw new Error('Aborted');
          await PathGuard.validate(args.source, 'WRITE');
          await PathGuard.validate(args.destination, 'WRITE');
          await FileOperations.move(args.source, args.destination);
          return 'Success';
        },
        dryRun: async (args: { source: string; destination: string }) => {
          const { TrustedResourceInspector } = await import('../../../security/policy/TrustedResourceInspector');
          const sourceInfo = await TrustedResourceInspector.inspectFilesystem(args.source);
          const destInfo = await TrustedResourceInspector.inspectFilesystem(args.destination);
          return {
            affectedResources: [sourceInfo, destInfo],
            estimatedSize: sourceInfo.size,
            estimatedCount: sourceInfo.itemCount,
            risk: 'MEDIUM',
            reversibility: 'REVERSIBLE',
            reason: destInfo.exists ? 'Destination will be overwritten' : 'File will be moved'
          };
        },
        verify: async (args: { source: string; destination: string }) => {
          try {
            const destStat = await FileOperations.stat(args.destination);
            if (!destStat) return 'FAILED';
            
            try {
              await FileOperations.stat(args.source);
              return 'FAILED'; // Source still exists
            } catch {
              return 'SUCCESS';
            }
          } catch {
            return 'UNKNOWN';
          }
        },
        getCompensationIntent: async (args: { source: string; destination: string }) => {
          return {
            capabilityId: 'fs.move',
            args: { source: args.destination, destination: args.source }
          };
        }
      },
      {
        id: 'fs.delete',
        description: 'Delete a file.',
        category: 'file',
        parameters: {
          path: { type: 'string', description: 'The absolute file path to delete.', required: true }
        },
        riskLevel: 'HIGH',
        mutatesExternalState: true,
        isReversible: false,
        retryPolicy: 'NEVER',
        toolGroup: 'fs',
        validateScope: () => ({ allowed: true }),
        getRequiredLocks: async (args: { path: string }) => [{ uri: `fs:${args.path}`, access: 'WRITE' }],
        execute: async (args: { path: string }, context: import('../types').ExecutionContext) => {
          if (context.signal?.aborted) throw new Error('Aborted');
          await PathGuard.validate(args.path, 'DELETE');
          await FileOperations.deleteFile(args.path);
          return 'Success';
        },
        dryRun: async (args: { path: string }) => {
          const { TrustedResourceInspector } = await import('../../../security/policy/TrustedResourceInspector');
          const info = await TrustedResourceInspector.inspectFilesystem(args.path);
          return {
            affectedResources: [info],
            estimatedSize: info.size,
            estimatedCount: info.itemCount,
            risk: 'HIGH',
            reversibility: 'IRREVERSIBLE', // Keep IRREVERSIBLE per requirement 10
            reason: 'File will be deleted permanently'
          };
        },
        verify: async (args: { path: string }) => {
          try {
            await FileOperations.stat(args.path);
            return 'FAILED'; // Still exists
          } catch {
            return 'SUCCESS'; // Expected error (not found)
          }
        },
        getCompensationIntent: async (_args: { path: string }) => {
          // Cannot compensate delete (irreversible)
          return null;
        }
      }
    ];
  }

  health() {
    return { status: 'CONNECTED' as const };
  }
}

export const FilesystemProvider = new FilesystemProviderImpl();
