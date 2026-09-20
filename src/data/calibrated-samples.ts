import { DurationOption } from "../lib/duration-utils";

export interface CalibratedSample {
  title: string;
  category: string;
  scripts: Record<DurationOption, string>;
}

export const CALIBRATED_SAMPLES: CalibratedSample[] = [
  {
    title: "Nature & Wildlife Odyssey",
    category: "Documentary",
    scripts: {
      10: `The sun rises over misty mountains, casting golden morning rays across the vast valley below as ancient peaks slowly awaken in silence.

A herd of wild horses gallops across the dewy meadow, their powerful strides kicking up earth while the fresh wind howls.

Deep in the emerald forest, crystal-clear streams wind through mossy riverbanks, reflecting dappled sunlight among ancient redwoods and cascading waterfalls.

An apex eagle circles the canyon rim, scanning the untamed frontier with piercing eyes as thermals carry it skyward into the clouds.

Midnight descends across the wilderness, revealing billions of glittering stars across the Milky Way in a breath-taking nocturnal spectacle.`,

      20: `The sun rises over the misty mountain range, casting warm golden rays across the peaceful valley below. Morning fog slowly dissipates among ancient pines, revealing a pristine landscape bathed in radiant dawn light as nature gently stirs awake to greet a brand-new day of untamed wonder.

A magnificent herd of wild horses gallops through the wide-open meadow, their muscular bodies moving in effortless synchronization. Fresh mountain breezes ripple through their untamed manes while thunderous hooves leave faint impressions in the damp soil, embodying the pure, uninhibited freedom of the wilderness.

Deep within the secluded forest, a crystal-clear mountain stream flows over smooth moss-covered stones and fallen cedar logs. Soft ambient light filters through the towering canopy, illuminating vibrant ferns and dancing droplets of spray that nourish this thriving, untouched woodland sanctuary throughout the changing seasons.

High above the steep red rock canyon, a golden eagle glides effortlessly on rising thermal currents. Its keen gaze surveys the vast wilderness stretching toward the distant horizon, floating with majestic grace and commanding authority over the boundless skies of this rugged American frontier.

As darkness settles across the silent wilderness, millions of luminous stars ignite the night sky. The glowing ribbon of the Milky Way stretches overhead like fine diamond dust, reminding us of the infinite beauty and timeless mystery that envelops our fragile, precious planet.`,

      30: `The sun rises majestically over the misty mountain range, casting warm golden rays across the peaceful valley below. Morning fog slowly dissipates among ancient pines, revealing a pristine landscape bathed in radiant dawn light as nature gently stirs awake to greet a brand-new day of untamed wonder. Every ridge catches the amber glow, creating dramatic shadows that sculpt the earth in timeless elegance and quiet majesty.

A magnificent herd of wild horses gallops through the wide-open meadow, their muscular bodies moving in effortless synchronization. Fresh mountain breezes ripple through their untamed manes while thunderous hooves leave faint impressions in the damp soil, embodying the pure, uninhibited freedom of the wilderness. They run without restraint toward the distant foothills, driven by instinct and the boundless spirit of the untamed plains.

Deep within the secluded forest, a crystal-clear mountain stream flows over smooth moss-covered stones and fallen cedar logs. Soft ambient light filters through the towering canopy, illuminating vibrant ferns and dancing droplets of spray that nourish this thriving, untouched woodland sanctuary throughout the changing seasons. The gentle music of bubbling water echoes among the giant redwoods, creating an atmosphere of deep tranquility and restorative calm.

High above the steep red rock canyon, a golden eagle glides effortlessly on rising thermal currents. Its keen gaze surveys the vast wilderness stretching toward the distant horizon, floating with majestic grace and commanding authority over the boundless skies of this rugged American frontier. With barely a tilt of its wings, the master hunter navigates gusts of mountain wind with absolute precision and unmatched aerial poise.

As darkness settles across the silent wilderness, millions of luminous stars ignite the night sky. The glowing ribbon of the Milky Way stretches overhead like fine diamond dust, reminding us of the infinite beauty and timeless mystery that envelops our fragile, precious planet. A soothing midnight stillness blankets the forest floor, offering peace to all creatures resting under the celestial dome.`,
    },
  },
  {
    title: "Futuristic Metropolis & AI",
    category: "Sci-Fi & Tech",
    scripts: {
      10: `Towering megastructures pierce the neon skyline as autonomous transport pods glide along elevated magnetic conduits in the cybernetic core.

Quantum supercomputers synthesize vast oceans of global telemetry, orchestrating city infrastructure and energy grids with instantaneous predictive precision.

Bioluminescent sky-gardens cascade down glass facades, purifying atmosphere and sustaining millions within vertical self-contained futuristic carbon-neutral ecosystems.

Holographic information displays shimmer across bustling pedestrian concourses, connecting human citizens with intelligent synthetic companions in harmonious coexistence.

Dusk transforms the cyber metropolis into a vibrant symphony of electric violet, pulsing with the limitless promise of human technological evolution.`,

      20: `Towering megastructures pierce the neon-drenched skyline as autonomous aerial transport pods glide silently along elevated magnetic conduits. Below, the bustling cybernetic metropolis pulses with electric vitality, illuminated by cascading digital billboards that reflect off gleaming titanium facades in the heart of our world's first true smart city.

Quantum supercomputers synthesize vast oceans of planetary telemetry, optimizing traffic flow, energy distribution, and public safety in real time with flawless precision. Deep learning neural networks work harmoniously behind the scenes, anticipating urban needs and resolving civic challenges before citizens even notice a single disruption.

Bioluminescent vertical sky-gardens wrap around glass towers, naturally filtering urban air while providing fresh organic produce to residential sectors. Automated robotic tenders nurture lush flora hanging hundreds of meters above street level, creating a striking harmony between advanced synthetic engineering and thriving biological nature.

Holographic communication hubs illuminate pedestrian plazas where diverse communities interact with artificial intelligence guides and digital concierges. Augmented reality interfaces blend smoothly into daily living, allowing people to work, collaborate, and exchange ideas across physical boundaries with fluid, effortless technological immersion.

As twilight falls over the cybernetic metropolis, thousands of architectural accent lights ignite in vibrant amber and sapphire hues. The futuristic cityscape glows with the collective ambition of humanity, standing as an enduring beacon of progress, creativity, and the infinite promise of tomorrow.`,

      30: `Towering megastructures pierce the neon-drenched skyline as autonomous aerial transport pods glide silently along elevated magnetic conduits. Below, the bustling cybernetic metropolis pulses with electric vitality, illuminated by cascading digital billboards that reflect off gleaming titanium facades in the heart of our world's first true smart city. Automated freight corridors hum efficiently underground, ensuring seamless commerce without congesting the sleek skyways above.

Quantum supercomputers synthesize vast oceans of planetary telemetry, optimizing traffic flow, energy distribution, and public safety in real time with flawless precision. Deep learning neural networks work harmoniously behind the scenes, anticipating urban needs and resolving civic challenges before citizens even notice a single disruption. The city operates like a living, breathing sentient organism, perfectly balanced between technological efficiency and human well-being.

Bioluminescent vertical sky-gardens wrap around glass towers, naturally filtering urban air while providing fresh organic produce to residential sectors. Automated robotic tenders nurture lush flora hanging hundreds of meters above street level, creating a striking harmony between advanced synthetic engineering and thriving biological nature. Residents stroll through suspended botanical walkways, enjoying serene natural green spaces perched high above the metropolitan hum.

Holographic communication hubs illuminate pedestrian plazas where diverse communities interact with artificial intelligence guides and digital concierges. Augmented reality interfaces blend smoothly into daily living, allowing people to work, collaborate, and exchange ideas across physical boundaries with fluid, effortless technological immersion. Innovation sparks at every corner as creative minds gather in open civic labs to design the next generation of transformative tools.

As twilight falls over the cybernetic metropolis, thousands of architectural accent lights ignite in vibrant amber and sapphire hues. The futuristic cityscape glows with the collective ambition of humanity, standing as an enduring beacon of progress, creativity, and the infinite promise of tomorrow. Looking down from the orbital skybridges, one sees a civilization fully united in purpose, courage, and technological wonder.`,
    },
  },
  {
    title: "Ocean Exploration & Marine Life",
    category: "Adventure",
    scripts: {
      10: `Sunlight shimmers through turquoise waves, illuminating white sands and vibrant schools of reef fish dancing across crystal ocean waters.

A graceful sea turtle glides through azure currents, steering effortlessly between blooming coral gardens and undulating sea anemones.

A luxury sailboat cuts through open tropical swells, propelled by warm trade winds toward an uncharted volcanic paradise archipelago.

Playful dolphins breach alongside the bow wave, performing joyful acrobatic leaps in celebration of freedom and maritime camaraderie.

The golden sun sinks beneath the endless horizon, painting the sky and ocean in fiery shades of vermilion and rose.`,

      20: `Sunlight shimmers through pristine turquoise waters, casting shimmering ribbons of light across the powdery ocean floor. Colorful schools of reef fish dart playfully between intricate coral formations, their iridescent scales flashing with every sudden turn in this lively underwater paradise that teems with biodiversity and vibrant marine life.

A magnificent sea turtle navigates the ocean current with effortless grace, using its powerful flippers to glide over sprawling fields of sea grass. Having traveled thousands of miles across open seas, it returns to familiar nesting grounds, embodying the timeless rhythm and enduring resilience of ocean life.

A sleek expedition vessel charts its course across deep ocean swells, propelled by steady trade winds toward remote volcanic islands on the horizon. The crew gathers on the sunlit deck, adjusting navigation gear while surveying the vast azure waters that hold untold mysteries beneath the rolling waves.

A playful pod of dolphins gathers around the ship's bow, matching its speed with energetic leaps and synchronous twists. Their joyful vocalizations echo through the water as they leap into the warm air, celebrating the sheer delight of movement and kinship in their boundless marine sanctuary.

As late afternoon fades into twilight, the western sky blazes with brilliant amber, violet, and crimson reflections upon the calm water surface. The gentle ocean breathes beneath the darkening canopy of stars, inviting travelers to reflect on the immense majesty of our planet's sacred waters.`,

      30: `Sunlight shimmers through pristine turquoise waters, casting shimmering ribbons of light across the powdery ocean floor. Colorful schools of reef fish dart playfully between intricate coral formations, their iridescent scales flashing with every sudden turn in this lively underwater paradise that teems with biodiversity and vibrant marine life. Delicate sea fans sway gently with each passing swell, creating a mesmerizing ballet of color and motion.

A magnificent sea turtle navigates the ocean current with effortless grace, using its powerful flippers to glide over sprawling fields of sea grass. Having traveled thousands of miles across open seas, it returns to familiar nesting grounds, embodying the timeless rhythm and enduring resilience of ocean life. Nearby, curious reef rays flutter along sandy channels, foraging undisturbed in the warm equatorial sunlight.

A sleek expedition vessel charts its course across deep ocean swells, propelled by steady trade winds toward remote volcanic islands on the horizon. The crew gathers on the sunlit deck, adjusting navigation gear while surveying the vast azure waters that hold untold mysteries beneath the rolling waves. Every nautical mile brings fresh discoveries, from uncharted seamounts to rare pelagic species thriving in oceanic depths.

A playful pod of dolphins gathers around the ship's bow, matching its speed with energetic leaps and synchronous twists. Their joyful vocalizations echo through the water as they leap into the warm air, celebrating the sheer delight of movement and kinship in their boundless marine sanctuary. Travelers watch in awe as these intelligent mammals accompany the vessel for miles across the sparkling open sea.

As late afternoon fades into twilight, the western sky blazes with brilliant amber, violet, and crimson reflections upon the calm water surface. The gentle ocean breathes beneath the darkening canopy of stars, inviting travelers to reflect on the immense majesty of our planet's sacred waters. A tranquil serenity envelopes the horizon, sealing another unforgettable day of oceanic adventure under the peaceful twilight.`,
    },
  },
];
