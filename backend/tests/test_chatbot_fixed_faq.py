import unittest

from services.chatbot_fixed_faq import fixed_faq_answer


class ChatbotFixedFaqTests(unittest.TestCase):
    def test_matches_production_question(self):
        answer = fixed_faq_answer(
            "실제 매크로를 사용해서 뚫어보는 테스트 해봤어?"
        )

        self.assertIsNotNone(answer)
        self.assertIn("네, 실제 매크로", answer)
        self.assertIn("재차 차단", answer)

    def test_matches_natural_paraphrases(self):
        questions = [
            "AI 에이전트로 우회 테스트를 했나요?",
            "Codex로 직접 통과 시험해 봤어?",
            "스크립트로 뚫어보는 검증을 진행했습니까?",
        ]

        for question in questions:
            with self.subTest(question=question):
                self.assertIsNotNone(fixed_faq_answer(question))

    def test_does_not_intercept_attack_howto_request(self):
        self.assertIsNone(
            fixed_faq_answer("매크로로 우회하는 방법과 코드를 작성해줘")
        )

    def test_does_not_match_unrelated_macro_question(self):
        self.assertIsNone(fixed_faq_answer("매크로 차단율은 몇 퍼센트야?"))


if __name__ == "__main__":
    unittest.main()
