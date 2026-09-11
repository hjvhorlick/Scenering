export interface NatureBackground {
  id: string;
  name: string;
  category: "mountains" | "ocean" | "forest" | "sky" | "waterfall" | "peaceful";
  url: string;
  thumb: string;
}

export const NATURE_FALLBACKS: NatureBackground[] = [
  {
    id: "mountain_sunrise",
    name: "Misty Alpine Sunrise",
    category: "mountains",
    url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80",
    thumb: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=400&q=60",
  },
  {
    id: "serene_ocean",
    name: "Calm Turquoise Ocean",
    category: "ocean",
    url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80",
    thumb: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=60",
  },
  {
    id: "lush_forest",
    name: "Lush Sunlit Redwood Forest",
    category: "forest",
    url: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&q=80",
    thumb: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=400&q=60",
  },
  {
    id: "golden_sunset",
    name: "Radiant Golden Hour Clouds",
    category: "sky",
    url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1920&q=80",
    thumb: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=60",
  },
  {
    id: "mountain_lake",
    name: "Mirror Reflection Alpine Lake",
    category: "waterfall",
    url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=80",
    thumb: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=400&q=60",
  },
  {
    id: "gentle_waterfall",
    name: "Emerald Cascade Waterfall",
    category: "waterfall",
    url: "https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=1920&q=80",
    thumb: "https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=400&q=60",
  },
  {
    id: "rolling_hills",
    name: "Peaceful Misty Rolling Hills",
    category: "peaceful",
    url: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1920&q=80",
    thumb: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=400&q=60",
  },
  {
    id: "starry_sky",
    name: "Deep Cosmos & Night Sky",
    category: "sky",
    url: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1920&q=80",
    thumb: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=400&q=60",
  },
];
