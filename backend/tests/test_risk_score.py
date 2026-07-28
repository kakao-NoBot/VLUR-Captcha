import unittest

from services.risk_score import (
    calibrated_risk_score,
    probability_to_logit,
    stable_sigmoid,
)


class RiskScoreTests(unittest.TestCase):
    def test_threshold_is_always_fifty_points(self):
        threshold = 0.8629306554794312
        threshold_logit = probability_to_logit(threshold)

        self.assertAlmostEqual(
            calibrated_risk_score(threshold_logit, threshold),
            0.5,
        )

    def test_more_human_like_logit_has_lower_risk(self):
        threshold = 0.8629306554794312

        self.assertLess(
            calibrated_risk_score(30.0, threshold),
            calibrated_risk_score(10.0, threshold),
        )

    def test_recent_human_logits_are_spread_across_low_risk_range(self):
        threshold = 0.8629306554794312
        recent_logits = [25.2095, 15.9038, 32.0646, 37.6227, 34.3945, 40.8072]
        scores = [
            round(calibrated_risk_score(logit, threshold) * 100, 1)
            for logit in recent_logits
        ]

        self.assertEqual(scores, [8.8, 19.7, 4.6, 2.7, 3.7, 2.0])

    def test_stable_sigmoid_preserves_tiny_bot_probability(self):
        self.assertGreater(stable_sigmoid(-40.0), 0.0)
        self.assertLess(stable_sigmoid(-40.0), 1e-16)

    def test_invalid_temperature_is_rejected(self):
        with self.assertRaises(ValueError):
            calibrated_risk_score(1.0, 0.9, temperature=0)


if __name__ == "__main__":
    unittest.main()
