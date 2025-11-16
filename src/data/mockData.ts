// 從 utils/constants.ts 導入常數
import { GENDER_OPTIONS } from '../utils/constants';

// 為每個服務者分配性別（基於ID的簡單邏輯）
const assignGender = (id: string) => {
  return GENDER_OPTIONS[parseInt(id) % 2]; // 簡單交替分配
};

// 基���姓名或職業的性別推測（簡化版）
const getGenderByName = (name: string) => {
  // 基於常見的女性名字或職業
  const femaleKeywords = ['Amy', 'Linda', 'Chloe', 'Michelle', 'Emma', 'Sophie', 'Vivian', 'Grace', 'Alice', 'Jenny', 'Sarah', 'Luna', 'Crystal', 'Helen', 'Tina', 'Bella', 'Ruby', 'Iris', 'Nancy', 'Victoria', 'Diana', 'Zoe', 'Kate', 'Melody', '美髮師', '美容師', '美甲師', '睫毛師', '除毛師', '紋繡師'];
  
  for (const keyword of femaleKeywords) {
    if (name.includes(keyword)) {
      return '女';
    }
  }
  return '男'; // 預設為男性
};

// 模擬服務者資料
export const mockServiceProviders = [
  {
    id: '1',
    publicListingId: 'aB3xY7k', // 刊登ID (7碼)
    name: '專業美髮師 Amy',
    category: '美髮',
    city: '台北市',
    district: '大安區',
    gender: '女',
    coordinates: { lat: 25.0330, lng: 121.5654 }, // 大安區座標
    lastLoginAt: '2024-08-19T10:30:00Z',
    description: '10年美髮經驗，專精染燙護髮，時尚造型設計',
    photos: [
      'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@amy_hair_studio',
      line: 'amy_hair',
      facebook: 'Amy Hair Studio'
    },
    tags: ['染髮', '燙髮', '護髮', '造型設計'],
    createdAt: '2024-01-15',
    userId: 'user1'
  },
  {
    id: '2',
    publicListingId: '1Km9pLq', // 刊登ID (7碼)
    name: '健身教練 Jason',
    category: '健身教練',
    city: '台北市',
    district: '信義區',
    gender: '男',
    coordinates: { lat: 25.0341, lng: 121.5666 }, // 信義區座標
    lastLoginAt: '2024-08-19T08:15:00Z',
    description: 'NASM認證健身教練，專精重量訓練與體態雕塑',
    photos: [
      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@jason_fitness',
      line: 'jason_pt'
    },
    tags: ['重量訓練', '體態雕塑', 'NASM認證'],
    createdAt: '2024-01-20',
    userId: 'user2'
  },
  {
    id: '3',
    publicListingId: 'zN5rT8m', // 刊登ID (7碼)
    name: '專業按摩師 Linda',
    category: '按摩',
    city: '新北市',
    district: '板橋區',
    gender: '女',
    description: '中醫推拿證照，深層肌肉放鬆專家',
    photos: [
      'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'linda_massage',
      facebook: 'Linda 養生館'
    },
    tags: ['推拿', '深層按摩', '肌肉放鬆'],
    createdAt: '2024-01-25',
    userId: 'user3'
  },
  {
    id: '4',
    publicListingId: 'pQ2wE9x', // 刊登ID (7碼)
    name: '美甲師 Chloe',
    category: '美甲',
    city: '台中市',
    district: '西屯區',
    gender: '女',
    description: '日式美甲專家，光療凝膠指甲藝術創作',
    photos: [
      'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@chloe_nails',
      line: 'chloe_nail_art'
    },
    tags: ['日式美甲', '光療', '指甲藝術'],
    createdAt: '2024-02-01',
    userId: 'user4'
  },
  {
    id: '5',
    publicListingId: 'mV7hJ2n', // 刊登ID (7碼)
    name: '攝影師 David',
    category: '攝影師',
    city: '高雄市',
    district: '前鎮區',
    gender: '男',
    description: '婚禮紀錄攝影，人像外拍專業攝影師',
    photos: [
      'https://images.unsplash.com/photo-1553835973-dec43bfddbeb?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@david_photography',
      facebook: 'David Photography Studio'
    },
    tags: ['婚禮攝影', '人像攝影', '外拍'],
    createdAt: '2024-02-05',
    userId: 'user5'
  },
  {
    id: '6',
    publicListingId: 'hR6tK3w', // 刊登ID (7碼)
    name: '美容師 Michelle',
    category: '美容',
    city: '台北市',
    district: '中山區',
    description: '專業臉部護理，痘痘肌膚調理專家，12年美容經驗',
    photos: [
      'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@michelle_skincare',
      line: 'michelle_beauty',
      facebook: 'Michelle Beauty Salon'
    },
    tags: ['臉部護理', '痘痘調理', '敏感肌護理', '美白'],
    createdAt: '2024-01-18',
    userId: 'user6'
  },
  {
    id: '7',
    publicListingId: 'fG8yM5p', // 刊登ID (7碼)
    name: '睫毛師 Emma',
    category: '睫毛',
    city: '台北市',
    district: '松山區',
    description: '日韓風睫毛嫁接專家，自然捲翹持久不掉',
    photos: [
      'https://images.unsplash.com/photo-1631730486887-4d138d144c75?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@emma_lashes',
      line: 'emma_eyelash'
    },
    tags: ['睫毛嫁接', '日韓風', '自然捲翹'],
    createdAt: '2024-01-22',
    userId: 'user7'
  },
  {
    id: '8',
    publicListingId: 'nL4vB9q', // 刊登ID (7碼)
    name: '除毛師 Sophie',
    category: '除毛',
    city: '新北市',
    district: '永和區',
    description: '雷射除毛專業技師，溫和無痛除毛體驗',
    photos: [
      'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'sophie_laser',
      facebook: 'Sophie 除毛工作室'
    },
    tags: ['雷射除毛', '溫和無痛', '全身除毛'],
    createdAt: '2024-01-30',
    userId: 'user8'
  },
  {
    id: '9',
    publicListingId: 'uJ7sD2r', // 刊登ID (7碼)
    name: '紋繡師 Vivian',
    category: '紋繡',
    city: '台中市',
    district: '北屯區',
    description: '韓式半永久紋眉專家，自然野生眉型設計',
    photos: [
      'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@vivian_brows',
      line: 'vivian_tattoo'
    },
    tags: ['半永久紋眉', '韓式眉型', '野生眉'],
    createdAt: '2024-02-03',
    userId: 'user9'
  },
  {
    id: '10',
    publicListingId: 'wX1cF6t', // 刊登ID (7碼)
    name: '刺青師 Kevin',
    category: '刺青',
    city: '台北市',
    district: '萬華區',
    description: 'Old School風格刺青專家，設計與刺青一條龍服務',
    photos: [
      'https://images.unsplash.com/photo-1567701553914-7a30cd1b33ec?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@kevin_tattoo',
      facebook: 'Kevin Tattoo Studio'
    },
    tags: ['Old School', '設計刺青', '客製化'],
    createdAt: '2024-02-08',
    userId: 'user10'
  },
  {
    id: '11',
    publicListingId: 'eY3nH8v', // 刊登ID (7碼)
    name: '採耳師 Grace',
    category: '採耳',
    city: '台南市',
    district: '中西區',
    description: '專業採耳師，舒壓放鬆療程，古法採耳技術',
    photos: [
      'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'grace_ear',
      facebook: 'Grace 採耳工作室'
    },
    tags: ['專業採耳', '古法技術', '舒壓放鬆'],
    createdAt: '2024-02-10',
    userId: 'user11'
  },
  {
    id: '12',
    publicListingId: 'qZ5mK1x', // 刊登ID (7碼)
    name: '保險顧問 Michael',
    category: '保險',
    city: '台北市',
    district: '中正區',
    description: '壽險規劃專家，退休理財與保障規劃顧問',
    photos: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'michael_insurance',
      facebook: 'Michael 保險規劃'
    },
    tags: ['壽險規劃', '退休理財', '保障規劃'],
    createdAt: '2024-02-12',
    userId: 'user12'
  },
  {
    id: '13',
    publicListingId: 'iA9pL4y', // 刊登ID (7碼)
    name: '房仲專員 Alice',
    category: '房仲',
    city: '新北市',
    district: '���重區',
    description: '大台北地區房屋買賣專家，投資置產諮詢顧問',
    photos: [
      'https://images.unsplash.com/photo-1494790108755-2616b612b890?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'alice_realestate',
      facebook: 'Alice 房屋仲介'
    },
    tags: ['房屋買賣', '投資置產', '大台北地區'],
    createdAt: '2024-02-15',
    userId: 'user13'
  },
  {
    id: '14',
    publicListingId: 'oB2rN7z', // 刊登ID (7碼)
    name: '汽車業務 Peter',
    category: '汽車',
    city: '桃園市',
    district: '中壢區',
    description: '進口車銷售專家，提供最優惠價格與完整售後服務',
    photos: [
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'peter_cars',
      facebook: 'Peter 進口車銷售'
    },
    tags: ['進口車', '優惠價格', '售後服務'],
    createdAt: '2024-02-18',
    userId: 'user14'
  },
  {
    id: '15',
    publicListingId: 'sC6tQ3a', // 刊登ID (7碼)
    name: '財務顧問 Jenny',
    category: '財務顧問',
    city: '台北市',
    district: '內湖區',
    description: 'CFP認證理財規劃師，個人財務管理與投資建議',
    photos: [
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@jenny_finance',
      line: 'jenny_cfp'
    },
    tags: ['CFP認證', '理財規劃', '投資建議'],
    createdAt: '2024-02-20',
    userId: 'user15'
  },
  {
    id: '16',
    publicListingId: 'kD8vS5b', // 刊登ID (7碼)
    name: '律師 William',
    category: '法律顧問',
    city: '台北市',
    district: '大同區',
    description: '專精民事訴訟與商事法律事務，提供專業法律諮詢',
    photos: [
      'https://images.unsplash.com/photo-1556157382-97eda2d62296?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'william_lawyer',
      facebook: 'William 律師事務所'
    },
    tags: ['民事訴訟', '商事法務', '法律諮詢'],
    createdAt: '2024-02-22',
    userId: 'user16'
  },
  {
    id: '17',
    publicListingId: 'gE1wT9c', // 刊登ID (7碼)
    name: '平面設計師 Sarah',
    category: '平面設計師',
    city: '台中市',
    district: '南屯區',
    description: '品牌識別設計專家，LOGO設計與視覺規劃',
    photos: [
      'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@sarah_design',
      line: 'sarah_graphics'
    },
    tags: ['品牌識別', 'LOGO設計', '視覺規劃'],
    createdAt: '2024-02-25',
    userId: 'user17'
  },
  {
    id: '18',
    publicListingId: 'mF4xU2d', // 刊登ID (7碼)
    name: '室內設計師 Ryan',
    category: '室內設計師',
    city: '台北市',
    district: '士林區',
    description: '現代簡約風格專家，住宅空間規劃與裝修設計',
    photos: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@ryan_interior',
      line: 'ryan_design'
    },
    tags: ['現代簡約', '住宅設計', '空間規劃'],
    createdAt: '2024-02-28',
    userId: 'user18'
  },
  {
    id: '19',
    publicListingId: 'yG7zV6e', // 刊登ID (7碼)
    name: '工程師 Alex',
    category: '工程師',
    city: '新竹市',
    district: '東區',
    description: '軟體開發工程師，網站建置與APP開發服務',
    photos: [
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'alex_engineer',
      facebook: 'Alex 軟體開發'
    },
    tags: ['軟體開發', '網站建置', 'APP開發'],
    createdAt: '2024-03-01',
    userId: 'user19'
  },
  {
    id: '20',
    publicListingId: 'bH3aW1f', // 刊登ID (7碼)
    name: '會計師 Lisa',
    category: '會計師',
    city: '台北市',
    district: '北投區',
    description: '執業會計師，公司設立與稅務申報專業服務',
    photos: [
      'https://images.unsplash.com/photo-1494790108755-2616b612b890?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'lisa_accountant',
      facebook: 'Lisa 會計師事務所'
    },
    tags: ['公司設立', '稅務申報', '執業會計師'],
    createdAt: '2024-03-03',
    userId: 'user20'
  },
  {
    id: '21',
    name: '水電師傅 Tony',
    category: '水電',
    city: '新北市',
    district: '中和區',
    description: '專業水電維修，管線配置與家電安裝服務',
    photos: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'tony_plumber',
      facebook: 'Tony 水電工程'
    },
    tags: ['水電維修', '管線配置', '家電安裝'],
    createdAt: '2024-03-05',
    userId: 'user21'
  },
  {
    id: '22',
    name: '瑜珈老師 Yoga',
    category: '身心靈老師',
    city: '台北市',
    district: '文山區',
    description: '哈達瑜珈專業教學，身心靈平衡調理',
    photos: [
      'https://images.unsplash.com/photo-1506629905853-addx2bd13f3?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@yoga_teacher',
      line: 'yoga_wellness'
    },
    tags: ['哈達瑜珈', '身心靈', '平衡調理'],
    createdAt: '2024-03-08',
    userId: 'user22'
  },
  {
    id: '23',
    name: '游泳教練 Mark',
    category: '各項運動教練',
    city: '高雄市',
    district: '左營區',
    description: '游泳教學專家，成人與兒童游泳訓練',
    photos: [
      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'mark_swimming',
      facebook: 'Mark 游泳教學'
    },
    tags: ['游泳教學', '成人訓練', '兒童教學'],
    createdAt: '2024-03-10',
    userId: 'user23'
  },
  {
    id: '24',
    name: '鋼琴老師 Melody',
    category: '各類音樂老師',
    city: '台中市',
    district: '西區',
    description: '古典鋼琴教學，音樂檢定考試輔導',
    photos: [
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@melody_piano',
      line: 'melody_music'
    },
    tags: ['古典鋼琴', '音樂檢定', '考試輔導'],
    createdAt: '2024-03-12',
    userId: 'user24'
  },
  {
    id: '25',
    name: '學生家教 Andy',
    category: '學生',
    city: '台北市',
    district: '南港區',
    description: '台大數學系學生，國高中數理科家教',
    photos: [
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'andy_tutor'
    },
    tags: ['台大學生', '數理家教', '國高中'],
    createdAt: '2024-03-15',
    userId: 'user25'
  },
  {
    id: '26',
    name: '退休老師 Grace',
    category: '退休',
    city: '台南市',
    district: '東區',
    description: '退休國文老師，專業作文與閱讀指導',
    photos: [
      'https://images.unsplash.com/photo-1494790108755-2616b612b890?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'grace_teacher',
      facebook: 'Grace 作文教室'
    },
    tags: ['退休教師', '作文指導', '閱讀教學'],
    createdAt: '2024-03-18',
    userId: 'user26'
  },
  {
    id: '27',
    name: '美髮師 Ivy',
    category: '美髮',
    city: '新北市',
    district: '新店區',
    description: '韓式燙髮專家，時尚髮色調配師',
    photos: [
      'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@ivy_hair',
      line: 'ivy_salon'
    },
    tags: ['韓式燙髮', '時尚髮色', '調配師'],
    createdAt: '2024-03-20',
    userId: 'user27'
  },
  {
    id: '28',
    name: '美容師 Crystal',
    category: '美容',
    city: '桃園市',
    district: '桃園區',
    description: '抗老保養專家，淡斑美白療程設計',
    photos: [
      'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@crystal_beauty',
      line: 'crystal_skincare'
    },
    tags: ['抗老保養', '淡斑美白', '療程設計'],
    createdAt: '2024-03-22',
    userId: 'user28'
  },
  {
    id: '29',
    name: '按摩師 Helen',
    category: '按摩',
    city: '台中市',
    district: '東區',
    description: '泰式按摩專家，全身經絡疏通療法',
    photos: [
      'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'helen_massage',
      facebook: 'Helen 泰式按摩'
    },
    tags: ['泰式按摩', '經絡疏通', '全身療法'],
    createdAt: '2024-03-25',
    userId: 'user29'
  },
  {
    id: '30',
    name: '除毛師 Tina',
    category: '除毛',
    city: '高雄市',
    district: '三民區',
    description: '蜜蠟除毛專家，敏感肌膚溫和護理',
    photos: [
      'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@tina_waxing',
      line: 'tina_removal'
    },
    tags: ['蜜蠟除毛', '敏感肌膚', '溫和護理'],
    createdAt: '2024-03-28',
    userId: 'user30'
  },
  {
    id: '31',
    name: '睫毛師 Bella',
    category: '睫毛',
    city: '台北市',
    district: '士林區',
    description: '俄式Volume睫毛專家，濃密自然效果',
    photos: [
      'https://images.unsplash.com/photo-1631730486887-4d138d144c75?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@bella_lashes',
      line: 'bella_volume'
    },
    tags: ['俄式Volume', '濃密自然', '睫毛專家'],
    createdAt: '2024-03-30',
    userId: 'user31'
  },
  {
    id: '32',
    name: '美甲師 Ruby',
    category: '美甲',
    city: '新北市',
    district: '淡水區',
    description: '凝膠指甲專家，手足保養一站式服務',
    photos: [
      'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@ruby_nails',
      line: 'ruby_gel'
    },
    tags: ['凝膠指甲', '手足保養', '一站式服務'],
    createdAt: '2024-04-01',
    userId: 'user32'
  },
  {
    id: '33',
    name: '紋繡師 Iris',
    category: '紋繡',
    city: '台南市',
    district: '安平區',
    description: '飄眉技術專家，自然毛流感眉型設計',
    photos: [
      'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@iris_brows',
      line: 'iris_microblading'
    },
    tags: ['飄眉技術', '自然毛流', '眉型設計'],
    createdAt: '2024-04-03',
    userId: 'user33'
  },
  {
    id: '34',
    name: '刺青師 Neo',
    category: '刺青',
    city: '台中市',
    district: '大里區',
    description: '黑灰寫實刺青專家，人像與動物刺青',
    photos: [
      'https://images.unsplash.com/photo-1567701553914-7a30cd1b33ec?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@neo_tattoo',
      line: 'neo_realism'
    },
    tags: ['黑灰寫實', '人像刺青', '動物刺青'],
    createdAt: '2024-04-05',
    userId: 'user34'
  },
  {
    id: '35',
    name: '採耳師 Zen',
    category: '採耳',
    city: '新竹市',
    district: '北區',
    description: '傳統採耳技法，頭部按摩舒壓服務',
    photos: [
      'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'zen_ear',
      facebook: 'Zen 採耳舒壓'
    },
    tags: ['傳統技法', '頭部按摩', '舒壓服務'],
    createdAt: '2024-04-08',
    userId: 'user35'
  },
  {
    id: '36',
    name: '保險顧問 Eric',
    category: '保險',
    city: '新北市',
    district: '汐止區',
    description: '醫療險規劃專家，重大疾病保障規劃',
    photos: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'eric_insurance',
      facebook: 'Eric 保險規劃'
    },
    tags: ['醫療險', '重大疾病', '保障規劃'],
    createdAt: '2024-04-10',
    userId: 'user36'
  },
  {
    id: '37',
    name: '房仲專員 Nancy',
    category: '房仲',
    city: '台中市',
    district: '太平區',
    description: '預售屋銷售專家，新成屋投資分析顧問',
    photos: [
      'https://images.unsplash.com/photo-1494790108755-2616b612b890?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'nancy_realestate',
      facebook: 'Nancy 房屋銷售'
    },
    tags: ['預售屋', '新成屋', '投資分析'],
    createdAt: '2024-04-12',
    userId: 'user37'
  },
  {
    id: '38',
    name: '汽車業務 Jack',
    category: '汽車',
    city: '高雄市',
    district: '��山區',
    description: '國產車銷售專家，車貸分期專業諮詢',
    photos: [
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'jack_cars',
      facebook: 'Jack 汽車銷售'
    },
    tags: ['國產車', '車貸分期', '專業諮詢'],
    createdAt: '2024-04-15',
    userId: 'user38'
  },
  {
    id: '39',
    name: '財務顧問 Frank',
    category: '財務顧問',
    city: '台北市',
    district: '中山區',
    description: '基金投資專家，資產配置與風險管理',
    photos: [
      'https://images.unsplash.com/photo-1556157382-97eda2d62296?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@frank_finance',
      line: 'frank_investment'
    },
    tags: ['基金投資', '資產配置', '風險管理'],
    createdAt: '2024-04-18',
    userId: 'user39'
  },
  {
    id: '40',
    name: '律師 Victoria',
    category: '法律顧問',
    city: '台北市',
    district: '信義區',
    description: '智慧財產權專家，專利商標申請服務',
    photos: [
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'victoria_lawyer',
      facebook: 'Victoria 智財事務所'
    },
    tags: ['智慧財產權', '專利申請', '商標服務'],
    createdAt: '2024-04-20',
    userId: 'user40'
  },
  {
    id: '41',
    name: '平面設計師 Oscar',
    category: '平面設計師',
    city: '桃園市',
    district: '蘆竹區',
    description: '包裝設計專家，產品形象與行銷設計',
    photos: [
      'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@oscar_design',
      line: 'oscar_package'
    },
    tags: ['包裝設計', '產品形象', '行銷設計'],
    createdAt: '2024-04-22',
    userId: 'user41'
  },
  {
    id: '42',
    name: '室內設計師 Luna',
    category: '室內設計師',
    city: '台南市',
    district: '永康區',
    description: '北歐風格專家，小坪數空間規劃達人',
    photos: [
      'https://images.unsplash.com/photo-1494790108755-2616b612b890?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@luna_interior',
      line: 'luna_nordic'
    },
    tags: ['北歐風格', '小坪數', '空間規劃'],
    createdAt: '2024-04-25',
    userId: 'user42'
  },
  {
    id: '43',
    name: '攝影師 Max',
    category: '攝影師',
    city: '台北市',
    district: '大安區',
    description: '商業攝影專家，產品與食物攝影',
    photos: [
      'https://images.unsplash.com/photo-1553835973-dec43bfddbeb?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@max_photography',
      line: 'max_commercial'
    },
    tags: ['商業攝影', '產品攝影', '食物攝影'],
    createdAt: '2024-04-28',
    userId: 'user43'
  },
  {
    id: '44',
    name: '工程師 Leo',
    category: '工程師',
    city: '台中市',
    district: '龍井區',
    description: '前端工程師，React與Vue.js專業開發',
    photos: [
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'leo_frontend',
      facebook: 'Leo 前端開發'
    },
    tags: ['前端工程師', 'React', 'Vue.js'],
    createdAt: '2024-05-01',
    userId: 'user44'
  },
  {
    id: '45',
    name: '會計師 Diana',
    category: '會計師',
    city: '高雄市',
    district: '鳳山區',
    description: '記帳士事務所，中小企業財務管理顧問',
    photos: [
      'https://images.unsplash.com/photo-1494790108755-2616b612b890?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'diana_bookkeeping',
      facebook: 'Diana 記帳士事務所'
    },
    tags: ['記帳士', '中小企業', '財務管理'],
    createdAt: '2024-05-03',
    userId: 'user45'
  },
  {
    id: '46',
    name: '水電師傅 Sam',
    category: '水電',
    city: '新竹縣',
    district: '竹北市',
    description: '冷氣安裝專家，家電維修與配線服務',
    photos: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'sam_hvac',
      facebook: 'Sam 冷氣水電'
    },
    tags: ['冷氣安裝', '家電維修', '配線服務'],
    createdAt: '2024-05-05',
    userId: 'user46'
  },
  {
    id: '47',
    name: '健身教練 Zoe',
    category: '健身教練',
    city: '台北市',
    district: '松山區',
    description: '女性專屬健身教練，產後復健與體態調整',
    photos: [
      'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@zoe_fitness',
      line: 'zoe_women'
    },
    tags: ['女性專屬', '產後復健', '體態調整'],
    createdAt: '2024-05-08',
    userId: 'user47'
  },
  {
    id: '48',
    name: '網球教練 Chris',
    category: '各項運動教練',
    city: '台北市',
    district: '內湖區',
    description: '網球專業教練，成人與青少年網球訓練',
    photos: [
      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'chris_tennis',
      facebook: 'Chris 網球教學'
    },
    tags: ['網球教練', '成人訓練', '青少年教學'],
    createdAt: '2024-05-10',
    userId: 'user48'
  },
  {
    id: '49',
    name: '吉他老師 Rock',
    category: '各類音樂老師',
    city: '新北市',
    district: '蘆洲區',
    description: '電吉他與民謠吉他教學，流行音樂演奏',
    photos: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@rock_guitar',
      line: 'rock_music'
    },
    tags: ['電吉他', '民謠吉他', '流行音樂'],
    createdAt: '2024-05-12',
    userId: 'user49'
  },
  {
    id: '50',
    name: '冥想老師 Peace',
    category: '身心靈老師',
    city: '台中市',
    district: '西屯區',
    description: '正念冥想指導師，壓力釋放與心靈成長',
    photos: [
      'https://images.unsplash.com/photo-1506629905853-addx2bd13f3?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@peace_meditation',
      line: 'peace_mindfulness'
    },
    tags: ['正念冥想', '壓力釋放', '心靈成長'],
    createdAt: '2024-05-15',
    userId: 'user50'
  },
  {
    id: '51',
    name: '上班族小幫手 Kate',
    category: '上班族',
    city: '台北市',
    district: '中正區',
    description: '文書處理專家，Excel與PowerPoint製作',
    photos: [
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'kate_office',
      facebook: 'Kate 文書服務'
    },
    tags: ['文書處理', 'Excel專家', 'PowerPoint'],
    createdAt: '2024-05-18',
    userId: 'user51'
  },
  {
    id: '52',
    name: '學生家教 Ben',
    category: '學生',
    city: '台中市',
    district: '北區',
    description: '清大物理系學生，高中物理化學家教',
    photos: [
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'ben_physics'
    },
    tags: ['清大學生', '物理化學', '高中家教'],
    createdAt: '2024-05-20',
    userId: 'user52'
  },
  {
    id: '53',
    name: '退休園藝師 Green',
    category: '退休',
    city: '苗栗縣',
    district: '頭份市',
    description: '園藝造景專家，庭院設計與植物養護',
    photos: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'green_garden',
      facebook: 'Green 庭院造景'
    },
    tags: ['園藝造景', '庭院設計', '植物養護'],
    createdAt: '2024-05-22',
    userId: 'user53'
  },
  {
    id: '54',
    name: '美髮師 Shine',
    category: '美髮',
    city: '嘉義市',
    district: '東區',
    description: '新娘造型專家，婚禮整體造型設計',
    photos: [
      'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@shine_bridal',
      line: 'shine_wedding'
    },
    tags: ['新娘造型', '婚禮造型', '整體設計'],
    createdAt: '2024-05-25',
    userId: 'user54'
  },
  {
    id: '55',
    name: '美容師 Angel',
    category: '美容',
    city: '彰化縣',
    district: '彰化市',
    description: '孕婦保養專家，溫和安全護膚療程',
    photos: [
      'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@angel_prenatal',
      line: 'angel_pregnancy'
    },
    tags: ['孕婦保養', '溫和護膚', '安全療程'],
    createdAt: '2024-05-28',
    userId: 'user55'
  },
  {
    id: '56',
    name: '按摩師 Relax',
    category: '按摩',
    city: '南投縣',
    district: '草屯鎮',
    description: '孕婦按摩專家，孕期舒緩與產後調理',
    photos: [
      'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'relax_prenatal',
      facebook: 'Relax 孕婦按摩'
    },
    tags: ['孕婦按摩', '孕期舒緩', '產後調理'],
    createdAt: '2024-05-30',
    userId: 'user56'
  },
  {
    id: '57',
    name: '除毛師 Smooth',
    category: '除毛',
    city: '雲林縣',
    district: '斗六市',
    description: '男性除毛專家，背部胸毛專業處理',
    photos: [
      'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@smooth_men',
      line: 'smooth_male'
    },
    tags: ['男性除毛', '背部胸毛', '專業處理'],
    createdAt: '2024-06-01',
    userId: 'user57'
  },
  {
    id: '58',
    name: '睫毛師 Dream',
    category: '睫毛',
    city: '屏東縣',
    district: '屏東市',
    description: '下睫毛嫁接專家，360度完美睫毛',
    photos: [
      'https://images.unsplash.com/photo-1631730486887-4d138d144c75?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@dream_lashes',
      line: 'dream_360'
    },
    tags: ['下睫毛', '360度睫毛', '完美嫁接'],
    createdAt: '2024-06-03',
    userId: 'user58'
  },
  {
    id: '59',
    name: '美甲師 Sparkle',
    category: '美甲',
    city: '宜蘭縣',
    district: '宜蘭市',
    description: '水晶指甲專家，3D立體指甲藝術',
    photos: [
      'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@sparkle_crystal',
      line: 'sparkle_3d'
    },
    tags: ['水晶指甲', '3D立體', '指甲藝術'],
    createdAt: '2024-06-05',
    userId: 'user59'
  },
  {
    id: '60',
    name: '紋繡師 Art',
    category: '紋繡',
    city: '花蓮縣',
    district: '花蓮市',
    description: '唇部紋繡專家，自然豐潤唇色設計',
    photos: [
      'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@art_lips',
      line: 'art_lipstick'
    },
    tags: ['唇部紋繡', '自然豐潤', '唇色設計'],
    createdAt: '2024-06-08',
    userId: 'user60'
  },
  {
    id: '61',
    name: '刺青師 Ink',
    category: '刺青',
    city: '台東縣',
    district: '台東市',
    description: '部落圖騰刺青專家，原住民文化刺青',
    photos: [
      'https://images.unsplash.com/photo-1567701553914-7a30cd1b33ec?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@ink_tribal',
      line: 'ink_indigenous'
    },
    tags: ['部落圖騰', '原住民文化', '文化刺青'],
    createdAt: '2024-06-10',
    userId: 'user61'
  },
  {
    id: '62',
    name: '採耳師 Pure',
    category: '採耳',
    city: '澎湖縣',
    district: '馬公市',
    description: '海島風採耳服務，結合精油香氛療法',
    photos: [
      'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'pure_island',
      facebook: 'Pure 海島採耳'
    },
    tags: ['海島風格', '精油香氛', '採耳療法'],
    createdAt: '2024-06-12',
    userId: 'user62'
  },
  {
    id: '63',
    name: '傳銷顧問 Success',
    category: '傳銷',
    city: '台北市',
    district: '萬華區',
    description: '網路行銷專家，社群經營與業績成長顧問',
    photos: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@success_mlm',
      line: 'success_network'
    },
    tags: ['網路行銷', '社群經營', '業績成長'],
    createdAt: '2024-06-15',
    userId: 'user63'
  },
  {
    id: '64',
    name: '汽車美容師 Shine',
    category: '汽車',
    city: '金門縣',
    district: '金城鎮',
    description: '汽車美容專家，鍍膜打蠟專業服務',
    photos: [
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=300&fit=crop'
    ],
    contacts: {
      line: 'shine_carcare',
      facebook: 'Shine 汽車美容'
    },
    tags: ['汽車美容', '鍍膜打蠟', '專業服務'],
    createdAt: '2024-06-18',
    userId: 'user64'
  },
  {
    id: '65',
    name: '瑜珈老師 Zen',
    category: '身心靈老師',
    city: '連江縣',
    district: '南竿鄉',
    description: '海邊瑜珈專家，日出瑜珈與冥想課程',
    photos: [
      'https://images.unsplash.com/photo-1506629905853-addx2bd13f3?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@zen_ocean',
      line: 'zen_sunrise'
    },
    tags: ['海邊瑜珈', '日出瑜珈', '冥想課程'],
    createdAt: '2024-06-20',
    userId: 'user65'
  },
  {
    id: '66',
    name: '攝影師 Capture',
    category: '攝影師',
    city: '基隆市',
    district: '中正區',
    description: '海景攝影專家，風景與旅遊攝影服務',
    photos: [
      'https://images.unsplash.com/photo-1553835973-dec43bfddbeb?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@capture_ocean',
      line: 'capture_travel'
    },
    tags: ['海景攝影', '風景攝影', '旅遊攝影'],
    createdAt: '2024-06-22',
    userId: 'user66'
  },
  {
    id: '67',
    name: '健身教練 Power',
    category: '健身教練',
    city: '嘉義縣',
    district: '太保市',
    description: '功能性訓練專家，銀髮族健身課程設計',
    photos: [
      'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400&h=300&fit=crop'
    ],
    contacts: {
      instagram: '@power_senior',
      line: 'power_functional'
    },
    tags: ['功能性訓練', '銀髮族健身', '課程設計'],
    createdAt: '2024-06-25',
    userId: 'user67'
  }
];

// 模擬用戶資料
export const mockUsers = [
  {
    id: 'user1',
    publicUserId: 'aB3xY', // 使用者ID (5碼)
    name: '王小明',
    email: 'ming@example.com',
    phone: '0912345678',
    idNumber: 'A123456789',
    bankAccount: '123-456-789-012',
    birthDate: '1990-05-15',
    isAdmin: true,
    referralCode: 'MING2024',
    referrer: null,
    availableRewards: 1800,
    pendingRewards: 1000,
    withdrawnRewards: 6000,
    isActive: true,
    loginServices: {
      google: true,
      line: true,
      instagram: false
    }
  },
  {
    id: 'user2',
    publicUserId: '1Km9p', // 使用者ID (5碼)
    name: '李小華',
    email: 'hua@example.com',
    phone: '0923456789',
    idNumber: 'B234567890',
    bankAccount: '234-567-890-123',
    birthDate: '1988-08-20',
    isAdmin: true,
    referralCode: 'HUA2024',
    referrer: 'user1',
    availableRewards: 1500,
    pendingRewards: 3000,
    withdrawnRewards: 19000,
    isActive: true,
    loginServices: {
      google: false,
      line: true,
      instagram: true
    }
  },
  {
    id: 'user3',
    name: '陳小春',
    email: 'chun@example.com',
    phone: '0912345678',
    idNumber: 'A123456789',
    bankAccount: '123-456-789-012',
    birthDate: '1990-05-15',
    isAdmin: false,
    referralCode: 'MING2024',
    referrer: 'user2',
    availableRewards: 800,
    pendingRewards: 1000,
    withdrawnRewards: 6000,
    isActive: false,
    loginServices: {
      google: true,
      line: false,
      instagram: true
    }
  },
  {
    id: 'user4',
    name: '洪大海',
    email: 'hong@example.com',
    phone: '0923456789',
    idNumber: 'B234567890',
    bankAccount: '234-567-890-123',
    birthDate: '1988-08-20',
    isAdmin: false,
    referralCode: 'HUA2024',
    referrer: 'user1',
    availableRewards: 1500,
    pendingRewards: 3000,
    withdrawnRewards: 19000,
    isActive: false,
  },
  {
    id: 'user5',
    name: '炭治郎',
    email: 'tanzhi@example.com',
    phone: '0923456789',
    idNumber: 'B234567890',
    bankAccount: '234-567-890-123',
    birthDate: '1988-08-20',
    isAdmin: true,
    referralCode: 'HUA2024',
    referrer: 'user2',
    availableRewards: 1500,
    pendingRewards: 3000,
    withdrawnRewards: 19000,
    isActive: true,
  },
  {
    id: 'user6',
    name: '林志玲',
    email: 'zhiling@example.com',
    phone: '0912345678',
    idNumber: 'A123456789',
    bankAccount: '123-456-789-012',
    birthDate: '1990-05-15',
    isAdmin: false,
    referralCode: 'MING2024',
    referrer: 'user2',
    availableRewards: 800,
    pendingRewards: 1000,
    withdrawnRewards: 6000,
    isActive: true,
  },
  {
    id: 'user7',
    name: '關少文',
    email: 'shao@example.com',
    phone: '0923456789',
    idNumber: 'B234567890',
    bankAccount: '234-567-890-123',
    birthDate: '1988-08-20',
    isAdmin: false,
    referralCode: 'HUA2024',
    referrer: 'user1',
    availableRewards: 1500,
    pendingRewards: 3000,
    withdrawnRewards: 19000,
    isActive: true,
  },
  {
    id: 'user8',
    name: '巴小華',
    email: 'hua@example.com',
    phone: '0923456789',
    idNumber: 'B234567890',
    bankAccount: '234-567-890-123',
    birthDate: '1988-08-20',
    isAdmin: true,
    referralCode: 'HUA2024',
    referrer: 'user1',
    availableRewards: 1500,
    pendingRewards: 3000,
    withdrawnRewards: 19000,
    isActive: true,
  },
  {
    id: 'user9',
    name: '久小春',
    email: 'chun@example.com',
    phone: '0912345678',
    idNumber: 'A123456789',
    bankAccount: '123-456-789-012',
    birthDate: '1990-05-15',
    isAdmin: false,
    referralCode: 'MING2024',
    referrer: 'user13',
    availableRewards: 800,
    pendingRewards: 1000,
    withdrawnRewards: 6000,
    isActive: true,
  },
  {
    id: 'user10',
    name: '石大海',
    email: 'hong@example.com',
    phone: '0923456789',
    idNumber: 'B234567890',
    bankAccount: '234-567-890-123',
    birthDate: '1988-08-20',
    isAdmin: false,
    referralCode: 'HUA2024',
    referrer: 'user1',
    availableRewards: 1500,
    pendingRewards: 3000,
    withdrawnRewards: 19000,
    isActive: true,
  },
  {
    id: 'user11',
    name: '十一郎',
    email: 'tanzhi@example.com',
    phone: '0923456789',
    idNumber: 'B234567890',
    bankAccount: '234-567-890-123',
    birthDate: '1988-08-20',
    isAdmin: true,
    referralCode: 'HUA2024',
    referrer: 'user1',
    availableRewards: 1500,
    pendingRewards: 3000,
    withdrawnRewards: 19000,
    isActive: true,
  },
  {
    id: 'user12',
    name: '史二郎',
    email: 'zhiling@example.com',
    phone: '0912345678',
    idNumber: 'A123456789',
    bankAccount: '123-456-789-012',
    birthDate: '1990-05-15',
    isAdmin: false,
    referralCode: 'MING2024',
    referrer: 'user4',
    availableRewards: 800,
    pendingRewards: 1000,
    withdrawnRewards: 6000,
    isActive: true,
  },
  {
    id: 'user13',
    name: '三毛',
    email: 'shao@example.com',
    phone: '0923456789',
    idNumber: 'B234567890',
    bankAccount: '234-567-890-123',
    birthDate: '1988-08-20',
    isAdmin: false,
    referralCode: 'HUA2024',
    referrer: 'user4',
    availableRewards: 1500,
    pendingRewards: 3000,
    withdrawnRewards: 19000,
    isActive: true,
  }
];

// 模擬推薦關係
export const mockReferrals = [
  {
    id: 'ref1',
    referrerId: 'user1',
    refereeId: 'user2',
    level: 1,
    joinDate: '2024-01-15',
    status: 'active'
  },
  {
    id: 'ref2',
    referrerId: 'user1',
    refereeId: 'user3',
    level: 2,
    joinDate: '2024-01-15',
    status: 'active'
  },
  {
    id: 'ref3',
    referrerId: 'user1',
    refereeId: 'user4',
    level: 2,
    joinDate: '2024-01-15',
    status: 'active'
  },
  {
    id: 'ref4',
    referrerId: 'user1',
    refereeId: 'user4',
    level: 1,
    joinDate: '2024-01-15',
    status: 'active'
  }
];

// 模擬獎金申請記錄
export const mockWithdrawals = [
  {
    id: 'wd1',
    userId: 'user1',
    amount: 1000,
    fee: 15,
    actualAmount: 985,
    status: 'pending',
    appliedAt: '2024-02-01',
    processedAt: null
  },
  {
    id: 'wd2',
    userId: 'user2',
    amount: 2000,
    fee: 15,
    actualAmount: 1985,
    status: 'awaiting_collection',
    appliedAt: '2024-01-15',
    processedAt: '2024-01-20'
  },
  {
    id: 'wd3',
    userId: 'user1',
    amount: 1500,
    fee: 15,
    actualAmount: 1485,
    status: 'completed',
    appliedAt: '2024-01-10',
    processedAt: '2024-01-15'
  }
];