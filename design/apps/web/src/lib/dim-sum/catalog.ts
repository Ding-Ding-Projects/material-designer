// GENERATED FILE — do not edit by hand.
//
// Written by `node scripts/generate-dim-sum-catalog.mjs` from the verified
// catalogue at `assets/dim-sum/index.json`. Every photograph named here is
// bundled under `public/dim-sum/`, copied byte-for-byte from that catalogue
// and re-verified by SHA-256 at generation time. The app never fetches a dish
// image over the network, and nothing here was generated or re-encoded.
//
// One dish per category, lowest id in each — a deterministic spread across
// every kind of dish the catalogue holds.

export interface DimSumName {
  /** English name, exactly as the catalogue records it. */
  readonly en: string;
  /** Traditional Chinese name, exactly as the catalogue records it. */
  readonly zhHant: string;
}

export interface DimSumAlt {
  readonly en: string;
  readonly yue: string;
}

export interface DimSumDish {
  readonly id: string;
  readonly slug: string;
  readonly category: string;
  readonly name: DimSumName;
  readonly jyutping: string;
  /** App-absolute URL of the bundled photograph. */
  readonly image: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly alt: DimSumAlt;
}

export const DIM_SUM_SOURCE = 'assets/dim-sum/index.json';
export const DIM_SUM_SCHEMA_VERSION = '1.0.0';
export const DIM_SUM_IMAGE_BASE = '/dim-sum/';

export const DIM_SUM_CATALOGUE: readonly DimSumDish[] = [
  {
    id: 'hk-dish-0260',
    slug: 'chocolate-lava-egg-tart',
    category: 'Chocolate dim sum',
    name: {
      en: 'Chocolate Lava Egg Tart',
      zhHant: '朱古力流心蛋撻',
    },
    jyutping: 'zyu1 gu2 lik1 lau4 sam1 daan6 taat1',
    image: '/dim-sum/hk-dish-0260-chocolate-lava-egg-tart.png',
    bytes: 2297490,
    sha256: '8fdb5a46ac8b325893c72fed9dcb8c3ea09c442b210cfbc78749d30be51de80b',
    alt: {
      en: 'Close catalog photograph of chocolate-filled Chocolate Lava Egg Tart served on Hong Kong restaurant tableware.',
      yue: '朱古力餡「朱古力流心蛋撻」用港式餐廳器皿上枱嘅近鏡點心相。',
    },
  },
  {
    id: 'hk-dish-0271',
    slug: 'sweet-and-sour-pork-with-pineapple',
    category: 'Pork',
    name: {
      en: 'Sweet and Sour Pork with Pineapple',
      zhHant: '菠蘿咕嚕肉',
    },
    jyutping: 'bo1 lo4 gu1 lou1 juk6',
    image: '/dim-sum/hk-dish-0271-sweet-and-sour-pork-with-pineapple.png',
    bytes: 2335342,
    sha256: '8ce9e9fb1de108ae0912fe1604cd2590b79075c9f80a97bd0fcdfa02a4136b7b',
    alt: {
      en: 'Close catalog photograph of Sweet and Sour Pork with Pineapple served on Hong Kong restaurant tableware.',
      yue: '港式「菠蘿咕嚕肉」用餐廳器皿上枱嘅近鏡菜式相。',
    },
  },
  {
    id: 'hk-dish-0296',
    slug: 'beef-with-black-bean-and-peppers',
    category: 'Beef',
    name: {
      en: 'Beef with Black Bean and Peppers',
      zhHant: '豉椒炒牛肉',
    },
    jyutping: 'si6 ziu1 caau2 ngau4 juk6',
    image: '/dim-sum/hk-dish-0296-beef-with-black-bean-and-peppers.png',
    bytes: 2628037,
    sha256: 'ae29785c43704169f4176aa502aeeef99a8a649a63daccf49ca83c244e841167',
    alt: {
      en: 'Close catalog photograph of Beef with Black Bean and Peppers served on Hong Kong restaurant tableware.',
      yue: '港式「豉椒炒牛肉」用餐廳器皿上枱嘅近鏡菜式相。',
    },
  },
  {
    id: 'hk-dish-0406',
    slug: 'claypot-rice-with-chinese-sausage',
    category: 'Claypot and banquet',
    name: {
      en: 'Claypot Rice with Chinese Sausage',
      zhHant: '臘腸臘肉煲仔飯',
    },
    jyutping: 'laap6 coeng2 laap6 juk6 bou1 zai2 faan6',
    image: '/dim-sum/hk-dish-0406-claypot-rice-with-chinese-sausage.png',
    bytes: 2626126,
    sha256: 'b37d52b2e7fd98f1e7ca72bed402ded70a9be133a05704fd0f771c950f41395d',
    alt: {
      en: 'Close catalog photograph of Claypot Rice with Chinese Sausage served on Hong Kong restaurant tableware.',
      yue: '港式「臘腸臘肉煲仔飯」用餐廳器皿上枱嘅近鏡菜式相。',
    },
  },
  {
    id: 'hk-dish-0446',
    slug: 'wonton-noodles',
    category: 'Noodles',
    name: {
      en: 'Wonton Noodles',
      zhHant: '雲吞麵',
    },
    jyutping: 'wan4 tan1 min6',
    image: '/dim-sum/hk-dish-0446-wonton-noodles.png',
    bytes: 2470773,
    sha256: '8b4940630951da60aef6b18aff49c39bd7cf094c7b3f763f2bd314ba8296fe89',
    alt: {
      en: 'Close catalog photograph of Wonton Noodles served on Hong Kong restaurant tableware.',
      yue: '港式「雲吞麵」用餐廳器皿上枱嘅近鏡菜式相。',
    },
  },
  {
    id: 'hk-dish-0526',
    slug: 'dai-pai-dong-style-dry-fried-beef-ho-fun',
    category: 'Dai Pai Dong',
    name: {
      en: 'Dai Pai Dong-Style Dry-Fried Beef Ho Fun',
      zhHant: '大牌檔式乾炒牛河',
    },
    jyutping: 'daai6 paai2 dong3 sik1 gon1 caau2 ngau4 ho2',
    image: '/dim-sum/hk-dish-0526-dai-pai-dong-style-dry-fried-beef-ho-fun.png',
    bytes: 2412386,
    sha256: '6da771f5e11d626c4317c4abaa13da3c373eb4c2eb848af8e002e6f5a949aa88',
    alt: {
      en: 'A single serving of Dai Pai Dong-Style Dry-Fried Beef Ho Fun, wok-charred wide rice noodles tangled with sliced beef bean sprouts and chives.',
      yue: '一份擺喺香港大牌檔嘅舊雲石枱嘅大牌檔式乾炒牛河。',
    },
  },
  {
    id: 'hk-dish-0551',
    slug: 'cha-chaan-teng-baked-pork-chop-rice',
    category: 'Cha Chaan Teng',
    name: {
      en: 'Cha Chaan Teng Baked Pork Chop Rice',
      zhHant: '茶記焗豬扒飯',
    },
    jyutping: 'caa4 gei3 guk6 zyu1 paa2 faan6',
    image: '/dim-sum/hk-dish-0551-cha-chaan-teng-baked-pork-chop-rice.png',
    bytes: 2168471,
    sha256: '666367becf0f231e864dde3f8f7d67859dc1c2bebf91cc6d443a499f231ee9af',
    alt: {
      en: 'A single serving of Cha Chaan Teng Baked Pork Chop Rice, a pork chop over rice under tangy tomato sauce and browned melted cheese.',
      yue: '一份擺喺懷舊香港茶餐廳入面嘅綠邊枱嘅茶記焗豬扒飯。',
    },
  },
  {
    id: 'hk-dish-0560',
    slug: 'chocolate-filled-sesame-balls',
    category: 'Festival Food',
    name: {
      en: 'Chocolate-Filled Sesame Balls',
      zhHant: '巧克力流心煎堆',
    },
    jyutping: 'haau2 haak1 lik6 lau4 sam1 zin1 deoi1',
    image: '/dim-sum/hk-dish-0560-chocolate-filled-sesame-balls.png',
    bytes: 2186744,
    sha256: '40305ade70523ae74ffdf9f88bca386ae03846321748e6e23c7ddd81999f9046',
    alt: {
      en: 'A single serving of Chocolate-Filled Sesame Balls, golden sesame-coated rice balls with one split to show a thick dark-chocolate filling.',
      yue: '一份喺香港農曆新年家庭聚會嘅紅色佈置餐枱上擺好嘅巧克力流心煎堆。',
    },
  },
  {
    id: 'hk-dish-0600',
    slug: 'chocolate-lava-ma-lai-go',
    category: 'Hong Kong Bakery',
    name: {
      en: 'Chocolate Lava Ma Lai Go',
      zhHant: '巧克力流心馬拉糕',
    },
    jyutping: 'haau2 haak1 lik6 lau4 sam1 maa5 laai1 gou1',
    image: '/dim-sum/hk-dish-0600-chocolate-lava-ma-lai-go.png',
    bytes: 2464527,
    sha256: 'c605af6ab05c77b989248af1f33b20240daa8ed0d8a744f51e74ee7ea7ad460e',
    alt: {
      en: 'A single serving of Chocolate Lava Ma Lai Go, a tall steamed brown-sugar sponge cake cut open around a warm dark-chocolate core.',
      yue: '一份擺喺傳統香港餅店入面嘅玻璃面陳列盤嘅巧克力流心馬拉糕。',
    },
  },
  {
    id: 'hk-dish-0626',
    slug: 'hong-kong-dessert-shop-mango-pomelo-sago',
    category: 'Hong Kong Dessert',
    name: {
      en: 'Hong Kong Dessert-Shop Mango Pomelo Sago',
      zhHant: '香港甜品舖楊枝甘露',
    },
    jyutping: 'hoeng1 gong2 tim4 ban2 pou3 joeng4 zi1 gam1 lou6',
    image: '/dim-sum/hk-dish-0626-hong-kong-dessert-shop-mango-pomelo-sago.png',
    bytes: 2024379,
    sha256: '4b98c60cca5cd0175662de616c4b4dd102f0652854d03e906c5fb1b6ef1652b3',
    alt: {
      en: 'A single serving of Hong Kong Dessert-Shop Mango Pomelo Sago, a chilled golden mango cream with sago pearls pomelo sacs and mango cubes.',
      yue: '一份喺溫暖嘅香港糖水舖大理石枱上擺好嘅香港甜品舖楊枝甘露。',
    },
  },
  {
    id: 'hk-dish-0676',
    slug: 'hong-kong-milk-tea',
    category: 'Hong Kong Drinks',
    name: {
      en: 'Hong Kong Milk Tea',
      zhHant: '港式奶茶',
    },
    jyutping: 'gong2 sik1 naai5 caa4',
    image: '/dim-sum/hk-dish-0676-hong-kong-milk-tea.png',
    bytes: 2173311,
    sha256: '1d7749477def44031f10cc760ae521b56b917cfffcc60d9965444815602c8b1c',
    alt: {
      en: 'A single serving of Hong Kong Milk Tea, strong copper-brown milk tea in a thick white ceramic cup and saucer.',
      yue: '一份擺喺懷舊香港茶餐廳入面嘅綠邊枱嘅港式奶茶。',
    },
  },
  {
    id: 'hk-dish-0701',
    slug: 'haw-flake-discs',
    category: 'Nostalgic Hong Kong',
    name: {
      en: 'Haw Flake Discs',
      zhHant: '山楂餅',
    },
    jyutping: 'saan1 zaa1 beng2',
    image: '/dim-sum/hk-dish-0701-haw-flake-discs.png',
    bytes: 2320899,
    sha256: '48fd35810463dcdcfc9f2c52a1a7dbc24879731fddc649cc94c9c9d116bc0b7e',
    alt: {
      en: 'A single serving of Haw Flake Discs, thin rust-red haw flakes stacked into neat coin-shaped discs without branded wrapping.',
      yue: '一份擺喺懷舊香港街坊舖入面嘅斑點櫃枱嘅山楂餅。',
    },
  },
];
