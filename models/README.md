# モデルのセットアップ

このディレクトリには以下のモデルファイルを配置してください。

## YOLOv11 モデル (物体検知)

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

## Whisper モデル (音声認識)

### 推奨モデル
- ggml-base.bin (Whisper Base - 精度と速度のバランス)
- ggml-small.bin (Whisper Small - より高精度)

### モデルの入手方法

1. Hugging Face から GGML 形式のモデルをダウンロード:
   - https://huggingface.co/ggerganov/whisper.cpp/tree/main

2. または、whisper.cpp リポジトリから変換:

```bash
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
bash ./models/download-ggml-model.sh base
```

3. 生成された `ggml-base.bin` をこのディレクトリに配置

## LLM モデル (テキスト整形)

### 既存モデル
- llmjp-3.1-1.8b-instruct4-q5.gguf (既に配置済み)

このモデルを音声入力から抽出したテキストのスケジュール構造化に使用します。

### ファイル構成
```
models/
  ├── yolo11n.onnx (物体検知用)
  ├── ggml-base.bin (音声認識用 - 配置してください)
  ├── llmjp-3.1-1.8b-instruct4-q5.gguf (テキスト整形用 - 配置済み)
  └── README.md (このファイル)
```
