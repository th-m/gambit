/**
 * appears_as_seer Effect - Phantom's passive ability
 *
 * This effect makes the Phantom appear as a Seer candidate to the Oracle.
 * The Oracle sees both the real Seer and the Phantom, creating uncertainty
 * about who the true Seer is.
 *
 * This effect does NOT affect the actual Seer's perception of evil players.
 */

import type { EffectDefinition, EffectId } from '../types/game';
import { effectRegistry } from '../registry/EffectRegistry';

/**
 * Definition for the appears_as_seer effect.
 * This is a passive perception modifier with no active hooks.
 */
export const appearsAsSeerEffect: EffectDefinition = {
  id: 'appears_as_seer' as EffectId,
  name: 'Appears as Seer',
  description: 'This character appears as a Seer candidate to the Oracle.',
  hooks: {},
  modifiers: [
    {
      type: 'appears_as_seer',
      description: 'Oracle sees this player as a potential Seer',
    },
  ],
};

/**
 * Register the appears_as_seer effect with the singleton registry.
 * Call this during app initialization.
 */
export function registerAppearsAsSeerEffect(): void {
  effectRegistry.register(appearsAsSeerEffect);
}
