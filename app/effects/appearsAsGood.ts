/**
 * appears_as_good Effect - Saboteur's passive ability
 *
 * This effect makes the Saboteur appear as a good player to the Seer.
 * The Seer does not see the Saboteur in their list of evil players,
 * making the Saboteur harder to detect.
 *
 * This effect does NOT affect other evil players' knowledge of the Saboteur.
 */

import type { EffectDefinition, EffectId } from '../types/game';
import { effectRegistry } from '../registry/EffectRegistry';

/**
 * Definition for the appears_as_good effect.
 * This is a passive perception modifier with no active hooks.
 */
export const appearsAsGoodEffect: EffectDefinition = {
  id: 'appears_as_good' as EffectId,
  name: 'Appears as Good',
  description: 'This character appears as good to the Seer.',
  hooks: {},
  modifiers: [
    {
      type: 'appears_as_good',
      description: 'Seer does not see this player as evil',
    },
  ],
};

/**
 * Register the appears_as_good effect with the singleton registry.
 * Call this during app initialization.
 */
export function registerAppearsAsGoodEffect(): void {
  effectRegistry.register(appearsAsGoodEffect);
}
