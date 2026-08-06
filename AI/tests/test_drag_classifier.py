import unittest

from AI.services.drag_classifier import (
    MODEL_INFO,
    MODEL_VERSION,
    MODEL_VERSION_MAX_LENGTH,
    classify,
)


class DragClassifierTests(unittest.TestCase):
    def test_model_version_is_stable_database_identifier(self):
        self.assertEqual(MODEL_VERSION, "cnn-bilstm-ensemble-v1")
        self.assertLessEqual(len(MODEL_VERSION), MODEL_VERSION_MAX_LENGTH)

    def test_checkpoint_uses_ensemble_contract(self):
        self.assertEqual(MODEL_INFO["method"], "or_rule")
        self.assertEqual(MODEL_INFO["cnn_scalar_dim"], 19)
        self.assertEqual(MODEL_INFO["bilstm_sequence_dim"], 10)
        self.assertEqual(MODEL_INFO["bilstm_condition_dim"], 22)
        self.assertEqual(len(MODEL_INFO["components"]), 3)
        self.assertEqual(len(MODEL_INFO["cnn_human_thresholds"]), 3)

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
        self.assertEqual(result["ensemble_method"], "or_rule")
        self.assertEqual(
            set(result["component_scores"]),
            {"cnn", "bilstm", "jitter_guard"},
        )
        self.assertAlmostEqual(
            result["risk_score"],
            max(result["component_scores"].values()),
            places=6,
        )

    def test_malformed_drag_fails_closed(self):
        result = classify({})

        self.assertEqual(result["tier"], "blocked")
        self.assertTrue(result["is_bot"])
        self.assertEqual(result["human_logit"], -100.0)


if __name__ == "__main__":
    unittest.main()
