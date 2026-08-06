import unittest

from AI.services.drag_classifier import MODEL_VERSION, MODEL_VERSION_MAX_LENGTH, classify


class DragClassifierTests(unittest.TestCase):
    def test_model_version_is_stable_database_identifier(self):
        self.assertEqual(MODEL_VERSION, "drag-cnn-v2-final")
        self.assertLessEqual(len(MODEL_VERSION), MODEL_VERSION_MAX_LENGTH)

    def test_valid_drag_returns_model_analysis(self):
        record = {
            "points": [
                {"x": 10.0, "y": 20.0, "t": 0.0},
                {"x": 20.0, "y": 24.0, "t": 50.0},
                {"x": 30.0, "y": 30.0, "t": 100.0},
            ],
            "device": {"pointerType": "mouse"},
            "task": {
                "taskType": "waypoint_drag",
                "waypointCount": 0,
                "waypoints": [],
                "startCenter": {"x": 10.0, "y": 20.0},
                "dropCenter": {"x": 30.0, "y": 30.0},
                "straightDist": 22.360679775,
            },
            "label": "human",
        }

        result = classify(record)

        self.assertIn(result["tier"], {"verified", "ambiguous", "blocked"})
        self.assertGreaterEqual(result["risk_score"], 0.0)
        self.assertLessEqual(result["risk_score"], 1.0)
        self.assertEqual(result["model_version"], MODEL_VERSION)

    def test_malformed_drag_fails_closed(self):
        result = classify({})

        self.assertEqual(result["tier"], "blocked")
        self.assertTrue(result["is_bot"])
        self.assertEqual(result["human_logit"], -100.0)


if __name__ == "__main__":
    unittest.main()
