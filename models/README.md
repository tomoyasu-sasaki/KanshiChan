# YOLOv11 モデルのセットアップ

## 手動でのモデル配置

このディレクトリに YOLOv11 の ONNX モデルを配置してください。

### 推奨モデル
- yolo11n.onnx (YOLOv11 Nano - 軽量)

### モデルの入手方法

1. Ultralytics の公式リポジトリから ONNX モデルをダウンロード
2. または、Python で変換:

```bash
pip install ultralytics
yolo export model=yolo11n.pt format=onnx
```

3. 生成された `yolo11n.onnx` をこのディレクトリに配置

### ファイル構成
```
models/
  ├── yolo11n.onnx (配置してください)
  └── README.md (このファイル)
```
