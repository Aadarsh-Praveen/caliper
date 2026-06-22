"""Unit tests for generate_demo_data helper functions (importable without side effects)."""
import sys
import os
from decimal import Decimal

# Import the generator without executing main()
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../scripts"))
from generate_demo_data import to_decimal


def test_to_decimal_plain_float():
    result = to_decimal(0.0398)
    assert isinstance(result, Decimal)
    assert result == Decimal("0.0398")


def test_to_decimal_precision_six_places():
    # Typical conversion-rate value — 6 decimal places should retain all meaningful digits
    result = to_decimal(0.039800)
    assert isinstance(result, Decimal)
    assert abs(float(result) - 0.0398) < 1e-9


def test_to_decimal_nested_dict():
    obj = {
        "experiment_id": "hero_cta_test",
        "variant": "control",
        "pre_experiment_activity": 0.291347,
    }
    result = to_decimal(obj)
    assert result["experiment_id"] == "hero_cta_test"  # strings untouched
    assert result["variant"] == "control"
    assert isinstance(result["pre_experiment_activity"], Decimal)
    assert result["pre_experiment_activity"] == Decimal("0.291347")


def test_to_decimal_nested_list():
    obj = [0.1, "text", 42, 0.299]
    result = to_decimal(obj)
    assert isinstance(result[0], Decimal)
    assert result[1] == "text"
    assert result[2] == 42           # ints pass through untouched
    assert isinstance(result[3], Decimal)


def test_to_decimal_deeply_nested():
    # Mirrors the actual DynamoDB item structure with properties containing a float
    item = {
        "PK": "EXP#hero_cta_test",
        "SK": "EVT#123456#user-abc#experiment_exposed",
        "properties": {
            "experiment_id": "hero_cta_test",
            "variant": "control",
            "pre_experiment_activity": 0.312456,
        },
        "context": {"device": "desktop", "country": "US"},
        "expires_at": 9999999999,
    }
    result = to_decimal(item)
    assert result["PK"] == "EXP#hero_cta_test"
    assert isinstance(result["properties"]["pre_experiment_activity"], Decimal)
    assert result["properties"]["experiment_id"] == "hero_cta_test"
    assert result["context"]["device"] == "desktop"
    assert result["expires_at"] == 9999999999  # int — unchanged


def test_to_decimal_bool_unchanged():
    # Python booleans are ints, but bool subclass — must not be coerced to Decimal
    assert to_decimal(True) is True
    assert to_decimal(False) is False


def test_to_decimal_none_unchanged():
    assert to_decimal(None) is None
