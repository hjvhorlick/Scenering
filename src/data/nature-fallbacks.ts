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
    url: "/nature-library/mtn_sunrise.jpg",
    thumb: "/nature-library/mtn_sunrise.jpg",
  },
  {
    id: "serene_ocean",
    name: "Calm Turquoise Ocean",
    category: "ocean",
    url: "/nature-library/ocean.jpg",
    thumb: "/nature-library/ocean.jpg",
  },
  {
    id: "lush_forest",
    name: "Lush Sunlit Redwood Forest",
    category: "forest",
    url: "/nature-library/forest.jpg",
    thumb: "/nature-library/forest.jpg",
  },
  {
    id: "golden_sunset",
    name: "Radiant Golden Hour Clouds",
    category: "sky",
    url: "/nature-library/sunset.jpg",
    thumb: "/nature-library/sunset.jpg",
  },
  {
    id: "mountain_lake",
    name: "Mirror Reflection Alpine Lake",
    category: "waterfall",
    url: "/nature-library/lake.jpg",
    thumb: "/nature-library/lake.jpg",
  },
  {
    id: "gentle_waterfall",
    name: "Emerald Cascade Waterfall",
    category: "waterfall",
    url: "/nature-library/waterfall.jpg",
    thumb: "/nature-library/waterfall.jpg",
  },
  {
    id: "rolling_hills",
    name: "Peaceful Misty Rolling Hills",
    category: "peaceful",
    url: "/nature-library/hills.jpg",
    thumb: "/nature-library/hills.jpg",
  },
  {
    id: "starry_sky",
    name: "Deep Cosmos & Night Sky",
    category: "sky",
    url: "/nature-library/stars.jpg",
    thumb: "/nature-library/stars.jpg",
  },
];
