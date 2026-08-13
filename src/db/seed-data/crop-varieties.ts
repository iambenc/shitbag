/**
 * Well-known cultivars of the curated crops in crops.ts — real varieties
 * widely sold by UK seed suppliers (Thompson & Morgan, Suttons, Mr Fothergill's,
 * etc.), not AI-generated. Mirrors CropFactsSeed's own "reasonable general-
 * knowledge approximation, not an authoritative dataset" spirit: every
 * override field is left null unless it's a genuinely well-established,
 * commonly-cited distinguishing trait for that cultivar — don't manufacture
 * false precision (an exact spacing/days-to-harvest number) just to fill a
 * field, same principle varietyFacts.ts's own prompt is built around for the
 * AI-backfill path this data complements.
 *
 * cropSlug must match an existing crops.slug (see crops.ts) — seed.ts
 * resolves it to a real cropId at insert time, same two-step pattern
 * equipment.ts's partnerLinkLabel/Url resolution already uses.
 */
export type CropVarietySeed = {
  cropSlug: string;
  slug: string;
  name: string;
  daysToHarvestMin: number | null;
  daysToHarvestMax: number | null;
  spacingCm: number | null;
  growthHabit: string | null;
  diseaseResistanceNotes: string | null;
  characteristics: string | null;
  estimatedRetailPricePerKgGbp: number | null;
};

export const cropVarietySeeds: CropVarietySeed[] = [
  // Tomato
  { cropSlug: "tomato", slug: "moneymaker", name: "Moneymaker", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "cordon (indeterminate)", diseaseResistanceNotes: "Good general disease tolerance", characteristics: "Reliable, heavy-cropping classic UK favourite with medium-sized fruit.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "tomato", slug: "gardeners-delight", name: "Gardener's Delight", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "cordon (indeterminate)", diseaseResistanceNotes: null, characteristics: "Sweet, prolific cherry tomato — one of the most popular home-garden cherry varieties.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "tomato", slug: "alicante", name: "Alicante", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "cordon (indeterminate)", diseaseResistanceNotes: null, characteristics: "Classic smooth-skinned slicing tomato, reliable outdoors or under cover.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "tomato", slug: "tumbling-tom", name: "Tumbling Tom", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "bush (trailing)", diseaseResistanceNotes: null, characteristics: "Compact trailing habit bred for hanging baskets and pots; heavy crop of small cherry fruit.", estimatedRetailPricePerKgGbp: null },

  // Potato
  { cropSlug: "potato", slug: "maris-piper", name: "Maris Piper", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: "Good eelworm resistance", characteristics: "The classic all-purpose maincrop — floury, excellent for chips and roasting.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "potato", slug: "charlotte", name: "Charlotte", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Waxy second-early salad potato, holds its shape well when boiled.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "potato", slug: "king-edward", name: "King Edward", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Traditional maincrop with pink-blushed skin, floury texture, classic for roasting.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "potato", slug: "desiree", name: "Desiree", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: "Reasonable drought tolerance", characteristics: "Red-skinned maincrop, waxy-floury texture, good all-rounder.", estimatedRetailPricePerKgGbp: null },

  // Carrot
  { cropSlug: "carrot", slug: "nantes", name: "Nantes", daysToHarvestMin: 55, daysToHarvestMax: 70, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Early, cylindrical, near-coreless and sweet — a classic reliable choice.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "carrot", slug: "chantenay", name: "Chantenay", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Short, stump-rooted variety that copes well with heavier or stony soil.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "carrot", slug: "autumn-king", name: "Autumn King", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Large maincrop variety with good winter storage qualities.", estimatedRetailPricePerKgGbp: null },

  // Onion
  { cropSlug: "onion", slug: "stuttgarter-giant", name: "Stuttgarter Giant", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Early, flattish onion, a reliable heirloom keeper.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "onion", slug: "red-baron", name: "Red Baron", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Classic red-skinned onion with good flavour and reasonable storage life.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "onion", slug: "sturon", name: "Sturon", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Reliable maincrop with excellent storage qualities, a UK allotment staple.", estimatedRetailPricePerKgGbp: null },

  // Courgette
  { cropSlug: "courgette", slug: "zucchini", name: "Zucchini", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "bush", diseaseResistanceNotes: null, characteristics: "The classic dark-green courgette most people picture by default.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "courgette", slug: "defender", name: "Defender", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "bush", diseaseResistanceNotes: "Bred for cucumber mosaic virus resistance", characteristics: "High-yielding, disease-resistant modern variety, a popular reliable choice.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "courgette", slug: "golden-dawn", name: "Golden Dawn", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "bush", diseaseResistanceNotes: null, characteristics: "Bright yellow-skinned courgette, decorative as well as productive.", estimatedRetailPricePerKgGbp: null },

  // Runner Bean
  { cropSlug: "runner-bean", slug: "painted-lady", name: "Painted Lady", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "climbing", diseaseResistanceNotes: null, characteristics: "Heirloom variety with distinctive red-and-white bicolour flowers.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "runner-bean", slug: "scarlet-emperor", name: "Scarlet Emperor", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "climbing", diseaseResistanceNotes: null, characteristics: "Classic scarlet-flowered variety, a heavy and reliable cropper.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "runner-bean", slug: "white-lady", name: "White Lady", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "climbing", diseaseResistanceNotes: null, characteristics: "White-flowered, stringless pods; white flowers are less attractive to some birds than red.", estimatedRetailPricePerKgGbp: null },

  // French Bean
  { cropSlug: "french-bean", slug: "cobra", name: "Cobra", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "climbing", diseaseResistanceNotes: null, characteristics: "Stringless purple-tinged pods on climbing vines, very popular and productive.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "french-bean", slug: "the-prince", name: "The Prince", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "bush (dwarf)", diseaseResistanceNotes: null, characteristics: "Classic dwarf variety, heavy cropper of straight flat pods.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "french-bean", slug: "blue-lake", name: "Blue Lake", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "climbing", diseaseResistanceNotes: null, characteristics: "Stringless round pods, reliable heavy-cropping climbing variety.", estimatedRetailPricePerKgGbp: null },

  // Pea
  { cropSlug: "pea", slug: "kelvedon-wonder", name: "Kelvedon Wonder", daysToHarvestMin: 55, daysToHarvestMax: 65, spacingCm: null, growthHabit: "dwarf", diseaseResistanceNotes: null, characteristics: "Early, compact, reliable — a classic first-choice pea for small plots.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "pea", slug: "hurst-greenshaft", name: "Hurst Greenshaft", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: "Good mildew resistance", characteristics: "Heavy-cropping maincrop with well-filled pods held above the foliage.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "pea", slug: "alderman", name: "Alderman", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "tall (needs support)", diseaseResistanceNotes: null, characteristics: "Tall Victorian heirloom variety with excellent flavour, needs sturdy support.", estimatedRetailPricePerKgGbp: null },

  // Lettuce
  { cropSlug: "lettuce", slug: "little-gem", name: "Little Gem", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Compact sweet cos-type lettuce, quick to mature, very popular.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "lettuce", slug: "salad-bowl", name: "Salad Bowl", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Loose-leaf, cut-and-come-again type — harvest a few leaves at a time.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "lettuce", slug: "webbs-wonderful", name: "Webbs Wonderful", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Large crisphead variety with crunchy, well-blanched hearts.", estimatedRetailPricePerKgGbp: null },

  // Spinach
  { cropSlug: "spinach", slug: "bloomsdale", name: "Bloomsdale", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Heavily savoyed (crinkled) dark green leaves, slower to bolt than many types.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "spinach", slug: "perpetual-spinach", name: "Perpetual Spinach", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Technically a leaf beet, but grown and used like spinach — much less prone to bolting.", estimatedRetailPricePerKgGbp: null },

  // Kale
  { cropSlug: "kale", slug: "cavolo-nero", name: "Cavolo Nero", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Tuscan kale with dark, strappy, blistered leaves; sweeter after a frost.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "kale", slug: "redbor", name: "Redbor", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Frilly, deep purple-red curly kale — ornamental as well as edible.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "kale", slug: "dwarf-green-curled", name: "Dwarf Green Curled", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "dwarf", diseaseResistanceNotes: null, characteristics: "Classic hardy curly kale, compact habit, stands well through winter.", estimatedRetailPricePerKgGbp: null },

  // Cabbage
  { cropSlug: "cabbage", slug: "hispi", name: "Hispi", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Fast-maturing pointed summer cabbage, sweet and tender.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "cabbage", slug: "golden-acre", name: "Golden Acre", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Compact round-headed early summer cabbage, reliable heirloom.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "cabbage", slug: "january-king", name: "January King", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: "Very frost-hardy", characteristics: "Savoy-type winter cabbage with attractive purple-tinged, crinkled leaves.", estimatedRetailPricePerKgGbp: null },

  // Broccoli
  { cropSlug: "broccoli", slug: "purple-sprouting", name: "Purple Sprouting", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "overwintering", diseaseResistanceNotes: "Good winter hardiness", characteristics: "Produces many small purple spears over winter/spring rather than one head.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "broccoli", slug: "calabrese", name: "Calabrese", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "The classic single-headed green broccoli sold fresh in supermarkets.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "broccoli", slug: "de-cicco", name: "De Cicco", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Italian heirloom sprouting type — a small central head followed by many side shoots.", estimatedRetailPricePerKgGbp: null },

  // Beetroot (Detroit 2 already exists in the live catalog via AI backfill —
  // included here too for a complete curated record; the idempotent seed
  // insert skips it automatically since the slug already exists)
  { cropSlug: "beetroot", slug: "detroit-2", name: "Detroit 2", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Reliable, uniform globe-shaped roots with sweet dark red flesh — the classic beetroot.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "beetroot", slug: "boltardy", name: "Boltardy", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: "Bred to resist bolting from early sowing", characteristics: "The go-to variety for sowing early in the season without risking premature bolting.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "beetroot", slug: "chioggia", name: "Chioggia", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Italian heirloom with striking pink-and-white candy-striped rings inside.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "beetroot", slug: "cylindra", name: "Cylindra", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Cylindrical (not round) roots that slice into uniform rounds — good for preserving.", estimatedRetailPricePerKgGbp: null },

  // Radish
  { cropSlug: "radish", slug: "french-breakfast", name: "French Breakfast", daysToHarvestMin: 21, daysToHarvestMax: 28, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Elongated roots, red with a white tip, mild flavour, very fast-maturing.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "radish", slug: "cherry-belle", name: "Cherry Belle", daysToHarvestMin: 21, daysToHarvestMax: 28, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Classic round bright red radish, crisp and mild, a fast reliable cropper.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "radish", slug: "black-spanish", name: "Black Spanish", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Large winter radish with black skin and pungent white flesh; stores much longer than summer radishes.", estimatedRetailPricePerKgGbp: null },

  // Spring Onion
  { cropSlug: "spring-onion", slug: "white-lisbon", name: "White Lisbon", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "The classic fast-growing, mild-flavoured spring onion.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "spring-onion", slug: "north-holland-blood-red", name: "North Holland Blood Red", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Red-skinned, decorative as well as tasty, slightly stronger flavour than White Lisbon.", estimatedRetailPricePerKgGbp: null },

  // Garlic
  { cropSlug: "garlic", slug: "solent-wight", name: "Solent Wight", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "softneck", diseaseResistanceNotes: null, characteristics: "Well-suited to UK growing conditions, strong flavour, stores well.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "garlic", slug: "early-purple-wight", name: "Early Purple Wight", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "hardneck", diseaseResistanceNotes: null, characteristics: "Purple-streaked cloves, matures earlier than most, robust flavour.", estimatedRetailPricePerKgGbp: null },

  // Leek
  { cropSlug: "leek", slug: "musselburgh", name: "Musselburgh", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: "Very frost-hardy", characteristics: "Classic Scottish heirloom with thick stems, a reliable overwintering variety.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "leek", slug: "autumn-giant", name: "Autumn Giant", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Thick-stemmed early-to-mid variety, ready before the depths of winter.", estimatedRetailPricePerKgGbp: null },

  // Sweetcorn
  { cropSlug: "sweetcorn", slug: "swift", name: "Swift", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Early variety bred to crop reliably even in a cooler UK summer.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "sweetcorn", slug: "lark", name: "Lark", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Supersweet variety with a notably high sugar content.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "sweetcorn", slug: "golden-bantam", name: "Golden Bantam", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Classic heirloom variety with rich, traditional corn flavour.", estimatedRetailPricePerKgGbp: null },

  // Squash
  { cropSlug: "squash", slug: "crown-prince", name: "Crown Prince", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Distinctive grey-blue skin, deep orange flesh, excellent flavour and long storage life.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "squash", slug: "uchiki-kuri", name: "Uchiki Kuri", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Onion-shaped squash with orange skin and sweet, nutty flesh; skin is edible when cooked.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "squash", slug: "butternut", name: "Butternut", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "The familiar pale tan, pear-shaped squash with sweet orange flesh.", estimatedRetailPricePerKgGbp: null },

  // Strawberry
  { cropSlug: "strawberry", slug: "cambridge-favourite", name: "Cambridge Favourite", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: "Reasonably disease-tolerant", characteristics: "Long-standing reliable UK garden favourite, good flavour and heavy cropping.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "strawberry", slug: "elsanta", name: "Elsanta", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "The commercial standard variety — large, firm, glossy fruit.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "strawberry", slug: "honeoye", name: "Honeoye", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Early, very productive variety with good, slightly tart flavour.", estimatedRetailPricePerKgGbp: null },

  // Raspberry
  { cropSlug: "raspberry", slug: "glen-ample", name: "Glen Ample", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "summer-fruiting", diseaseResistanceNotes: null, characteristics: "Spineless canes, large fruit, one of the most widely grown summer varieties.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "raspberry", slug: "autumn-bliss", name: "Autumn Bliss", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "autumn-fruiting", diseaseResistanceNotes: null, characteristics: "Very popular, easy-to-grow autumn-fruiting variety — canes are simply cut down each winter.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "raspberry", slug: "malling-jewel", name: "Malling Jewel", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "summer-fruiting", diseaseResistanceNotes: null, characteristics: "Compact variety with excellent, classic raspberry flavour.", estimatedRetailPricePerKgGbp: null },

  // Chilli Pepper
  { cropSlug: "chilli-pepper", slug: "jalapeno", name: "Jalapeño", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Medium heat, thick-walled pods, the most familiar chilli variety by far.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "chilli-pepper", slug: "cayenne", name: "Cayenne", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Long, thin, hot pods — the type most often dried and ground into cayenne pepper.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "chilli-pepper", slug: "scotch-bonnet", name: "Scotch Bonnet", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Very hot Caribbean heirloom with a distinctive fruity flavour alongside the heat.", estimatedRetailPricePerKgGbp: null },

  // Cucumber
  { cropSlug: "cucumber", slug: "marketmore", name: "Marketmore", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "outdoor (ridge)", diseaseResistanceNotes: "Good disease tolerance", characteristics: "Reliable outdoor variety, straight dark green fruit, widely grown.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "cucumber", slug: "telegraph-improved", name: "Telegraph Improved", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: "greenhouse", diseaseResistanceNotes: null, characteristics: "Long, smooth-skinned greenhouse variety, a Victorian-era classic.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "cucumber", slug: "crystal-lemon", name: "Crystal Lemon", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Round, yellow, lemon-shaped heirloom fruit with a mild, crisp flavour.", estimatedRetailPricePerKgGbp: null },

  // Basil
  { cropSlug: "basil", slug: "genovese", name: "Genovese", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "The classic sweet Italian basil, the standard choice for pesto.", estimatedRetailPricePerKgGbp: null },
  { cropSlug: "basil", slug: "thai-basil", name: "Thai Basil", daysToHarvestMin: null, daysToHarvestMax: null, spacingCm: null, growthHabit: null, diseaseResistanceNotes: null, characteristics: "Anise/liquorice-scented leaves, more heat-tolerant than sweet basil.", estimatedRetailPricePerKgGbp: null },
];
