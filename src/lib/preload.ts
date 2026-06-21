const GAMEPLAY_ASSET_URLS = [
  '/country-surfaces.geojson',
  '/capital-anchors.geojson',
  '/countries-10m.json',
  '/earth-day.jpg',
];

export const loadGameViewModule = () => import('../components/game/GameView');
export const loadVersusGameViewModule = () => import('../components/game/VersusGameView');
export const loadProgressDashboardModule = () => import('../components/progress/ProgressDashboard');
export const loadLeaderboardViewModule = () => import('../components/leaderboard/LeaderboardView');
export const loadVersusLobbyModule = () => import('../components/menus/VersusLobby');
export const loadGlobeMapModule = () => import('../components/game/GlobeMap');

let warmAppViewsPromise: Promise<void> | null = null;
let warmGameplayAssetsPromise: Promise<void> | null = null;

function warmAsset(url: string): Promise<void> {
  return fetch(url, { cache: 'force-cache' })
    .then(() => undefined)
    .catch(() => undefined);
}

export function warmAppViews(): Promise<void> {
  if (!warmAppViewsPromise) {
    warmAppViewsPromise = Promise.all([
      loadGameViewModule(),
      loadVersusGameViewModule(),
      loadProgressDashboardModule(),
      loadLeaderboardViewModule(),
      loadVersusLobbyModule(),
      loadGlobeMapModule(),
    ]).then(() => undefined);
  }

  return warmAppViewsPromise;
}

export function warmGameplayAssets(): Promise<void> {
  if (!warmGameplayAssetsPromise) {
    warmGameplayAssetsPromise = Promise.all(
      GAMEPLAY_ASSET_URLS.map((url) => warmAsset(url)),
    ).then(() => undefined);
  }

  return warmGameplayAssetsPromise;
}
