import argparse
from pathlib import Path

import torch

from models.bigru import BiGRU
from config import model_config


def infer_model_dims(state_dict):
    hidden_size = None
    num_layers = 0
    output_size = None

    if "gru.weight_hh_l0" in state_dict:
        hh = state_dict["gru.weight_hh_l0"]
        # GRU weight_hh_l0 shape: [3 * hidden_size, hidden_size]
        hidden_size = hh.shape[1]

    for key in state_dict.keys():
        if key.startswith("gru.weight_ih_l") and "_reverse" not in key:
            layer_idx = int(key.split("gru.weight_ih_l")[1])
            num_layers = max(num_layers, layer_idx + 1)

    if "fc.weight" in state_dict:
        output_size = state_dict["fc.weight"].shape[0]

    return hidden_size, num_layers, output_size


def main():
    parser = argparse.ArgumentParser(description="Check saved model structure and compatibility.")
    parser.add_argument(
        "--model-path",
        default=f"savedModel/{model_config.MODEL_NAME}_best.pth",
        help=f"Path to model .pth file (default: savedModel/{model_config.MODEL_NAME}_best.pth)",
    )
    parser.add_argument("--input-size", type=int, default=model_config.MODEL_INPUT_SIZE)
    parser.add_argument("--hidden-size", type=int, default=model_config.MODEL_HIDDEN_SIZE)
    parser.add_argument("--num-layers", type=int, default=model_config.MODEL_NUM_LAYERS)
    parser.add_argument("--output-size", type=int, default=model_config.MODEL_OUTPUT_SIZE)
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent
    model_path = Path(args.model_path)
    if not model_path.is_absolute():
        model_path = base_dir / model_path
    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")

    checkpoint = torch.load(model_path, map_location="cpu")
    if not isinstance(checkpoint, dict):
        raise TypeError(f"Expected dict checkpoint/state_dict, got: {type(checkpoint)}")

    print(f"Model path: {model_path}")
    print(f"Checkpoint type: {type(checkpoint).__name__}")
    print(f"Total tensors: {len(checkpoint)}")

    inferred_hidden, inferred_layers, inferred_output = infer_model_dims(checkpoint)
    print(
        "Inferred dims from checkpoint: "
        f"hidden_size={inferred_hidden}, num_layers={inferred_layers}, output_size={inferred_output}"
    )

    print("\nState dict structure:")
    for k, v in checkpoint.items():
        if hasattr(v, "shape"):
            print(f"- {k}: {tuple(v.shape)}")
        else:
            print(f"- {k}: {type(v).__name__}")

    model = BiGRU(
        input_size=args.input_size,
        hidden_size=args.hidden_size,
        num_layers=args.num_layers,
        output_size=args.output_size,
    )

    missing_keys, unexpected_keys = model.load_state_dict(checkpoint, strict=False)
    print("\nCompatibility check against current BiGRU config:")
    print(
        "Model config: "
        f"input_size={args.input_size}, hidden_size={args.hidden_size}, "
        f"num_layers={args.num_layers}, output_size={args.output_size}"
    )
    print(f"Missing keys: {len(missing_keys)}")
    for k in missing_keys:
        print(f"  - {k}")
    print(f"Unexpected keys: {len(unexpected_keys)}")
    for k in unexpected_keys:
        print(f"  - {k}")


if __name__ == "__main__":
    main()
