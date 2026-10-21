import os
import subprocess
import sys
import unittest
from pathlib import Path


GATEWAY = Path(__file__).resolve().parent / "gateway.py"


class HomologationGatewayTest(unittest.TestCase):
    def run_gateway(self, command):
        env = os.environ.copy()
        env["SSH_ORIGINAL_COMMAND"] = command
        return subprocess.run([sys.executable, str(GATEWAY)], env=env,
                              capture_output=True, text=True, timeout=10)

    def test_check_is_read_only_and_unknown_commands_are_rejected(self):
        self.assertEqual(self.run_gateway("check").returncode, 0)
        for value in ("deploy", "deploy a", "sh", "plan " + "a" * 40 + " " + "b" * 64 + " 1;id"):
            with self.subTest(value=value):
                self.assertNotEqual(self.run_gateway(value).returncode, 0)


if __name__ == "__main__":
    unittest.main()
