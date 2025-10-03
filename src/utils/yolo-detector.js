/**
 * YOLOv11 推論ラッパー (ONNX Runtime)。
 * - メインプロセス専用で動作し、canvas/onnxruntime-node への依存がある。
 * - クラス名リストは constants/yolo-classes から動的に読み込む。
 */
const yoloClassModulePromise = import('../constants/yolo-classes.js');

// クラス名リストはレンダラと共有する constants 層から取得する。
/**
 * YOLOv11 物体検知クラス（ONNX Runtime使用）
 * 
 * 責務: YOLOv11モデルによる物体検知（推論・前処理・後処理）
 * 
 * 依存:
 * - onnxruntime-node（ネイティブモジュール、macOS/Linux/Windowsでビルド環境必須）
 * - canvas（画像処理用ネイティブモジュール）
 * - models/yolo11n.onnx（YOLOv11 Nano モデル、COCO 80クラス対応）
 * 
 * モデル仕様:
 * - 入力: [1, 3, 640, 640] (NCHW形式、RGB正規化0-1)
 * - 出力: [1, 84, 8400] (84 = 4 bbox座標 + 80クラススコア)
 * - NMS適用済み結果を返却
 */
const ort = require('onnxruntime-node');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

class YOLODetector {
  constructor() {
    this.session = null;
    this.modelPath = path.join(__dirname, '..', '..', 'models', 'yolo11n.onnx');
    this.inputSize = 640;
    this.confidenceThreshold = 0.25;
    this.iouThreshold = 0.45;

    // COCO dataset クラス名
    this.classNames = []; // 動的ロード完了後に設定される。
    this.classNamesPromise = yoloClassModulePromise
      .then((mod) => mod.YOLO_ALL_CLASS_NAMES || [])
      .catch(() => []);
  }

  // モデル初期化
  async initialize() {
    try {
      if (!fs.existsSync(this.modelPath)) {
        throw new Error(`モデルファイルが見つかりません: ${this.modelPath}`);
      }

      this.session = await ort.InferenceSession.create(this.modelPath);
      this.classNames = await this.classNamesPromise;
      console.log('YOLOv11 モデルを読み込みました');
      return true;
    } catch (error) {
      console.error('モデル読み込みエラー:', error);
      return false;
    }
  }

  /**
   * 画像前処理
   * YOLOv11入力要件: [1, 3, 640, 640] NCHW形式、RGB正規化(0-1)
   * アスペクト比維持なし（letterboxなし）: 検知精度よりも処理速度優先
   * 
   * @param {Image} imageData - canvas loadImage で読み込んだ画像
   * @returns {Float32Array} 正規化済みテンソルデータ
   */
  preprocessImage(imageData) {
    const canvas = createCanvas(this.inputSize, this.inputSize);
    const ctx = canvas.getContext('2d');

    // 画像をリサイズして描画（letterboxなし、歪み許容）
    ctx.drawImage(imageData, 0, 0, this.inputSize, this.inputSize);

    const imgData = ctx.getImageData(0, 0, this.inputSize, this.inputSize);
    const pixels = imgData.data;

    // RGB正規化 (0-255 -> 0-1) & CHW形式に変換
    const input = new Float32Array(3 * this.inputSize * this.inputSize);

    for (let i = 0; i < pixels.length; i += 4) {
      const pixelIndex = i / 4;
      const y = Math.floor(pixelIndex / this.inputSize);
      const x = pixelIndex % this.inputSize;

      // RGB channels
      input[0 * this.inputSize * this.inputSize + y * this.inputSize + x] = pixels[i] / 255.0; // R
      input[1 * this.inputSize * this.inputSize + y * this.inputSize + x] = pixels[i + 1] / 255.0; // G
      input[2 * this.inputSize * this.inputSize + y * this.inputSize + x] = pixels[i + 2] / 255.0; // B
    }

    return input;
  }

  // 推論実行
  async detect(imageDataUrl) {
    if (!this.session) {
      console.warn('モデルが初期化されていません');
      return [];
    }

    try {
      // Base64画像をロード
      const img = await loadImage(imageDataUrl);

      // 前処理
      const inputTensor = this.preprocessImage(img);

      // 推論実行
      const tensor = new ort.Tensor('float32', inputTensor, [1, 3, this.inputSize, this.inputSize]);
      const feeds = { images: tensor };
      const results = await this.session.run(feeds);

      // 後処理
      const detections = this.postprocess(results, img.width, img.height);

      return detections;
    } catch (error) {
      console.error('検知エラー:', error);
      return [];
    }
  }

  /**
   * 後処理（検出結果の解析）YOLOv11形式
   * 
   * YOLOv11出力仕様: [1, 84, 8400]
   * - 84 = 4 bbox座標(cx,cy,w,h) + 80 COCOクラススコア
   * - 8400 = アンカーポイント総数（80x80 + 40x40 + 20x20の3スケール）
   * - データ配置: 転置形式（特徴軸が先、ボックス軸が後）
   * 
   * 処理フロー:
   * 1. 信頼度閾値フィルタリング（confidenceThreshold）
   * 2. 座標変換（モデル座標→元画像座標）
   * 3. NMS適用（IoU閾値: iouThreshold）
   * 
   * @returns {Array<{class:string, confidence:number, bbox:[x,y,w,h]}>}
   */
  postprocess(results, originalWidth, originalHeight) {
    const outputKey = Object.keys(results)[0];
    const output = results[outputKey];
    const outputData = output.data;
    const dims = output.dims;

    // YOLOv11の出力は [1, 84, 8400] の形式
    // 84 = 4 (bbox) + 80 (classes)
    const numClasses = this.classNames.length;
    const numBoxes = dims[2]; // 8400
    const numFeatures = dims[1]; // 84

    const detections = [];
    const scaleX = originalWidth / this.inputSize;
    const scaleY = originalHeight / this.inputSize;

    // 転置されたデータを処理
    for (let i = 0; i < numBoxes; i++) {
      // バウンディングボックス (center_x, center_y, width, height)
      const cx = outputData[i] * scaleX;
      const cy = outputData[numBoxes + i] * scaleY;
      const w = outputData[2 * numBoxes + i] * scaleX;
      const h = outputData[3 * numBoxes + i] * scaleY;

      // クラススコア
      let maxScore = 0;
      let maxClass = 0;

      for (let j = 0; j < numClasses; j++) {
        const score = outputData[(4 + j) * numBoxes + i];
        if (score > maxScore) {
          maxScore = score;
          maxClass = j;
        }
      }

      // 信頼度閾値チェック
      if (maxScore >= this.confidenceThreshold) {
        detections.push({
          class: this.classNames[maxClass],
          confidence: maxScore,
          bbox: [
            Math.max(0, cx - w / 2),
            Math.max(0, cy - h / 2),
            w,
            h
          ]
        });
      }
    }

    // NMS (Non-Maximum Suppression)
    return this.applyNMS(detections);
  }

  /**
   * Non-Maximum Suppression (NMS)
   * 重複検出を除去し、最も信頼度の高い検出結果のみを残す
   * 
   * アルゴリズム:
   * 1. 信頼度降順ソート
   * 2. 最高スコアの検出を採用
   * 3. 同一クラスでIoU > iouThreshold の検出を抑制
   * 4. 残りの検出で繰り返し
   * 
   * クラス別NMS: 異なるクラス間では重複を許容（person + cell phone 等）
   */
  applyNMS(detections) {
    if (detections.length === 0) return [];

    // 信頼度でソート
    detections.sort((a, b) => b.confidence - a.confidence);

    const keep = [];

    while (detections.length > 0) {
      const current = detections.shift();
      keep.push(current);

      detections = detections.filter(det => {
        const iou = this.calculateIOU(current.bbox, det.bbox);
        return iou < this.iouThreshold || current.class !== det.class;
      });
    }

    return keep;
  }

  // IoU (Intersection over Union) 計算
  calculateIOU(box1, box2) {
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;

    const xA = Math.max(x1, x2);
    const yA = Math.max(y1, y2);
    const xB = Math.min(x1 + w1, x2 + w2);
    const yB = Math.min(y1 + h1, y2 + h2);

    const intersection = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const area1 = w1 * h1;
    const area2 = w2 * h2;
    const union = area1 + area2 - intersection;

    return intersection / union;
  }

  // 信頼度閾値設定
  setConfidenceThreshold(threshold) {
    this.confidenceThreshold = threshold;
  }
}

module.exports = YOLODetector;
