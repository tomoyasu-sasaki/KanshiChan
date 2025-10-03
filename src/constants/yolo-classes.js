// YOLO11 COCO Dataset クラス定義
// https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/datasets/coco.yaml

export const YOLO_CLASSES = [
  { id: 0, name: 'person', label: '人', category: 'person' },
  { id: 39, name: 'bottle', label: 'ボトル', category: 'kitchen' },
  { id: 40, name: 'wine glass', label: 'ワイングラス', category: 'kitchen' },
  { id: 41, name: 'cup', label: 'カップ', category: 'kitchen' },
  { id: 42, name: 'fork', label: 'フォーク', category: 'kitchen' },
  { id: 43, name: 'knife', label: 'ナイフ', category: 'kitchen' },
  { id: 44, name: 'spoon', label: 'スプーン', category: 'kitchen' },
  { id: 56, name: 'chair', label: '椅子', category: 'furniture' },
  { id: 57, name: 'couch', label: 'ソファ', category: 'furniture' },
  { id: 58, name: 'potted plant', label: '観葉植物', category: 'furniture' },
  { id: 59, name: 'bed', label: 'ベッド', category: 'furniture' },
  { id: 60, name: 'dining table', label: 'ダイニングテーブル', category: 'furniture' },
  { id: 61, name: 'toilet', label: 'トイレ', category: 'furniture' },
  { id: 62, name: 'tv', label: 'テレビ', category: 'electronic' },
  { id: 63, name: 'laptop', label: 'ノートPC', category: 'electronic' },
  { id: 64, name: 'mouse', label: 'マウス', category: 'electronic' },
  { id: 65, name: 'remote', label: 'リモコン', category: 'electronic' },
  { id: 66, name: 'keyboard', label: 'キーボード', category: 'electronic' },
  { id: 67, name: 'cell phone', label: 'スマホ', category: 'electronic' },
  { id: 68, name: 'microwave', label: '電子レンジ', category: 'appliance' },
  { id: 69, name: 'oven', label: 'オーブン', category: 'appliance' },
  { id: 70, name: 'toaster', label: 'トースター', category: 'appliance' },
  { id: 71, name: 'sink', label: 'シンク', category: 'appliance' },
  { id: 72, name: 'refrigerator', label: '冷蔵庫', category: 'appliance' },
  { id: 73, name: 'book', label: '本', category: 'indoor' },
  { id: 74, name: 'clock', label: '時計', category: 'indoor' },
  { id: 75, name: 'vase', label: '花瓶', category: 'indoor' },
];

// カテゴリー定義
export const YOLO_CATEGORIES = {
  person: { label: '人物', emoji: '👤' },
  vehicle: { label: '乗り物', emoji: '🚗' },
  outdoor: { label: '屋外', emoji: '🌳' },
  animal: { label: '動物', emoji: '🐾' },
  accessory: { label: 'アクセサリー', emoji: '👜' },
  sports: { label: 'スポーツ', emoji: '⚽' },
  kitchen: { label: 'キッチン用品', emoji: '🍴' },
  food: { label: '食べ物', emoji: '🍎' },
  furniture: { label: '家具', emoji: '🛋️' },
  electronic: { label: '電子機器', emoji: '💻' },
  appliance: { label: '家電', emoji: '🔌' },
  indoor: { label: '室内用品', emoji: '🏠' }
};

// カテゴリー別にクラスを取得
export function getClassesByCategory() {
  const grouped = {};
  YOLO_CLASSES.forEach(cls => {
    if (!grouped[cls.category]) {
      grouped[cls.category] = [];
    }
    grouped[cls.category].push(cls);
  });
  return grouped;
}

// クラス名からIDを取得
export function getClassIdByName(name) {
  const cls = YOLO_CLASSES.find(c => c.name === name);
  return cls ? cls.id : -1;
}

// IDからクラス情報を取得
export function getClassById(id) {
  return YOLO_CLASSES.find(c => c.id === id);
}

// 推論用に 80 クラスすべての英語名を公開（YOLODetector などで使用）
export const YOLO_ALL_CLASS_NAMES = Object.freeze([
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
  'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
  'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator',
  'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
]);
