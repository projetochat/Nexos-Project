from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "build-production.yml"


class ProductionWorkflowTest(unittest.TestCase):
    def test_workflow_pins_actions_and_keeps_release_available_for_promotion(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        for mutable in (
            "actions/checkout@v",
            "actions/setup-node@v",
            "oven-sh/setup-bun@v",
            "actions/upload-artifact@v",
            "actions/download-artifact@v",
        ):
            self.assertNotIn(mutable, workflow)
        self.assertIn("--build-arg VITE_APP_MODE=production", workflow)
        self.assertIn("retention-days: 14", workflow)

    def test_pull_requests_build_every_production_image_without_publishing(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("pr-images:", workflow)
        section = workflow.split("pr-images:", 1)[1].split("\n  build:", 1)[0]
        self.assertIn("github.event_name == 'pull_request'", section)
        self.assertIn("--target runtime", section)
        self.assertIn("--target migrate", section)
        self.assertIn("-f Dockerfile.frontend", section)
        self.assertNotIn("upload-artifact", section)
        self.assertNotIn("DEPLOY_", section)


if __name__ == "__main__":
    unittest.main()
