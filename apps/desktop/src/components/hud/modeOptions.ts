import React from 'react';
import { Sparkles, Palette, Code, Cpu } from 'lucide-react';
import type { Mode } from '../../lib/director/types';

export type SelectableMode = Mode | 'AUTO';

export interface ModeOption {
  id: SelectableMode;
  label: string;
  badgeLabel: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
  classNameKey: string;
}

export const MODE_OPTIONS: readonly ModeOption[] = [
  {
    id: 'AUTO',
    label: 'AUTO',
    badgeLabel: 'AUTO',
    icon: Cpu,
    description: "Adapt to what I'm doing",
    classNameKey: 'item-auto',
  },
  {
    id: 'FRIENDLY',
    label: 'FRIENDLY',
    badgeLabel: 'FRIENDLY',
    icon: Sparkles,
    description: 'Conversation-first',
    classNameKey: 'item-friendly',
  },
  {
    id: 'CREATOR',
    label: 'CREATOR',
    badgeLabel: 'CREATOR',
    icon: Palette,
    description: 'Visual and 3D workflows',
    classNameKey: 'item-creator',
  },
  {
    id: 'DEVELOPER',
    label: 'DEVELOPER',
    badgeLabel: 'DEV',
    icon: Code,
    description: 'Code and systems workflows',
    classNameKey: 'item-developer',
  },
];
