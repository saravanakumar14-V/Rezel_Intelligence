import type { IntentClassification, Intent, Mode } from './types.js';

interface KeywordHeuristic {
  intent: Intent;
  suggestedMode?: Mode;
  keywords: string[];
  weight: number;
}

const HEURISTICS: KeywordHeuristic[] = [
  {
    intent: 'CREATIVE_AUTOMATION',
    suggestedMode: 'CREATOR',
    keywords: ['blender', 'render', '3d', 'scene', 'camera', 'after effects', 'layer', 'composition', 'cube', 'mesh'],
    weight: 2
  },
  {
    intent: 'CODING',
    suggestedMode: 'DEVELOPER',
    keywords: ['code', 'refactor', 'git', 'bug', 'compile', 'function', 'class', 'test', 'script', 'bash'],
    weight: 2
  },
  {
    intent: 'RESEARCH',
    suggestedMode: 'DEVELOPER',
    keywords: ['search', 'find', 'explain', 'how does', 'what is', 'documentation', 'read'],
    weight: 1
  },
  {
    intent: 'SYSTEM_TASK',
    suggestedMode: 'DEVELOPER',
    keywords: ['system', 'restart', 'config', 'memory', 'wipe', 'delete', 'update'],
    weight: 1.5
  }
];

export class IntentRouter {
  classify(input: string): IntentClassification {
    const lowerInput = input.toLowerCase().trim();
    
    // Explicit check for informational/explanatory queries
    const isExplanatory = /^(explain|what is|what are|how does|how do|why is|why does|tell me about|describe|document)\b/i.test(lowerInput);
    
    let bestMatch: KeywordHeuristic | null = null;
    let maxScore = 0;

    for (const heuristic of HEURISTICS) {
      let score = 0;
      for (const keyword of heuristic.keywords) {
        if (lowerInput.includes(keyword)) {
          score += heuristic.weight;
        }
      }
      if (isExplanatory && heuristic.intent === 'RESEARCH') {
        score += 5; // Boost RESEARCH for explanatory questions
      }
      if (score > maxScore) {
        maxScore = score;
        bestMatch = heuristic;
      }
    }

    // Default to CONVERSATION if no strong heuristic matches
    if (!bestMatch || maxScore < 1) {
      return {
        intent: 'CONVERSATION',
        confidence: 0.5,
        suggestedMode: 'FRIENDLY'
      };
    }

    // Rough confidence calculation bounded to 1.0
    const confidence = Math.min(maxScore / 4, 1.0);

    return {
      intent: bestMatch.intent,
      confidence,
      suggestedMode: bestMatch.suggestedMode
    };
  }
}
