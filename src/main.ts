import './ui/styles.css';
import { GameEngine } from './gameplay/gameEngine.ts';

async function bootstrap(): Promise<void> {
  // Wait briefly for webfont readiness to prevent FOIT/FOUT without stalling offline loads
  if ('fonts' in document) {
    await Promise.race([
      document.fonts.ready.catch(() => undefined),
      new Promise<void>((resolve) => window.setTimeout(resolve, 450))
    ]);
  }

  const engine = new GameEngine('game-canvas');
  try {
    await engine.init();
  } catch (err) {
    console.error('Failed to initialize Hanoi Shipper 3D Retro:', err);
  }
}

void bootstrap();
