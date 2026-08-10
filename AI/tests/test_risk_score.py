import unittest

from AI.services.risk_score import (
    calibrated_risk_score,
    probability_to_logit,
    stable_sigmoid,
    threshold_normalized_risk_score,
)


class RiskScoreTests(unittest.TestCase):
    def test_component_threshold_is_always_fifty_points(self):
        for threshold in (0.2, 0.5, 0.85):
            self.assertAlmostEqual(
                threshold_normalized_risk_score(threshold, threshold),
                0.5,
            )

    def test_threshold_normalization_preserves_endpoints(self):
        self.assertEqual(threshold_normalized_risk_score(0.0, 0.3), 0.0)
        self.assertEqual(threshold_normalized_risk_score(1.0, 0.3), 1.0)

    def test_threshold_normalization_rejects_invalid_values(self):
        with self.assertRaises(ValueError):
            threshold_normalized_risk_score(1.1, 0.5)
        with self.assertRaises(ValueError):
            threshold_normalized_risk_score(0.5, 1.0)
        with self.assertRaises(ValueError):
            threshold_normalized_risk_score(0.5, 0.6, temperature=0.0)

    def test_small_human_scores_remain_visible_in_admin_scale(self):
        risk = threshold_normalized_risk_score(0.001, 0.6)

        self.assertGreater(risk * 100, 1.0)
        self.assertLess(risk, 0.5)

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
