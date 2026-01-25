/**
 * Effects Module - Exports all effect definitions and registration functions.
 *
 * Call registerAllEffects() during app initialization to register
 * all perception effects with the EffectRegistry singleton.
 */

export {
  appearsAsSeerEffect,
  registerAppearsAsSeerEffect,
} from './appearsAsSeer';

// Note: appears_as_good effect will be added in a future story (effect-appears-as-good)

/**
 * Register all perception effects with the EffectRegistry singleton.
 * Call this during app initialization, before character info resolution.
 */
export function registerAllEffects(): void {
  // Import and call individual registration functions
  const { registerAppearsAsSeerEffect } = require('./appearsAsSeer');
  registerAppearsAsSeerEffect();

  // Note: registerAppearsAsGoodEffect will be added when that effect is implemented
}
