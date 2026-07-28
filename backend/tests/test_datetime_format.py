import unittest
from datetime import datetime, timezone

from services.datetime_format import format_seoul_datetime


class FormatSeoulDatetimeTests(unittest.TestCase):
    def test_naive_database_utc_is_converted_to_seoul(self):
        self.assertEqual(
            format_seoul_datetime(datetime(2026, 7, 28, 2, 15)),
            "2026-07-28 11:15",
        )

    def test_aware_utc_is_converted_to_seoul(self):
        self.assertEqual(
            format_seoul_datetime(datetime(2026, 7, 28, 2, 15, tzinfo=timezone.utc)),
            "2026-07-28 11:15",
        )

    def test_none_returns_placeholder(self):
        self.assertEqual(format_seoul_datetime(None), "-")


if __name__ == "__main__":
    unittest.main()
