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

export {
  appearsAsGoodEffect,
  registerAppearsAsGoodEffect,
} from './appearsAsGood';

/**
 * Register all perception effects with the EffectRegistry singleton.
 * Call this during app initialization, before character info resolution.
 */
export function registerAllEffects(): void {
  // Import and call individual registration functions
  const { registerAppearsAsSeerEffect } = require('./appearsAsSeer');
  const { registerAppearsAsGoodEffect } = require('./appearsAsGood');
  
  registerAppearsAsSeerEffect();
  registerAppearsAsGoodEffect();
}
