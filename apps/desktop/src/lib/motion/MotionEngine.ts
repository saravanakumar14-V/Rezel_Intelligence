import gsap from 'gsap';
import { MotionDurations, MotionEasings } from './MotionTokens';
import type { MotionDurationToken, MotionEaseToken } from './types';
import { PersonalizationManager } from '../personalization/PersonalizationManager';

export class MotionEngine {
  public static isReducedMotion(): boolean {
    const profile = PersonalizationManager.getProfile ? PersonalizationManager.getProfile() : null;
    if (profile?.motion?.reducedMotion) return true;
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  }

  public static getDuration(token: MotionDurationToken = 'standard'): number {
    if (this.isReducedMotion()) {
      return MotionDurations.instant;
    }
    const profile = PersonalizationManager.getProfile ? PersonalizationManager.getProfile() : null;
    if (profile?.motion?.transitionStyle === 'INSTANT') {
      return MotionDurations.instant;
    }
    if (profile?.motion?.transitionStyle === 'CINEMATIC') {
      return MotionDurations.cinematic;
    }
    return MotionDurations[token] ?? MotionDurations.standard;
  }

  public static getEase(token: MotionEaseToken = 'standard'): string {
    return MotionEasings[token] ?? MotionEasings.standard;
  }

  public static animateEntrance(
    element: HTMLElement,
    options: {
      fromX?: number;
      fromY?: number;
      scale?: number;
      durationToken?: MotionDurationToken;
      easeToken?: MotionEaseToken;
      onComplete?: () => void;
    } = {}
  ): gsap.core.Tween | null {
    if (!element) return null;
    this.killTweens(element);

    const isReduced = this.isReducedMotion();
    const duration = this.getDuration(options.durationToken || 'standard');
    const ease = this.getEase(options.easeToken || 'out');

    const fromVars: gsap.TweenVars = {
      opacity: 0,
      x: isReduced ? 0 : (options.fromX ?? 0),
      y: isReduced ? 0 : (options.fromY ?? 0),
      scale: isReduced ? 1 : (options.scale ?? 1),
    };

    const toVars: gsap.TweenVars = {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      duration,
      ease,
      clearProps: 'transform,opacity,filter',
      onComplete: () => {
        if (element) {
          gsap.set(element, { clearProps: 'transform,opacity,filter' });
        }
        options.onComplete?.();
      },
    };

    return gsap.fromTo(element, fromVars, toVars);
  }

  public static animateExit(
    element: HTMLElement,
    options: {
      toX?: number;
      toY?: number;
      scale?: number;
      durationToken?: MotionDurationToken;
      easeToken?: MotionEaseToken;
      onComplete?: () => void;
    } = {}
  ): gsap.core.Tween | null {
    if (!element) return null;
    this.killTweens(element);

    const isReduced = this.isReducedMotion();
    const duration = this.getDuration(options.durationToken || 'fast');
    const ease = this.getEase(options.easeToken || 'in');

    return gsap.to(element, {
      opacity: 0,
      x: isReduced ? 0 : (options.toX ?? 0),
      y: isReduced ? 0 : (options.toY ?? 0),
      scale: isReduced ? 1 : (options.scale ?? 1),
      duration,
      ease,
      onComplete: options.onComplete,
    });
  }

  public static animateAttention(
    element: HTMLElement,
    options: {
      durationToken?: MotionDurationToken;
      repeat?: number;
    } = {}
  ): gsap.core.Tween | null {
    if (!element) return null;
    this.killTweens(element);

    if (this.isReducedMotion()) {
      return null;
    }

    const duration = this.getDuration(options.durationToken || 'standard');

    return gsap.fromTo(
      element,
      { filter: 'brightness(1)' },
      {
        filter: 'brightness(1.3)',
        duration,
        repeat: options.repeat ?? 1,
        yoyo: true,
        ease: 'power1.inOut',
        clearProps: 'filter',
      }
    );
  }

  public static killTweens(element: HTMLElement): void {
    if (element) {
      gsap.killTweensOf(element);
    }
  }
}
