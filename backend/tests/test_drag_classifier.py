import unittest
from unittest.mock import patch

import httpx

from services.drag_classifier import build_record, classify


class DragClassifierClientTests(unittest.TestCase):
    def test_build_record_uses_expected_ai_schema(self):
        record = build_record(
            [{"x": 10, "y": 20, "t": 0}, {"x": 30, "y": 40, "t": 100}],
            "touch",
            [{"x": 20, "y": 30}],
            {"x": 10, "y": 20},
            {"x": 30, "y": 40},
        )

        self.assertEqual(record["device"]["pointerType"], "touch")
        self.assertEqual(record["task"]["waypointCount"], 1)
        self.assertEqual(record["label"], "human")

    @patch("services.drag_classifier._client.post")
    def test_classify_returns_valid_ai_response(self, post):
        post.return_value = httpx.Response(
            200,
            request=httpx.Request("POST", "http://ai:5000/v1/classify"),
            json={"tier": "verified", "risk_score": 0.2, "model_version": "drag-v2"},
        )

        result = classify({"points": []})

        self.assertEqual(result["tier"], "verified")
        self.assertEqual(result["model_version"], "drag-v2")

    @patch("services.drag_classifier._client.post")
    def test_classify_fails_closed_when_ai_is_unavailable(self, post):
        request = httpx.Request("POST", "http://ai:5000/v1/classify")
        post.side_effect = httpx.ConnectError("connection failed", request=request)

        result = classify({"points": []})

        self.assertEqual(result["tier"], "blocked")
        self.assertTrue(result["is_bot"])
        self.assertEqual(result["risk_score"], 1.0)


if __name__ == "__main__":
    unittest.main()
