from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "build-homologation.yml"


class HomologationWorkflowTest(unittest.TestCase):
    def test_workflow_has_manual_modes_and_environment_isolation(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", text)
        self.assertIn("options: [build, plan, deploy]", text)
        self.assertGreaterEqual(text.count("environment: homologation"), 2)
        self.assertIn("trixus-hml-release/backend:$GITHUB_SHA", text)
        self.assertIn("trixus-hml-release/migrate:$GITHUB_SHA", text)
        self.assertIn("trixus-hml-release/frontend:$GITHUB_SHA", text)
        self.assertIn("--build-arg VITE_APP_MODE=homologation", text)
        self.assertIn("retention-days: 14", text)
        self.assertIn("bash scripts/homologation/transfer.sh", text)
        self.assertNotIn("scripts/production/transfer.sh", text)
        self.assertNotIn("trixus-release/backend:$GITHUB_SHA", text)
        for mutable in ("actions/checkout@v", "actions/setup-node@v", "oven-sh/setup-bun@v",
                        "actions/upload-artifact@v", "actions/download-artifact@v"):
            self.assertNotIn(mutable, text)

    def test_workflow_pins_canonical_hml_frontend_urls(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("VITE_TRIXUS_API_URL: https://api-hom.trixus.com.br/api", text)
        self.assertIn("VITE_TRIXUS_PLATFORM_APP_URL: https://hom.trixus.com.br", text)
        self.assertNotIn("https://app.trixus.com.br", text)


if __name__ == "__main__":
    unittest.main()
