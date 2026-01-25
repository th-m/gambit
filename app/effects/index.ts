/**
 * Effects Module - Exports all effect definitions and registration functions.
 *
 * Call registerAllEffects() during app initialization to register
 * all perception effects with the EffectRegistry singleton.
 */

import {
  appearsAsSeerEffect,
  registerAppearsAsSeerEffect,
} from './appearsAsSeer';

import {
  appearsAsGoodEffect,
  registerAppearsAsGoodEffect,
} from './appearsAsGood';

// Re-export for consumers
export {
  appearsAsSeerEffect,
  registerAppearsAsSeerEffect,
  appearsAsGoodEffect,
  registerAppearsAsGoodEffect,
};

/**
 * Register all perception effects with the EffectRegistry singleton.
 * Call this during app initialization, before character info resolution.
 */
export function registerAllEffects(): void {
  registerAppearsAsSeerEffect();
  registerAppearsAsGoodEffect();
}
