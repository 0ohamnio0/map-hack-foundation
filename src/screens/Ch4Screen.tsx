/**
 * CH.4 — Pretext Typography Exhibit (auto-start)
 *
 * Wraps PretextDemo in game mode: auto-exhibit on mount,
 * no editor UI. Typing → glitch → ink bleed → CH.5 overlay.
 */
import PretextDemo from '@/pages/PretextDemo';

export const Ch4Screen: React.FC = () => {
  return <PretextDemo autoExhibit />;
};
