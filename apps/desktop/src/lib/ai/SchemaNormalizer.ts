import type { ParameterDef } from './types';

export type GeminiParamType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'OBJECT' | 'ARRAY';

export interface GeminiParamSchema {
  type: GeminiParamType;
  description: string;
  enum?: string[];
  items?: GeminiParamSchema;
}

export class GeminiSchemaNormalizer {
  static convertParam(param: ParameterDef, paramPath: string): GeminiParamSchema {
    const type = param.type === 'array' ? 'ARRAY' : (param.type.toUpperCase() as GeminiParamType);

    if (type === 'ARRAY' && !param.items) {
      throw new Error(`ARRAY parameter requires an \`items\` schema.`);
    }

    let itemsSchema: GeminiParamSchema | undefined;
    if (param.items) {
      itemsSchema = GeminiSchemaNormalizer.convertParam(param.items as ParameterDef, `${paramPath}.items`);
    }

    return {
      type,
      description: param.description,
      ...(param.enum ? { enum: param.enum } : {}),
      ...(itemsSchema ? { items: itemsSchema } : {}),
    };
  }
}
