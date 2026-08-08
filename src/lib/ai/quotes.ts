export const GARDENING_QUOTES: string[] = [
  "The glory of gardening: hands in the dirt, head in the sun, heart with nature. — Alfred Austin",
  "A garden requires patient labor and attention. Plants do not grow merely to satisfy ambitions. — Liberty Hyde Bailey",
  "Gardening adds years to your life and life to your years.",
  "The best time to plant a tree was 20 years ago. The second best time is now.",
  "To plant a garden is to believe in tomorrow. — Audrey Hepburn",
  "A society grows great when old gardeners plant seeds whose shade they know they shall never sit in.",
  "Weeds are flowers too, once you get to know them. — A.A. Milne",
  "The garden suggests there might be a place where we can meet nature halfway. — Michael Pollan",
  "Gardens are not made by singing 'Oh, how beautiful' and sitting in the shade. — Rudyard Kipling",
  "One of the healthiest ways to gamble is with a spade and a package of garden seeds.",
  "Half the interest of a garden is the constant exercise of the imagination.",
  "There are no gardening mistakes, only experiments.",
  "In every gardener there is a child who believes in the seed fairy.",
  "The love of gardening is a seed once sown that never dies.",
  "Give me a grimy hand, a broken nail, a dirty apron, and I will show you a gardener.",
  "Nurturing a garden, like nurturing a life, requires patience and faith.",
  "A garden is a grand teacher. It teaches patience and careful watchfulness.",
  "Plant your own garden and decorate your own soul.",
  "Every gardener knows that under the cloak of winter lies a miracle. — Barbara Winkler",
];

export function randomQuote(): string {
  return GARDENING_QUOTES[Math.floor(Math.random() * GARDENING_QUOTES.length)];
}
