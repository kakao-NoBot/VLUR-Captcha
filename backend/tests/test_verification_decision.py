import unittest

from services.verification_decision import resolve_verification


class ResolveVerificationTests(unittest.TestCase):
    def test_correct_human_behavior_passes(self):
        outcome = resolve_verification(True, "verified")

        self.assertEqual(outcome["verification_status"], "passed")
        self.assertTrue(outcome["result"]["verified"])
        self.assertTrue(outcome["result"]["answerCorrect"])
        self.assertTrue(outcome["issue_token"])

    def test_wrong_answer_never_passes_but_keeps_human_behavior(self):
        outcome = resolve_verification(False, "verified")

        self.assertEqual(outcome["verification_status"], "failed")
        self.assertEqual(outcome["failure_reason"], "wrong_answer")
        self.assertFalse(outcome["is_bot"])
        self.assertFalse(outcome["result"]["verified"])
        self.assertEqual(outcome["result"]["behaviorTier"], "verified")

    def test_wrong_answer_keeps_blocked_behavior(self):
        outcome = resolve_verification(False, "blocked")

        self.assertTrue(outcome["is_bot"])
        self.assertTrue(outcome["result"]["blocked"])
        self.assertEqual(outcome["failure_reason"], "wrong_answer")

    def test_wrong_answer_does_not_trigger_ambiguous_fallback(self):
        outcome = resolve_verification(False, "ambiguous")

        self.assertIsNone(outcome["is_bot"])
        self.assertFalse(outcome["result"]["ambiguous"])
        self.assertEqual(outcome["result"]["behaviorTier"], "ambiguous")

    def test_correct_ambiguous_behavior_requests_recheck(self):
        outcome = resolve_verification(True, "ambiguous")

        self.assertEqual(outcome["verification_status"], "pending")
        self.assertTrue(outcome["result"]["ambiguous"])
        self.assertFalse(outcome["issue_token"])

    def test_correct_bot_behavior_is_blocked(self):
        outcome = resolve_verification(True, "blocked")

        self.assertEqual(outcome["verification_status"], "failed")
        self.assertTrue(outcome["result"]["blocked"])
        self.assertEqual(outcome["failure_reason"], "bot_blocked")

    def test_fast_response_forces_block_even_if_verified(self):
        outcome = resolve_verification(True, "verified", response_time_ms=150)

        self.assertEqual(outcome["verification_status"], "failed")
        self.assertTrue(outcome["is_bot"])
        self.assertTrue(outcome["result"]["blocked"])
        self.assertEqual(outcome["result"]["behaviorTier"], "blocked")
        self.assertEqual(outcome["failure_reason"], "too_fast")

    def test_fast_response_forces_block_even_if_ambiguous(self):
        outcome = resolve_verification(True, "ambiguous", response_time_ms=0)

        self.assertEqual(outcome["verification_status"], "failed")
        self.assertEqual(outcome["failure_reason"], "too_fast")

    def test_response_time_above_threshold_does_not_force_block(self):
        outcome = resolve_verification(True, "verified", response_time_ms=201)

        self.assertEqual(outcome["verification_status"], "passed")
        self.assertFalse(outcome["is_bot"])

    def test_response_time_none_is_ignored(self):
        outcome = resolve_verification(True, "verified", response_time_ms=None)

        self.assertEqual(outcome["verification_status"], "passed")

    def test_fast_response_does_not_override_wrong_answer_reason(self):
        outcome = resolve_verification(False, "verified", response_time_ms=100)

        self.assertEqual(outcome["failure_reason"], "wrong_answer")
        self.assertTrue(outcome["is_bot"])  # 속도로 강제 blocked돼서 is_bot은 True


if __name__ == "__main__":
    unittest.main()
