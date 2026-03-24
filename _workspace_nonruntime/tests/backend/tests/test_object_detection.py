from types import SimpleNamespace

import numpy as np

from src.app.detection import object_detection


def test_object_detector_uses_phone_friendly_threshold(monkeypatch):
    calls: dict[str, float | int] = {}

    class FakeModel:
        def predict(self, _frame, *, verbose, conf, imgsz):
            calls["verbose"] = verbose
            calls["conf"] = conf
            calls["imgsz"] = imgsz
            return [
                SimpleNamespace(
                    boxes=SimpleNamespace(cls=[0, 1], conf=[0.28, 0.28]),
                    names={0: "cell phone", 1: "book"},
                )
            ]

    monkeypatch.setattr(object_detection, "_model", FakeModel())
    monkeypatch.setattr(object_detection, "_model_load_failed", False)

    detector = object_detection.ObjectDetector(confidence_threshold=0.5)
    alerts = detector.process_ndarray(np.zeros((20, 20, 3), dtype=np.uint8))

    assert calls["verbose"] is False
    assert calls["conf"] == 0.25
    assert calls["imgsz"] == 960
    assert len(alerts) == 1
    assert alerts[0]["detail"] == "Forbidden object detected: cell phone"
