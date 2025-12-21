// 模擬服務者資料
export const mockServiceProviders = [
  {
    id: "1",
    publicListingId: "aB3xY7k", // 刊登ID (7碼)
    name: "專業美髮師 Amy",
    category: "美髮",
    city: "台北市",
    district: "大安區",
    gender: "女",
    coordinates: { lat: 25.033, lng: 121.5654 }, // 大安區座標
    lastLoginAt: "2024-08-19T10:30:00Z",
    description: "10年美髮經驗，專精染燙護髮，時尚造型設計",
    photos: [
      "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=300&fit=crop",
      "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=400&h=300&fit=crop",
      "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=400&h=300&fit=crop",
    ],
    contacts: {
      instagram: "@amy_hair_studio",
      line: "amy_hair",
      facebook: "Amy Hair Studio",
    },
    tags: ["染髮", "燙髮", "護髮", "造型設計"],
    createdAt: "2024-01-15",
    userId: "user1",
  },
  {
    id: "2",
    publicListingId: "1Km9pLq", // 刊登ID (7碼)
    name: "健身教練 Jason",
    category: "健身教練",
    city: "台北市",
    district: "信義區",
    gender: "男",
    coordinates: { lat: 25.0341, lng: 121.5666 }, // 信義區座標
    lastLoginAt: "2024-08-19T08:15:00Z",
    description: "NASM認證健身教練，專精重量訓練與體態雕塑",
    photos: [
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop",
      "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400&h=300&fit=crop",
    ],
    contacts: {
      instagram: "@jason_fitness",
      line: "jason_pt",
    },
    tags: ["重量訓練", "體態雕塑", "NASM認證"],
    createdAt: "2024-01-20",
    userId: "user2",
  },
  {
    id: "3",
    publicListingId: "zN5rT8m", // 刊登ID (7碼)
    name: "專業按摩師 Linda",
    category: "按摩",
    city: "新北市",
    district: "板橋區",
    gender: "女",
    description: "中醫推拿證照，深層肌肉放鬆專家",
    photos: [
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop",
    ],
    contacts: {
      line: "linda_massage",
      facebook: "Linda 養生館",
    },
    tags: ["推拿", "深層按摩", "肌肉放鬆"],
    createdAt: "2024-01-25",
    userId: "user3",
  },
  {
    id: "4",
    publicListingId: "pQ2wE9x", // 刊登ID (7碼)
    name: "美甲師 Chloe",
    category: "美甲",
    city: "台中市",
    district: "西屯區",
    gender: "女",
    description: "日式美甲專家，光療凝膠指甲藝術創作",
    photos: [
      "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&h=300&fit=crop",
      "https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=400&h=300&fit=crop",
    ],
    contacts: {
      instagram: "@chloe_nails",
      line: "chloe_nail_art",
    },
    tags: ["日式美甲", "光療", "指甲藝術"],
    createdAt: "2024-02-01",
    userId: "user4",
  },
  {
    id: "5",
    publicListingId: "mV7hJ2n", // 刊登ID (7碼)
    name: "攝影師 David",
    category: "攝影師",
    city: "高雄市",
    district: "前鎮區",
    gender: "男",
    description: "婚禮紀錄攝影，人像外拍專業攝影師",
    photos: [
      "https://images.unsplash.com/photo-1553835973-dec43bfddbeb?w=400&h=300&fit=crop",
    ],
    contacts: {
      instagram: "@david_photography",
      facebook: "David Photography Studio",
    },
    tags: ["婚禮攝影", "人像攝影", "外拍"],
    createdAt: "2024-02-05",
    userId: "user5",
  },
  {
    id: "6",
    publicListingId: "hR6tK3w", // 刊登ID (7碼)
    name: "美容師 Michelle",
    category: "美容",
    city: "台北市",
    district: "中山區",
    description: "專業臉部護理，痘痘肌膚調理專家，12年美容經驗",
    photos: [
      "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=400&h=300&fit=crop",
      "https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?w=400&h=300&fit=crop",
    ],
    contacts: {
      instagram: "@michelle_skincare",
      line: "michelle_beauty",
      facebook: "Michelle Beauty Salon",
    },
    tags: ["臉部護理", "痘痘調理", "敏感肌護理", "美白"],
    createdAt: "2024-01-18",
    userId: "user6",
  },
  {
    id: "7",
    publicListingId: "fG8yM5p", // 刊登ID (7碼)
    name: "睫毛師 Emma",
    category: "睫毛",
    city: "台北市",
    district: "松山區",
    description: "日韓風睫毛嫁接專家，自然捲翹持久不掉",
    photos: [
      "https://images.unsplash.com/photo-1631730486887-4d138d144c75?w=400&h=300&fit=crop",
    ],
    contacts: {
      instagram: "@emma_lashes",
      line: "emma_eyelash",
    },
    tags: ["睫毛嫁接", "日韓風", "自然捲翹"],
    createdAt: "2024-01-22",
    userId: "user7",
  },
  {
    id: "8",
    publicListingId: "nL4vB9q", // 刊登ID (7碼)
    name: "除毛師 Sophie",
    category: "除毛",
    city: "新北市",
    district: "永和區",
    description: "雷射除毛專業技師，溫和無痛除毛體驗",
    photos: [
      "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=300&fit=crop",
    ],
    contacts: {
      line: "sophie_laser",
      facebook: "Sophie 除毛工作室",
    },
    tags: ["雷射除毛", "溫和無痛", "全身除毛"],
    createdAt: "2024-01-30",
    userId: "user8",
  },
  {
    id: "9",
    publicListingId: "uJ7sD2r", // 刊登ID (7碼)
    name: "紋繡師 Vivian",
    category: "紋繡",
    city: "台中市",
    district: "北屯區",
    description: "韓式半永久紋眉專家，自然野生眉型設計",
    photos: [
      "https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?w=400&h=300&fit=crop",
    ],
    contacts: {
      instagram: "@vivian_brows",
      line: "vivian_tattoo",
    },
    tags: ["半永久紋眉", "韓式眉型", "野生眉"],
    createdAt: "2024-02-03",
    userId: "user9",
  },
  {
    id: "10",
    publicListingId: "wX1cF6t", // 刊登ID (7碼)
    name: "刺青師 Kevin",
    category: "刺青",
    city: "台北市",
    district: "萬華區",
    description: "Old School風格刺青專家，設計與刺青一條龍服務",
    photos: [
      "https://images.unsplash.com/photo-1567701553914-7a30cd1b33ec?w=400&h=300&fit=crop",
    ],
    contacts: {
      instagram: "@kevin_tattoo",
      facebook: "Kevin Tattoo Studio",
    },
    tags: ["Old School", "設計刺青", "客製化"],
    createdAt: "2024-02-08",
    userId: "user10",
  },
  {
    id: "11",
    publicListingId: "eY3nH8v", // 刊登ID (7碼)
    name: "採耳師 Grace",
    category: "採耳",
    city: "台南市",
    district: "中西區",
    description: "專業採耳師，舒壓放鬆療程，古法採耳技術",
    photos: [
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop",
    ],
    contacts: {
      line: "grace_ear",
      facebook: "Grace 採耳工作室",
    },
    tags: ["專業採耳", "古法技術", "舒壓放鬆"],
    createdAt: "2024-02-10",
    userId: "user11",
  },
  {
    id: "12",
    publicListingId: "qZ5mK1x", // 刊登ID (7碼)
    name: "保險顧問 Michael",
    category: "保險",
    city: "台北市",
    district: "中正區",
    description: "壽險規劃專家，退休理財與保障規劃顧問",
    photos: [
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop",
    ],
    contacts: {
      line: "michael_insurance",
      facebook: "Michael 保險規劃",
    },
    tags: ["壽險規劃", "退休理財", "保障規劃"],
    createdAt: "2024-02-12",
    userId: "user12",
  },
  {
    id: "13",
    publicListingId: "iA9pL4y", // 刊登ID (7碼)
    name: "房仲專員 Alice",
    category: "房仲",
    city: "新北市",
    district: "���重區",
    description: "大台北地區房屋買賣專家，投資置產諮詢顧問",
    photos: [
      "https://images.unsplash.com/photo-1494790108755-2616b612b890?w=400&h=300&fit=crop",
    ],
    contacts: {
      line: "alice_realestate",
      facebook: "Alice 房屋仲介",
    },
    tags: ["房屋買賣", "投資置產", "大台北地區"],
    createdAt: "2024-02-15",
    userId: "user13",
  },
  {
    id: "14",
    publicListingId: "oB2rN7z", // 刊登ID (7碼)
    name: "汽車業務 Peter",
    category: "汽車",
    city: "桃園市",
    district: "中壢區",
    description: "進口車銷售專家，提供最優惠價格與完整售後服務",
    photos: [
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=300&fit=crop",
    ],
    contacts: {
      line: "peter_cars",
      facebook: "Peter 進口車銷售",
    },
    tags: ["進口車", "優惠價格", "售後服務"],
    createdAt: "2024-02-18",
    userId: "user14",
  },
  {
    id: "15",
    publicListingId: "sC6tQ3a", // 刊登ID (7碼)
    name: "財務顧問 Jenny",
    category: "財務顧問",
    city: "台北市",
    district: "內湖區",
    description: "CFP認證理財規劃師，個人財務管理與投資建議",
    photos: [
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=300&fit=crop",
    ],
    contacts: {
      instagram: "@jenny_finance",
      line: "jenny_cfp",
    },
    tags: ["CFP認證", "理財規劃", "投資建議"],
    createdAt: "2024-02-20",
    userId: "user15",
  },
  {
    id: "16",
    publicListingId: "kD8vS5b", // 刊登ID (7碼)
    name: "律師 William",
    category: "法律顧問",
    city: "台北市",
    district: "大同區",
    description: "專精民事訴訟與商事法律事務，提供專業法律諮詢",
    photos: [
      "https://images.unsplash.com/photo-1556157382-97eda2d62296?w=400&h=300&fit=crop",
    ],
    contacts: {
      line: "william_lawyer",
      facebook: "William 律師事務所",
    },
    tags: ["民事訴訟", "商事法務", "法律諮詢"],
    createdAt: "2024-02-22",
    userId: "user16",
  },
  {
    id: "17",
    publicListingId: "gE1wT9c", // 刊登ID (7碼)
    name: "平面設計師 Sarah",
    category: "平面設計師",
    city: "台中市",
    district: "南屯區",
    description: "品牌識別設計專家，LOGO設計與視覺規劃",
    photos: [
      "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=400&h=300&fit=crop",
    ],
    contacts: {
      instagram: "@sarah_design",
      line: "sarah_graphics",
    },
    tags: ["品牌識別", "LOGO設計", "視覺規劃"],
    createdAt: "2024-02-25",
    userId: "user17",
  },
  {
    id: "18",
    publicListingId: "mF4xU2d", // 刊登ID (7碼)
    name: "室內設計師 Ryan",
    category: "室內設計師",
    city: "台北市",
    district: "士林區",
    description: "現代簡約風格專家，住宅空間規劃與裝修設計",
    photos: [
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop",
    ],
    contacts: {
      instagram: "@ryan_interior",
      line: "ryan_design",
    },
    tags: ["現代簡約", "住宅設計", "空間規劃"],
    createdAt: "2024-02-28",
    userId: "user18",
  },
  {
    id: "19",
    publicListingId: "yG7zV6e", // 刊登ID (7碼)
    name: "工程師 Alex",
    category: "工程師",
    city: "新竹市",
    district: "東區",
    description: "軟體開發工程師，網站建置與APP開發服務",
    photos: [
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=300&fit=crop",
    ],
    contacts: {
      line: "alex_engineer",
      facebook: "Alex 軟體開發",
    },
    tags: ["軟體開發", "網站建置", "APP開發"],
    createdAt: "2024-03-01",
    userId: "user19",
  },
  {
    id: "20",
    publicListingId: "bH3aW1f", // 刊登ID (7碼)
    name: "會計師 Lisa",
    category: "會計師",
    city: "台北市",
    district: "北投區",
    description: "執業會計師，公司設立與稅務申報專業服務",
    photos: [
      "https://images.unsplash.com/photo-1494790108755-2616b612b890?w=400&h=300&fit=crop",
    ],
    contacts: {
      line: "lisa_accountant",
      facebook: "Lisa 會計師事務所",
    },
    tags: ["公司設立", "稅務申報", "執業會計師"],
    createdAt: "2024-03-03",
    userId: "user20",
  },
];